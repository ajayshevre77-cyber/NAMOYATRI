import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRightLeft, CalendarClock, Minus, Plus, Route, Clock } from 'lucide-react';
import { TransportOption, TransportType } from '../types';
import { LocationInput } from './LocationInput';
import { RideOptions } from './RideOptions';
import { BookRideButton } from './BookRideButton';
import { demoDistanceBasis, maxPassengersFor, MAX_ADVANCE_BOOKING_DAYS } from '../lib/fare';
import { RideEnd, RidePlace, estimateRide, isRidePlace, sameRideEnd } from '../lib/rides';

/**
 * What the pilgrim asked for. There is no fare here on purpose: the server
 * prices the trip itself, and the form's figure is only a preview.
 */
export interface RideRequestDetails {
  /** A fixed demo point's name, or a place from the map or a trip plan. */
  from: RideEnd;
  to: RideEnd;
  transportType: TransportType;
  passengers: number;
  /** ISO string when scheduled, null when the pilgrim is leaving now. */
  departAt: string | null;
}

interface Props {
  transportOptions: TransportOption[];
  pickupPoints: string[];
  dropPoints: string[];
  onSubmit: (details: RideRequestDetails) => void;
  submitting?: boolean;
  /** Surfaces a failure from the caller's API call. */
  submitError?: string | null;
  /** A pickup and destination handed over from the map or a trip plan. */
  initialFrom?: RideEnd | null;
  initialTo?: RideEnd | null;
}

type Errors = Partial<Record<'from' | 'to' | 'departAt' | 'passengers', string>>;

