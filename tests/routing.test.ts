import http from 'http';
import app from '../server';
import { GeoServiceError } from '../server/geo';
import {
  getRoutingStatus,
  parseOpenRouteServiceRoute,
  planRoute,
  resetRoutingStateForTests,
  setRoutingFetchForTests,
} from '../server/routing';
import { GeoPoint } from '../src/lib/geo';
import {
  MAX_ROUTE_STOPS,
  OPENROUTESERVICE_ATTRIBUTION,
  formatDuration,
  geoJsonLineToLatLngs,
  roundRouteStop,
  routeKey,
} from '../src/lib/routing';

process.env.NODE_ENV = 'test';

// Run with NODE_ENV=test set in the shell (see CLAUDE.md): the import above
// starts the server before the line above runs.
//
// No real routing provider is called: every upstream request goes to the stub
// below, and the key is a fake. /api/geo/route allows 20 requests a minute per
// IP; scenarios 5-13 make 18 through postRoute() and scenario 16 then checks
// that the 21st is refused. Keep that budget in step when adding scenarios.

const FAKE_KEY = 'test-ors-key-0000-not-a-real-key';
const SELF_HOSTED = 'https://ors.test/ors/v2';
const HOSTED = 'https://api.heigit.org/openrouteservice/v2';

/** Sets (or clears) the routing env vars. Also clears anything dotenv loaded. */
function configure(key: string | null, url: string | null) {
  if (key === null) delete process.env.OPENROUTESERVICE_API_KEY;
  else process.env.OPENROUTESERVICE_API_KEY = key;
  if (url === null) delete process.env.OPENROUTESERVICE_API_URL;
  else process.env.OPENROUTESERVICE_API_URL = url;
}
configure(null, null);

interface UpstreamCall {
  url: string;
  init: RequestInit;
  at: number;
}

let calls: UpstreamCall[] = [];
let respond: (url: string, init: RequestInit) => Response | Promise<Response> = () => {
  throw new Error('No upstream response configured');
};

setRoutingFetchForTests(async (input, init) => {
  const url = String(input);
  calls.push({ url, init: init ?? {}, at: Date.now() });
  return respond(url, init ?? {});
});

/** Fresh cache, gate and back-off, and no recorded calls. */
function resetUpstream(handler: typeof respond) {
  resetRoutingStateForTests();
  calls = [];
  respond = handler;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const headerOf = (call: UpstreamCall, name: string) => (call.init.headers as Record<string, string>)?.[name];
const upstreamBody = (call: UpstreamCall) => JSON.parse(String(call.init.body));

// Real places, given with more precision than leaves the browser.
const RAMKUND = { lat: 20.00763, lon: 73.79204 };      // rounds to 20.0076, 73.792
const KALARAM = { lat: 20.00698, lon: 73.79531 };      // rounds to 20.007, 73.7953
const NASHIK_ROAD = { lat: 19.94787, lon: 73.84254 };
const TRIMBAK = { lat: 19.93261, lon: 73.53071 };
const MUMBAI = { lat: 19.076, lon: 72.8777 };

/**
 * A reply shaped like OpenRouteService's GeoJSON directions: one LineString
 * through every stop (plus a bend between each pair), one segment per leg.
 */
function orsReply(
  stops: GeoPoint[],
  legs = stops.slice(1).map((_, i) => ({ distance: 1000 * (i + 1) + 0.4, duration: 700 * (i + 1) + 0.3 })),
) {
  const coordinates: number[][] = [];
  const wayPoints: number[] = [];
  stops.forEach((p, i) => {
    if (i > 0) {
      const prev = stops[i - 1];
      coordinates.push([(prev.lon + p.lon) / 2 + 0.0003, (prev.lat + p.lat) / 2]);
    }
    wayPoints.push(coordinates.length);
    coordinates.push([p.lon, p.lat]);
  });
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          segments: legs.map(l => ({ ...l, steps: [{ ...l, type: 11, instruction: 'Head north', name: '-', way_points: [0, 1] }] })),
          way_points: wayPoints,
          summary: {
            distance: legs.reduce((t, l) => t + l.distance, 0),
            duration: legs.reduce((t, l) => t + l.duration, 0),
          },
          warnings: [{ code: 1, message: 'There may be restrictions on some roads' }],
        },
        geometry: { type: 'LineString', coordinates },
      },
    ],
    metadata: {
      attribution: 'openrouteservice.org | OpenStreetMap contributors',
      service: 'routing',
      engine: { version: '9.1.0', build_date: '2026-08-01T00:00:00Z', graph_date: '2026-09-28T10:00:00Z' },
    },
  };
}

