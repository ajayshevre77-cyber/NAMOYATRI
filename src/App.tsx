import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { 
  UserRole, 
  Place, 
  MobilityPassProduct, 
  UserPass, 
  TransportOption, 
  Volunteer, 
  OfficialAnnouncement, 
  FraudAlert 
} from './types';
import { SupportedLanguage } from './i18n';
import {
  MOCK_PLACES,
  MOCK_PASS_PRODUCTS,
  MOCK_TRANSPORT_OPTIONS,
  MOCK_VOLUNTEERS, 
  MOCK_ANNOUNCEMENTS, 
  MOCK_FRAUD_ALERTS 
} from './data/kumbhData';

// Components
import { Header } from './components/Header';
import { BottomNav, TouristTab } from './components/BottomNav';
import { PlaceDetailModal } from './components/PlaceDetailModal';
import { NamoAIChatModal } from './components/NamoAIChatModal';
import { AuthModal } from './components/AuthModal';
import { AuthProvider, useAuth } from './context/AuthContext';

// Views
import { HomeScreen } from './views/HomeScreen';
import { ExploreScreen } from './views/ExploreScreen';
import { TravelScreen } from './views/TravelScreen';
import { PassScreen } from './views/PassScreen';
import { VolunteerScreen } from './views/VolunteerScreen';
import { FamilySafetyScreen } from './views/FamilySafetyScreen';
import { SafetySOSScreen } from './views/SafetySOSScreen';
import { LostAndFoundScreen } from './views/LostAndFoundScreen';
import { FraudAlertScreen } from './views/FraudAlertScreen';
import { AccountSecurityView } from './views/AccountSecurityView';
import { DataFeedNotice } from './components/DataFeedNotice';
import { fetchCollection, getAuthHeader } from './lib/api';
import { RideDraft } from './lib/rides';
import type { MapJump } from './views/MapScreen';

// Role Dashboards
import { DriverDashboard } from './views/DriverDashboard';
import { VolunteerDashboard } from './views/VolunteerDashboard';
import { BusinessDashboard } from './views/BusinessDashboard';
import { AdminOperationsDashboard } from './views/AdminOperationsDashboard';
import { SIMHASTHA_DESTINATION } from './data/kumbhData';

// The map pulls in Leaflet, so it loads only when the Map tab is opened. If
// that download fails (e.g. offline), say so instead of crashing the app.
const MapScreen = lazy(() =>
  import('./views/MapScreen')
    .then(m => ({ default: m.MapScreen }))
    .catch(() => ({
      default: () => (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          The map could not be loaded. Check your connection, then reload the page.
        </p>
      ),
    }))
);

