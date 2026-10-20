import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Crosshair,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { Place } from '../types';
import { SupportedLanguage } from '../i18n';
import { VerificationBadge } from '../components/VerificationBadge';
import { PlaceholderNotice } from '../components/PlaceholderNotice';
import { MapFocus, PilgrimMap } from '../components/PilgrimMap';
import { NewRouteStop, RoutePlanner, useRoutePlanner } from '../components/RoutePlanner';
import { SelectedStartPlace, TripPlanner, aboutDuration, useTripPlanner } from '../components/TripPlanner';
import { TRAVEL_MODES, formatDuration } from '../lib/routing';
import {
  DEFAULT_NEARBY_RADIUS_M,
  GeoPoint,
  GeoSearchResult,
  LIVE_PLACE_CATEGORIES,
  LivePlace,
  LivePlaceCategory,
  LocationProblem,
  NASHIK_CENTRE,
  NEARBY_RADII_M,
  NearbyPlacesResponse,
  OSM_COPYRIGHT_URL,
  SERVICE_AREA,
  describeLocationProblem,
  formatDistance,
  haversineKm,
  isInServiceArea,
  livePlaceName,
} from '../lib/geo';
import { GeoRequestError, UserPosition, fetchNearbyPlaces, requestCurrentPosition, searchGeo } from '../lib/geoApi';
import { searchSamplePlaces, suggestSampleQueries } from '../lib/placeSearch';

interface Props {
  places: Place[];
  currentLanguage: SupportedLanguage;
  onSelectPlace: (placeId: string) => void;
  /** "Search on map" from Home or Explore: searched once when the map opens. */
  initialSearch?: { query: string } | null;
  /** Called once `initialSearch` has been started, so it is not repeated. */
  onInitialSearchHandled?: () => void;
}

/** Centre of the nearby search. Only `isUser` anchors came from the device's location. */
interface Anchor {
  point: GeoPoint;
  label: string;
  isUser: boolean;
}

type NearbyState =
  | { status: 'idle' }
  | { status: 'loading'; slow: boolean }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: NearbyPlacesResponse };

type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string; samples: Place[] }
  | { status: 'error'; query: string; message: string; samples: Place[] }
  | {
      status: 'ready';
      query: string;
      live: GeoSearchResult[];
      samples: Place[];
      /** The spelling the server searched instead, when the query itself found nothing. */
      alternativeQuery: string | null;
      /** Corrected spellings to offer when nothing at all matched. */
      suggestions: string[];
    };

type Selection =
  | { type: 'live'; place: LivePlace }
  | { type: 'sample'; place: Place }
  | { type: 'search'; result: GeoSearchResult };

type Filter = 'all' | 'samples' | LivePlaceCategory;

type ListItem =
  | { kind: 'live'; id: string; place: LivePlace; km: number | null }
  | { kind: 'sample'; id: string; place: Place; km: number | null };

const NO_LIVE_PLACES: LivePlace[] = [];
/** The "All" list stops here; markers are not capped. */
const LIST_LIMIT = 80;
/** Sample sites offered as starting points before the user picks one. */
const QUICK_ANCHOR_IDS = ['ramkund_panchavati', 'trimbakeshwar_mandir'];
/** Data older than this gets a visible "may be out of date" note. */
const STALE_DATA_MS = 7 * 24 * 60 * 60 * 1000;

const CATEGORY_META = Object.fromEntries(LIVE_PLACE_CATEGORIES.map(c => [c.id, c]));

