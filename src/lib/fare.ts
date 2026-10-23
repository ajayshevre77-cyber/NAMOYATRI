import { TransportOption } from '../types';
import { GeoPoint, haversineKm } from './geo';
import { TRIP_AREAS, TripArea } from './itinerary';

/**
 * Demo trip estimates, shared by the ride form and the server.
 *
 * The server prices every ride request with these functions and ignores any
 * fare the client sends. The form uses the same functions only to preview the
 * number, so the preview and the stored fare always agree.
 *
 * None of this is an official or regulated tariff, and no distance here is
 * measured. A trip is priced by the areas it starts and ends in, with one
 * fixed demo distance for each kind of trip. Show it as a demo value, never as
 * a road or map distance.
 */

/** Hard upper bound on passengers for any ride type. */
export const MAX_PASSENGERS = 6;

/** How far ahead a ride may be scheduled. */
export const MAX_ADVANCE_BOOKING_DAYS = 7;

/** Where a ride starts or ends: the same two hubs the trip planner uses. */
export type RideArea = TripArea;

/** Fixed demo distances, in km, for each kind of trip. Not measured. */
export const DEMO_DISTANCE_KM = {
  withinNashik: 8.4,
  withinTrimbakeshwar: 3,
  between: 28.5,
} as const;

export interface TripEstimate {
  /** The fixed demo distance for this kind of trip, not a measured one. */
  distanceKm: number;
  estimatedFare: number;
  estimatedTimeMins: number;
  fromArea: RideArea;
  toArea: RideArea;
}

export function demoDistanceKm(from: RideArea, to: RideArea): number {
  if (from !== to) return DEMO_DISTANCE_KM.between;
  return from === 'trimbakeshwar' ? DEMO_DISTANCE_KM.withinTrimbakeshwar : DEMO_DISTANCE_KM.withinNashik;
}

/** The area of a map position: whichever hub centre is nearer. */
export function areaOfPoint(point: GeoPoint): RideArea {
  let nearest = TRIP_AREAS[0];
  for (const area of TRIP_AREAS) {
    if (haversineKm(point, area.centre) < haversineKm(point, nearest.centre)) nearest = area;
  }
  return nearest.id;
}

/** "within Nashik", "within Trimbakeshwar" or "between Nashik and Trimbakeshwar", for labels. */
export function demoDistanceBasis(from: RideArea, to: RideArea): string {
  if (from !== to) return 'between Nashik and Trimbakeshwar';
  return from === 'trimbakeshwar' ? 'within Trimbakeshwar' : 'within Nashik';
}

export const fareFor = (option: TransportOption, distanceKm: number) =>
  Math.round(option.baseFare + distanceKm * option.perKmRate);

export const travelTimeMinsFor = (distanceKm: number) =>
  Math.round(distanceKm * 2.2 + 6);

export function estimateTrip(option: TransportOption, fromArea: RideArea, toArea: RideArea): TripEstimate {
  const distanceKm = demoDistanceKm(fromArea, toArea);
  return {
    distanceKm,
    estimatedFare: fareFor(option, distanceKm),
    estimatedTimeMins: travelTimeMinsFor(distanceKm),
    fromArea,
    toArea,
  };
}

/** Seats available on one ride of this type. */
export const maxPassengersFor = (option: TransportOption) =>
  Math.min(MAX_PASSENGERS, option.capacity);
