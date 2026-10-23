/**
 * The demo ride request model, shared by the ride form, the map, the trip
 * planner and the server. No network calls here.
 *
 * A ride starts and ends either at one of the fixed demo pickup and drop
 * points (src/data/kumbhData.ts), which are names with no map position, or at
 * a place picked on the map or in a trip plan, which brings its coordinates.
 * A Kumbh sample site's coordinates are only approximate, and say so.
 *
 * Whatever the ends, a request is only recorded on the demo server: no
 * driver or vehicle is ever dispatched.
 */
import { RIDE_POINT_AREAS } from '../data/kumbhData';
import { TransportOption } from '../types';
import { GeoPoint } from './geo';
import { RideArea, TripEstimate, areaOfPoint, estimateTrip } from './fare';
import { roundRouteStop } from './routing';

/** Longest place name a ride request accepts, in characters. */
export const MAX_RIDE_PLACE_LABEL = 120;

/** A pickup or destination picked on the map or in a trip plan. */
export interface RidePlace {
  label: string;
  lat: number;
  lon: number;
  /** An OpenStreetMap place (map, search or trip plan), or a Kumbh sample site. */
  source: 'openstreetmap' | 'sample';
  /** True when the position is only approximate, as it is for every sample site. */
  approximate: boolean;
}

/** A fixed demo point (its name), or a place with coordinates. */
export type RideEnd = string | RidePlace;

export const isRidePlace = (end: unknown): end is RidePlace => typeof end === 'object' && end !== null;

export const rideEndLabel = (end: RideEnd) => (typeof end === 'string' ? end : end.label);

/** The area a ride end is in, or null for a name that is not a demo point. */
export function rideEndArea(end: RideEnd): RideArea | null {
  return typeof end === 'string' ? (RIDE_POINT_AREAS[end] ?? null) : areaOfPoint(end);
}

/** Same demo point, or the same spot to about 11 m. */
export function sameRideEnd(a: RideEnd, b: RideEnd): boolean {
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  const ra = roundRouteStop(a);
  const rb = roundRouteStop(b);
  return ra.lat === rb.lat && ra.lon === rb.lon;
}

/**
 * The demo estimate for a trip, from the same estimator the server prices it
 * with. Null until both ends are chosen and known.
 */
export function estimateRide(option: TransportOption, from: RideEnd | null, to: RideEnd | null): TripEstimate | null {
  if (!from || !to) return null;
  const fromArea = rideEndArea(from);
  const toArea = rideEndArea(to);
  return fromArea && toArea ? estimateTrip(option, fromArea, toArea) : null;
}

// ---------------------------------------------------------------------------
// Handing a place to the ride form
// ---------------------------------------------------------------------------

/** What the map or a trip plan hands to the ride form on the Travel tab. */
export interface RideDraft {
  /** New for every hand-over, so the form starts afresh. */
  id: number;
  /** Null when the pilgrim should choose a pickup point themselves. */
  from: RidePlace | null;
  to: RidePlace;
  origin:
    | { kind: 'map' }
    | { kind: 'trip'; day: number; stopNumber: number; pickup: 'previous_stop' | 'trip_start' | 'none' };
}

/** A place on the map ("place" is OpenStreetMap; "sample" a Kumbh sample site) as a ride end. */
export function ridePlace(input: { label: string; point: GeoPoint; kind: 'place' | 'sample' }): RidePlace {
  return {
    label: input.label,
    lat: input.point.lat,
    lon: input.point.lon,
    source: input.kind === 'sample' ? 'sample' : 'openstreetmap',
    approximate: input.kind === 'sample',
  };
}

/** A ride to a place picked on the map. The pickup is left for the pilgrim to choose. */
export function rideDraftForMapPlace(place: RidePlace): Omit<RideDraft, 'id'> {
  return { from: null, to: place, origin: { kind: 'map' } };
}

/**
 * A ride to one stop of a trip day. The pickup is the stop before it, or for
 * the day's first stop the trip's starting place. A start at the pilgrim's
 * own location is not used: it may be out of date, so they choose instead.
 */
export function rideDraftForTripStop(
  plan: {
    start: { lat: number; lon: number; label: string } | null;
    startKind: 'user' | 'place' | 'sample' | null;
    day: number;
    stops: { name: string; lat: number; lon: number }[];
  },
  stopIndex: number,
): Omit<RideDraft, 'id'> | null {
  const stop = plan.stops[stopIndex];
  if (!stop) return null;
  const to = ridePlace({ label: stop.name, point: stop, kind: 'place' });
  const previous = stopIndex > 0 ? plan.stops[stopIndex - 1] : null;
  let from: RidePlace | null = null;
  let pickup: 'previous_stop' | 'trip_start' | 'none' = 'none';
  if (previous) {
    from = ridePlace({ label: previous.name, point: previous, kind: 'place' });
    pickup = 'previous_stop';
  } else if (plan.start && (plan.startKind === 'place' || plan.startKind === 'sample')) {
    from = ridePlace({ label: plan.start.label, point: plan.start, kind: plan.startKind });
    pickup = 'trip_start';
  }
  return { from, to, origin: { kind: 'trip', day: plan.day, stopNumber: stopIndex + 1, pickup } };
}
