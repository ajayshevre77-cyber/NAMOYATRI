/**
 * Road routes for the map's route planner.
 *
 * Everything specific to OpenRouteService is in `openRouteService` below: the
 * URL, the profile names, the request body, the reply parser and the error
 * mapping. `planRoute` adds what any provider needs: rounding, the service
 * area, the "not configured" state, caching, sharing identical requests,
 * pacing and back-off. To use another provider, write another
 * RoutingProvider and change `activeProvider`.
 *
 * Nothing here invents a route. Without a key, or when the provider fails,
 * the caller gets an error code and no distance, time or line.
 *
 * The API key is read from the environment, sent only in the Authorization
 * header, and never logged or returned.
 */
import { GeoPoint, isInServiceArea, SERVICE_AREA } from '../src/lib/geo';
import {
  MAX_ROUTE_STOPS,
  MIN_ROUTE_STOPS,
  OPENROUTESERVICE_ATTRIBUTION,
  RouteBounds,
  RouteLeg,
  RouteResponse,
  RoutingStatus,
  TRAVEL_MODES,
  TravelMode,
  geoJsonLineToLatLngs,
  isTravelMode,
  roundRouteStop,
  routeKey,
} from '../src/lib/routing';
import { GeoServiceError, TtlCache, createSerialGate, userAgent } from './geo';

interface RoutingProvider {
  id: RouteResponse['provider'];
  isConfigured(): boolean;
  /** Stops are already rounded and inside the service area. Throws GeoServiceError. */
  route(stops: GeoPoint[], mode: TravelMode): Promise<RouteResponse>;
}

/** Upstream fetch. Replaced by a stub in tests so they never call the real provider. */
const realFetch: typeof fetch = (input, init) => fetch(input, init);
let routingFetch: typeof fetch = realFetch;

export function setRoutingFetchForTests(impl: typeof fetch | null): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('setRoutingFetchForTests is only for tests');
  routingFetch = impl ?? realFetch;
}

// ---------------------------------------------------------------------------
// Back-off shared by every provider
// ---------------------------------------------------------------------------

type BlockCode = 'ROUTING_RATE_LIMITED' | 'ROUTING_PROVIDER_BUSY';
/** No provider calls before `until`; repeat `code` meanwhile. */
let blocked: { until: number; code: BlockCode } | null = null;

const BUSY_BACKOFF_S = 30;

function aboutDuration(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} minutes`;
  return `${Math.round(seconds / 3600)} hours`;
}

function blockedError(code: BlockCode, seconds: number): GeoServiceError {
  if (code === 'ROUTING_PROVIDER_BUSY') {
    return new GeoServiceError(
      503,
      code,
      `The routing service is busy right now. Please try again in about ${aboutDuration(seconds)}.`,
      seconds,
    );
  }
  return new GeoServiceError(
    503,
    code,
    seconds > 3600
      ? `Namo Yatri has used up today's route calculations with the routing service. Please try again in about ${aboutDuration(seconds)}.`
      : `Too many routes are being calculated through Namo Yatri right now. Please try again in about ${aboutDuration(seconds)}.`,
    seconds,
  );
}

/** Pauses every provider call for `seconds` and returns the error to throw now. */
function blockRouting(code: BlockCode, seconds: number): GeoServiceError {
  blocked = { until: Date.now() + seconds * 1000, code };
  return blockedError(code, seconds);
}

// ---------------------------------------------------------------------------
// OpenRouteService (hosted by HeiGIT)
// ---------------------------------------------------------------------------

// The hosted API moved here in 2026; api.openrouteservice.org is retired.
const DEFAULT_ORS_URL = 'https://api.heigit.org/openrouteservice/v2';
/** The value in .env.example. Treated as no key, so a copied example file fails clearly. */
const ORS_KEY_PLACEHOLDER = 'MY_OPENROUTESERVICE_API_KEY';
const ORS_PROFILES: Record<TravelMode, string> = { walking: 'foot-walking', driving: 'driving-car' };
const ORS_TIMEOUT_MS = 12_000;
/** The provider snaps each stop to a road within this distance (its default). */
const ORS_SNAP_RADIUS_M = 350;
/** Far more than any route inside the service area needs; a bigger line is not trusted. */
const MAX_PATH_POINTS = 20_000;

