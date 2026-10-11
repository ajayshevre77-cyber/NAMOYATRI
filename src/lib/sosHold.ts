/**
 * Press-and-hold logic for the demo SOS button. It has no React in it, so the
 * same code that runs in SafetySOSScreen is tested in tests/sos-hold.test.ts.
 *
 * Rules:
 * - A report is submitted only after the button has been held for the full
 *   hold time. That is measured as elapsed time, not by counting timer ticks,
 *   which run late in background tabs and on slow phones.
 * - One hold submits at most once, and no new hold starts while a report is
 *   still being recorded.
 * - Submitting happens here, from a timer, never from inside a React state
 *   updater. React may call an updater twice (it always does in development
 *   StrictMode), which once sent every SOS report twice.
 */

export const SOS_HOLD_MS = 3000;
export const SOS_TICK_MS = 100;

/** The browser events the button forwards, reduced to what the hold needs. */
export type SosHoldInput =
  | { type: 'pointerdown'; pointerType: string; button: number }
  | { type: 'pointerup' | 'pointerleave' | 'pointercancel' | 'blur' }
  | { type: 'keydown'; key: string; repeat: boolean }
  | { type: 'keyup'; key: string };

export interface SosHoldState {
  holding: boolean;
  /** How far through the hold, from 0 to 1. */
  progress: number;
  /** Whole seconds still to hold, rounded up. */
  secondsLeft: number;
  /** A completed hold's report is being recorded. */
  submitting: boolean;
}

export type SosHoldOutcome = 'cancelled' | 'completed';

export interface SosHoldOptions {
  /** Records the report. Called at most once per completed hold. */
  submit: () => Promise<void>;
  onChange: (state: SosHoldState) => void;
  /** A hold ended: released early, or held long enough to submit. */
  onEnd?: (outcome: SosHoldOutcome) => void;
  holdMs?: number;
  /** Injectable clock and timer, for tests. */
  now?: () => number;
  setTimer?: (tick: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

/** Enter and Space hold the button, the same as pressing it. */
export const isHoldKey = (key: string) => key === 'Enter' || key === ' ' || key === 'Spacebar';

export function createSosHold(options: SosHoldOptions) {
  const holdMs = options.holdMs ?? SOS_HOLD_MS;
  const now = options.now ?? (() => performance.now());
  const setTimer = options.setTimer ?? ((tick: () => void, ms: number) => setInterval(tick, ms));
  const clearTimer = options.clearTimer ?? ((timer: unknown) => clearInterval(timer as ReturnType<typeof setInterval>));

  let startedAt: number | null = null;
  let timer: unknown = null;
  let submitting = false;
  let progress = 0;

  const emit = () =>
    options.onChange({
      holding: startedAt !== null,
      progress,
      secondsLeft: Math.ceil(((1 - progress) * holdMs) / 1000),
      submitting,
    });

  const stopTimer = () => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const start = () => {
    // A second press while holding changes nothing, and nothing starts while
    // the last report is still being recorded.
    if (startedAt !== null || submitting) return;
    startedAt = now();
    progress = 0;
    timer = setTimer(tick, SOS_TICK_MS);
    emit();
  };

  const release = () => {
    if (startedAt === null) return; // not holding, or the hold already completed
    startedAt = null;
    progress = 0;
    stopTimer();
    emit();
    options.onEnd?.('cancelled');
  };

  const submit = async () => {
    submitting = true;
    emit();
    try {
      await options.submit();
    } catch (err) {
      console.error('Demo SOS report failed', err);
    } finally {
      submitting = false;
      progress = 0;
      emit();
    }
  };

  function tick() {
    if (startedAt === null) return;
    progress = Math.min(1, (now() - startedAt) / holdMs);
    if (progress < 1) {
      emit();
      return;
    }
    // Held for the full time. End the hold before submitting, so a late tick
    // or a repeated event in the same moment cannot submit this hold again.
    startedAt = null;
    stopTimer();
    options.onEnd?.('completed');
    void submit();
  }

  return {
    /**
     * Feeds one input event in. Returns true when the browser's default
     * action must be suppressed: for Enter and Space that default is a click,
     * which would otherwise fire on top of the keyboard hold.
     */
    handle(input: SosHoldInput): boolean {
      switch (input.type) {
        case 'pointerdown':
          if (input.pointerType === 'mouse' && input.button !== 0) return false;
          start();
          return false;
        case 'keydown':
          if (!isHoldKey(input.key)) return false;
          if (!input.repeat) start(); // held keys auto-repeat; only the first press counts
          return true;
        case 'keyup':
          if (!isHoldKey(input.key)) return false;
          release();
          return true;
        default:
          release();
          return false;
      }
    },
    tick,
    /** Drops a hold in progress without reporting it, for unmount. */
    dispose() {
      startedAt = null;
      progress = 0;
      stopTimer();
    },
  };
}

export type SosHold = ReturnType<typeof createSosHold>;
