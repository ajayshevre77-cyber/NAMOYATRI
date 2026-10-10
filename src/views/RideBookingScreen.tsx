import React, { useState } from 'react';
import { TransportOption } from '../types';
import { MOCK_TRANSPORT_OPTIONS } from '../data/kumbhData';
import { AdPanel } from '../components/AdPanel';
import { RideRequestPanel } from '../components/RideRequestPanel';
import { BottomNavigation, RideNavTab } from '../components/BottomNavigation';

interface Props {
  transportOptions?: TransportOption[];
  /** Count rendered on the Pass tab. */
  passCount?: number;
  onNavigate?: (tab: RideNavTab) => void;
}

/**
 * Full-viewport ride booking page: advertisement slot, booking form, and a
 * fixed bottom bar. Content scrolls beneath the bar; on desktop it stays
 * centred in a phone-width column rather than stretching.
 *
 * The form and its result come from RideRequestPanel, the same flow the
 * Travel tab uses.
 */
export const RideBookingScreen: React.FC<Props> = ({
  transportOptions = MOCK_TRANSPORT_OPTIONS,
  passCount,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<RideNavTab>('pass');

  const handleNavigate = (tab: RideNavTab) => {
    setActiveTab(tab);
    onNavigate?.(tab);
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4 pb-32 space-y-4">
        {/* 1 — Advertisement */}
        <AdPanel placeholderLabel="Advertisement" />

        {/* 2 — Ride request */}
        <RideRequestPanel transportOptions={transportOptions} />
      </main>

      {/* 3 — Fixed bottom navigation */}
      <BottomNavigation active={activeTab} onChange={handleNavigate} passBadge={passCount} />
    </div>
  );
};