// Env is read when used: server.ts runs dotenv.config() after its imports.
function orsApiKey(): string | null {
  const key = process.env.OPENROUTESERVICE_API_KEY?.trim();
  return key && key !== ORS_KEY_PLACEHOLDER ? key : null;
}

function orsCustomUrl(): string | null {
  return process.env.OPENROUTESERVICE_API_URL?.trim() || null;
}

function orsBaseUrl(): string {
  return (orsCustomUrl() ?? DEFAULT_ORS_URL).replace(/\/+$/, '');
}

const badResponse = () =>
  new GeoServiceError(502, 'ROUTING_PROVIDER_BAD_RESPONSE', 'The routing service sent a reply we could not read. Please try again.');

const metric = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

function boundsOf(path: [number, number][]): RouteBounds {
  let south = 90, west = 180, north = -90, east = -180;
  for (const [lat, lon] of path) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lon);
    east = Math.max(east, lon);
  }
  return { south, west, north, east };
}

/**
 * Turns an OpenRouteService GeoJSON directions reply into our route. Checks
 * that the line is real coordinates, that there is one leg per pair of stops
 * and one way point per stop, and that the totals are there (or can be added
 * up from every leg). Anything else is a bad response, never a guess.
 */
export function parseOpenRouteServiceRoute(body: unknown, stops: GeoPoint[], mode: TravelMode): RouteResponse {
  const feature = (body as any)?.features?.[0];
  if (!feature || feature.type !== 'Feature' || feature.geometry?.type !== 'LineString') throw badResponse();

  const path = geoJsonLineToLatLngs(feature.geometry.coordinates);
  if (!path || path.length < 2 || path.length > MAX_PATH_POINTS) throw badResponse();

  const props = feature.properties && typeof feature.properties === 'object' ? feature.properties : {};
  const wayPoints = props.way_points;
  if (wayPoints !== undefined && (!Array.isArray(wayPoints) || wayPoints.length !== stops.length)) throw badResponse();
  const segments = props.segments;
  if (segments !== undefined && (!Array.isArray(segments) || segments.length !== stops.length - 1)) throw badResponse();

  const legs: RouteLeg[] = stops.slice(1).map((_, i) => ({
    fromStop: i,
    toStop: i + 1,
    distanceM: metric(segments?.[i]?.distance),
    durationS: metric(segments?.[i]?.duration),
  }));
  const sumOfLegs = (field: 'distanceM' | 'durationS') =>
    legs.every(l => l[field] !== null) ? legs.reduce((total, l) => total + (l[field] as number), 0) : null;

  const distanceM = metric(props.summary?.distance) ?? sumOfLegs('distanceM');
  const durationS = metric(props.summary?.duration) ?? sumOfLegs('durationS');
  if (distanceM === null || durationS === null) throw badResponse();

  const warnings = Array.isArray(props.warnings)
    ? [...new Set(
        props.warnings
          .map((w: any) => (typeof w?.message === 'string' ? w.message.trim().slice(0, 200) : ''))
          .filter(Boolean) as string[],
      )].slice(0, 5)
    : [];

  const engine = (body as any)?.metadata?.engine;
  const dataDate = [engine?.osm_date, engine?.graph_date].find(
    (d): d is string => typeof d === 'string' && !Number.isNaN(Date.parse(d)),
  );

  return {
    mode,
    stops,
    distanceM: Math.round(distanceM),
    durationS: Math.round(durationS),
    legs: legs.map(l => ({
      ...l,
      distanceM: l.distanceM === null ? null : Math.round(l.distanceM),
      durationS: l.durationS === null ? null : Math.round(l.durationS),
    })),
    path,
    bounds: boundsOf(path),
    warnings,
    provider: 'OPENROUTESERVICE',
    attribution: OPENROUTESERVICE_ATTRIBUTION,
    calculatedAt: new Date().toISOString(),
    dataTimestamp: dataDate ?? null,
  };
}

