/**
 * Server-side access to OpenStreetMap services for the map screen.
 *
 * - Nearby places: Overpass API.
 * - Candidate places for the AI trip planner: Overpass API, same queue.
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
import { TripCandidate, TripCandidatesResponse, TripPlaceCategory, TripPlaceDetails } from '../src/lib/itinerary';
import { alternativeSearchQuery } from '../src/lib/placeSearch';

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
  tripCache = new TtlCache<TripCandidatesResponse>(6 * 60 * 60 * 1000, 100);
  tripInFlight = new Map();
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

/** How current the Overpass copy that answered was, if it said. */
function overpassDataTimestamp(body: unknown): string | null {
  const timestamp = (body as any)?.osm3s?.timestamp_osm_base;
  return typeof timestamp === 'string' && !Number.isNaN(Date.parse(timestamp)) ? timestamp : null;
}

/**
 * Runs one Overpass query: each configured URL in turn, skipping any that is
 * backing off, through the shared queue. `parse` turns the reply into the
 * result; a GeoServiceError from it moves on to the next URL.
 */
async function runOverpass<T>(query: string, timeoutMs: number, parse: (body: unknown) => T): Promise<T> {
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
          timeoutMs,
          'The OpenStreetMap place service',
        ),
      );
      if (overpassRemarkIsError(body)) {
        blockedUntil.set(url, Date.now() + BACKOFF_MS);
        throw busyError('The OpenStreetMap place service', BACKOFF_MS / 1000);
      }
      return parse(body);
    } catch (err) {
      if (!(err instanceof GeoServiceError)) throw err;
      lastError = err;
      // Our own queue being full is not this endpoint's fault: stop here.
      if (err.code === 'GEO_UPSTREAM_BUSY' && secondsBlocked(url) === 0) break;
    }
  }
  throw lastError ?? new GeoServiceError(502, 'GEO_UPSTREAM_FAILED', 'No OpenStreetMap place service is configured.');
}

