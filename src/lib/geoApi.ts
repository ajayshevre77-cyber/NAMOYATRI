import {
  GeoPoint,
  GeoSearchResponse,
  LocationProblem,
  NearbyPlacesResponse,
  locationProblemFromCode,
  roundPoint,
} from './geo';
import { RouteResponse, RoutingStatus, TravelMode, roundRouteStop } from './routing';

/** A failed map lookup, with the server's code when there was one. */
export class GeoRequestError extends Error {
  constructor(message: string, public code: string, public retryAfterSeconds?: number) {
    super(message);
  }
}

/**
 * Calls one of our map endpoints (/api/geo, /api/itinerary; GET unless `init`
 * says otherwise).
 * Throws GeoRequestError with a message fit to show the user. Rethrows
 * AbortError so callers can ignore it.
 */
export async function requestGeoJson<T>(url: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    throw new GeoRequestError('Could not reach the Namo Yatri server. Check your connection and try again.', 'NETWORK_ERROR');
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // Handled below: a non-JSON reply is never a success.
  }

  if (!res.ok || !body) {
    throw new GeoRequestError(
      typeof body?.error === 'string' ? body.error : `The server answered ${res.status}. Please try again.`,
      typeof body?.code === 'string' ? body.code : 'HTTP_' + res.status,
      typeof body?.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined,
    );
  }
  return body as T;
}

/**
 * Live places near `point`. The point is rounded to about 100 m here, before
 * it leaves the browser, so a precise GPS fix is never sent.
 */
export async function fetchNearbyPlaces(point: GeoPoint, radiusM: number, signal?: AbortSignal): Promise<NearbyPlacesResponse> {
  const { lat, lon } = roundPoint(point);
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radiusM) });
  const data = await requestGeoJson<NearbyPlacesResponse>(`/api/geo/nearby?${params}`, signal);
  if (!Array.isArray(data.places)) {
    throw new GeoRequestError('The server sent an unexpected reply. Please try again.', 'BAD_RESPONSE');
  }
  return data;
}

export async function searchGeo(query: string, language: string, signal?: AbortSignal): Promise<GeoSearchResponse> {
  const params = new URLSearchParams({ q: query, lang: language });
  const data = await requestGeoJson<GeoSearchResponse>(`/api/geo/search?${params}`, signal);
  if (!Array.isArray(data.results)) {
    throw new GeoRequestError('The server sent an unexpected reply. Please try again.', 'BAD_RESPONSE');
  }
  return data;
}

export async function fetchRoutingStatus(signal?: AbortSignal): Promise<RoutingStatus> {
  const data = await requestGeoJson<RoutingStatus>('/api/geo/route/status', signal);
  if (typeof data.configured !== 'boolean') {
    throw new GeoRequestError('The server sent an unexpected reply. Please try again.', 'BAD_RESPONSE');
  }
  return data;
}

/**
 * Road route through `stops` in this order. Each stop is rounded to about
 * 11 m before it leaves the browser. A reply without a line, distance and
 * time is an error, never a partial route.
 */
export async function fetchRoute(mode: TravelMode, stops: GeoPoint[], signal?: AbortSignal): Promise<RouteResponse> {
  const data = await requestGeoJson<RouteResponse>('/api/geo/route', signal, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, stops: stops.map(roundRouteStop) }),
  });
  if (
    !Array.isArray(data.path) || data.path.length < 2 ||
    typeof data.distanceM !== 'number' || typeof data.durationS !== 'number' ||
    !Array.isArray(data.legs) || data.legs.length !== stops.length - 1
  ) {
    throw new GeoRequestError('The server sent an unexpected reply. Please try again.', 'BAD_RESPONSE');
  }
  return data;
}

export interface UserPosition extends GeoPoint {
  /** Radius of uncertainty reported by the device, in metres. */
  accuracyM: number;
}

/**
 * Asks the browser for the current position. Only call this from a user
 * action: it is what triggers the permission prompt.
 */
export function requestCurrentPosition(): Promise<UserPosition> {
  return new Promise((resolve, reject: (problem: LocationProblem) => void) => {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      reject('insecure');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject('unsupported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
      err => reject(locationProblemFromCode(err.code)),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}
