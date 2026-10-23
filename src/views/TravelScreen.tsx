import React, { useEffect, useState } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import { SupportedLanguage, translations } from '../i18n';
import { TransportOption } from '../types';
import { PlaceholderNotice } from '../components/PlaceholderNotice';
import { RideRequestPanel } from '../components/RideRequestPanel';
import { MyRideRequests } from '../components/MyRideRequests';
import { AdPanel } from '../components/AdPanel';
import { RideDraft } from '../lib/rides';
import type { MapJump } from './MapScreen';

interface Props {
  transportOptions: TransportOption[];
  currentLanguage: SupportedLanguage;
  onOpenPassTab: () => void;
  /** A destination (and maybe a pickup) handed over from the map or a trip plan. */
  rideDraft?: RideDraft | null;
  /** Back to the Map tab: to the place, or to the trip plan's day. */
  onReturnToMap?: (jump: MapJump) => void;
}

/** The hand-over last brought into view, so coming back to the tab later does not jump again. */
let shownDraftId = 0;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Travel tab, the app's one ride booking screen (`?screen=ride` opens it).
 * The booking form is RideRequestPanel, the app's single ride request flow.
 */
export const TravelScreen: React.FC<Props> = ({
  transportOptions,
  currentLanguage,
  onOpenPassTab,
  rideDraft = null,
  onReturnToMap,
}) => {
  const t = translations[currentLanguage];
  // Bumped when a request is saved, so "My demo requests" reloads.
  const [savedRequests, setSavedRequests] = useState(0);

  // A new hand-over: bring it into view and move focus there, since the
  // pilgrim arrives from further down a long map page.
  useEffect(() => {
    if (!rideDraft || rideDraft.id === shownDraftId) return;
    shownDraftId = rideDraft.id;
    document.getElementById('ride-draft-context')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    document.getElementById('ride-draft-heading')?.focus({ preventScroll: true });
  }, [rideDraft]);

  const origin = rideDraft?.origin;
  const destination = rideDraft?.to;
  const pickupNote =
    origin?.kind === 'trip' && origin.pickup === 'previous_stop'
      ? ` Pickup is the stop before it, ${rideDraft!.from!.label}.`
      : origin?.kind === 'trip' && origin.pickup === 'trip_start'
        ? ` Pickup is where your trip starts, ${rideDraft!.from!.label}.`
        : ' Choose a pickup point below.';

  return (
    <div id="travel-screen-view" className="space-y-5 pb-12">
      {/* Title */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900">
          Pilgrim Transport
        </h2>
        <p className="text-xs sm:text-sm text-stone-500">
          Request a shuttle, auto, cab or bus between Kumbh pickup points.
        </p>
      </div>

      {/* Advertisement slot from the ride booking sketch. It shows a labelled
          empty space until a real ad is supplied. */}
      <AdPanel />

      {/* Honest Architectural Disclaimer */}
      <PlaceholderNotice
        title="Ride requests are a demo"
        description="Fares are demo estimates, not official or regulated rates. Requests are only stored on the demo server: no driver or vehicle is dispatched and no SMS is sent."
        integrationName="Driver Dispatch"
      />

      {rideDraft && origin && destination && (
        <section
          id="ride-draft-context"
          aria-labelledby="ride-draft-heading"
          className="scroll-mt-20 space-y-2 rounded-2xl border border-blue-200 bg-blue-50/60 p-3.5"
        >
          <h3
            id="ride-draft-heading"
            tabIndex={-1}
            className="rounded-md text-sm font-bold text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            {origin.kind === 'trip' ? 'Demo ride to a stop on your trip plan' : 'Demo ride to a place from the map'}
          </h3>
          <p className="text-xs text-stone-700">
            {origin.kind === 'trip' ? `Day ${origin.day}, stop ${origin.stopNumber}: ` : 'Destination: '}
            <strong>{destination.label}</strong>
            {destination.approximate && ' (sample site, approximate location)'}.{pickupNote} You can change either
            below.
          </p>
          {onReturnToMap && (
            <div className="flex flex-wrap gap-2">
              <button
                id="ride-draft-show-on-map"
                type="button"
                onClick={() =>
                  onReturnToMap({
                    to: 'map',
                    point: { lat: destination.lat, lon: destination.lon },
                    tripDay: origin.kind === 'trip' ? origin.day : undefined,
                  })
                }
                aria-label={`Show ${destination.label} on the map`}
                className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
              >
                <MapPin className="h-4 w-4 text-orange-600" aria-hidden="true" />
                Show on map
              </button>
              {origin.kind === 'trip' && (
                <button
                  id="ride-draft-back-to-trip"
                  type="button"
                  onClick={() => onReturnToMap({ to: 'trip-day', day: origin.day })}
                  className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back to trip plan
                </button>
              )}
            </div>
          )}
        </section>
      )}

      <RideRequestPanel
        transportOptions={transportOptions}
        draft={rideDraft}
        onRequested={() => setSavedRequests((n) => n + 1)}
      />

      <MyRideRequests transportOptions={transportOptions} refreshKey={savedRequests} />

      {/* Mobility Pass Upsell Banner */}
      <div className="p-3.5 bg-gradient-to-r from-emerald-800 to-teal-900 text-white rounded-2xl flex items-center justify-between gap-3 shadow-xs">
        <div>
          <h4 className="font-bold text-xs sm:text-sm text-emerald-100">
            Have a Kumbh Mobility Pass?
          </h4>
          <p className="text-[11px] text-emerald-200">
            Try the demo day pass for electric shuttles & ring buses.
          </p>
        </div>
        <button
          onClick={onOpenPassTab}
          className="px-3 py-1.5 bg-white text-emerald-950 font-bold text-xs rounded-xl hover:bg-emerald-50 transition shrink-0"
        >
          View Passes →
        </button>
      </div>

      <p className="text-[11px] text-center text-stone-500">
        {t.travelDisclaimer}
      </p>
    </div>
  );
};
