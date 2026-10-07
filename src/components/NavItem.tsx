import React from 'react';

interface Props {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  /** Raises the item above the bar and fills it — used for the centre action. */
  emphasized?: boolean;
  badge?: string | number;
  onClick: () => void;
}

/** One destination in the bottom navigation bar. */
export const NavItem: React.FC<Props> = ({
  label,
  icon: Icon,
  active = false,
  emphasized = false,
  badge,
  onClick,
}) => {
  if (emphasized) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className="
          relative flex flex-col items-center justify-center gap-1
          -mt-6 px-2 group
          focus:outline-none
        "
      >
        <span
          className={`
            relative flex items-center justify-center w-14 h-14 rounded-full
            border-4 border-white shadow-lg transition
            group-hover:shadow-xl group-active:scale-95
            group-focus-visible:ring-2 group-focus-visible:ring-orange-500 group-focus-visible:ring-offset-2
            ${active ? 'bg-orange-600' : 'bg-stone-800 group-hover:bg-stone-700'}
          `}
        >
          <Icon className="w-6 h-6 text-white" aria-hidden="true" />
          {badge !== undefined && (
            <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-white text-orange-700 text-[10px] font-bold flex items-center justify-center border border-orange-200">
              {badge}
            </span>
          )}
        </span>
        <span
          className={`text-[11px] font-semibold ${active ? 'text-orange-700' : 'text-stone-600'}`}
        >
          {label}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="
        flex flex-col items-center justify-center gap-1 flex-1 min-h-[56px] px-2 rounded-xl
        transition hover:bg-stone-50 active:bg-stone-100
        focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-inset
      "
    >
      <span className="relative">
        <Icon className={`w-5 h-5 ${active ? 'text-orange-600' : 'text-stone-500'}`} aria-hidden="true" />
        {badge !== undefined && (
          <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-orange-600 text-white text-[9px] font-bold flex items-center justify-center">
            {badge}
          </span>
        )}
      </span>
      <span className={`text-[11px] ${active ? 'text-orange-700 font-semibold' : 'text-stone-500'}`}>
        {label}
      </span>
    </button>
  );
};
