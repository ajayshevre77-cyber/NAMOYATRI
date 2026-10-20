import http from 'http';
import app from '../server';
import {
  classifyOsmTags,
  parseOverpassElements,
  resetGeoStateForTests,
  searchPlaces,
  setGeoFetchForTests,
  GeoServiceError,
  MAX_PLACES_PER_CATEGORY,
} from '../server/geo';
import {
  describeLocationProblem,
  formatDistance,
  haversineKm,
  locationProblemFromCode,
  roundPoint,
} from '../src/lib/geo';

process.env.NODE_ENV = 'test';

// Run with NODE_ENV=test set in the shell (see CLAUDE.md): the import above
// starts the server before the line above runs.
//
// No real OpenStreetMap service is called: every upstream request goes to the
// stub below. /api/geo/* has a limiter of 30 requests per minute per IP and
// this suite makes 22; keep it under 30 when adding scenarios. Scenarios
// 18–23 call searchPlaces directly, so they do not count.

process.env.OVERPASS_API_URLS = 'https://overpass-primary.test/api/interpreter,https://overpass-fallback.test/api/interpreter';
process.env.NOMINATIM_API_URL = 'https://nominatim.test';
const PRIMARY = 'https://overpass-primary.test/api/interpreter';
const FALLBACK = 'https://overpass-fallback.test/api/interpreter';

interface UpstreamCall {
  url: string;
  init: RequestInit;
  at: number;
}

let calls: UpstreamCall[] = [];
let respond: (url: string, init: RequestInit) => Response | Promise<Response> = () => {
  throw new Error('No upstream response configured');
};

setGeoFetchForTests(async (input, init) => {
  const url = String(input);
  calls.push({ url, init: init ?? {}, at: Date.now() });
  return respond(url, init ?? {});
});

