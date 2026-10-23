import { readFileSync } from 'fs';
import http from 'http';
import app from '../server';
import { MOCK_TRANSPORT_OPTIONS, PICKUP_POINTS, DROP_POINTS, RIDE_POINT_AREAS } from '../src/data/kumbhData';
import { DEMO_DISTANCE_KM, MAX_ADVANCE_BOOKING_DAYS, areaOfPoint } from '../src/lib/fare';
import { RideEnd, RidePlace, estimateRide, rideDraftForMapPlace, rideDraftForTripStop, ridePlace } from '../src/lib/rides';
import { roundRouteStop } from '../src/lib/routing';
import { validateRideRequestBody } from '../server/middleware/validation';

process.env.NODE_ENV = 'test';

// Run with NODE_ENV=test set in the shell (see CLAUDE.md): the import above
// starts the server before the line above runs.
//
// /api/rides/* shares one rate limiter of 30 requests per minute per IP. This
// suite makes 27 such requests (scenarios 17-19 add 4); keep it under 30
// when adding scenarios. /api/transport/estimate is on the public limiter.
// Every place below is test data; no map or routing service is called.

/** Trip-plan and map places near Panchavati and in Trimbak (test data, OpenStreetMap-like). */
const KALARAM = { name: 'Kalaram Mandir', lat: 20.00698, lon: 73.79531 };
const RAMKUND = { name: 'Ramkund', lat: 20.0081, lon: 73.7926 };
const SITA_GUFA = { name: 'Sita Gufa', lat: 20.0089, lon: 73.7962 };
const TRIMBAK_TEMPLE = { name: 'Trimbakeshwar Temple', lat: 19.9325, lon: 73.5307 };

/** The points that are in Trimbakeshwar; every other demo point is in Nashik. */
const TRIMBAK_POINTS = [
  'Trimbakeshwar Temple Outer Gate',
  'Kushavarta Kund Bus Terminal',
  'Trimbakeshwar Jyotirlinga Mandir',
  'Kushavarta Kund (Trimbak)',
];

/** The old rule, kept to show what it got wrong: an end was in Trimbak only if its name said "Trimbak". */
const oldDistanceKm = (from: string, to: string) => (from.includes('Trimbak') !== to.includes('Trimbak') ? 28.5 : 8.4);

/** Runs the ride validator directly, so most bad-request cases do not spend the HTTP budget. */
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
  validateRideRequestBody({ body } as any, res, () => {
    passed = true;
  });
  return { status, code: payload?.code as string | undefined, passed, value: res.locals.rideRequest };
}

