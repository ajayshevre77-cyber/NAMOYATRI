import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Car,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Footprints,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  Sparkles,
  X,
} from 'lucide-react';
import { GeoPoint, OSM_COPYRIGHT_URL, SERVICE_AREA, formatDistance } from '../lib/geo';
import { MIN_ROUTE_STOPS, RouteResponse, TRAVEL_MODES, TravelMode, formatDuration, routeKey } from '../lib/routing';
import {
  DayRouteState,
  DayRouteView,
  ItineraryRequest,
  ItineraryResponse,
  ItineraryStop,
  MAX_TRIP_DAYS,
  MIN_TRIP_DAYS,
  TRIP_AREAS,
  TRIP_BUDGETS,
  TRIP_INTERESTS,
  TRIP_PACES,
  TRIP_PLACE_CATEGORIES,
  TripArea,
  TripBudget,
  TripInterest,
  TripPace,
  dayRoutePoints,
  dayRouteView,
  moveItem,
  removeItem,
  withoutPendingRoute,
} from '../lib/itinerary';
import { GeoRequestError, UserPosition, fetchRoute } from '../lib/geoApi';
import { fetchItineraryStatus, requestItinerary } from '../lib/itineraryApi';
import { RideDraft, rideDraftForTripStop } from '../lib/rides';
import { MapRouteStop } from './PilgrimMap';
import { RETRYABLE_CODES, RouteStopItem, googleMapsDirectionsUrl, googleMapsPlaceDirectionsUrl } from './RoutePlanner';

/** Where the trip starts, as chosen in the form. A point also starts every day's route. */
export type TripStartChoice =
  | { type: 'area'; area: TripArea }
  | { type: 'point'; point: GeoPoint; label: string; kind: 'user' | 'place' | 'sample'; note?: string };

/** A place the user picked on the map, offered as the starting point. */
export interface SelectedStartPlace {
  point: GeoPoint;
  label: string;
  kind: 'place' | 'sample';
  note?: string;
}

interface DayState {
  day: number;
  title: string;
  summary: string;
  stops: ItineraryStop[];
  route: DayRouteState;
}

interface Trip {
  response: ItineraryResponse;
  days: DayState[];
  /** How the start was chosen, for the Google Maps link (a "user" start is left out). */
  startKind: 'user' | 'place' | 'sample' | null;
  routingConfigured: boolean;
}

type Generation =
  | { status: 'idle' }
  | { status: 'loading'; slow: boolean }
  | { status: 'cancelled' }
  | { status: 'error'; code: string; message: string; canRetry: boolean };

type Availability = 'checking' | 'configured' | 'not_configured' | 'unknown';

/** Plan failures where asking again might work. */
const GENERATE_RETRYABLE = new Set([
  ...RETRYABLE_CODES,
  'AI_PROVIDER_BUSY',
  'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_UNREACHABLE',
  'AI_PROVIDER_FAILED',
  'AI_BAD_RESPONSE',
  'AI_RATE_LIMITED',
  'ITINERARY_BUSY',
  'ITINERARY_FAILED',
  'GEO_UPSTREAM_BUSY',
  'GEO_UPSTREAM_TIMEOUT',
  'GEO_UPSTREAM_UNREACHABLE',
  'GEO_UPSTREAM_FAILED',
  'GEO_UPSTREAM_BAD_RESPONSE',
]);

const canRetryCode = (codes: Set<string>, code: string) => codes.has(code) || code.startsWith('HTTP_5');

/** Routes fetched in this visit, so undoing an edit costs nothing. */
const ROUTE_CACHE_LIMIT = 30;

const startPointOf = (trip: Trip): GeoPoint | null =>
  trip.response.start ? { lat: trip.response.start.lat, lon: trip.response.start.lon } : null;

/**
 * State for the AI trip planner: the form, the generated plan, and each
 * day's editable stops and road route. Plans are only requested when the
 * user asks, one at a time. A day's route is recalculated when the user taps
 * "Update route", or when the travel mode changes while that day is on the
 * map. Nothing is saved anywhere.
 */