/** Seconds to wait after a 429, from Retry-After or the provider's reset header. */
function retryAfterFrom(headers: Headers): number {
  const retryAfter = Number(headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter);
  const reset = Number(headers.get('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    // An epoch time in ms or s, or a number of seconds.
    const seconds = reset > 1e12 ? (reset - Date.now()) / 1000 : reset > 1e9 ? reset - Date.now() / 1000 : reset;
    if (seconds > 0) return Math.min(Math.ceil(seconds), 24 * 60 * 60);
  }
  return 60;
}

/** Which of our stops a 2010 "could not find routable point ... coordinate N: lon lat" refers to. */
function unroutableStopNumber(message: unknown, stops: GeoPoint[]): number | null {
  if (typeof message !== 'string') return null;
  const match = /coordinate\s+\d+\s*:\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i.exec(message);
  if (!match) return null;
  const lon = Number(match[1]);
  const lat = Number(match[2]);
  const index = stops.findIndex(p => Math.abs(p.lon - lon) < 1e-4 && Math.abs(p.lat - lat) < 1e-4);
  return index >= 0 ? index + 1 : null;
}

/** Maps a failed reply to our codes. Provider wording is never passed to the user. */
function openRouteServiceError(res: Response, body: any, stops: GeoPoint[], mode: TravelMode): GeoServiceError {
  const orsCode = typeof body?.error?.code === 'number' ? body.error.code : null;
  const verb = TRAVEL_MODES.find(m => m.id === mode)?.verb ?? mode;

  if (res.status === 401 || res.status === 403) {
    console.warn(`[routing] OpenRouteService refused the API key (HTTP ${res.status}). Check OPENROUTESERVICE_API_KEY.`);
    return new GeoServiceError(
      502,
      'ROUTING_PROVIDER_AUTH_FAILED',
      'Route planning is unavailable: the routing service did not accept this server’s key.',
    );
  }
  if (res.status === 429) return blockRouting('ROUTING_RATE_LIMITED', retryAfterFrom(res.headers));
  if (orsCode === 2009) {
    return new GeoServiceError(
      422,
      'ROUTE_NOT_FOUND',
      `No ${verb} route was found between these stops. Try the other travel mode, or choose stops nearer a road.`,
    );
  }
  if (orsCode === 2010) {
    const stop = unroutableStopNumber(body?.error?.message, stops);
    return new GeoServiceError(
      422,
      'ROUTE_POINT_NOT_ROUTABLE',
      `${stop ? `Stop ${stop}` : 'One of the stops'} is more than ${ORS_SNAP_RADIUS_M} m from any road or path the routing service knows. Choose a point nearer a road.`,
    );
  }
  if (orsCode === 2004 || res.status === 413) {
    return new GeoServiceError(422, 'ROUTE_LIMIT_EXCEEDED', 'This route is longer, or has more stops, than the routing service allows.');
  }
  if ([502, 503, 504].includes(res.status)) return blockRouting('ROUTING_PROVIDER_BUSY', BUSY_BACKOFF_S);

  console.warn(`[routing] OpenRouteService failed: HTTP ${res.status}${orsCode !== null ? `, code ${orsCode}` : ''}.`);
  return new GeoServiceError(502, 'ROUTING_PROVIDER_FAILED', `The routing service returned an error (${res.status}). Please try again.`);
}

const openRouteService: RoutingProvider = {
  id: 'OPENROUTESERVICE',

  // A self-hosted instance (OPENROUTESERVICE_API_URL) may run without a key;
  // the hosted API always needs one.
  isConfigured: () => orsApiKey() !== null || orsCustomUrl() !== null,

  async route(stops, mode) {
    const key = orsApiKey();
    let res: Response;
    try {
      res = await routingFetch(`${orsBaseUrl()}/directions/${ORS_PROFILES[mode]}/geojson`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/geo+json, application/json',
          'User-Agent': userAgent(),
          ...(key ? { Authorization: key } : {}),
        },
        body: JSON.stringify({
          // GeoJSON order, [lon, lat], in the user's order.
          coordinates: stops.map(p => [p.lon, p.lat]),
          // Per-leg distance and time come back only with instructions on.
          instructions: true,
          units: 'm',
        }),
        signal: AbortSignal.timeout(ORS_TIMEOUT_MS),
      });
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new GeoServiceError(504, 'ROUTING_PROVIDER_TIMEOUT', 'The routing service did not answer in time. Please try again.');
      }
      throw new GeoServiceError(502, 'ROUTING_PROVIDER_UNREACHABLE', 'The routing service could not be reached. Please try again.');
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Handled below: a reply that is not JSON is never a route.
    }
    if (!res.ok) throw openRouteServiceError(res, body, stops, mode);
    if (body === null) throw badResponse();
    return parseOpenRouteServiceRoute(body, stops, mode);
  },
};

