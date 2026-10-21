/**
 * AI trip-planner model shared by the client and the server, like `geo.ts`
 * and `routing.ts`. No network calls here.
 *
 * How a plan is made (see `server/itinerary.ts`):
 * 1. Real places are looked up on OpenStreetMap around the start.
 * 2. Gemini picks and orders stops, but only from that list, by id.
 * 3. Every day's road route is calculated by the Phase 2B routing code.
 *
 * Names, categories and coordinates always come from the OpenStreetMap
 * record, never from the AI. The AI only adds a title, a reason and a
 * suggested visit time, and those are labelled as AI suggestions.
 */
import { GeoPoint } from './geo';
import { MIN_ROUTE_STOPS, RouteResponse, TravelMode, routeKey } from './routing';

export const MIN_TRIP_DAYS = 1;
export const MAX_TRIP_DAYS = 7;

export type TripInterest =
  | 'pilgrimage'
  | 'temples'
  | 'history'
  | 'architecture'
  | 'nature'
  | 'food'
  | 'shopping'
  | 'local_markets'
  | 'sightseeing';

export const TRIP_INTERESTS: { id: TripInterest; label: string }[] = [
  { id: 'pilgrimage', label: 'Pilgrimage' },
  { id: 'temples', label: 'Temples' },
  { id: 'history', label: 'History' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'nature', label: 'Nature' },
  { id: 'food', label: 'Food' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'local_markets', label: 'Local markets' },
  { id: 'sightseeing', label: 'Sightseeing' },
];

export const isTripInterest = (value: unknown): value is TripInterest => TRIP_INTERESTS.some(i => i.id === value);

export type TripBudget = 'economical' | 'moderate' | 'flexible';

export const TRIP_BUDGETS: { id: TripBudget; label: string; description: string }[] = [
  { id: 'economical', label: 'Economical', description: 'Mostly temples, ghats, parks and other places that are usually free.' },
  { id: 'moderate', label: 'Moderate', description: 'A mix of free places with some cafés, shops or museums.' },
  { id: 'flexible', label: 'Flexible', description: 'Cost is not a concern when choosing places.' },
];

export const isTripBudget = (value: unknown): value is TripBudget => TRIP_BUDGETS.some(b => b.id === value);

export type TripPace = 'relaxed' | 'balanced' | 'packed';

/** Stops per day for each pace. 6 stops plus a start is well under the 10-stop route limit. */
export const TRIP_PACES: { id: TripPace; label: string; minStops: number; maxStops: number }[] = [
  { id: 'relaxed', label: 'Relaxed', minStops: 2, maxStops: 3 },
  { id: 'balanced', label: 'Balanced', minStops: 3, maxStops: 4 },
  { id: 'packed', label: 'Packed', minStops: 4, maxStops: 6 },
];

export const isTripPace = (value: unknown): value is TripPace => TRIP_PACES.some(p => p.id === value);

export const paceOf = (pace: TripPace) => TRIP_PACES.find(p => p.id === pace)!;

/**
 * Areas to plan around when there is no fixed starting point. Their centres
 * are only where places are looked up; they are never shown as a stop and
 * never added to a route.
 */
export type TripArea = 'nashik' | 'trimbakeshwar';

export const TRIP_AREAS: { id: TripArea; label: string; centre: GeoPoint }[] = [
  { id: 'nashik', label: 'Nashik – Panchavati area', centre: { lat: 20.0076, lon: 73.792 } },
  { id: 'trimbakeshwar', label: 'Trimbakeshwar area', centre: { lat: 19.9326, lon: 73.5307 } },
];

export const isTripArea = (value: unknown): value is TripArea => TRIP_AREAS.some(a => a.id === value);

/** Longest starting-point label accepted, in characters. */
export const MAX_START_LABEL_LENGTH = 120;

/**
 * Where the trip starts. A `point` (a chosen place or the user's location)
 * starts every day's route; an `area` only says where to look for places.
 */
export type TripStart =
  | { type: 'area'; area: TripArea }
  | { type: 'point'; lat: number; lon: number; label: string };

export interface ItineraryRequest {
  days: number;
  start: TripStart;
  interests: TripInterest[];
  budget: TripBudget;
  pace: TripPace;
  mode: TravelMode;
}

