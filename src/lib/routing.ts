/**
 * Road-route model shared by the client and the server, like `geo.ts`.
 * No network calls here: the server asks the routing provider (see
 * `server/routing.ts`), the client asks our own API (see `geoApi.ts`).
 *
 * The model is provider-neutral on purpose: an ordered list of stops in,
 * one result per leg plus totals out. The Phase 2C itinerary planner will
 * choose the stops; this calculates the roads between them, in the order
 * given. Nothing here reorders stops.
 */
import { GeoPoint, roundPoint } from './geo';

export type TravelMode = 'walking' | 'driving';

/** Display order and labels for the travel-mode switch. */
export const TRAVEL_MODES: { id: TravelMode; label: string; verb: string }[] = [
  { id: 'walking', label: 'Walk', verb: 'walking' },
  { id: 'driving', label: 'Drive', verb: 'driving' },
];

export const isTravelMode = (value: unknown): value is TravelMode => TRAVEL_MODES.some(m => m.id === value);

/** A route needs a start and a destination. */
export const MIN_ROUTE_STOPS = 2;
/** Start, destination and up to 8 stops between them. The provider allows 50. */
export const MAX_ROUTE_STOPS = 10;

/**
 * Decimal places kept when a route stop leaves the browser: about 11 m here.
 * Finer than the 100 m used for nearby search, because a route that starts
 * on the wrong side of a river or ghat is worse than no route.
 */
export const ROUTE_COORD_DECIMALS = 4;

export const roundRouteStop = (point: GeoPoint): GeoPoint => roundPoint(point, ROUTE_COORD_DECIMALS);

export interface RouteRequest {
  mode: TravelMode;
  /** In travel order. Never reordered by the server. */
  stops: GeoPoint[];
}

/** One leg between consecutive stops. Metrics are null if the provider left them out. */
export interface RouteLeg {
  fromStop: number;
  toStop: number;
  distanceM: number | null;
  durationS: number | null;
}

export interface RouteBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface RouteResponse {
  mode: TravelMode;
  /** The rounded points the route was calculated for, in order. */
  stops: GeoPoint[];
  /** Road distance in metres, from the provider. */
  distanceM: number;
  /** Estimated travel time in seconds, from the provider. */
  durationS: number;
  legs: RouteLeg[];
  /** The provider's route line as [lat, lon] pairs: Leaflet's order, not GeoJSON's. */
  path: [lat: number, lon: number][];
  bounds: RouteBounds;
  /** The provider's own notes, e.g. "There may be restrictions on some roads". */
  warnings: string[];
  provider: 'OPENROUTESERVICE';
  attribution: string;
  calculatedAt: string;
  /** How current the provider's road data was, if it said. */
  dataTimestamp: string | null;
}

/** GET /api/geo/route/status. Says only whether routing can work, never how it is configured. */
export interface RoutingStatus {
  configured: boolean;
  provider: 'OPENROUTESERVICE';
  modes: TravelMode[];
  maxStops: number;
}

export const OPENROUTESERVICE_ATTRIBUTION = '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors';

/** Identifies a route request: same mode and the same rounded stops in the same order. */
export function routeKey(mode: TravelMode, stops: GeoPoint[]): string {
  return `${mode}|${stops.map(p => {
    const r = roundRouteStop(p);
    return `${r.lat},${r.lon}`;
  }).join(';')}`;
}

/**
 * GeoJSON positions are [lon, lat]; Leaflet wants [lat, lon]. Returns null if
 * any position is not a pair of in-range numbers, so a malformed or swapped
 * line is rejected instead of drawn somewhere else.
 */
export function geoJsonLineToLatLngs(coordinates: unknown, decimals = 5): [number, number][] | null {
  if (!Array.isArray(coordinates)) return null;
  const f = 10 ** decimals;
  const out: [number, number][] = [];
  for (const position of coordinates) {
    if (!Array.isArray(position) || position.length < 2) return null;
    const [lon, lat] = position;
    if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    out.push([Math.round(lat * f) / f, Math.round(lon * f) / f]);
  }
  return out;
}

/** "under 1 min", "14 min", "1 h 5 min", "3 h". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return 'under 1 min';
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
