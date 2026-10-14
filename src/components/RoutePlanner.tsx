import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Car,
  ChevronDown,
  ChevronUp,
  Footprints,
  Loader2,
  LocateFixed,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  X,
} from 'lucide-react';
import { GeoPoint, OSM_COPYRIGHT_URL, formatDistance } from '../lib/geo';
import {
  MAX_ROUTE_STOPS,
  MIN_ROUTE_STOPS,
  RouteResponse,
  TRAVEL_MODES,
  TravelMode,
  formatDuration,
  roundRouteStop,
  routeKey,
} from '../lib/routing';
import { GeoRequestError, fetchRoute, fetchRoutingStatus } from '../lib/geoApi';

/** One stop in the planner. `user` is the device's location; `sample` is a demo listing. */
export interface RouteStopItem {
  id: string;
  point: GeoPoint;
  label: string;
  kind: 'user' | 'place' | 'sample';
  /** Shown under the name, e.g. how accurate the location is. */
  note?: string;
}

export type NewRouteStop = Omit<RouteStopItem, 'id'>;

type RouteState =
  | { status: 'idle' }
  | { status: 'loading'; key: string; slow: boolean }
  | { status: 'error'; key: string; message: string; code: string; canRetry: boolean }
  | { status: 'ready'; key: string; data: RouteResponse };

type Availability = 'checking' | 'configured' | 'not_configured' | 'unknown';

/** Failures where asking again might work. The rest need a different route or a server fix. */
export const RETRYABLE_CODES = new Set([
  'ROUTING_PROVIDER_BUSY',
  'ROUTING_PROVIDER_TIMEOUT',
  'ROUTING_PROVIDER_UNREACHABLE',
  'ROUTING_PROVIDER_FAILED',
  'ROUTING_PROVIDER_BAD_RESPONSE',
  'ROUTING_RATE_LIMITED',
  'RATE_LIMIT_EXCEEDED',
  'NETWORK_ERROR',
  'BAD_RESPONSE',
]);

/** Routes already fetched in this visit, so switching back and forth costs nothing. */
const CLIENT_CACHE_LIMIT = 20;

const samePlace = (a: GeoPoint, b: GeoPoint) => {
  const ra = roundRouteStop(a);
  const rb = roundRouteStop(b);
  return ra.lat === rb.lat && ra.lon === rb.lon;
};

const verbFor = (mode: TravelMode) => TRAVEL_MODES.find(m => m.id === mode)?.verb ?? mode;

/**
 * Google Maps directions through the same stops, for turn-by-turn navigation.
 * A start at the device's location is left out, so Google starts from where
 * the phone is when it opens.
 */
