/**
 * Map and place-discovery helpers shared by the client and the server, the
 * same way `fare.ts` is shared. No network calls here: the server talks to
 * OpenStreetMap services (see `server/geo.ts`), the client to our own API
 * (see `geoApi.ts`).
 */

export interface GeoPoint {
  lat: number;
  lon: number;
}

/**
 * The area the map and nearby search cover: Nashik city, Nashik Road and
 * Trimbakeshwar, with some margin. The server refuses nearby lookups outside
 * it, so it cannot be used as a free proxy for the whole world.
 */
export const SERVICE_AREA = {
  name: 'Nashik–Trimbakeshwar area',
  south: 19.75,
  west: 73.35,
  north: 20.25,
  east: 74.05,
};

/** Rough middle of Nashik city, used only to say how far away someone is. */
export const NASHIK_CENTRE: GeoPoint = { lat: 20.0, lon: 73.79 };

export function isInServiceArea(point: GeoPoint): boolean {
  return (
    point.lat >= SERVICE_AREA.south &&
    point.lat <= SERVICE_AREA.north &&
    point.lon >= SERVICE_AREA.west &&
    point.lon <= SERVICE_AREA.east
  );
}

/** Nearby search radii offered to the user, in metres. */
export const NEARBY_RADII_M = [500, 1000, 2000, 5000] as const;
export type NearbyRadius = (typeof NEARBY_RADII_M)[number];
export const DEFAULT_NEARBY_RADIUS_M: NearbyRadius = 2000;

/**
 * Decimal places kept when a point leaves the browser. 3 places is about
 * 110 m north–south and 105 m east–west here, so the server and OpenStreetMap
 * never see a precise GPS fix, and nearby lookups from the same spot share
 * one cache entry.
 */
export const SHARED_COORD_DECIMALS = 3;

export function roundPoint(point: GeoPoint, decimals = SHARED_COORD_DECIMALS): GeoPoint {
  const f = 10 ** decimals;
  return { lat: Math.round(point.lat * f) / f, lon: Math.round(point.lon * f) / f };
}

const EARTH_RADIUS_KM = 6371.0088;

/** Straight-line (great-circle) distance. Not a road or walking distance. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "80 m", "950 m", "1.2 km", "14 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

// ---------------------------------------------------------------------------
// Live places from OpenStreetMap
// ---------------------------------------------------------------------------

export type LivePlaceCategory =
  | 'worship'
  | 'attraction'
  | 'food'
  | 'medical'
  | 'toilets'
  | 'drinking_water'
  | 'parking'
  | 'atm';

/** Display order, labels and marker colours for the category filters. */
export const LIVE_PLACE_CATEGORIES: { id: LivePlaceCategory; label: string; color: string }[] = [
  { id: 'worship', label: 'Temples & worship', color: '#ea580c' },
  { id: 'attraction', label: 'Attractions', color: '#9333ea' },
  { id: 'food', label: 'Food', color: '#16a34a' },
  { id: 'medical', label: 'Medical', color: '#dc2626' },
  { id: 'toilets', label: 'Toilets', color: '#475569' },
  { id: 'drinking_water', label: 'Drinking water', color: '#0d9488' },
  { id: 'parking', label: 'Parking', color: '#4f46e5' },
  { id: 'atm', label: 'ATM & bank', color: '#a16207' },
];

/**
 * A point of interest as OpenStreetMap contributors mapped it. Nothing here
 * is checked by Namo Yatri or any authority, hence `COMMUNITY`.
 */
export interface LivePlace {
  /** `node/123`, `way/456` or `relation/789`. */
  id: string;
  osmUrl: string;
  category: LivePlaceCategory;
  /** What it is, e.g. "Hindu place of worship" or "Pharmacy". */
  kind: string;
  /** null when OpenStreetMap has no name for it. */
  name: string | null;
  localNames: { en?: string; hi?: string; mr?: string };
  lat: number;
  lon: number;
  /** The raw `opening_hours` tag. Contributor-entered and possibly out of date. */
  openingHours: string | null;
  address: string | null;
  sourceType: 'COMMUNITY';
}

export interface NearbyPlacesResponse {
  places: LivePlace[];
  /** The rounded point the lookup actually used. */
  centre: GeoPoint;
  radiusM: number;
  source: 'OPENSTREETMAP_OVERPASS';
  attribution: string;
  /** When our server fetched this from Overpass (it may have been cached since). */
  fetchedAt: string;
  /** How current the OpenStreetMap copy that answered was, if it said. */
  dataTimestamp: string | null;
  /** True when some categories were cut to the nearest results. */
  truncated: boolean;
}

/** One geocoding match from Nominatim. */
export interface GeoSearchResult {
  id: string;
  osmUrl: string | null;
  name: string;
  displayName: string;
  kind: string;
  lat: number;
  lon: number;
  sourceType: 'COMMUNITY';
}

export interface GeoSearchResponse {
  results: GeoSearchResult[];
  /**
   * Set when the words searched for found nothing and these results came from
   * the one alternative spelling the server tried instead (e.g. "Kalaram
   * Mandir" for "Kalaram Temple"); null otherwise.
   */
  alternativeQuery: string | null;
  source: 'OPENSTREETMAP_NOMINATIM';
  attribution: string;
}

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors, ODbL';
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

/** Name to show in the chosen language, falling back to the main OSM name. */
export function livePlaceName(place: LivePlace, language: 'en' | 'hi' | 'mr'): string | null {
  return place.localNames[language] || place.name || place.localNames.en || null;
}

// ---------------------------------------------------------------------------
// Browser location errors
// ---------------------------------------------------------------------------

export type LocationProblem = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout';

/**
 * Plain-language explanation of why we have no location, and whether trying
 * again could help. Codes follow GeolocationPositionError: 1 denied,
 * 2 unavailable, 3 timeout.
 */
export function describeLocationProblem(problem: LocationProblem): { message: string; canRetry: boolean } {
  switch (problem) {
    case 'unsupported':
      return { message: 'This browser cannot share your location. Search for a place or move the map instead.', canRetry: false };
    case 'insecure':
      return {
        message: 'Browsers only share location over a secure (https) connection. Search for a place or move the map instead.',
        canRetry: false,
      };
    case 'denied':
      return {
        message:
          'Location permission is off, so the map is not using your location. You can still search or move the map and tap “Search this area”. To use your location, allow it in your browser’s site settings.',
        canRetry: false,
      };
    case 'unavailable':
      return {
        message: 'Your device could not work out where you are. Check that location services are on, then try again.',
        canRetry: true,
      };
    case 'timeout':
      return {
        message: 'Finding your location took too long. Try again, ideally outdoors or near a window.',
        canRetry: true,
      };
  }
}

export function locationProblemFromCode(code: number): LocationProblem {
  if (code === 1) return 'denied';
  if (code === 3) return 'timeout';
  return 'unavailable';
}
