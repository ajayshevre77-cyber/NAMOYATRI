/**
 * Server-side access to OpenStreetMap services for the map screen.
 *
 * - Nearby places: Overpass API.
 * - Place search (geocoding): Nominatim.
 *
 * Both are free community services with usage policies, so every call goes
 * through here rather than straight from browsers:
 * - Results are cached in memory (Nominatim requires caching).
 * - Calls to each service run one at a time, spaced out (Nominatim allows at
 *   most 1 request per second).
 * - A 429 or an overload reply pauses that endpoint for 30 seconds, as the
 *   Overpass policy asks.
 * - Requests carry an identifying User-Agent, not a library default.
 *
 * None of this is suitable for Kumbh-scale traffic. Production needs a
 * self-hosted or paid Overpass/Nominatim, set through the env vars below.
 */
import {
  GeoPoint,
  GeoSearchResult,
  LivePlace,
  LivePlaceCategory,
  NearbyPlacesResponse,
  GeoSearchResponse,
  OSM_ATTRIBUTION,
  haversineKm,
  isInServiceArea,
  roundPoint,
  SERVICE_AREA,
} from '../src/lib/geo';

/** An error with the HTTP status and stable code the route should answer with. */
export class GeoServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

// Env is read when used, not at import: server.ts runs dotenv.config() after
// its imports have been evaluated.
const DEFAULT_OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  // Fallback while the main instance is overloaded. Its copy of the data can
  // lag weeks behind; responses carry the data timestamp so the UI can say so.
  'https://overpass.private.coffee/api/interpreter',
];
const DEFAULT_NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

function overpassUrls(): string[] {
  const configured = (process.env.OVERPASS_API_URLS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_OVERPASS_URLS;
}

function nominatimBaseUrl(): string {
  return (process.env.NOMINATIM_API_URL || DEFAULT_NOMINATIM_URL).replace(/\/+$/, '');
}

export function userAgent(): string {
  const contact = process.env.GEO_CONTACT?.trim();
  return `NamoYatri/0.2 (Simhastha Kumbh 2027 pilgrim app, demo prototype${contact ? `; ${contact}` : ''})`;
}

/** Upstream fetch. Replaced by a stub in tests so they never touch the real services. */
const realFetch: typeof fetch = (input, init) => fetch(input, init);
let geoFetch: typeof fetch = realFetch;

export function setGeoFetchForTests(impl: typeof fetch | null): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('setGeoFetchForTests is only for tests');
  geoFetch = impl ?? realFetch;
}

// ---------------------------------------------------------------------------
// Cache, serial gate and back-off
// ---------------------------------------------------------------------------

export class TtlCache<V> {
  private entries = new Map<string, { value: V; expires: number }>();
  constructor(private ttlMs: number, private maxEntries: number) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      // Map keeps insertion order, so the first key is the oldest.
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Runs upstream calls one at a time, at least `minIntervalMs` apart, and
 * refuses new work (with `onFull()`) when too many requests are already waiting.
 */
export function createSerialGate(
  minIntervalMs: number,
  maxQueued: number,
  onFull: () => GeoServiceError = () =>
    new GeoServiceError(503, 'GEO_UPSTREAM_BUSY', 'Too many map lookups are waiting. Please try again shortly.', 5),
) {
  let tail: Promise<void> = Promise.resolve();
  let lastStart = 0;
  let queued = 0;

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (queued >= maxQueued) throw onFull();
    queued++;
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => (release = resolve));
    try {
      await previous;
      const wait = lastStart + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastStart = Date.now();
      return await task();
    } finally {
      queued--;
      release();
    }
  };
}

const BACKOFF_MS = 30_000;

let nearbyCache = new TtlCache<NearbyPlacesResponse>(6 * 60 * 60 * 1000, 300);
let searchCache = new TtlCache<GeoSearchResponse>(24 * 60 * 60 * 1000, 500);
let nearbyInFlight = new Map<string, Promise<NearbyPlacesResponse>>();
let searchInFlight = new Map<string, Promise<GeoSearchResponse>>();
let overpassGate = createSerialGate(1000, 4);
let nominatimGate = createSerialGate(1100, 5);
/** Per upstream URL: no calls before this time. */
let blockedUntil = new Map<string, number>();

export function resetGeoStateForTests(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('resetGeoStateForTests is only for tests');
  nearbyCache = new TtlCache<NearbyPlacesResponse>(6 * 60 * 60 * 1000, 300);
  searchCache = new TtlCache<GeoSearchResponse>(24 * 60 * 60 * 1000, 500);
  nearbyInFlight = new Map();
  searchInFlight = new Map();
  overpassGate = createSerialGate(1000, 4);
  nominatimGate = createSerialGate(1100, 5);
  blockedUntil = new Map();
}