export function googleMapsDirectionsUrl(stops: RouteStopItem[], mode: TravelMode): string {
  const at = (p: GeoPoint) => {
    const r = roundRouteStop(p);
    return `${r.lat},${r.lon}`;
  };
  const params = new URLSearchParams({ api: '1', travelmode: mode });
  const [first, ...rest] = stops;
  const last = rest.pop();
  if (first && first.kind !== 'user') params.set('origin', at(first.point));
  if (last) params.set('destination', at(last.point));
  if (rest.length > 0) params.set('waypoints', rest.map(s => at(s.point)).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}

/** Google Maps directions to one place, from wherever the phone is. */
export function googleMapsPlaceDirectionsUrl(point: GeoPoint, mode: TravelMode): string {
  const r = roundRouteStop(point);
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: `${r.lat},${r.lon}`, travelmode: mode })}`;
}

/**
 * State for the route planner: the stops in order, the travel mode, and the
 * calculated route. Routes are only requested when the user asks (or switches
 * mode while a route is shown), one at a time, and remembered for this visit.
 */
export function useRoutePlanner(onRouteShown?: (route: RouteResponse) => void) {
  const [stops, setStops] = useState<RouteStopItem[]>([]);
  const [mode, setModeState] = useState<TravelMode>('walking');
  const [state, setState] = useState<RouteState>({ status: 'idle' });
  const [availability, setAvailability] = useState<Availability>('checking');
  const [announcement, setAnnouncement] = useState('');
  const cache = useRef(new Map<string, RouteResponse>());
  const inFlight = useRef<AbortController | null>(null);
  const nextId = useRef(0);
  const shown = useRef(onRouteShown);
  shown.current = onRouteShown;
  /** For setStart, which runs after waiting for the location prompt. */
  const latestStops = useRef(stops);
  latestStops.current = stops;

  useEffect(() => {
    const controller = new AbortController();
    fetchRoutingStatus(controller.signal)
      .then(s => setAvailability(s.configured ? 'configured' : 'not_configured'))
      .catch(err => {
        if (err?.name !== 'AbortError') setAvailability('unknown');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => inFlight.current?.abort(), []);

  const keyFor = (m: TravelMode, list: RouteStopItem[]) =>
    list.length >= MIN_ROUTE_STOPS ? routeKey(m, list.map(s => s.point)) : null;
  const key = keyFor(mode, stops);

  const route = state.status === 'ready' && state.key === key ? state.data : null;
  const loading = state.status === 'loading' && state.key === key ? state : null;
  const error = state.status === 'error' && state.key === key ? state : null;
  /** A route was shown, but the stops or mode have changed since. */
  const outdated = state.status === 'ready' && state.key !== key;

  const show = (k: string, data: RouteResponse) => {
    setState({ status: 'ready', key: k, data });
    setAnnouncement(
      `Route found: ${formatDistance(data.distanceM / 1000)} by road, about ${formatDuration(data.durationS)} ${verbFor(data.mode)}.`,
    );
    shown.current?.(data);
  };

  const calculate = async (forMode: TravelMode = mode) => {
    const k = keyFor(forMode, stops);
    if (!k || (state.status === 'loading' && state.key === k)) return;

    const hit = cache.current.get(k);
    if (hit) {
      inFlight.current?.abort();
      inFlight.current = null;
      show(k, hit);
      return;
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ status: 'loading', key: k, slow: false });
    setAnnouncement('Calculating the route…');
    const slowTimer = setTimeout(
      () => setState(s => (s.status === 'loading' && s.key === k ? { ...s, slow: true } : s)),
      5000,
    );
    try {
      const data = await fetchRoute(forMode, stops.map(s => s.point), controller.signal);
      if (inFlight.current !== controller) return;
      cache.current.set(k, data);
      if (cache.current.size > CLIENT_CACHE_LIMIT) cache.current.delete(cache.current.keys().next().value!);
      show(k, data);
    } catch (err: any) {
      if (err?.name === 'AbortError' || inFlight.current !== controller) return;
      const code = err instanceof GeoRequestError ? err.code : 'UNKNOWN';
      if (code === 'ROUTING_NOT_CONFIGURED') setAvailability('not_configured');
      const message = err instanceof GeoRequestError ? err.message : 'The route could not be calculated. Please try again.';
      setState({ status: 'error', key: k, message, code, canRetry: RETRYABLE_CODES.has(code) || code.startsWith('HTTP_5') });
      setAnnouncement(`No route. ${message}`);
    } finally {
      clearTimeout(slowTimer);
      if (inFlight.current === controller) inFlight.current = null;
    }
  };

  const cancel = () => {
    inFlight.current?.abort();
    inFlight.current = null;
    setState({ status: 'idle' });
    setAnnouncement('Route calculation cancelled.');
  };

  /** Switching mode redraws at once if a route is on screen; otherwise it waits for "Get route". */
  const setMode = (next: TravelMode) => {
    if (next === mode) return;
    const routeOnScreen = route !== null;
    setModeState(next);
    if (routeOnScreen) void calculate(next);
  };

  const canAdd = stops.length < MAX_ROUTE_STOPS;

  /** Adds a stop at the end: the first is the start, each later one the new destination. */
  const addStop = (stop: NewRouteStop) => {
    if (!canAdd) {
      setAnnouncement(`A route can have at most ${MAX_ROUTE_STOPS} stops. Remove one first.`);
      return;
    }
    const last = stops[stops.length - 1];
    if (last && samePlace(last.point, stop.point)) {
      setAnnouncement(`${stop.label} is already the last stop.`);
      return;
    }
    setStops([...stops, { ...stop, id: `stop-${++nextId.current}` }]);
    setAnnouncement(
      stops.length === 0
        ? `${stop.label} is the start. Now add a destination.`
        : stops.length === 1
          ? `${stop.label} is the destination.`
          : `${stop.label} is the new destination. ${last.label} is now stop ${stops.length}.`,
    );
  };

  /** Puts a stop first, replacing an earlier "your location" start. */
  const setStart = (stop: NewRouteStop) => {
    const current = latestStops.current;
    const rest = current[0]?.kind === 'user' ? current.slice(1) : current;
    if (rest.length >= MAX_ROUTE_STOPS) {
      setAnnouncement(`A route can have at most ${MAX_ROUTE_STOPS} stops. Remove one first.`);
      return;
    }
    if (rest[0] && samePlace(rest[0].point, stop.point)) {
      setAnnouncement(`${stop.label} is already where the route starts.`);
      return;
    }
    setStops([{ ...stop, id: `stop-${++nextId.current}` }, ...rest]);
    setAnnouncement(`${stop.label} is the start.`);
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= stops.length) return;
    const next = [...stops];
    [next[index], next[target]] = [next[target], next[index]];
    setStops(next);
    setAnnouncement(`${stops[index].label} moved to position ${target + 1} of ${stops.length}.`);
  };

  const remove = (index: number) => {
    const removed = stops[index];
    if (!removed) return;
    setStops(stops.filter((_, i) => i !== index));
    setAnnouncement(`${removed.label} removed from the route.`);
  };

  const reverse = () => {
    setStops([...stops].reverse());
    setAnnouncement('Route reversed.');
  };

  const clear = () => {
    inFlight.current?.abort();
    inFlight.current = null;
    setStops([]);
    setState({ status: 'idle' });
    setAnnouncement('Route cleared.');
  };

  return {
    stops,
    mode,
    setMode,
    addStop,
    setStart,
    move,
    remove,
    reverse,
    clear,
    calculate,
    cancel,
    route,
    loading,
    error,
    outdated,
    availability,
    announcement,
    canAdd,
    /** 1-based position of the last stop at this place, or 0. */
    positionOf: (point: GeoPoint) => {
      for (let i = stops.length - 1; i >= 0; i--) if (samePlace(stops[i].point, point)) return i + 1;
      return 0;
    },
  };
}

export type RoutePlannerState = ReturnType<typeof useRoutePlanner>;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const roleOf = (index: number, count: number) =>
  index === 0 ? 'Start' : index === count - 1 ? 'Destination' : 'Stop on the way';

const BADGE_COLOR = { start: 'bg-green-600', via: 'bg-orange-500', end: 'bg-stone-900' };
export const routeBadgeRole = (index: number, count: number): keyof typeof BADGE_COLOR =>
  index === 0 ? 'start' : index === count - 1 ? 'end' : 'via';

interface Props {
  planner: RoutePlannerState;
  onUseMyLocation: () => void;
  locating: boolean;
}

export const RoutePlanner: React.FC<Props> = ({ planner, onUseMyLocation, locating }) => {
  const { stops, mode, route, loading, error, outdated, availability } = planner;
  const notConfigured = availability === 'not_configured';
  const enoughStops = stops.length >= MIN_ROUTE_STOPS;
  const canCalculate = enoughStops && !loading && !route && !notConfigured;
  const hasSamples = stops.some(s => s.kind === 'sample');
  const hasUserStart = stops[0]?.kind === 'user';

  const calculateLabel = loading
    ? 'Calculating route…'
    : route
      ? 'Route shown on the map'
      : outdated || error
        ? 'Update route'
        : 'Get route';

  return (
    <section
      id="route-planner"
      aria-labelledby="route-heading"
      className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id="route-heading" className="flex items-center gap-1.5 text-sm font-bold text-stone-900">
          <RouteIcon className="h-4 w-4 text-blue-700" />
          Plan a route
        </h3>
        {stops.length > 0 && (
          <button
            id="route-clear-btn"
            type="button"
            onClick={planner.clear}
            className="-my-2 inline-flex min-h-12 items-center rounded-xl px-2 text-xs font-semibold text-stone-600 underline hover:bg-stone-100"
          >
            Clear route
          </button>
        )}
      </div>

      {notConfigured && (
        <div id="route-not-configured" className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <p className="font-semibold">Road routes are not set up on this server yet.</p>
          <p className="mt-0.5">
            Namo Yatri cannot show road distances or travel times until routing is configured. You can still line up
            stops here and open them in Google Maps for directions.
          </p>
        </div>
      )}

      <div role="group" aria-label="Travel mode" className="grid grid-cols-2 gap-1.5">
        {TRAVEL_MODES.map(m => {
          const active = mode === m.id;
          const Icon = m.id === 'walking' ? Footprints : Car;
          return (
            <button
              key={m.id}
              id={`route-mode-${m.id}`}
              type="button"
              aria-pressed={active}
              onClick={() => planner.setMode(m.id)}
              className={`inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition ${
                active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {m.label}
            </button>
          );
        })}
      </div>

      {stops.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3 text-xs text-stone-700">
          Choose a start and a destination: start from your location, or pick a place from search, the map or the
          nearby list and tap “Add to route”. You can add stops on the way; they stay in the order you set.
        </p>
      ) : (
        <ol id="route-stop-list" aria-label="Route stops, in travel order" className="space-y-1.5">
          {stops.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-2 rounded-xl bg-stone-50 py-1 pl-2">
              <span
                aria-hidden="true"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                  BADGE_COLOR[routeBadgeRole(i, stops.length)]
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-[8rem] flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-stone-500">
                  {stops.length === 1 ? 'Start' : roleOf(i, stops.length)}
                </span>
                <span className="block break-words text-sm font-semibold leading-snug text-stone-900">{s.label}</span>
                {s.note && <span className="block text-[11px] text-stone-500">{s.note}</span>}
              </span>
              <span className="ml-auto flex shrink-0">
                <button
                  type="button"
                  onClick={() => planner.move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${s.label} earlier`}
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-200 disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => planner.move(i, 1)}
                  disabled={i === stops.length - 1}
                  aria-label={`Move ${s.label} later`}
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-200 disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => planner.remove(i)}
                  aria-label={`Remove ${s.label} from the route`}
                  className="flex h-12 w-12 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {stops.length === 1 && <p className="text-xs text-stone-600">Now add a destination.</p>}

      <div className="flex flex-wrap gap-2">
        {!hasUserStart && (
          <button
            id="route-start-here-btn"
            type="button"
            onClick={onUseMyLocation}
            disabled={locating || stops.length >= MAX_ROUTE_STOPS}
            className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 disabled:opacity-60"
          >
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4 text-blue-700" />}
            <span>Start from my location</span>
          </button>
        )}
        {stops.length >= 2 && (
          <button
            id="route-reverse-btn"
            type="button"
            onClick={planner.reverse}
            className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
          >
            <ArrowUpDown className="h-4 w-4" />
            <span>Reverse</span>
          </button>
        )}
      </div>

      {!notConfigured && (
        <button
          id="route-calculate-btn"
          type="button"
          onClick={() => void planner.calculate()}
          disabled={!canCalculate}
          aria-describedby={!enoughStops ? 'route-calculate-hint' : undefined}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:bg-stone-300 disabled:text-stone-600"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RouteIcon className="h-4 w-4" />}
          {calculateLabel}
        </button>
      )}
      {!enoughStops && !notConfigured && (
        <p id="route-calculate-hint" className="-mt-1 text-[11px] text-stone-500">
          Add at least two stops to get a route.
        </p>
      )}

      <div role="status" aria-live="polite" className="space-y-2 text-xs">
        {loading && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 p-2.5 text-stone-700">
            <span className="min-w-0 flex-1">
              Asking the routing service for the {verbFor(mode)} route…
              {loading.slow && <span className="block text-stone-500">This is taking longer than usual.</span>}
            </span>
            <button
              id="route-cancel-btn"
              type="button"
              onClick={planner.cancel}
              className="inline-flex min-h-12 items-center rounded-xl px-2 font-semibold underline"
            >
              Cancel
            </button>
          </div>
        )}

        {error && (
          <div id="route-error" className="space-y-1.5 rounded-xl border border-red-200 bg-red-50 p-2.5 text-red-900">
            <p className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>No route.</strong> {error.message}
              </span>
            </p>
            <p className="text-red-800/80">No road distance or travel time is shown.</p>
            {error.canRetry && (
              <button
                id="route-retry-btn"
                type="button"
                onClick={() => void planner.calculate()}
                className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-white px-3 font-semibold ring-1 ring-red-200 hover:bg-red-100"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>
            )}
          </div>
        )}

        {outdated && !loading && !error && (
          <p className="rounded-xl bg-amber-50 p-2.5 text-amber-900">
            You changed the stops or travel mode, so the old route is hidden. Tap “Update route” to see the new one.
          </p>
        )}

        <p className="sr-only">{planner.announcement}</p>
      </div>

      {route && (
        <div id="route-summary" className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-800">Road route · {verbFor(route.mode)}</p>
          <p className="text-stone-900">
            <span className="text-lg font-bold">{formatDistance(route.distanceM / 1000)}</span>{' '}
            <span className="text-sm text-stone-600">by road</span>
            <span className="text-sm text-stone-600"> · about </span>
            <span className="text-lg font-bold">{formatDuration(route.durationS)}</span>
          </p>

          {route.legs.length > 1 && (
            <ol aria-label="Each part of the route" className="divide-y divide-blue-100 text-xs">
              {route.legs.map(leg => (
                <li key={leg.fromStop} className="flex items-start justify-between gap-3 py-1.5">
                  <span className="min-w-0 text-stone-700">
                    <span className="font-semibold">
                      {leg.fromStop + 1} → {leg.toStop + 1}
                    </span>{' '}
                    {stops[leg.fromStop]?.label} to {stops[leg.toStop]?.label}
                  </span>
                  <span className="shrink-0 text-right font-semibold text-stone-900">
                    {leg.distanceM !== null ? formatDistance(leg.distanceM / 1000) : 'distance not given'}
                    <span className="block font-normal text-stone-600">
                      {leg.durationS !== null ? formatDuration(leg.durationS) : 'time not given'}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {route.warnings.map(w => (
            <p key={w} className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Routing service note: {w}</span>
            </p>
          ))}

          <p className="text-[11px] text-stone-600">
            {route.mode === 'walking'
              ? 'Walking time assumes a steady pace with no crowds, queues or closed lanes.'
              : 'Driving time assumes ordinary traffic and no closures or diversions.'}{' '}
            During the Kumbh, police traffic plans, closed roads and crowds can change both the route and the time.
            Follow official signs and marshals.
          </p>
          {hasSamples && (
            <p className="text-[11px] text-amber-900">
              Some stops are Namo Yatri sample sites with approximate locations, so the route to them is approximate too.
            </p>
          )}
          {route.dataTimestamp && (
            <p className="text-[11px] text-stone-500">Road data as of {formatDate(route.dataTimestamp)}.</p>
          )}
        </div>
      )}

      {enoughStops && (
        <a
          id="route-google-maps-link"
          href={googleMapsDirectionsUrl(stops, mode)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
        >
          <Navigation className="h-3.5 w-3.5 text-orange-600" />
          <span>Directions in Google Maps</span>
        </a>
      )}

      <p className="border-t border-stone-100 pt-2 text-[10px] leading-relaxed text-stone-500">
        Routes and times come from OpenRouteService, run by HeiGIT, using OpenStreetMap roads. To calculate one, the
        stops are sent there; your location is rounded to about 10 m first. Turn-by-turn directions are not shown here.
        {route && (
          <>
            {' '}
            Routing © openrouteservice.org by HeiGIT · Map data{' '}
            <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className="underline">
              © OpenStreetMap contributors
            </a>
            .
          </>
        )}
      </p>
    </section>
  );
};
