import http from 'http';
import app from '../server';

process.env.NODE_ENV = 'test';

async function runSecurityTestSuite() {
  console.log('=================================================================');
  console.log('NAMO YATRI SECURITY HARDENING TEST SUITE (10 SCENARIOS)');
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

  } finally {
    server.close();
  }

  console.log('\n=================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL 10)`);
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