async function runRideRequestTestSuite() {
  console.log('=================================================================');
  console.log('NAMO YATRI RIDE REQUEST TEST SUITE (20 SCENARIOS)');
  console.log('=================================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let passed = 0;
  let failed = 0;

  async function assertTest(
    scenarioNum: number,
    name: string,
    fn: () => Promise<{ success: boolean; details?: string }>
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

  const TOURIST = 'Bearer TEST_TOKEN_VALID:ride_tourist:TOURIST:PENDING';
  const FROM = PICKUP_POINTS[0]; // Nashik Road Railway Station
  const TO = DROP_POINTS[1]; // Trimbakeshwar Jyotirlinga Mandir
  const shuttle = MOCK_TRANSPORT_OPTIONS.find(o => o.type === 'electric_shuttle')!;
  const auto = MOCK_TRANSPORT_OPTIONS.find(o => o.type === 'auto')!;

  /** POSTs a ride request. `body` is merged over a valid default request. */
  async function requestRide(body: Record<string, unknown>, authorization: string | null = TOURIST) {
    const res = await fetch(`${baseUrl}/api/rides/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({ from: FROM, to: TO, transportType: 'electric_shuttle', ...body }),
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  const inHours = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  try {
    // -------------------------------------------------------------
    // Test 1: Unauthenticated ride request → rejected
    // -------------------------------------------------------------
    await assertTest(1, 'Unauthenticated ride request is rejected (401)', async () => {
      const { status, body } = await requestRide({}, null);
      return {
        success: status === 401 && body.code === 'AUTH_TOKEN_MISSING',
        details: `Status: ${status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 2: Every ride type the app offers can be requested
    // -------------------------------------------------------------
    await assertTest(2, 'Every transport type in the catalogue is accepted (200)', async () => {
      const outcomes: string[] = [];
      let allOk = true;
      for (const option of MOCK_TRANSPORT_OPTIONS) {
        const { status, body } = await requestRide({ transportType: option.type });
        const ok = status === 200 && body.success === true && body.booking?.transportType === option.type;
        allOk = allOk && ok;
        outcomes.push(`${option.type}=${status}`);
      }
      return { success: allOk, details: outcomes.join(', ') };
    });

    // -------------------------------------------------------------
    // Test 3: A recorded request is never presented as dispatched
    // -------------------------------------------------------------
    await assertTest(3, 'A new ride is recorded as requested and not dispatched', async () => {
      const { status, body } = await requestRide({});
      return {
        success:
          status === 200 &&
          body.booking?.status === 'requested' &&
          body.booking?.dispatchStatus === 'DEMO_NOT_DISPATCHED' &&
          body.booking?.sourceType === 'DEMO' &&
          !body.booking?.driverId,
        details: `Status: ${body.booking?.status}, Dispatch: ${body.booking?.dispatchStatus}`,
      };
    });

    // -------------------------------------------------------------
    // Test 4: The server sets the fare and ignores the client's
    // -------------------------------------------------------------
    await assertTest(4, 'Client-supplied fare and travel time are ignored; the server computes them', async () => {
      const { status, body } = await requestRide({ estimatedFare: 1, estimatedTimeMins: 1 });
      const expected = estimateRide(shuttle, FROM, TO)!;

      const quoteRes = await fetch(`${baseUrl}/api/transport/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: TO, transportType: 'electric_shuttle' }),
      });
      const quote: any = await quoteRes.json();

      return {
        success:
          status === 200 &&
          body.booking?.estimatedFare === expected.estimatedFare &&
          body.booking?.estimatedTimeMins === expected.estimatedTimeMins &&
          body.booking?.fareBasis === 'DEMO_ESTIMATE' &&
          quoteRes.status === 200 &&
          quote.estimatedFareInr === expected.estimatedFare,
        details: `Sent fare 1, stored ${body.booking?.estimatedFare}, expected ${expected.estimatedFare}, quote ${quote.estimatedFareInr}`,
      };
    });

    // -------------------------------------------------------------
    // Test 5: Unsupported or missing ride type → rejected
    // -------------------------------------------------------------
    await assertTest(5, 'Unsupported and missing transport types are rejected (400)', async () => {
      const legacy = await requestRide({ transportType: 'rickshaw' });
      const missing = await requestRide({ transportType: undefined });
      return {
        success:
          legacy.status === 400 && legacy.body.code === 'INVALID_TRANSPORT_TYPE' &&
          missing.status === 400 && missing.body.code === 'INVALID_TRANSPORT_TYPE',
        details: `rickshaw: ${legacy.status} ${legacy.body.code}; missing: ${missing.status} ${missing.body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 6: Pickup and drop must come from the offered points
    // -------------------------------------------------------------
    await assertTest(6, 'Unknown pickup and drop points are rejected (400)', async () => {
      const badFrom = await requestRide({ from: 'Somewhere Else' });
      const badTo = await requestRide({ to: FROM }); // a pickup point, not a drop point
      return {
        success:
          badFrom.status === 400 && badFrom.body.code === 'INVALID_PICKUP_POINT' &&
          badTo.status === 400 && badTo.body.code === 'INVALID_DROP_POINT',
        details: `from: ${badFrom.status} ${badFrom.body.code}; to: ${badTo.status} ${badTo.body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 7: Passenger count and departure time are kept
    // -------------------------------------------------------------
    await assertTest(7, 'Passenger count and scheduled departure are stored', async () => {
      const departAt = inHours(2);
      const { status, body } = await requestRide({ passengers: 3, departAt });
      return {
        success: status === 200 && body.booking?.passengers === 3 && body.booking?.departAt === departAt,
        details: `Passengers: ${body.booking?.passengers}, departAt: ${body.booking?.departAt}`,
      };
    });

    // -------------------------------------------------------------
    // Test 8: Omitted fields default to one passenger, leaving now
    // -------------------------------------------------------------
    await assertTest(8, 'Omitted passengers and departAt default to 1 and "leave now"', async () => {
      const { status, body } = await requestRide({});
      return {
        success: status === 200 && body.booking?.passengers === 1 && body.booking?.departAt === null,
        details: `Passengers: ${body.booking?.passengers}, departAt: ${body.booking?.departAt}`,
      };
    });

    // -------------------------------------------------------------
    // Test 9: Invalid passenger counts → rejected
    // -------------------------------------------------------------
    await assertTest(9, 'Invalid passenger counts are rejected (400)', async () => {
      const results = await Promise.all([0, 7, '2'].map(passengers => requestRide({ passengers })));
      return {
        success: results.every(r => r.status === 400 && r.body.code === 'INVALID_PASSENGER_COUNT'),
        details: results.map(r => `${r.status} ${r.body.code}`).join('; '),
      };
    });

    // -------------------------------------------------------------
    // Test 10: More passengers than the vehicle seats → rejected
    // -------------------------------------------------------------
    await assertTest(10, 'More passengers than the ride type seats is rejected (400)', async () => {
      const { status, body } = await requestRide({ transportType: 'auto', passengers: auto.capacity + 1 });
      return {
        success: status === 400 && body.code === 'PASSENGERS_EXCEED_CAPACITY',
        details: `Status: ${status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 11: Invalid departure times → rejected
    // -------------------------------------------------------------
    await assertTest(11, 'Past, too-distant and malformed departure times are rejected (400)', async () => {
      const past = await requestRide({ departAt: inHours(-1) });
      const tooFar = await requestRide({ departAt: inHours((MAX_ADVANCE_BOOKING_DAYS + 1) * 24) });
      const garbage = await requestRide({ departAt: 'tomorrow-ish' });
      return {
        success:
          past.status === 400 && past.body.code === 'DEPARTURE_IN_PAST' &&
          tooFar.status === 400 && tooFar.body.code === 'DEPARTURE_TOO_FAR' &&
          garbage.status === 400 && garbage.body.code === 'INVALID_DEPARTURE_TIME',
        details: `past: ${past.body.code}; too far: ${tooFar.body.code}; malformed: ${garbage.body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 12: Suspended account → rejected
    // -------------------------------------------------------------
    await assertTest(12, 'Suspended account cannot request a ride (403)', async () => {
      const { status, body } = await requestRide({}, 'Bearer TEST_TOKEN_VALID:suspended_user:TOURIST:SUSPENDED');
      return {
        success: status === 403 && body.code === 'ACCOUNT_SUSPENDED',
        details: `Status: ${status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 13: Ride is bound to the caller and hidden from others
    // -------------------------------------------------------------
    await assertTest(13, 'Ride ignores body userId and is hidden from other users (IDOR, 403)', async () => {
      const { body } = await requestRide({ userId: 'victim_user' });
      const rideId = body.booking?.id;
      const res = await fetch(`${baseUrl}/api/rides/${rideId}`, {
        headers: { Authorization: 'Bearer TEST_TOKEN_VALID:ride_snooper:TOURIST:PENDING' },
      });
      const snoop: any = await res.json();
      return {
        success:
          body.booking?.userId === 'ride_tourist' &&
          res.status === 403 && snoop.code === 'RIDE_ACCESS_DENIED',
        details: `Stored owner: ${body.booking?.userId}; other user: ${res.status} ${snoop.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 14: Malformed JSON → clear 400, not a 500-style error
    // -------------------------------------------------------------
    await assertTest(14, 'Malformed JSON body is rejected with a clear code (400)', async () => {
      const res = await fetch(`${baseUrl}/api/rides/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: TOURIST },
        body: '{"from": ',
      });
      const body: any = await res.json();
      return {
        success: res.status === 400 && body.code === 'INVALID_JSON_BODY',
        details: `Status: ${res.status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 15: Areas come from data, not from the wording of a name
    // -------------------------------------------------------------
    await assertTest(15, 'Demo distances by area: the old "Trimbak in the name" rule is fixed for every pickup/drop pair', async () => {
      const wrong: string[] = [];
      let oldMistakes = 0;
      for (const from of PICKUP_POINTS) {
        for (const to of DROP_POINTS) {
          const fromT = TRIMBAK_POINTS.includes(from);
          const toT = TRIMBAK_POINTS.includes(to);
          const expected = fromT !== toT ? DEMO_DISTANCE_KM.between : fromT ? DEMO_DISTANCE_KM.withinTrimbakeshwar : DEMO_DISTANCE_KM.withinNashik;
          const got = estimateRide(auto, from, to)?.distanceKm;
          if (got !== expected) wrong.push(`${from} → ${to}: ${got} (expected ${expected})`);
          if (oldDistanceKm(from, to) !== expected) oldMistakes++;
        }
      }
      const km = (from: string, to: string) => estimateRide(auto, from, to)?.distanceKm;
      const auditCases =
        km('Kushavarta Kund Bus Terminal', 'Ramkund Holy Bathing Ghat') === 28.5 && // old rule: 8.4
        km('Kushavarta Kund Bus Terminal', 'Kushavarta Kund (Trimbak)') === 3 && // old rule: 28.5
        km('Kushavarta Kund Bus Terminal', 'Trimbakeshwar Jyotirlinga Mandir') === 3 && // old rule: 28.5
        km('Trimbakeshwar Temple Outer Gate', 'Trimbakeshwar Jyotirlinga Mandir') === 3 && // old rule: 8.4
        km('Nashik Road Railway Station', 'Trimbakeshwar Jyotirlinga Mandir') === 28.5 &&
        km('Nashik Road Railway Station', 'Ramkund Holy Bathing Ghat') === 8.4;
      const everyPointHasArea = [...PICKUP_POINTS, ...DROP_POINTS].every(p => RIDE_POINT_AREAS[p] === (TRIMBAK_POINTS.includes(p) ? 'trimbakeshwar' : 'nashik'));
      const placesByPosition =
        areaOfPoint(KALARAM) === 'nashik' && areaOfPoint(TRIMBAK_TEMPLE) === 'trimbakeshwar' &&
        estimateRide(auto, ridePlace({ label: RAMKUND.name, point: RAMKUND, kind: 'place' }), 'Kushavarta Kund (Trimbak)')?.distanceKm === 28.5 &&
        estimateRide(auto, 'Trimbakeshwar Temple Outer Gate', ridePlace({ label: TRIMBAK_TEMPLE.name, point: TRIMBAK_TEMPLE, kind: 'sample' }))?.distanceKm === 3;
      return {
        success: wrong.length === 0 && auditCases && everyPointHasArea && placesByPosition && oldMistakes === 10,
        details: wrong.length
          ? wrong.slice(0, 4).join('; ')
          : `64 pairs priced by area; the old rule mispriced ${oldMistakes} of them, including the 4 audit cases`,
      };
    });

    // -------------------------------------------------------------
    // Test 16: The estimate follows the ends, and the server agrees
    // -------------------------------------------------------------
    await assertTest(16, 'Changing either end recalculates the estimate; none until both ends are chosen; the server quote matches the form', async () => {
      const kalaram = ridePlace({ label: KALARAM.name, point: KALARAM, kind: 'place' });
      const trimbak = ridePlace({ label: TRIMBAK_TEMPLE.name, point: TRIMBAK_TEMPLE, kind: 'sample' });
      const a = estimateRide(auto, 'Panchavati Central Circle', kalaram);
      const b = estimateRide(auto, 'Panchavati Central Circle', trimbak); // destination changed
      const c = estimateRide(auto, 'Kushavarta Kund Bus Terminal', trimbak); // then the pickup
      const recalculates =
        a?.distanceKm === 8.4 && b?.distanceKm === 28.5 && c?.distanceKm === 3 &&
        a.estimatedFare !== b.estimatedFare && b.estimatedFare !== c.estimatedFare &&
        estimateRide(auto, 'Panchavati Central Circle', null) === null &&
        estimateRide(auto, null, kalaram) === null &&
        estimateRide(auto, 'Not a demo point', kalaram) === null;

      const pairs: [RideEnd, RideEnd][] = [
        [FROM, TO],
        ['Kushavarta Kund Bus Terminal', 'Ramkund Holy Bathing Ghat'],
        ['Panchavati Central Circle', kalaram],
        [ridePlace({ label: RAMKUND.name, point: RAMKUND, kind: 'place' }), trimbak],
      ];
      const mismatches: string[] = [];
      for (const [from, to] of pairs) {
        const res = await fetch(`${baseUrl}/api/transport/estimate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to, transportType: 'cab' }),
        });
        const quote: any = await res.json();
        const local = estimateRide(MOCK_TRANSPORT_OPTIONS.find(o => o.type === 'cab')!, from, to)!;
        if (res.status !== 200 || quote.estimatedFareInr !== local.estimatedFare || quote.distanceKm !== local.distanceKm || quote.distanceBasis !== 'DEMO_AREA_DISTANCE') {
          mismatches.push(`${typeof from === 'string' ? from : from.label}: ${res.status} ${quote.estimatedFareInr} vs ${local.estimatedFare}`);
        }
      }
      return {
        success: recalculates && mismatches.length === 0,
        details: mismatches.length ? mismatches.join('; ') : `auto: ₹${a?.estimatedFare} → ₹${b?.estimatedFare} → ₹${c?.estimatedFare}; ${pairs.length} server quotes match`,
      };
    });

    // -------------------------------------------------------------
    // Test 17: From a trip-plan stop
    // -------------------------------------------------------------
    await assertTest(17, 'From a trip stop: the stop is the destination, the stop before it the pickup; recorded, server-priced, not dispatched', async () => {
      const day = { day: 2, stops: [RAMKUND, KALARAM, SITA_GUFA] };
      const third = rideDraftForTripStop({ start: null, startKind: null, ...day }, 2)!;
      const firstFromPlace = rideDraftForTripStop({ start: { ...TRIMBAK_TEMPLE, label: 'Our dharamshala' }, startKind: 'sample', ...day }, 0)!;
      const firstFromUser = rideDraftForTripStop({ start: { ...KALARAM, label: 'Your location' }, startKind: 'user', ...day }, 0)!;
      const firstFromArea = rideDraftForTripStop({ start: null, startKind: null, ...day }, 0)!;
      const drafts =
        third.to.label === 'Sita Gufa' && third.to.lat === SITA_GUFA.lat && third.to.source === 'openstreetmap' && !third.to.approximate &&
        third.from?.label === 'Kalaram Mandir' &&
        third.origin.kind === 'trip' && third.origin.day === 2 && third.origin.stopNumber === 3 && third.origin.pickup === 'previous_stop' &&
        firstFromPlace.from?.label === 'Our dharamshala' && firstFromPlace.from.approximate && (firstFromPlace.origin as any).pickup === 'trip_start' &&
        firstFromUser.from === null && (firstFromUser.origin as any).pickup === 'none' && // a remembered location may be out of date
        firstFromArea.from === null &&
        rideDraftForTripStop({ start: null, startKind: null, ...day }, 5) === null;

      // What the ride form then sends, with a fare the server must ignore.
      const { status, body } = await requestRide({ from: third.from, to: third.to, transportType: 'auto', estimatedFare: 1 });
      const expected = estimateRide(auto, third.from, third.to)!;
      const sita = roundRouteStop(SITA_GUFA);
      const b = body.booking;
      const recorded =
        status === 200 &&
        b?.fromLocation === 'Kalaram Mandir' && b.toLocation === 'Sita Gufa' &&
        b.toPlace?.lat === sita.lat && b.toPlace.lon === sita.lon && b.toPlace.approximate === false && b.fromPlace?.source === 'openstreetmap' &&
        b.estimatedFare === expected.estimatedFare && b.distanceKm === 8.4 && b.distanceBasis === 'DEMO_AREA_DISTANCE' &&
        b.fromArea === 'nashik' && b.toArea === 'nashik' &&
        b.status === 'requested' && b.dispatchStatus === 'DEMO_NOT_DISPATCHED' && !b.driverId &&
        body.notice === 'Demo request recorded. No driver or vehicle has been dispatched.';
      return {
        success: drafts && recorded,
        details: `${status}: ${b?.fromLocation} → ${b?.toLocation}, ₹${b?.estimatedFare} (sent ₹1), ${b?.status}/${b?.dispatchStatus}; drafts ok: ${drafts}`,
      };
    });

    // -------------------------------------------------------------
    // Test 18: From a map place, including an approximate sample site
    // -------------------------------------------------------------
    await assertTest(18, 'From a map place: the place is the destination and the pickup is left to choose; a sample site stays approximate', async () => {
      const live = ridePlace({ label: KALARAM.name, point: KALARAM, kind: 'place' });
      const sample = ridePlace({ label: 'Trimbakeshwar Jyotirlinga (sample)', point: TRIMBAK_TEMPLE, kind: 'sample' });
      const draft = rideDraftForMapPlace(sample);
      const drafts =
        live.source === 'openstreetmap' && !live.approximate &&
        sample.source === 'sample' && sample.approximate &&
        draft.from === null && draft.to === sample && draft.origin.kind === 'map';

      // A sample site sent as exact is still stored as approximate.
      const toSample = await requestRide({ from: 'Nashik Road Railway Station', to: { ...sample, approximate: false } });
      // A fixed point has no position, and the old rule's worst case is now a short Trimbak trip.
      const trimbakHop = await requestRide({ from: 'Kushavarta Kund Bus Terminal', to: 'Kushavarta Kund (Trimbak)' });
      const a = toSample.body.booking;
      const t = trimbakHop.body.booking;
      const ok =
        toSample.status === 200 && a?.toPlace?.approximate === true && a.toPlace.source === 'sample' && a.fromPlace === null &&
        a.distanceKm === 28.5 && a.fromArea === 'nashik' && a.toArea === 'trimbakeshwar' &&
        trimbakHop.status === 200 && t?.distanceKm === 3 && t.fromPlace === null && t.toPlace === null &&
        t.estimatedFare === estimateRide(shuttle, 'Kushavarta Kund Bus Terminal', 'Kushavarta Kund (Trimbak)')!.estimatedFare;
      return {
        success: drafts && ok,
        details: `sample stored approximate: ${a?.toPlace?.approximate}, ${a?.distanceKm} km; Kushavarta terminal → Kushavarta Kund: ${t?.distanceKm} km (old rule 28.5)`,
      };
    });

    // -------------------------------------------------------------
    // Test 19: Bad places are refused
    // -------------------------------------------------------------
    await assertTest(19, 'Missing, bad or out-of-area coordinates, nameless or unknown places, and the same place twice are refused (400)', async () => {
      const kalaram: RidePlace = ridePlace({ label: KALARAM.name, point: KALARAM, kind: 'place' });
      const base = { from: 'Panchavati Central Circle', to: kalaram, transportType: 'auto' };
      const cases: [Record<string, unknown>, string][] = [
        [{ to: { label: 'Kalaram Mandir', source: 'openstreetmap' } }, 'INVALID_COORDINATES'], // no coordinates at all
        [{ to: { ...kalaram, lat: '20.0' } }, 'INVALID_COORDINATES'],
        [{ to: { ...kalaram, lon: null } }, 'INVALID_COORDINATES'],
        [{ to: { ...kalaram, lat: 19.076, lon: 72.8777 } }, 'OUTSIDE_SERVICE_AREA'], // Mumbai
        [{ to: { ...kalaram, label: '   ' } }, 'INVALID_DROP_POINT'],
        [{ to: { ...kalaram, label: 'x'.repeat(121) } }, 'INVALID_DROP_POINT'],
        [{ to: { ...kalaram, source: 'google' } }, 'INVALID_DROP_POINT'],
        [{ to: [kalaram] }, 'INVALID_DROP_POINT'],
        [{ from: { ...kalaram, source: undefined } }, 'INVALID_PICKUP_POINT'],
        [{ from: kalaram }, 'SAME_PICKUP_AND_DROP'],
        [{ from: { ...kalaram, label: 'Kalaram', lat: KALARAM.lat + 0.00001 } }, 'SAME_PICKUP_AND_DROP'], // same spot to ~11 m
        [{ transportType: 'helicopter' }, 'INVALID_TRANSPORT_TYPE'],
      ];
      const wrong = cases
        .map(([override, code]) => ({ code, got: validate({ ...base, ...override }) }))
        .filter(({ code, got }) => got.status !== 400 || got.code !== code || got.passed);
      const good = validate({ ...base, to: { ...kalaram, label: '  Kalaram\u0007 Mandir ', approximate: 'yes', fare: 1 } });
      // And once over HTTP, to prove the checks are on the route.
      const viaHttp = await requestRide({ from: 'Panchavati Central Circle', to: { ...kalaram, lat: 19.076, lon: 72.8777 } });
      const ok =
        wrong.length === 0 &&
        good.passed && good.value?.to.label === 'Kalaram Mandir' && good.value.to.place.approximate === false &&
        good.value.to.place.lat === roundRouteStop(KALARAM).lat && !('fare' in good.value.to.place) &&
        viaHttp.status === 400 && viaHttp.body.code === 'OUTSIDE_SERVICE_AREA';
      return {
        success: ok,
        details: wrong.length ? wrong.map(w => `${w.code} got ${w.got.status} ${w.got.code}`).join('; ') : `${cases.length} bad requests refused; HTTP ${viaHttp.status} ${viaHttp.body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 20: The screens use the shared code and never claim a booking
    // -------------------------------------------------------------
    await assertTest(20, 'Screens: the map and trip plan hand over through the shared code, the form estimates live, and nothing claims a booked ride or a sent driver', async () => {
      // There is no UI test runner, so read the sources.
      const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
      const map = read('src/views/MapScreen.tsx');
      const tripPlanner = read('src/components/TripPlanner.tsx');
      const form = read('src/components/RideBookingCard.tsx');
      const panel = read('src/components/RideRequestPanel.tsx');
      const travel = read('src/views/TravelScreen.tsx');
      const wired =
        map.includes('rideDraftForMapPlace(') && map.includes('Request a ride here (demo)') &&
        (map.match(/rideButton\(ridePlace\(/g) ?? []).length === 3 && // live, sample and search results
        tripPlanner.includes('rideDraftForTripStop(') && tripPlanner.includes('Request a ride (demo)') &&
        /estimateRide\(activeOption, from \|\| null, to \|\| null\)[\s\S]{0,40}\[activeOption, from, to\]/.test(form) &&
        travel.includes('Back to trip plan') && travel.includes('Show on map') &&
        panel.includes('Demo request recorded') && panel.includes('No driver or vehicle has been dispatched');
      const claims = [
        /ride (is |has been )?(booked|confirmed)/i,
        /booking (is )?confirmed/i,
        /driver (is )?(on (the|his|her) way|coming|assigned to you)/i,
        /\bbook now\b/i,
        /your (cab|auto|ride) (will arrive|is arriving)/i,
      ];
      const found = Object.entries({ map, tripPlanner, form, panel, travel }).flatMap(([file, text]) =>
        claims.filter(c => c.test(text)).map(c => `${file}: ${c}`),
      );
      return {
        success: wired && found.length === 0,
        details: found.length ? `claims found: ${found.join('; ')}` : `wired: ${wired}; no booking or dispatch claims in 5 files`,
      };
    });

  } finally {
    server.close();
  }

  console.log('\n=================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log('=================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runRideRequestTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
