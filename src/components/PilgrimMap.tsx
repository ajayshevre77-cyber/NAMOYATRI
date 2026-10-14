import React, { useEffect, useMemo, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import { divIcon, latLng, latLngBounds } from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Pane, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { Place } from '../types';
import { SupportedLanguage } from '../i18n';
import { GeoPoint, LIVE_PLACE_CATEGORIES, LivePlace, SERVICE_AREA, livePlaceName } from '../lib/geo';
import { UserPosition } from '../lib/geoApi';
import { RouteBounds, TravelMode } from '../lib/routing';

/** Where to move the map. `seq` changes on every request, so repeating one still moves. */
export type MapFocus =
  | { kind: 'area'; centre: GeoPoint; radiusM: number; seq: number }
  | { kind: 'point'; centre: GeoPoint; zoom: number; seq: number }
  | { kind: 'bounds'; bounds: RouteBounds; seq: number };

/** A planned stop, drawn as a numbered badge in travel order. */
export interface MapRouteStop {
  point: GeoPoint;
  label: string;
  /** Text in the badge instead of the position, e.g. "S" for a trip's starting point. */
  badge?: string;
}

interface Props {
  samplePlaces: Place[];
  livePlaces: LivePlace[];
  userPosition: UserPosition | null;
  /** Centre of the nearby search, drawn with its radius. */
  anchor: GeoPoint | null;
  anchorIsUser: boolean;
  radiusM: number;
  selectedId: string | null;
  focus: MapFocus | null;
  routeStops: MapRouteStop[];
  /** The provider's route line as [lat, lon] pairs, or null when no current route. */
  routePath: [number, number][] | null;
  routeMode: TravelMode;
  currentLanguage: SupportedLanguage;
  onSelectLive: (place: LivePlace) => void;
  onSelectSample: (place: Place) => void;
  onViewChange: (centre: GeoPoint, zoom: number) => void;
}

/** Opening view: Trimbakeshwar in the west to Nashik Road in the east. Not the user's position. */
const OPENING_BOUNDS = latLngBounds([19.91, 73.5], [20.05, 73.88]);

/** Panning stops a little beyond the service area, so nobody wanders off and loads tiles for nothing. */
const PAN_LIMIT = latLngBounds(
  [SERVICE_AREA.south - 0.4, SERVICE_AREA.west - 0.4],
  [SERVICE_AREA.north + 0.4, SERVICE_AREA.east + 0.4],
);

const CATEGORY_COLOR = Object.fromEntries(LIVE_PLACE_CATEGORIES.map(c => [c.id, c.color]));

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Moves the map on request and reports where the user has moved it. */
function MapController({ focus, onViewChange }: { focus: MapFocus | null; onViewChange: Props['onViewChange'] }) {
  const map = useMap();
  const report = useRef(onViewChange);
  report.current = onViewChange;

  useEffect(() => {
    if (!focus) return;
    const animate = !prefersReducedMotion();
    if (focus.kind === 'bounds') {
      const { south, west, north, east } = focus.bounds;
      map.flyToBounds(latLngBounds([south, west], [north, east]), { animate, duration: 0.6, padding: [32, 32], maxZoom: 17 });
    } else if (focus.kind === 'area') {
      const centre = latLng(focus.centre.lat, focus.centre.lon);
      map.flyToBounds(centre.toBounds(focus.radiusM * 2), { animate, duration: 0.6, padding: [16, 16] });
    } else {
      map.flyTo(latLng(focus.centre.lat, focus.centre.lon), Math.max(map.getZoom(), focus.zoom), { animate, duration: 0.6 });
    }
    // Keyed on seq alone: only a new request should move the map, not a re-render.
  }, [focus?.seq]);

  useEffect(() => {
    const c = map.getCenter();
    report.current({ lat: c.lat, lon: c.lng }, map.getZoom());
  }, [map]);

  useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      report.current({ lat: c.lat, lon: c.lng }, map.getZoom());
    },
    // Wheel zoom only after a click on the map, so scrolling the page past it
    // does not zoom it by accident. Keyboard users zoom with + and -.
    click: () => map.scrollWheelZoom.enable(),
    mouseout: () => map.scrollWheelZoom.disable(),
  });

  return null;
}

const STOP_BADGE: Record<'start' | 'via' | 'end', string> = {
  start: 'bg-green-600',
  via: 'bg-orange-500',
  end: 'bg-stone-900',
};

/** Only digits or a short code ever reach the badge HTML; labels are never put there. */
const badgeText = (stop: MapRouteStop, index: number) =>
  stop.badge && /^[A-Z0-9]{1,2}$/.test(stop.badge) ? stop.badge : String(index + 1);

/**
 * The calculated route line and the planned stops. Stops are DOM markers
 * (numbered, keyboard-focusable); the line is drawn from the provider's own
 * geometry and only when it matches the current stops and mode.
 */
