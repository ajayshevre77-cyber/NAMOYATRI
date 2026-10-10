import { TransportOption } from '../types';

/**
 * Demo trip estimates, shared by the ride form and the server.
 *
 * The server prices every ride request with these functions and ignores any
 * fare the client sends. The form uses the same functions only to preview the
 * number, so the preview and the stored fare always agree.
 *
 * None of this is an official or regulated tariff. Distances come from a fixed
 * two-value rule until a routing provider is wired in, so treat every figure
 * as an approximate demo estimate.
 */

/** Hard upper bound on passengers for any ride type. */
export const MAX_PASSENGERS = 6;

/** How far ahead a ride may be scheduled. */
export const MAX_ADVANCE_BOOKING_DAYS = 7;

export interface TripEstimate {
  distanceKm: number;
  estimatedFare: number;
  estimatedTimeMins: number;
}

/**
 * Placeholder distance: a trip with exactly one end in Trimbak is the long
 * Nashik–Trimbak leg, anything else is a short in-city hop.
 */
export function estimateDistanceKm(from: string, to: string): number {
  const fromTrimbak = from.includes('Trimbak');
  const toTrimbak = to.includes('Trimbak');
  return fromTrimbak !== toTrimbak ? 28.5 : 8.4;
}

export const fareFor = (option: TransportOption, distanceKm: number) =>
  Math.round(option.baseFare + distanceKm * option.perKmRate);

export const travelTimeMinsFor = (distanceKm: number) =>
  Math.round(distanceKm * 2.2 + 6);

export function estimateTrip(option: TransportOption, from: string, to: string): TripEstimate {
  const distanceKm = estimateDistanceKm(from, to);
  return {
    distanceKm,
    estimatedFare: fareFor(option, distanceKm),
    estimatedTimeMins: travelTimeMinsFor(distanceKm),
  };
}

/** Seats available on one ride of this type. */
export const maxPassengersFor = (option: TransportOption) =>
  Math.min(MAX_PASSENGERS, option.capacity);
