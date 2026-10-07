import React from 'react';
import { Home, Compass, QrCode, Car, MapPin } from 'lucide-react';
import { NavItem } from './NavItem';

export type RideNavTab = 'home' | 'explore' | 'pass' | 'tour' | 'map';

interface Props {
  active: RideNavTab;
  onChange: (tab: RideNavTab) => void;
  /** Count shown on the Pass item, e.g. active passes. */
  passBadge?: string | number;
}

/**
 * Bar pinned to the bottom of the viewport, with the centre Pass item raised
 * and emphasised.
 *
 * Pass sits third of five so it lands dead centre under the thumb. Icons match
 * the ones the main app's BottomNav already uses for the same destinations, so
 * the two bars stay recognisable as the same product.
 *
 * Swap an entry in `TABS` to change a destination.
 */
const TABS: { id: RideNavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'pass', label: 'Pass', icon: QrCode },
  { id: 'tour', label: 'Tour', icon: Car },
  { id: 'map', label: 'Map', icon: MapPin },
];

export const BottomNavigation: React.FC<Props> = ({ active, onChange, passBadge }) => (
  <nav
    aria-label="Primary"
    className="
      fixed bottom-0 inset-x-0 z-40
      bg-white/95 backdrop-blur border-t border-stone-200
      pb-[env(safe-area-inset-bottom)]
    "
  >
    <div className="mx-auto w-full max-w-md flex items-center justify-around px-2 pt-1.5 pb-1.5">
      {TABS.map((tab) => (
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