function secondsBlocked(url: string): number {
  return Math.max(0, Math.ceil(((blockedUntil.get(url) ?? 0) - Date.now()) / 1000));
}

function busyError(label: string, retryAfterSeconds: number): GeoServiceError {
  return new GeoServiceError(
    503,
    'GEO_UPSTREAM_BUSY',
    `${label} is busy right now. Please try again in about ${retryAfterSeconds} seconds.`,
    retryAfterSeconds,
  );
}

/**
 * One upstream request, turned into JSON or a GeoServiceError. A 429, 406,
 * overload status or timeout pauses this URL for 30 seconds.
 */
async function fetchUpstreamJson(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<unknown> {
  const baseUrl = url.split('?')[0];
  let res: Response;
  try {
    res = await geoFetch(url, {
      ...init,
      headers: { 'User-Agent': userAgent(), Accept: 'application/json', ...(init.headers as Record<string, string>) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      blockedUntil.set(baseUrl, Date.now() + BACKOFF_MS);
      throw new GeoServiceError(504, 'GEO_UPSTREAM_TIMEOUT', `${label} did not answer in time. Please try again.`);
    }
    throw new GeoServiceError(502, 'GEO_UPSTREAM_UNREACHABLE', `${label} could not be reached. Please try again.`);
  }

  if ([406, 429, 503, 504].includes(res.status)) {
    blockedUntil.set(baseUrl, Date.now() + BACKOFF_MS);
    throw busyError(label, BACKOFF_MS / 1000);
  }
  if (!res.ok) {
    throw new GeoServiceError(502, 'GEO_UPSTREAM_FAILED', `${label} returned an error (${res.status}). Please try again.`);
  }
  try {
    return await res.json();
  } catch {
    throw new GeoServiceError(502, 'GEO_UPSTREAM_BAD_RESPONSE', `${label} sent a reply we could not read. Please try again.`);
  }
}

// ---------------------------------------------------------------------------
// Overpass: nearby places
// ---------------------------------------------------------------------------

const AMENITY_CATEGORIES: Record<string, { category: LivePlaceCategory; kind: string }> = {
  place_of_worship: { category: 'worship', kind: 'Place of worship' },
  hospital: { category: 'medical', kind: 'Hospital' },
  clinic: { category: 'medical', kind: 'Clinic' },
  doctors: { category: 'medical', kind: 'Doctor' },
  pharmacy: { category: 'medical', kind: 'Pharmacy' },
  restaurant: { category: 'food', kind: 'Restaurant' },
  cafe: { category: 'food', kind: 'Café' },
  fast_food: { category: 'food', kind: 'Fast food' },
  food_court: { category: 'food', kind: 'Food court' },
  toilets: { category: 'toilets', kind: 'Toilets' },
  drinking_water: { category: 'drinking_water', kind: 'Drinking water' },
  parking: { category: 'parking', kind: 'Parking' },
  atm: { category: 'atm', kind: 'ATM' },
  bank: { category: 'atm', kind: 'Bank' },
};

const TOURISM_CATEGORIES: Record<string, { category: LivePlaceCategory; kind: string }> = {
  attraction: { category: 'attraction', kind: 'Tourist attraction' },
  viewpoint: { category: 'attraction', kind: 'Viewpoint' },
  museum: { category: 'attraction', kind: 'Museum' },
};

const RELIGION_LABELS: Record<string, string> = {
  hindu: 'Hindu',
  jain: 'Jain',
  buddhist: 'Buddhist',
  muslim: 'Muslim',
  christian: 'Christian',
  sikh: 'Sikh',
};

/** Categories where a place marked private is no use to a pilgrim. */
const PUBLIC_ONLY: LivePlaceCategory[] = ['toilets', 'parking', 'drinking_water'];

/** At most this many places per category, nearest first. */
export const MAX_PLACES_PER_CATEGORY = 60;

/**
 * Maps OpenStreetMap tags to one of our categories, or null to drop it.
 * A temple that is also tagged as an attraction counts as worship.
 */
export function classifyOsmTags(tags: Record<string, string>): { category: LivePlaceCategory; kind: string } | null {
  const amenity = AMENITY_CATEGORIES[tags.amenity];
  const tourism = TOURISM_CATEGORIES[tags.tourism];
  const match = amenity ?? tourism;
  if (!match) return null;

  if (PUBLIC_ONLY.includes(match.category) && ['private', 'no'].includes(tags.access)) return null;

  if (match.category === 'worship' && RELIGION_LABELS[tags.religion]) {
    return { category: 'worship', kind: `${RELIGION_LABELS[tags.religion]} place of worship` };
  }
  return match;
}

export function buildOverpassQuery(centre: GeoPoint, radiusM: number): string {
  const around = `(around:${radiusM},${centre.lat},${centre.lon})`;
  const amenities = Object.keys(AMENITY_CATEGORIES).join('|');
  const tourism = Object.keys(TOURISM_CATEGORIES).join('|');
  return (
    `[out:json][timeout:15];(` +
    `nwr["amenity"~"^(${amenities})$"]${around};` +
    `nwr["tourism"~"^(${tourism})$"]${around};` +
    `);out center tags;`
  );
}

const clip = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/**
 * Turns an Overpass JSON reply into our places, nearest first, at most
 * MAX_PLACES_PER_CATEGORY per category. Elements without coordinates or a
 * known category are dropped.
 */
export function parseOverpassElements(body: unknown, centre: GeoPoint): { places: LivePlace[]; truncated: boolean } {
  const elements = (body as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) {
    throw new GeoServiceError(502, 'GEO_UPSTREAM_BAD_RESPONSE', 'OpenStreetMap sent a reply we could not read. Please try again.');
  }

  const seen = new Set<string>();
  const withDistance: { place: LivePlace; km: number }[] = [];

  for (const el of elements as any[]) {
    if (!el || !['node', 'way', 'relation'].includes(el.type) || !Number.isSafeInteger(el.id)) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;

    const lat = el.type === 'node' ? el.lat : el.center?.lat;
    const lon = el.type === 'node' ? el.lon : el.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const tags: Record<string, string> = el.tags && typeof el.tags === 'object' ? el.tags : {};
    const match = classifyOsmTags(tags);
    if (!match) continue;
    seen.add(id);

    const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'] ?? tags['addr:city']]
      .map(part => clip(part, 80))
      .filter(Boolean)
      .join(', ');

    const place: LivePlace = {
      id,
      osmUrl: `https://www.openstreetmap.org/${id}`,
      category: match.category,
      kind: match.kind,
      name: clip(tags.name, 120),
      localNames: {
        ...(clip(tags['name:en'], 120) ? { en: clip(tags['name:en'], 120)! } : {}),
        ...(clip(tags['name:hi'], 120) ? { hi: clip(tags['name:hi'], 120)! } : {}),
        ...(clip(tags['name:mr'], 120) ? { mr: clip(tags['name:mr'], 120)! } : {}),
      },
      lat,
      lon,
      openingHours: clip(tags.opening_hours, 200),
      address: address || null,
      sourceType: 'COMMUNITY',
    };
    withDistance.push({ place, km: haversineKm(centre, { lat, lon }) });
  }

  withDistance.sort((a, b) => a.km - b.km);

  const perCategory = new Map<LivePlaceCategory, number>();
  let truncated = false;
  const places: LivePlace[] = [];
  for (const { place } of withDistance) {
    const count = perCategory.get(place.category) ?? 0;
    if (count >= MAX_PLACES_PER_CATEGORY) {
      truncated = true;
      continue;
    }
    perCategory.set(place.category, count + 1);
    places.push(place);
  }
  return { places, truncated };
}

/**
 * Overpass answers an overloaded or timed-out query with 200 and a
 * "runtime error" remark, plus whatever partial data it had. Partial data
 * must not be shown as the full list.
 */
function overpassRemarkIsError(body: unknown): boolean {
  const remark = (body as { remark?: unknown })?.remark;
  return typeof remark === 'string' && /error|timed out/i.test(remark);
}

async function queryOverpass(centre: GeoPoint, radiusM: number): Promise<NearbyPlacesResponse> {
  const query = buildOverpassQuery(centre, radiusM);
  let lastError: GeoServiceError | null = null;

  for (const url of overpassUrls()) {
    const blocked = secondsBlocked(url);
    if (blocked > 0) {
      lastError = busyError('The OpenStreetMap place service', blocked);
      continue;
    }
    try {
      const body = await overpassGate(() =>
        fetchUpstreamJson(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ data: query }).toString(),
          },
          18_000,
          'The OpenStreetMap place service',
        ),
      );
      if (overpassRemarkIsError(body)) {
        blockedUntil.set(url, Date.now() + BACKOFF_MS);
        throw busyError('The OpenStreetMap place service', BACKOFF_MS / 1000);
      }
      const { places, truncated } = parseOverpassElements(body, centre);
      const timestamp = (body as any)?.osm3s?.timestamp_osm_base;
      return {
        places,
        centre,
        radiusM,
        source: 'OPENSTREETMAP_OVERPASS',
        attribution: OSM_ATTRIBUTION,
        fetchedAt: new Date().toISOString(),
        dataTimestamp: typeof timestamp === 'string' && !Number.isNaN(Date.parse(timestamp)) ? timestamp : null,
        truncated,
      };
    } catch (err) {
      if (!(err instanceof GeoServiceError)) throw err;
      lastError = err;
      // Our own queue being full is not this endpoint's fault: stop here.
      if (err.code === 'GEO_UPSTREAM_BUSY' && secondsBlocked(url) === 0) break;
    }
  }
  throw lastError ?? new GeoServiceError(502, 'GEO_UPSTREAM_FAILED', 'No OpenStreetMap place service is configured.');
}

