import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, CalendarClock, Minus, Plus, Route, Clock } from 'lucide-react';
import { TransportOption, TransportType } from '../types';
import { LocationInput } from './LocationInput';
import { RideOptions, fareFor } from './RideOptions';
import { BookRideButton } from './BookRideButton';

export interface RideRequestDetails {
  from: string;
  to: string;
  transportType: TransportType;
  passengers: number;
  /** ISO string when scheduled, null when the pilgrim is leaving now. */
  departAt: string | null;
  estimatedFare: number;
  estimatedTimeMins: number;
  estimatedDistanceKm: number;
}

interface Props {
  transportOptions: TransportOption[];
  pickupPoints: string[];
  dropPoints: string[];
  onSubmit: (details: RideRequestDetails) => void;
  submitting?: boolean;
  /** Surfaces a failure from the caller's API call. */
  submitError?: string | null;
}

type Errors = Partial<Record<'from' | 'to' | 'departAt', string>>;

const MAX_PASSENGERS = 6;

/**
 * The ride booking form: route, timing, ride type and passenger count.
 *
 * Owns its own field state and validation, then hands a validated
 * `RideRequestDetails` to `onSubmit`. The caller decides what that means —
 * which keeps the auth gate and the API call out of the form.
 */
export const RideBookingCard: React.FC<Props> = ({
  transportOptions,
  pickupPoints,
  dropPoints,
  onSubmit,
  submitting = false,
  submitError = null,
}) => {
  const [from, setFrom] = useState(pickupPoints[0] ?? '');
  const [to, setTo] = useState('');
  const [departNow, setDepartNow] = useState(true);
  const [departAt, setDepartAt] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [transportType, setTransportType] = useState<TransportType>(
    transportOptions[0]?.type ?? 'electric_shuttle',
  );
  const [errors, setErrors] = useState<Errors>({});

  // Same rule the existing Travel screen uses: Trimbak trips are the long leg.
  const estimatedDistanceKm = useMemo(() => {
    const fromTrimbak = from.includes('Trimbak');
    const toTrimbak = to.includes('Trimbak');
    return fromTrimbak !== toTrimbak ? 28.5 : 8.4;
  }, [from, to]);

  const activeOption =
    transportOptions.find((o) => o.type === transportType) ?? transportOptions[0];
  const estimatedFare = activeOption ? fareFor(activeOption, estimatedDistanceKm) : 0;
  const estimatedTimeMins = Math.round(estimatedDistanceKm * 2.2 + 6);

  const validate = (): Errors => {
    const next: Errors = {};
    if (!from) next.from = 'Choose a pickup point.';
    if (!to) next.to = 'Choose a destination.';
    if (from && to && from === to) next.to = 'Destination must differ from pickup.';
    if (!departNow) {
      if (!departAt) next.departAt = 'Pick a date and time.';
      else if (new Date(departAt).getTime() < Date.now()) next.departAt = 'That time has already passed.';
    }
    return next;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    onSubmit({
      from,
      to,
      transportType,
      passengers,
      departAt: departNow ? null : new Date(departAt).toISOString(),
      estimatedFare,
      estimatedTimeMins,
      estimatedDistanceKm,
    });
  };

  const handleSwap = () => {
    setFrom(to);
    setTo(from);
    setErrors({});
  };

  const stepPassengers = (delta: number) =>
    setPassengers((n) => Math.min(MAX_PASSENGERS, Math.max(1, n + delta)));

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5 space-y-4"
    >
      <div>
        <h1 className="text-lg font-bold text-stone-900">Book a ride</h1>
        <p className="text-xs text-stone-500 mt-0.5">
          Government-regulated fares. No surge pricing.
        </p>
      </div>

      {/* Route */}
      <div className="space-y-3 relative">
        <LocationInput
          label="Pickup"
          value={from}
          onChange={(v) => setFrom(v)}
          options={pickupPoints}
          placeholder="Where are you now?"
          error={errors.from}
          required
          disabled={submitting}
          icon={<span className="block w-2.5 h-2.5 rounded-full bg-emerald-500" aria-hidden="true" />}
        />

        <LocationInput
          label="Destination"
          value={to}
          onChange={(v) => setTo(v)}
          options={dropPoints}
          placeholder="Where are you going?"
          error={errors.to}
          required
          disabled={submitting}
          icon={<span className="block w-2.5 h-2.5 rounded-sm bg-orange-500" aria-hidden="true" />}
        />

        <button
          type="button"
          onClick={handleSwap}
          disabled={submitting}
          aria-label="Swap pickup and destination"
          className="
            absolute right-2 top-[64px] z-10
            w-9 h-9 rounded-full bg-white border border-stone-200 shadow-sm
            flex items-center justify-center text-stone-500
            transition hover:text-orange-600 hover:border-orange-300 active:scale-95
            focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          <ArrowRightLeft className="w-4 h-4 rotate-90" aria-hidden="true" />
        </button>
      </div>

      {/* Trip estimate */}
      <div className="flex items-center gap-4 rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-stone-600">
          <Route className="w-3.5 h-3.5 text-stone-400" aria-hidden="true" />
          {estimatedDistanceKm} km
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-stone-600">
          <Clock className="w-3.5 h-3.5 text-stone-400" aria-hidden="true" />
          about {estimatedTimeMins} min
        </span>
      </div>

      {/* Timing */}
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-semibold text-stone-600">When</legend>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setDepartNow(true); setErrors((p) => ({ ...p, departAt: undefined })); }}
            aria-pressed={departNow}
            disabled={submitting}
            className={`flex-1 min-h-[44px] rounded-xl border text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
              departNow
                ? 'border-orange-500 bg-orange-50 text-orange-800 ring-1 ring-orange-500'
                : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50'
            }`}
          >
            Leave now
          </button>
          <button
            type="button"
            onClick={() => setDepartNow(false)}
            aria-pressed={!departNow}
            disabled={submitting}
            className={`flex-1 min-h-[44px] rounded-xl border text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
              !departNow
                ? 'border-orange-500 bg-orange-50 text-orange-800 ring-1 ring-orange-500'
                : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50'
            }`}
          >
            Schedule
          </button>
        </div>

        {!departNow && (
          <div className="pt-1">
            <div
              className={`flex items-center gap-2.5 w-full rounded-xl border bg-white px-3 transition focus-within:ring-2 ${
                errors.departAt
                  ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-100'
                  : 'border-stone-200 focus-within:border-orange-500 focus-within:ring-orange-100'
              }`}
            >
              <CalendarClock className="w-4 h-4 shrink-0 text-stone-400" aria-hidden="true" />
              <input
                type="datetime-local"
                value={departAt}
                disabled={submitting}
                aria-label="Departure date and time"
                aria-invalid={!!errors.departAt}
                onChange={(e) => setDepartAt(e.target.value)}
                className="w-full bg-transparent py-3 text-sm text-stone-900 focus:outline-none"
              />
            </div>
            {errors.departAt && (
              <p role="alert" className="text-xs text-red-600 mt-1.5">
                {errors.departAt}
              </p>
            )}
          </div>
        )}
      </fieldset>

      {/* Passengers */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-stone-600">Passengers</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => stepPassengers(-1)}
            disabled={submitting || passengers <= 1}
            aria-label="One fewer passenger"
            className="w-9 h-9 rounded-lg border border-stone-200 flex items-center justify-center text-stone-600 transition hover:bg-stone-50 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Minus className="w-4 h-4" aria-hidden="true" />
          </button>
          <span aria-live="polite" className="w-10 text-center text-sm font-semibold text-stone-900">
            {passengers}
          </span>
          <button
            type="button"
            onClick={() => stepPassengers(1)}
            disabled={submitting || passengers >= MAX_PASSENGERS}
            aria-label="One more passenger"
            className="w-9 h-9 rounded-lg border border-stone-200 flex items-center justify-center text-stone-600 transition hover:bg-stone-50 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <RideOptions
        options={transportOptions}
        selected={transportType}
        onSelect={setTransportType}
        distanceKm={estimatedDistanceKm}
        disabled={submitting}
      />

      {submitError && (
        <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">
          {submitError}
        </p>
      )}

      <BookRideButton
        onClick={handleSubmit}
        loading={submitting}
        trailing={`₹${estimatedFare}`}
      />

      {activeOption?.disclaimer && (
        <p className="text-[11px] leading-relaxed text-stone-500">{activeOption.disclaimer}</p>
      )}
    </form>
  );
};
