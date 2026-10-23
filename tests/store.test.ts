import { readFileSync } from 'fs';
import http from 'http';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { Firestore, Timestamp, getFirestore } from 'firebase-admin/firestore';
import app from '../server';
import { DROP_POINTS, MOCK_TRANSPORT_OPTIONS, PICKUP_POINTS } from '../src/data/kumbhData';
import { estimateRide, isClientRequestId, newClientRequestId, rideRequestAttempt } from '../src/lib/rides';
import { validateRideRequestBody } from '../server/middleware/validation';
import { getAuditLogs } from '../server/audit';
import {
  IdempotencyConflictError,
  RideRecord,
  RideStore,
  StorageUnavailableError,
  getRideStore,
  newBookingRef,
  newRideId,
  rideIdempotencyKey,
  setRideStoreForTests,
} from '../server/store';
import { MemoryRideStore } from '../server/store/memoryStore';
import { FirestoreRideStore, RIDE_REQUESTS, RIDE_REQUEST_KEYS, redactForLog } from '../server/store/firestoreStore';
import { serverFirestoreDatabaseId } from '../server/firestore';

process.env.NODE_ENV = 'test';

// Run with NODE_ENV=test set in the shell (see CLAUDE.md): the import above
// starts the server before the line above runs.
//
// What each backend here really is:
// - MemoryRideStore: the real memory store.
// - "FAKE Firestore": FakeFirestore below, an in-process imitation of the
//   few Admin SDK calls the adapter makes. It tests the adapter's own logic
//   (mapping, idempotency, error handling) and NOT Firestore itself.
// - The emulator scenarios run only with FIRESTORE_EMULATOR_HOST set (the
//   Firestore emulator, project demo-namoyatri-test); otherwise they are
//   reported as SKIPPED, never as passed. Nothing here touches a real project.
//
// /api/rides/* allows 30 requests per minute per IP. This suite makes 22;
// keep it under 30.

const TOURIST_A = 'Bearer TEST_TOKEN_VALID:store_user_a:TOURIST:PENDING';
const TOURIST_B = 'Bearer TEST_TOKEN_VALID:store_user_b:TOURIST:PENDING';
const FROM = PICKUP_POINTS[0]; // Nashik Road Railway Station
const TO = DROP_POINTS[1]; // Trimbakeshwar Jyotirlinga Mandir
const shuttle = MOCK_TRANSPORT_OPTIONS.find(o => o.type === 'electric_shuttle')!;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const runId = Date.now().toString(36);

// ---------------------------------------------------------------------------
// FAKE Firestore: just enough of the Admin SDK for FirestoreRideStore
// ---------------------------------------------------------------------------

type Data = Record<string, any>;

class FakeFirestoreError extends Error {
  constructor(message: string, readonly code: number) {
    super(message);
  }
}

/** Copies like Firestore does on every read and write; Timestamps are immutable, so they are kept. */
function clone(value: any): any {
  if (value instanceof Timestamp || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
}

/** Firestore refuses undefined anywhere in a document. */
function assertStorable(value: any, path = ''): void {
  if (value === undefined) throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${path}").`);
  if (value && typeof value === 'object' && !(value instanceof Timestamp)) {
    for (const [k, v] of Object.entries(value)) assertStorable(v, path ? `${path}.${k}` : k);
  }
}

const snapshot = (id: string, data: Data | undefined) => ({ id, exists: data !== undefined, data: () => clone(data) });

class FakeDocRef {
  constructor(private db: FakeFirestore, readonly collectionName: string, readonly id: string) {}
  private get docs() {
    return this.db.docsOf(this.collectionName);
  }
  current() {
    return this.docs.get(this.id);
  }
  async get() {
    this.db.maybeFailRead();
    return snapshot(this.id, this.current());
  }
  write(data: Data) {
    assertStorable(data);
    this.docs.set(this.id, clone(data));
  }
  update(data: Data) {
    const existing = this.current();
    if (!existing) throw new FakeFirestoreError(`No document to update: ${this.collectionName}/${this.id}`, 5);
    assertStorable(data);
    this.docs.set(this.id, { ...existing, ...clone(data) });
  }
}

class FakeQuery {
  constructor(
    private db: FakeFirestore,
    private collectionName: string,
    private filters: [string, unknown][] = [],
    private order: [string, 'asc' | 'desc'] | null = null,
    private max = Infinity,
  ) {}
  where(field: string, op: string, value: unknown) {
    if (op !== '==') throw new Error(`FakeFirestore only supports ==, not ${op}`);
    return new FakeQuery(this.db, this.collectionName, [...this.filters, [field, value]], this.order, this.max);
  }
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return new FakeQuery(this.db, this.collectionName, this.filters, [field, direction], this.max);
  }
  limit(n: number) {
    return new FakeQuery(this.db, this.collectionName, this.filters, this.order, n);
  }
  async get() {
    this.db.maybeFailRead();
    let rows = [...this.db.docsOf(this.collectionName).entries()].filter(([, data]) =>
      this.filters.every(([field, value]) => data[field] === value),
    );
    if (this.order) {
      const [field, direction] = this.order;
      const key = (d: Data) => (d[field] instanceof Timestamp ? d[field].toMillis() : d[field]);
      rows.sort(([, a], [, b]) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (direction === 'desc' ? -1 : 1));
    }
    rows = rows.slice(0, this.max);
    return { docs: rows.map(([id, data]) => snapshot(id, data)) };
  }
}