const samplePoint = (p: Place): GeoPoint => ({ lat: p.location.latitude, lon: p.location.longitude });
const googleMapsUrl = (p: GeoPoint) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
const radiusLabel = (m: number) => (m < 1000 ? `${m} m` : `${m / 1000} km`);
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const MapScreen: React.FC<Props> = ({ places, currentLanguage, onSelectPlace, initialSearch, onInitialSearchHandled }) => {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [radiusM, setRadiusM] = useState<number>(DEFAULT_NEARBY_RADIUS_M);
  const [nearby, setNearby] = useState<NearbyState>({ status: 'idle' });
  const [retryCount, setRetryCount] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const focusSeq = useRef(0);
  const [view, setView] = useState<{ centre: GeoPoint; zoom: number } | null>(null);
  const [areaNote, setAreaNote] = useState<string | null>(null);

  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<{ tone: 'info' | 'error'; message: string; canRetry?: boolean } | null>(null);

  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });
  const searchAbort = useRef<AbortController | null>(null);

  const mapWrapRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  /** What to scroll into view after the next selection change. */
  const reveal = useRef<'map' | 'details' | null>(null);

  const placeName = (p: Place) => p.name[currentLanguage] || p.name.en;
  const liveName = (p: LivePlace) => livePlaceName(p, currentLanguage) ?? `${p.kind} (unnamed)`;

  const focusArea = (centre: GeoPoint, r = radiusM) =>
    setFocus({ kind: 'area', centre, radiusM: r, seq: ++focusSeq.current });
  const focusPoint = (centre: GeoPoint) => setFocus({ kind: 'point', centre, zoom: 16, seq: ++focusSeq.current });

  const scrollToMap = () =>
    mapWrapRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });

  // A new route moves the map to it and brings the map into view.
  const planner = useRoutePlanner(route => {
    setFocus({ kind: 'bounds', bounds: route.bounds, seq: ++focusSeq.current });
    scrollToMap();
  });

  // A trip day put on the map: fit its route, or its stops when there is no route.
  const trip = useTripPlanner(({ points, route }) => {
    if (route) {
      setFocus({ kind: 'bounds', bounds: route.bounds, seq: ++focusSeq.current });
    } else if (points.length > 1) {
      const lats = points.map(p => p.lat);
      const lons = points.map(p => p.lon);
      setFocus({
        kind: 'bounds',
        bounds: { south: Math.min(...lats), west: Math.min(...lons), north: Math.max(...lats), east: Math.max(...lons) },
        seq: ++focusSeq.current,
      });
    } else if (points.length === 1) {
      focusPoint(points[0]);
    }
    scrollToMap();
  });

  // The map shows one set of route stops at a time: working on your own
  // route takes a trip day off the map.
  useEffect(() => {
    if (planner.stops.length > 0) trip.showDay(null);
    // Only an edit to the route planner should do this, not a re-render.
  }, [planner.stops, planner.route]);

  const tripDay = trip.mapDay;

  // Live places for the current anchor and radius. Each change cancels the
  // previous request, and a cancelled request never writes its result.
  useEffect(() => {
    if (!anchor) {
      setNearby({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setNearby({ status: 'loading', slow: false });
    const slowTimer = setTimeout(
      () => setNearby(s => (s.status === 'loading' ? { status: 'loading', slow: true } : s)),
      6000,
    );
    fetchNearbyPlaces(anchor.point, radiusM, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setNearby({ status: 'ready', data });
      })
      .catch(err => {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        setNearby({
          status: 'error',
          message: err instanceof GeoRequestError ? err.message : 'Nearby places could not be loaded. Please try again.',
        });
      })
      .finally(() => clearTimeout(slowTimer));
    return () => {
      controller.abort();
      clearTimeout(slowTimer);
    };
  }, [anchor, radiusM, retryCount]);

  useEffect(() => () => searchAbort.current?.abort(), []);

  useEffect(() => {
    const target = reveal.current === 'map' ? mapWrapRef.current : reveal.current === 'details' ? detailsRef.current : null;
    reveal.current = null;
    target?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }, [selection]);

  const live = nearby.status === 'ready' ? nearby.data.places : NO_LIVE_PLACES;

  // Sample sites inside the search circle, or all of them before a search.
  const samplesInScope = useMemo(
    () => (anchor ? places.filter(p => haversineKm(anchor.point, samplePoint(p)) * 1000 <= radiusM) : places),
    [places, anchor, radiusM],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: live.length + samplesInScope.length, samples: samplesInScope.length };
    for (const cat of LIVE_PLACE_CATEGORIES) c[cat.id] = 0;
    for (const p of live) c[p.category] += 1;
    return c;
  }, [live, samplesInScope]);

  // Sample sites only appear under "All" and their own filter, never under a
  // facility category: a demo medical camp must not sit among real clinics.
  const shownLive = filter === 'all' ? live : filter === 'samples' ? NO_LIVE_PLACES : live.filter(p => p.category === filter);
  const shownSamples = filter === 'all' || filter === 'samples' ? samplesInScope : [];

  const listItems = useMemo<ListItem[]>(() => {
    const from = (p: GeoPoint) => (anchor ? haversineKm(anchor.point, p) : null);
    const items: ListItem[] = [
      ...shownLive.map(p => ({ kind: 'live' as const, id: p.id, place: p, km: from(p) })),
      ...shownSamples.map(p => ({ kind: 'sample' as const, id: `sample:${p.id}`, place: p, km: from(samplePoint(p)) })),
    ];
    return items.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  }, [shownLive, shownSamples, anchor]);

  const selectedId =
    selection?.type === 'live' ? selection.place.id : selection?.type === 'sample' ? `sample:${selection.place.id}` : null;

  const quickAnchors = QUICK_ANCHOR_IDS.map(id => places.find(p => p.id === id)).filter((p): p is Place => !!p);

  const canSearchHere =
    view !== null && view.zoom >= 12 && (!anchor || haversineKm(view.centre, anchor.point) * 1000 > radiusM * 0.3);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const setAnchorAt = (point: GeoPoint, label: string, isUser = false) => {
    setAreaNote(null);
    setAnchor({ point, label, isUser });
    focusArea(point);
  };

  const searchThisArea = () => {
    if (!view) return;
    if (!isInServiceArea(view.centre)) {
      setAreaNote(`Move the map back to the ${SERVICE_AREA.name} to search there.`);
      return;
    }
    setAreaNote(null);
    setAnchor({ point: view.centre, label: 'the map centre', isUser: false });
  };

  /**
   * Asks the browser for the position, after a tap only. Returns null, with a
   * note saying why, when there is no position this map can use.
   */
  const getPosition = async (): Promise<UserPosition | null> => {
    if (locating) return null;
    setLocating(true);
    setLocationNote(null);
    try {
      const pos = await requestCurrentPosition();
      if (!isInServiceArea(pos)) {
        setUserPosition(null);
        setLocationNote({
          tone: 'info',
          message: `You appear to be about ${formatDistance(haversineKm(pos, NASHIK_CENTRE))} from Nashik, outside the area this map covers. Search for a place or move the map to look around the ${SERVICE_AREA.name}.`,
        });
        return null;
      }
      setUserPosition(pos);
      const accuracy = formatDistance(pos.accuracyM / 1000);
      setLocationNote({
        tone: 'info',
        message:
          pos.accuracyM > 500
            ? `Showing your approximate location (accurate to about ${accuracy}), so distances may be off by that much.`
            : `Showing your location (accurate to about ${accuracy}).`,
      });
      return pos;
    } catch (problem) {
      const { message, canRetry } = describeLocationProblem(
        typeof problem === 'string' ? (problem as LocationProblem) : 'unavailable',
      );
      setLocationNote({ tone: 'error', message, canRetry });
      return null;
    } finally {
      setLocating(false);
    }
  };

  const locate = async () => {
    const pos = await getPosition();
    if (pos) setAnchorAt(pos, 'your location', true);
  };

  /** The selected place, offered to the trip planner as a starting point. */
  const selectedStart: SelectedStartPlace | null =
    selection?.type === 'live'
      ? { point: { lat: selection.place.lat, lon: selection.place.lon }, label: liveName(selection.place), kind: 'place' }
      : selection?.type === 'sample'
        ? { point: samplePoint(selection.place), label: placeName(selection.place), kind: 'sample', note: 'Sample site: approximate location' }
        : selection?.type === 'search'
          ? { point: { lat: selection.result.lat, lon: selection.result.lon }, label: selection.result.name, kind: 'place' }
          : null;

  const startRouteFromMyLocation = async () => {
    const pos = await getPosition();
    if (!pos) return;
    planner.setStart({
      point: { lat: pos.lat, lon: pos.lon },
      label: 'Your location',
      kind: 'user',
      note: `Accurate to about ${formatDistance(pos.accuracyM / 1000)}`,
    });
  };

  // Runs only on a user action: submitting the form, choosing a suggestion, or
  // "Search on map" from Home or Explore. Nominatim's policy forbids
  // search-as-you-type.
  const searchFor = async (text: string) => {
    const query = text.trim();
    if (query.length < 2) {
      setSearch({ status: 'error', query, message: 'Type at least 2 characters to search.', samples: [] });
      return;
    }
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    const samples = searchSamplePlaces(places, query);
    setSearch({ status: 'loading', query, samples });
    try {
      const data = await searchGeo(query, currentLanguage, controller.signal);
      if (searchAbort.current !== controller) return;
      setSearch({
        status: 'ready',
        query,
        live: data.results,
        samples,
        alternativeQuery: data.alternativeQuery ?? null,
        suggestions: data.results.length === 0 && samples.length === 0 ? suggestSampleQueries(places, query) : [],
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || searchAbort.current !== controller) return;
      setSearch({
        status: 'error',
        query,
        message: err instanceof GeoRequestError ? err.message : 'Search failed. Please try again.',
        samples,
      });
    }
  };

  const runSearch = (event?: React.FormEvent) => {
    event?.preventDefault();
    void searchFor(searchText);
  };

  const searchSuggestion = (text: string) => {
    setSearchText(text);
    void searchFor(text);
  };

  // The search the user asked for on Home or Explore, run once.
  useEffect(() => {
    if (!initialSearch) return;
    const query = initialSearch.query.trim().slice(0, 100);
    setSearchText(query);
    void searchFor(query);
    onInitialSearchHandled?.();
  }, [initialSearch]);

  const closeSearch = () => {
    searchAbort.current?.abort();
    searchAbort.current = null;
    setSearch({ status: 'idle' });
  };

  const chooseSearchResult = (result: GeoSearchResult) => {
    reveal.current = 'map';
    setSelection({ type: 'search', result });
    setAnchorAt({ lat: result.lat, lon: result.lon }, result.name);
    closeSearch();
  };

  const chooseSample = (place: Place, from: 'map' | 'list' | 'search') => {
    reveal.current = from === 'map' ? 'details' : 'map';
    setSelection({ type: 'sample', place });
    if (from === 'search') {
      setAnchorAt(samplePoint(place), placeName(place));
      closeSearch();
    } else if (from === 'list') {
      focusPoint(samplePoint(place));
    }
  };

  const chooseLive = (place: LivePlace, from: 'map' | 'list') => {
    reveal.current = from === 'map' ? 'details' : 'map';
    setSelection({ type: 'live', place });
    if (from === 'list') focusPoint(place);
  };

  const changeRadius = (r: number) => {
    setRadiusM(r);
    if (anchor) focusArea(anchor.point, r);
  };

  // ---------------------------------------------------------------------------
  // Pieces
  // ---------------------------------------------------------------------------

  const distanceLine = (point: GeoPoint) => {
    if (!anchor) return null;
    const km = haversineKm(anchor.point, point);
    if (km * 1000 < 15) return null;
    return `${formatDistance(km)} from ${anchor.label} (straight line)`;
  };

  const sourceTag = (kind: 'live' | 'sample' | 'search') =>
    kind === 'sample' ? (
      <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
        Sample · demo data
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-700">
        {kind === 'search' ? 'OpenStreetMap search' : 'OpenStreetMap · community data'}
      </span>
    );

  const linkButton = (href: string, label: string, icon: React.ReactNode) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
    >
      {icon}
      <span>{label}</span>
    </a>
  );

  const nearHereButton = (point: GeoPoint, label: string) => (
    <button
      type="button"
      onClick={() => setAnchorAt(point, label)}
      className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-3 text-xs font-semibold text-white transition hover:bg-stone-800"
    >
      <Crosshair className="h-4 w-4" />
      <span>Show places near here</span>
    </button>
  );

  /** Adds the place at the end of the route: the start, then each new destination. */
  const addToRouteButton = (stop: NewRouteStop) => {
    const position = planner.positionOf(stop.point);
    const isLast = position > 0 && position === planner.stops.length;
    return (
      <button
        type="button"
        onClick={() => planner.addStop(stop)}
        disabled={isLast || !planner.canAdd}
        className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-900 transition hover:bg-blue-100 disabled:opacity-60"
      >
        <RouteIcon className="h-4 w-4" />
        <span>
          {isLast
            ? `In your route (stop ${position})`
            : !planner.canAdd
              ? 'Route is full'
              : planner.stops.length === 0
                ? 'Start a route here'
                : position > 0
                  ? 'Add to route again'
                  : 'Add to route'}
        </span>
      </button>
    );
  };

  const renderDetails = () => {
    if (!selection) return null;

    let heading: string;
    let title: string;
    let body: React.ReactNode;
    let actions: React.ReactNode;

    if (selection.type === 'live') {
      const p = selection.place;
      const distance = distanceLine(p);
      heading = p.kind;
      title = liveName(p);
      body = (
        <>
          {sourceTag('live')}
          {distance && <p className="text-xs text-stone-700">📍 {distance}</p>}
          {p.address && <p className="text-xs text-stone-600">{p.address}</p>}
          {p.openingHours && (
            <p className="text-xs text-stone-600">
              🕒 Opening hours listed on OpenStreetMap: <span className="font-mono">{p.openingHours}</span>{' '}
              <span className="text-stone-500">(entered by contributors, may be out of date)</span>
            </p>
          )}
          <p className="text-[11px] text-stone-500">
            Mapped by OpenStreetMap contributors. Not checked by Namo Yatri or the Kumbh administration.
          </p>
        </>
      );
      actions = (
        <>
          {addToRouteButton({ point: { lat: p.lat, lon: p.lon }, label: liveName(p), kind: 'place' })}
          {nearHereButton(p, liveName(p))}
          {linkButton(p.osmUrl, 'View on OpenStreetMap', <ExternalLink className="h-3.5 w-3.5" />)}
          {linkButton(googleMapsUrl(p), 'Open in Google Maps', <Navigation className="h-3.5 w-3.5 text-orange-600" />)}
        </>
      );
    } else if (selection.type === 'sample') {
      const p = selection.place;
      const point = samplePoint(p);
      const distance = distanceLine(point);
      heading = `Kumbh sample site · ${p.category.replace('_', ' ')}`;
      title = placeName(p);
      body = (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {sourceTag('sample')}
            <VerificationBadge tier={p.verificationTier} size="sm" />
          </div>
          <p className="text-xs text-stone-600 line-clamp-3">{p.description[currentLanguage] || p.description.en}</p>
          {distance && <p className="text-xs text-stone-700">📍 {distance}</p>}
          <p className="text-[11px] text-stone-500">Namo Yatri demo listing. Its location is approximate and not verified.</p>
        </>
      );
      actions = (
        <>
          <button
            type="button"
            onClick={() => onSelectPlace(p.id)}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-600 px-3 text-xs font-semibold text-white transition hover:bg-orange-700"
          >
            Full details
          </button>
          {addToRouteButton({ point, label: placeName(p), kind: 'sample', note: 'Sample site: approximate location' })}
          {nearHereButton(point, placeName(p))}
          {linkButton(googleMapsUrl(point), 'Open in Google Maps', <Navigation className="h-3.5 w-3.5 text-orange-600" />)}
        </>
      );
    } else {
      const r = selection.result;
      heading = `Search result · ${r.kind}`;
      title = r.name;
      body = (
        <>
          {sourceTag('search')}
          <p className="text-xs text-stone-600">{r.displayName}</p>
        </>
      );
      actions = (
        <>
          {addToRouteButton({ point: { lat: r.lat, lon: r.lon }, label: r.name, kind: 'place' })}
          {r.osmUrl && linkButton(r.osmUrl, 'View on OpenStreetMap', <ExternalLink className="h-3.5 w-3.5" />)}
        </>
      );
    }

    return (
      <div
        ref={detailsRef}
        id="map-place-details"
        className="scroll-mt-20 space-y-2 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700">{heading}</p>
            <h3 className="text-base font-bold text-stone-900 break-words">{title}</h3>
          </div>
          <button
            type="button"
            onClick={() => setSelection(null)}
            aria-label="Close place details"
            className="-mr-2 -mt-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-1.5">{body}</div>
        {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
      </div>
    );
  };

  const renderNearbyStatus = () => {
    if (!anchor) {
      return (
        <div className="space-y-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3 text-xs text-stone-700">
          <p>
            Pick a starting point to see real places nearby from OpenStreetMap: temples, food, medical help, toilets,
            drinking water, parking and ATMs.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-orange-600 px-3 font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60"
            >
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
              <span>Use my location</span>
            </button>
            {quickAnchors.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setAnchorAt(samplePoint(p), placeName(p))}
                className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 font-semibold text-stone-800 transition hover:bg-stone-100"
              >
                <MapPin className="h-4 w-4 text-orange-600" />
                <span>Near {placeName(p)}</span>
              </button>
            ))}
          </div>
          <p className="text-stone-500">
            Your browser asks before sharing your location, and the map never uses it unless you allow it. You can also
            search above, or move the map and tap “Search this area”.
          </p>
        </div>
      );
    }

    if (nearby.status === 'loading') {
      return (
        <div className="flex items-start gap-2 rounded-xl bg-stone-50 p-3 text-xs text-stone-700">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-orange-600" />
          <div>
            <p className="font-semibold">Looking up places on OpenStreetMap…</p>
            {nearby.slow && (
              <p className="text-stone-500">The free OpenStreetMap service is slow right now. This can take up to half a minute.</p>
            )}
          </div>
        </div>
      );
    }

    if (nearby.status === 'error') {
      return (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Nearby places could not be loaded.</strong> {nearby.message}
            </span>
          </p>
          <p className="text-red-800/80">No live places are shown. Kumbh sample sites (demo data) are still listed below.</p>
          <button
            type="button"
            onClick={() => setRetryCount(c => c + 1)}
            className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-white px-3 font-semibold text-red-900 ring-1 ring-red-200 hover:bg-red-100"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Try again</span>
          </button>
        </div>
      );
    }

    if (nearby.status === 'ready') {
      const { data } = nearby;
      const stale = data.dataTimestamp ? Date.now() - Date.parse(data.dataTimestamp) > STALE_DATA_MS : false;
      return (
        <div className="space-y-1 text-[11px] text-stone-500">
          <p>
            {data.places.length} {data.places.length === 1 ? 'place' : 'places'} from OpenStreetMap within{' '}
            {radiusLabel(data.radiusM)}.
            {data.truncated && ' Busy categories show only the nearest 60.'}
          </p>
          {data.dataTimestamp && (
            <p className={stale ? 'text-amber-800' : undefined}>
              {stale
                ? `This copy of OpenStreetMap was last updated on ${formatDate(data.dataTimestamp)}, so recent changes may be missing.`
                : `OpenStreetMap data as of ${formatDate(data.dataTimestamp)}.`}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const emptyMessage = () => {
    if (filter === 'samples') return 'No Kumbh sample sites inside this circle. Try a larger radius.';
    const label = filter === 'all' ? 'places' : CATEGORY_META[filter].label.toLowerCase();
    if (!anchor) return 'Pick a starting point above to see live places.';
    if (nearby.status !== 'ready') return null;
    return `No ${label} found within ${radiusLabel(radiusM)} on OpenStreetMap. That may only mean nobody has mapped them yet: try a larger radius or another category.`;
  };

  const filters: { id: Filter; label: string; color?: string }[] = [
    { id: 'all', label: 'All' },
    ...LIVE_PLACE_CATEGORIES,
    { id: 'samples', label: 'Kumbh sample sites' },
  ];

  const visibleItems = listItems.slice(0, LIST_LIMIT);
  const searchSamples = search.status === 'idle' ? [] : search.samples;

  return (
    <div id="map-screen-view" className="space-y-3 pb-12">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900">Nashik–Trimbakeshwar Map</h2>
        <p className="text-xs sm:text-sm text-stone-500">
          A live OpenStreetMap map with nearby places mapped by its community. Kumbh sites marked “Sample” are demo
          listings with approximate locations.
        </p>
        <a
          id="map-trip-planner-link"
          href="#trip-planner"
          className="mt-1 inline-flex min-h-12 items-center gap-1.5 rounded-xl px-1 text-xs font-semibold text-orange-800 underline"
        >
          <Sparkles className="h-4 w-4" />
          Plan a multi-day trip with Namo AI
        </a>
      </div>

      {/* Search: submit only, never as-you-type (Nominatim policy). */}
      <div className="space-y-2">
        <form role="search" onSubmit={runSearch} className="flex gap-2">
          <label htmlFor="map-search-input" className="sr-only">
            Search for a place in the {SERVICE_AREA.name}
          </label>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              id="map-search-input"
              type="search"
              enterKeyHint="search"
              maxLength={100}
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search a place, e.g. Kalaram Mandir"
              className="min-h-12 w-full rounded-xl border border-stone-200 bg-white pl-10 pr-3 text-sm text-stone-900 shadow-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <button
            id="map-search-submit"
            type="submit"
            disabled={search.status === 'loading'}
            className="min-h-12 shrink-0 rounded-xl bg-stone-900 px-4 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-60"
          >
            Search
          </button>
        </form>

        {search.status !== 'idle' && (
          <div id="map-search-results" className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-semibold text-stone-700">
                {search.query ? `Results for “${search.query}”` : 'Search'}
              </p>
              <button
                type="button"
                onClick={closeSearch}
                aria-label="Close search results"
                className="-my-2 -mr-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div role="status" aria-live="polite" className="text-xs">
              {search.status === 'loading' && (
                <p className="flex items-center gap-1.5 text-stone-600">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-600" /> Searching OpenStreetMap…
                </p>
              )}
              {search.status === 'error' && (
                <div className="flex flex-wrap items-center gap-2 text-red-800">
                  <span>{search.message}</span>
                  {search.query.length >= 2 && (
                    <button
                      type="button"
                      onClick={() => void searchFor(search.query)}
                      className="inline-flex min-h-12 items-center gap-1 rounded-xl px-2 font-semibold underline"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Try again
                    </button>
                  )}
                </div>
              )}
              {search.status === 'ready' && search.live.length === 0 && searchSamples.length === 0 && (
                <div id="map-search-empty" className="space-y-1.5 text-stone-600">
                  <p>No matches in the {SERVICE_AREA.name}.</p>
                  {search.suggestions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>Did you mean</span>
                      {search.suggestions.map(suggestion => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => searchSuggestion(suggestion)}
                          className="min-h-12 rounded-xl bg-orange-50 px-3 font-semibold text-orange-800 hover:bg-orange-100"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                  <ul className="list-disc space-y-0.5 pl-4">
                    <li>Check the spelling, or try the local name, e.g. “Mandir” instead of “Temple”.</li>
                    <li>Use the place’s name rather than a sentence: “Ramkund”, not “temple near Ramkund”.</li>
                    <li>Or move the map to the area and tap “Search this area” to list places mapped there.</li>
                  </ul>
                </div>
              )}
            </div>

            {searchSamples.length > 0 && (
              <div>
                <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-amber-800">Kumbh sample sites (demo)</p>
                <ul>
                  {searchSamples.map(p => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => chooseSample(p, 'search')}
                        className="flex min-h-12 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-stone-50"
                      >
                        <MapPin className="h-4 w-4 shrink-0 text-amber-700" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-stone-900">{placeName(p)}</span>
                          <span className="block truncate text-[11px] text-stone-500">{p.location.area} · approximate location</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {search.status === 'ready' && search.live.length > 0 && (
              <div>
                {search.alternativeQuery && (
                  <p id="map-search-alternative" className="px-1 pb-1 text-[11px] text-stone-600">
                    OpenStreetMap had nothing for “{search.query}”, so these are its results for “{search.alternativeQuery}”.
                  </p>
                )}
                <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-stone-600">From OpenStreetMap</p>
                <ul>
                  {search.live.map(r => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => chooseSearchResult(r)}
                        className="flex min-h-12 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-stone-50"
                      >
                        <MapPin className="h-4 w-4 shrink-0 text-stone-500" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-stone-900">{r.name}</span>
                          <span className="block truncate text-[11px] text-stone-500">
                            {r.kind} · {r.displayName}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="px-1 text-[10px] text-stone-500">
              Search by Nominatim ·{' '}
              <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className="underline">
                © OpenStreetMap contributors
              </a>
            </p>
          </div>
        )}
      </div>

      <PlaceholderNotice
        variant="subtle"
        title="Straight-line distances"
        description="Distances in the nearby list are straight-line, not by road. Add places to a route below for road distance and travel time. Turn-by-turn directions are not shown here."
      />

      {/* grid-cols-1 (minmax(0, 1fr)) matters: an implicit auto column would
          grow to fit the unwrapped filter row and push the page sideways. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        {/* Map column */}
        <div className="min-w-0 space-y-2">
          <div
            ref={mapWrapRef}
            role="region"
            aria-label="Map of the Nashik–Trimbakeshwar area. Every place on the map is also in the list."
            className="relative isolate h-[55vh] min-h-[320px] max-h-[600px] scroll-mt-20 overflow-hidden rounded-2xl border border-stone-200 bg-stone-200 lg:h-[560px] lg:max-h-none"
          >
            <PilgrimMap
              samplePlaces={shownSamples}
              livePlaces={shownLive}
              userPosition={userPosition}
              anchor={anchor?.point ?? null}
              anchorIsUser={!!anchor?.isUser}
              radiusM={radiusM}
              selectedId={selectedId}
              focus={focus}
              routeStops={tripDay ? tripDay.stops : planner.stops}
              routePath={tripDay ? tripDay.path : (planner.route?.path ?? null)}
              routeMode={tripDay ? (tripDay.route?.mode ?? trip.mode) : (planner.route?.mode ?? planner.mode)}
              currentLanguage={currentLanguage}
              onSelectLive={p => chooseLive(p, 'map')}
              onSelectSample={p => chooseSample(p, 'map')}
              onViewChange={(centre, zoom) => setView({ centre, zoom })}
            />

            {/* Overlays sit above Leaflet's panes (z-index up to 1000) and
                clear its zoom buttons (top left) and attribution (bottom right). */}
            <button
              id="map-locate-btn"
              type="button"
              onClick={locate}
              disabled={locating}
              aria-label={locating ? 'Finding your location' : 'Use my location'}
              title="Use my location"
              className="absolute right-3 top-3 z-[1100] flex h-12 w-12 items-center justify-center rounded-xl bg-white text-stone-800 shadow-md ring-1 ring-stone-300 transition hover:bg-stone-50 disabled:opacity-70"
            >
              {locating ? <Loader2 className="h-5 w-5 animate-spin text-orange-600" /> : <LocateFixed className="h-5 w-5" />}
            </button>

            {canSearchHere && (
              <button
                id="map-search-area-btn"
                type="button"
                onClick={searchThisArea}
                className="absolute left-1/2 top-3 z-[1100] flex min-h-12 -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-stone-900 px-4 text-xs font-semibold text-white shadow-md transition hover:bg-stone-800"
              >
                <Search className="h-4 w-4" />
                <span>Search this area</span>
              </button>
            )}

            {/* Clear of the attribution, which takes the bottom-right corner. */}
            {tripDay && (
              <p
                id="map-route-chip"
                className="pointer-events-none absolute bottom-8 left-3 z-[1100] max-w-[calc(100%-1.5rem)] rounded-xl bg-white/95 px-3 py-1.5 text-xs text-stone-800 shadow-md ring-1 ring-stone-300"
              >
                <span className="font-bold">Trip day {tripDay.day}</span>
                {tripDay.route ? (
                  <>
                    {' · '}
                    <span className="font-bold">{formatDistance(tripDay.route.distanceM / 1000)}</span> by road ·{' '}
                    <span className="font-bold">{aboutDuration(tripDay.route.durationS)}</span>{' '}
                    {TRAVEL_MODES.find(m => m.id === tripDay.route!.mode)?.verb}
                  </>
                ) : (
                  ' · stops only, no road route'
                )}
              </p>
            )}
            {!tripDay && planner.route && (
              <p
                id="map-route-chip"
                className="pointer-events-none absolute bottom-8 left-3 z-[1100] max-w-[calc(100%-1.5rem)] rounded-xl bg-white/95 px-3 py-1.5 text-xs text-stone-800 shadow-md ring-1 ring-stone-300"
              >
                <span className="font-bold">{formatDistance(planner.route.distanceM / 1000)}</span> by road · about{' '}
                <span className="font-bold">{formatDuration(planner.route.durationS)}</span>{' '}
                {TRAVEL_MODES.find(m => m.id === planner.route!.mode)?.verb}
              </p>
            )}
          </div>

          <div role="status" aria-live="polite" className="space-y-1 text-xs">
            {locating && <p className="text-stone-600">Finding your location…</p>}
            {locationNote && (
              <div
                className={`flex flex-wrap items-center gap-2 rounded-xl p-2.5 ${
                  locationNote.tone === 'error' ? 'bg-red-50 text-red-900' : 'bg-sky-50 text-sky-900'
                }`}
              >
                <span className="min-w-0 flex-1">{locationNote.message}</span>
                {locationNote.canRetry && (
                  <button
                    type="button"
                    onClick={locate}
                    className="inline-flex min-h-12 items-center gap-1 rounded-xl px-2 font-semibold underline"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Try again
                  </button>
                )}
              </div>
            )}
            {userPosition && (
              <p className="text-[11px] text-stone-500">
                Your exact position stays in this browser. Nearby search sends only a point rounded to about 100 m;
                a route you ask for sends it rounded to about 10 m.
              </p>
            )}
            {areaNote && <p className="rounded-xl bg-amber-50 p-2.5 text-amber-900">{areaNote}</p>}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-600">
            {LIVE_PLACE_CATEGORIES.map(c => (
              <span key={c.id} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full border border-white" style={{ backgroundColor: c.color }} />
                {c.label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full border border-dashed border-amber-800 bg-amber-200" />
              Kumbh sample site (demo)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600 ring-2 ring-white" />
              You (only after you allow it)
            </span>
            {(planner.stops.length > 0 || tripDay) && (
              <span className="inline-flex items-center gap-1">
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-600 text-[8px] font-bold text-white">
                  1
                </span>
                Route stops, in order
              </span>
            )}
            {(tripDay ? tripDay.path : planner.route) && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1 w-4 rounded-full bg-blue-700" />
                Road route (dotted when walking)
              </span>
            )}
          </div>
        </div>

        {/* Details and nearby list */}
        <div className="min-w-0 space-y-3">
          {renderDetails()}

          <RoutePlanner planner={planner} onUseMyLocation={startRouteFromMyLocation} locating={locating} />

          <TripPlanner
            trip={trip}
            selectedPlace={selectedStart}
            onUseMyLocation={getPosition}
            locating={locating}
            onFocusPoint={point => {
              focusPoint(point);
              scrollToMap();
            }}
          />

          <section aria-labelledby="nearby-heading" className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="nearby-heading" className="text-sm font-bold text-stone-900">
                {anchor ? `Places near ${anchor.label}` : 'Nearby places'}
              </h3>
              <label className="flex items-center gap-1.5 text-xs text-stone-600">
                <span>Within</span>
                <select
                  id="nearby-radius-select"
                  value={radiusM}
                  onChange={e => changeRadius(Number(e.target.value))}
                  className="min-h-12 rounded-xl border border-stone-200 bg-white px-2 text-xs font-semibold text-stone-800"
                >
                  {NEARBY_RADII_M.map(r => (
                    <option key={r} value={r}>
                      {radiusLabel(r)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div role="status" aria-live="polite">
              {renderNearbyStatus()}
            </div>

            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter places by category">
              {filters.map(f => {
                const active = filter === f.id;
                const showCount = f.id === 'samples' || nearby.status === 'ready';
                return (
                  <button
                    key={f.id}
                    id={`nearby-filter-${f.id}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(f.id)}
                    className={`inline-flex min-h-12 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-xs font-semibold transition ${
                      active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    {f.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: f.color }} />}
                    <span>{f.label}</span>
                    {showCount && <span className={active ? 'text-stone-300' : 'text-stone-400'}>{counts[f.id] ?? 0}</span>}
                  </button>
                );
              })}
            </div>

            {visibleItems.length > 0 ? (
              <ul className="divide-y divide-stone-100" aria-label="Places">
                {visibleItems.map(item => {
                  const selected = item.id === selectedId;
                  const isLive = item.kind === 'live';
                  const name = isLive ? liveName(item.place as LivePlace) : placeName(item.place as Place);
                  const sub = isLive
                    ? (item.place as LivePlace).kind
                    : `Sample · ${(item.place as Place).category.replace('_', ' ')}`;
                  const color = isLive ? CATEGORY_META[(item.place as LivePlace).category].color : '#fde68a';
                  return (
                    <li key={item.id}>
                      <button
                        id={`nearby-item-${item.id.replace(/[^a-z0-9_-]/gi, '-')}`}
                        type="button"
                        aria-current={selected ? 'true' : undefined}
                        onClick={() =>
                          item.kind === 'live' ? chooseLive(item.place, 'list') : chooseSample(item.place, 'list')
                        }
                        className={`flex min-h-12 w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition ${
                          selected ? 'bg-orange-50 ring-1 ring-orange-300' : 'hover:bg-stone-50'
                        }`}
                      >
                        <span
                          className={`h-3 w-3 shrink-0 rounded-full ${isLive ? '' : 'border border-dashed border-amber-800'}`}
                          style={{ backgroundColor: color }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-stone-900">{name}</span>
                          <span className="block truncate text-[11px] text-stone-500">{sub}</span>
                        </span>
                        {item.km !== null && (
                          <span className="shrink-0 text-xs font-semibold text-stone-700">
                            {item.km * 1000 < 15 ? 'here' : formatDistance(item.km)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              emptyMessage() && <p className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600">{emptyMessage()}</p>
            )}

            {listItems.length > LIST_LIMIT && (
              <p className="text-[11px] text-stone-500">
                Showing the nearest {LIST_LIMIT} of {listItems.length}. Pick a category to narrow the list.
              </p>
            )}

            <p className="border-t border-stone-100 pt-2 text-[10px] leading-relaxed text-stone-500">
              Place data{' '}
              <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className="underline">
                © OpenStreetMap contributors
              </a>{' '}
              (ODbL). Places are mapped by volunteers and are not checked by Namo Yatri or the Kumbh administration.
              Distances are straight-line from {anchor ? anchor.label : 'the chosen point'}.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
