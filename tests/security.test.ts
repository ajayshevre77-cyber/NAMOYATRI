import http from 'http';
import { readFileSync } from 'fs';
import app from '../server';

process.env.NODE_ENV = 'test';

async function runSecurityTestSuite() {
  console.log('=================================================================');
  console.log('NAMO YATRI SECURITY HARDENING TEST SUITE (17 SCENARIOS)');
  console.log('=================================================================\n');

  // Start ephemeral server
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

  try {
    // -------------------------------------------------------------
    // Test 1: Unauthenticated user calling protected API → rejected
    // -------------------------------------------------------------
    await assertTest(1, 'Unauthenticated user calling protected API is rejected (401)', async () => {
      const res = await fetch(`${baseUrl}/api/passes/my-passes`);
      const body: any = await res.json();
      return {
        success: res.status === 401 && body.code === 'AUTH_TOKEN_MISSING',
        details: `Status: ${res.status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 2: Invalid Firebase token → rejected
    // -------------------------------------------------------------
    await assertTest(2, 'Invalid Firebase token is rejected (401)', async () => {
      const res = await fetch(`${baseUrl}/api/passes/my-passes`, {
        headers: { Authorization: 'Bearer TEST_TOKEN_INVALID:fake_user:tourist' },
      });
      const body: any = await res.json();
      return {
        success: res.status === 401 && body.code === 'AUTH_TOKEN_INVALID',
        details: `Status: ${res.status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 3: Expired Firebase token → rejected
    // -------------------------------------------------------------
    await assertTest(3, 'Expired Firebase token is rejected (401)', async () => {
      const res = await fetch(`${baseUrl}/api/passes/my-passes`, {
        headers: { Authorization: 'Bearer TEST_TOKEN_EXPIRED:user_old:tourist' },
      });
      const body: any = await res.json();
      return {
        success: res.status === 401 && body.code === 'AUTH_TOKEN_EXPIRED',
        details: `Status: ${res.status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 4: TOURIST calling ADMIN endpoint → rejected
    // -------------------------------------------------------------
    await assertTest(4, 'TOURIST role calling ADMIN endpoint is rejected (403)', async () => {
      const res = await fetch(`${baseUrl}/api/admin/metrics`, {
        headers: { Authorization: 'Bearer TEST_TOKEN_VALID:tourist_bob:TOURIST:VERIFIED' },
      });
      const body: any = await res.json();
      return {
        success: res.status === 403 && body.code === 'INSUFFICIENT_PERMISSIONS',
        details: `Status: ${res.status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 5: TOURIST attempting role=ADMIN payload → rejected
    // -------------------------------------------------------------
    await assertTest(5, 'Client payload attempting to self-assign role=ADMIN is rejected (400)', async () => {
      const res = await fetch(`${baseUrl}/api/users/me/profile`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: 'Bearer TEST_TOKEN_VALID:tourist_attacker:TOURIST:VERIFIED',
        },
        body: JSON.stringify({ role: 'ADMIN', displayName: 'Attacker' }),
      });
      const body: any = await res.json();
      return {
        success: res.status === 400 && body.code === 'FORBIDDEN_FIELD_MODIFICATION',
        details: `Status: ${res.status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 6: User A accessing User B's private pass → rejected
    // -------------------------------------------------------------
    await assertTest(6, "User A accessing User B's private resource (IDOR) is rejected (403)", async () => {
      // User B purchases a pass
      const purchaseRes = await fetch(`${baseUrl}/api/passes/purchase`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: 'Bearer TEST_TOKEN_VALID:user_b:TOURIST:VERIFIED',
        },
        body: JSON.stringify({ passType: '1_day', userName: 'User B' }),
      });
      const purchaseBody: any = await purchaseRes.json();
      const userBPassId = purchaseBody.pass.id;

      // User A attempts to read User B's pass
      const attackerRes = await fetch(`${baseUrl}/api/passes/${userBPassId}`, {
        headers: { Authorization: 'Bearer TEST_TOKEN_VALID:user_a:TOURIST:VERIFIED' },
      });
      const attackerBody: any = await attackerRes.json();

      return {
        success: attackerRes.status === 403 && attackerBody.code === 'PASS_ACCESS_DENIED',
        details: `Status: ${attackerRes.status}, Code: ${attackerBody.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 7: Driver accessing another driver's assigned ride → rejected
    // -------------------------------------------------------------
    await assertTest(7, "Driver attempting to update another driver's ride is rejected (403)", async () => {
      // Ride bk_001 is assigned to driverId 'drv_01'
      const res = await fetch(`${baseUrl}/api/driver/rides/bk_001/status`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: 'Bearer TEST_TOKEN_VALID:drv_other_99:DRIVER:VERIFIED',
        },
        body: JSON.stringify({ status: 'completed' }),
      });
      const body: any = await res.json();
      return {
        success: res.status === 403 && body.code === 'DRIVER_DISPATCH_MISMATCH',
        details: `Status: ${res.status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 8: Volunteer accessing another volunteer's private data → rejected
    // -------------------------------------------------------------
    await assertTest(8, "Volunteer accessing another user's private data (IDOR) is rejected (403)", async () => {
      const res = await fetch(`${baseUrl}/api/users/vol_target_user`, {
        headers: { Authorization: 'Bearer TEST_TOKEN_VALID:vol_attacker:VOLUNTEER:VERIFIED' },
      });
      const body: any = await res.json();
      return {
        success: res.status === 403 && body.code === 'IDOR_ACCESS_DENIED',
        details: `Status: ${res.status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 9: Client attempting to modify verificationStatus → rejected
    // -------------------------------------------------------------
    await assertTest(9, 'Client attempting to modify verificationStatus is rejected (400)', async () => {
      const res = await fetch(`${baseUrl}/api/users/me/profile`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: 'Bearer TEST_TOKEN_VALID:unverified_driver:DRIVER:PENDING',
        },
        body: JSON.stringify({ verificationStatus: 'VERIFIED' }),
      });
      const body: any = await res.json();
      return {
        success: res.status === 400 && body.code === 'FORBIDDEN_FIELD_MODIFICATION',
        details: `Status: ${res.status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 10: Client attempting to tamper with auditLogs → rejected
    // -------------------------------------------------------------
    await assertTest(10, 'Client attempting to mutate or purge audit logs is rejected (405)', async () => {
      const res = await fetch(`${baseUrl}/api/admin/audit-logs/tamper`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: 'Bearer TEST_TOKEN_VALID:rogue_user:ADMIN:VERIFIED',
        },
        body: JSON.stringify({ clear: true }),
      });
      const body: any = await res.json();
      return {
        success: res.status === 405 && body.code === 'AUDIT_LOG_IMMUTABLE',
        details: `Status: ${res.status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 11: Guest listing "your passes" gets nobody else's pass
    // -------------------------------------------------------------
    await assertTest(11, 'Guest calling /api/passes/user-passes receives no passes (no seeded demo pass leak)', async () => {
      const res = await fetch(`${baseUrl}/api/passes/user-passes`);
      const body: any = await res.json();
      return {
        success: res.status === 200 && Array.isArray(body.passes) && body.passes.length === 0,
        details: `Status: ${res.status}, Passes returned: ${body.passes?.length}`,
      };
    });

    // -------------------------------------------------------------
    // Test 12: User A listing passes never sees User B's pass
    // -------------------------------------------------------------
    await assertTest(12, "User A's pass list excludes User B's pass", async () => {
      const purchaseRes = await fetch(`${baseUrl}/api/passes/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer TEST_TOKEN_VALID:list_owner_b:TOURIST:VERIFIED',
        },
        body: JSON.stringify({ passType: '1_day', userName: 'Owner B' }),
      });
      const purchaseBody: any = await purchaseRes.json();
      const passId = purchaseBody.pass?.id;

      const listAs = async (uid: string) => {
        const res = await fetch(`${baseUrl}/api/passes/user-passes`, {
          headers: { Authorization: `Bearer TEST_TOKEN_VALID:${uid}:TOURIST:VERIFIED` },
        });
        const body: any = await res.json();
        return { status: res.status, ids: (body.passes ?? []).map((p: any) => p.id) as string[] };
      };
      const owner = await listAs('list_owner_b');
      const other = await listAs('list_other_a');

      return {
        success:
          Boolean(passId) &&
          owner.status === 200 && owner.ids.includes(passId) &&
          other.status === 200 && other.ids.length === 0,
        details: `Owner sees own pass: ${owner.ids.includes(passId)}, other user sees ${other.ids.length} passes`,
      };
    });

    // -------------------------------------------------------------
    // Test 13: Pass verification without the token is rejected
    // -------------------------------------------------------------
    await assertTest(13, 'Pass verification with a reference number but no token is rejected (400)', async () => {
      const res = await fetch(`${baseUrl}/api/passes/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passRefNumber: 'NY-KM27-8942-X' }),
      });
      const body: any = await res.json();
      return {
        success: res.status === 400 && body.code === 'PASS_TOKEN_REQUIRED' && body.userName === undefined,
        details: `Status: ${res.status}, Code: ${body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 14: Wrong token reveals nothing about the pass holder
    // -------------------------------------------------------------
    await assertTest(14, 'Pass verification with a wrong token is rejected like an unknown pass (404)', async () => {
      const verify = async (passRefNumber: string) => {
        const res = await fetch(`${baseUrl}/api/passes/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passRefNumber, tokenHash: 'WRONG_TOKEN' }),
        });
        return { status: res.status, body: (await res.json()) as any };
      };
      const known = await verify('NY-KM27-8942-X');
      const unknown = await verify('NY-KM27-0000-Z');

      return {
        success:
          known.status === 404 && known.body.code === 'PASS_NOT_FOUND' &&
          known.body.userName === undefined &&
          unknown.status === known.status && unknown.body.reason === known.body.reason,
        details: `Known ref: ${known.status} ${known.body.code}; unknown ref: ${unknown.status} ${unknown.body.code}`,
      };
    });

    // -------------------------------------------------------------
    // Test 15: SOS needs no account. The sign-in popup tells pilgrims so;
    // if this ever changes, that copy must change with it.
    // -------------------------------------------------------------
    await assertTest(15, 'Guest without a token can file an SOS report (200)', async () => {
      const res = await fetch(`${baseUrl}/api/safety/emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'sos_panic' }),
      });
      const body: any = await res.json();
      return {
        success:
          res.status === 200 && body.success === true &&
          body.emergencyCase?.userId === 'GUEST_EMERGENCY_REPORTER',
        details: `Status: ${res.status}, reporter: ${body.emergencyCase?.userId}`,
      };
    });

    // -------------------------------------------------------------
    // Test 16: The SOS API never claims emergency dispatch. No DEOC, police
    // or ambulance integration exists, so a report is only recorded.
    // Checks a new report and the seeded sample case.
    // -------------------------------------------------------------
    await assertTest(16, 'SOS API responses record a demo report and never claim dispatch', async () => {
      const DISPATCH_CLAIMS = /dispatched_to_deoc|deoc|queued to|logged to|forwarded to|field_unit|help is on the way/i;
      const NOT_NOTIFIED = 'Emergency services have NOT been notified';

      const res = await fetch(`${baseUrl}/api/safety/emergency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'medical', description: 'test report' }),
      });
      const body: any = await res.json();
      const created = body.emergencyCase ?? {};

      const listRes = await fetch(`${baseUrl}/api/safety/emergency-cases`, {
        headers: { Authorization: 'Bearer TEST_TOKEN_VALID:ops_reviewer:OPERATIONS:VERIFIED' },
      });
      const cases: any[] = ((await listRes.json()) as any).cases ?? [];

      const honest = (c: any) =>
        c.status === 'recorded' && c.dispatchStatus === 'DEMO_NOT_DISPATCHED' &&
        typeof c.notice === 'string' && c.notice.includes(NOT_NOTIFIED) &&
        !DISPATCH_CLAIMS.test(JSON.stringify(c));

      const claimInResponse = JSON.stringify(body).match(DISPATCH_CLAIMS);
      return {
        success:
          res.status === 200 && honest(created) &&
          typeof body.notice === 'string' && body.notice.includes(NOT_NOTIFIED) && !claimInResponse &&
          listRes.status === 200 && cases.length >= 2 && cases.every(honest),
        details:
          `Status: ${res.status}, record status: ${created.status}, dispatch: ${created.dispatchStatus}; ` +
          `cases checked: ${cases.length}${claimInResponse ? `; claim found: "${claimInResponse[0]}"` : ''}`,
      };
    });

    // -------------------------------------------------------------
    // Test 17: The SOS screen's own wording. There is no UI test runner, so
    // this reads the component source: phrases that claim dispatch must be
    // absent, and the "not notified" statement present. It checks text, not
    // rendering.
    // -------------------------------------------------------------
    await assertTest(17, 'SOS screen text says emergency services were NOT notified and claims no dispatch', async () => {
      const source = readFileSync(new URL('../src/views/SafetySOSScreen.tsx', import.meta.url), 'utf8');
      const banned = [
        /DEOC queue/i, /logged to/i, /queued to/i, /forwarded to/i, /dispatched to/i,
        /help is on the way/i, /Ticket Generated/i, /HIGH-PRIORITY ASSISTANCE/i,
        /Trauma Medical Base/i, /deocIntegrationNotice/,
      ];
      const found = banned.filter((re) => re.test(source)).map(String);
      const notNotified = source.split('Emergency services have NOT been notified').length - 1;
      return {
        success: found.length === 0 && notNotified >= 2,
        details: found.length ? `Banned phrases present: ${found.join(', ')}` : `"NOT been notified" appears ${notNotified} times`,
      };
    });

  } finally {
    server.close();
  }

  console.log('\n=================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log('=================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSecurityTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