export function useTripPlanner(onShow?: (view: { points: GeoPoint[]; route: RouteResponse | null }) => void) {
  const [days, setDays] = useState(2);
  const [start, setStartState] = useState<TripStartChoice>({ type: 'area', area: 'nashik' });
  /** The last place or location chosen, kept so switching to an area and back does not lose it. */
  const [savedPoint, setSavedPoint] = useState<Extract<TripStartChoice, { type: 'point' }> | null>(null);
  const [interests, setInterests] = useState<TripInterest[]>(['pilgrimage', 'temples']);
  const [budget, setBudget] = useState<TripBudget>('moderate');
  const [pace, setPace] = useState<TripPace>('balanced');
  const [mode, setModeState] = useState<TravelMode>('walking');

  const [availability, setAvailability] = useState<Availability>('checking');
  const [generation, setGeneration] = useState<Generation>({ status: 'idle' });
  const [trip, setTrip] = useState<Trip | null>(null);
  const [shownDay, setShownDay] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const generateAbort = useRef<AbortController | null>(null);
  const routeAborts = useRef(new Map<number, AbortController>());
  const cache = useRef(new Map<string, RouteResponse>());
  const showRef = useRef(onShow);
  showRef.current = onShow;
  /** For code that runs after an await. */
  const latest = useRef({ trip, mode, shownDay });
  latest.current = { trip, mode, shownDay };

  useEffect(() => {
    const controller = new AbortController();
    fetchItineraryStatus(controller.signal)
      .then(s => setAvailability(s.aiConfigured ? 'configured' : 'not_configured'))
      .catch(err => {
        if (err?.name !== 'AbortError') setAvailability('unknown');
      });
    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      generateAbort.current?.abort();
      routeAborts.current.forEach(c => c.abort());
    },
    [],
  );

  const remember = (key: string, route: RouteResponse) => {
    cache.current.set(key, route);
    if (cache.current.size > ROUTE_CACHE_LIMIT) cache.current.delete(cache.current.keys().next().value!);
  };

  const pointsOf = (t: Trip, day: DayState) => dayRoutePoints(startPointOf(t), day.stops);

  /** The current route section for a day, given the stops and mode right now. */
  const viewOf = (t: Trip, day: DayState, forMode: TravelMode = mode): DayRouteView =>
    dayRouteView(
      { routingConfigured: t.routingConfigured, points: pointsOf(t, day), mode: forMode, state: day.route },
      key => cache.current.get(key),
    );

  const updateDay = (index: number, change: (day: DayState) => DayState) =>
    setTrip(t => (t ? { ...t, days: t.days.map((d, i) => (i === index ? change(d) : d)) } : t));

  const setStart = (choice: TripStartChoice) => {
    setStartState(choice);
    if (choice.type === 'point') setSavedPoint(choice);
  };

  // ---------------------------------------------------------------------------
  // Generating
  // ---------------------------------------------------------------------------

  const formProblem =
    interests.length === 0 ? 'Choose at least one interest.' : availability === 'not_configured' ? 'AI trip planning is not set up.' : null;

  const generate = async () => {
    if (formProblem || generation.status === 'loading') return;
    const request: ItineraryRequest = {
      days,
      start: start.type === 'area' ? start : { type: 'point', lat: start.point.lat, lon: start.point.lon, label: start.label },
      interests,
      budget,
      pace,
      mode,
    };
    generateAbort.current?.abort();
    const controller = new AbortController();
    generateAbort.current = controller;
    setGeneration({ status: 'loading', slow: false });
    setAnnouncement('Planning your trip. This can take up to two minutes.');
    const slowTimer = setTimeout(
      () => setGeneration(g => (g.status === 'loading' ? { status: 'loading', slow: true } : g)),
      60_000,
    );
    try {
      const response = await requestItinerary(request, controller.signal);
      if (generateAbort.current !== controller) return;
      routeAborts.current.forEach(c => c.abort());
      routeAborts.current.clear();
      const startPoint = response.start ? { lat: response.start.lat, lon: response.start.lon } : null;
      const next: Trip = {
        response,
        startKind: start.type === 'point' ? start.kind : null,
        routingConfigured: response.routing.configured,
        days: response.days.map(d => {
          let route: DayRouteState = { status: 'none' };
          if (d.route.status === 'ok' && d.route.route) {
            const key = routeKey(d.route.route.mode, d.route.route.stops);
            remember(key, d.route.route);
            route = { status: 'ok', key, data: d.route.route };
          } else if ((d.route.status === 'failed' || d.route.status === 'skipped') && d.route.code) {
            route = {
              status: 'error',
              key: routeKey(response.mode, dayRoutePoints(startPoint, d.stops)),
              code: d.route.code,
              message: d.route.message ?? 'The route for this day could not be calculated.',
              canRetry: canRetryCode(RETRYABLE_CODES, d.route.code),
            };
          }
          return { day: d.day, title: d.title, summary: d.summary, stops: d.stops, route };
        }),
      };
      setTrip(next);
      setGeneration({ status: 'idle' });
      setAnnouncement(`Your ${response.dayCount}-day plan is ready. Day 1 is shown on the map.`);
      setShownDay(0);
      const first = next.days[0];
      showRef.current?.({
        points: pointsOf(next, first),
        route: first.route.status === 'ok' ? first.route.data : null,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || generateAbort.current !== controller) return;
      const code = err instanceof GeoRequestError ? err.code : 'UNKNOWN';
      if (code === 'AI_NOT_CONFIGURED') setAvailability('not_configured');
      const message = err instanceof GeoRequestError ? err.message : 'The trip could not be planned. Please try again.';
      setGeneration({ status: 'error', code, message, canRetry: canRetryCode(GENERATE_RETRYABLE, code) });
      setAnnouncement(`No plan was made. ${message}`);
    } finally {
      clearTimeout(slowTimer);
      if (generateAbort.current === controller) generateAbort.current = null;
    }
  };

  // Aborting closes the connection, which also stops the server's remaining
  // AI and routing calls for this plan.
  const cancel = () => {
    generateAbort.current?.abort();
    generateAbort.current = null;
    setGeneration({ status: 'cancelled' });
    setAnnouncement('Trip planning cancelled. No itinerary was made.');
  };

  const clearTrip = () => {
    routeAborts.current.forEach(c => c.abort());
    routeAborts.current.clear();
    setTrip(null);
    setShownDay(null);
    setAnnouncement('Itinerary cleared.');
  };

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  /** Recalculates one day's road route for its current stops and the given mode. */
  const updateRoute = async (index: number, forMode: TravelMode = mode) => {
    const t = latest.current.trip;
    const day = t?.days[index];
    if (!t || !day || !t.routingConfigured) return;
    const points = pointsOf(t, day);
    if (points.length < MIN_ROUTE_STOPS) return;
    const key = routeKey(forMode, points);
    if (day.route.status === 'loading' && day.route.key === key) return;

    routeAborts.current.get(index)?.abort();
    const hit = cache.current.get(key);
    if (hit) {
      updateDay(index, d => ({ ...d, route: { status: 'ok', key, data: hit } }));
      if (latest.current.shownDay === index) showRef.current?.({ points, route: hit });
      return;
    }

    const controller = new AbortController();
    routeAborts.current.set(index, controller);
    updateDay(index, d => ({ ...d, route: { status: 'loading', key, slow: false } }));
    setAnnouncement(`Calculating the route for day ${day.day}…`);
    const slowTimer = setTimeout(
      () => updateDay(index, d => (d.route.status === 'loading' && d.route.key === key ? { ...d, route: { ...d.route, slow: true } } : d)),
      5000,
    );
    try {
      const route = await fetchRoute(forMode, points, controller.signal);
      if (routeAborts.current.get(index) !== controller) return;
      remember(key, route);
      updateDay(index, d => ({ ...d, route: { status: 'ok', key, data: route } }));
      setAnnouncement(
        `Day ${day.day} route: ${formatDistance(route.distanceM / 1000)} by road, ${aboutDuration(route.durationS)} ${verbFor(route.mode)}.`,
      );
      if (latest.current.shownDay === index) showRef.current?.({ points, route });
    } catch (err: any) {
      if (err?.name === 'AbortError' || routeAborts.current.get(index) !== controller) return;
      const code = err instanceof GeoRequestError ? err.code : 'UNKNOWN';
      if (code === 'ROUTING_NOT_CONFIGURED') setTrip(t2 => (t2 ? { ...t2, routingConfigured: false } : t2));
      const message = err instanceof GeoRequestError ? err.message : 'The route could not be calculated. Please try again.';
      updateDay(index, d => ({ ...d, route: { status: 'error', key, code, message, canRetry: canRetryCode(RETRYABLE_CODES, code) } }));
      setAnnouncement(`No route for day ${day.day}. ${message}`);
    } finally {
      clearTimeout(slowTimer);
      if (routeAborts.current.get(index) === controller) routeAborts.current.delete(index);
    }
  };

  /** Changing mode keeps the plan; the day on the map is recalculated at once, the others on request. */
  const setMode = (next: TravelMode) => {
    if (next === mode) return;
    setModeState(next);
    const { trip: t, shownDay: shown } = latest.current;
    if (t && shown !== null) void updateRoute(shown, next);
  };

  // ---------------------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------------------

  const cancelRoute = (index: number) => {
    routeAborts.current.get(index)?.abort();
    routeAborts.current.delete(index);
  };

  const moveStop = (index: number, stopIndex: number, delta: -1 | 1) => {
    const day = trip?.days[index];
    const stop = day?.stops[stopIndex];
    if (!day || !stop) return;
    const target = stopIndex + delta;
    if (target < 0 || target >= day.stops.length) return;
    cancelRoute(index);
    updateDay(index, d => ({ ...d, stops: moveItem(d.stops, stopIndex, delta), route: withoutPendingRoute(d.route) }));
    setAnnouncement(`${stop.name} moved to position ${target + 1} of ${day.stops.length} on day ${day.day}. Update the route to see the new one.`);
  };

  const removeStop = (index: number, stopIndex: number) => {
    const day = trip?.days[index];
    const stop = day?.stops[stopIndex];
    if (!day || !stop) return;
    cancelRoute(index);
    updateDay(index, d => ({ ...d, stops: removeItem(d.stops, stopIndex), route: withoutPendingRoute(d.route) }));
    setAnnouncement(`${stop.name} removed from day ${day.day}.`);
  };

  /** A demo ride to a stop, picked up at the stop before it (or the trip's starting place). */
  const rideDraftFor = (index: number, stopIndex: number): Omit<RideDraft, 'id'> | null => {
    const day = trip?.days[index];
    if (!trip || !day) return null;
    return rideDraftForTripStop(
      { start: trip.response.start, startKind: trip.startKind, day: day.day, stops: day.stops },
      stopIndex,
    );
  };

  /** Puts a day on the map, or takes the trip off it with null. */
  const showDay = (index: number | null) => {
    setShownDay(index);
    if (index === null || !trip) return;
    const day = trip.days[index];
    const view = viewOf(trip, day);
    showRef.current?.({ points: pointsOf(trip, day), route: view.kind === 'ok' ? view.route : null });
  };

  // ---------------------------------------------------------------------------
  // What the map shows
  // ---------------------------------------------------------------------------

  let mapDay: { day: number; stops: MapRouteStop[]; path: [number, number][] | null; route: RouteResponse | null } | null = null;
  if (trip && shownDay !== null && trip.days[shownDay]) {
    const day = trip.days[shownDay];
    const view = viewOf(trip, day);
    const route = view.kind === 'ok' ? view.route : null;
    mapDay = {
      day: day.day,
      stops: [
        ...(trip.response.start ? [{ point: trip.response.start, label: trip.response.start.label, badge: 'S' }] : []),
        ...day.stops.map((s, i) => ({ point: { lat: s.lat, lon: s.lon }, label: s.name, badge: String(i + 1) })),
      ],
      path: route?.path ?? null,
      route,
    };
  }

  return {
    form: { days, setDays, start, setStart, savedPoint, interests, setInterests, budget, setBudget, pace, setPace },
    mode,
    setMode,
    availability,
    generation,
    formProblem,
    generate,
    cancel,
    trip,
    clearTrip,
    viewOf: (day: DayState) => (trip ? viewOf(trip, day) : ({ kind: 'outdated' } as DayRouteView)),
    updateRoute,
    moveStop,
    removeStop,
    rideDraftFor,
    shownDay,
    showDay,
    mapDay,
    announcement,
  };
}

export type TripPlannerState = ReturnType<typeof useTripPlanner>;

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

const verbFor = (mode: TravelMode) => TRAVEL_MODES.find(m => m.id === mode)?.verb ?? mode;
/** "about 14 min", or "under 1 min" without a doubled "about". */
export const aboutDuration = (seconds: number) => (seconds < 60 ? formatDuration(seconds) : `about ${formatDuration(seconds)}`);
const categoryLabel = (id: string) => TRIP_PLACE_CATEGORIES.find(c => c.id === id)?.label ?? id;
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const chip =
  'inline-flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 has-[:checked]:border-stone-900 has-[:checked]:bg-stone-900 has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange-500';
const smallButton =
  'inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 disabled:opacity-60';
const iconButton = 'flex h-12 w-12 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-200 disabled:opacity-30';

/** Opens the ride form with a stop as the destination. */
type RequestRide = (draft: Omit<RideDraft, 'id'>) => void;

interface Props {
  trip: TripPlannerState;
  selectedPlace: SelectedStartPlace | null;
  onUseMyLocation: () => Promise<UserPosition | null>;
  locating: boolean;
  onFocusPoint: (point: GeoPoint) => void;
  onRequestRide?: RequestRide;
}

export const TripPlanner: React.FC<Props> = ({ trip, selectedPlace, onUseMyLocation, locating, onFocusPoint, onRequestRide }) => {
  const { form, mode, availability, generation, formProblem } = trip;
  const loading = generation.status === 'loading';
  const notConfigured = availability === 'not_configured';
  const pointStart = form.savedPoint;
  const startsAtPoint = form.start.type === 'point';

  const useMyLocation = async () => {
    const pos = await onUseMyLocation();
    if (!pos) return;
    form.setStart({
      type: 'point',
      point: { lat: pos.lat, lon: pos.lon },
      label: 'Your location',
      kind: 'user',
      note: `Accurate to about ${formatDistance(pos.accuracyM / 1000)}`,
    });
  };

  const toggleInterest = (id: TripInterest) =>
    form.setInterests(form.interests.includes(id) ? form.interests.filter(i => i !== id) : [...form.interests, id]);

  const selectedBudget = TRIP_BUDGETS.find(b => b.id === form.budget)!;

  return (
    <section
      id="trip-planner"
      aria-labelledby="trip-heading"
      className="scroll-mt-20 space-y-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm"
    >
      <div>
        {/* Focusable so "Plan a trip" on Home can move focus here. */}
        <h3
          id="trip-heading"
          tabIndex={-1}
          className="flex items-center gap-1.5 rounded-md text-sm font-bold text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <Sparkles className="h-4 w-4 text-orange-600" />
          Plan a trip with Namo AI
        </h3>
        <p className="mt-0.5 text-xs text-stone-600">
          Say how long you are staying and what you enjoy. Namo AI picks real places from OpenStreetMap and suggests a
          day-by-day order; road routes come from the route planner. You can reorder or remove any stop.
        </p>
      </div>

      {notConfigured && (
        <div id="trip-ai-not-configured" className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <p className="font-semibold">AI trip planning is not set up on this server yet.</p>
          <p className="mt-0.5">
            No itinerary can be made until the AI service is configured. You can still plan a route yourself above.
          </p>
        </div>
      )}
      {availability === 'unknown' && (
        <p className="rounded-xl bg-stone-50 p-2.5 text-xs text-stone-600">
          Could not check whether AI trip planning is available. You can still try.
        </p>
      )}

      <form
        id="trip-form"
        noValidate
        onSubmit={e => {
          e.preventDefault();
          void trip.generate();
        }}
        className="space-y-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="trip-days" className="text-xs font-bold text-stone-800">
            Days
          </label>
          <select
            id="trip-days"
            value={form.days}
            onChange={e => form.setDays(Number(e.target.value))}
            className="min-h-12 rounded-xl border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-900"
          >
            {Array.from({ length: MAX_TRIP_DAYS - MIN_TRIP_DAYS + 1 }, (_, i) => MIN_TRIP_DAYS + i).map(n => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'day' : 'days'}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-bold text-stone-800">Starting point</legend>
          <div className="flex flex-col gap-1.5">
            {TRIP_AREAS.map(a => (
              <label key={a.id} className={`${chip} justify-start`}>
                <input
                  type="radio"
                  name="trip-start"
                  className="sr-only"
                  checked={form.start.type === 'area' && form.start.area === a.id}
                  onChange={() => form.setStart({ type: 'area', area: a.id })}
                />
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="text-left">{a.label} (no fixed start)</span>
              </label>
            ))}
            {pointStart && (
              <label className={`${chip} justify-start`}>
                <input
                  type="radio"
                  name="trip-start"
                  className="sr-only"
                  checked={startsAtPoint}
                  onChange={() => form.setStart(pointStart)}
                />
                {pointStart.kind === 'user' ? <LocateFixed className="h-4 w-4 shrink-0" /> : <MapPin className="h-4 w-4 shrink-0" />}
                <span className="min-w-0 text-left">
                  <span className="block break-words">Start each day at {pointStart.label}</span>
                  {pointStart.note && <span className="block font-normal opacity-80">{pointStart.note}</span>}
                </span>
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedPlace && !(startsAtPoint && pointStart?.label === selectedPlace.label && pointStart.kind === selectedPlace.kind) && (
              <button
                id="trip-start-selected-btn"
                type="button"
                onClick={() => form.setStart({ type: 'point', ...selectedPlace })}
                className={smallButton}
              >
                <MapPin className="h-4 w-4 text-orange-600" />
                <span className="text-left">Start at {selectedPlace.label}</span>
              </button>
            )}
            {!(startsAtPoint && pointStart?.kind === 'user') && (
              <button id="trip-start-location-btn" type="button" onClick={useMyLocation} disabled={locating} className={smallButton}>
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4 text-blue-700" />}
                <span>Start from my location</span>
              </button>
            )}
          </div>
          <p className="text-[11px] text-stone-500">
            {selectedPlace
              ? 'Or pick another place on the map or in search to start from there.'
              : 'To start at a particular place, pick it on the map or in search first.'}{' '}
            Places are looked up within about {mode === 'walking' ? '3 km' : '8 km'} of the start
            {mode === 'driving' ? ', plus Nashik or Trimbakeshwar when that is further away' : ''}.
          </p>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-bold text-stone-800">Interests</legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {TRIP_INTERESTS.map(i => (
              <label key={i.id} className={chip}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={form.interests.includes(i.id)}
                  onChange={() => toggleInterest(i.id)}
                />
                <span>{i.label}</span>
              </label>
            ))}
          </div>
          {form.interests.length === 0 && (
            <p id="trip-interests-error" className="text-[11px] font-semibold text-red-800">
              Choose at least one interest.
            </p>
          )}
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-bold text-stone-800">Budget</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {TRIP_BUDGETS.map(b => (
              <label key={b.id} className={chip}>
                <input
                  type="radio"
                  name="trip-budget"
                  className="sr-only"
                  checked={form.budget === b.id}
                  onChange={() => form.setBudget(b.id)}
                  aria-describedby="trip-budget-help"
                />
                <span>{b.label}</span>
              </label>
            ))}
          </div>
          <p id="trip-budget-help" className="text-[11px] text-stone-500">
            {selectedBudget.description} Namo Yatri has no prices, so this only guides which kinds of places are suggested.
          </p>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-bold text-stone-800">Pace</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {TRIP_PACES.map(p => (
              <label key={p.id} className={`${chip} flex-col gap-0 py-1 leading-tight`}>
                <input type="radio" name="trip-pace" className="sr-only" checked={form.pace === p.id} onChange={() => form.setPace(p.id)} />
                <span>{p.label}</span>
                <span className="text-[10px] font-normal opacity-80">
                  {p.minStops}–{p.maxStops} stops a day
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-bold text-stone-800">Getting around</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {TRAVEL_MODES.map(m => {
              const Icon = m.id === 'walking' ? Footprints : Car;
              return (
                <label key={m.id} className={chip}>
                  <input type="radio" name="trip-mode" className="sr-only" checked={mode === m.id} onChange={() => trip.setMode(m.id)} />
                  <Icon className="h-4 w-4" />
                  <span>{m.label}</span>
                </label>
              );
            })}
          </div>
          {trip.trip && mode !== trip.trip.response.mode && (
            <p className="text-[11px] text-stone-500">
              Your plan was made for {verbFor(trip.trip.response.mode)}. Its routes are now worked out for {verbFor(mode)};
              regenerate for places chosen with {verbFor(mode)} in mind.
            </p>
          )}
        </fieldset>

        <button
          id="trip-generate-btn"
          type="submit"
          disabled={!!formProblem || loading}
          aria-describedby={form.interests.length === 0 ? 'trip-interests-error' : undefined}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:bg-stone-300 disabled:text-stone-600"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Planning your trip…' : trip.trip ? 'Regenerate itinerary' : 'Generate itinerary'}
        </button>
      </form>

      <div role="status" aria-live="polite" className="space-y-2 text-xs">
        {generation.status === 'loading' && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 p-2.5 text-stone-700">
            <span className="min-w-0 flex-1">
              Finding real places, asking Namo AI to plan the days, then calculating road routes. This can take up to two
              minutes, mostly waiting for the free OpenStreetMap place service.
              {generation.slow && (
                <span className="block text-stone-500">
                  Still working: the place service is slow right now. You can keep waiting or cancel.
                </span>
              )}
            </span>
            <button id="trip-cancel-btn" type="button" onClick={trip.cancel} className="inline-flex min-h-12 items-center rounded-xl px-2 font-semibold underline">
              Cancel
            </button>
          </div>
        )}
        {generation.status === 'cancelled' && (
          <p id="trip-cancelled" className="rounded-xl bg-stone-50 p-2.5 text-stone-700">
            You cancelled planning, so no itinerary was made.
            {trip.trip && ' Your previous plan is still shown below.'}
          </p>
        )}
        {generation.status === 'error' && (
          <div id="trip-error" className="space-y-1.5 rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-900">
            <p className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>No itinerary.</strong> {generation.message}
              </span>
            </p>
            {trip.trip && <p className="text-red-800/80">Your previous plan is still shown below.</p>}
            {generation.canRetry && (
              <button
                id="trip-retry-btn"
                type="button"
                onClick={() => void trip.generate()}
                className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-white px-3 font-semibold ring-1 ring-red-200 hover:bg-red-100"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>
            )}
          </div>
        )}
        <p className="sr-only">{trip.announcement}</p>
      </div>

      {trip.trip && <Itinerary trip={trip} onFocusPoint={onFocusPoint} onRequestRide={onRequestRide} />}

      <p className="border-t border-stone-100 pt-2 text-[10px] leading-relaxed text-stone-500">
        To plan, Namo Yatri looks up places on OpenStreetMap around your start (rounded to about 100 m) and sends the list,
        with each place’s distance from the start, to Google’s Gemini AI. Your location itself is not sent to the AI. Only
        places in the {SERVICE_AREA.name} are used; Kumbh sample sites are not. Nothing is saved.
      </p>
    </section>
  );
};