const activeProvider: RoutingProvider = openRouteService;

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * One call at a time, at least 1.5 s apart: the free OpenRouteService plan
 * allows 40 directions a minute (and 2,000 a day) for the whole app.
 */
const newRoutingGate = () =>
  createSerialGate(
    1500,
    5,
    () =>
      new GeoServiceError(
        503,
        'ROUTING_PROVIDER_BUSY',
        'Too many routes are waiting to be calculated. Please try again in a few seconds.',
        5,
      ),
  );

let routeCache = new TtlCache<RouteResponse>(6 * 60 * 60 * 1000, 300);
let routeInFlight = new Map<string, Promise<RouteResponse>>();
let routingGate = newRoutingGate();

export function resetRoutingStateForTests(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('resetRoutingStateForTests is only for tests');
  routeCache = new TtlCache<RouteResponse>(6 * 60 * 60 * 1000, 300);
  routeInFlight = new Map();
  routingGate = newRoutingGate();
  blocked = null;
}

export function getRoutingStatus(): RoutingStatus {
  return {
    configured: activeProvider.isConfigured(),
    provider: activeProvider.id,
    modes: TRAVEL_MODES.map(m => m.id),
    maxStops: MAX_ROUTE_STOPS,
  };
}

/**
 * The road route through `stops`, in the order given, for `mode`. Stops are
 * rounded to about 11 m first, which is also the cache key, so the same
 * route asked twice costs one provider call.
 */
export async function planRoute(stops: GeoPoint[], mode: TravelMode): Promise<RouteResponse> {
  if (!isTravelMode(mode)) {
    throw new GeoServiceError(400, 'INVALID_TRAVEL_MODE', 'Choose walking or driving.');
  }
  if (stops.length < MIN_ROUTE_STOPS || stops.length > MAX_ROUTE_STOPS) {
    throw new GeoServiceError(400, 'INVALID_ROUTE_STOPS', `A route needs ${MIN_ROUTE_STOPS} to ${MAX_ROUTE_STOPS} stops.`);
  }
  const rounded = stops.map(roundRouteStop);
  if (!rounded.every(isInServiceArea)) {
    throw new GeoServiceError(400, 'OUTSIDE_SERVICE_AREA', `Routes cover the ${SERVICE_AREA.name} only.`);
  }
  if (!activeProvider.isConfigured()) {
    throw new GeoServiceError(
      503,
      'ROUTING_NOT_CONFIGURED',
      'Route planning is not set up on this server yet, so no road routes, distances or travel times can be shown.',
    );
  }

  const key = routeKey(mode, rounded);
  const cached = routeCache.get(key);
  if (cached) return cached;
  const pending = routeInFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    if (blocked) {
      const seconds = Math.ceil((blocked.until - Date.now()) / 1000);
      if (seconds > 0) throw blockedError(blocked.code, seconds);
      blocked = null;
    }
    const route = await routingGate(() => activeProvider.route(rounded, mode));
    routeCache.set(key, route);
    return route;
  })().finally(() => routeInFlight.delete(key));

  routeInFlight.set(key, request);
  return request;
}