class FakeCollection extends FakeQuery {
  constructor(private fake: FakeFirestore, private name: string) {
    super(fake, name);
  }
  doc(id: string) {
    return new FakeDocRef(this.fake, this.name, id);
  }
}

class FakeFirestore {
  /** collection -> id -> document. Every adapter made over one fake shares it, like one database. */
  readonly collections = new Map<string, Map<string, Data>>();
  /** Thrown by the next commits / reads while set. */
  failCommitsWith: unknown = null;
  failReadsWith: unknown = null;
  /** While set, commits wait for it, then apply: a write that lands after the caller gave up. */
  holdCommits: Promise<void> | null = null;

  docsOf(name: string) {
    let docs = this.collections.get(name);
    if (!docs) this.collections.set(name, (docs = new Map()));
    return docs;
  }
  count(name: string) {
    return this.docsOf(name).size;
  }
  maybeFailRead() {
    if (this.failReadsWith) throw this.failReadsWith;
  }
  collection(name: string) {
    return new FakeCollection(this, name);
  }
  batch() {
    const ops: { kind: 'create' | 'update'; ref: FakeDocRef; data: Data }[] = [];
    return {
      create: (ref: FakeDocRef, data: Data) => void ops.push({ kind: 'create', ref, data }),
      update: (ref: FakeDocRef, data: Data) => void ops.push({ kind: 'update', ref, data }),
      commit: async () => {
        if (this.holdCommits) await this.holdCommits;
        if (this.failCommitsWith) throw this.failCommitsWith;
        // All or nothing, like a real batch.
        for (const op of ops) {
          if (op.kind === 'create' && op.ref.current()) throw new FakeFirestoreError('Document already exists', 6);
          if (op.kind === 'update' && !op.ref.current()) throw new FakeFirestoreError('No document to update', 5);
          assertStorable(op.data);
        }
        for (const op of ops) (op.kind === 'create' ? op.ref.write(op.data) : op.ref.update(op.data));
      },
    };
  }
  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    if (this.failCommitsWith) throw this.failCommitsWith;
    const writes: (() => void)[] = [];
    const result = await fn({
      get: (ref: FakeDocRef) => ref.get(),
      update: (ref: FakeDocRef, data: Data) => void writes.push(() => ref.update(data)),
    });
    writes.forEach(w => w());
    return result;
  }
}

const overFake = (fake: FakeFirestore, timeoutMs?: number) =>
  new FirestoreRideStore(fake as unknown as Firestore, { timeoutMs });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A valid ride record for the store tests; createdAt `secondsAgo` seconds back. */
function rideRecord(userId: string, secondsAgo = 0, overrides: Partial<RideRecord> = {}): RideRecord {
  const estimate = estimateRide(shuttle, FROM, TO)!;
  return {
    id: newRideId(),
    bookingRef: newBookingRef(),
    userId,
    fromLocation: FROM,
    toLocation: TO,
    transportType: 'electric_shuttle',
    passengers: 2,
    departAt: null,
    fromPlace: null,
    toPlace: { lat: 19.9325, lon: 73.5307, source: 'openstreetmap', approximate: false },
    fromArea: estimate.fromArea,
    toArea: estimate.toArea,
    distanceKm: estimate.distanceKm,
    distanceBasis: 'DEMO_AREA_DISTANCE',
    estimatedFare: estimate.estimatedFare,
    estimatedTimeMins: estimate.estimatedTimeMins,
    fareBasis: 'DEMO_ESTIMATE',
    status: 'requested',
    dispatchStatus: 'DEMO_NOT_DISPATCHED',
    createdAt: new Date(Date.now() - secondsAgo * 1000).toISOString(),
    paymentMethod: 'pass',
    sourceType: 'DEMO',
    ...overrides,
  };
}

/** Deep equality that ignores key order (Firestore may return map fields in another order). */
const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  );
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Runs `fn` with console.error/log captured, so expected failure logs can be checked instead of printed. */
async function capturingLogs<T>(fn: () => Promise<T>): Promise<{ value: T; logs: string[] }> {
  const logs: string[] = [];
  const { error, log } = console;
  console.error = (...args: unknown[]) => void logs.push(args.map(String).join(' '));
  console.log = (...args: unknown[]) => void logs.push(args.map(String).join(' '));
  try {
    return { value: await fn(), logs };
  } finally {
    console.error = error;
    console.log = log;
  }
}

async function rejectsWith(promise: Promise<unknown>, check: (err: any) => boolean): Promise<boolean> {
  try {
    await promise;
    return false;
  } catch (err) {
    return check(err);
  }
}

