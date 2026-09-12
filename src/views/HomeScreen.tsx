import React, { useState } from 'react';
import { 
  Search, 
  MapPin, 
  Compass, 
  Car, 
  QrCode, 
  HeartHandshake, 
  AlertTriangle, 
  Users, 
  SearchX, 
  Building, 
  Bell, 
  Map, 
  Droplet, 
  Cross, 
  Sparkles, 
  Calendar, 
  ChevronRight,
  ShieldCheck,
  PhoneCall,
  Clock
} from 'lucide-react';
import { SupportedLanguage, translations } from '../i18n';
import { OfficialAnnouncement, Place } from '../types';
import { VerificationBadge } from '../components/VerificationBadge';
import { SIMHASTHA_DESTINATION } from '../data/kumbhData';
import { TouristTab } from '../components/BottomNav';

interface Props {
  currentLanguage: SupportedLanguage;
  onNavigateTab: (tab: TouristTab) => void;
  onOpenPlace: (placeId: string) => void;
  onOpenSOS: () => void;
  onOpenAI: () => void;
  announcements: OfficialAnnouncement[];
  places: Place[];
}

export const HomeScreen: React.FC<Props> = ({
  currentLanguage,
  onNavigateTab,
  onOpenPlace,
  onOpenSOS,
  onOpenAI,
  announcements,
  places,
}) => {
  const t = translations[currentLanguage];
  const [searchQuery, setSearchQuery] = useState('');

  const quickActions: {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    tab?: TouristTab;
    action?: () => void;
    color: string;
    badge?: string;
  }[] = [
    { id: 'places', label: t.qaExplorePlaces, icon: Compass, tab: 'explore', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    { id: 'transport', label: t.qaFindTransport, icon: Car, tab: 'travel', color: 'bg-amber-50 text-amber-800 border-amber-200' },
    { id: 'pass', label: t.qaMyPass, icon: QrCode, tab: 'pass', color: 'bg-emerald-50 text-emerald-800 border-emerald-200', badge: 'Active' },
    { id: 'volunteer', label: t.qaFindVolunteer, icon: HeartHandshake, tab: 'volunteers', color: 'bg-sky-50 text-sky-800 border-sky-200' },
    { id: 'sos', label: t.qaEmergencySos, icon: AlertTriangle, action: onOpenSOS, color: 'bg-red-50 text-red-700 border-red-200', badge: '24x7' },
    { id: 'family', label: t.qaFamilySafety, icon: Users, tab: 'family', color: 'bg-purple-50 text-purple-800 border-purple-200' },
    { id: 'lost_found', label: t.qaLostFound, icon: SearchX, tab: 'lost_found', color: 'bg-rose-50 text-rose-800 border-rose-200' },
    { id: 'facilities', label: t.qaNearbyFacilities, icon: Building, tab: 'explore', color: 'bg-teal-50 text-teal-800 border-teal-200' },
    { id: 'map', label: t.navMap, icon: Map, tab: 'map', color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
    { id: 'ai', label: 'Namo AI Assistant', icon: Sparkles, action: onOpenAI, color: 'bg-amber-100 text-amber-900 border-amber-300', badge: 'AI' },
  ];

  // Filtered places if search query is entered
  const filteredQuickPlaces = searchQuery.trim()
    ? places.filter(p => 
        p.name[currentLanguage]?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name.en.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.location.area.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div id="home-screen-view" className="space-y-5 pb-10">
      {/* Hero Greeting & Destination Card */}
      <section className="bg-gradient-to-br from-stone-900 via-stone-850 to-orange-950 text-stone-100 rounded-3xl p-5 sm:p-7 shadow-lg border border-stone-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-orange-400 animate-ping" />
            <span>Nashik–Trimbakeshwar Simhastha 2027</span>
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-serif font-black text-white leading-tight">
              {t.welcomeGreeting}
            </h2>
            <p className="text-xs sm:text-sm text-stone-300 mt-1 max-w-xl">
              {t.greetingSubtitle}
            </p>
          </div>

          {/* Shahi Snan Dates Highlight */}
          <div className="pt-2">
            <div className="flex items-center gap-2 text-xs text-orange-200 font-semibold mb-1.5">
              <Calendar className="w-3.5 h-3.5 text-orange-400" />
              <span>Key Shahi Snan Dates (Ramkund & Kushavarta):</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SIMHASTHA_DESTINATION.nextShahiSnanDates.map((snan, idx) => (
                <div 
                  key={idx} 
                  className="bg-black/30 backdrop-blur-xs p-2 rounded-xl border border-white/10 text-xs"
                >
                  <p className="text-stone-300 font-medium truncate">{snan.title}</p>
                  <p className="text-orange-400 font-bold">{snan.date}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Search Input */}
          <div className="pt-2 relative">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5" />
              <input
                id="home-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full bg-stone-800/90 text-stone-100 placeholder-stone-400 text-xs sm:text-sm rounded-xl pl-10 pr-4 py-2.5 border border-stone-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Quick search dropdown results */}
            {searchQuery.trim() && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white text-stone-900 rounded-xl shadow-xl border border-stone-200 max-h-60 overflow-y-auto z-30 p-2 space-y-1">
                {filteredQuickPlaces.length === 0 ? (
                  <p className="text-xs text-stone-500 p-2">No matching temples, ghats, or facilities found.</p>
                ) : (
                  filteredQuickPlaces.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => {
                        onOpenPlace(pl.id);
                        setSearchQuery('');
                      }}
                      className="w-full text-left p-2 rounded-lg hover:bg-stone-100 flex items-center justify-between text-xs transition"
                    >
                      <div>
                        <p className="font-semibold text-stone-900">{pl.name[currentLanguage] || pl.name.en}</p>
                        <p className="text-stone-500 text-[11px]">{pl.location.area} • {pl.category}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-stone-400" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Quick Actions Grid */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-stone-700">
            Quick Pilgrim Services
          </h3>
          <span className="text-[11px] text-stone-500">Kumbh Mobility Network</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                id={`qa-btn-${action.id}`}
                onClick={() => {
                  if (action.action) action.action();
                  else if (action.tab) onNavigateTab(action.tab);
                }}
                className={`flex flex-col items-center justify-center text-center p-3 rounded-2xl border transition-all hover:shadow-sm active:scale-98 ${action.color}`}
              >
                <div className="relative mb-1.5">
                  <Icon className="w-5 h-5" />
                  {action.badge && (
                    <span className="absolute -top-1.5 -right-3 bg-stone-900 text-white text-[8px] font-bold px-1.5 py-0.2 rounded-full">
                      {action.badge}
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold leading-tight">
                  {action.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Official Updates / Kumbh Administration Announcements */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-orange-100 text-orange-700">
              <Bell className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-800">
              Announcements & Advisories
            </h3>
          </div>
          <span className="text-[11px] font-medium text-stone-600 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-full">
            Source Provenance Active
          </span>
        </div>

        <div className="space-y-2">
          {announcements.map((ann) => {
            const isDemo = ann.sourceType === 'DEMO' || !ann.sourceType;
            const isOfficial = ann.sourceType === 'AUTHORIZED_OFFICIAL';

            return (
              <div 
                key={ann.id}
                id={`announcement-card-${ann.id}`}
                className={`p-3.5 bg-white border rounded-2xl shadow-xs space-y-2 ${
                  isDemo ? 'border-amber-200' : 'border-stone-200'
                }`}
              >
                {/* Transparency banner for Demo or Simulation data */}
                {isDemo && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 font-medium flex items-center justify-between">
                    <span className="font-bold">DEMO DATA — Not an official announcement</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-amber-200/60 rounded text-amber-900">Prototype Demo</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${
                    ann.priority === 'advisory' 
                      ? 'bg-amber-100 text-amber-800' 
                      : ann.priority === 'high_alert' 
                      ? 'bg-red-100 text-red-800' 
                      : 'bg-sky-100 text-sky-800'
                  }`}>
                    {ann.priority}
                  </span>
                  <span className="text-[11px] text-stone-400">{ann.publishedAt}</span>
                </div>

                <h4 className="font-bold text-stone-900 text-xs sm:text-sm">
                  {ann.title[currentLanguage] || ann.title.en}
                </h4>
                <p className="text-stone-600 text-xs leading-relaxed">
                  {ann.summary[currentLanguage] || ann.summary.en}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500 pt-1.5 border-t border-stone-100">
                  <span className="font-medium">
                    Source: {ann.sourceName || ann.issuedBy || 'Prototype System'}
                  </span>
                  
                  {isOfficial ? (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Authorized Official Notice
                    </span>
                  ) : (
                    <span className="text-stone-500 font-medium">
                      Status: {ann.sourceType || 'DEMO'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Nearby Sacred Sites & Critical Facilities */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-stone-800">
            Featured Sacred Places & Hubs
          </h3>
          <button
            onClick={() => onNavigateTab('explore')}
            className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-0.5"
          >
            <span>View All ({places.length})</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {places.slice(0, 4).map((place) => (
            <div
              key={place.id}
              onClick={() => onOpenPlace(place.id)}
              className="bg-white border border-stone-200 rounded-2xl p-3 flex gap-3 cursor-pointer hover:border-orange-300 hover:shadow-sm transition"
            >
              <img
                src={place.imageUrl}
                alt={place.name[currentLanguage] || place.name.en}
                referrerPolicy="no-referrer"
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shrink-0 bg-stone-200"
              />
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 truncate">
                      {place.category}
                    </span>
                    <VerificationBadge tier={place.verificationTier} size="sm" showLabel={false} />
                  </div>
                  <h4 className="font-bold text-stone-900 text-xs sm:text-sm truncate">
                    {place.name[currentLanguage] || place.name.en}
                  </h4>
                  <p className="text-stone-500 text-[11px] truncate mt-0.5">
                    {place.location.area}
                  </p>
                </div>
                <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1 border-t border-stone-100">
                  <span>~{place.distanceKmPlaceholder} km away</span>
                  <span className="text-orange-600 font-semibold text-[10px]">Details →</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Production Architecture & Transparency Footer */}
      <section className="p-3.5 rounded-2xl bg-stone-100/90 border border-stone-200 text-stone-600 text-xs space-y-1">
        <p className="font-bold text-stone-800">
          Namo Yatri Simhastha Kumbh 2027 Production Architecture
        </p>
        <p className="leading-relaxed">
          Official information, emergency tickets, transport schedules, and crowd alerts connect to the Nashik District Emergency Operations Center (DEOC) & Kumbh Control Cell. External bank gateways and live GIS tracking are structured via modular interfaces.
        </p>
      </section>
    </div>
  );
};
