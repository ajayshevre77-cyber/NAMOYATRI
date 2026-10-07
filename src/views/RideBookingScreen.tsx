import React, { useState } from 'react';
import { CheckCircle2, MapPin, X } from 'lucide-react';
import { TransportOption, RideBooking } from '../types';
import { PICKUP_POINTS, DROP_POINTS, MOCK_TRANSPORT_OPTIONS } from '../data/kumbhData';
import { AdPanel } from '../components/AdPanel';
import { RideBookingCard, RideRequestDetails } from '../components/RideBookingCard';
import { BottomNavigation, RideNavTab } from '../components/BottomNavigation';
import { useAuth } from '../context/AuthContext';
import { secureFetch } from '../lib/api';

interface Props {
  transportOptions?: TransportOption[];
  /** Count rendered on the Pass tab. */
  passCount?: number;
  onNavigate?: (tab: RideNavTab) => void;
}

/**
 * Full-viewport ride booking page: advertisement slot, booking form, and a
 * fixed three-item bottom bar. Content scrolls beneath the bar; on desktop it
 * stays centred in a phone-width column rather than stretching.
 */
export const RideBookingScreen: React.FC<Props> = ({
  transportOptions = MOCK_TRANSPORT_OPTIONS,
  passCount,
  onNavigate,
}) => {
  const { requireAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<RideNavTab>('pass');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [booking, setBooking] = useState<RideBooking | null>(null);

  const requestRide = async (details: RideRequestDetails) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await secureFetch('/api/rides/request', {
        method: 'POST',
        body: JSON.stringify({
          from: details.from,
          to: details.to,
          transportType: details.transportType,
          estimatedFare: details.estimatedFare,
          estimatedTimeMins: details.estimatedTimeMins,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setSubmitError(data.message || 'That ride could not be requested. Please try again.');
        return;
      }
      setBooking(data.booking);
    } catch {
      setSubmitError('No connection to the dispatch service. Check your network and retry.');
    } finally {
      setSubmitting(false);
    }
  };

  // Guests get the sign-in popup first, then the request resumes on its own.
  const handleSubmit = (details: RideRequestDetails) =>
    requireAuth('book a ride', () => requestRide(details));

  const handleNavigate = (tab: RideNavTab) => {
    setActiveTab(tab);
    onNavigate?.(tab);
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-32 space-y-4">
        {/* 1 — Advertisement */}
        <AdPanel placeholderLabel="Advertisement" />

        {/* 2 — Ride booking */}
        {booking ? (
          <section
            aria-live="polite"
            className="bg-white rounded-2xl border border-emerald-300 shadow-sm p-5 space-y-4"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" aria-hidden="true" />
              <div className="flex-1">
                <h2 className="text-base font-bold text-stone-900">Ride requested</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Reference {booking.bookingRef}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBooking(null)}
                aria-label="Book another ride"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <p className="flex items-start gap-2 text-stone-700">
                <MapPin className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" aria-hidden="true" />
                <span>{booking.fromLocation}</span>
              </p>
              <p className="flex items-start gap-2 text-stone-700">
                <MapPin className="w-4 h-4 mt-0.5 text-orange-600 shrink-0" aria-hidden="true" />
                <span>{booking.toLocation}</span>
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-stone-50 border border-stone-200 px-3 py-2.5">
              <span className="text-xs text-stone-600">Estimated fare</span>
              <span className="text-base font-bold text-stone-900">₹{booking.estimatedFare}</span>
            </div>

            <button
              type="button"
              onClick={() => setBooking(null)}
              className="w-full min-h-[48px] rounded-xl border border-stone-200 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              Book another ride
            </button>
          </section>
        ) : (
          <RideBookingCard
            transportOptions={transportOptions}
            pickupPoints={PICKUP_POINTS}
            dropPoints={DROP_POINTS}
            onSubmit={handleSubmit}
            submitting={submitting}
            submitError={submitError}
          />
        )}
      </main>

      {/* 3 — Fixed bottom navigation */}
      <BottomNavigation active={activeTab} onChange={handleNavigate} passBadge={passCount} />
    </div>
  );
};
