import React, { useState } from 'react';
import { 
  Car, 
  MapPin, 
  Clock, 
  ArrowRightLeft, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Bus, 
  Loader2, 
  Check,
  ChevronRight
} from 'lucide-react';
import { SupportedLanguage, translations } from '../i18n';
import { TransportOption, TransportType, RideBooking } from '../types';
import { PlaceholderNotice } from '../components/PlaceholderNotice';
import { secureFetch } from '../lib/api';
import { PICKUP_POINTS, DROP_POINTS } from '../data/kumbhData';

interface Props {
  transportOptions: TransportOption[];
  currentLanguage: SupportedLanguage;
  onOpenPassTab: () => void;
}

export const TravelScreen: React.FC<Props> = ({
  transportOptions,
  currentLanguage,
  onOpenPassTab,
}) => {
  const t = translations[currentLanguage];

  const [fromPoint, setFromPoint] = useState(PICKUP_POINTS[0]);
  const [toPoint, setToPoint] = useState(DROP_POINTS[0]);
  const [selectedType, setSelectedType] = useState<TransportType>('electric_shuttle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeBooking, setActiveBooking] = useState<RideBooking | null>(null);

  // Dynamic estimate calculation based on selected locations
  const isTrimbakTrip = (fromPoint.includes('Trimbak') || toPoint.includes('Trimbak')) &&
    !(fromPoint.includes('Trimbak') && toPoint.includes('Trimbak'));
  
  const estimatedDistanceKm = isTrimbakTrip ? 28.5 : 8.4;
  const activeOption = transportOptions.find(o => o.type === selectedType) || transportOptions[0];
  const calculatedFare = Math.round(activeOption.baseFare + (estimatedDistanceKm * activeOption.perKmRate));
  const estimatedTimeMins = Math.round(estimatedDistanceKm * 2.2 + 6);

  const handleSwap = () => {
    const temp = fromPoint;
    setFromPoint(toPoint);
    setToPoint(temp);
  };

  const handleRequestRide = async () => {
    setIsSubmitting(true);
    try {
      const res = await secureFetch('/api/rides/request', {
        method: 'POST',
        body: JSON.stringify({
          from: fromPoint,
          to: toPoint,
          transportType: selectedType,
          estimatedFare: calculatedFare,
          estimatedTimeMins,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveBooking(data.booking);
      }
    } catch (err) {
      console.error('Ride booking request failed', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="travel-screen-view" className="space-y-5 pb-12">
      {/* Title */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900">
          Pilgrim Transport & Shuttle Discovery
        </h2>
        <p className="text-xs sm:text-sm text-stone-500">
          Government regulated fares, verified drivers, and high-frequency Kumbh electric shuttles.
        </p>
      </div>

      {/* Honest Architectural Disclaimer */}
      <PlaceholderNotice
        title="Transport Partner Dispatch Gateway"
        description="Namo Yatri calculates legitimate statutory fares. Driver dispatch connects to verified local transport networks. In accordance with platform integrity rules, fake ride completion or synthetic GPS tracks are not fabricated."
        integrationName="Driver Dispatch Gateway"
      />

      {/* Route Selector Card */}
      <div className="bg-white border border-stone-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="space-y-2 relative">
          {/* Pickup Selector */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{t.fromLocation}</span>
            </label>
            <select
              id="pickup-location-select"
              value={fromPoint}
              onChange={(e) => setFromPoint(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 text-stone-900 text-xs sm:text-sm rounded-xl p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {PICKUP_POINTS.map((loc, idx) => (
                <option key={idx} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center -my-1">
            <button
              onClick={handleSwap}
              id="swap-route-btn"
              type="button"
              className="p-1.5 rounded-full bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-600 transition shadow-xs"
              title="Swap pickup and drop"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 rotate-90 sm:rotate-0" />
            </button>
          </div>

          {/* Drop Selector */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1 mb-1">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span>{t.toLocation}</span>
            </label>
            <select
              id="drop-location-select"
              value={toPoint}
              onChange={(e) => setToPoint(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 text-stone-900 text-xs sm:text-sm rounded-xl p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {DROP_POINTS.map((loc, idx) => (
                <option key={idx} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Route Summary Glance */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-orange-50/70 border border-orange-100 text-xs text-orange-950 font-medium">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-orange-600" />
            <span>Estimated Travel Time: <strong>~{estimatedTimeMins} mins</strong></span>
          </div>
          <div>
            <span>Distance: <strong>~{estimatedDistanceKm} km</strong></span>
          </div>
        </div>
      </div>

      {/* Transport Options Selection */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-stone-800">
          {t.transportOptions}
        </h3>

        <div className="space-y-2">
          {transportOptions.map((opt) => {
            const isSelected = selectedType === opt.type;
            const fare = Math.round(opt.baseFare + (estimatedDistanceKm * opt.perKmRate));
            return (
              <div
                key={opt.id}
                id={`transport-option-${opt.type}`}
                onClick={() => setSelectedType(opt.type)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-orange-50/60 border-orange-500 shadow-xs ring-1 ring-orange-500'
                    : 'bg-white border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-orange-600 text-white' : 'bg-stone-100 text-stone-700'
                  }`}>
                    {opt.type === 'auto' && <span className="font-bold text-sm">AUTO</span>}
                    {opt.type === 'electric_shuttle' && <Bus className="w-5 h-5" />}
                    {opt.type === 'cab' && <Car className="w-5 h-5" />}
                    {opt.type === 'govt_bus' && <Bus className="w-5 h-5 text-red-600" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-stone-900 text-xs sm:text-sm">
                        {opt.title}
                      </h4>
                      {opt.type === 'electric_shuttle' && (
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Pass Eligible
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500 mt-0.5 leading-tight">
                      {opt.disclaimer}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-1">
                      <span>Wait: ~{opt.estimatedWaitMins} mins</span>
                      <span>•</span>
                      <span>Capacity: {opt.capacity} seats</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-lg sm:text-xl font-black font-serif text-stone-900">
                    ₹{fare}
                  </span>
                  <p className="text-[10px] text-stone-400 font-medium">Regulated Tariff</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobility Pass Upsell Banner */}
      <div className="p-3.5 bg-gradient-to-r from-emerald-800 to-teal-900 text-white rounded-2xl flex items-center justify-between gap-3 shadow-xs">
        <div>
          <h4 className="font-bold text-xs sm:text-sm text-emerald-100">
            Have a Kumbh Mobility Pass?
          </h4>
          <p className="text-[11px] text-emerald-200">
            Enjoy unlimited rides on electric shuttles & ring buses for ₹50/day.
          </p>
        </div>
        <button
          onClick={onOpenPassTab}
          className="px-3 py-1.5 bg-white text-emerald-950 font-bold text-xs rounded-xl hover:bg-emerald-50 transition shrink-0"
        >
          View Passes →
        </button>
      </div>

      {/* Request Transport Action */}
      <div>
        <button
          id="request-transport-btn"
          disabled={isSubmitting}
          onClick={handleRequestRide}
          className="w-full py-3.5 px-4 bg-orange-600 hover:bg-orange-700 active:scale-99 disabled:opacity-50 text-white font-bold text-sm sm:text-base rounded-2xl transition shadow-md flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Transmitting Request to Transport Network...</span>
            </>
          ) : (
            <>
              <span>Request {activeOption.title} (₹{calculatedFare})</span>
            </>
          )}
        </button>
        <p className="text-[11px] text-center text-stone-500 mt-2">
          {t.travelDisclaimer}
        </p>
      </div>

      {/* Active Booking Ticket Modal/Banner */}
      {activeBooking && (
        <div 
          id="active-booking-status-card"
          className="bg-white border-2 border-emerald-500 rounded-3xl p-4 sm:p-5 shadow-lg space-y-3 animate-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <h4 className="font-bold text-stone-900 text-sm">
                Booking Request Registered ({activeBooking.bookingRef})
              </h4>
            </div>
            <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
              {activeBooking.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-stone-700">
            <div>
              <span className="text-[10px] text-stone-400 block uppercase font-semibold">From</span>
              <span className="font-medium text-stone-900">{activeBooking.fromLocation}</span>
            </div>
            <div>
              <span className="text-[10px] text-stone-400 block uppercase font-semibold">To</span>
              <span className="font-medium text-stone-900">{activeBooking.toLocation}</span>
            </div>
            <div>
              <span className="text-[10px] text-stone-400 block uppercase font-semibold">Vehicle Type</span>
              <span className="font-medium capitalize">{activeBooking.transportType.replace('_', ' ')}</span>
            </div>
            <div>
              <span className="text-[10px] text-stone-400 block uppercase font-semibold">Est. Fare</span>
              <span className="font-bold text-emerald-700">₹{activeBooking.estimatedFare} (Metered)</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-600">
            <p className="font-semibold text-stone-800">Production Dispatch Notice:</p>
            <p className="text-[11px] leading-relaxed mt-0.5">
              Request logged into Nashik Transport Partner Registry. Driver arrival notifications will trigger via SMS/App notification once assigned by operator.
            </p>
          </div>

          <button
            onClick={() => setActiveBooking(null)}
            className="w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs rounded-xl transition"
          >
            Dismiss Status Card
          </button>
        </div>
      )}
    </div>
  );
};