function AppContent({ initialTab = 'home' }: { initialTab?: TouristTab }) {
  const { authModalOpen, authModalReason, closeAuthModal, userProfile, firebaseUser } = useAuth();
  const [currentRole, setCurrentRole] = useState<UserRole>('tourist');
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>('en');
  const [activeTab, setActiveTab] = useState<TouristTab>(initialTab);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [savedPlaceIds, setSavedPlaceIds] = useState<string[]>([]);
  const [isNamoAIOpen, setIsNamoAIOpen] = useState(false);
  // "Search on map" from Home or Explore: the Map tab runs this search once.
  const [mapSearch, setMapSearch] = useState<{ query: string } | null>(null);
  const searchOnMap = (query: string) => {
    setMapSearch({ query });
    setActiveTab('map');
  };
  // Opening the Map tab at one part of it, once: the trip planner ("Plan a
  // trip" on Home), or a place or trip day (from the ride form).
  const [mapJump, setMapJump] = useState<MapJump | null>(null);
  const goToMap = (jump: MapJump) => {
    setMapJump(jump);
    setActiveTab('map');
  };
  const planTrip = () => goToMap({ to: 'trip-planner' });
  // "Request a ride (demo)" on the map or a trip stop: the Travel tab's ride
  // form opens with that place filled in. It stays until another hand-over.
  const [rideDraft, setRideDraft] = useState<RideDraft | null>(null);
  const startRide = (draft: Omit<RideDraft, 'id'>) => {
    setRideDraft({ ...draft, id: Date.now() });
    setActiveTab('travel');
  };
  // The map mounts on its first visit and is then only hidden, so a trip
  // plan, a route or a selected place is still there after another tab.
  const [mapOpened, setMapOpened] = useState(initialTab === 'map');
  useEffect(() => {
    if (activeTab === 'map') setMapOpened(true);
  }, [activeTab]);

  // Sync role if updated in profile
  useEffect(() => {
    if (userProfile?.role) {
      const r = userProfile.role.toLowerCase() as UserRole;
      if (['tourist', 'driver', 'volunteer', 'business', 'admin', 'operations'].includes(r)) {
        setCurrentRole(r);
      }
    }
  }, [userProfile?.role]);

  // Data states initialized with mock defaults and refreshed via API
  const [places, setPlaces] = useState<Place[]>(MOCK_PLACES);
  const [passProducts, setPassProducts] = useState<MobilityPassProduct[]>(MOCK_PASS_PRODUCTS);
  // Starts empty, never with sample data: a pass shown here is presented to the
  // visitor as their own, so it must come from the server for the signed-in user.
  const [userPasses, setUserPasses] = useState<UserPass[]>([]);
  const passesRequestId = useRef(0);
  const [transportOptions, setTransportOptions] = useState<TransportOption[]>(MOCK_TRANSPORT_OPTIONS);
  const [volunteers, setVolunteers] = useState<Volunteer[]>(MOCK_VOLUNTEERS);
  const [announcements, setAnnouncements] = useState<OfficialAnnouncement[]>(MOCK_ANNOUNCEMENTS);
  const [fraudAlerts, setFraudAlerts] = useState<FraudAlert[]>(MOCK_FRAUD_ALERTS);

  // Which live feeds failed to load, by display name. Drives DataFeedNotice.
  const [failedFeeds, setFailedFeeds] = useState<string[]>([]);
  const [feedsRetrying, setFeedsRetrying] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  /**
   * Replaces the bundled mock data with whatever the API can serve.
   *
   * Each feed is independent: one failure must not stop the others, so they
   * settle separately and the failures are collected rather than discarded.
   */
  const loadFeeds = useCallback(async () => {
    const feeds = [
      { label: 'Places', run: () => fetchCollection<Place>('/api/places', 'places').then(setPlaces) },
      { label: 'Pass products', run: () => fetchCollection<MobilityPassProduct>('/api/passes/products', 'products').then(setPassProducts) },
      {
        label: 'Your passes',
        run: async () => {
          // Only the latest request may write: after a sign-out, a slow reply
          // for the previous user must not land in the next user's view.
          const request = ++passesRequestId.current;
          const passes = await fetchCollection<UserPass>('/api/passes/user-passes', 'passes', {
            headers: await getAuthHeader(),
          });
          if (request === passesRequestId.current) setUserPasses(passes);
        },
      },
      { label: 'Announcements', run: () => fetchCollection<OfficialAnnouncement>('/api/announcements', 'announcements').then(setAnnouncements) },
      { label: 'Volunteers', run: () => fetchCollection<Volunteer>('/api/volunteers', 'volunteers').then(setVolunteers) },
    ];

    const results = await Promise.allSettled(feeds.map(feed => feed.run()));

    const failed = feeds
      .filter((feed, i) => {
        const result = results[i];
        if (result.status !== 'rejected') return false;
        console.error(
          `[Namo Yatri] "${feed.label}" could not be loaded; showing bundled sample data instead.`,
          result.reason,
        );
        return true;
      })
      .map(feed => feed.label);

    setFailedFeeds(failed);
    return failed;
  }, []);

  // Reload on sign-in and sign-out too, so "Your passes" always belongs to
  // whoever is signed in now and is cleared for a guest. The old list is
  // dropped at once: if the reload is slow or fails, the previous user's
  // passes must not stay on screen as the new user's.
  useEffect(() => {
    setUserPasses([]);
    loadFeeds();
  }, [loadFeeds, firebaseUser?.uid]);

  // The server never moves a pass to 'expired', so the expiry time is checked too.
  const activePassCount = userPasses.filter(p => {
    const expiresAt = p.qrSecureTokenSpec?.expiresAt;
    return p.status === 'active' && !(expiresAt && Date.parse(expiresAt) <= Date.now());
  }).length;

  const handleRetryFeeds = async () => {
    setFeedsRetrying(true);
    try {
      const stillFailing = await loadFeeds();
      if (stillFailing.length === 0) setNoticeDismissed(false);
    } finally {
      setFeedsRetrying(false);
    }
  };

  const selectedPlace = places.find(p => p.id === selectedPlaceId) || null;

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-col font-sans selection:bg-orange-500 selection:text-white">
      {/* Top Application Header */}
      <Header
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        currentLanguage={currentLanguage}
        onLanguageChange={setCurrentLanguage}
        onOpenSOS={() => setActiveTab('safety')}
        onOpenAI={() => setIsNamoAIOpen(true)}
        onOpenAccount={() => {
          setCurrentRole('tourist');
          setActiveTab('account');
        }}
        activeDestination={SIMHASTHA_DESTINATION.name}
      />

      {/* Main Content Area */}
      {/* On phones, bottom padding clears the fixed 4rem nav. From sm up, each
          view's own bottom padding makes up the rest. */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-3.5 sm:px-6 pt-4 pb-20 sm:pb-12">
        {/* Honest notice when the API could not be reached and mock data is showing */}
        {failedFeeds.length > 0 && !noticeDismissed && (
          <div className="mb-4">
            <DataFeedNotice
              failed={failedFeeds}
              retrying={feedsRetrying}
              onRetry={handleRetryFeeds}
              onDismiss={() => setNoticeDismissed(true)}
            />
          </div>
        )}

        {/* Tourist Pilgrim App Views */}
        {currentRole === 'tourist' && (
          <>
            {activeTab === 'home' && (
              <HomeScreen
                currentLanguage={currentLanguage}
                onNavigateTab={setActiveTab}
                onOpenPlace={(id) => setSelectedPlaceId(id)}
                onSearchMap={searchOnMap}
                onPlanTrip={planTrip}
                onOpenSOS={() => setActiveTab('safety')}
                onOpenAI={() => setIsNamoAIOpen(true)}
                announcements={announcements}
                places={places}
                activePassCount={activePassCount}
              />
            )}

            {activeTab === 'explore' && (
              <ExploreScreen
                places={places}
                currentLanguage={currentLanguage}
                onSelectPlace={(id) => setSelectedPlaceId(id)}
                onSearchMap={searchOnMap}
              />
            )}

            {(activeTab === 'map' || mapOpened) && (
              <div hidden={activeTab !== 'map'}>
                <Suspense fallback={<p className="py-12 text-center text-sm text-stone-500">Loading map…</p>}>
                  <MapScreen
                    places={places}
                    currentLanguage={currentLanguage}
                    onSelectPlace={(id) => setSelectedPlaceId(id)}
                    initialSearch={mapSearch}
                    onInitialSearchHandled={() => setMapSearch(null)}
                    active={activeTab === 'map'}
                    jump={mapJump}
                    onJumpDone={() => setMapJump(null)}
                    onRequestRide={startRide}
                  />
                </Suspense>
              </div>
            )}

            {activeTab === 'travel' && (
              <TravelScreen
                transportOptions={transportOptions}
                currentLanguage={currentLanguage}
                onOpenPassTab={() => setActiveTab('pass')}
                rideDraft={rideDraft}
                onReturnToMap={goToMap}
              />
            )}

            {activeTab === 'pass' && (
              <PassScreen
                passProducts={passProducts}
                userPasses={userPasses}
                currentLanguage={currentLanguage}
                onPassPurchased={(newPass) => {
                  setUserPasses(prev => [newPass, ...prev]);
                }}
              />
            )}

            {activeTab === 'volunteers' && (
              <VolunteerScreen
                volunteers={volunteers}
                currentLanguage={currentLanguage}
              />
            )}

            {activeTab === 'family' && (
              <FamilySafetyScreen
                currentLanguage={currentLanguage}
              />
            )}

            {activeTab === 'safety' && (
              <SafetySOSScreen
                currentLanguage={currentLanguage}
                onOpenLostAndFound={() => setActiveTab('lost_found')}
              />
            )}

            {activeTab === 'lost_found' && (
              <LostAndFoundScreen
                currentLanguage={currentLanguage}
              />
            )}

            {activeTab === 'fraud_alert' && (
              <FraudAlertScreen
                fraudAlerts={fraudAlerts}
                currentLanguage={currentLanguage}
              />
            )}

            {activeTab === 'account' && (
              <AccountSecurityView
                currentLanguage={currentLanguage}
                onNavigateTab={setActiveTab}
              />
            )}
          </>
        )}

        {/* Role: Driver Partner */}
        {currentRole === 'driver' && (
          <DriverDashboard currentLanguage={currentLanguage} />
        )}

        {/* Role: Field Volunteer */}
        {currentRole === 'volunteer' && (
          <VolunteerDashboard currentLanguage={currentLanguage} />
        )}

        {/* Role: Local Business */}
        {currentRole === 'business' && (
          <BusinessDashboard currentLanguage={currentLanguage} />
        )}

        {/* Role: Admin & Operations */}
        {(currentRole === 'admin' || currentRole === 'operations') && (
          <AdminOperationsDashboard
            announcements={announcements}
            onAddAnnouncement={(newAnn) => setAnnouncements(prev => [newAnn, ...prev])}
            currentLanguage={currentLanguage}
          />
        )}
      </main>

      {/* Namo AI opens from the header button (every screen size) and the Home
          "Namo AI Assistant" tile. There is no floating button: it covered
          Home tiles, place cards and the ride form. */}

      {/* Bottom Navigation for Tourist mode */}
      {currentRole === 'tourist' && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onSelectTab={setActiveTab}
          currentLanguage={currentLanguage}
          activePassCount={activePassCount}
        />
      )}

      {/* Place Detail Modal */}
      <PlaceDetailModal
        place={selectedPlace}
        onClose={() => setSelectedPlaceId(null)}
        currentLanguage={currentLanguage}
        isSaved={!!selectedPlace && savedPlaceIds.includes(selectedPlace.id)}
        onSavePlace={(placeId) => {
          setSavedPlaceIds(prev =>
            prev.includes(placeId)
              ? prev.filter(id => id !== placeId)
              : [...prev, placeId]
          );
        }}
        onRequestVolunteer={() => {
          setSelectedPlaceId(null);
          setActiveTab('volunteers');
        }}
      />

      {/* Namo AI Chat Modal */}
      <NamoAIChatModal
        isOpen={isNamoAIOpen}
        onClose={() => setIsNamoAIOpen(false)}
        currentLanguage={currentLanguage}
      />

      {/* Global Authentication Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={closeAuthModal}
        reason={authModalReason}
        currentLanguage={currentLanguage}
      />
    </div>
  );
}

export default function App() {
  // `?screen=ride` used to open a separate ride booking page. That page is now
  // the Travel tab, so old links open the normal app there instead.
  const screen =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('screen');

  return (
    <AuthProvider>
      <AppContent initialTab={screen === 'ride' ? 'travel' : 'home'} />
    </AuthProvider>
  );
}
