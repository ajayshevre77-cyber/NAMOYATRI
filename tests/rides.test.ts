import http from 'http';
import app from '../server';
import { MOCK_TRANSPORT_OPTIONS, PICKUP_POINTS, DROP_POINTS } from '../src/data/kumbhData';
import { estimateTrip, MAX_ADVANCE_BOOKING_DAYS } from '../src/lib/fare';

process.env.NODE_ENV = 'test';

// Run with NODE_ENV=test set in the shell (see CLAUDE.md): the import above
// starts the server before the line above runs.
//
// /api/rides/* shares one rate limiter of 30 requests per minute per IP. This
// suite makes 23 such requests; keep it under 30 when adding scenarios.

async function runRideRequestTestSuite() {
  console.log('=================================================================');
  console.log('NAMO YATRI RIDE REQUEST TEST SUITE (14 SCENARIOS)');
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
      const expected = estimateTrip(shuttle, FROM, TO);

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
