import { CreateRideResult, IdempotencyConflictError, RideIdempotency, RideRecord, RideStatus, RideStore } from './types';

const copy = (ride: RideRecord): RideRecord => structuredClone(ride);

const newestFirst = (a: RideRecord, b: RideRecord) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

/**
 * The demo's sample ride, assigned to a sample driver. Only the memory store
 * gets it; seed data is never written to Firestore.
 */
export function demoRideSeed(): RideRecord[] {
  return [
    {
      id: 'bk_001',
      bookingRef: 'NY-RD-8842',
      userId: 'usr_demo_driver_01',
      driverId: 'drv_01',
      fromLocation: 'Nashik Road Railway Station',
      toLocation: 'Ramkund Panchavati',
      transportType: 'electric_shuttle',
      passengers: 1,
      departAt: null,
      fromPlace: null,
      toPlace: null,
      fromArea: 'nashik',
      toArea: 'nashik',
      distanceKm: 8.4,
      distanceBasis: 'DEMO_AREA_DISTANCE',
      estimatedFare: 15,
      estimatedTimeMins: 22,
      fareBasis: 'DEMO_ESTIMATE',
      status: 'driver_assigned',
      dispatchStatus: 'DEMO_NOT_DISPATCHED',
      // Was the label "10 mins ago"; a stored time has to be a real time.
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      paymentMethod: 'pass',
      sourceType: 'DEMO',
    },
  ];
}

/**
 * Ride requests in this process's memory: the demo's behaviour so far, and
 * the default. Everything is lost when the server restarts.
 */
export class MemoryRideStore implements RideStore {
  readonly kind = 'memory' as const;
  readonly persistent = false;
  private rides: RideRecord[];
  private keys = new Map<string, { rideId: string; fingerprint: string }>();

  constructor(seed: RideRecord[] = []) {
    this.rides = seed.map(copy);
  }

  async createRide(ride: RideRecord, idempotency: RideIdempotency | null): Promise<CreateRideResult> {
    if (idempotency) {
      const earlier = this.keys.get(idempotency.key);
      if (earlier) {
        if (earlier.fingerprint !== idempotency.fingerprint) throw new IdempotencyConflictError();
        const saved = this.rides.find(r => r.id === earlier.rideId);
        if (saved) return { ride: copy(saved), replayed: true };
      }
      this.keys.set(idempotency.key, { rideId: ride.id, fingerprint: idempotency.fingerprint });
    }
    this.rides.unshift(copy(ride));
    return { ride: copy(ride), replayed: false };
  }

  async getRide(id: string): Promise<RideRecord | null> {
    const ride = this.rides.find(r => r.id === id);
    return ride ? copy(ride) : null;
  }

  async listRidesForUser(userId: string, limit: number): Promise<RideRecord[]> {
    return this.rides.filter(r => r.userId === userId).sort(newestFirst).slice(0, limit).map(copy);
  }

  async listRidesForDriver(driverId: string, includeRequested: boolean, limit: number): Promise<RideRecord[]> {
    return this.rides
      .filter(r => r.driverId === driverId || (includeRequested && r.status === 'requested'))
      .sort(newestFirst)
      .slice(0, limit)
      .map(copy);
  }

  async updateRideStatus(id: string, status: RideStatus): Promise<RideRecord | null> {
    const ride = this.rides.find(r => r.id === id);
    if (!ride) return null;
    ride.status = status;
    return copy(ride);
  }
}