/**
 * The behaviour every RideStore must share. Returns the checks that failed.
 * User ids include `tag` and the run id, so leftovers from an earlier run on
 * the emulator never match.
 */
async function storeContract(store: RideStore, tag: string): Promise<string[]> {
  const failures: string[] = [];
  const check = (ok: boolean, what: string) => {
    if (!ok) failures.push(what);
  };
  const userA = `${tag}_${runId}_a`;
  const userB = `${tag}_${runId}_b`;

  // a. Saved as given, read back the same, times exact.
  const scheduled = rideRecord(userA, 30, { departAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString() });
  const created = await store.createRide(scheduled, null);
  check(!created.replayed && same(created.ride, scheduled), 'a: create returns the ride as saved');
  check(same(await store.getRide(scheduled.id), scheduled), 'a: getRide returns the same record (times, places)');
  check((await store.getRide(scheduled.id))?.driverId === undefined, 'a: no driverId on a ride without a driver');

  // b. Own rides only, newest first, limited.
  const older = rideRecord(userA, 20);
  const newest = rideRecord(userA, 10);
  const other = rideRecord(userB, 5);
  for (const r of [older, newest, other]) await store.createRide(r, null);
  const listA = await store.listRidesForUser(userA, 50);
  check(same(listA.map(r => r.id), [newest.id, older.id, scheduled.id]), `b: user A sees own 3, newest first (got ${listA.length})`);
  check(same((await store.listRidesForUser(userA, 2)).map(r => r.id), [newest.id, older.id]), 'b: limit keeps the newest');
  check(same((await store.listRidesForUser(userB, 50)).map(r => r.id), [other.id]), "b: user B sees only B's ride");

  // c. A repeat under the same key returns the first ride.
  const key = { key: rideIdempotencyKey(userA, `${tag}-${runId}-retry-key`), fingerprint: 'fp-1' };
  const first = await store.createRide(rideRecord(userA), key);
  const retry = await store.createRide(rideRecord(userA), key);
  check(!first.replayed && retry.replayed && retry.ride.id === first.ride.id, 'c: retry returns the first ride, replayed');
  check((await store.listRidesForUser(userA, 50)).filter(r => r.id === first.ride.id).length === 1, 'c: saved once');
  check((await store.listRidesForUser(userA, 50)).length === 4, 'c: the retry added no second record');

  // d. The same key for a different request is refused.
  check(
    await rejectsWith(store.createRide(rideRecord(userA), { ...key, fingerprint: 'fp-2' }), e => e instanceof IdempotencyConflictError),
    'd: same key, different request → IdempotencyConflictError',
  );

  // e. Five simultaneous duplicates save one ride.
  const raceKey = { key: rideIdempotencyKey(userB, `${tag}-${runId}-race-key`), fingerprint: 'fp-race' };
  const race = await Promise.all(Array.from({ length: 5 }, () => store.createRide(rideRecord(userB), raceKey)));
  check(race.filter(r => !r.replayed).length === 1 && new Set(race.map(r => r.ride.id)).size === 1, 'e: one saved, four replayed, one id');
  check((await store.listRidesForUser(userB, 50)).length === 2, 'e: user B has 2 rides, not 6');

  // f/g. Unknown ids; status updates persist.
  check((await store.getRide(`bk_missing_${runId}`)) === null, 'f: unknown id → null');
  check((await store.updateRideStatus(`bk_missing_${runId}`, 'cancelled')) === null, 'f: update of unknown id → null');
  const updated = await store.updateRideStatus(older.id, 'cancelled');
  check(updated?.status === 'cancelled' && (await store.getRide(older.id))?.status === 'cancelled', 'g: status update is stored');

  // h. Driver lists.
  const driverId = `${tag}_${runId}_driver`;
  const assigned = rideRecord(userB, 1, { driverId, status: 'driver_assigned' });
  await store.createRide(assigned, null);
  const own = await store.listRidesForDriver(driverId, false, 50);
  check(same(own.map(r => r.id), [assigned.id]), "h: a driver sees only the rides assigned to them");
  const withRequested = (await store.listRidesForDriver(driverId, true, 50)).map(r => r.id);
  check(withRequested.includes(assigned.id) && withRequested.includes(newest.id) && !withRequested.includes(older.id), 'h: plus open requests, not cancelled ones');

  // i. Returned records are copies.
  const copy = (await store.getRide(newest.id))!;
  copy.estimatedFare = 1;
  copy.userId = 'someone_else';
  check((await store.getRide(newest.id))?.estimatedFare === newest.estimatedFare, 'i: changing a returned record changes nothing stored');

  return failures;
}

/** Runs the ride validator directly, so bad-request cases do not spend the HTTP budget. */
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

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const emulatorAvailable = Boolean(emulatorHost && /^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(emulatorHost));

