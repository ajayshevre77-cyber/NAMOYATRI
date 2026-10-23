import React, { useEffect, useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { RideBooking, TransportOption } from '../types';
import { useAuth } from '../context/AuthContext';
import { secureFetch } from '../lib/api';
import { MAX_LISTED_RIDES, departureLabel } from '../lib/rides';

interface Props {
  transportOptions: TransportOption[];
  /** Changes after a new request is saved, so the list reloads. */
  refreshKey: number;
}

/** Where the server keeps ride requests (`storage` in GET /api/rides/my-rides). */
interface RideStorage {
  kind: 'memory' | 'firestore' | 'unavailable';
  persistent: boolean;
}

function describeFailure(status: number, body: any): string {
  if (status === 401) return 'Please sign in again to see your demo requests.';
  if (typeof body?.error === 'string' && body.error) return body.error;
  return 'Your demo requests could not be loaded. Please try again.';
}

/** A stored ISO time for display; nothing for anything else. */
function requestedAt(iso: string) {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return null;
  return <time dateTime={iso}>{time.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time>;
}

/** Never "dispatched", "assigned" or "on the way": nothing is ever sent. */
function statusLabel(ride: RideBooking) {
  if (ride.status === 'requested') return 'Requested, not dispatched';
  if (ride.status === 'cancelled') return 'Cancelled';
  return 'Not dispatched (demo record)';
}

/**
 * The signed-in user's own demo ride requests (GET /api/rides/my-rides),
 * newest first, under the ride form on the Travel tab. It says whether the
 * list survives a server restart, and that nothing in it was dispatched.
 */
export const MyRideRequests: React.FC<Props> = ({ transportOptions, refreshKey }) => {
  const { firebaseUser, loading: authLoading, openAuthModal } = useAuth();
  const uid = firebaseUser?.uid ?? null;
  const [rides, setRides] = useState<RideBooking[] | null>(null);
  const [storage, setStorage] = useState<RideStorage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  // Another user's list must never stay on screen after a sign-out or switch.
  useEffect(() => {
    setRides(null);
    setStorage(null);
    setError(null);
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await secureFetch('/api/rides/my-rides', { signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!res.ok || !Array.isArray(body?.rides)) {
          setError(describeFailure(res.status, body));
          return;
        }
        setRides(body.rides);
        setStorage(body.storage ?? null);
      } catch {
        if (!controller.signal.aborted) setError('Could not reach the server. Check your connection and try again.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [uid, refreshKey, reloads]);

  const reload = () => {
    if (!loading) setReloads((n) => n + 1);
  };
  const rideTitle = (type: string) => transportOptions.find((o) => o.type === type)?.title ?? type;
  const approximate = (place: RideBooking['fromPlace']) =>
    place?.approximate ? <span className="font-normal text-stone-500"> (approximate location)</span> : null;

  return (
    <section
      id="my-ride-requests"
      aria-labelledby="my-ride-requests-heading"
      className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5 space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id="my-ride-requests-heading" className="text-base font-bold text-stone-900">
          My demo requests
        </h3>
        {uid && (
          <button
            id="my-ride-requests-refresh"
            type="button"
            onClick={reload}
            aria-disabled={loading}
            className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-stone-200 px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 aria-disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        )}
      </div>

      {!uid ? (
        !authLoading && (
          <div className="space-y-2">
            <p className="text-xs text-stone-600">
              Sign in, or continue as a guest when you request a ride, to see your demo requests here.
            </p>
            <button
              type="button"
              onClick={() => openAuthModal('Sign in to see your demo ride requests.')}
              className="min-h-12 rounded-xl border border-stone-200 px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              Sign in
            </button>
          </div>
        )
      ) : (
        <>
          <p className="text-xs text-stone-600 leading-relaxed">
            None of these requests was dispatched: no driver or vehicle is coming.
            {storage?.persistent === true && ' They are saved in the demo database, so this list stays after a refresh or a server restart.'}
            {storage?.persistent === false && " They are kept only in the demo server's memory, so this list is cleared whenever the server restarts."}
          </p>
          {firebaseUser?.isAnonymous && (
            <p className="text-xs text-stone-600 leading-relaxed">
              You are signed in as a guest. These requests belong to this guest session and will not move to an
              account you create later.
            </p>
          )}

          <div aria-live="polite">
            {loading && rides === null && (
              <p role="status" className="text-xs text-stone-500">
                Loading your demo requests…
              </p>
            )}
            {error && (
              <div role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                <p className="text-xs text-red-800">{error}</p>
                <button
                  type="button"
                  onClick={reload}
                  className="min-h-12 rounded-xl border border-red-200 bg-white px-4 text-xs font-semibold text-red-800 transition hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                >
                  Try again
                </button>
              </div>
            )}
            {rides?.length === 0 && !error && (
              <p className="text-xs text-stone-500">You have not requested any demo rides yet.</p>
            )}
          </div>

          {rides && rides.length > 0 && (
            <ul className="space-y-2.5">
              {rides.map((ride) => (
                <li key={ride.id} className="rounded-xl border border-stone-200 p-3 space-y-2">
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-semibold text-stone-900">
                    <span>
                      {ride.fromLocation}
                      {approximate(ride.fromPlace)}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-stone-400 shrink-0" aria-hidden="true" />
                    <span className="sr-only">to</span>
                    <span>
                      {ride.toLocation}
                      {approximate(ride.toPlace)}
                    </span>
                  </p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div>
                      <dt className="text-stone-500">Status</dt>
                      <dd className="font-semibold text-stone-900">{statusLabel(ride)}</dd>
                    </div>
                    <div>
                      <dt className="text-stone-500">When</dt>
                      <dd className="font-semibold text-stone-900">{departureLabel(ride.departAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-stone-500">Ride type</dt>
                      <dd className="font-semibold text-stone-900">{rideTitle(ride.transportType)}</dd>
                    </div>
                    <div>
                      <dt className="text-stone-500">Passengers</dt>
                      <dd className="font-semibold text-stone-900">{ride.passengers}</dd>
                    </div>
                    <div>
                      <dt className="text-stone-500">Requested</dt>
                      <dd className="font-semibold text-stone-900">{requestedAt(ride.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-stone-500">Demo fare estimate</dt>
                      <dd className="font-semibold text-stone-900">₹{ride.estimatedFare}</dd>
                    </div>
                  </dl>
                  <p className="text-[11px] text-stone-500">Reference {ride.bookingRef}</p>
                </li>
              ))}
            </ul>
          )}
          {rides && rides.length >= MAX_LISTED_RIDES && (
            <p className="text-[11px] text-stone-500">Showing your {MAX_LISTED_RIDES} most recent requests.</p>
          )}
        </>
      )}
    </section>
  );
};
