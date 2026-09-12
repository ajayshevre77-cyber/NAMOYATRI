import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  Clock, 
  Share2, 
  Bookmark, 
  Navigation, 
  HeartHandshake, 
  Check, 
  Layers,
  Sparkles 
} from 'lucide-react';
import { Place } from '../types';
import { SupportedLanguage, translations } from '../i18n';
import { VerificationBadge } from './VerificationBadge';

interface Props {
  place: Place | null;
  onClose: () => void;
  currentLanguage: SupportedLanguage;
  onRequestVolunteer: (place: Place) => void;
  onSavePlace: (placeId: string) => void;
  isSaved?: boolean;
}

export const PlaceDetailModal: React.FC<Props> = ({
  place,
  onClose,
  currentLanguage,
  onRequestVolunteer,
  onSavePlace,
  isSaved = false,
}) => {
  const [copied, setCopied] = useState(false);

  if (!place) return null;
  const t = translations[currentLanguage];

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`${place.name.en} - Nashik–Trimbakeshwar Simhastha Kumbh 2027 (Namo Yatri)`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDirections = () => {
    // Open directions in external mapping service using legitimate coordinates
    const url = `https://www.google.com/maps/search/?api=1&query=${place.location.latitude},${place.location.longitude}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div 
      id="place-detail-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div 
        id="place-detail-modal-container"
        className="bg-white w-full max-w-xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-stone-200 animate-in zoom-in-95 duration-150"
      >
        {/* Modal Image Header */}
        <div className="relative h-48 sm:h-56 bg-stone-900 overflow-hidden shrink-0">
          <img 
            src={place.imageUrl} 
            alt={place.name[currentLanguage] || place.name.en}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover brightness-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Close button */}
          <button
            id="close-place-detail-btn"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white hover:bg-black/80 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Verification Badge */}
          <div className="absolute top-3 left-3">
            <VerificationBadge tier={place.verificationTier} size="md" />
          </div>

          {/* Place Title on image */}
          <div className="absolute bottom-3 left-3 right-3 text-white">
            <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-orange-600/90 text-white inline-block mb-1">
              {place.category.toUpperCase().replace('_', ' ')}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold font-serif leading-tight text-white drop-shadow-xs">
              {place.name[currentLanguage] || place.name.en}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-stone-200 mt-1">
              <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span>{place.location.area}</span>
              <span>•</span>
              <span>~{place.distanceKmPlaceholder} km from central hub</span>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-stone-800 text-sm leading-relaxed">
          {/* Quick Action Bar */}
          <div className="flex items-center gap-2 pb-3 border-b border-stone-200">
            <button
              id="directions-btn"
              onClick={handleDirections}
              className="flex-1 flex items-center justify-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-3 rounded-xl transition text-xs sm:text-sm"
            >
              <Navigation className="w-4 h-4" />
              <span>{t.getDirections}</span>
            </button>
            <button
              id="save-place-btn"
              onClick={() => onSavePlace(place.id)}
              className={`flex items-center gap-1.5 py-2 px-3 rounded-xl border transition text-xs sm:text-sm font-medium ${
                isSaved 
                  ? 'bg-amber-50 border-amber-300 text-amber-900' 
                  : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-amber-600 text-amber-600' : ''}`} />
              <span className="hidden sm:inline">{isSaved ? 'Saved' : t.savePlace}</span>
            </button>
            <button
              id="share-place-btn"
              onClick={handleShare}
              className="flex items-center gap-1.5 py-2 px-3 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 transition text-xs sm:text-sm font-medium"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{copied ? 'Copied' : t.sharePlace}</span>
            </button>
          </div>

          {/* Description */}
          <div>
            <h3 className="font-semibold text-stone-900 mb-1 text-sm">About This Sacred Site</h3>
            <p className="text-stone-600">
              {place.description[currentLanguage] || place.description.en}
            </p>
          </div>

          {/* Historical Importance */}
          {place.historicalImportance && (
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-amber-950">
              <h3 className="font-semibold text-amber-900 text-xs sm:text-sm mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>{t.historicalImportance}</span>
              </h3>
              <p className="text-amber-900/90 text-xs sm:text-sm leading-normal">
                {place.historicalImportance[currentLanguage] || place.historicalImportance.en}
              </p>
            </div>
          )}

          {/* Timings & Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
              <div className="flex items-center gap-1.5 font-semibold text-stone-900 mb-1">
                <Clock className="w-3.5 h-3.5 text-orange-600" />
                <span>{t.darshanTimings}</span>
              </div>
              <p className="text-stone-600">{place.timings}</p>
            </div>
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
              <div className="flex items-center gap-1.5 font-semibold text-stone-900 mb-1">
                <MapPin className="w-3.5 h-3.5 text-orange-600" />
                <span>Official Address</span>
              </div>
              <p className="text-stone-600 truncate">{place.location.address}</p>
            </div>
          </div>

          {/* Facilities */}
          {place.facilities && place.facilities.length > 0 && (
            <div>
              <h3 className="font-semibold text-stone-900 mb-1.5 text-xs sm:text-sm">
                {t.facilitiesAvailable}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {place.facilities.map((fac, idx) => (
                  <span 
                    key={idx}
                    className="px-2.5 py-1 rounded-lg bg-stone-100 border border-stone-200 text-stone-700 text-xs font-medium"
                  >
                    ✓ {fac}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Request Volunteer for this location */}
          <div className="pt-2 border-t border-stone-200">
            <button
              id="request-volunteer-here-btn"
              onClick={() => onRequestVolunteer(place)}
              className="w-full flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white font-semibold py-2.5 px-4 rounded-xl transition text-xs sm:text-sm"
            >
              <HeartHandshake className="w-4 h-4 text-orange-400" />
              <span>{t.requestVolunteerHere}</span>
            </button>
            <p className="text-[11px] text-center text-stone-500 mt-1">
              Connect with Namo Verified & District Empanelled Seva volunteers assigned to this zone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
