import React from 'react';
import { Bus, Car, Zap, Bike, Users, Clock } from 'lucide-react';
import { TransportOption, TransportType } from '../types';

interface Props {
  options: TransportOption[];
  selected: TransportType;
  onSelect: (type: TransportType) => void;
  /** Distance used to price each option, in km. */
  distanceKm: number;
  disabled?: boolean;
}

const ICONS: Record<TransportType, React.ComponentType<{ className?: string }>> = {
  auto: Bike,
  cab: Car,
  electric_shuttle: Zap,
  govt_bus: Bus,
};

export const fareFor = (option: TransportOption, distanceKm: number) =>
  Math.round(option.baseFare + distanceKm * option.perKmRate);

/**
 * Radio group of transport choices, each showing its regulated fare for the
 * current trip. Arrow keys move between options because it is a real radiogroup.
 */
export const RideOptions: React.FC<Props> = ({
  options,
  selected,
  onSelect,
  distanceKm,
  disabled = false,
}) => (
  <div className="space-y-1.5">
    <span className="block text-xs font-semibold text-stone-600">Ride type</span>

    <div role="radiogroup" aria-label="Ride type" className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const Icon = ICONS[option.type] ?? Car;
        const isSelected = option.type === selected;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onSelect(option.type)}
            className={`
              flex flex-col gap-1.5 rounded-xl border p-3 text-left transition
              focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-1
              disabled:opacity-60 disabled:cursor-not-allowed
              ${
                isSelected
                  ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500'
                  : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
              }
            `}
          >
            <span className="flex items-center gap-1.5">
              <Icon className={`w-4 h-4 ${isSelected ? 'text-orange-600' : 'text-stone-500'}`} />
              <span
                className={`text-xs font-semibold truncate ${
                  isSelected ? 'text-orange-900' : 'text-stone-700'
                }`}
              >
                {option.title.split(' (')[0]}
              </span>
            </span>

            <span className="flex items-baseline gap-1">
              <span className={`text-base font-bold ${isSelected ? 'text-orange-700' : 'text-stone-900'}`}>
                ₹{fareFor(option, distanceKm)}
              </span>
              {option.isRegulatedFare && (
                <span className="text-[10px] font-medium text-emerald-700">regulated</span>
              )}
            </span>

            <span className="flex items-center gap-2 text-[10px] text-stone-500">
              <span className="inline-flex items-center gap-0.5">
                <Clock className="w-3 h-3" aria-hidden="true" />
                {option.estimatedWaitMins} min
              </span>
              <span className="inline-flex items-center gap-0.5">
                <Users className="w-3 h-3" aria-hidden="true" />
                {option.capacity}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  </div>
);