/** A Firestore client on the emulator only, under a demo- project that can never reach a real one. */
function emulatorClient(name: string) {
  const emulatorApp = initializeApp({ projectId: 'demo-namoyatri-test' }, `${name}-${runId}`);
  const databaseId = serverFirestoreDatabaseId();
  const db = databaseId === '(default)' ? getFirestore(emulatorApp) : getFirestore(emulatorApp, databaseId);
  return { app: emulatorApp, store: new FirestoreRideStore(db) };
}

// ---------------------------------------------------------------------------

async function runStoreTestSuite() {
  console.log('=================================================================');
  console.log('NAMO YATRI RIDE STORE TEST SUITE (22 SCENARIOS)');
  console.log('=================================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  async function assertTest(
    scenarioNum: number,
    name: string,
    fn: () => Promise<{ success: boolean; details?: string; skipped?: string }>,
  ) {
    try {
      const res = await fn();
      if (res.skipped) {
        console.log(`[SKIPPED] Test ${scenarioNum}: ${name}`);
        console.log(`       -> ${res.skipped}`);
        skipped++;
      } else if (res.success) {
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

  async function api(path: string, authorization: string | null, init: RequestInit = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  /** POSTs a ride request; `body` is merged over a valid default. */
  const requestRide = (body: Record<string, unknown>, authorization: string | null = TOURIST_A) =>
    api('/api/rides/request', authorization, {
      method: 'POST',
      body: JSON.stringify({ from: FROM, to: TO, transportType: 'electric_shuttle', ...body }),
    });

  const savedRequestAudits = () => getAuditLogs(1000).filter(e => e.action === 'REQUEST_TRANSPORT').length;
  const unavailable = (r: { status: number; body: any }) =>
    r.status === 503 && r.body.code === 'STORAGE_UNAVAILABLE' && r.body.success === undefined && r.body.booking === undefined;

  const savedDataStore = process.env.DATA_STORE;

  try {
    // =========================================================
    // Store contract
    // =========================================================
    await assertTest(1, 'Contract: the memory store', async () => {
      const failures = await storeContract(new MemoryRideStore(), 'mem');
      return { success: failures.length === 0, details: failures.length ? failures.join('; ') : 'all 9 checks (a–i) pass' };
    });

    await assertTest(2, 'Contract: the Firestore adapter over FAKE Firestore (adapter logic only, not Firestore)', async () => {
      const failures = await storeContract(overFake(new FakeFirestore()), 'fake');
      return { success: failures.length === 0, details: failures.length ? failures.join('; ') : 'all 9 checks (a–i) pass against the fake' };
    });

    await assertTest(3, 'Contract: the Firestore adapter on the Firestore EMULATOR', async () => {
      if (!emulatorAvailable) {
        return { success: false, skipped: 'FIRESTORE_EMULATOR_HOST is not set to a local emulator; not run.' };
      }
      const { app: emulatorApp, store } = emulatorClient('contract');
      try {
        const failures = await storeContract(store, 'emu');
        return { success: failures.length === 0, details: failures.length ? failures.join('; ') : `all 9 checks pass on ${emulatorHost}` };
      } finally {
        await deleteApp(emulatorApp);
      }
    });

    // =========================================================
    // Surviving a restart
    // =========================================================
    await assertTest(4, 'A new Firestore adapter over the same FAKE backing lists rides saved by the previous one', async () => {
      const fake = new FakeFirestore();
      const saved = rideRecord(`restart_${runId}`);
      await overFake(fake).createRide(saved, null);
      const reopened = await overFake(fake).listRidesForUser(saved.userId, 50);
      return {
        success: same(reopened, [saved]),
        details: 'shows the adapter keeps nothing in process memory; it does not show Firestore persistence',
      };
    });

    await assertTest(5, 'A new Firestore client on the EMULATOR lists rides saved before the old one was shut down', async () => {
      if (!emulatorAvailable) {
        return { success: false, skipped: 'FIRESTORE_EMULATOR_HOST is not set to a local emulator; not run.' };
      }
      const saved = rideRecord(`emu_restart_${runId}`);
      const before = emulatorClient('before-restart');
      await before.store.createRide(saved, { key: rideIdempotencyKey(saved.userId, `emu-restart-${runId}`), fingerprint: 'fp' });
      await deleteApp(before.app);
      const after = emulatorClient('after-restart');
      try {
        const listed = await after.store.listRidesForUser(saved.userId, 50);
        const retry = await after.store.createRide(rideRecord(saved.userId), { key: rideIdempotencyKey(saved.userId, `emu-restart-${runId}`), fingerprint: 'fp' });
        return {
          success: same(listed, [saved]) && retry.replayed && retry.ride.id === saved.id,
          details: `listed ${listed.length}; retry after restart replayed: ${retry.replayed}`,
        };
      } finally {
        await deleteApp(after.app);
      }
    });

    await assertTest(6, 'A new memory store starts with only the demo seed and says it is not persistent', async () => {
      const first = new MemoryRideStore();
      const saved = rideRecord(`mem_restart_${runId}`);
      await first.createRide(saved, null);
      const second = new MemoryRideStore();
      return {
        success: (await second.listRidesForUser(saved.userId, 50)).length === 0 && first.persistent === false && first.kind === 'memory',
        details: 'memory mode loses requests on restart, as the app says',
      };
    });

    // =========================================================
    // Firestore adapter details (FAKE Firestore)
    // =========================================================
    await assertTest(7, 'Stored documents use Firestore Timestamps, no undefined fields, and a hashed key (FAKE Firestore)', async () => {
      const fake = new FakeFirestore();
      const ride = rideRecord(`ts_${runId}`, 0, { departAt: new Date(Date.now() + 3600 * 1000).toISOString() });
      const clientRequestId = newClientRequestId();
      const key = rideIdempotencyKey(ride.userId, clientRequestId);
      await overFake(fake).createRide(ride, { key, fingerprint: 'fp' });
      const doc = fake.docsOf(RIDE_REQUESTS).get(ride.id)!;
      const keyDoc = fake.docsOf(RIDE_REQUEST_KEYS).get(key)!;
      const ok =
        doc.createdAt instanceof Timestamp && doc.createdAt.toDate().toISOString() === ride.createdAt &&
        doc.departAt instanceof Timestamp && doc.departAt.toDate().toISOString() === ride.departAt &&
        doc.updatedAt instanceof Timestamp &&
        doc.driverId === null && !('id' in doc) &&
        keyDoc.rideId === ride.id && keyDoc.userId === ride.userId && keyDoc.createdAt instanceof Timestamp &&
        /^[0-9a-f]{64}$/.test(key) && !JSON.stringify(keyDoc).includes(clientRequestId);
      return { success: ok, details: `createdAt ${doc.createdAt?.constructor?.name}, key doc fields: ${Object.keys(keyDoc).join(', ')}` };
    });

    await assertTest(8, 'Firestore failures become StorageUnavailableError with a reason, nothing is stored, and logs carry no secrets (FAKE Firestore)', async () => {
      // Fake fixtures, assembled at runtime so no key- or token-shaped text sits
      // in the source for secret scanners to flag. They keep the two shapes
      // redactForLog must catch: a PEM block and a long opaque token.
      const pemLabel = ['PRIVATE', 'KEY'].join(' ');
      const fakePem = `-----BEGIN ${pemLabel}-----\n${'FAKEKEYMATERIAL'.repeat(2)}\n-----END ${pemLabel}-----`;
      const fakeToken = `FAKE_TOKEN_${'x'.repeat(40)}`;
      const cases: [string, unknown, 'save' | 'read'][] = [
        ['PERMISSION_DENIED', new FakeFirestoreError('Missing or insufficient permissions.', 7), 'save'],
        ['NOT_FOUND', new FakeFirestoreError('The database does not exist for project.', 5), 'save'],
        ['UNAVAILABLE', new FakeFirestoreError('Service unavailable', 14), 'save'],
        ['NO_CREDENTIALS', new Error('Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication'), 'save'],
        ['FAILED_PRECONDITION', new FakeFirestoreError('The query requires an index.', 9), 'read'],
        ['UNKNOWN', new Error(`odd failure ${fakePem} token ${fakeToken}`), 'save'],
      ];
      const problems: string[] = [];
      for (const [reason, error, op] of cases) {
        const fake = new FakeFirestore();
        if (op === 'save') fake.failCommitsWith = error;
        else fake.failReadsWith = error;
        const store = overFake(fake);
        const { value: err, logs } = await capturingLogs(async () => {
          try {
            if (op === 'save') await store.createRide(rideRecord(`fail_${runId}`), { key: 'k'.repeat(64), fingerprint: 'fp' });
            else await store.listRidesForUser(`fail_${runId}`, 50);
            return null;
          } catch (e) {
            return e as any;
          }
        });
        const log = logs.join('\n');
        if (!(err instanceof StorageUnavailableError) || err.reason !== reason) problems.push(`${reason}: got ${err?.name}/${err?.reason}`);
        if (fake.count(RIDE_REQUESTS) + fake.count(RIDE_REQUEST_KEYS) !== 0) problems.push(`${reason}: something was stored`);
        if (!log.includes(`(${reason})`)) problems.push(`${reason}: not logged`);
        if ([pemLabel, 'FAKEKEYMATERIAL', fakeToken].some(text => log.includes(text))) {
          problems.push(`${reason}: secret-looking text reached the log`);
        }
      }
      const redacted = redactForLog(`x ${fakePem} y`);
      if (redacted !== 'x [redacted key] y') problems.push(`redactForLog gave "${redacted}"`);
      return { success: problems.length === 0, details: problems.length ? problems.join('; ') : `${cases.length} failure kinds mapped; key material redacted` };
    });

    await assertTest(9, 'A Firestore call that hangs times out as StorageUnavailableError (TIMEOUT) instead of hanging the request (FAKE Firestore)', async () => {
      const fake = new FakeFirestore();
      fake.holdCommits = new Promise(() => {}); // never answers
      const started = Date.now();
      const { value: err } = await capturingLogs(() =>
        overFake(fake, 150).createRide(rideRecord(`hang_${runId}`), null).then(() => null, e => e),
      );
      const took = Date.now() - started;
      return {
        success: err instanceof StorageUnavailableError && err.reason === 'TIMEOUT' && took < 1000,
        details: `${err?.reason} after ${took} ms`,
      };
    });

    // =========================================================
    // Store selection (DATA_STORE)
    // =========================================================
    await assertTest(10, 'Without DATA_STORE the server uses the memory store, and /api/health says so', async () => {
      delete process.env.DATA_STORE;
      setRideStoreForTests(null);
      const { value: store } = await capturingLogs(() => getRideStore());
      const health = await api('/api/health', null);
      const storage = health.body.storage?.rides;
      return {
        success: store.kind === 'memory' && !store.persistent && storage?.kind === 'memory' && storage?.persistent === false &&
          !JSON.stringify(health.body).includes(serverFirestoreDatabaseId()),
        details: `store ${store.kind}; health ${JSON.stringify(storage)}`,
      };
    });

    await assertTest(11, 'A misspelt DATA_STORE switches ride requests off (503); it never falls back to memory', async () => {
      process.env.DATA_STORE = 'firestor';
      setRideStoreForTests(null);
      const { value: store, logs } = await capturingLogs(() => getRideStore());
      const res = await requestRide({});
      return {
        success: store.kind === 'unavailable' && unavailable(res) && logs.some(l => l.includes('DATA_STORE must be')),
        details: `store ${store.kind}; POST ${res.status} ${res.body.code}`,
      };
    });

    await assertTest(12, 'DATA_STORE=firestore under NODE_ENV=test without the emulator refuses to run (no test writes to a real project)', async () => {
      process.env.DATA_STORE = 'firestore';
      setRideStoreForTests(null);
      const { value: store } = await capturingLogs(() => getRideStore());
      if (emulatorAvailable) {
        return { success: store.kind === 'firestore', details: 'emulator set: Firestore mode allowed against the emulator' };
      }
      const res = await requestRide({});
      return { success: store.kind === 'unavailable' && unavailable(res), details: `store ${store.kind}; POST ${res.status} ${res.body.code}` };
    });

    // From here on the server runs on the Firestore adapter over a FAKE Firestore.
    const fake = new FakeFirestore();
    setRideStoreForTests(overFake(fake));

    // =========================================================
    // HTTP: idempotency, ownership, server authority
    // =========================================================
    let rideA: any = null;
    await assertTest(13, 'Same clientRequestId twice saves one ride; the retry gets it back marked replayed; owner and fare come from the server', async () => {
      const clientRequestId = newClientRequestId();
      const auditsBefore = savedRequestAudits();
      const first = await requestRide({ clientRequestId, userId: 'victim_user', estimatedFare: 1, passengers: 2 });
      const retry = await requestRide({ clientRequestId, userId: 'victim_user', estimatedFare: 1, passengers: 2 });
      const list = await api('/api/rides/my-rides', TOURIST_A);
      rideA = first.body.booking;
      const expected = estimateRide(shuttle, FROM, TO)!;
      const mine = list.body.rides.filter((r: any) => r.id === rideA?.id);
      return {
        success:
          first.status === 200 && first.body.replayed === undefined &&
          retry.status === 200 && retry.body.replayed === true && retry.body.booking.id === rideA.id &&
          rideA.userId === 'store_user_a' && rideA.estimatedFare === expected.estimatedFare &&
          rideA.status === 'requested' && rideA.dispatchStatus === 'DEMO_NOT_DISPATCHED' &&
          ISO.test(rideA.createdAt) && /^bk_[0-9a-f]{32}$/.test(rideA.id) && /^NY-RD-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(rideA.bookingRef) &&
          mine.length === 1 && list.body.storage?.kind === 'firestore' && list.body.storage?.persistent === true &&
          fake.count(RIDE_REQUESTS) === 1 && fake.count(RIDE_REQUEST_KEYS) === 1 &&
          savedRequestAudits() === auditsBefore + 1 &&
          getAuditLogs(1000).filter(e => e.targetId === rideA.id).length === 1,
        details: `ids ${rideA?.id} / ${retry.body.booking?.id}, replayed ${retry.body.replayed}, docs ${fake.count(RIDE_REQUESTS)}, audits +${savedRequestAudits() - auditsBefore}`,
      };
    });

    await assertTest(14, 'The same clientRequestId with different details is refused (409); from another user it is a separate ride', async () => {
      const clientRequestId = newClientRequestId();
      await requestRide({ clientRequestId, passengers: 1 }); // TOURIST_A
      const changed = await requestRide({ clientRequestId, passengers: 3 });
      const otherUser = await requestRide({ clientRequestId, passengers: 1 }, TOURIST_B);
      return {
        success:
          changed.status === 409 && changed.body.code === 'IDEMPOTENCY_KEY_REUSED' &&
          otherUser.status === 200 && otherUser.body.replayed === undefined && otherUser.body.booking.userId === 'store_user_b',
        details: `changed: ${changed.status} ${changed.body.code}; user B: ${otherUser.status}, owner ${otherUser.body.booking?.userId}`,
      };
    });

    await assertTest(15, "My requests lists only the caller's own; another user's ride is 403; no token is 401", async () => {
      const listB = await api('/api/rides/my-rides', TOURIST_B);
      const snoop = await api(`/api/rides/${rideA.id}`, TOURIST_B);
      const anonymous = await api('/api/rides/my-rides', null);
      return {
        success:
          listB.status === 200 && listB.body.rides.length === 1 && listB.body.rides.every((r: any) => r.userId === 'store_user_b') &&
          snoop.status === 403 && snoop.body.code === 'RIDE_ACCESS_DENIED' &&
          anonymous.status === 401 && anonymous.body.code === 'AUTH_TOKEN_MISSING',
        details: `B sees ${listB.body.rides?.length}; B reading A's ride: ${snoop.status}; no token: ${anonymous.status}`,
      };
    });

    await assertTest(16, 'Invalid clientRequestIds are refused (400); a missing one is still accepted', async () => {
      const bad = ['short', 'has spaces in it here!!', 12345678901234567890, 'x'.repeat(65), ''].map(id => validate({ from: FROM, to: TO, transportType: 'electric_shuttle', clientRequestId: id }));
      const good = validate({ from: FROM, to: TO, transportType: 'electric_shuttle', clientRequestId: newClientRequestId() });
      const none = validate({ from: FROM, to: TO, transportType: 'electric_shuttle' });
      const overHttp = await requestRide({ clientRequestId: 'bad id!' });
      return {
        success:
          bad.every(r => r.status === 400 && r.code === 'INVALID_CLIENT_REQUEST_ID' && !r.passed) &&
          good.passed && isClientRequestId(good.value.clientRequestId) && none.passed && none.value.clientRequestId === null &&
          overHttp.status === 400 && overHttp.body.code === 'INVALID_CLIENT_REQUEST_ID',
        details: `${bad.map(r => r.code).join(', ')}; HTTP ${overHttp.status}`,
      };
    });

    // =========================================================
    // HTTP: failures are never reported as saved
    // =========================================================
    await assertTest(17, 'A failed Firestore write answers 503 STORAGE_UNAVAILABLE, stores nothing, audits nothing, and does not switch to memory', async () => {
      const failing = new FakeFirestore();
      failing.failCommitsWith = new FakeFirestoreError('Service unavailable', 14);
      failing.failReadsWith = new FakeFirestoreError('Service unavailable', 14);
      const store = overFake(failing);
      setRideStoreForTests(store);
      const auditsBefore = savedRequestAudits();
      const { value: [post, list] } = await capturingLogs(() =>
        Promise.all([requestRide({ clientRequestId: newClientRequestId() }), api('/api/rides/my-rides', TOURIST_A)]),
      );
      const stillSame = (await getRideStore()) === store;
      setRideStoreForTests(overFake(fake));
      return {
        success:
          unavailable(post) && /could not confirm/i.test(post.body.error) &&
          list.status === 503 && list.body.code === 'STORAGE_UNAVAILABLE' && list.body.rides === undefined &&
          failing.count(RIDE_REQUESTS) === 0 && savedRequestAudits() === auditsBefore && stillSame,
        details: `POST ${post.status} ${post.body.code}; list ${list.status}; stored ${failing.count(RIDE_REQUESTS)}; same store: ${stillSame}`,
      };
    });

    await assertTest(18, 'A write that times out answers 503; when it lands late, the retry returns it instead of saving a second ride', async () => {
      const slow = new FakeFirestore();
      let land!: () => void;
      slow.holdCommits = new Promise<void>(resolve => (land = resolve));
      setRideStoreForTests(overFake(slow, 150));
      const clientRequestId = newClientRequestId();
      const { value: timedOut } = await capturingLogs(() => requestRide({ clientRequestId }));
      slow.holdCommits = null;
      land(); // the first write reaches the database after all
      await new Promise(resolve => setTimeout(resolve, 20));
      const retry = await requestRide({ clientRequestId });
      setRideStoreForTests(overFake(fake));
      return {
        success: unavailable(timedOut) && retry.status === 200 && retry.body.replayed === true && slow.count(RIDE_REQUESTS) === 1,
        details: `first ${timedOut.status} ${timedOut.body.code}; retry ${retry.status} replayed ${retry.body.replayed}; rides stored ${slow.count(RIDE_REQUESTS)}`,
      };
    });

    // =========================================================
    // HTTP: restart, drivers, memory mode
    // =========================================================
    await assertTest(19, 'After a simulated restart (new adapter, same FAKE backing) My requests still lists the ride', async () => {
      setRideStoreForTests(overFake(fake));
      const list = await api('/api/rides/my-rides', TOURIST_A);
      const found = list.body.rides?.find((r: any) => r.id === rideA.id);
      return {
        success: list.status === 200 && same(found, rideA),
        details: 'the adapter keeps no state of its own; real persistence needs the emulator or a live database',
      };
    });

    await assertTest(20, 'Driver status updates go through the store and are kept; another driver is refused (403)', async () => {
      const store = overFake(fake);
      setRideStoreForTests(store);
      const ride = rideRecord(`rider_${runId}`, 0, { driverId: 'drv_store_test', status: 'driver_assigned' });
      await store.createRide(ride, null);
      const own = await api(`/api/driver/rides/${ride.id}/status`, 'Bearer TEST_TOKEN_VALID:drv_store_test:DRIVER:VERIFIED', {
        method: 'POST',
        body: JSON.stringify({ status: 'in_transit' }),
      });
      const other = await api(`/api/driver/rides/${ride.id}/status`, 'Bearer TEST_TOKEN_VALID:drv_someone_else:DRIVER:VERIFIED', {
        method: 'POST',
        body: JSON.stringify({ status: 'completed' }),
      });
      return {
        success:
          own.status === 200 && own.body.ride?.status === 'in_transit' &&
          (await store.getRide(ride.id))?.status === 'in_transit' &&
          other.status === 403 && other.body.code === 'DRIVER_DISPATCH_MISMATCH',
        details: `own ${own.status} → ${own.body.ride?.status}; other ${other.status} ${other.body.code}`,
      };
    });

    await assertTest(21, 'Memory mode over HTTP: a retry is also saved once, and My requests says the list is not persistent', async () => {
      setRideStoreForTests(new MemoryRideStore());
      const clientRequestId = newClientRequestId();
      const first = await requestRide({ clientRequestId });
      const retry = await requestRide({ clientRequestId });
      const list = await api('/api/rides/my-rides', TOURIST_A);
      return {
        success:
          first.status === 200 && retry.body.replayed === true && retry.body.booking.id === first.body.booking.id &&
          list.body.rides.length === 1 && list.body.storage?.kind === 'memory' && list.body.storage?.persistent === false,
        details: `rides listed ${list.body.rides?.length}; storage ${JSON.stringify(list.body.storage)}`,
      };
    });

    // =========================================================
    // Screens
    // =========================================================
    await assertTest(22, 'Screens: the form sends a reused clientRequestId, Travel shows My demo requests, and nothing claims a dispatched ride', async () => {
      const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
      const panel = read('src/components/RideRequestPanel.tsx');
      const list = read('src/components/MyRideRequests.tsx');
      const travel = read('src/views/TravelScreen.tsx');
      // The retry rule itself: same request keeps its key, a changed one gets a new key.
      const request = { from: FROM, to: TO, transportType: 'electric_shuttle', passengers: 1, departAt: null };
      const firstTry = rideRequestAttempt(request, null);
      const retry = rideRequestAttempt({ ...request }, firstTry);
      const changed = rideRequestAttempt({ ...request, passengers: 2 }, firstTry);
      const rule =
        isClientRequestId(firstTry.clientRequestId) && retry.clientRequestId === firstTry.clientRequestId &&
        isClientRequestId(changed.clientRequestId) && changed.clientRequestId !== firstTry.clientRequestId;
      const wired =
        rule &&
        panel.includes('attempt.current = rideRequestAttempt(request, attempt.current);') &&
        panel.includes('JSON.stringify({ ...request, clientRequestId })') &&
        /attempt\.current = null;\s+setBooking\(data\.booking\)/.test(panel) && // a new key after a saved request
        panel.includes('onRequested?.()') &&
        list.includes("'/api/rides/my-rides'") && list.includes('Requested, not dispatched') &&
        list.includes('no driver or vehicle is coming') && list.includes('storage?.persistent === true') &&
        list.includes('storage?.persistent === false') &&
        travel.includes('<MyRideRequests') && travel.includes('onRequested=');
      const claims = [
        /ride (is |has been )?(booked|confirmed)/i,
        /booking (is )?confirmed/i,
        /driver (is )?(on (the|his|her) way|coming|assigned to you)/i,
        /\bbook now\b/i,
        /your (cab|auto|ride) (will arrive|is arriving)/i,
        /\b(your|a|the) (driver|vehicle|cab|auto|shuttle) (has been|is being|was) (dispatched|sent)\b/i,
      ];
      const found = Object.entries({ panel, list, travel }).flatMap(([file, text]) =>
        claims.filter(c => c.test(text)).map(c => `${file}: ${c}`),
      );
      return {
        success: wired && found.length === 0,
        details: found.length ? `claims found: ${found.join('; ')}` : `retry rule: ${rule}; wired: ${wired}; no booking or dispatch claims`,
      };
    });
  } finally {
    if (savedDataStore === undefined) delete process.env.DATA_STORE;
    else process.env.DATA_STORE = savedDataStore;
    setRideStoreForTests(null);
    server.close();
  }

  console.log('\n=================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED, ${skipped} SKIPPED (TOTAL ${passed + failed + skipped})`);
  if (skipped) console.log('Skipped scenarios need the Firestore emulator (FIRESTORE_EMULATOR_HOST); they were not run.');
  console.log('=================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runStoreTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
