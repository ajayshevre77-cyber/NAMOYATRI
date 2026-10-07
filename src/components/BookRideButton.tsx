import React from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  onClick: () => void;
  /** Shown to the right of the label, e.g. the calculated fare. */
  trailing?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  loadingLabel?: string;
  type?: 'button' | 'submit';
}

/** Primary call to action. Full width, thumb-height, busy state built in. */
export const BookRideButton: React.FC<Props> = ({
  onClick,
  trailing,
  loading = false,
  disabled = false,
  label = 'Book Ride',
  loadingLabel = 'Requesting ride…',
  type = 'submit',
}) => {
  const isBlocked = loading || disabled;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isBlocked}
      aria-busy={loading}
      className="
        w-full min-h-[52px] rounded-xl px-5
        bg-orange-600 text-white font-semibold
        flex items-center justify-center gap-2
        shadow-sm transition
        hover:bg-orange-700 hover:shadow
        active:scale-[0.99]
        focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2
        disabled:bg-stone-300 disabled:text-stone-500 disabled:shadow-none
        disabled:hover:bg-stone-300 disabled:active:scale-100 disabled:cursor-not-allowed
      "
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          {trailing && <span className="font-bold">{trailing}</span>}
        </>
      )}
    </button>
  );
};