/** A pickup or destination that is a place from the map or a trip plan, with a way back to the list. */
const PlaceField: React.FC<{
  label: string;
  place: RidePlace;
  icon: React.ReactNode;
  error?: string;
  disabled: boolean;
  onChange: () => void;
}> = ({ label, place, icon, error, disabled, onChange }) => {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="space-y-1.5">
      <span id={labelId} className="block text-xs font-semibold text-stone-600">
        {label}
      </span>
      <div className={`flex items-center gap-2.5 rounded-xl border bg-stone-50 pl-3 ${error ? 'border-red-400' : 'border-stone-200'}`}>
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 py-1.5">
          <span className="block truncate text-sm font-semibold text-stone-900">{place.label}</span>
          <span className="block text-[11px] text-stone-500">
            {place.source === 'sample' ? 'Kumbh sample site · approximate location' : 'Place from OpenStreetMap'}
          </span>
        </span>
        <button
          type="button"
          onClick={onChange}
          disabled={disabled}
          aria-label={`Change ${label.toLowerCase()}: choose from the list instead of ${place.label}`}
          className="min-h-[48px] shrink-0 rounded-r-xl px-3 text-xs font-semibold text-orange-700 underline transition hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50"
        >
          Change
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
};

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
  initialFrom = null,
  initialTo = null,
}) => {
  // A handed-over destination without a pickup leaves the pickup for the
  // pilgrim to choose, rather than defaulting to the first point in the list.
  const [from, setFrom] = useState<RideEnd | ''>(initialFrom ?? (initialTo ? '' : (pickupPoints[0] ?? '')));
  const [to, setTo] = useState<RideEnd | ''>(initialTo ?? '');
  const [departNow, setDepartNow] = useState(true);
  const [departAt, setDepartAt] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [transportType, setTransportType] = useState<TransportType>(
    transportOptions[0]?.type ?? 'electric_shuttle',
  );
  const [errors, setErrors] = useState<Errors>({});

  // "Change" on a place swaps it for the list, which removes the button that
  // had focus; focus moves to that list instead of falling to the page.
  const fromField = useRef<HTMLDivElement>(null);
  const toField = useRef<HTMLDivElement>(null);
  const [focusList, setFocusList] = useState<'from' | 'to' | null>(null);
  useEffect(() => {
    if (!focusList) return;
    (focusList === 'from' ? fromField : toField).current?.querySelector('select')?.focus();
    setFocusList(null);
  }, [focusList]);

  const activeOption =
    transportOptions.find((o) => o.type === transportType) ?? transportOptions[0];

  // Preview only, from the same estimator the server prices the ride with.
  // Recalculated whenever either end or the ride type changes; nothing is
  // shown until both ends are chosen.
  const estimate = useMemo(
    () => (activeOption ? estimateRide(activeOption, from || null, to || null) : null),
    [activeOption, from, to],
  );

  const seatLimit = activeOption ? maxPassengersFor(activeOption) : 1;

  const validate = (): Errors => {
    const next: Errors = {};
    if (!from) next.from = 'Choose a pickup point.';
    else if (typeof from === 'string' && !pickupPoints.includes(from)) next.from = 'Choose a pickup point from the list.';
    if (!to) next.to = 'Choose a destination.';
    else if (typeof to === 'string' && !dropPoints.includes(to)) next.to = 'Choose a destination from the list.';
    if (from && to && sameRideEnd(from, to)) next.to = 'Destination must differ from pickup.';
    if (passengers > seatLimit) {
      next.passengers = `${activeOption?.title ?? 'This ride'} seats at most ${seatLimit}. Choose fewer passengers or another ride type.`;
    }
    if (!departNow) {
      const departMs = departAt ? new Date(departAt).getTime() : NaN;
      if (!departAt) next.departAt = 'Pick a date and time.';
      else if (departMs < Date.now()) next.departAt = 'That time has already passed.';
      else if (departMs > Date.now() + MAX_ADVANCE_BOOKING_DAYS * 24 * 60 * 60 * 1000) {
        next.departAt = `Choose a time within the next ${MAX_ADVANCE_BOOKING_DAYS} days.`;
      }
    }
    return next;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    onSubmit({
      from: from as RideEnd,
      to: to as RideEnd,
      transportType,
      passengers,
      departAt: departNow ? null : new Date(departAt).toISOString(),
    });
  };

  // Pickup and drop come from different lists. Swapping is offered only when
  // each value fits the other field: a place from the map always does, a
  // list point only if the other list has it. Otherwise a select would hold
  // a value it cannot show, and the server would reject the request.
  const fits = (end: RideEnd | '', list: string[]) => isRidePlace(end) || (!!end && list.includes(end));
  const canSwap = fits(to, pickupPoints) && fits(from, dropPoints);

  const handleSwap = () => {
    setFrom(to);
    setTo(from);
    setErrors({});
  };

  const stepPassengers = (delta: number) => {
    setPassengers((n) => Math.min(seatLimit, Math.max(1, n + delta)));
    setErrors((p) => ({ ...p, passengers: undefined }));
  };

  return (
    <form
      id="ride-request-form"
      onSubmit={handleSubmit}
      noValidate
      className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5 space-y-4"
    >
      <div>
        {/* Focusable so a hand-over from the map or a trip plan can land here. */}
        <h1 id="ride-form-heading" tabIndex={-1} className="text-lg font-bold text-stone-900 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
          Request a ride
        </h1>
        <p className="text-xs text-stone-500 mt-0.5">
          Demo only: fares and wait times are estimates, not official rates, and no vehicle is dispatched.
        </p>
      </div>

      {/* Route */}
      <div className="space-y-3">
        <div ref={fromField}>
          {isRidePlace(from) ? (
            <PlaceField
              label="Pickup"
              place={from}
              error={errors.from}
              disabled={submitting}
              onChange={() => {
                setFrom('');
                setFocusList('from');
              }}
              icon={<span className="block w-2.5 h-2.5 rounded-full bg-emerald-500" aria-hidden="true" />}
            />
          ) : (
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
          )}
        </div>

        {canSwap && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSwap}
              disabled={submitting}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-stone-600 transition hover:bg-stone-100 hover:text-orange-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRightLeft className="w-4 h-4 rotate-90" aria-hidden="true" />
              Swap pickup and destination
            </button>
          </div>
        )}

        <div ref={toField}>
          {isRidePlace(to) ? (
            <PlaceField
              label="Destination"
              place={to}
              error={errors.to}
              disabled={submitting}
              onChange={() => {
                setTo('');
                setFocusList('to');
              }}
              icon={<span className="block w-2.5 h-2.5 rounded-sm bg-orange-500" aria-hidden="true" />}
            />
          ) : (
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
          )}
        </div>
      </div>

      {/* Trip estimate: a fixed demo distance per kind of trip, never a measured one. */}
      <div id="ride-estimate" aria-live="polite" className="rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5 text-xs text-stone-600">
        {estimate ? (
          <>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <Route className="w-3.5 h-3.5 text-stone-400" aria-hidden="true" />
                Demo distance {estimate.distanceKm} km
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-stone-400" aria-hidden="true" />
                about {estimate.estimatedTimeMins} min (demo)
              </span>
            </p>
            <p className="mt-1 text-[11px] text-stone-500">
              The same fixed demo value for any trip {demoDistanceBasis(estimate.fromArea, estimate.toArea)}. It is not
              measured on a map or by road, so the fare is only a rough demo estimate.
            </p>
          </>
        ) : (
          <p>Choose a pickup and a destination to see a demo fare estimate.</p>
        )}
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
      <div className="space-y-1.5">
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
              disabled={submitting || passengers >= seatLimit}
              aria-label="One more passenger"
              className="w-9 h-9 rounded-lg border border-stone-200 flex items-center justify-center text-stone-600 transition hover:bg-stone-50 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        {errors.passengers && (
          <p role="alert" className="text-xs text-red-600">
            {errors.passengers}
          </p>
        )}
      </div>

      <RideOptions
        options={transportOptions}
        selected={transportType}
        onSelect={setTransportType}
        distanceKm={estimate?.distanceKm ?? null}
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
        label="Request ride (demo)"
        trailing={estimate ? `~₹${estimate.estimatedFare}` : undefined}
      />

      {activeOption?.disclaimer && (
        <p className="text-[11px] leading-relaxed text-stone-500">{activeOption.disclaimer}</p>
      )}
    </form>
  );
};