/**
 * Places around `point` within `radiusM`. The point is rounded to about
 * 100 m first, which is also the cache key, so nobody's exact position is
 * passed on and nearby users share one lookup.
 */
export async function findNearbyPlaces(point: GeoPoint, radiusM: number): Promise<NearbyPlacesResponse> {
  const centre = roundPoint(point);
  if (!isInServiceArea(centre)) {
    throw new GeoServiceError(400, 'OUTSIDE_SERVICE_AREA', `Nearby search covers the ${SERVICE_AREA.name} only.`);
  }

  const key = `${centre.lat},${centre.lon},${radiusM}`;
  const cached = nearbyCache.get(key);
  if (cached) return cached;

  const pending = nearbyInFlight.get(key);
  if (pending) return pending;

  const request = queryOverpass(centre, radiusM)
    .then(result => {
      nearbyCache.set(key, result);
      return result;
    })
    .finally(() => nearbyInFlight.delete(key));
  nearbyInFlight.set(key, request);
  return request;
}

// ---------------------------------------------------------------------------
// Nominatim: search
// ---------------------------------------------------------------------------

const humanise = (value: unknown): string =>
  typeof value === 'string' && value ? (value.charAt(0).toUpperCase() + value.slice(1)).replace(/_/g, ' ') : 'Place';

