import type { RideArea } from '../../src/lib/fare';
import type { RidePlacePosition } from '../middleware/validation';

export type RideStatus = 'requested' | 'driver_assigned' | 'in_transit' | 'completed' | 'cancelled';

export interface RideRecord {
  /** Server-generated and random (newRideId), never taken from the client. */
  id: string;
  /** Shown to the pilgrim; not unique by construction and never used as a key. */
  bookingRef: string;
  userId: string;
  driverId?: string;
  fromLocation: string;
  toLocation: string;
  transportType: string;
  passengers: number;
  /** ISO time of a scheduled ride; null means leave now. */
  departAt: string | null;
  /** Where pickup and destination are, when they were places from the map or a trip plan; null for a fixed demo point. */
  fromPlace: RidePlacePosition | null;
  toPlace: RidePlacePosition | null;
  fromArea: RideArea;
  toArea: RideArea;
  /** The fixed demo distance for this kind of trip (src/lib/fare.ts), not a measured one. */
  distanceKm: number;
  distanceBasis: 'DEMO_AREA_DISTANCE';
  estimatedFare: number;
  estimatedTimeMins: number;
  fareBasis: 'DEMO_ESTIMATE';
  status: RideStatus;
  /** Nothing leaves this server: no real driver or vehicle is ever dispatched. */
  dispatchStatus: 'DEMO_NOT_DISPATCHED';
  /** ISO time, never a display label such as "Just now". */
  createdAt: string;
  paymentMethod: string;
  sourceType: 'DEMO';
}

/**
 * Makes a retried request return the ride saved the first time. `key` is
 * derived from the user and the form's clientRequestId (rideIdempotencyKey),
 * `fingerprint` from what was asked for (rideRequestFingerprint).
 */
export interface RideIdempotency {
  key: string;
  fingerprint: string;
}

export interface CreateRideResult {
  ride: RideRecord;
  /** True when this was a repeat of a request that had already been saved. */
  replayed: boolean;
}

export type StoreKind = 'memory' | 'firestore' | 'unavailable';

/**
 * Where ride requests live. The routes in server.ts only talk to this, so the
 * demo's in-memory list and Firestore are interchangeable (DATA_STORE).
 * Every method returns copies: changing a returned record changes nothing stored.
 */
export interface RideStore {
  readonly kind: StoreKind;
  /** Whether saved rides survive a server restart. */
  readonly persistent: boolean;
  /**
   * Saves a new ride. With `idempotency`, a repeat of a request already saved
   * returns that ride with `replayed: true`, and a different request under the
   * same key throws IdempotencyConflictError.
   */
  createRide(ride: RideRecord, idempotency: RideIdempotency | null): Promise<CreateRideResult>;
  getRide(id: string): Promise<RideRecord | null>;
  /** The user's own rides, newest first. */
  listRidesForUser(userId: string, limit: number): Promise<RideRecord[]>;
  /** Rides assigned to the driver, plus every unassigned request when `includeRequested`; newest first. */
  listRidesForDriver(driverId: string, includeRequested: boolean, limit: number): Promise<RideRecord[]>;
  /** The updated ride, or null when there is no ride with that id. */
  updateRideStatus(id: string, status: RideStatus): Promise<RideRecord | null>;
}

/**
 * The store could not be reached or refused the operation, so nothing can be
 * promised about the record. Routes answer 503 STORAGE_UNAVAILABLE; they never
 * report success and never fall back to another store.
 */
export class StorageUnavailableError extends Error {
  constructor(
    message: string,
    /** Short diagnostic for server logs, e.g. PERMISSION_DENIED or TIMEOUT. */
    readonly reason: string,
  ) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

/** The same clientRequestId was sent again for a different ride request. */
export class IdempotencyConflictError extends Error {
  constructor() {
    super('This clientRequestId was already used for a different ride request.');
    this.name = 'IdempotencyConflictError';
  }
}