function RouteLayer({ stops, path, mode }: { stops: MapRouteStop[]; path: [number, number][] | null; mode: TravelMode }) {
  const icons = useMemo(
    () =>
      stops.map((stop, i) => {
        const role = i === 0 ? 'start' : i === stops.length - 1 ? 'end' : 'via';
        return divIcon({
          className: '',
          html: `<span class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md ${STOP_BADGE[role]}">${badgeText(stop, i)}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
      }),
    [stops.map((s, i) => badgeText(s, i)).join('|')],
  );

  return (
    <>
      {/* Its own pane (and canvas) under the overlay pane (400), so place
          markers drawn earlier stay on top of a line added later. Lines are
          keyed by mode so a style change never leaves an old dash pattern. */}
      <Pane name="route-line" style={{ zIndex: 350 }}>
        {path && mode === 'driving' && (
          <Polyline
            key="driving-casing"
            positions={path}
            interactive={false}
            pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
          />
        )}
        {path && (
          <Polyline
            key={mode}
            positions={path}
            interactive={false}
            pathOptions={{
              color: '#1d4ed8',
              weight: mode === 'walking' ? 6 : 5,
              opacity: 0.95,
              // Dotted for walking, solid for driving, as most map apps do.
              dashArray: mode === 'walking' ? '1 10' : undefined,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}
      </Pane>
      {stops.map((stop, i) => (
        <Marker
          key={`${i}:${stop.point.lat},${stop.point.lon}`}
          position={[stop.point.lat, stop.point.lon]}
          icon={icons[i]}
          title={`Route stop ${badgeText(stop, i)}: ${stop.label}`}
          zIndexOffset={1000}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            {`${i === 0 ? 'Start' : i === stops.length - 1 ? 'Destination' : `Stop ${badgeText(stop, i)}`}: ${stop.label}`}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

export const PilgrimMap: React.FC<Props> = ({
  samplePlaces,
  livePlaces,
  userPosition,
  anchor,
  anchorIsUser,
  radiusM,
  selectedId,
  focus,
  routeStops,
  routePath,
  routeMode,
  currentLanguage,
  onSelectLive,
  onSelectSample,
  onViewChange,
}) => (
  <MapContainer
    bounds={OPENING_BOUNDS}
    maxBounds={PAN_LIMIT}
    maxBoundsViscosity={0.8}
    minZoom={9}
    maxZoom={19}
    scrollWheelZoom={false}
    preferCanvas
    className="h-full w-full"
  >
    {/* OpenStreetMap's standard tiles. Their policy requires this visible
        attribution, HTTPS, and no prefetching or offline copies. */}
    <TileLayer
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
      maxZoom={19}
    />
    <MapController focus={focus} onViewChange={onViewChange} />

    {anchor && (
      <Circle
        center={[anchor.lat, anchor.lon]}
        radius={radiusM}
        interactive={false}
        pathOptions={{ color: '#1c1917', weight: 1.5, dashArray: '6 6', fillColor: '#f97316', fillOpacity: 0.05 }}
      />
    )}
    {anchor && !anchorIsUser && (
      <CircleMarker
        center={[anchor.lat, anchor.lon]}
        radius={6}
        pathOptions={{ color: '#1c1917', weight: 2, fillColor: '#ffffff', fillOpacity: 1 }}
      >
        <Tooltip>Search centre</Tooltip>
      </CircleMarker>
    )}

    {samplePlaces.map(place => {
      const selected = selectedId === `sample:${place.id}`;
      return (
        <CircleMarker
          key={place.id}
          center={[place.location.latitude, place.location.longitude]}
          radius={selected ? 12 : 9}
          pathOptions={{
            color: selected ? '#1c1917' : '#92400e',
            weight: selected ? 3 : 2,
            dashArray: '3 3',
            fillColor: '#fde68a',
            fillOpacity: 0.95,
          }}
          eventHandlers={{ click: () => onSelectSample(place) }}
        >
          <Tooltip>{`${place.name[currentLanguage] || place.name.en} (sample listing)`}</Tooltip>
        </CircleMarker>
      );
    })}

    {livePlaces.map(place => {
      const selected = selectedId === place.id;
      return (
        <CircleMarker
          key={place.id}
          center={[place.lat, place.lon]}
          radius={selected ? 10 : 6}
          pathOptions={{
            color: selected ? '#1c1917' : '#ffffff',
            weight: selected ? 3 : 1.5,
            fillColor: CATEGORY_COLOR[place.category],
            fillOpacity: 0.95,
          }}
          eventHandlers={{ click: () => onSelectLive(place) }}
        >
          <Tooltip>{livePlaceName(place, currentLanguage) ?? `Unnamed: ${place.kind}`}</Tooltip>
        </CircleMarker>
      );
    })}

    {userPosition && (
      <>
        <Circle
          center={[userPosition.lat, userPosition.lon]}
          radius={userPosition.accuracyM}
          interactive={false}
          pathOptions={{ color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: 0.12 }}
        />
        <CircleMarker
          center={[userPosition.lat, userPosition.lon]}
          radius={8}
          pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}
        >
          <Tooltip>You are here</Tooltip>
        </CircleMarker>
      </>
    )}

    <RouteLayer stops={routeStops} path={routePath} mode={routeMode} />
  </MapContainer>
);
