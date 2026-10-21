import { readFileSync } from 'fs';
import http from 'http';
import app from '../server';
import { GeoServiceError, classifyTripTags, parseTripCandidates, resetGeoStateForTests, setGeoFetchForTests } from '../server/geo';
import { resetRoutingStateForTests, setRoutingFetchForTests } from '../server/routing';
import {
  MAX_PLANS_PER_DAY,
  ModelReply,
  ModelRequest,
  candidateAreas,
  generateItinerary,
  itinerarySchema,
  parsePlanReply,
  resetItineraryStateForTests,
  selectCandidates,
  setItineraryModelForTests,
} from '../server/itinerary';
import { ValidItineraryRequest, validateItineraryRequestBody } from '../server/middleware/validation';
import { GeoPoint } from '../src/lib/geo';
import {
  DayRouteState,
  TripCandidate,
  dayRoutePoints,
  dayRouteView,
  moveItem,
  removeItem,
  withoutPendingRoute,
} from '../src/lib/itinerary';
import { RouteResponse, TravelMode, roundRouteStop, routeKey } from '../src/lib/routing';

process.env.NODE_ENV = 'test';

// Run with NODE_ENV=test set in the shell (see CLAUDE.md): the import above
// starts the server before the line above runs.
//
// No real service is called. Gemini, Overpass and OpenRouteService are all
// stubs, and every key is a fake. /api/itinerary/generate allows 10 requests
// per 10 minutes per IP: scenarios 4, 5, 6, 16, 17 and 19 make 6 (all
// counted in planPosts), and scenario 20 checks that the 11th is refused, so
// it must stay last. Everything else calls the server functions directly.
// Keep that budget in step.

const FAKE_GEMINI_KEY = 'test-gemini-key-0000-not-a-real-key';
const FAKE_ORS_KEY = 'test-ors-key-0000-not-a-real-key';
const OVERPASS = 'https://overpass-trip.test/api/interpreter';
const ORS = 'https://ors.test/ors/v2';

function configure({ gemini, ors }: { gemini: string | null; ors: boolean }) {
  if (gemini === null) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = gemini;
  if (ors) {
    process.env.OPENROUTESERVICE_API_KEY = FAKE_ORS_KEY;
    process.env.OPENROUTESERVICE_API_URL = ORS;
  } else {
    delete process.env.OPENROUTESERVICE_API_KEY;
    delete process.env.OPENROUTESERVICE_API_URL;
  }
}
process.env.OVERPASS_API_URLS = OVERPASS;
configure({ gemini: null, ors: false });

// ---------------------------------------------------------------------------
// Upstream stubs
// ---------------------------------------------------------------------------

interface Call {
  url: string;
  init: RequestInit;
  at: number;
}

let overpassCalls: Call[] = [];
let orsCalls: Call[] = [];
let modelCalls: ModelRequest[] = [];
let overpassReply: (query: string) => Response | Promise<Response> = () => json({ elements: [] });
let orsReply: (url: string, init: RequestInit) => Response | Promise<Response> = (_u, init) => echoRoute(init);
let modelReply: (request: ModelRequest) => ModelReply | Promise<ModelReply> = () => ({ text: '' });

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

setGeoFetchForTests(async (input, init) => {
  const url = String(input);
  overpassCalls.push({ url, init: init ?? {}, at: Date.now() });
  return overpassReply(new URLSearchParams(String(init?.body)).get('data') ?? '');
});
setRoutingFetchForTests(async (input, init) => {
  orsCalls.push({ url: String(input), init: init ?? {}, at: Date.now() });
  return orsReply(String(input), init ?? {});
});
setItineraryModelForTests(async request => {
  modelCalls.push(request);
  return modelReply(request);
});

function resetAll() {
  resetGeoStateForTests();
  resetRoutingStateForTests();
  resetItineraryStateForTests();
  overpassCalls = [];
  orsCalls = [];
  modelCalls = [];
  overpassReply = () => json({ elements: OSM_ELEMENTS });
  orsReply = (_u, init) => echoRoute(init);
}

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

// Real places near Panchavati, Nashik, plus ones that must never be offered.
const OSM_ELEMENTS: OsmElement[] = [
  { type: 'node', id: 1, lat: 20.00698, lon: 73.79531, tags: { amenity: 'place_of_worship', religion: 'hindu', name: 'Kalaram Mandir', wikidata: 'Q123', opening_hours: '05:00-22:00' } },
  { type: 'node', id: 2, lat: 20.0081, lon: 73.7926, tags: { tourism: 'attraction', name: 'Ramkund' } },
  { type: 'node', id: 3, lat: 20.0089, lon: 73.7962, tags: { amenity: 'place_of_worship', religion: 'hindu', name: 'Sita Gufa', 'addr:street': 'Panchavati' } },
  { type: 'way', id: 4, center: { lat: 20.0071, lon: 73.793 }, tags: { amenity: 'place_of_worship', religion: 'hindu', name: 'Kapaleshwar Mandir' } },
  { type: 'node', id: 5, lat: 20.0101, lon: 73.799, tags: { amenity: 'place_of_worship' } }, // no name
  { type: 'node', id: 6, lat: 20.005, lon: 73.79, tags: { amenity: 'restaurant', name: 'Annapurna Bhojanalaya', cuisine: 'indian' } },
  { type: 'node', id: 7, lat: 20.008, lon: 73.794, tags: { shop: 'religion', name: 'Panchavati Pooja Bhandar' } },
  { type: 'node', id: 8, lat: 20.011, lon: 73.789, tags: { historic: 'monument', name: 'Old Gate' } },
  { type: 'node', id: 9, lat: 19.076, lon: 72.8777, tags: { amenity: 'place_of_worship', name: 'Siddhivinayak' } }, // Mumbai
  { type: 'node', id: 10, lat: 20.004, lon: 73.797, tags: { leisure: 'park', access: 'private', name: 'Private Garden' } },
  { type: 'node', id: 11, lat: 20.006, lon: 73.798, tags: { leisure: 'park', name: 'Godavari Ghat Garden' } },
  { type: 'node', id: 12, lat: 20.00699, lon: 73.79532, tags: { amenity: 'place_of_worship', name: 'Kalaram Temple Office' } }, // same ~11 m spot as node/1
  { type: 'node', id: 13, lat: 20.0102, lon: 73.7915, tags: { amenity: 'place_of_worship', religion: 'jain', name: 'Jain Mandir Panchavati' } },
  { type: 'node', id: 14, lat: 20.0035, lon: 73.7948, tags: { amenity: 'place_of_worship', religion: 'hindu', name: 'Naroshankar Temple', heritage: '2' } },
  { type: 'node', id: 15, lat: 20.0121, lon: 73.7973, tags: { amenity: 'place_of_worship', religion: 'hindu', name: 'Tapovan Temple', 'name:en': 'Tapovan Mandir' } },
];
const TEMPLE_IDS = ['node/1', 'node/3', 'way/4', 'node/13', 'node/14', 'node/15'];