/** Answers with a valid route for whatever coordinates were asked for. */
const echoRoute = (_url: string, init: RequestInit) => {
  const coords: [number, number][] = upstreamBody({ url: '', init, at: 0 }).coordinates;
  return json(orsReply(coords.map(([lon, lat]) => ({ lat, lon }))));
};

const ROUTE_FIELDS = ['distanceM', 'durationS', 'path', 'legs', 'bounds'];
const hasNoRouteData = (body: any) => ROUTE_FIELDS.every(f => !(f in (body ?? {})));
const onlyErrorFields = (body: any) =>
  Object.keys(body ?? {}).every(k => ['error', 'code', 'retryAfterSeconds'].includes(k));

async function errorOf(promise: Promise<unknown>): Promise<GeoServiceError | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    return err instanceof GeoServiceError ? err : null;
  }
}

async function runRoutingTestSuite() {
  console.log('=================================================================');
  console.log('NAMO YATRI ROAD ROUTING TEST SUITE (16 SCENARIOS)');
  console.log('=================================================================\n');

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let passed = 0;
  let failed = 0;
  let routePosts = 0;

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

  /** POST /api/geo/route. Counted, because the per-IP limiter counts it. */
  async function postRoute(body: unknown) {
    routePosts++;
    const res = await fetch(`${baseUrl}/api/geo/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Left null: the assertions say what was expected.
    }
    return { status: res.status, headers: res.headers, body: parsed, text };
  }

  async function getStatus() {
    const res = await fetch(`${baseUrl}/api/geo/route/status`);
    return { status: res.status, body: (await res.json()) as any };
  }

  try {
    // -------------------------------------------------------------
    // Shared helpers and the reply parser (no server)
    // -------------------------------------------------------------
    await assertTest(1, 'GeoJSON [lon, lat] becomes Leaflet [lat, lon]; malformed or out-of-range lines are rejected', async () => {
      const line = geoJsonLineToLatLngs([[73.792041, 20.007634], [73.7953, 20.007]]);
      const ok =
        JSON.stringify(line) === JSON.stringify([[20.00763, 73.79204], [20.007, 73.7953]]) &&
        geoJsonLineToLatLngs([[200, 20]]) === null &&
        geoJsonLineToLatLngs([[73.79, 95]]) === null &&
        geoJsonLineToLatLngs([['73.79', 20]]) === null &&
        geoJsonLineToLatLngs([[73.79]]) === null &&
        geoJsonLineToLatLngs('not a line') === null;
      return { success: ok, details: `converted: ${JSON.stringify(line)}` };
    });

    await assertTest(2, 'Reply parsing: totals, one leg per pair of stops in order, provider line, attribution, warnings, data date', async () => {
      const stops = [RAMKUND, KALARAM, NASHIK_ROAD].map(roundRouteStop);
      const route = parseOpenRouteServiceRoute(orsReply(stops), stops, 'walking');
      const legsOk =
        route.legs.length === 2 &&
        route.legs[0].fromStop === 0 && route.legs[0].toStop === 1 && route.legs[0].distanceM === 1000 && route.legs[0].durationS === 700 &&
        route.legs[1].fromStop === 1 && route.legs[1].toStop === 2 && route.legs[1].distanceM === 2000 && route.legs[1].durationS === 1400;
      const ok =
        legsOk &&
        route.distanceM === 3001 && route.durationS === 2101 &&
        route.path.length === 5 &&
        route.path[0][0] === stops[0].lat && route.path[0][1] === stops[0].lon &&
        route.path[4][0] === stops[2].lat && route.path[4][1] === stops[2].lon &&
        route.bounds.south === stops[2].lat && route.bounds.north === stops[0].lat &&
        route.attribution === OPENROUTESERVICE_ATTRIBUTION &&
        route.warnings.join('|') === 'There may be restrictions on some roads' &&
        route.dataTimestamp === '2026-09-28T10:00:00Z' &&
        route.provider === 'OPENROUTESERVICE' && route.mode === 'walking';

      // Without a summary the totals are the sum of the legs; a leg the
      // provider left out stays null rather than being guessed.
      const noSummary = orsReply(stops) as any;
      delete noSummary.features[0].properties.summary;
      const summed = parseOpenRouteServiceRoute(noSummary, stops, 'walking');
      const gap = orsReply(stops) as any;
      delete gap.features[0].properties.segments[1].duration;
      const partial = parseOpenRouteServiceRoute(gap, stops, 'walking');
      const extrasOk =
        summed.distanceM === 3001 && summed.durationS === 2101 &&
        partial.legs[1].durationS === null && partial.durationS === 2101;
      return {
        success: ok && extrasOk,
        details: `total ${route.distanceM} m / ${route.durationS} s, legs ${route.legs.map(l => `${l.fromStop}->${l.toStop}:${l.distanceM}m`).join(', ')}, first point ${route.path[0]}`,
      };
    });

    await assertTest(3, 'Malformed provider replies are rejected as ROUTING_PROVIDER_BAD_RESPONSE, never half-shown', async () => {
      const stops = [RAMKUND, KALARAM, NASHIK_ROAD].map(roundRouteStop);
      const variants: Record<string, (r: any) => unknown> = {
        'empty object': () => ({}),
        'no features': () => ({ type: 'FeatureCollection', features: [] }),
        'point geometry': r => ((r.features[0].geometry = { type: 'Point', coordinates: [73.79, 20.0] }), r),
        'text coordinate': r => ((r.features[0].geometry.coordinates[1] = ['73.79', '20.0']), r),
        'one point line': r => ((r.features[0].geometry.coordinates = [[73.79, 20.0]]), r),
        'leg missing': r => (r.features[0].properties.segments.pop(), r),
        'way point missing': r => (r.features[0].properties.way_points.pop(), r),
        'no totals and a leg without distance': r => {
          delete r.features[0].properties.summary;
          delete r.features[0].properties.segments[0].distance;
          return r;
        },
        'negative total and no legs': r => {
          r.features[0].properties.summary = { distance: -5, duration: 10 };
          delete r.features[0].properties.segments;
          return r;
        },
      };
      const notRejected: string[] = [];
      for (const [name, mutate] of Object.entries(variants)) {
        try {
          parseOpenRouteServiceRoute(mutate(orsReply(stops)), stops, 'walking');
          notRejected.push(name);
        } catch (err) {
          if (!(err instanceof GeoServiceError) || err.code !== 'ROUTING_PROVIDER_BAD_RESPONSE' || err.status !== 502) {
            notRejected.push(`${name} (wrong error)`);
          }
        }
      }
      return {
        success: notRejected.length === 0,
        details: notRejected.length ? `accepted: ${notRejected.join(', ')}` : `${Object.keys(variants).length} malformed replies rejected`,
      };
    });

    await assertTest(4, 'Duration labels; the route key depends on mode and order, not on sub-11 m differences', async () => {
      const labels = [formatDuration(30), formatDuration(14 * 60), formatDuration(3900), formatDuration(3 * 3600)];
      const nudged = { lat: RAMKUND.lat + 0.00001, lon: RAMKUND.lon };
      const ok =
        labels.join('|') === 'under 1 min|14 min|1 h 5 min|3 h' &&
        routeKey('walking', [RAMKUND, KALARAM]) === routeKey('walking', [nudged, KALARAM]) &&
        routeKey('walking', [RAMKUND, KALARAM]) !== routeKey('driving', [RAMKUND, KALARAM]) &&
        routeKey('walking', [RAMKUND, KALARAM]) !== routeKey('walking', [KALARAM, RAMKUND]);
      return { success: ok, details: labels.join(' / ') };
    });

    // -------------------------------------------------------------
    // POST /api/geo/route
    // -------------------------------------------------------------
    await assertTest(5, 'Validation: bad body, unsupported mode, wrong stop counts, bad or outside coordinates, a repeated stop: no provider call', async () => {
      configure(FAKE_KEY, SELF_HOSTED);
      resetUpstream(echoRoute);
      const tooMany = Array.from({ length: MAX_ROUTE_STOPS + 1 }, (_, i) => ({ lat: 20.0 + i * 0.002, lon: 73.79 }));
      const results = [
        await postRoute([RAMKUND, KALARAM]),
        await postRoute({ mode: 'cycling', stops: [RAMKUND, KALARAM] }),
        await postRoute({ mode: 'walking', stops: [RAMKUND] }),
        await postRoute({ mode: 'walking', stops: tooMany }),
        await postRoute({ mode: 'walking', stops: [RAMKUND, { lat: '20.007', lon: 73.7953 }] }),
        await postRoute({ mode: 'driving', stops: [RAMKUND, MUMBAI] }),
        await postRoute({ mode: 'walking', stops: [RAMKUND, { lat: RAMKUND.lat + 0.00001, lon: RAMKUND.lon }, KALARAM] }),
      ];
      const expected = [
        'INVALID_ROUTE_REQUEST',
        'INVALID_TRAVEL_MODE',
        'INVALID_ROUTE_STOPS',
        'TOO_MANY_ROUTE_STOPS',
        'INVALID_COORDINATES',
        'OUTSIDE_SERVICE_AREA',
        'DUPLICATE_ROUTE_STOP',
      ];
      const ok =
        results.every((r, i) => r.status === 400 && r.body?.code === expected[i] && hasNoRouteData(r.body)) &&
        calls.length === 0;
      return { success: ok, details: `${results.map(r => `${r.status} ${r.body?.code}`).join(' / ')}, provider calls ${calls.length}` };
    });

    await assertTest(6, 'No API key: status says not configured, the route answers ROUTING_NOT_CONFIGURED, nothing is invented', async () => {
      configure(null, null);
      resetUpstream(echoRoute);
      const status = await getStatus();
      const route = await postRoute({ mode: 'walking', stops: [RAMKUND, KALARAM] });
      configure('MY_OPENROUTESERVICE_API_KEY', null);
      const placeholderCounts = getRoutingStatus().configured;
      const ok =
        status.status === 200 && status.body.configured === false && !('key' in status.body) &&
        route.status === 503 && route.body?.code === 'ROUTING_NOT_CONFIGURED' &&
        onlyErrorFields(route.body) && hasNoRouteData(route.body) &&
        placeholderCounts === false &&
        calls.length === 0;
      return {
        success: ok,
        details: `status configured=${status.body.configured}; route ${route.status} ${route.body?.code}; .env.example placeholder counts as configured: ${placeholderCounts}; provider calls ${calls.length}`,
      };
    });

    await assertTest(7, 'Walking route: hosted HeiGIT endpoint, key only in the Authorization header, [lon, lat] up, [lat, lon] back', async () => {
      configure(FAKE_KEY, null);
      resetUpstream(echoRoute);
      const status = await getStatus();
      const { status: code, body, text } = await postRoute({ mode: 'walking', stops: [RAMKUND, KALARAM] });
      const call = calls[0];
      const sent = call ? upstreamBody(call) : {};
      const ok =
        status.body.configured === true &&
        calls.length === 1 &&
        call.url === `${HOSTED}/directions/foot-walking/geojson` &&
        !call.url.includes('api.openrouteservice.org') && !call.url.includes(FAKE_KEY) &&
        call.init.method === 'POST' &&
        headerOf(call, 'Authorization') === FAKE_KEY &&
        (headerOf(call, 'User-Agent') ?? '').startsWith('NamoYatri/') &&
        JSON.stringify(sent.coordinates) === JSON.stringify([[73.792, 20.0076], [73.7953, 20.007]]) &&
        sent.instructions === true &&
        code === 200 &&
        body.provider === 'OPENROUTESERVICE' && body.mode === 'walking' &&
        body.path[0][0] === 20.0076 && body.path[0][1] === 73.792 &&
        body.distanceM === 1000 && body.durationS === 700 && body.legs.length === 1 &&
        /HeiGIT/.test(body.attribution) && /OpenStreetMap/.test(body.attribution) &&
        !text.includes(FAKE_KEY);
      return {
        success: ok,
        details: `${code}; upstream ${call?.url}; sent ${JSON.stringify(sent.coordinates)}; first point back ${JSON.stringify(body?.path?.[0])}`,
      };
    });

    await assertTest(8, 'Several stops: the chosen order is kept exactly, driving profile, one result per leg', async () => {
      configure(FAKE_KEY, SELF_HOSTED);
      resetUpstream(echoRoute);
      const chosen = [TRIMBAK, RAMKUND, NASHIK_ROAD, KALARAM];
      const { status, body } = await postRoute({ mode: 'driving', stops: chosen });
      const sent = calls[0] ? upstreamBody(calls[0]).coordinates : [];
      const expectedSent = chosen.map(roundRouteStop).map(p => [p.lon, p.lat]);
      const ok =
        status === 200 &&
        calls.length === 1 && calls[0].url === `${SELF_HOSTED}/directions/driving-car/geojson` &&
        JSON.stringify(sent) === JSON.stringify(expectedSent) &&
        JSON.stringify(body.stops) === JSON.stringify(chosen.map(roundRouteStop)) &&
        body.legs.length === 3 &&
        body.legs.map((l: any) => `${l.fromStop}-${l.toStop}:${l.distanceM}`).join(',') === '0-1:1000,1-2:2000,2-3:3000' &&
        body.mode === 'driving';
      return { success: ok, details: `${status}, legs ${body?.legs?.map((l: any) => `${l.fromStop + 1}→${l.toStop + 1} ${l.distanceM} m`).join(', ')}` };
    });

    await assertTest(9, 'Identical requests share one provider call (in flight and cached); a new mode is a new call', async () => {
      configure(FAKE_KEY, SELF_HOSTED);
      resetUpstream(echoRoute);
      const nudged = { lat: RAMKUND.lat + 0.00001, lon: RAMKUND.lon };
      const [a, b] = await Promise.all([
        postRoute({ mode: 'walking', stops: [RAMKUND, KALARAM] }),
        postRoute({ mode: 'walking', stops: [nudged, KALARAM] }),
      ]);
      const afterParallel = calls.length;
      const c = await postRoute({ mode: 'walking', stops: [RAMKUND, KALARAM] });
      const afterRepeat = calls.length;
      const d = await postRoute({ mode: 'driving', stops: [RAMKUND, KALARAM] });
      const ok =
        [a, b, c, d].every(r => r.status === 200) &&
        afterParallel === 1 && afterRepeat === 1 && calls.length === 2 &&
        calls[1].url.endsWith('/driving-car/geojson');
      return { success: ok, details: `provider calls: ${afterParallel} after 2 parallel, ${afterRepeat} after a repeat, ${calls.length} after switching to driving` };
    });

    await assertTest(10, 'No route (2009) and an off-road stop (2010) give clear 422 codes and no route data', async () => {
      configure(FAKE_KEY, SELF_HOSTED);
      resetUpstream(() =>
        json({ error: { code: 2009, message: 'Route could not be found - Unable to find a route between points 1 (73.7920000 20.0076000) and 2 (73.7953000 20.0070000).' } }, 404),
      );
      const noRoute = await errorOf(planRoute([RAMKUND, KALARAM], 'driving'));
      resetUpstream(() =>
        json({ error: { code: 2010, message: 'Could not find routable point within a radius of 350.0 meters of specified coordinate 1: 73.7953000 20.0070000.' } }, 404),
      );
      const offRoad = await errorOf(planRoute([RAMKUND, KALARAM, NASHIK_ROAD], 'walking'));
      const ok =
        noRoute?.status === 422 && noRoute.code === 'ROUTE_NOT_FOUND' && /No driving route/.test(noRoute.message) &&
        offRoad?.status === 422 && offRoad.code === 'ROUTE_POINT_NOT_ROUTABLE' && /^Stop 2 is more than 350 m/.test(offRoad.message) &&
        !/Could not find routable point/.test(offRoad.message);
      return { success: ok, details: `${noRoute?.code}: "${noRoute?.message}" / ${offRoad?.code}: "${offRoad?.message}"` };
    });

    await assertTest(11, 'Provider failures map to distinct codes: timeout, unreachable, error, unreadable, key refused, overloaded', async () => {
      configure(FAKE_KEY, SELF_HOSTED);
      const cases: { name: string; reply: typeof respond; status: number; code: string }[] = [
        {
          name: 'timeout',
          reply: () => {
            throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
          },
          status: 504,
          code: 'ROUTING_PROVIDER_TIMEOUT',
        },
        {
          name: 'unreachable',
          reply: () => {
            throw new TypeError('fetch failed');
          },
          status: 502,
          code: 'ROUTING_PROVIDER_UNREACHABLE',
        },
        { name: 'internal error', reply: () => json({ error: { code: 2099, message: 'Unknown internal error.' } }, 500), status: 502, code: 'ROUTING_PROVIDER_FAILED' },
        { name: 'not JSON', reply: () => new Response('<html>ok</html>', { status: 200 }), status: 502, code: 'ROUTING_PROVIDER_BAD_RESPONSE' },
        { name: 'key refused', reply: () => json({ error: 'Access to this API has been disallowed' }, 403), status: 502, code: 'ROUTING_PROVIDER_AUTH_FAILED' },
        { name: 'overloaded', reply: () => new Response('busy', { status: 503 }), status: 503, code: 'ROUTING_PROVIDER_BUSY' },
      ];
      const wrong: string[] = [];
      for (const c of cases) {
        resetUpstream(c.reply);
        const err = await errorOf(planRoute([RAMKUND, KALARAM], 'walking'));
        if (err?.status !== c.status || err.code !== c.code || err.message.includes(FAKE_KEY)) {
          wrong.push(`${c.name}: ${err?.status} ${err?.code}`);
        }
      }
      // After "overloaded" the provider is left alone for 30 s.
      const callsBefore = calls.length;
      const meanwhile = await errorOf(planRoute([KALARAM, NASHIK_ROAD], 'walking'));
      const backedOff = meanwhile?.code === 'ROUTING_PROVIDER_BUSY' && (meanwhile.retryAfterSeconds ?? 0) > 25 && calls.length === callsBefore;
      return {
        success: wrong.length === 0 && backedOff,
        details: wrong.length ? `wrong: ${wrong.join('; ')}` : `${cases.length} failure kinds mapped; back-off after overload: ${backedOff}`,
      };
    });

    await assertTest(12, 'Errors reach the browser as plain codes: no key, provider address, provider wording or stack trace', async () => {
      configure(FAKE_KEY, SELF_HOSTED);
      resetUpstream(() =>
        json({ error: { code: 2099, message: 'java.lang.NullPointerException at org.heigit.ors.routing.RoutingProfile' } }, 500),
      );
      const failedRoute = await postRoute({ mode: 'walking', stops: [RAMKUND, KALARAM] });
      resetUpstream(() => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      });
      const timedOut = await postRoute({ mode: 'walking', stops: [RAMKUND, KALARAM] });
      const leaks = (text: string) => [FAKE_KEY, 'ors.test', 'NullPointer', 'java.', 'at org.', 'stack'].filter(s => text.includes(s));
      const ok =
        failedRoute.status === 502 && failedRoute.body?.code === 'ROUTING_PROVIDER_FAILED' &&
        timedOut.status === 504 && timedOut.body?.code === 'ROUTING_PROVIDER_TIMEOUT' &&
        [failedRoute, timedOut].every(r => onlyErrorFields(r.body) && hasNoRouteData(r.body) && leaks(r.text).length === 0);
      return {
        success: ok,
        details: `${failedRoute.status} ${failedRoute.text} / ${timedOut.status} ${timedOut.body?.code}; leaked: ${[...leaks(failedRoute.text), ...leaks(timedOut.text)].join(', ') || 'nothing'}`,
      };
    });

    await assertTest(13, 'Provider rate limit (429): 503 ROUTING_RATE_LIMITED with Retry-After, then no provider calls until it passes', async () => {
      configure(FAKE_KEY, SELF_HOSTED);
      resetUpstream(() => json({ error: 'Rate limit exceeded' }, 429, { 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 120) }));
      const first = await postRoute({ mode: 'walking', stops: [RAMKUND, KALARAM] });
      const second = await postRoute({ mode: 'driving', stops: [KALARAM, NASHIK_ROAD] });
      const callsWhileBlocked = calls.length;
      const retry = first.body?.retryAfterSeconds ?? 0;
      // Daily allowance used up: the message says so.
      resetUpstream(() => json({ error: 'Quota exceeded' }, 429, { 'retry-after': String(5 * 3600) }));
      const daily = await errorOf(planRoute([RAMKUND, KALARAM], 'walking'));
      const ok =
        first.status === 503 && first.body?.code === 'ROUTING_RATE_LIMITED' &&
        retry >= 115 && retry <= 121 && Number(first.headers.get('retry-after')) === retry &&
        hasNoRouteData(first.body) &&
        second.status === 503 && second.body?.code === 'ROUTING_RATE_LIMITED' &&
        callsWhileBlocked === 1 &&
        daily?.code === 'ROUTING_RATE_LIMITED' && /today/.test(daily.message);
      return {
        success: ok,
        details: `${first.status} ${first.body?.code} retry ${retry}s; then ${second.status} ${second.body?.code} with ${callsWhileBlocked} provider call in all; daily: "${daily?.message}"`,
      };
    });

    await assertTest(14, 'Provider calls are spaced at least 1.5 s apart (free plan: 40 a minute)', async () => {
      configure(FAKE_KEY, SELF_HOSTED);
      resetUpstream(echoRoute);
      await Promise.all([planRoute([RAMKUND, KALARAM], 'walking'), planRoute([KALARAM, NASHIK_ROAD], 'walking')]);
      const gap = calls.length === 2 ? Math.abs(calls[1].at - calls[0].at) : -1;
      return { success: gap >= 1500, details: `gap between provider calls: ${gap} ms` };
    });

    await assertTest(15, 'A request body over 4 KB is refused with 413 before any provider call', async () => {
      configure(FAKE_KEY, SELF_HOSTED);
      resetUpstream(echoRoute);
      const res = await fetch(`${baseUrl}/api/geo/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'walking', stops: [RAMKUND, KALARAM], padding: 'x'.repeat(5000) }),
      });
      const body: any = await res.json();
      return { success: res.status === 413 && body.code === 'PAYLOAD_TOO_LARGE' && calls.length === 0, details: `${res.status} ${body.code}` };
    });

    await assertTest(16, 'Per-client limit: the 21st route request in a minute gets 429 RATE_LIMIT_EXCEEDED with Retry-After', async () => {
      resetUpstream(echoRoute);
      let limited: Awaited<ReturnType<typeof postRoute>> | null = null;
      let limitedAt = 0;
      for (let i = 0; i < 25 && !limited; i++) {
        const r = await postRoute({ mode: 'walking', stops: [] });
        if (r.status === 429) {
          limited = r;
          limitedAt = routePosts;
        }
      }
      const ok =
        limited !== null && limitedAt === 21 &&
        limited.body?.code === 'RATE_LIMIT_EXCEEDED' && Number(limited.headers.get('retry-after')) > 0 &&
        calls.length === 0;
      return { success: ok, details: `first 429 on route request #${limitedAt} (${limited?.body?.code})` };
    });
  } finally {
    server.close();
  }

  console.log('\n=================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log('=================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runRoutingTestSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