export function parseNominatimResults(body: unknown): GeoSearchResult[] {
  if (!Array.isArray(body)) {
    throw new GeoServiceError(502, 'GEO_UPSTREAM_BAD_RESPONSE', 'The search service sent a reply we could not read. Please try again.');
  }
  const results: GeoSearchResult[] = [];
  for (const item of body as any[]) {
    const lat = Number(item?.lat);
    const lon = Number(item?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isInServiceArea({ lat, lon })) continue;

    const displayName = clip(item.display_name, 300) ?? '';
    const name = clip(item.name, 120) ?? displayName.split(',')[0].trim();
    if (!name) continue;

    const osmType = ['node', 'way', 'relation'].includes(item.osm_type) ? item.osm_type : null;
    const osmId = Number.isSafeInteger(Number(item.osm_id)) ? Number(item.osm_id) : null;
    const id = osmType && osmId !== null ? `${osmType}/${osmId}` : `nominatim/${item.place_id ?? results.length}`;

    if (results.some(r => r.id === id)) continue;
    results.push({
      id,
      osmUrl: osmType && osmId !== null ? `https://www.openstreetmap.org/${osmType}/${osmId}` : null,
      name,
      displayName: displayName || name,
      kind: humanise(item.type ?? item.category),
      lat,
      lon,
      sourceType: 'COMMUNITY',
    });
  }
  return results;
}

/** Normalised so trivially different spellings share one cache entry. */
export function normaliseSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Searches Nominatim, limited to the service area. Called only when the user
 * submits a search: the Nominatim policy forbids search-as-you-type.
 */
export async function searchPlaces(query: string, language: 'en' | 'hi' | 'mr'): Promise<GeoSearchResponse> {
  const q = normaliseSearchQuery(query);
  const key = `${language}|${q}`;
  const cached = searchCache.get(key);
  if (cached) return cached;

  const pending = searchInFlight.get(key);
  if (pending) return pending;

  const base = `${nominatimBaseUrl()}/search`;
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '8',
    countrycodes: 'in',
    viewbox: `${SERVICE_AREA.west},${SERVICE_AREA.north},${SERVICE_AREA.east},${SERVICE_AREA.south}`,
    bounded: '1',
    'accept-language': language,
  });

  const request = (async () => {
    const blocked = secondsBlocked(base);
    if (blocked > 0) throw busyError('The place search service', blocked);
    const body = await nominatimGate(() =>
      fetchUpstreamJson(`${base}?${params.toString()}`, { method: 'GET' }, 10_000, 'The place search service'),
    );
    const result: GeoSearchResponse = {
      results: parseNominatimResults(body),
      source: 'OPENSTREETMAP_NOMINATIM',
      attribution: OSM_ATTRIBUTION,
    };
    searchCache.set(key, result);
    return result;
  })().finally(() => searchInFlight.delete(key));

  searchInFlight.set(key, request);
  return request;
}
