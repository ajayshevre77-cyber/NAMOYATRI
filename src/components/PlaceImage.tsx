import React from 'react';
import {
  Armchair,
  BedDouble,
  Camera,
  Cross,
  Droplet,
  Landmark,
  SquareParking,
  Tent,
  Toilet,
  Utensils,
  Waves,
} from 'lucide-react';
import { Place, PlaceCategory } from '../types';

const CATEGORY_ICONS: Record<PlaceCategory, React.ComponentType<{ className?: string }>> = {
  temple: Landmark,
  ghat: Waves,
  kumbh_zone: Tent,
  attraction: Camera,
  food: Utensils,
  accommodation: BedDouble,
  parking: SquareParking,
  medical: Cross,
  toilets: Toilet,
  drinking_water: Droplet,
  rest_area: Armchair,
};

interface Props {
  place: Place;
  alt: string;
  /** Size and shape, applied to the photo or the placeholder. The caller's frame supplies the background. */
  className?: string;
  /** Size of the category icon in the placeholder. Omit for no icon. */
  iconClassName?: string;
  /** Show "No photo yet" under the icon. */
  showLabel?: boolean;
}

/**
 * A place's photo, or a neutral placeholder for its category when there is none.
 *
 * The sample places used to carry stock photos of unrelated places (Ramkund was
 * a hotel bedroom). A placeholder is honest; a photo of somewhere else is not.
 */
export const PlaceImage: React.FC<Props> = ({ place, alt, className = '', iconClassName, showLabel = false }) => {
  if (place.imageUrl) {
    return (
      <img
        src={place.imageUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        className={`${className} object-cover`}
      />
    );
  }

  const Icon = CATEGORY_ICONS[place.category];
  return (
    <div
      role="img"
      aria-label={`${alt}: no photo yet`}
      className={`${className} flex flex-col items-center justify-center gap-1 text-stone-400`}
    >
      {iconClassName && Icon && <Icon className={iconClassName} aria-hidden="true" />}
      {showLabel && <span className="text-[11px] font-medium">No photo yet</span>}
    </div>
  );
};
