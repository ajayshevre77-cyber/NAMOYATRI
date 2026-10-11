import { createSosHold, SosHoldInput, SosHoldState, SOS_HOLD_MS } from '../src/lib/sosHold';

/**
 * Tests the SOS press-and-hold logic that SafetySOSScreen runs. No server and
 * no browser: a fake clock and fake timers drive it.
 *
 * By default every timer callback and every listener runs twice. React's
 * development StrictMode calls state updaters twice, and that double call is
 * what once sent every SOS report twice. Whatever submits must still submit
 * once under it.
 */

type SubmitMode = 'resolve' | 'reject' | 'pending';

function makeHarness(strict = true) {
  let clock = 0;
  let nextId = 1;
  const timers = new Map<number, { fn: () => void; ms: number; due: number }>();
  const states: SosHoldState[] = [];
  const outcomes: string[] = [];
  const pendingSubmits: Array<() => void> = [];
  let submits = 0;
  let mode: SubmitMode = 'resolve';

  const twice = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
    fn(...args);
    if (strict) fn(...args);
  };

  const hold = createSosHold({
    now: () => clock,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn: twice(fn), ms, due: clock + ms });
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id as number);
    },
    submit: () => {
      submits++;
      if (mode === 'reject') return Promise.reject(new Error('demo failure'));
      if (mode === 'pending') return new Promise<void>((resolve) => pendingSubmits.push(resolve));
      return Promise.resolve();
    },
    onChange: twice((state: SosHoldState) => states.push(state)),
    onEnd: twice((outcome: string) => outcomes.push(outcome)),
  });

  return {
    hold,
    states,
    outcomes,
    get submits() { return submits; },
    get timerCount() { return timers.size; },
    setMode(m: SubmitMode) { mode = m; },
    setClock(ms: number) { clock = ms; },
    resolvePending() { pendingSubmits.splice(0).forEach((resolve) => resolve()); },
    /** Feeds an event; returns true when the browser default would be suppressed. */
    send(input: SosHoldInput) { return hold.handle(input); },
    /** Moves the clock forward, firing due timers in time order. */
    advance(ms: number) {
      const target = clock + ms;
      for (;;) {
        let next: { fn: () => void; ms: number; due: number } | undefined;
        for (const t of timers.values()) if (t.due <= target && (!next || t.due < next.due)) next = t;
        if (!next) break;
        clock = next.due;
        next.due += next.ms;
        next.fn();
      }
      clock = target;
    },
    cancelled() { return outcomes.filter((o) => o === 'cancelled').length; },
  };
}

