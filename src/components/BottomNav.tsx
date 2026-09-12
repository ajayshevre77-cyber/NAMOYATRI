import React from 'react';
import { 
  Home, 
  Compass, 
  Car, 
  QrCode, 
  User, 
  AlertTriangle, 
  HeartHandshake, 
  Users, 
  Sparkles,
  MapPin
} from 'lucide-react';
import { SupportedLanguage, translations } from '../i18n';

export type TouristTab = 
  | 'home' 
  | 'explore' 
  | 'travel' 
  | 'pass' 
  | 'volunteers' 
  | 'map' 
  | 'family' 
  | 'safety' 
  | 'lost_found' 
  | 'fraud_alert'
  | 'account';

interface Props {
  activeTab: TouristTab;
  onSelectTab?: (tab: TouristTab) => void;
  onTabChange?: (tab: TouristTab) => void;
  currentLanguage: SupportedLanguage;
  activePassCount?: number;
}

export const BottomNav: React.FC<Props> = ({
  activeTab,
  onSelectTab,
  onTabChange,
  currentLanguage,
  activePassCount = 1,
}) => {
  const t = translations[currentLanguage];

  const primaryTabs: { id: TouristTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'home', label: t.navHome, icon: Home },
    { id: 'explore', label: t.navExplore, icon: Compass },
    { id: 'travel', label: t.navTravel, icon: Car },
    { id: 'pass', label: t.navPass, icon: QrCode },
    { id: 'map', label: t.navMap, icon: MapPin },
  ];

  const handleSelect = (tabId: TouristTab) => {
    if (typeof onSelectTab === 'function') {
      onSelectTab(tabId);
    }
    if (typeof onTabChange === 'function') {
      onTabChange(tabId);
    }
  };

  return (
    <nav 
      id="tourist-bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 shadow-lg"
    >
      <div className="max-w-md mx-auto px-3 flex items-center justify-around h-16">
        {primaryTabs.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-tab-${item.id}`}
              onClick={() => handleSelect(item.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition relative ${
                isActive ? 'text-orange-600 font-bold' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
                {item.id === 'pass' && activePassCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-orange-600 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {activePassCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight whitespace-nowrap">
                {item.label}
              </span>
              {isActive && (
                <span className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-8 h-0.5 bg-orange-600 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