/** Fresh caches, gates and back-off, and no recorded calls. */
function resetUpstream(handler: typeof respond) {
  resetGeoStateForTests();
  calls = [];
  respond = handler;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const overpassQueryOf = (call: UpstreamCall) => new URLSearchParams(String(call.init.body)).get('data') ?? '';
const searchQueryOf = (call: UpstreamCall) => new URL(call.url).searchParams.get('q');
const headerOf = (call: UpstreamCall, name: string) => (call.init.headers as Record<string, string>)?.[name];

// A precise point by Ramkund. It rounds to 20.006, 73.792.
const PRECISE = { lat: 20.006349, lon: 73.791549 };

const OVERPASS_BODY = {
  osm3s: { timestamp_osm_base: '2026-10-13T10:00:00Z' },
  elements: [
    {
      type: 'node',
      id: 1,
      lat: 20.0064,
      lon: 73.7927,
      tags: { amenity: 'place_of_worship', religion: 'hindu', name: 'Test Mandir', 'name:hi': 'टेस्ट मंदिर', opening_hours: 'Mo-Su 05:00-21:00' },
    },
    { type: 'way', id: 2, center: { lat: 20.01, lon: 73.795 }, tags: { amenity: 'parking' } },
    { type: 'node', id: 3, lat: 20.007, lon: 73.792, tags: { amenity: 'toilets' } },
    { type: 'node', id: 4, tags: { amenity: 'pharmacy', name: 'No coordinates' } },
    { type: 'node', id: 1, lat: 20.0064, lon: 73.7927, tags: { amenity: 'place_of_worship', name: 'Duplicate' } },
    { type: 'node', id: 5, lat: 20.0065, lon: 73.7915, tags: { shop: 'clothes', name: 'Not a category we list' } },
    { type: 'way', id: 6, center: { lat: 20.0066, lon: 73.7916 }, tags: { amenity: 'parking', access: 'private' } },
  ],
};

async function runGeoTestSuite() {
  console.log('=================================================================');
  console.log('NAMO YATRI MAP & NEARBY PLACES TEST SUITE (23 SCENARIOS)');
  console.log('=================================================================\n');

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let passed = 0;
  let failed = 0;

  async function assertTest(
    scenarioNum: number,
    name: string,
    fn: () => Promise<{ success: boolean; details?: string }>,
  ) {
    try {
      const res = await fn();
      if (res.success) {
        console.log(`[PASS] Test ${scenarioNum}: ${name}`);
        if (res.details) console.log(`       -> ${res.details}`);
        passed++;
      } else {
        console.error(`[FAIL] Test ${scenarioNum}: ${name}`);
        if (res.details) console.error(`       -> ${res.details}`);
        failed++;
      }
    } catch (err: any) {
      console.error(`[ERROR] Test ${scenarioNum}: ${name} threw error:`, err.message);
      failed++;
    }
  }

  async function getNearby(params: Record<string, string | number>) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const res = await fetch(`${baseUrl}/api/geo/nearby?${qs}`);
    return { status: res.status, headers: res.headers, body: (await res.json()) as any };
  }

  async function getSearch(params: Record<string, string>) {
    const res = await fetch(`${baseUrl}/api/geo/search?${new URLSearchParams(params)}`);
    return { status: res.status, body: (await res.json()) as any };
  }

  try {
    // -------------------------------------------------------------
    // Shared helpers (no server)
    // -------------------------------------------------------------
    await assertTest(1, 'Distance, rounding and distance labels are correct', async () => {
      const oneDegree = haversineKm({ lat: 20, lon: 73.79 }, { lat: 21, lon: 73.79 });
      const rounded = roundPoint(PRECISE);
      const labels = [formatDistance(0.084), formatDistance(0.95), formatDistance(1.23), formatDistance(14.4)];
      const ok =
        oneDegree > 111.1 && oneDegree < 111.3 &&
        rounded.lat === 20.006 && rounded.lon === 73.792 &&
        labels.join('|') === '80 m|950 m|1.2 km|14 km';
      return { success: ok, details: `1° = ${oneDegree.toFixed(2)} km, rounded ${rounded.lat},${rounded.lon}, labels ${labels.join(' / ')}` };
    });

    await assertTest(2, 'OSM tags map to the right category; private parking and unknown tags are dropped', async () => {
      const temple = classifyOsmTags({ amenity: 'place_of_worship', religion: 'hindu' });
      const templeAttraction = classifyOsmTags({ amenity: 'place_of_worship', tourism: 'attraction' });
      const food = classifyOsmTags({ amenity: 'restaurant' });
      const privateParking = classifyOsmTags({ amenity: 'parking', access: 'private' });
      const unknown = classifyOsmTags({ shop: 'clothes' });
      const ok =
        temple?.category === 'worship' && temple.kind === 'Hindu place of worship' &&
        templeAttraction?.category === 'worship' &&
        food?.category === 'food' &&
        privateParking === null && unknown === null;
      return { success: ok, details: `temple=${temple?.kind}, temple+attraction=${templeAttraction?.category}, food=${food?.category}` };
    });

    await assertTest(3, 'Overpass reply: nearest first, no duplicates or coordinate-less items, raw opening hours kept', async () => {
      const { places, truncated } = parseOverpassElements(OVERPASS_BODY, { lat: 20.006, lon: 73.792 });
      const ids = places.map(p => p.id).join(',');
      const temple = places[0];
      const ok =
        ids === 'node/1,node/3,way/2' &&
        !truncated &&
        temple.name === 'Test Mandir' &&
        temple.localNames.hi === 'टेस्ट मंदिर' &&
        temple.openingHours === 'Mo-Su 05:00-21:00' &&
        places[1].name === null &&
        places.every(p => p.sourceType === 'COMMUNITY' && p.osmUrl === `https://www.openstreetmap.org/${p.id}`);
      return { success: ok, details: `ids: ${ids}` };
    });

    await assertTest(4, `Each category is capped at the nearest ${MAX_PLACES_PER_CATEGORY}`, async () => {
      const elements = Array.from({ length: MAX_PLACES_PER_CATEGORY + 5 }, (_, i) => ({
        type: 'node',
        id: 100 + i,
        lat: 20.006 + i * 0.0001,
        lon: 73.792,
        tags: { amenity: 'toilets' },
      }));
      const { places, truncated } = parseOverpassElements({ elements }, { lat: 20.006, lon: 73.792 });
      const keptNearest = places[places.length - 1]?.id === `node/${100 + MAX_PLACES_PER_CATEGORY - 1}`;
      return {
        success: places.length === MAX_PLACES_PER_CATEGORY && truncated && keptNearest,
        details: `kept ${places.length}, truncated=${truncated}`,
      };
    });

    await assertTest(5, 'Location errors: denied is final, unavailable and timeout can be retried', async () => {
      const denied = describeLocationProblem(locationProblemFromCode(1));
      const unavailable = describeLocationProblem(locationProblemFromCode(2));
      const timeout = describeLocationProblem(locationProblemFromCode(3));
      const insecure = describeLocationProblem('insecure');
      const ok =
        !denied.canRetry && /permission is off/i.test(denied.message) &&
        unavailable.canRetry && timeout.canRetry && /too long/i.test(timeout.message) &&
        !insecure.canRetry && /https/i.test(insecure.message);
      return { success: ok, details: `denied retry=${denied.canRetry}, unavailable retry=${unavailable.canRetry}, timeout retry=${timeout.canRetry}` };
    });

    // -------------------------------------------------------------
    // GET /api/geo/nearby
    // -------------------------------------------------------------
    await assertTest(6, 'Nearby: bad coordinates, a point outside the area and an unknown radius are rejected without an upstream call', async () => {
      resetUpstream(() => json(OVERPASS_BODY));
      const missing = await getNearby({ lon: 73.79 });
      const mumbai = await getNearby({ lat: 19.076, lon: 72.8777 });
      const radius = await getNearby({ lat: 20.006, lon: 73.792, radius: 3000 });
      const ok =
        missing.status === 400 && missing.body.code === 'INVALID_COORDINATES' &&
        mumbai.status === 400 && mumbai.body.code === 'OUTSIDE_SERVICE_AREA' &&
        radius.status === 400 && radius.body.code === 'INVALID_RADIUS' &&
        calls.length === 0;
      return {
        success: ok,
        details: `${missing.status} ${missing.body.code} / ${mumbai.status} ${mumbai.body.code} / ${radius.status} ${radius.body.code}, upstream calls ${calls.length}`,
      };
    });

    await assertTest(7, 'Nearby: live places are labelled as OpenStreetMap community data; only a rounded point goes upstream', async () => {
      resetUpstream(() => json(OVERPASS_BODY));
      const { status, body } = await getNearby({ lat: PRECISE.lat, lon: PRECISE.lon, radius: 2000 });
      const query = calls[0] ? overpassQueryOf(calls[0]) : '';
      const ua = calls[0] ? headerOf(calls[0], 'User-Agent') ?? '' : '';
      const ok =
        status === 200 &&
        body.source === 'OPENSTREETMAP_OVERPASS' &&
        /OpenStreetMap/.test(body.attribution) &&
        body.dataTimestamp === '2026-10-13T10:00:00Z' &&
        body.places.length === 3 &&
        body.places.every((p: any) => p.sourceType === 'COMMUNITY') &&
        calls.length === 1 && calls[0].url === PRIMARY && calls[0].init.method === 'POST' &&
        query.includes('around:2000,20.006,73.792') && !query.includes('20.006349') &&
        ua.startsWith('NamoYatri/');
      return { success: ok, details: `Status ${status}, ${body.places?.length} places, UA "${ua}", query has rounded point: ${query.includes('20.006,73.792')}` };
    });

    await assertTest(8, 'Nearby: a repeat lookup from the same ~100 m cell is served from cache', async () => {
      resetUpstream(() => json(OVERPASS_BODY));
      const first = await getNearby({ lat: PRECISE.lat, lon: PRECISE.lon });
      const second = await getNearby({ lat: 20.00621, lon: 73.79171 });
      return {
        success: first.status === 200 && second.status === 200 && calls.length === 1,
        details: `upstream calls: ${calls.length}`,
      };
    });

    await assertTest(9, 'Nearby: an overloaded main server falls back, and is skipped while it backs off', async () => {
      resetUpstream(url => (url === PRIMARY ? new Response('<html>too busy</html>', { status: 504 }) : json(OVERPASS_BODY)));
      const first = await getNearby({ lat: 20.006, lon: 73.792 });
      const firstUrls = calls.map(c => c.url);
      calls = [];
      const second = await getNearby({ lat: 19.932, lon: 73.531 });
      const secondUrls = calls.map(c => c.url);
      const ok =
        first.status === 200 && firstUrls.join(',') === `${PRIMARY},${FALLBACK}` &&
        second.status === 200 && secondUrls.join(',') === FALLBACK;
      return { success: ok, details: `first: ${firstUrls.length} calls, second: ${secondUrls.map(u => (u === PRIMARY ? 'primary' : 'fallback')).join(',')}` };
    });

    await assertTest(10, 'Nearby: when every server answers 429, reply 503 with Retry-After and stop calling them for 30 s', async () => {
      resetUpstream(() => new Response('rate limited', { status: 429 }));
      const first = await getNearby({ lat: 20.006, lon: 73.792 });
      const firstCalls = calls.length;
      calls = [];
      const second = await getNearby({ lat: 19.932, lon: 73.531 });
      const ok =
        first.status === 503 && first.body.code === 'GEO_UPSTREAM_BUSY' &&
        first.body.retryAfterSeconds === 30 && first.headers.get('retry-after') === '30' &&
        firstCalls === 2 &&
        second.status === 503 && second.body.code === 'GEO_UPSTREAM_BUSY' && calls.length === 0;
      return { success: ok, details: `${first.status} ${first.body.code} retry ${first.body.retryAfterSeconds}s after ${firstCalls} calls; then ${second.status} with ${calls.length} calls` };
    });

    await assertTest(11, 'Nearby: partial data from an Overpass "runtime error" is never shown', async () => {
      resetUpstream(url =>
        url === PRIMARY
          ? json({ ...OVERPASS_BODY, remark: 'runtime error: Query timed out in "query" at line 1 after 16 seconds.' })
          : json({ elements: [{ type: 'node', id: 9, lat: 20.0061, lon: 73.7921, tags: { amenity: 'drinking_water' } }] }),
      );
      const { status, body } = await getNearby({ lat: 20.006, lon: 73.792 });
      const ids = (body.places ?? []).map((p: any) => p.id).join(',');
      return { success: status === 200 && ids === 'node/9' && calls.length === 2, details: `Status ${status}, places: ${ids}` };
    });

    await assertTest(12, 'Nearby: a non-JSON reply or a timeout gives a clear error code', async () => {
      resetUpstream(() => new Response('<html>not json</html>', { status: 200 }));
      const html = await getNearby({ lat: 20.006, lon: 73.792 });
      resetUpstream(() => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      });
      const timeout = await getNearby({ lat: 20.006, lon: 73.792 });
      const ok =
        html.status === 502 && html.body.code === 'GEO_UPSTREAM_BAD_RESPONSE' &&
        timeout.status === 504 && timeout.body.code === 'GEO_UPSTREAM_TIMEOUT';
      return { success: ok, details: `${html.status} ${html.body.code} / ${timeout.status} ${timeout.body.code}` };
    });

    // -------------------------------------------------------------
    // GET /api/geo/search
    // -------------------------------------------------------------
    await assertTest(13, 'Search: too short, too long and unknown-language queries are rejected', async () => {
      resetUpstream(() => json([]));
      const short = await getSearch({ q: 'a' });
      const long = await getSearch({ q: 'x'.repeat(101) });
      const lang = await getSearch({ q: 'Ramkund', lang: 'fr' });
      const ok =
        short.status === 400 && short.body.code === 'INVALID_SEARCH_QUERY' &&
        long.status === 400 && long.body.code === 'INVALID_SEARCH_QUERY' &&
        lang.status === 400 && lang.body.code === 'INVALID_LANGUAGE' &&
        calls.length === 0;
      return { success: ok, details: `${short.body.code} / ${long.body.code} / ${lang.body.code}` };
    });

    await assertTest(14, 'Search: bounded to the service area, results outside it dropped, labelled OpenStreetMap', async () => {
      resetUpstream(() =>
        json([
          { place_id: 1, osm_type: 'node', osm_id: 11, lat: '20.0076', lon: '73.7920', name: 'Ramkund', display_name: 'Ramkund, Panchavati, Nashik', type: 'place_of_worship' },
          { place_id: 2, osm_type: 'way', osm_id: 22, lat: '19.0760', lon: '72.8777', name: 'Somewhere in Mumbai', display_name: 'Mumbai', type: 'city' },
          { place_id: 3, osm_type: 'node', osm_id: 33, lat: 'not a number', lon: '73.79', name: 'Broken' },
        ]),
      );
      const { status, body } = await getSearch({ q: 'Ramkund', lang: 'hi' });
      const url = new URL(calls[0]?.url ?? 'https://invalid.test');
      const ok =
        status === 200 &&
        body.source === 'OPENSTREETMAP_NOMINATIM' &&
        body.results.length === 1 && body.results[0].name === 'Ramkund' && body.results[0].kind === 'Place of worship' &&
        url.origin === 'https://nominatim.test' && url.pathname === '/search' &&
        url.searchParams.get('bounded') === '1' && !!url.searchParams.get('viewbox') &&
        url.searchParams.get('format') === 'jsonv2' && url.searchParams.get('accept-language') === 'hi' &&
        (headerOf(calls[0], 'User-Agent') ?? '').startsWith('NamoYatri/');
      return { success: ok, details: `Status ${status}, results: ${body.results?.map((r: any) => r.name).join(', ')}` };
    });

    await assertTest(15, 'Search: the same query with different case and spacing is answered from cache', async () => {
      resetUpstream(() => json([]));
      await getSearch({ q: 'Kalaram Mandir' });
      await getSearch({ q: '  kalaram   MANDIR ' });
      return { success: calls.length === 1, details: `upstream calls: ${calls.length}` };
    });

    await assertTest(16, 'Search: Nominatim is called at most once per second', async () => {
      resetUpstream(() => json([]));
      await Promise.all([getSearch({ q: 'Tapovan' }), getSearch({ q: 'Panchavati' })]);
      const gap = calls.length === 2 ? Math.abs(calls[1].at - calls[0].at) : -1;
      return { success: gap >= 1000, details: `gap between upstream calls: ${gap} ms` };
    });

    // -------------------------------------------------------------
    // Search: one alternative spelling when nothing is found
    // -------------------------------------------------------------
    const KALARAM = {
      place_id: 7, osm_type: 'node', osm_id: 77, lat: '20.0089', lon: '73.7942',
      name: 'Kalaram Mandir', display_name: 'Kalaram Mandir, Panchavati, Nashik', type: 'place_of_worship',
    };
    /** Only "kalaram mandir" finds anything, as on the live service (2026-10-20). */
    const onlyKalaramMandir = (url: string) => json(searchQueryOf({ url, init: {}, at: 0 }) === 'kalaram mandir' ? [KALARAM] : []);
    const codeOf = async (run: () => Promise<unknown>) => {
      try {
        await run();
        return 'NO_ERROR';
      } catch (err) {
        return err instanceof GeoServiceError ? err.code : `UNEXPECTED ${(err as Error)?.message}`;
      }
    };

    await assertTest(17, 'Search: when the words typed find nothing, one alternative spelling is tried, queued after the first and labelled', async () => {
      resetUpstream(onlyKalaramMandir);
      const { status, body } = await getSearch({ q: 'Kalaram Temple' });
      const queries = calls.map(searchQueryOf);
      const gap = calls.length === 2 ? calls[1].at - calls[0].at : -1;
      const second = new URL(calls[1]?.url ?? 'https://invalid.test');
      const ok =
        status === 200 &&
        body.results.length === 1 && body.results[0].name === 'Kalaram Mandir' &&
        body.alternativeQuery === 'Kalaram Mandir' &&
        queries.join('|') === 'kalaram temple|kalaram mandir' &&
        gap >= 1000 &&
        second.searchParams.get('bounded') === '1' && second.searchParams.get('accept-language') === 'en';
      return { success: ok, details: `Status ${status}, upstream q: ${queries.join(' then ')}, gap ${gap} ms, alternativeQuery "${body.alternativeQuery}"` };
    });

    await assertTest(18, 'Search: both spellings are cached afterwards, so neither calls Nominatim again', async () => {
      calls = [];
      const again = await searchPlaces('kalaram temple', 'en');
      const direct = await searchPlaces('Kalaram Mandir', 'en');
      const ok =
        calls.length === 0 &&
        again.alternativeQuery === 'Kalaram Mandir' && again.results.length === 1 &&
        direct.alternativeQuery === null && direct.results.length === 1;
      return { success: ok, details: `upstream calls: ${calls.length}; repeat says "${again.alternativeQuery}", the OSM spelling says ${direct.alternativeQuery}` };
    });

    await assertTest(19, 'Search: no second call when the first finds something, for a query with no known spelling, or a place OpenStreetMap does not have', async () => {
      // "Ramkund" has a known alternative ("Ram Kund"), so only the results stop a second call.
      resetUpstream(() => json([{ ...KALARAM, osm_id: 78, name: 'Ramkund', display_name: 'Ramkund, Panchavati, Nashik', type: 'locality' }]));
      const found = await searchPlaces('Ramkund', 'en');
      const foundCalls = calls.length;
      resetUpstream(() => json([]));
      const unknown = await searchPlaces('pizza corner', 'en');
      const unknownCalls = calls.length;
      resetUpstream(() => json([]));
      const sadhuGram = await searchPlaces('Sadhu Gram', 'en');
      const ok =
        foundCalls === 1 && found.results.length === 1 && found.alternativeQuery === null &&
        unknownCalls === 1 && unknown.results.length === 0 && unknown.alternativeQuery === null &&
        calls.length === 1 && sadhuGram.results.length === 0 && sadhuGram.alternativeQuery === null;
      return { success: ok, details: `"Ramkund" (found): ${foundCalls} call, "pizza corner": ${unknownCalls} call, "Sadhu Gram": ${calls.length} call` };
    });

    await assertTest(20, 'Search: when the alternative finds nothing too, the answer is empty after exactly two calls, and cached', async () => {
      resetUpstream(() => json([]));
      const first = await searchPlaces('Kushavarta', 'en');
      const queries = calls.map(searchQueryOf);
      calls = [];
      await searchPlaces('kushavarta', 'en');
      const ok =
        queries.join('|') === 'kushavarta|kushawart' &&
        first.results.length === 0 && first.alternativeQuery === null &&
        calls.length === 0;
      return { success: ok, details: `upstream q: ${queries.join(' then ')}; repeat made ${calls.length} calls` };
    });

    await assertTest(21, 'Search: no alternative is tried after a failure (busy, rate limit, overload, timeout, server error, bad reply)', async () => {
      const failures: [string, () => Response][] = [
        ['GEO_UPSTREAM_BUSY', () => new Response('busy', { status: 503 })],
        ['GEO_UPSTREAM_BUSY', () => new Response('slow down', { status: 429 })],
        ['GEO_UPSTREAM_BUSY', () => new Response('gateway timeout', { status: 504 })],
        ['GEO_UPSTREAM_TIMEOUT', () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }],
        ['GEO_UPSTREAM_FAILED', () => new Response('oops', { status: 500 })],
        ['GEO_UPSTREAM_BAD_RESPONSE', () => new Response('<html>not json</html>', { status: 200 })],
      ];
      const wrong: string[] = [];
      for (const [expected, reply] of failures) {
        resetUpstream(reply);
        const code = await codeOf(() => searchPlaces('Kalaram Temple', 'en'));
        if (code !== expected || calls.length !== 1) wrong.push(`${expected}: got ${code} after ${calls.length} calls`);
      }
      return { success: wrong.length === 0, details: wrong.length === 0 ? `${failures.length} failures, each after exactly 1 call` : wrong.join('; ') };
    });

    await assertTest(22, 'Search: if the alternative itself is refused, the answer is empty and not cached, and the 30 s back-off holds', async () => {
      resetUpstream(url => (searchQueryOf({ url, init: {}, at: 0 }) === 'kalaram mandir' ? new Response('slow down', { status: 429 }) : json([])));
      const first = await searchPlaces('Kalaram Temple', 'en');
      const firstCalls = calls.length;
      calls = [];
      const code = await codeOf(() => searchPlaces('Kalaram Temple', 'en'));
      const ok =
        first.results.length === 0 && first.alternativeQuery === null && firstCalls === 2 &&
        code === 'GEO_UPSTREAM_BUSY' && calls.length === 0;
      return { success: ok, details: `first: empty after ${firstCalls} calls; repeat: ${code} with ${calls.length} calls (not cached, still backing off)` };
    });

    await assertTest(23, 'Search: two searches that are each other’s alternative both finish, one Nominatim call at a time', async () => {
      resetUpstream(() => json([]));
      const both = Promise.all([searchPlaces('Sundarnarayan Temple', 'en'), searchPlaces('Sundarnarayan Mandir', 'en')]);
      const timeout = new Promise<'TIMED_OUT'>(resolve => setTimeout(() => resolve('TIMED_OUT'), 15_000));
      const outcome = await Promise.race([both, timeout]);
      const times = calls.map(c => c.at).sort((a, b) => a - b);
      const minGap = times.length > 1 ? Math.min(...times.slice(1).map((t, i) => t - times[i])) : -1;
      const ok = outcome !== 'TIMED_OUT' && calls.length <= 4 && minGap >= 1000;
      return { success: ok, details: `${outcome === 'TIMED_OUT' ? 'did not finish' : 'both finished'}, ${calls.length} calls, smallest gap ${minGap} ms` };
    });
  } finally {
    server.close();
  }

  console.log('\n=================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log('=================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runGeoTestSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