// ---------------------------------------------------------------------------
// The itinerary
// ---------------------------------------------------------------------------

const Itinerary: React.FC<{ trip: TripPlannerState; onFocusPoint: (point: GeoPoint) => void; onRequestRide?: RequestRide }> = ({
  trip,
  onFocusPoint,
  onRequestRide,
}) => {
  const t = trip.trip!;
  const r = t.response;
  const mode = trip.mode;
  const interestLabels = r.interests.map(i => TRIP_INTERESTS.find(x => x.id === i)?.label ?? i).join(', ');

  return (
    <div id="trip-result" className="space-y-3">
      <div className="space-y-1.5 rounded-xl border border-orange-200 bg-orange-50/60 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-orange-800">
              AI suggestion · not checked by anyone
            </p>
            <h4 className="text-base font-bold text-stone-900">
              Your {r.dayCount}-day plan from{' '}
              {r.start ? (t.startKind === 'user' ? 'your location' : r.start.label) : `the ${r.startLabel}`}
            </h4>
          </div>
          <button
            id="trip-clear-btn"
            type="button"
            onClick={trip.clearTrip}
            className="-my-1 -mr-1 inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl px-2 text-xs font-semibold text-stone-600 underline hover:bg-white"
          >
            Clear
          </button>
        </div>
        <p className="text-[11px] text-stone-600">
          {TRAVEL_MODES.find(m => m.id === r.mode)?.label} · {TRIP_PACES.find(p => p.id === r.pace)?.label} pace ·{' '}
          {TRIP_BUDGETS.find(b => b.id === r.budget)?.label} budget · {interestLabels}
        </p>
        {r.summary && <p className="text-sm text-stone-800">{r.summary}</p>}
        {r.warnings.map(w => (
          <p key={w} className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{w}</span>
          </p>
        ))}
        {!t.routingConfigured && (
          <p id="trip-routing-not-configured" className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">
            Road routes are not set up on this server, so no road distances or travel times are shown. The stops and their
            order are still usable, and each day opens in Google Maps for directions.
          </p>
        )}
      </div>

      <ol aria-label="Days of your trip" className="space-y-3">
        {t.days.map((day, index) => (
          <li key={day.day}>
            <TripDay trip={trip} day={day} index={index} mode={mode} onFocusPoint={onFocusPoint} onRequestRide={onRequestRide} />
          </li>
        ))}
      </ol>

      <p className="text-[10px] leading-relaxed text-stone-500">
        Places: OpenStreetMap contributors (
        <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className="underline">
          ODbL
        </a>
        ), not checked by Namo Yatri or the Kumbh administration
        {r.places.dataTimestamp ? `; data as of ${formatDate(r.places.dataTimestamp)}` : ''}. Chosen from{' '}
        {r.places.candidateCount} mapped places. Plan and reasons: Google Gemini ({r.ai.model}), {formatDate(r.ai.generatedAt)}
        ; reasons and visit times are suggestions, not facts. Opening hours, entry rules and Kumbh arrangements change: check
        locally and follow official signs and marshals.
        {t.days.some(d => d.route.status === 'ok') && ' Routes © openrouteservice.org by HeiGIT.'}
      </p>
    </div>
  );
};

