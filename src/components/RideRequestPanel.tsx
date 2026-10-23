import React, { useState } from 'react';
import { Info, MapPin, X } from 'lucide-react';
import { TransportOption, RideBooking } from '../types';
import { PICKUP_POINTS, DROP_POINTS } from '../data/kumbhData';
import { RideBookingCard, RideRequestDetails } from './RideBookingCard';
import { useAuth, GuestContinuation } from '../context/AuthContext';
import { secureFetch } from '../lib/api';
import { demoDistanceBasis } from '../lib/fare';
import { RideDraft } from '../lib/rides';

interface Props {
  transportOptions: TransportOption[];
  /** A pickup and destination handed over from the map or a trip plan. */
  draft?: RideDraft | null;
}

// Continuing as a guest from the sign-in popup submits the request at once,
// so the popup has to say that, and that nothing will be dispatched.
const GUEST_RIDE_REQUEST: GuestContinuation = {
  label: 'Continue as guest and submit demo ride request',
  explanation:
    'Continuing as a guest signs you in anonymously and submits this ride request straight away. ' +
    'It is a demo request, only stored on the demo server: no driver or vehicle will be dispatched, and none will arrive.',
};

/** Turns a failed response into something a pilgrim can act on. */
function describeFailure(status: number, body: any): string {
  if (status === 401) return 'Please sign in again to request a ride.';
  if (typeof body?.error === 'string' && body.error) return body.error;
  return 'That ride could not be requested. Please try again.';
}

const formatDeparture = (departAt: string | null) =>
  departAt
    ? new Date(departAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : 'Leave now';

/**
 * The one ride request flow, used by the Travel tab.
 *
 * Owns the sign-in gate, the API call and the result. The result is shown as a
 * recorded demo request, never as a confirmed or dispatched ride, because the
 * server only stores it: no driver or vehicle is sent.
 */
export const RideRequestPanel: React.FC<Props> = ({ transportOptions, draft = null }) => {
  const { requireAuth } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [booking, setBooking] = useState<RideBooking | null>(null);

  const requestRide = async (details: RideRequestDetails) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // No fare is sent: the server prices the trip itself.
      const res = await secureFetch('/api/rides/request', {
        method: 'POST',
        body: JSON.stringify({
          from: details.from,
          to: details.to,
          transportType: details.transportType,
          passengers: details.passengers,
          departAt: details.departAt,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success || !data.booking) {
        setSubmitError(describeFailure(res.status, data));
        return;
      }
      setBooking(data.booking);
    } catch {
      setSubmitError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Guests get the sign-in popup first, then the request resumes on its own.
  const handleSubmit = (details: RideRequestDetails) =>
    requireAuth('request a ride', () => requestRide(details), GUEST_RIDE_REQUEST);

  if (!booking) {
    return (
      <RideBookingCard
        // A new hand-over starts the form afresh with its places.
        key={draft?.id ?? 'manual'}
        transportOptions={transportOptions}
        pickupPoints={PICKUP_POINTS}
        dropPoints={DROP_POINTS}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitError={submitError}
        initialFrom={draft?.from ?? null}
        initialTo={draft?.to ?? null}
      />
    );
  }

  const rideTitle =
    transportOptions.find((o) => o.type === booking.transportType)?.title ?? booking.transportType;
  const approximate = (place: RideBooking['fromPlace']) =>
    place?.approximate ? <span className="text-stone-500"> (approximate location)</span> : null;

  return (
    <section
      aria-live="polite"
      id="ride-request-result"
      className="bg-white rounded-2xl border border-amber-300 shadow-sm p-5 space-y-4"
    >
      <div className="flex items-start gap-3">
        <Info className="w-6 h-6 text-amber-600 shrink-0" aria-hidden="true" />
        <div className="flex-1">
          <h2 className="text-base font-bold text-stone-900">Demo request recorded</h2>
          <p className="text-xs text-stone-500 mt-0.5">Reference {booking.bookingRef}</p>
        </div>
        <button
          type="button"
          onClick={() => setBooking(null)}
          aria-label="Close and request another ride"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-900 leading-relaxed">
        <strong>No driver or vehicle has been dispatched, and none will arrive.</strong> Namo
        Yatri is a demo: requests are only stored on the demo server. For real travel, use an
        official transport service.
      </p>

      <div className="space-y-2 text-sm">
        <p className="flex items-start gap-2 text-stone-700">
          <MapPin className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>
            {booking.fromLocation}
            {approximate(booking.fromPlace)}
          </span>
        </p>
        <p className="flex items-start gap-2 text-stone-700">
          <MapPin className="w-4 h-4 mt-0.5 text-orange-600 shrink-0" aria-hidden="true" />
          <span>
            {booking.toLocation}
            {approximate(booking.toPlace)}
          </span>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-stone-500">Status</dt>
          <dd className="font-semibold text-stone-900">Requested, not dispatched</dd>
        </div>
        <div>
          <dt className="text-stone-500">When</dt>
          <dd className="font-semibold text-stone-900">{formatDeparture(booking.departAt)}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Ride type</dt>
          <dd className="font-semibold text-stone-900">{rideTitle}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Passengers</dt>
          <dd className="font-semibold text-stone-900">{booking.passengers}</dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5">
        <span className="text-xs text-stone-600">
          Demo fare estimate · demo distance {booking.distanceKm} km
          {booking.fromArea && booking.toArea && `, the fixed value for any trip ${demoDistanceBasis(booking.fromArea, booking.toArea)}`}{' '}
          (not measured) · about {booking.estimatedTimeMins} min
        </span>
        <span className="text-base font-bold text-stone-900">₹{booking.estimatedFare}</span>
      </div>

      <button
        type="button"
        onClick={() => setBooking(null)}
        className="w-full min-h-[48px] rounded-xl border border-stone-200 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
      >
        Request another ride
      </button>
    </section>
  );
};