function queryOverpass(centre: GeoPoint, radiusM: number): Promise<NearbyPlacesResponse> {
  return runOverpass(buildOverpassQuery(centre, radiusM), 18_000, body => {
    const { places, truncated } = parseOverpassElements(body, centre);
    return {
      places,
      centre,
      radiusM,
      source: 'OPENSTREETMAP_OVERPASS',
      attribution: OSM_ATTRIBUTION,
      fetchedAt: new Date().toISOString(),
      dataTimestamp: overpassDataTimestamp(body),
      truncated,
    };
  });
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
// Overpass: candidate places for the AI trip planner
// ---------------------------------------------------------------------------

/**
 * The OpenStreetMap tags worth visiting on a trip. Broader than the nearby
 * search (history, nature, markets and shops too) and named places only,
 * since an itinerary cannot send anyone to "an unnamed temple".
 */
const TRIP_TAG_VALUES: Record<string, string[]> = {
  amenity: ['place_of_worship', 'marketplace', 'restaurant', 'cafe', 'fast_food', 'food_court'],
  tourism: ['attraction', 'viewpoint', 'museum', 'gallery'],
  historic: ['monument', 'fort', 'ruins', 'archaeological_site', 'castle', 'city_gate', 'heritage', 'tomb', 'building'],
  leisure: ['park', 'garden', 'nature_reserve'],
  natural: ['peak', 'waterfall', 'cave_entrance'],
  shop: ['mall', 'department_store', 'gift', 'souvenir', 'craft', 'art', 'books', 'religion'],
};

const TRIP_KIND_LABELS: Record<string, string> = {
  museum: 'Museum',
  gallery: 'Art gallery',
  viewpoint: 'Viewpoint',
  attraction: 'Tourist attraction',
  park: 'Park',
  garden: 'Garden',
  nature_reserve: 'Nature reserve',
  peak: 'Hill or peak',
  waterfall: 'Waterfall',
  cave_entrance: 'Cave',
  marketplace: 'Marketplace',
  mall: 'Shopping mall',
  department_store: 'Department store',
  gift: 'Gift shop',
  souvenir: 'Souvenir shop',
  craft: 'Craft shop',
  art: 'Art shop',
  books: 'Bookshop',
  religion: 'Religious goods shop',
  restaurant: 'Restaurant',
  cafe: 'Café',
  fast_food: 'Fast food',
  food_court: 'Food court',
  heritage: 'Heritage site',
  building: 'Historic building',
  archaeological_site: 'Archaeological site',
  city_gate: 'Historic city gate',
};

/** At most this many places per trip category, best ranked first. */
export const MAX_TRIP_PLACES_PER_CATEGORY = 40;

/**
 * Maps OpenStreetMap tags to a trip category, or null to drop it. Checked in
 * this order, so a temple that is also an attraction counts as worship and a
 * fort that is also an attraction counts as historic.
 */
export function classifyTripTags(tags: Record<string, string>): { category: TripPlaceCategory; kind: string } | null {
  if (['private', 'no'].includes(tags.access)) return null;
  const has = (key: string) => TRIP_TAG_VALUES[key].includes(tags[key]);

  if (tags.amenity === 'place_of_worship') {
    const religion = RELIGION_LABELS[tags.religion];
    return { category: 'worship', kind: religion ? `${religion} place of worship` : 'Place of worship' };
  }
  if (tags.tourism === 'museum' || tags.tourism === 'gallery') return { category: 'museum', kind: TRIP_KIND_LABELS[tags.tourism] };
  if (has('historic')) {
    return { category: 'historic', kind: TRIP_KIND_LABELS[tags.historic] ?? `Historic ${tags.historic.replace(/_/g, ' ')}` };
  }
  if (tags.tourism === 'viewpoint') return { category: 'viewpoint', kind: TRIP_KIND_LABELS.viewpoint };
  if (tags.tourism === 'attraction') return { category: 'attraction', kind: TRIP_KIND_LABELS.attraction };
  if (has('leisure')) return { category: 'nature', kind: TRIP_KIND_LABELS[tags.leisure] };
  if (has('natural')) return { category: 'nature', kind: TRIP_KIND_LABELS[tags.natural] };
  if (tags.amenity === 'marketplace') return { category: 'market', kind: TRIP_KIND_LABELS.marketplace };
  if (has('shop')) return { category: 'shopping', kind: TRIP_KIND_LABELS[tags.shop] };
  if (has('amenity')) return { category: 'food', kind: TRIP_KIND_LABELS[tags.amenity] };
  return null;
}

export function buildTripOverpassQuery(centre: GeoPoint, radiusM: number): string {
  const around = `(around:${radiusM},${centre.lat},${centre.lon})`;
  const filters = Object.entries(TRIP_TAG_VALUES)
    .map(([key, values]) => `nwr["${key}"~"^(${values.join('|')})$"]["name"]${around};`)
    .join('');
  return `[out:json][timeout:20];(${filters});out center tags;`;
}

/**
 * Turns an Overpass reply into trip candidates: named, inside the service
 * area, in a known category, at most MAX_TRIP_PLACES_PER_CATEGORY each.
 * Within a category, places with a Wikipedia or Wikidata link rank as if
 * they were half as far away, so a well-documented temple is not crowded out
 * by nearer roadside shrines. That ranking is never shown to anyone as
 * "popular" or "famous".
 */
export function parseTripCandidates(body: unknown, centre: GeoPoint): { places: TripCandidate[]; truncated: boolean } {
  const elements = (body as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) {
    throw new GeoServiceError(502, 'GEO_UPSTREAM_BAD_RESPONSE', 'OpenStreetMap sent a reply we could not read. Please try again.');
  }

  const seen = new Set<string>();
  const ranked: { place: TripCandidate; rank: number }[] = [];

  for (const el of elements as any[]) {
    if (!el || !['node', 'way', 'relation'].includes(el.type) || !Number.isSafeInteger(el.id)) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;

    const lat = el.type === 'node' ? el.lat : el.center?.lat;
    const lon = el.type === 'node' ? el.lon : el.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!isInServiceArea({ lat, lon })) continue;

    const tags: Record<string, string> = el.tags && typeof el.tags === 'object' ? el.tags : {};
    const name = clip(tags['name:en'], 120) ?? clip(tags.name, 120);
    if (!name) continue;
    const match = classifyTripTags(tags);
    if (!match) continue;
    seen.add(id);

    const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'] ?? tags['addr:city']]
      .map(part => clip(part, 80))
      .filter(Boolean)
      .join(', ');

    const details: TripPlaceDetails = {};
    for (const key of ['religion', 'denomination', 'cuisine', 'historic', 'heritage', 'fee'] as const) {
      const value = clip(tags[key], 60);
      if (value) details[key] = value;
    }
    const description = clip(tags.description, 200);
    if (description) details.description = description;

    const hasEncyclopediaLink = Boolean(clip(tags.wikipedia, 200) || clip(tags.wikidata, 40));
    const place: TripCandidate = {
      id,
      osmUrl: `https://www.openstreetmap.org/${id}`,
      name,
      category: match.category,
      kind: match.kind,
      lat,
      lon,
      address: address || null,
      openingHours: clip(tags.opening_hours, 200),
      details,
      hasEncyclopediaLink,
      sourceType: 'COMMUNITY',
    };
    const km = haversineKm(centre, { lat, lon });
    ranked.push({ place, rank: hasEncyclopediaLink ? km / 2 : km });
  }

  ranked.sort((a, b) => a.rank - b.rank);

  const perCategory = new Map<TripPlaceCategory, number>();
  let truncated = false;
  const places: TripCandidate[] = [];
  for (const { place } of ranked) {
    const count = perCategory.get(place.category) ?? 0;
    if (count >= MAX_TRIP_PLACES_PER_CATEGORY) {
      truncated = true;
      continue;
    }
    perCategory.set(place.category, count + 1);
    places.push(place);
  }
  return { places, truncated };
}

