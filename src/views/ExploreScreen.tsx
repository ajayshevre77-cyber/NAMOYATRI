import React, { useState } from 'react';
import { Search, MapPin, Filter, Sparkles, Navigation } from 'lucide-react';
import { Place, PlaceCategory } from '../types';
import { SupportedLanguage, translations } from '../i18n';
import { VerificationBadge } from '../components/VerificationBadge';

interface Props {
  places: Place[];
  currentLanguage: SupportedLanguage;
  onSelectPlace: (placeId: string) => void;
}

export const ExploreScreen: React.FC<Props> = ({
  places,
  currentLanguage,
  onSelectPlace,
}) => {
  const t = translations[currentLanguage];
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');

  const categories: { id: string; label: string }[] = [
    { id: 'all', label: t.catAll },
    { id: 'temple', label: t.catTemples },
    { id: 'ghat', label: t.catGhats },
    { id: 'kumbh_zone', label: t.catKumbhLocations },
    { id: 'attraction', label: t.catAttractions },
    { id: 'food', label: t.catFood },
    { id: 'accommodation', label: t.catAccommodation },
    { id: 'parking', label: t.catParking },
    { id: 'medical', label: t.catMedical },
    { id: 'toilets', label: t.catToilets },
    { id: 'drinking_water', label: t.catDrinkingWater },
    { id: 'rest_area', label: t.catRestAreas },
  ];

  const filteredPlaces = places.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || 
      p.name[currentLanguage]?.toLowerCase().includes(query) ||
      p.name.en.toLowerCase().includes(query) ||
      p.location.area.toLowerCase().includes(query) ||
      p.description.en.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  return (
    <div id="explore-screen-view" className="space-y-4 pb-12">
      {/* Header & Search */}
      <div className="space-y-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900">
            Sacred Places & Facilities
          </h2>
          <p className="text-xs sm:text-sm text-stone-500">
            Explore verified holy sites, ghats, food annachhatras & emergency facilities.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="explore-search-input"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, area, facility..."
            className="w-full bg-white border border-stone-200 text-stone-900 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-xs"
          />
        </div>

        {/* Category Filter Pills (Horizontal Scroll) */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                id={`cat-pill-${cat.id}`}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
                  isSelected
                    ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Place Count */}
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span>Showing {filteredPlaces.length} locations</span>
        <span className="text-[11px] text-emerald-700 font-medium">
          ✓ All official Kumbh sites verified
        </span>
      </div>

      {/* Place Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredPlaces.map((place) => (
          <div
            key={place.id}
            id={`place-card-${place.id}`}
            onClick={() => onSelectPlace(place.id)}
            className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-xs hover:shadow-md hover:border-orange-300 transition cursor-pointer flex flex-col justify-between"
          >
            {/* Card Image */}
            <div className="relative h-40 bg-stone-100 overflow-hidden">
              <img
                src={place.imageUrl}
                alt={place.name[currentLanguage] || place.name.en}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
              />
              <div className="absolute top-2.5 left-2.5">
                <VerificationBadge tier={place.verificationTier} size="sm" />
              </div>
              <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-white text-[11px] bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded-md">
                <span className="uppercase font-bold tracking-wider text-[9px] text-orange-300">
                  {place.category.replace('_', ' ')}
                </span>
                <span>~{place.distanceKmPlaceholder} km</span>
              </div>
            </div>

            {/* Card Body */}
            <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-stone-900 text-sm sm:text-base leading-snug line-clamp-1">
                  {place.name[currentLanguage] || place.name.en}
                </h3>
                <div className="flex items-center gap-1 text-stone-500 text-xs mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                  <span className="truncate">{place.location.area}</span>
                </div>
                <p className="text-stone-600 text-xs line-clamp-2 mt-1.5 leading-relaxed">
                  {place.description[currentLanguage] || place.description.en}
                </p>
              </div>

              <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                <span className="text-stone-500 text-[11px] truncate max-w-[150px]">
                  {place.timings}
                </span>
                <span className="text-orange-600 font-bold text-xs flex items-center gap-0.5">
                  View Details →
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredPlaces.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-stone-200 p-6 space-y-2">
          <p className="font-bold text-stone-800 text-sm">No locations found</p>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Try adjusting your search keywords or switching category filters.
          </p>
          <button
            onClick={() => {
              setSelectedCategory('all');
              setSearch('');
            }}
            className="text-xs text-orange-600 font-bold underline mt-2"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
};
