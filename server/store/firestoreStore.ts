import { Timestamp } from 'firebase-admin/firestore';
import type { DocumentData, DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import {
  CreateRideResult,
  IdempotencyConflictError,
  RideIdempotency,
  RideRecord,
  RideStatus,
  RideStore,
  StorageUnavailableError,
} from './types';

/**
 * Collections only the API server touches, through the Admin SDK. Browsers
 * are refused by firestore.rules, so nobody can write a fare or an owner.
 */
export const RIDE_REQUESTS = 'rideRequests';
/** One document per idempotency key: { rideId, userId, fingerprint, createdAt }. */
export const RIDE_REQUEST_KEYS = 'rideRequestKeys';

/** gRPC status codes the Firestore SDK puts on its errors. */
const GRPC_CODES: Record<number, string> = {
  4: 'DEADLINE_EXCEEDED',
  5: 'NOT_FOUND',
  6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED',
  8: 'RESOURCE_EXHAUSTED',
  9: 'FAILED_PRECONDITION',
  14: 'UNAVAILABLE',
  16: 'UNAUTHENTICATED',
};
const ALREADY_EXISTS = 6;

/** Server-log hints for the failures a misconfigured project produces. */
const HINTS: Record<string, string> = {
  NO_CREDENTIALS:
    'No Google credentials: set GOOGLE_APPLICATION_CREDENTIALS to a service-account key file kept outside the repo, or run on Google Cloud with a service account.',
  PERMISSION_DENIED: 'The service account needs the Cloud Datastore User role (roles/datastore.user).',
  UNAUTHENTICATED: 'The credentials were rejected; check the service-account key.',
  NOT_FOUND: 'Check that the Firestore database (FIRESTORE_DATABASE_ID, else firebase-applet-config.json) exists.',
  FAILED_PRECONDITION: 'Usually a missing composite index: create the ones in firestore.indexes.json.',
  TIMEOUT:
    'No answer in time. A save may still have gone through; a retry with the same clientRequestId will not duplicate it.',
};

const DEFAULT_TIMEOUT_MS = 10_000;

class StoreTimeout extends Error {}

const errorCode = (err: unknown) => (err as { code?: unknown } | null)?.code;

function failureReason(err: unknown): string {
  if (err instanceof StoreTimeout) return 'TIMEOUT';
  const code = errorCode(err);
  if (typeof code === 'number' && GRPC_CODES[code]) return GRPC_CODES[code];
  if (/default credentials/i.test(String((err as Error | null)?.message ?? ''))) return 'NO_CREDENTIALS';
  return 'UNKNOWN';
}

/** Logs never carry key material or tokens, even if an unexpected error quotes some. */
export const redactForLog = (text: string) =>
  text
    .replace(/-----BEGIN [^-]+-----[\s\S]*?(?:-----END [^-]+-----|$)/g, '[redacted key]')
    .replace(/[A-Za-z0-9_\-+/=.]{40,}/g, '[redacted]');

const toTimestamp = (iso: string) => Timestamp.fromDate(new Date(iso));

/** A stored Timestamp (or ISO string) as an ISO string; null when it is neither. */
function toIso(value: unknown): string | null {
  if (value && typeof (value as Timestamp).toDate === 'function') return (value as Timestamp).toDate().toISOString();
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

/** Field by field, so nothing undefined (which Firestore refuses) or unexpected is written. */
function toDocument(ride: RideRecord, now: Timestamp): DocumentData {
  return {
    bookingRef: ride.bookingRef,
    userId: ride.userId,
    driverId: ride.driverId ?? null,
    fromLocation: ride.fromLocation,
    toLocation: ride.toLocation,
    transportType: ride.transportType,
    passengers: ride.passengers,
    departAt: ride.departAt ? toTimestamp(ride.departAt) : null,
    fromPlace: ride.fromPlace ? { ...ride.fromPlace } : null,
    toPlace: ride.toPlace ? { ...ride.toPlace } : null,
    fromArea: ride.fromArea,
    toArea: ride.toArea,
    distanceKm: ride.distanceKm,
    distanceBasis: ride.distanceBasis,
    estimatedFare: ride.estimatedFare,
    estimatedTimeMins: ride.estimatedTimeMins,
    fareBasis: ride.fareBasis,
    status: ride.status,
    dispatchStatus: ride.dispatchStatus,
    createdAt: toTimestamp(ride.createdAt),
    updatedAt: now,
    paymentMethod: ride.paymentMethod,
    sourceType: ride.sourceType,
  };
}

function fromDocument(id: string, data: DocumentData | undefined): RideRecord | null {
  const createdAt = toIso(data?.createdAt);
  if (!data || typeof data.userId !== 'string' || !createdAt) {
    console.error(`[store] Skipping malformed ride request document ${id}.`);
    return null;
  }
  return {
    id,
    bookingRef: data.bookingRef,
    userId: data.userId,
    ...(typeof data.driverId === 'string' ? { driverId: data.driverId } : {}),
    fromLocation: data.fromLocation,
    toLocation: data.toLocation,
    transportType: data.transportType,
    passengers: data.passengers,
    departAt: data.departAt == null ? null : toIso(data.departAt),
    fromPlace: data.fromPlace ?? null,
    toPlace: data.toPlace ?? null,
    fromArea: data.fromArea,
    toArea: data.toArea,
    distanceKm: data.distanceKm,
    distanceBasis: data.distanceBasis,
    estimatedFare: data.estimatedFare,
    estimatedTimeMins: data.estimatedTimeMins,
    fareBasis: data.fareBasis,
    status: data.status,
    dispatchStatus: data.dispatchStatus,
    createdAt,
    paymentMethod: data.paymentMethod,
    sourceType: data.sourceType,
  };
}

const rideFrom = (snap: DocumentSnapshot) => (snap.exists ? fromDocument(snap.id, snap.data()) : null);

const newestFirst = (a: RideRecord, b: RideRecord) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

/**
 * Ride requests in Cloud Firestore (DATA_STORE=firestore), so they survive a
 * restart and are the same on every server instance.
 *
 * Any failure, timeout included, becomes StorageUnavailableError: the route
 * then answers 503 and the request is never reported as saved.
 */
export class FirestoreRideStore implements RideStore {
  readonly kind = 'firestore' as const;
  readonly persistent = true;
  private readonly timeoutMs: number;

  constructor(
    private readonly db: Firestore,
    options: { timeoutMs?: number } = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async createRide(ride: RideRecord, idempotency: RideIdempotency | null): Promise<CreateRideResult> {
    return this.guard('save', async () => {
      const now = Timestamp.now();
      const batch = this.db.batch();
      batch.create(this.db.collection(RIDE_REQUESTS).doc(ride.id), toDocument(ride, now));
      if (!idempotency) {
        await batch.commit();
        return { ride: structuredClone(ride), replayed: false };
      }

      // The ride and its key are written together or not at all, so a key
      // that already exists means an earlier attempt was saved in full.
      const keyRef = this.db.collection(RIDE_REQUEST_KEYS).doc(idempotency.key);
      batch.create(keyRef, { rideId: ride.id, userId: ride.userId, fingerprint: idempotency.fingerprint, createdAt: now });
      try {
        await batch.commit();
        return { ride: structuredClone(ride), replayed: false };
      } catch (err) {
        if (errorCode(err) !== ALREADY_EXISTS) throw err;
        const key = (await keyRef.get()).data();
        if (!key) throw err;
        if (key.fingerprint !== idempotency.fingerprint || key.userId !== ride.userId) {
          throw new IdempotencyConflictError();
        }
        const saved = rideFrom(await this.db.collection(RIDE_REQUESTS).doc(key.rideId).get());
        if (!saved) throw err;
        return { ride: saved, replayed: true };
      }
    });
  }

  async getRide(id: string): Promise<RideRecord | null> {
    return this.guard('read', async () => rideFrom(await this.db.collection(RIDE_REQUESTS).doc(id).get()));
  }

  async listRidesForUser(userId: string, limit: number): Promise<RideRecord[]> {
    return this.guard('read', async () => {
      // Needs the (userId, createdAt desc) index in firestore.indexes.json.
      const snap = await this.db
        .collection(RIDE_REQUESTS)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      return snap.docs.map(rideFrom).filter((r): r is RideRecord => r !== null);
    });
  }

  async listRidesForDriver(driverId: string, includeRequested: boolean, limit: number): Promise<RideRecord[]> {
    return this.guard('read', async () => {
      const rides = this.db.collection(RIDE_REQUESTS);
      const queries = [rides.where('driverId', '==', driverId).orderBy('createdAt', 'desc').limit(limit).get()];
      if (includeRequested) {
        queries.push(rides.where('status', '==', 'requested').orderBy('createdAt', 'desc').limit(limit).get());
      }
      const byId = new Map<string, RideRecord>();
      for (const snap of await Promise.all(queries)) {
        for (const doc of snap.docs) {
          const ride = rideFrom(doc);
          if (ride) byId.set(ride.id, ride);
        }
      }
      return [...byId.values()].sort(newestFirst).slice(0, limit);
    });
  }

  async updateRideStatus(id: string, status: RideStatus): Promise<RideRecord | null> {
    return this.guard('save', () =>
      this.db.runTransaction(async (tx) => {
        const ref = this.db.collection(RIDE_REQUESTS).doc(id);
        const ride = rideFrom(await tx.get(ref));
        if (!ride) return null;
        tx.update(ref, { status, updatedAt: Timestamp.now() });
        return { ...ride, status };
      }),
    );
  }

  /** Runs one store operation with a time limit, turning every failure into StorageUnavailableError. */
  private async guard<T>(operation: 'save' | 'read', work: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new StoreTimeout()), this.timeoutMs);
    });
    try {
      return await Promise.race([work(), timeout]);
    } catch (err) {
      if (err instanceof IdempotencyConflictError) throw err;
      const reason = failureReason(err);
      const detail = reason === 'UNKNOWN' ? ` ${redactForLog(String((err as Error | null)?.message ?? err)).slice(0, 200)}` : '';
      console.error(`[store] Firestore ${operation} failed (${reason}).${HINTS[reason] ? ` ${HINTS[reason]}` : ''}${detail}`);
      throw new StorageUnavailableError(`Ride requests could not be ${operation === 'save' ? 'saved' : 'read'}.`, reason);
    } finally {
      clearTimeout(timer);
    }
  }
}