const mouseDown: SosHoldInput = { type: 'pointerdown', pointerType: 'mouse', button: 0 };
const touchDown: SosHoldInput = { type: 'pointerdown', pointerType: 'touch', button: 0 };
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function runSosHoldTestSuite() {
  console.log('=================================================================');
  console.log('NAMO YATRI SOS HOLD TEST SUITE (9 SCENARIOS)');
  console.log('=================================================================\n');

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

  // -------------------------------------------------------------
  // Test 1: The regression. One press held for 3 s sends one report, even
  // when every callback runs twice as in React development mode.
  // -------------------------------------------------------------
  await assertTest(1, 'One deliberate 3-second hold sends exactly one report (callbacks run twice, as in React dev mode)', async () => {
    const h = makeHarness(true);
    h.send(touchDown);
    h.advance(SOS_HOLD_MS + 300);
    h.send({ type: 'pointerup' });
    await settle();
    return {
      success: h.submits === 1 && h.cancelled() === 0 && h.timerCount === 0,
      details: `Requests: ${h.submits}, cancelled: ${h.cancelled()}, timers left running: ${h.timerCount}`,
    };
  });

  // -------------------------------------------------------------
  // Test 2: Same, with callbacks run once (production behaviour).
  // -------------------------------------------------------------
  await assertTest(2, 'One deliberate 3-second hold sends exactly one report (callbacks run once)', async () => {
    const h = makeHarness(false);
    h.send(mouseDown);
    h.advance(SOS_HOLD_MS + 300);
    h.send({ type: 'pointerup' });
    await settle();
    return { success: h.submits === 1 && h.cancelled() === 0, details: `Requests: ${h.submits}` };
  });

  // -------------------------------------------------------------
  // Test 3: Letting go early submits nothing.
  // -------------------------------------------------------------
  await assertTest(3, 'Releasing before 3 seconds submits nothing and reports a cancelled hold', async () => {
    const h = makeHarness();
    h.send(mouseDown);
    h.advance(SOS_HOLD_MS - 100);
    h.send({ type: 'pointerup' });
    h.advance(10_000);
    await settle();
    const last = h.states[h.states.length - 1];
    return {
      success: h.submits === 0 && h.cancelled() > 0 && !last.holding && last.progress === 0 && h.timerCount === 0,
      details: `Released at ${SOS_HOLD_MS - 100} ms. Requests: ${h.submits}, last state: holding=${last.holding}, progress=${last.progress}`,
    };
  });

  // -------------------------------------------------------------
  // Test 4: Elapsed time decides, not the number of ticks. The old code
  // counted 21 ticks of 100 ms and so fired after about 2.1 s.
  // -------------------------------------------------------------
  await assertTest(4, 'Completion is measured in elapsed time: 40 fast ticks in 1 s do nothing; 2999 ms does nothing; 3000 ms submits', async () => {
    const h = makeHarness();
    h.setClock(0);
    h.send(mouseDown);
    for (let i = 1; i <= 40; i++) {
      h.setClock(i * 25); // 40 ticks, but only 1 s passes
      h.hold.tick();
    }
    const afterFastTicks = h.submits;
    h.setClock(SOS_HOLD_MS - 1);
    h.hold.tick();
    const at2999 = h.submits;
    h.setClock(SOS_HOLD_MS);
    h.hold.tick();
    await settle();
    return {
      success: afterFastTicks === 0 && at2999 === 0 && h.submits === 1,
      details: `After 40 ticks in 1 s: ${afterFastTicks}; at ${SOS_HOLD_MS - 1} ms: ${at2999}; at ${SOS_HOLD_MS} ms: ${h.submits}`,
    };
  });

  // -------------------------------------------------------------
  // Test 5: A throttled timer (1 tick per second, as in a background tab)
  // still completes at 3 s, not later or earlier.
  // -------------------------------------------------------------
  await assertTest(5, 'A slow timer (one tick per second) completes on the first tick at or after 3 s', async () => {
    const h = makeHarness();
    h.send(mouseDown);
    const seen: number[] = [];
    for (const ms of [1000, 2000, 3000]) {
      h.setClock(ms);
      h.hold.tick();
      seen.push(h.submits);
    }
    await settle();
    return { success: seen.join() === '0,0,1', details: `Requests after ticks at 1 s, 2 s, 3 s: ${seen.join(', ')}` };
  });

  // -------------------------------------------------------------
  // Test 6: Repeated presses, auto-repeating keys and late ticks neither
  // restart the hold nor submit it twice.
  // -------------------------------------------------------------
  await assertTest(6, 'Repeated presses, key repeats and late ticks cannot restart or double-submit a hold', async () => {
    const h = makeHarness();
    h.send(mouseDown);
    h.advance(1000);
    h.send(mouseDown); // a second press 1 s in must not restart the 3 s
    h.send({ type: 'keydown', key: ' ', repeat: true });
    h.advance(SOS_HOLD_MS - 1000); // 3 s after the first press
    const atThreeSeconds = h.submits;
    for (let i = 0; i < 5; i++) h.hold.tick();
    h.advance(2000);
    h.send({ type: 'pointerup' });
    h.send({ type: 'keyup', key: ' ' });
    await settle();
    return {
      success: atThreeSeconds === 1 && h.submits === 1 && h.cancelled() === 0,
      details: `Requests at 3 s after the first press: ${atThreeSeconds}; after extra ticks and releases: ${h.submits}; cancelled: ${h.cancelled()}`,
    };
  });

  // -------------------------------------------------------------
  // Test 7: Nothing starts while a report is being recorded; once it has
  // finished (or failed), a new hold can submit again.
  // -------------------------------------------------------------
  await assertTest(7, 'No new hold while a report is being recorded; a new report is possible after it finishes or fails', async () => {
    const h = makeHarness();
    const originalError = console.error;
    console.error = () => {}; // the rejected submit below logs on purpose
    try {
      h.setMode('pending');
      h.send(mouseDown);
      h.advance(SOS_HOLD_MS + 100);
      h.send({ type: 'pointerup' });
      const recording = h.states[h.states.length - 1].submitting;
      h.send(mouseDown); // pressed again while the first report is in flight
      h.advance(SOS_HOLD_MS + 500);
      h.send({ type: 'pointerup' });
      const whileInFlight = h.submits;
      h.resolvePending();
      await settle();
      h.setMode('reject');
      h.send(mouseDown);
      h.advance(SOS_HOLD_MS + 100);
      h.send({ type: 'pointerup' });
      await settle();
      const afterFailure = h.submits;
      h.setMode('resolve');
      h.send(mouseDown);
      h.advance(SOS_HOLD_MS + 100);
      h.send({ type: 'pointerup' });
      await settle();
      return {
        success: recording && whileInFlight === 1 && afterFailure === 2 && h.submits === 3,
        details: `Submitting flag while recording: ${recording}; requests while the first was in flight: ${whileInFlight}; after it finished, a failed one: ${afterFailure}; then a good one: ${h.submits}`,
      };
    } finally {
      console.error = originalError;
    }
  });

  // -------------------------------------------------------------
  // Test 8: Keyboard. Holding Enter or Space works like holding the
  // button; the browser default (a click) is suppressed; other keys do
  // nothing; letting go early cancels.
  // -------------------------------------------------------------
  await assertTest(8, 'Holding Enter or Space submits once with the click default suppressed; early key release cancels', async () => {
    const results: string[] = [];
    let ok = true;
    for (const key of [' ', 'Enter']) {
      const h = makeHarness();
      const suppressed = [h.send({ type: 'keydown', key, repeat: false })];
      for (let ms = 100; ms <= SOS_HOLD_MS + 300; ms += 100) {
        h.advance(100);
        suppressed.push(h.send({ type: 'keydown', key, repeat: true }));
      }
      suppressed.push(h.send({ type: 'keyup', key }));
      await settle();
      const fine = h.submits === 1 && h.cancelled() === 0 && suppressed.every(Boolean);
      ok &&= fine;
      results.push(`${key === ' ' ? 'Space' : 'Enter'}: ${h.submits} request, default suppressed on all ${suppressed.length} key events: ${suppressed.every(Boolean)}`);
    }
    const early = makeHarness();
    early.send({ type: 'keydown', key: 'Enter', repeat: false });
    early.advance(1500);
    early.send({ type: 'keyup', key: 'Enter' });
    early.advance(5000);
    const other = makeHarness();
    const tabSuppressed = other.send({ type: 'keydown', key: 'Tab', repeat: false });
    other.send({ type: 'keydown', key: 'a', repeat: false });
    other.advance(5000);
    await settle();
    ok &&= early.submits === 0 && early.cancelled() > 0 && other.submits === 0 && !tabSuppressed;
    results.push(`Enter released at 1.5 s: ${early.submits} requests; Tab/a: ${other.submits} requests, Tab default kept: ${!tabSuppressed}`);
    return { success: ok, details: results.join('; ') };
  });

  // -------------------------------------------------------------
  // Test 9: Other ways a hold ends early, the right mouse button, and the
  // whole-second countdown the screen-reader announcement uses.
  // -------------------------------------------------------------
  await assertTest(9, 'Pointer leave, cancelled touch and focus loss cancel; right-click does not start; countdown reads 3, 2, 1', async () => {
    const h = makeHarness();
    h.send({ type: 'pointerdown', pointerType: 'mouse', button: 2 });
    h.advance(SOS_HOLD_MS + 500);
    const afterRightClick = h.submits;
    for (const end of ['pointerleave', 'pointercancel', 'blur'] as const) {
      h.send(touchDown);
      h.advance(1500);
      h.send({ type: end });
      h.advance(SOS_HOLD_MS);
    }
    const c = makeHarness(false);
    c.send(touchDown);
    c.advance(SOS_HOLD_MS + 100);
    await settle();
    const countdown = [...new Set(c.states.filter((s) => s.holding).map((s) => s.secondsLeft))];
    return {
      success: afterRightClick === 0 && h.submits === 0 && h.cancelled() >= 3 && countdown.join() === '3,2,1' && c.submits === 1,
      details: `Right-click: ${afterRightClick} requests; leave/cancel/blur: ${h.submits} requests; countdown announced: ${countdown.join(', ')}`,
    };
  });

  console.log('\n=================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log('=================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSosHoldTestSuite().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