const TripDay: React.FC<{
  trip: TripPlannerState;
  day: DayState;
  index: number;
  mode: TravelMode;
  onFocusPoint: (point: GeoPoint) => void;
  onRequestRide?: RequestRide;
}> = ({ trip, day, index, mode, onFocusPoint, onRequestRide }) => {
  const t = trip.trip!;
  const start = t.response.start;
  const view = trip.viewOf(day);
  const route = view.kind === 'ok' ? view.route : null;
  const shown = trip.shownDay === index;
  const visitTotal = day.stops.reduce((total, s) => total + (s.visitMinutes ?? 0), 0);
  const headingId = `trip-day-${day.day}-heading`;

  /** The leg that arrives at stop `i`: with a start, leg i; without, leg i - 1. */
  const legInto = (i: number) => {
    if (!route) return null;
    const leg = route.legs[start ? i : i - 1];
    return leg ?? null;
  };

  const directionStops: RouteStopItem[] = [
    ...(start ? [{ id: 'start', point: start, label: start.label, kind: (t.startKind ?? 'place') as RouteStopItem['kind'] }] : []),
    ...day.stops.map(s => ({ id: s.placeId, point: { lat: s.lat, lon: s.lon }, label: s.name, kind: 'place' as const })),
  ];

  return (
    <article
      id={`trip-day-${day.day}`}
      aria-labelledby={headingId}
      className={`space-y-2 rounded-xl border p-3 ${shown ? 'border-blue-300 bg-blue-50/40' : 'border-stone-200 bg-stone-50/60'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-[10rem] flex-1">
          {/* Focusable so "Back to trip plan" in the ride form can land here. */}
          <h4
            id={headingId}
            tabIndex={-1}
            className="rounded-md text-sm font-bold text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <span className="text-orange-700">Day {day.day}</span> · {day.title}
          </h4>
          {day.summary && <p className="text-xs text-stone-600">{day.summary}</p>}
        </div>
        <button
          id={`trip-day-${day.day}-map-btn`}
          type="button"
          aria-pressed={shown}
          onClick={() => trip.showDay(shown ? null : index)}
          className={`${smallButton} ${shown ? 'border-blue-300 bg-blue-100 text-blue-900' : ''}`}
        >
          <MapPin className="h-4 w-4" />
          <span>{shown ? 'On the map' : 'Show on map'}</span>
        </button>
      </div>

      {day.stops.length > 0 && <DayRouteLine view={view} dayNumber={day.day} />}

      <ol aria-label={`Stops on day ${day.day}, in order`} className="space-y-1.5">
        {start && (
          <li className="flex items-center gap-2 rounded-lg bg-white/70 py-1 pl-2 text-xs text-stone-700">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
              S
            </span>
            <span className="min-w-0 break-words">
              <span className="font-semibold">Start:</span> {start.label}
            </span>
          </li>
        )}
        {day.stops.map((stop, i) => {
          const leg = legInto(i);
          return (
            <li key={stop.placeId} className="space-y-1 rounded-lg bg-white p-2 shadow-xs ring-1 ring-stone-200">
              <div className="flex flex-wrap items-start gap-x-2">
                <span
                  aria-hidden="true"
                  className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    i === day.stops.length - 1 && day.stops.length > 1 ? 'bg-stone-900' : !start && i === 0 ? 'bg-green-600' : 'bg-orange-500'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-[8rem] flex-1">
                  <span className="block break-words text-sm font-semibold leading-snug text-stone-900">{stop.name}</span>
                  <span className="block text-[11px] text-stone-500">
                    {stop.kind} · {categoryLabel(stop.category)}
                  </span>
                </span>
                <span className="ml-auto flex shrink-0">
                  <button
                    type="button"
                    onClick={() => trip.moveStop(index, i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${stop.name} earlier on day ${day.day}`}
                    className={iconButton}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => trip.moveStop(index, i, 1)}
                    disabled={i === day.stops.length - 1}
                    aria-label={`Move ${stop.name} later on day ${day.day}`}
                    className={iconButton}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => trip.removeStop(index, i)}
                    aria-label={`Remove ${stop.name} from day ${day.day}`}
                    className={iconButton}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              </div>

              {stop.reason && (
                <p className="text-xs text-stone-700">
                  <span className="font-semibold text-orange-800">Why (AI): </span>
                  {stop.reason}
                </p>
              )}
              <div className="space-y-0.5 text-[11px] text-stone-500">
                {stop.visitMinutes !== null && <p>Suggested time here: about {formatDuration(stop.visitMinutes * 60)} (AI estimate)</p>}
                {stop.address && <p>{stop.address}</p>}
                {stop.openingHours && (
                  <p>
                    Opening hours listed on OpenStreetMap: <span className="font-mono">{stop.openingHours}</span> (may be out of
                    date)
                  </p>
                )}
                {leg && (leg.distanceM !== null || leg.durationS !== null) && (
                  <p className="font-semibold text-blue-900">
                    {leg.distanceM !== null ? `${formatDistance(leg.distanceM / 1000)} by road` : 'distance not given'}
                    {' · '}
                    {leg.durationS !== null ? aboutDuration(leg.durationS) : 'time not given'} from{' '}
                    {i === 0 ? 'the start' : 'the previous stop'}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!shown) trip.showDay(index);
                    onFocusPoint({ lat: stop.lat, lon: stop.lon });
                  }}
                  className={smallButton}
                  aria-label={`Show ${stop.name} on the map`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span>Map</span>
                </button>
                <a
                  href={googleMapsPlaceDirectionsUrl({ lat: stop.lat, lon: stop.lon }, mode)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={smallButton}
                  aria-label={`Directions to ${stop.name} in Google Maps`}
                >
                  <Navigation className="h-3.5 w-3.5 text-orange-600" />
                  <span>Directions</span>
                </a>
                {onRequestRide && (
                  <button
                    type="button"
                    onClick={() => {
                      const draft = trip.rideDraftFor(index, i);
                      if (draft) onRequestRide(draft);
                    }}
                    className={smallButton}
                    aria-label={`Request a demo ride to ${stop.name}`}
                  >
                    <Car className="h-3.5 w-3.5 text-orange-600" />
                    <span>Request a ride (demo)</span>
                  </button>
                )}
                <a
                  href={stop.osmUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={smallButton}
                  aria-label={`${stop.name} on OpenStreetMap`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>OpenStreetMap</span>
                </a>
              </div>
            </li>
          );
        })}
      </ol>

      {day.stops.length === 0 && (
        <p className="rounded-lg bg-white p-2 text-xs text-stone-600">
          You removed every stop from this day. Regenerate the itinerary for new suggestions.
        </p>
      )}

      {visitTotal > 0 && (
        <p className="text-[11px] text-stone-500">
          Suggested time at the stops: about {formatDuration(visitTotal * 60)} (AI estimate), plus travel.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(view.kind === 'outdated' || (view.kind === 'error' && view.canRetry)) && (
          <button
            id={`trip-day-${day.day}-route-btn`}
            type="button"
            onClick={() => void trip.updateRoute(index)}
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-3 text-xs font-semibold text-white transition hover:bg-orange-700"
          >
            {view.kind === 'error' ? <RefreshCw className="h-4 w-4" /> : <RouteIcon className="h-4 w-4" />}
            <span>{view.kind === 'error' ? 'Try the route again' : 'Update route'}</span>
          </button>
        )}
        {directionStops.length >= MIN_ROUTE_STOPS && (
          <a
            id={`trip-day-${day.day}-google-maps-link`}
            href={googleMapsDirectionsUrl(directionStops, mode)}
            target="_blank"
            rel="noopener noreferrer"
            className={smallButton}
          >
            <Navigation className="h-3.5 w-3.5 text-orange-600" />
            <span>Day {day.day} in Google Maps</span>
          </a>
        )}
      </div>
    </article>
  );
};

