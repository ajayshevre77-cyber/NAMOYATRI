import React from 'react';
import { SupportedLanguage, translations } from '../i18n';
import { TransportOption } from '../types';
import { PlaceholderNotice } from '../components/PlaceholderNotice';
import { RideRequestPanel } from '../components/RideRequestPanel';

interface Props {
  transportOptions: TransportOption[];
  currentLanguage: SupportedLanguage;
  onOpenPassTab: () => void;
}

/**
 * Travel tab. The booking form is RideRequestPanel, the app's single ride
 * request flow, shared with the `?screen=ride` page.
 */
export const TravelScreen: React.FC<Props> = ({
  transportOptions,
  currentLanguage,
  onOpenPassTab,
}) => {
  const t = translations[currentLanguage];

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

      {/* Honest Architectural Disclaimer */}
      <PlaceholderNotice
        title="Ride requests are a demo"
        description="Fares are demo estimates, not official or regulated rates. Requests are only stored on the demo server: no driver or vehicle is dispatched and no SMS is sent."
        integrationName="Driver Dispatch"
      />

      <RideRequestPanel transportOptions={transportOptions} />

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