// ---------------------------------------------------------------------------
// Candidate places (from OpenStreetMap)
// ---------------------------------------------------------------------------

export type TripPlaceCategory =
  | 'worship'
  | 'historic'
  | 'museum'
  | 'attraction'
  | 'viewpoint'
  | 'nature'
  | 'market'
  | 'shopping'
  | 'food';

export const TRIP_PLACE_CATEGORIES: { id: TripPlaceCategory; label: string; color: string }[] = [
  { id: 'worship', label: 'Temple or place of worship', color: '#ea580c' },
  { id: 'historic', label: 'Historic site', color: '#92400e' },
  { id: 'museum', label: 'Museum or gallery', color: '#7c3aed' },
  { id: 'attraction', label: 'Attraction', color: '#9333ea' },
  { id: 'viewpoint', label: 'Viewpoint', color: '#0891b2' },
  { id: 'nature', label: 'Park or nature', color: '#15803d' },
  { id: 'market', label: 'Market', color: '#b45309' },
  { id: 'shopping', label: 'Shop', color: '#be185d' },
  { id: 'food', label: 'Food', color: '#16a34a' },
];

/** Which kinds of mapped place can answer each interest. */
export const INTEREST_CATEGORIES: Record<TripInterest, TripPlaceCategory[]> = {
  pilgrimage: ['worship', 'attraction'],
  temples: ['worship'],
  history: ['historic', 'museum'],
  architecture: ['historic', 'worship'],
  nature: ['nature', 'viewpoint'],
  food: ['food'],
  shopping: ['shopping', 'market'],
  local_markets: ['market', 'shopping'],
  sightseeing: ['attraction', 'viewpoint', 'museum', 'historic'],
};

/** A few OpenStreetMap tags kept as evidence for the AI. Contributor-entered and unchecked. */
export interface TripPlaceDetails {
  religion?: string;
  denomination?: string;
  cuisine?: string;
  historic?: string;
  heritage?: string;
  fee?: string;
  description?: string;
}

/** A named place from OpenStreetMap that the AI may choose. */
export interface TripCandidate {
  /** `node/123`, `way/456` or `relation/789`: the stable id the AI must use. */
  id: string;
  osmUrl: string;
  name: string;
  category: TripPlaceCategory;
  /** What it is, e.g. "Hindu place of worship" or "Historic fort". */
  kind: string;
  lat: number;
  lon: number;
  address: string | null;
  /** The raw `opening_hours` tag. Possibly out of date. */
  openingHours: string | null;
  details: TripPlaceDetails;
  /** Has a Wikipedia or Wikidata tag. Used only to rank; never shown as "famous". */
  hasEncyclopediaLink: boolean;
  sourceType: 'COMMUNITY';
}

