import { createHash, randomInt, randomUUID } from 'crypto';
import type { ValidRideRequest } from '../middleware/validation';
import { MAX_LISTED_RIDES } from '../../src/lib/rides';
import { MemoryRideStore, demoRideSeed } from './memoryStore';
import { RideStore, StorageUnavailableError, StoreKind } from './types';

export { IdempotencyConflictError, StorageUnavailableError } from './types';
export type { CreateRideResult, RideRecord, RideStatus, RideStore, StoreKind } from './types';

export { MAX_LISTED_RIDES };

/** 122 random bits; the record's key, so it must never repeat. */
export const newRideId = () => `bk_${randomUUID().replace(/-/g, '')}`;

/** No 0/O or 1/I, so a reference read out over the phone is not misheard. */
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** For people to quote, e.g. NY-RD-K7QM-3XPA. Display only: rides are looked up by id. */
export function newBookingRef(): string {
  const chars = Array.from({ length: 8 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join('');
  return `NY-RD-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Per user, so the same clientRequestId from someone else can never return their ride. */
export const rideIdempotencyKey = (userId: string, clientRequestId: string) =>
  createHash('sha256').update(`${userId}\n${clientRequestId}`).digest('hex');

/** What was asked for, so a key sent again with a different trip is refused instead of answered with the old ride. */
export function rideRequestFingerprint(request: ValidRideRequest): string {
  const { from, to, option, passengers, departAt } = request;
  return createHash('sha256')
    .update(JSON.stringify([from.label, from.place, to.label, to.place, option.type, passengers, departAt]))
    .digest('hex');
}

/** What the API tells the app about where requests are kept. */
export const rideStorageInfo = (store: RideStore): { kind: StoreKind; persistent: boolean } => ({
  kind: store.kind,
  persistent: store.persistent,
});

/**
 * Stands in when DATA_STORE asks for something that cannot be used. Every
 * call fails with 503 rather than quietly keeping requests in memory, which
 * would look saved and vanish at the next restart.
 */
class UnavailableRideStore implements RideStore {
  readonly kind = 'unavailable' as const;
  readonly persistent = false;
  constructor(private readonly reason: string) {}
  private refuse(): never {
    throw new StorageUnavailableError('Ride request storage is not set up correctly.', this.reason);
  }
  async createRide(): Promise<never> {
    return this.refuse();
  }
  async getRide(): Promise<never> {
    return this.refuse();
  }
  async listRidesForUser(): Promise<never> {
    return this.refuse();
  }
  async listRidesForDriver(): Promise<never> {
    return this.refuse();
  }
  async updateRideStatus(): Promise<never> {
    return this.refuse();
  }
}

async function openRideStore(setting: string | undefined): Promise<RideStore> {
  const choice = setting?.trim().toLowerCase() || 'memory';
  if (choice === 'memory') {
    console.log('[store] Ride requests are kept in server memory (DATA_STORE=memory) and are lost when the server restarts.');
    return new MemoryRideStore(demoRideSeed());
  }
  if (choice !== 'firestore') {
    console.error(
      `[store] DATA_STORE must be "memory" or "firestore", not "${setting!.trim().slice(0, 40)}". ` +
        'Ride requests answer 503 until it is fixed; they are not kept in memory instead.',
    );
    return new UnavailableRideStore('INVALID_DATA_STORE');
  }
  // A test run must never write to a real project.
  if (process.env.NODE_ENV === 'test' && !process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('[store] DATA_STORE=firestore under NODE_ENV=test needs FIRESTORE_EMULATOR_HOST. Ride requests answer 503.');
    return new UnavailableRideStore('TEST_WITHOUT_EMULATOR');
  }
  try {
    // Loaded only here, so the memory store never loads the Firestore SDK.
    const [{ FirestoreRideStore }, { getServerFirestore, serverFirestoreDatabaseId }] = await Promise.all([
      import('./firestoreStore'),
      import('../firestore'),
    ]);
    const store = new FirestoreRideStore(getServerFirestore());
    const emulator = process.env.FIRESTORE_EMULATOR_HOST ? ` on the emulator at ${process.env.FIRESTORE_EMULATOR_HOST}` : '';
    console.log(`[store] Ride requests are saved in Firestore database "${serverFirestoreDatabaseId()}"${emulator}.`);
    return store;
  } catch (err) {
    console.error('[store] Firestore could not be set up, so ride requests answer 503:', (err as Error)?.message ?? err);
    return new UnavailableRideStore('FIRESTORE_INIT_FAILED');
  }
}

let rideStore: Promise<RideStore> | null = null;

/**
 * The ride store DATA_STORE selects: "memory" (the default) or "firestore".
 * Chosen on first use, because dotenv.config() runs after the imports.
 */
export function getRideStore(): Promise<RideStore> {
  rideStore ??= openRideStore(process.env.DATA_STORE);
  return rideStore;
}

/** Swaps the store (null: choose again from DATA_STORE on next use). */
export function setRideStoreForTests(store: RideStore | null): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('setRideStoreForTests is only for tests');
  rideStore = store ? Promise.resolve(store) : null;
}
