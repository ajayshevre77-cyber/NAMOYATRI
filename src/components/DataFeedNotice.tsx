import React from 'react';
import { CloudOff, RefreshCw, X } from 'lucide-react';

interface Props {
  /** Human names of the feeds that failed, e.g. ['Places', 'Passes']. */
  failed: string[];
  onRetry: () => void;
  onDismiss: () => void;
  retrying?: boolean;
}

/**
 * Tells the pilgrim that some live data could not be loaded and that bundled
 * sample data is showing instead.
 *
 * Without this the app falls back to mock data silently, so a dead API looks
 * exactly like a working one with stale content.
 */
export const DataFeedNotice: React.FC<Props> = ({
  failed,
  onRetry,
  onDismiss,
  retrying = false,
}) => {
  if (failed.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-amber-300 bg-amber-50 p-3 sm:p-3.5 flex items-start gap-3"
    >
      <CloudOff className="w-5 h-5 shrink-0 text-amber-700 mt-0.5" aria-hidden="true" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900">
          Showing sample data — live updates unavailable
        </p>
        <p className="text-xs text-amber-800 mt-0.5">
          Could not reach: {failed.join(', ')}. Timings, fares and advisories may be out of date.
        </p>

        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="
            mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5
            bg-amber-600 text-white text-xs font-semibold
            transition hover:bg-amber-700 active:scale-[0.98]
            focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-1
            disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100
          "
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss this notice"
        className="
          shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-amber-700
          transition hover:bg-amber-100
          focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600
        "
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
};
