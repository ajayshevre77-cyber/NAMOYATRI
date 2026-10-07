import React from 'react';
import { Megaphone } from 'lucide-react';

interface Props {
  /** Creative to render once a real advertisement is supplied. */
  children?: React.ReactNode;
  /** Shown in the empty slot so the space reads as intentional, not broken. */
  placeholderLabel?: string;
  /** Opens the advertiser's destination when a creative is clicked. */
  onPress?: () => void;
  className?: string;
}

/**
 * Reusable advertisement slot.
 *
 * Renders `children` when a creative is supplied, otherwise a labelled empty
 * state at the same height so the layout never shifts when an ad loads.
 */
export const AdPanel: React.FC<Props> = ({
  children,
  placeholderLabel = 'Advertisement',
  onPress,
  className = '',
}) => {
  const isInteractive = !!onPress && !!children;

  const body = children ?? (
    <div className="flex flex-col items-center justify-center gap-1.5 text-stone-400">
      <Megaphone className="w-6 h-6" aria-hidden="true" />
      <span className="text-xs font-medium tracking-wide">{placeholderLabel}</span>
    </div>
  );

  const shell = (
    <div
      className={`
        h-32 sm:h-36 w-full rounded-2xl overflow-hidden
        bg-stone-100 border border-stone-200
        flex items-center justify-center
        ${isInteractive ? 'transition hover:border-stone-300 hover:shadow-sm active:scale-[0.995]' : ''}
      `}
    >
      {body}
    </div>
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onPress}
        aria-label="Advertisement"
        className={`block w-full text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${className}`}
      >
        {shell}
      </button>
    );
  }

  return (
    <div
      role="complementary"
      aria-label={children ? 'Advertisement' : undefined}
      aria-hidden={children ? undefined : true}
      className={className}
    >
      {shell}
    </div>
  );
};