export interface TripCandidatesResponse {
  places: TripCandidate[];
  /** The rounded point the lookup used. */
  centre: GeoPoint;
  radiusM: number;
  fetchedAt: string;
  dataTimestamp: string | null;
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// The itinerary
// ---------------------------------------------------------------------------

export interface ItineraryStop {
  /** The OpenStreetMap id from the candidate list. */
  placeId: string;
  /** From OpenStreetMap, never from the AI. */
  name: string;
  category: TripPlaceCategory;
  kind: string;
  lat: number;
  lon: number;
  address: string | null;
  openingHours: string | null;
  osmUrl: string;
  /** The AI's explanation of why this place fits. Not checked. */
  reason: string | null;
  /** The AI's suggested time at the place, in minutes, or null. */
  visitMinutes: number | null;
}

/**
 * The road route for one day.
 * - `ok`: `route` holds the routing provider's real line, distance and time.
 * - `not_configured`: routing is not set up on the server.
 * - `too_few_stops`: fewer than two points, so there is nothing to route.
 * - `failed`: the provider failed for this day (`code` says why).
 * - `skipped`: not tried, because routing had just failed for an earlier day.
 * Every status except `ok` has `route: null`: no distance, time or line.
 */
export type DayRouteStatus = 'ok' | 'not_configured' | 'too_few_stops' | 'failed' | 'skipped';

export interface DayRoute {
  status: DayRouteStatus;
  route: RouteResponse | null;
  code: string | null;
  message: string | null;
}

export interface ItineraryDay {
  day: number;
  title: string;
  summary: string;
  stops: ItineraryStop[];
  route: DayRoute;
}

export interface ItineraryResponse {
  summary: string;
  dayCount: number;
  mode: TravelMode;
  budget: TripBudget;
  pace: TripPace;
  interests: TripInterest[];
  /** Where every day's route starts (rounded to ~11 m), or null when planning around an area. */
  start: { lat: number; lon: number; label: string } | null;
  /** The starting place or area, for headings. */
  startLabel: string;
  days: ItineraryDay[];
  /** Things the user should know, e.g. a suggestion that was left out. */
  warnings: string[];
  places: {
    source: 'OPENSTREETMAP_OVERPASS';
    attribution: string;
    /** How many candidates the AI could choose from. */
    candidateCount: number;
    dataTimestamp: string | null;
  };
  ai: { provider: 'GEMINI'; model: string; generatedAt: string };
  routing: { configured: boolean };
}

/** GET /api/itinerary/status. Says only what is set up, never how. */
export interface ItineraryStatus {
  aiConfigured: boolean;
  routingConfigured: boolean;
  minDays: number;
  maxDays: number;
}

// ---------------------------------------------------------------------------
// Helpers used by the server and by the editable itinerary
// ---------------------------------------------------------------------------

/** The points a day's route goes through: the start (if any), then the stops in order. */
export function dayRoutePoints(start: GeoPoint | null, stops: GeoPoint[]): GeoPoint[] {
  return start ? [start, ...stops.map(s => ({ lat: s.lat, lon: s.lon }))] : stops.map(s => ({ lat: s.lat, lon: s.lon }));
}

/** A copy of `list` with item `index` moved one place earlier (-1) or later (1). */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** A copy of `list` without item `index`. */
export function removeItem<T>(list: T[], index: number): T[] {
  return index < 0 || index >= list.length ? list : list.filter((_, i) => i !== index);
}

/**
 * The last route request made for one day of the editable itinerary, keyed
 * by `routeKey(mode, points)` of the stops it was made for.
 */
export type DayRouteState =
  | { status: 'none' }
  | { status: 'ok'; key: string; data: RouteResponse }
  | { status: 'loading'; key: string; slow: boolean }
  | { status: 'error'; key: string; code: string; message: string; canRetry: boolean };

/** What a day's route section shows. Only `ok` has a distance, a time or a line. */
export type DayRouteView =
  | { kind: 'not_configured' }
  | { kind: 'too_few_stops' }
  | { kind: 'ok'; route: RouteResponse }
  | { kind: 'loading'; slow: boolean }
  | { kind: 'error'; code: string; message: string; canRetry: boolean }
  | { kind: 'outdated' };

/**
 * A day's route section for its points (start first) and mode right now.
 * A stored result is used only when it was made for exactly these points in
 * this order and this mode; otherwise a route already fetched for them, or
 * `outdated`. So after an edit no old line, distance, time, spinner or error
 * is shown for stops it was not made for.
 */
export function dayRouteView(
  day: { routingConfigured: boolean; points: GeoPoint[]; mode: TravelMode; state: DayRouteState },
  cached: (key: string) => RouteResponse | undefined,
): DayRouteView {
  if (!day.routingConfigured) return { kind: 'not_configured' };
  if (day.points.length < MIN_ROUTE_STOPS) return { kind: 'too_few_stops' };
  const key = routeKey(day.mode, day.points);
  const s = day.state;
  if (s.status !== 'none' && s.key === key) {
    if (s.status === 'ok') return { kind: 'ok', route: s.data };
    if (s.status === 'loading') return { kind: 'loading', slow: s.slow };
    return { kind: 'error', code: s.code, message: s.message, canRetry: s.canRetry };
  }
  const hit = cached(key);
  return hit ? { kind: 'ok', route: hit } : { kind: 'outdated' };
}

/**
 * A day's route state once its pending request has been cancelled, as an
 * edit to its stops does. `loading` is dropped: kept, it would spin forever
 * if the edit were undone, with nothing fetching and no way to ask again.
 */
export const withoutPendingRoute = (state: DayRouteState): DayRouteState =>
  state.status === 'loading' ? { status: 'none' } : state;