let tripCache = new TtlCache<TripCandidatesResponse>(6 * 60 * 60 * 1000, 100);
let tripInFlight = new Map<string, Promise<TripCandidatesResponse>>();

/**
 * Named places worth visiting within `radiusM` of `point`, for the trip
 * planner. Same rules as nearby search: the point is rounded to about 100 m
 * (also the cache key), and the call shares the Overpass queue, back-off and
 * fallback URLs with every other map lookup.
 */
export async function findTripCandidates(point: GeoPoint, radiusM: number): Promise<TripCandidatesResponse> {
  const centre = roundPoint(point);
  if (!isInServiceArea(centre)) {
    throw new GeoServiceError(400, 'OUTSIDE_SERVICE_AREA', `Trips can be planned in the ${SERVICE_AREA.name} only.`);
  }

  const key = `${centre.lat},${centre.lon},${radiusM}`;
  const cached = tripCache.get(key);
  if (cached) return cached;

  const pending = tripInFlight.get(key);
  if (pending) return pending;

  const request = runOverpass(buildTripOverpassQuery(centre, radiusM), 25_000, body => {
    const { places, truncated } = parseTripCandidates(body, centre);
    const result: TripCandidatesResponse = {
      places,
      centre,
      radiusM,
      fetchedAt: new Date().toISOString(),
      dataTimestamp: overpassDataTimestamp(body),
      truncated,
    };
    return result;
  })
    .then(result => {
      tripCache.set(key, result);
      return result;
    })
    .finally(() => tripInFlight.delete(key));
  tripInFlight.set(key, request);
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

/** One Nominatim search inside the service area, through the shared queue and back-off. */
async function queryNominatim(q: string, language: 'en' | 'hi' | 'mr'): Promise<GeoSearchResult[]> {
  const base = `${nominatimBaseUrl()}/search`;
  const blocked = secondsBlocked(base);
  if (blocked > 0) throw busyError('The place search service', blocked);

  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '8',
    countrycodes: 'in',
    viewbox: `${SERVICE_AREA.west},${SERVICE_AREA.north},${SERVICE_AREA.east},${SERVICE_AREA.south}`,
    bounded: '1',
    'accept-language': language,
  });
  const body = await nominatimGate(() =>
    fetchUpstreamJson(`${base}?${params.toString()}`, { method: 'GET' }, 10_000, 'The place search service'),
  );
  return parseNominatimResults(body);
}

const searchResponse = (results: GeoSearchResult[], alternativeQuery: string | null): GeoSearchResponse => ({
  results,
  alternativeQuery,
  source: 'OPENSTREETMAP_NOMINATIM',
  attribution: OSM_ATTRIBUTION,
});

function rememberSearch(key: string, response: GeoSearchResponse): GeoSearchResponse {
  searchCache.set(key, response);
  return response;
}

/**
 * Searches Nominatim, limited to the service area. Called only when the user
 * submits a search: the Nominatim policy forbids search-as-you-type.
 *
 * When the words as typed find nothing, at most one alternative spelling is
 * tried (`alternativeSearchQuery`, e.g. "Kalaram Temple" → "Kalaram Mandir").
 * It waits its turn in the same queue, so it starts at least 1.1 s after the
 * first call and never alongside it, and a cached answer for it is used
 * instead of a call. It is never tried after an error: a timeout, a busy or
 * failed reply or a back-off fails the search as before. If the alternative
 * itself fails, the search answers "nothing found" without caching it.
 */
export async function searchPlaces(query: string, language: 'en' | 'hi' | 'mr'): Promise<GeoSearchResponse> {
  const q = normaliseSearchQuery(query);
  const key = `${language}|${q}`;
  const cached = searchCache.get(key);
  if (cached) return cached;

  const pending = searchInFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const results = await queryNominatim(q, language);
    if (results.length > 0) return rememberSearch(key, searchResponse(results, null));

    const alternative = alternativeSearchQuery(q);
    const altQ = alternative === null ? null : normaliseSearchQuery(alternative);
    if (alternative === null || altQ === null || altQ === q) return rememberSearch(key, searchResponse([], null));

    // Only the cache is shared here, not another search in flight: two
    // searches that are each other's alternative would wait on each other.
    const altKey = `${language}|${altQ}`;
    let altResponse = searchCache.get(altKey);
    if (!altResponse) {
      try {
        altResponse = rememberSearch(altKey, searchResponse(await queryNominatim(altQ, language), null));
      } catch (err) {
        if (!(err instanceof GeoServiceError)) throw err;
        return searchResponse([], null);
      }
    }
    const found = altResponse.results.length > 0;
    return rememberSearch(key, searchResponse(altResponse.results, found ? altResponse.alternativeQuery ?? alternative : null));
  })().finally(() => searchInFlight.delete(key));

  searchInFlight.set(key, request);
  return request;
}
