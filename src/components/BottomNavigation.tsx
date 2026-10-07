import React from 'react';
import { Home, Compass, QrCode, Car, MapPin } from 'lucide-react';
import { SupportedLanguage, translations } from '../i18n';
import { NavItem } from './NavItem';

export type RideNavTab = 'home' | 'explore' | 'pass' | 'travel' | 'map';

interface Props {
  active: RideNavTab;
  onChange: (tab: RideNavTab) => void;
  /** Count shown on the Pass item, e.g. active passes. */
  passBadge?: string | number;
  currentLanguage?: SupportedLanguage;
}

/**
 * Bar pinned to the bottom of the viewport, with the centre Pass item raised
 * and emphasised.
 *
 * Pass sits third of five so it lands dead centre under the thumb.
 *
 * Labels and icons come from the same source the main app's BottomNav uses, so
 * a destination is never called two different things in two places — and the
 * bar translates into Hindi and Marathi for free.
 *
 * Swap an entry in `tabs` to change a destination.
 */
export const BottomNavigation: React.FC<Props> = ({
  active,
  onChange,
  passBadge,
  currentLanguage = 'en',
}) => {
  const t = translations[currentLanguage];

  const tabs: { id: RideNavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'home', label: t.navHome, icon: Home },
    { id: 'explore', label: t.navExplore, icon: Compass },
    { id: 'pass', label: t.navPass, icon: QrCode },
    { id: 'travel', label: t.navTravel, icon: Car },
    { id: 'map', label: t.navMap, icon: MapPin },
  ];

  return (
    <nav
      aria-label="Primary"
      className="
        fixed bottom-0 inset-x-0 z-40
        bg-white/95 backdrop-blur border-t border-stone-200
        pb-[env(safe-area-inset-bottom)]
      "
    >
      <div className="mx-auto w-full max-w-md flex items-center justify-around px-2 pt-1.5 pb-1.5">
        {tabs.map((tab) => (
          <NavItem
            key={tab.id}
            label={tab.label}
            icon={tab.icon}
            active={active === tab.id}
            emphasized={tab.id === 'pass'}
            badge={tab.id === 'pass' ? passBadge : undefined}
            onClick={() => onChange(tab.id)}
          />
        ))}
      </div>
    </nav>
  );
};
