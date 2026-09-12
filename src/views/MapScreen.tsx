import React, { useState } from 'react';
import { 
  MapPin, 
  Layers, 
  Compass, 
  Info, 
  Navigation, 
  HeartHandshake, 
  ShieldCheck,
  Building,
  Car,
  Cross,
  Droplet
} from 'lucide-react';
import { Place } from '../types';
import { SupportedLanguage, translations } from '../i18n';
import { VerificationBadge } from '../components/VerificationBadge';
import { PlaceholderNotice } from '../components/PlaceholderNotice';

interface Props {
  places: Place[];
  currentLanguage: SupportedLanguage;
  onSelectPlace: (placeId: string) => void;
}

export const MapScreen: React.FC<Props> = ({
  places,
  currentLanguage,
  onSelectPlace,
}) => {
  const t = translations[currentLanguage];
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedPin, setSelectedPin] = useState<Place | null>(places[0] || null);

  const mapFilters = [
    { id: 'all', label: 'All Markers' },
    { id: 'temple', label: 'Temples' },
    { id: 'ghat', label: 'Holy Ghats' },
    { id: 'medical', label: 'Medical Camps' },
    { id: 'parking', label: 'Parking Hubs' },
    { id: 'food', label: 'Food / Prasad' },
    { id: 'kumbh_zone', label: 'Kumbh Zones' },
  ];

  const filteredPlaces = places.filter(p => 
    activeFilter === 'all' || p.category === activeFilter
  );

  return (
    <div id="map-screen-view" className="space-y-4 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900">
          Nashik–Trimbakeshwar Pilgrimage Map
        </h2>
        <p className="text-xs sm:text-sm text-stone-500">
          Geographic spatial zones, holy bathing ghats, satellite parking & emergency camps.
        </p>
      </div>

      {/* Honest Architectural Placeholder Notice */}
      <PlaceholderNotice
        title="Interactive Schematic Layout"
        description="This interactive schematic displays verified GPS coordinates for Simhastha 2027. Full raster/vector tile integration with Google Maps Platform or Mapbox GL is structured for seamless activation via server API credentials."
        integrationName="GIS Tile Integration"
      />

      {/* Filter Chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {mapFilters.map(filter => (
          <button
            key={filter.id}
            id={`map-filter-${filter.id}`}
            onClick={() => setActiveFilter(filter.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
              activeFilter === filter.id
                ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Interactive Schematic Map Canvas */}
      <div className="relative w-full h-[420px] sm:h-[480px] bg-stone-900 rounded-3xl border border-stone-800 overflow-hidden shadow-inner flex flex-col justify-between p-4">
        {/* Schematic Grid Lines & River Godavari Curve Effect */}
        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(#f97316_1px,transparent_1px)] [background-size:24px_24px]" />
        
        {/* Godavari River Schematic Ribbon */}
        <div className="absolute top-1/2 left-0 right-0 h-14 -translate-y-1/2 -rotate-6 bg-gradient-to-r from-sky-900/40 via-sky-600/30 to-sky-900/40 border-y border-sky-400/20 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] uppercase font-bold tracking-widest text-sky-300/60 rotate-2">
            Sacred River Godavari (Flowing Eastwards)
          </span>
        </div>

        {/* Sector Labels */}
        <div className="relative z-10 flex items-center justify-between text-[11px] text-stone-400">
          <div className="bg-black/60 px-2.5 py-1 rounded-lg border border-white/10 backdrop-blur-xs">
            <span className="font-bold text-orange-400">WEST:</span> Trimbakeshwar & Brahmagiri (28 km)
          </div>
          <div className="bg-black/60 px-2.5 py-1 rounded-lg border border-white/10 backdrop-blur-xs">
            <span className="font-bold text-orange-400">EAST:</span> Panchavati, Ramkund & Tapovan
          </div>
        </div>

        {/* Interactive Location Node Pins */}
        <div className="relative z-10 flex-1 grid grid-cols-3 sm:grid-cols-4 gap-3 my-auto items-center p-2">
          {filteredPlaces.map((place, idx) => {
            const isSelected = selectedPin?.id === place.id;
            return (
              <button
                key={place.id}
                id={`map-pin-${place.id}`}
                onClick={() => setSelectedPin(place)}
                className={`group flex flex-col items-center p-2 rounded-2xl transition transform active:scale-95 text-center ${
                  isSelected 
                    ? 'bg-orange-500 text-white shadow-lg ring-4 ring-orange-400/30 scale-105' 
                    : 'bg-stone-800/90 hover:bg-stone-700 text-stone-200 border border-stone-700/80 backdrop-blur-xs'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${
                  isSelected ? 'bg-white text-orange-600 font-bold' : 'bg-orange-950 text-orange-400'
                }`}>
                  <MapPin className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold truncate max-w-[85px] leading-tight">
                  {place.name[currentLanguage] || place.name.en}
                </span>
                <span className={`text-[9px] uppercase font-medium mt-0.5 ${
                  isSelected ? 'text-orange-100' : 'text-stone-400'
                }`}>
                  {place.category.replace('_', ' ')}
                </span>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="relative z-10 bg-black/60 border border-white/10 rounded-xl p-2 text-stone-300 text-[10px] flex items-center justify-between flex-wrap gap-2 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span>Panchavati Core</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              <span>Ghat / Kund</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span>Emergency Base</span>
            </span>
          </div>
          <span className="text-stone-400">Tap pin to inspect facility details</span>
        </div>
      </div>

      {/* Selected Location Card Preview */}
      {selectedPin && (
        <div 
          id="map-selected-pin-card"
          className="bg-white border border-stone-200 rounded-2xl p-4 shadow-md flex flex-col sm:flex-row gap-3.5 items-start justify-between"
        >
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-orange-100 text-orange-800">
                {selectedPin.category.toUpperCase()}
              </span>
              <VerificationBadge tier={selectedPin.verificationTier} size="sm" />
            </div>
            <h3 className="font-bold text-stone-900 text-base">
              {selectedPin.name[currentLanguage] || selectedPin.name.en}
            </h3>
            <p className="text-xs text-stone-600 line-clamp-2">
              {selectedPin.description[currentLanguage] || selectedPin.description.en}
            </p>
            <div className="flex items-center gap-2 text-xs text-stone-500 pt-1">
              <span>📍 {selectedPin.location.area}</span>
              <span>•</span>
              <span>🕒 {selectedPin.timings}</span>
            </div>
          </div>

          <div className="flex sm:flex-col gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0">
            <button
              onClick={() => onSelectPlace(selectedPin.id)}
              className="flex-1 sm:flex-none px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-semibold transition"
            >
              Open Full Place Details
            </button>
            <button
              onClick={() => {
                const url = `https://www.google.com/maps/search/?api=1&query=${selectedPin.location.latitude},${selectedPin.location.longitude}`;
                window.open(url, '_blank', 'noopener,noreferrer');
              }}
              className="flex-1 sm:flex-none px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1"
            >
              <Navigation className="w-3.5 h-3.5 text-orange-600" />
              <span>External GPS</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