/** A reply shaped like OpenRouteService's, through whatever coordinates were asked for. */
function echoRoute(init: RequestInit) {
  const coords: [number, number][] = JSON.parse(String(init.body)).coordinates;
  const legs = coords.slice(1).map((_, i) => ({ distance: 500 * (i + 1), duration: 400 * (i + 1) }));
  return json({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          segments: legs,
          way_points: coords.map((_, i) => i),
          summary: { distance: legs.reduce((t, l) => t + l.distance, 0), duration: legs.reduce((t, l) => t + l.duration, 0) },
        },
        geometry: { type: 'LineString', coordinates: coords },
      },
    ],
  });
}

/** The candidates the server put in the prompt, in prompt order. */
function promptCandidates(request: ModelRequest): { id: string; name: string; category: string }[] {
  const marker = request.prompt.indexOf('CANDIDATE PLACES');
  return JSON.parse(request.prompt.slice(request.prompt.indexOf('[', marker)));
}

/** A model reply with the given place ids per day. */
const planReply = (days: string[][], extra: Record<string, unknown> = {}): ModelReply => ({
  text: JSON.stringify({
    summary: 'A calm temple trip.',
    days: days.map((ids, i) => ({
      day: i + 1,
      title: `Temples, part ${i + 1}`,
      summary: 'Temples close together.',
      stops: ids.map(id => ({ placeId: id, reason: 'A Hindu place of worship, matching your interest in temples.', visitMinutes: 45, ...extra })),
    })),
  }),
  finishReason: 'STOP',
});

/** Splits the prompt's candidates into `days` days of `perDay` stops. */
const autoPlan = (days: number, perDay: number) => (request: ModelRequest) => {
  const ids = promptCandidates(request).map(c => c.id);
  return planReply(Array.from({ length: days }, (_, d) => ids.slice(d * perDay, d * perDay + perDay)));
};

const AREA_REQUEST: ValidItineraryRequest = {
  days: 2,
  start: { type: 'area', area: 'nashik' },
  interests: ['temples'],
  budget: 'economical',
  pace: 'relaxed',
  mode: 'walking',
};
const POINT_START: GeoPoint = { lat: 20.00512, lon: 73.79105 }; // near Panchavati, not a candidate

const ROUTE_FIELDS = /"(distanceM|durationS|path)"\s*:/;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function waitFor(check: () => boolean, ms = 3000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out waiting for the stub to be called');
    await sleep(10);
  }
}

async function errorOf(promise: Promise<unknown>): Promise<GeoServiceError | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    return err instanceof GeoServiceError ? err : null;
  }
}

/** Runs the request validator directly, so validation cases do not spend the HTTP budget. */
function validate(body: unknown) {
  let status = 200;
  let payload: any = null;
  let passed = false;
  const res: any = {
    locals: {},
    status(code: number) {
      status = code;
      return this;
    },
    json(b: unknown) {
      payload = b;
      return this;
    },
  };
  validateItineraryRequestBody({ body } as any, res, () => {
    passed = true;
  });
  return { status, code: payload?.code as string | undefined, passed, value: res.locals.itineraryRequest as ValidItineraryRequest | undefined };
}