/** The day's road route, or a plain statement of why there is none. Never a guessed number. */
const DayRouteLine: React.FC<{ view: DayRouteView; dayNumber: number }> = ({ view, dayNumber }) => {
  const box = 'rounded-lg p-2 text-xs';
  switch (view.kind) {
    case 'ok':
      return (
        <div id={`trip-day-${dayNumber}-route`} className={`${box} space-y-0.5 bg-blue-50 text-stone-800`}>
          <p>
            <span className="font-bold">{formatDistance(view.route.distanceM / 1000)}</span> by road ·{' '}
            <span className="font-bold">{aboutDuration(view.route.durationS)}</span> {verbFor(view.route.mode)}
          </p>
          <p className="text-[11px] text-stone-600">
            Travel time only, with no crowds, queues or closures. During the Kumbh, police traffic plans and crowds can
            change both the route and the time.
          </p>
          {view.route.warnings.map(w => (
            <p key={w} className="text-[11px] text-amber-900">
              Routing service note: {w}
            </p>
          ))}
        </div>
      );
    case 'loading':
      return (
        <p className={`${box} flex items-center gap-1.5 bg-stone-100 text-stone-700`}>
          <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
          Calculating the road route…{view.slow && ' This is taking longer than usual.'}
        </p>
      );
    case 'error':
      return (
        <p id={`trip-day-${dayNumber}-route-error`} className={`${box} border border-red-200 bg-red-50 text-red-900`}>
          <strong>No route for this day.</strong> {view.message} No road distance or travel time is shown.
        </p>
      );
    case 'outdated':
      return (
        <p className={`${box} bg-amber-50 text-amber-900`}>
          The stops or travel mode changed, so the old route is hidden. Tap “Update route” for the new one.
        </p>
      );
    case 'too_few_stops':
      return (
        <p className={`${box} bg-stone-100 text-stone-600`}>
          One place and no fixed start, so there is no route to calculate for this day.
        </p>
      );
    case 'not_configured':
      return (
        <p className={`${box} bg-stone-100 text-stone-600`}>No road distance or travel time: routing is not set up.</p>
      );
  }
};