async function runItineraryTestSuite() {
  console.log('=================================================================');
  console.log('NAMO YATRI AI ITINERARY TEST SUITE (20 SCENARIOS)');
  console.log('=================================================================\n');

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let passed = 0;
  let failed = 0;
  let planPosts = 0;

  async function assertTest(scenarioNum: number, name: string, fn: () => Promise<{ success: boolean; details?: string }>) {
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

  /** POST /api/itinerary/generate. Counted, because the per-IP limiter counts it. */
  async function postPlan(body: unknown) {
    planPosts++;
    const res = await fetch(`${baseUrl}/api/itinerary/generate`, {
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

  const httpBody = (overrides: Record<string, unknown> = {}) => ({
    days: 2,
    start: { type: 'area', area: 'nashik' },
    interests: ['temples'],
    budget: 'economical',
    pace: 'relaxed',
    mode: 'walking',
    ...overrides,
  });

  try {
    // -------------------------------------------------------------
    // Candidate places (no server)
    // -------------------------------------------------------------
    await assertTest(1, 'Candidates: named, in the area, public, one per ~11 m spot, interest-matched, nothing at the start', async () => {
      const { places } = parseTripCandidates({ elements: OSM_ELEMENTS }, { lat: 20.008, lon: 73.792 });
      const ids = places.map(p => p.id);
      const parsedOk =
        !ids.includes('node/5') && !ids.includes('node/9') && !ids.includes('node/10') &&
        ids.includes('node/12') && // still parsed; deduplicated when selecting
        places.find(p => p.id === 'node/15')?.name === 'Tapovan Mandir' &&
        places.find(p => p.id === 'node/1')?.kind === 'Hindu place of worship' &&
        places.find(p => p.id === 'node/1')?.openingHours === '05:00-22:00' &&
        places.find(p => p.id === 'node/7')?.category === 'shopping' &&
        places.every(p => p.sourceType === 'COMMUNITY' && p.osmUrl === `https://www.openstreetmap.org/${p.id}`) &&
        classifyTripTags({ historic: 'fort', tourism: 'attraction' })?.category === 'historic' &&
        classifyTripTags({ amenity: 'bench' }) === null;

      const temples = selectCandidates([{ places }], ['temples'], null);
      const nearKalaram = selectCandidates([{ places }], ['temples'], { lat: 20.0070, lon: 73.79532 });
      const shopping = selectCandidates([{ places }], ['local_markets'], null);
      const selectOk =
        temples.every(p => p.category === 'worship') &&
        temples.map(p => p.id).sort().join() === [...TEMPLE_IDS].sort().join() && // node/12 shares node/1's spot
        !nearKalaram.some(p => p.id === 'node/1' || p.id === 'node/12') &&
        shopping.map(p => p.id).join() === 'node/7';
      return {
        success: parsedOk && selectOk,
        details: `parsed ${ids.length} of ${OSM_ELEMENTS.length}; temples offered: ${temples.map(p => p.id).join(', ')}`,
      };
    });

    await assertTest(2, 'Where places are looked up: walking stays near the start; driving from Nashik also covers Trimbakeshwar', async () => {
      const walk = candidateAreas({ type: 'area', area: 'nashik' }, 'walking');
      const drive = candidateAreas({ type: 'point', point: POINT_START, label: 'Hotel' }, 'driving');
      const fromTrimbak = candidateAreas({ type: 'area', area: 'trimbakeshwar' }, 'driving');
      const ok =
        walk.length === 1 && walk[0].radiusM === 3000 &&
        drive.length === 2 && drive[0].centre === POINT_START && drive[0].radiusM === 8000 && /Trimbakeshwar/.test(drive[1].label) &&
        fromTrimbak.length === 2 && /Nashik/.test(fromTrimbak[1].label);
      return { success: ok, details: `walking ${walk.map(a => `${a.label} ${a.radiusM} m`)}; driving ${drive.map(a => `${a.label} ${a.radiusM} m`).join(' + ')}` };
    });

    // -------------------------------------------------------------
    // The model's reply (no server)
    // -------------------------------------------------------------
    await assertTest(3, 'Reply checks: exact day count, unknown and repeated ids dropped, names and coordinates only from OpenStreetMap', async () => {
      const { places } = parseTripCandidates({ elements: OSM_ELEMENTS }, { lat: 20.008, lon: 73.792 });
      const candidates = new Map(selectCandidates([{ places }], ['temples'], null).map(c => [c.id, c] as [string, TripCandidate]));
      const ctx = { days: 2, maxStops: 3, candidates };

      // A plausible but invented place, a repeat and a fourth stop, with a made-up name and coordinates.
      const reply = planReply([['node/1', 'node/3', 'node/999999', 'way/4', 'node/13'], ['node/14', 'node/1']], { name: 'Golden Temple', lat: 31.62, lon: 74.87 });
      const plan = parsePlanReply(reply.text, ctx);
      const stops = plan.days.flatMap(d => d.stops);
      const grounded =
        plan.days.length === 2 &&
        plan.days[0].stops.map(s => s.place.id).join() === 'node/1,node/3,way/4' &&
        plan.days[1].stops.map(s => s.place.id).join() === 'node/14' &&
        plan.dropped.unknown === 1 && plan.dropped.repeated === 1 && plan.dropped.extra === 1 &&
        stops.every(s => s.place === candidates.get(s.place.id)) &&
        !JSON.stringify(plan).includes('Golden Temple') && !JSON.stringify(plan).includes('31.62');

      const rejected: string[] = [];
      const expectBad = (label: string, text: unknown, c = ctx) => {
        try {
          parsePlanReply(text, c);
          rejected.push(`${label}: accepted`);
        } catch (err) {
          if (!(err instanceof GeoServiceError) || err.code !== 'AI_BAD_RESPONSE' || err.status !== 502) rejected.push(`${label}: wrong error`);
        }
      };
      expectBad('one day instead of two', planReply([['node/1']]).text);
      expectBad('three days instead of two', planReply([['node/1'], ['node/3'], ['way/4']]).text);
      expectBad('mostly invented', planReply([['node/1', 'node/8888', 'node/7777'], ['node/6666']]).text);
      expectBad('a day left empty', planReply([['node/1', 'node/3'], ['node/1']]).text);
      expectBad('not JSON', 'Here is your plan: Day 1 ...');
      expectBad('empty', '');
      expectBad('wrong shape', JSON.stringify({ itinerary: [] }));
      expectBad('stops not a list', JSON.stringify({ summary: 'x', days: [{ title: 'a', stops: 'node/1' }, { title: 'b', stops: [] }] }));
      expectBad('too long', 'x'.repeat(70_000));

      const fenced = parsePlanReply('```json\n' + planReply([['node/1'], ['node/3']]).text + '\n```', ctx);
      const schema: any = itinerarySchema(2, 3, ['node/1', 'node/3']);
      const schemaOk =
        schema.properties.days.minItems === 2 && schema.properties.days.maxItems === 2 &&
        JSON.stringify(schema.properties.days.items.properties.stops.items.properties.placeId.enum) === '["node/1","node/3"]';
      return {
        success: grounded && rejected.length === 0 && fenced.days.length === 2 && schemaOk,
        details: rejected.length ? rejected.join('; ') : `kept ${stops.length} stops, dropped ${JSON.stringify(plan.dropped)}; 9 bad replies rejected; schema enum holds only candidate ids`,
      };
    });

    // -------------------------------------------------------------
    // POST /api/itinerary/generate and generateItinerary()
    // -------------------------------------------------------------
    await assertTest(4, 'Validation: days, interests, budget, pace, mode and start are checked, and required, before any upstream call', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: true });
      resetAll();
      const without = (field: string) => Object.fromEntries(Object.entries(httpBody()).filter(([key]) => key !== field));
      const cases: [unknown, string][] = [
        [[1, 2], 'INVALID_ITINERARY_REQUEST'],
        [null, 'INVALID_ITINERARY_REQUEST'],
        ['3 days please', 'INVALID_ITINERARY_REQUEST'],
        [{}, 'INVALID_TRIP_DAYS'],
        [without('days'), 'INVALID_TRIP_DAYS'],
        [without('interests'), 'INVALID_INTERESTS'],
        [without('budget'), 'INVALID_BUDGET'],
        [without('pace'), 'INVALID_PACE'],
        [without('mode'), 'INVALID_TRAVEL_MODE'],
        [without('start'), 'INVALID_TRIP_START'],
        [httpBody({ start: { type: 'point', lat: 20.0, lon: 73.79 } }), 'INVALID_TRIP_START'],
        [httpBody({ start: { type: 'point', label: 'Hotel' } }), 'INVALID_COORDINATES'],
        [httpBody({ interests: 'temples' }), 'INVALID_INTERESTS'],
        [httpBody({ days: 0 }), 'INVALID_TRIP_DAYS'],
        [httpBody({ days: 8 }), 'INVALID_TRIP_DAYS'],
        [httpBody({ days: 2.5 }), 'INVALID_TRIP_DAYS'],
        [httpBody({ days: '3' }), 'INVALID_TRIP_DAYS'],
        [httpBody({ interests: [] }), 'INVALID_INTERESTS'],
        [httpBody({ interests: ['temples', 'nightlife'] }), 'INVALID_INTERESTS'],
        [httpBody({ interests: ['temples', 'temples'] }), 'INVALID_INTERESTS'],
        [httpBody({ budget: 'luxury' }), 'INVALID_BUDGET'],
        [httpBody({ pace: 'extreme' }), 'INVALID_PACE'],
        [httpBody({ mode: 'cycling' }), 'INVALID_TRAVEL_MODE'],
        [httpBody({ start: { type: 'area', area: 'mumbai' } }), 'INVALID_TRIP_START'],
        [httpBody({ start: { type: 'point', lat: '20.0', lon: 73.79, label: 'Hotel' } }), 'INVALID_COORDINATES'],
        [httpBody({ start: { type: 'point', lat: 19.076, lon: 72.8777, label: 'Mumbai' } }), 'OUTSIDE_SERVICE_AREA'],
        [httpBody({ start: { type: 'point', lat: 20.0, lon: 73.79, label: '   ' } }), 'INVALID_TRIP_START'],
        [httpBody({ start: { type: 'point', lat: 20.0, lon: 73.79, label: 'x'.repeat(121) } }), 'INVALID_TRIP_START'],
      ];
      const wrong = cases
        .map(([body, code]) => ({ code, got: validate(body) }))
        .filter(({ code, got }) => got.status !== 400 || got.code !== code || got.passed);
      const good = validate(httpBody({ days: 7, start: { type: 'point', lat: 20.0, lon: 73.79, label: '  Hotel\u0007 Panchavati ' } }));
      // And once through HTTP, to prove the validator is on the route.
      const viaHttp = await postPlan(httpBody({ days: 9 }));
      const ok =
        wrong.length === 0 &&
        good.passed && good.value?.start.type === 'point' && (good.value.start as any).label === 'Hotel Panchavati' &&
        viaHttp.status === 400 && viaHttp.body?.code === 'INVALID_TRIP_DAYS' &&
        overpassCalls.length === 0 && modelCalls.length === 0 && orsCalls.length === 0;
      return {
        success: ok,
        details: wrong.length ? `wrong: ${wrong.map(w => `${w.code} got ${w.got.status} ${w.got.code}`).join('; ')}` : `${cases.length} bad requests refused; HTTP ${viaHttp.status} ${viaHttp.body?.code}; upstream calls ${overpassCalls.length + modelCalls.length + orsCalls.length}`,
      };
    });

    await assertTest(5, 'No Gemini key (or the .env.example placeholder): AI_NOT_CONFIGURED, no place lookup, no canned plan', async () => {
      configure({ gemini: null, ors: true });
      resetAll();
      const status = await fetch(`${baseUrl}/api/itinerary/status`).then(r => r.json() as Promise<any>);
      const res = await postPlan(httpBody());
      configure({ gemini: 'MY_GEMINI_API_KEY', ors: true });
      const placeholder = await errorOf(generateItinerary(AREA_REQUEST));
      const ok =
        status.aiConfigured === false && status.routingConfigured === true && status.maxDays === 7 &&
        !JSON.stringify(status).includes('key') &&
        res.status === 503 && res.body?.code === 'AI_NOT_CONFIGURED' &&
        Object.keys(res.body).every(k => ['error', 'code'].includes(k)) &&
        placeholder?.code === 'AI_NOT_CONFIGURED' &&
        overpassCalls.length === 0 && modelCalls.length === 0 && orsCalls.length === 0;
      return { success: ok, details: `status ${JSON.stringify(status)}; generate ${res.status} ${res.body?.code}; placeholder key: ${placeholder?.code}` };
    });

    await assertTest(6, 'Grounded plan over HTTP: only real candidates go to the AI, exactly the requested days, stops resolved from OpenStreetMap', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: true });
      resetAll();
      modelReply = request => {
        const auto = autoPlan(2, 2)(request);
        // The model also tries to rename a place and move it to Amritsar; neither must show.
        return { ...auto, text: auto.text!.replace('"visitMinutes":45', '"visitMinutes":45,"name":"Golden Temple","lat":31.62') };
      };
      const res = await postPlan(httpBody());
      const sent = modelCalls[0] ? promptCandidates(modelCalls[0]) : [];
      const enumIds: string[] = (modelCalls[0]?.schema as any)?.properties?.days?.items?.properties?.stops?.items?.properties?.placeId?.enum ?? [];
      const stops = (res.body?.days ?? []).flatMap((d: any) => d.stops);
      const ok =
        res.status === 200 &&
        sent.map(c => c.id).sort().join() === [...TEMPLE_IDS].sort().join() &&
        JSON.stringify(enumIds.sort()) === JSON.stringify(sent.map(c => c.id).sort()) &&
        !modelCalls[0].prompt.includes(FAKE_GEMINI_KEY) &&
        /Never invent a place or an id/.test(modelCalls[0].systemInstruction) &&
        res.body.dayCount === 2 && res.body.days.length === 2 &&
        res.body.days.map((d: any) => d.day).join() === '1,2' &&
        stops.length === 4 &&
        stops.every((s: any) => {
          const el = OSM_ELEMENTS.find(e => `${e.type}/${e.id}` === s.placeId)!;
          const lat = el.lat ?? el.center!.lat;
          return s.lat === lat && (s.name === el.tags['name:en'] || s.name === el.tags.name) && s.category === 'worship';
        }) &&
        !res.text.includes('Golden Temple') && !res.text.includes('31.62') &&
        res.body.places.source === 'OPENSTREETMAP_OVERPASS' && res.body.places.candidateCount === 6 &&
        res.body.ai.provider === 'GEMINI' &&
        res.body.days.every((d: any) => d.route.status === 'ok') && orsCalls.length === 2 &&
        !res.text.includes(FAKE_GEMINI_KEY) && !res.text.includes(FAKE_ORS_KEY);
      return {
        success: ok,
        details: `${res.status}; AI offered ${sent.map(c => c.name).join(', ')}; days ${res.body?.days?.map((d: any) => d.stops.map((s: any) => s.name).join(' → ')).join(' | ')}`,
      };
    });

    await assertTest(7, 'Invented ids: one is dropped with a warning; a plan made mostly of invented places is refused', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: false });
      resetAll();
      modelReply = () => planReply([['node/1', 'node/3', 'node/424242'], ['way/4', 'node/13', 'node/14']]);
      const plan = await generateItinerary(AREA_REQUEST);
      resetAll();
      modelReply = () => planReply([['node/1', 'node/111', 'node/222'], ['node/333', 'node/444']]);
      const refused = await errorOf(generateItinerary(AREA_REQUEST));
      const ids = plan.days.flatMap(d => d.stops.map(s => s.placeId));
      const ok =
        !ids.includes('node/424242') && ids.length === 5 &&
        plan.warnings.some(w => /1 place the AI suggested was not in the OpenStreetMap list/.test(w)) &&
        refused?.code === 'AI_BAD_RESPONSE' && refused.status === 502;
      return { success: ok, details: `kept ${ids.join(', ')}; warning "${plan.warnings[0]}"; mostly invented: ${refused?.code}` };
    });

    await assertTest(8, 'Day count and malformed replies: wrong number of days, not JSON, cut off, empty or blocked all give AI_BAD_RESPONSE', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: false });
      const replies: [string, ModelReply][] = [
        ['one day for a 2-day trip', planReply([['node/1', 'node/3']])],
        ['three days for a 2-day trip', planReply([['node/1'], ['node/3'], ['way/4']])],
        ['prose', { text: 'Day 1: visit Kalaram Mandir. Day 2: Sita Gufa.' }],
        ['cut off', { text: planReply([['node/1'], ['node/3']]).text!.slice(0, 80), finishReason: 'MAX_TOKENS' }],
        ['blocked, no text', { text: undefined, finishReason: 'SAFETY' }],
      ];
      const wrong: string[] = [];
      for (const [label, reply] of replies) {
        resetAll();
        modelReply = () => reply;
        const err = await errorOf(generateItinerary(AREA_REQUEST));
        if (err?.code !== 'AI_BAD_RESPONSE' || err.status !== 502) wrong.push(`${label}: ${err?.code ?? 'accepted'}`);
      }
      // Six days come back as six days.
      resetAll();
      modelReply = autoPlan(6, 1);
      const six = await generateItinerary({ ...AREA_REQUEST, days: 6 });
      return {
        success: wrong.length === 0 && six.days.length === 6 && six.dayCount === 6,
        details: wrong.length ? wrong.join('; ') : `${replies.length} bad replies refused; a 6-day request gave ${six.days.length} days`,
      };
    });

    await assertTest(9, 'Gemini failures map to distinct codes; a 429 pauses further AI calls', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: false });
      const apiError = (status: number, message: string) => Object.assign(new Error(message), { status });
      const cases: { name: string; reply: () => never; status: number; code: string }[] = [
        { name: 'timeout', reply: () => { throw new DOMException('aborted', 'TimeoutError'); }, status: 504, code: 'AI_PROVIDER_TIMEOUT' },
        { name: 'unreachable', reply: () => { throw new TypeError('fetch failed'); }, status: 502, code: 'AI_PROVIDER_UNREACHABLE' },
        { name: 'overloaded', reply: () => { throw apiError(503, 'The model is overloaded.'); }, status: 503, code: 'AI_PROVIDER_BUSY' },
        { name: 'bad key', reply: () => { throw apiError(400, 'API key not valid. Please pass a valid API key.'); }, status: 502, code: 'AI_PROVIDER_AUTH_FAILED' },
        { name: 'other', reply: () => { throw apiError(400, 'Invalid JSON payload.'); }, status: 502, code: 'AI_PROVIDER_FAILED' },
      ];
      const wrong: string[] = [];
      for (const c of cases) {
        resetAll();
        modelReply = c.reply;
        const err = await errorOf(generateItinerary(AREA_REQUEST));
        if (err?.status !== c.status || err.code !== c.code) wrong.push(`${c.name}: ${err?.status} ${err?.code}`);
      }
      resetAll();
      modelReply = () => {
        throw apiError(429, '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"37s"}]}}');
      };
      const limited = await errorOf(generateItinerary(AREA_REQUEST));
      const callsAfterFirst = modelCalls.length;
      const meanwhile = await errorOf(generateItinerary({ ...AREA_REQUEST, days: 1 }));
      const ok =
        wrong.length === 0 &&
        limited?.code === 'AI_RATE_LIMITED' && limited.retryAfterSeconds === 37 &&
        meanwhile?.code === 'AI_RATE_LIMITED' && modelCalls.length === callsAfterFirst;
      return {
        success: ok,
        details: wrong.length ? wrong.join('; ') : `${cases.length} failure kinds mapped; 429 → retry in ${limited?.retryAfterSeconds}s, then ${meanwhile?.code} with no new AI call`,
      };
    });

    await assertTest(10, 'No places: an empty or failed lookup stops before the AI; too few places for the days is NOT_ENOUGH_PLACES', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: true });
      resetAll();
      overpassReply = () => json({ elements: [] });
      const empty = await errorOf(generateItinerary(AREA_REQUEST));
      resetAll();
      overpassReply = () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      };
      const timedOut = await errorOf(generateItinerary(AREA_REQUEST));
      resetAll();
      overpassReply = () => json({ elements: OSM_ELEMENTS.filter(e => e.id === 1 || e.id === 3) });
      const tooFew = await errorOf(generateItinerary({ ...AREA_REQUEST, days: 3 }));
      const ok =
        empty?.status === 422 && empty.code === 'NOT_ENOUGH_PLACES' &&
        timedOut?.status === 504 && timedOut.code === 'GEO_UPSTREAM_TIMEOUT' &&
        tooFew?.code === 'NOT_ENOUGH_PLACES' && /Only 2 mapped places/.test(tooFew.message) &&
        modelCalls.length === 0 && orsCalls.length === 0;
      return { success: ok, details: `${empty?.code} / ${timedOut?.code} / "${tooFew?.message}"; AI calls ${modelCalls.length}` };
    });

    await assertTest(11, 'Routes for several days: each day routed separately from the start, in the AI order, with per-leg data and pacing', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: true });
      resetAll();
      modelReply = () => planReply([['node/14', 'node/1'], ['node/13', 'way/4'], ['node/3', 'node/15']]);
      const plan = await generateItinerary({
        ...AREA_REQUEST,
        days: 3,
        start: { type: 'point', point: POINT_START, label: 'Our dharamshala' },
      });
      const start = roundRouteStop(POINT_START);
      const sent = orsCalls.map(c => JSON.parse(String(c.init.body)).coordinates);
      const expected = plan.days.map(d => [[start.lon, start.lat], ...d.stops.map(s => [roundRouteStop(s).lon, roundRouteStop(s).lat])]);
      const gaps = orsCalls.slice(1).map((c, i) => c.at - orsCalls[i].at);
      const ok =
        orsCalls.length === 3 &&
        orsCalls.every(c => c.url === `${ORS}/directions/foot-walking/geojson`) &&
        JSON.stringify(sent) === JSON.stringify(expected) &&
        plan.days.map(d => d.stops.map(s => s.placeId).join()).join('|') === 'node/14,node/1|node/13,way/4|node/3,node/15' &&
        plan.days.every(d => d.route.status === 'ok' && d.route.route!.legs.length === 2 && d.route.route!.distanceM === 1500) &&
        plan.start?.label === 'Our dharamshala' && plan.start.lat === start.lat &&
        gaps.every(g => g >= 1500) &&
        !modelCalls[0].prompt.includes(String(POINT_START.lat)) && !modelCalls[0].prompt.includes(String(start.lat));
      return {
        success: ok,
        details: `${orsCalls.length} route calls, gaps ${gaps.join(', ')} ms; day 1 sent ${JSON.stringify(sent[0])}`,
      };
    });

    await assertTest(12, 'Routing not set up: the AI plan is still returned, every day says not_configured, and no distance or time appears', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: false });
      resetAll();
      modelReply = autoPlan(2, 2);
      const plan = await generateItinerary(AREA_REQUEST);
      const text = JSON.stringify(plan);
      const ok =
        plan.days.length === 2 && plan.days.every(d => d.stops.length === 2) &&
        plan.routing.configured === false &&
        plan.days.every(d => d.route.status === 'not_configured' && d.route.route === null && d.route.code === 'ROUTING_NOT_CONFIGURED') &&
        !ROUTE_FIELDS.test(text) && orsCalls.length === 0;
      return { success: ok, details: `days ${plan.days.map(d => d.route.status).join(', ')}; route fields in reply: ${ROUTE_FIELDS.test(text)}` };
    });

    await assertTest(13, 'Route failures per day: no route (2009) fails one day only; a timeout skips the rest; one stop and no start is too_few_stops', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: true });
      resetAll();
      let n = 0;
      orsReply = (_u, init) =>
        ++n === 1 ? json({ error: { code: 2009, message: 'Route could not be found' } }, 404) : echoRoute(init);
      modelReply = () => planReply([['node/1', 'node/3'], ['way/4', 'node/13']]);
      const oneFails = await generateItinerary(AREA_REQUEST);

      resetAll();
      orsReply = () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      };
      modelReply = () => planReply([['node/1', 'node/3'], ['way/4', 'node/13'], ['node/14', 'node/15']]);
      const timedOut = await generateItinerary({ ...AREA_REQUEST, days: 3 });
      const callsAfterTimeout = orsCalls.length;

      resetAll();
      modelReply = () => planReply([['node/1'], ['node/3', 'way/4']]);
      const short = await generateItinerary(AREA_REQUEST);

      const noData = (d: any) => d.route.route === null && !ROUTE_FIELDS.test(JSON.stringify(d.route));
      const ok =
        oneFails.days[0].route.status === 'failed' && oneFails.days[0].route.code === 'ROUTE_NOT_FOUND' && noData(oneFails.days[0]) &&
        oneFails.days[1].route.status === 'ok' &&
        timedOut.days[0].route.code === 'ROUTING_PROVIDER_TIMEOUT' &&
        timedOut.days.slice(1).every(d => d.route.status === 'skipped' && noData(d)) &&
        callsAfterTimeout === 1 &&
        short.days[0].route.status === 'too_few_stops' && noData(short.days[0]) && short.days[1].route.status === 'ok';
      return {
        success: ok,
        details: `2009: ${oneFails.days.map(d => d.route.status).join('/')}; timeout: ${timedOut.days.map(d => d.route.status).join('/')} with ${callsAfterTimeout} call; single stop: ${short.days.map(d => d.route.status).join('/')}`,
      };
    });

    await assertTest(14, 'Editing: remove and reorder keep everything else, change the route key, and the recalculated route follows the new order', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: true });
      resetAll();
      const a = { lat: 20.0069, lon: 73.7953 };
      const b = { lat: 20.0089, lon: 73.7962 };
      const c = { lat: 20.0071, lon: 73.793 };
      const start = roundRouteStop(POINT_START);
      const helpersOk =
        moveItem([a, b, c], 2, -1).every((p, i) => p === [a, c, b][i]) &&
        moveItem([a, b, c], 0, -1).length === 3 && moveItem([a, b, c], 0, -1)[0] === a &&
        removeItem([a, b, c], 1).map(p => p.lat).join() === `${a.lat},${c.lat}` &&
        removeItem([a, b, c], 5).length === 3 &&
        dayRoutePoints(start, [a, b])[0] === start && dayRoutePoints(null, [a]).length === 1;

      const before = dayRoutePoints(start, [a, b, c]);
      const after = dayRoutePoints(start, moveItem([a, b, c], 2, -1));
      const keysDiffer = routeKey('walking', before) !== routeKey('walking', after) && routeKey('walking', before) !== routeKey('driving', before);

      // Recalculation goes through the route planner's endpoint, in the new order.
      const res = await fetch(`${baseUrl}/api/geo/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'driving', stops: after }),
      });
      const body: any = await res.json();
      const sent = orsCalls[0] ? JSON.parse(String(orsCalls[0].init.body)).coordinates : [];
      const ok =
        helpersOk && keysDiffer &&
        res.status === 200 && orsCalls[0]?.url.endsWith('/driving-car/geojson') &&
        JSON.stringify(sent) === JSON.stringify(after.map(p => [roundRouteStop(p).lon, roundRouteStop(p).lat])) &&
        body.legs.length === 3 &&
        dayRoutePoints(null, removeItem([a, b], 0)).length < 2;
      return { success: ok, details: `reordered route sent ${JSON.stringify(sent)}; ${body.legs?.length} legs back` };
    });

    await assertTest(15, 'Double taps share one plan; the server-wide daily allowance stops further AI calls', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: false });
      resetAll();
      modelReply = autoPlan(2, 1);
      const [x, y] = await Promise.all([generateItinerary(AREA_REQUEST), generateItinerary(AREA_REQUEST)]);
      const shared = modelCalls.length === 1 && x === y;
      for (let i = 1; i < MAX_PLANS_PER_DAY; i++) await generateItinerary(AREA_REQUEST);
      const callsAtLimit = modelCalls.length;
      const over = await errorOf(generateItinerary(AREA_REQUEST));
      const ok =
        shared && callsAtLimit === MAX_PLANS_PER_DAY &&
        over?.code === 'AI_DAILY_LIMIT_REACHED' && over.status === 503 && (over.retryAfterSeconds ?? 0) > 0 &&
        modelCalls.length === MAX_PLANS_PER_DAY;
      return { success: ok, details: `parallel identical requests → ${shared ? '1 AI call' : 'several AI calls'}; after ${callsAtLimit} plans: ${over?.code}` };
    });

    await assertTest(16, 'Errors reach the browser as plain codes: no keys, Google wording, stack traces or route data', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: true });
      resetAll();
      modelReply = () => {
        throw Object.assign(new Error(`Request to https://generativelanguage.googleapis.com?key=${FAKE_GEMINI_KEY} failed\n    at GoogleGenAI.generate (node_modules/@google/genai/index.mjs:1:1)`), { status: 500 });
      };
      const res = await postPlan(httpBody());
      const leaks = [FAKE_GEMINI_KEY, FAKE_ORS_KEY, 'googleapis', 'node_modules', ' at ', 'stack'].filter(s => res.text.includes(s));
      const ok =
        res.status === 503 && res.body?.code === 'AI_PROVIDER_BUSY' &&
        Object.keys(res.body).every(k => ['error', 'code', 'retryAfterSeconds'].includes(k)) &&
        leaks.length === 0 && !ROUTE_FIELDS.test(res.text);
      return { success: ok, details: `${res.status} ${res.text}; leaked: ${leaks.join(', ') || 'nothing'}` };
    });

    await assertTest(17, 'A three-day trip over HTTP: exactly three days, every stop one the AI was offered, no repeats, each day routed from the start', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: true });
      resetAll();
      modelReply = autoPlan(3, 2);
      const start = roundRouteStop(POINT_START);
      const res = await postPlan(
        httpBody({
          days: 3,
          start: { type: 'point', lat: POINT_START.lat, lon: POINT_START.lon, label: 'Our dharamshala' },
          interests: ['temples', 'history'],
          mode: 'driving',
        }),
      );
      const offered = modelCalls[0] ? promptCandidates(modelCalls[0]).map(c => c.id) : [];
      const schema: any = modelCalls[0]?.schema;
      const days: any[] = res.body?.days ?? [];
      const stops = days.flatMap(d => d.stops);
      const ids: string[] = stops.map(s => s.placeId);
      const ok =
        res.status === 200 &&
        res.body.dayCount === 3 && days.length === 3 && days.map(d => d.day).join() === '1,2,3' &&
        schema?.properties?.days?.minItems === 3 && schema.properties.days.maxItems === 3 &&
        /Return exactly 3 days/.test(modelCalls[0].systemInstruction) &&
        days.every(d => d.stops.length > 0 && typeof d.title === 'string') &&
        ids.length === 6 && new Set(ids).size === 6 &&
        ids.every(id => offered.includes(id)) &&
        offered.includes('node/8') && offered.every(id => [...TEMPLE_IDS, 'node/8'].includes(id)) &&
        stops.every(s => {
          const el = OSM_ELEMENTS.find(e => `${e.type}/${e.id}` === s.placeId)!;
          return s.lat === (el.lat ?? el.center!.lat) && s.lon === (el.lon ?? el.center!.lon) && (s.name === el.tags['name:en'] || s.name === el.tags.name);
        }) &&
        days.every(
          d =>
            d.route.status === 'ok' && d.route.route.mode === 'driving' &&
            d.route.route.stops.length === d.stops.length + 1 &&
            d.route.route.stops[0].lat === start.lat && d.route.route.stops[0].lon === start.lon,
        ) &&
        orsCalls.length === 3 && orsCalls.every(c => c.url.endsWith('/driving-car/geojson'));
      return {
        success: ok,
        details: `${res.status}; ${days.map(d => `day ${d.day}: ${d.stops.map((s: any) => s.name).join(' → ')}`).join(' | ')}; offered ${offered.length}`,
      };
    });

    await assertTest(18, 'Editing a day: no old route, spinner or error shows for changed stops, and undoing an edit made while a route was loading does not spin forever', async () => {
      const start = roundRouteStop(POINT_START);
      const a = { lat: 20.0069, lon: 73.7953 };
      const b = { lat: 20.0089, lon: 73.7962 };
      const c = { lat: 20.0071, lon: 73.793 };
      const before = dayRoutePoints(start, [a, b, c]);
      const after = dayRoutePoints(start, moveItem([a, b, c], 2, -1));
      const key = routeKey('walking', before);
      const route = { mode: 'walking', stops: before.map(roundRouteStop), distanceM: 2100, durationS: 1500 } as unknown as RouteResponse;
      const cache = new Map<string, RouteResponse>();
      const view = (points: typeof before, state: DayRouteState, mode: TravelMode = 'walking', routingConfigured = true) =>
        dayRouteView({ routingConfigured, points, mode, state }, k => cache.get(k));

      const ok: DayRouteState = { status: 'ok', key, data: route };
      const failed: DayRouteState = { status: 'error', key, code: 'ROUTE_NOT_FOUND', message: 'No route.', canRetry: false };
      const loading: DayRouteState = { status: 'loading', key, slow: false };
      const staleHidden =
        view(before, ok).kind === 'ok' &&
        view(after, ok).kind === 'outdated' &&
        view(after, failed).kind === 'outdated' &&
        view(after, loading).kind === 'outdated' &&
        view(dayRoutePoints(start, removeItem([a, b, c], 1)), ok).kind === 'outdated' &&
        view(before, ok, 'driving').kind === 'outdated' &&
        view(before, ok, 'walking', false).kind === 'not_configured' &&
        view(dayRoutePoints(null, [a]), { status: 'none' }).kind === 'too_few_stops';

      // The bug: a route was loading, a stop was moved (cancelling the
      // request), then moved back. The old loading state matched the stops
      // again, so the day showed a spinner for a request nobody was making,
      // and "Update route" never came back.
      const keptAsIs = view(before, loading).kind;
      const cleared = withoutPendingRoute(loading);
      const undone = view(before, cleared).kind;
      const undoneOk =
        keptAsIs === 'loading' && cleared.status === 'none' && undone === 'outdated' &&
        withoutPendingRoute(ok) === ok && withoutPendingRoute(failed) === failed;

      // A route already fetched in this visit for exactly these stops comes back from the cache.
      cache.set(key, route);
      const cachedView = view(before, { status: 'none' });
      const cacheOk = cachedView.kind === 'ok' && cachedView.route === route && view(after, { status: 'none' }).kind === 'outdated';

      // The panel really uses these: there is no UI test runner, so read its source.
      const source = readFileSync(new URL('../src/components/TripPlanner.tsx', import.meta.url), 'utf8');
      const bodyOf = (name: string) => {
        const at = source.indexOf(`const ${name} = `);
        return at < 0 ? '' : source.slice(at, source.indexOf('\n  };', at));
      };
      const wired =
        bodyOf('moveStop').includes('withoutPendingRoute(') &&
        bodyOf('removeStop').includes('withoutPendingRoute(') &&
        source.slice(source.indexOf('const viewOf = '), source.indexOf('const viewOf = ') + 300).includes('dayRouteView(');
      return {
        success: staleHidden && undoneOk && cacheOk && wired,
        details: `stale hidden: ${staleHidden}; undo after a cancelled load: ${keptAsIs} before the fix, ${undone} after; cache: ${cachedView.kind}; panel wired: ${wired}`,
      };
    });

    await assertTest(19, 'Cancelling: a plan nobody waits for stops before the AI and before routes; a second tab with the same plan still gets it', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: true });
      const problems: string[] = [];

      // Already cancelled: nothing is looked up.
      resetAll();
      const early = await errorOf(generateItinerary(AREA_REQUEST, AbortSignal.abort()));
      if (early?.code !== 'ITINERARY_CANCELLED' || overpassCalls.length !== 0) problems.push(`already cancelled: ${early?.code}, ${overpassCalls.length} lookups`);

      // Cancelled while places load: the lookup finishes and is cached for
      // others, but the AI is never asked and no route is made.
      resetAll();
      let releasePlaces = () => {};
      overpassReply = () => new Promise(resolve => (releasePlaces = () => resolve(json({ elements: OSM_ELEMENTS }))));
      modelReply = autoPlan(2, 2);
      const tab = new AbortController();
      const duringPlaces = errorOf(generateItinerary(AREA_REQUEST, tab.signal));
      await waitFor(() => overpassCalls.length === 1);
      tab.abort();
      const placesErr = await duringPlaces;
      await sleep(50);
      if (placesErr?.code !== 'ITINERARY_CANCELLED' || modelCalls.length !== 0) problems.push(`during places: ${placesErr?.code}, ${modelCalls.length} AI calls`);
      // Asked again while the cancelled plan still waits for places: a new
      // plan (sharing the same lookup), never the cancelled one.
      const again = generateItinerary(AREA_REQUEST).catch((err: GeoServiceError) => err);
      releasePlaces();
      const againPlan = await again;
      await sleep(100);
      const againDays = againPlan instanceof GeoServiceError ? againPlan.code : againPlan.days.length;
      // One AI call and two routes, all for the new plan: the cancelled one made none.
      if (againDays !== 2 || modelCalls.length !== 1 || orsCalls.length !== 2 || overpassCalls.length !== 1) {
        problems.push(`asking again: ${againDays} days, ${modelCalls.length} AI, ${orsCalls.length} route and ${overpassCalls.length} place calls`);
      }

      // Cancelled while the AI answers: its call is aborted and no route is made.
      resetAll();
      let releaseModel = () => {};
      const seen: { signal: AbortSignal | null } = { signal: null };
      modelReply = request => {
        seen.signal = request.signal;
        return new Promise(resolve => (releaseModel = () => resolve(autoPlan(2, 2)(request))));
      };
      const tab2 = new AbortController();
      const duringAi = errorOf(generateItinerary(AREA_REQUEST, tab2.signal));
      await waitFor(() => modelCalls.length === 1);
      tab2.abort();
      const aiErr = await duringAi;
      releaseModel();
      await sleep(100);
      if (aiErr?.code !== 'ITINERARY_CANCELLED' || seen.signal?.aborted !== true || orsCalls.length !== 0) {
        problems.push(`during AI: ${aiErr?.code}, model call aborted ${seen.signal?.aborted}, ${orsCalls.length} route calls`);
      }

      // Cancelled while days are routed: the day under way finishes, no later day is routed.
      resetAll();
      modelReply = () => planReply([['node/1', 'node/3'], ['way/4', 'node/13'], ['node/14', 'node/15']]);
      orsReply = (_u, init) => new Promise(resolve => setTimeout(() => resolve(echoRoute(init)), 200));
      const tab3 = new AbortController();
      const duringRoutes = errorOf(generateItinerary({ ...AREA_REQUEST, days: 3 }, tab3.signal));
      await waitFor(() => orsCalls.length === 1);
      tab3.abort();
      const routesErr = await duringRoutes;
      // Route calls are at least 1.5 s apart, so a second one would have started by now.
      await sleep(2000);
      if (routesErr?.code !== 'ITINERARY_CANCELLED' || orsCalls.length !== 1) {
        problems.push(`during routes: ${routesErr?.code}, ${orsCalls.length} route calls for 3 days`);
      }

      // Two tabs asked for the same trip: one leaves, the other still gets it, from one AI call.
      resetAll();
      modelReply = request => new Promise(resolve => setTimeout(() => resolve(autoPlan(2, 2)(request)), 50));
      const leavingTab = new AbortController();
      const leaving = errorOf(generateItinerary(AREA_REQUEST, leavingTab.signal));
      const staying = generateItinerary(AREA_REQUEST, new AbortController().signal);
      leavingTab.abort();
      const [leftErr, kept] = await Promise.all([leaving, staying]);
      if (leftErr?.code !== 'ITINERARY_CANCELLED' || kept.days.length !== 2 || !kept.days.every(d => d.route.status === 'ok') || modelCalls.length !== 1) {
        problems.push(`two tabs: ${leftErr?.code}, other got ${kept.days.length} days, ${modelCalls.length} AI calls`);
      }

      // Over HTTP: the browser cancels while places load, which closes the
      // connection, and the server never asks the AI.
      resetAll();
      overpassReply = () => new Promise(resolve => setTimeout(() => resolve(json({ elements: OSM_ELEMENTS })), 300));
      modelReply = autoPlan(2, 2);
      const browser = new AbortController();
      planPosts++;
      const posted = fetch(`${baseUrl}/api/itinerary/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(httpBody()),
        signal: browser.signal,
      }).then(
        () => 'answered',
        err => err?.name,
      );
      await waitFor(() => overpassCalls.length === 1);
      browser.abort();
      const outcome = await posted;
      await sleep(600);
      if (outcome !== 'AbortError' || modelCalls.length !== 0 || orsCalls.length !== 0) {
        problems.push(`HTTP: ${outcome}, ${modelCalls.length} AI and ${orsCalls.length} route calls after the browser left`);
      }

      return {
        success: problems.length === 0,
        details: problems.length ? problems.join('; ') : 'cancelled before places, during places, during the AI, during routes and over HTTP: no AI or new route call after cancelling; a shared plan survives one tab leaving',
      };
    });

    await assertTest(20, 'Limits: a body over 4 KB is 413 before anything runs; the 11th plan request in 10 minutes gets 429', async () => {
      configure({ gemini: FAKE_GEMINI_KEY, ors: false });
      resetAll();
      const big = await fetch(`${baseUrl}/api/itinerary/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...httpBody(), padding: 'x'.repeat(5000) }),
      });
      const bigBody: any = await big.json();
      let limited: Awaited<ReturnType<typeof postPlan>> | null = null;
      let limitedAt = 0;
      for (let i = 0; i < 12 && !limited; i++) {
        const r = await postPlan(httpBody({ days: 0 }));
        if (r.status === 429) {
          limited = r;
          limitedAt = planPosts;
        }
      }
      const ok =
        big.status === 413 && bigBody.code === 'PAYLOAD_TOO_LARGE' &&
        limited !== null && limitedAt === 11 && limited.body?.code === 'RATE_LIMIT_EXCEEDED' &&
        Number(limited.headers.get('retry-after')) > 0 &&
        modelCalls.length === 0 && overpassCalls.length === 0;
      return { success: ok, details: `${big.status} ${bigBody.code}; first 429 on plan request #${limitedAt}` };
    });
  } finally {
    server.close();
  }

  console.log('\n=================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log('=================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runItineraryTestSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
