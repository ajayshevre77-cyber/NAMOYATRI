import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, AlertTriangle, ShieldCheck } from 'lucide-react';
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
  MOCK_USER_PASSES, 
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
import { MapScreen } from './views/MapScreen';
import { TravelScreen } from './views/TravelScreen';
import { PassScreen } from './views/PassScreen';
import { VolunteerScreen } from './views/VolunteerScreen';
import { FamilySafetyScreen } from './views/FamilySafetyScreen';
import { SafetySOSScreen } from './views/SafetySOSScreen';
import { LostAndFoundScreen } from './views/LostAndFoundScreen';
import { FraudAlertScreen } from './views/FraudAlertScreen';
import { AccountSecurityView } from './views/AccountSecurityView';
import { RideBookingScreen } from './views/RideBookingScreen';
import { DataFeedNotice } from './components/DataFeedNotice';
import { fetchCollection } from './lib/api';

// Role Dashboards
import { DriverDashboard } from './views/DriverDashboard';
import { VolunteerDashboard } from './views/VolunteerDashboard';
import { BusinessDashboard } from './views/BusinessDashboard';
import { AdminOperationsDashboard } from './views/AdminOperationsDashboard';
import { SIMHASTHA_DESTINATION } from './data/kumbhData';

function AppContent() {
  const { authModalOpen, authModalReason, closeAuthModal, userProfile } = useAuth();
  const [currentRole, setCurrentRole] = useState<UserRole>('tourist');
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>('en');
  const [activeTab, setActiveTab] = useState<TouristTab>('home');
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [savedPlaceIds, setSavedPlaceIds] = useState<string[]>([]);
  const [isNamoAIOpen, setIsNamoAIOpen] = useState(false);

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
  const [userPasses, setUserPasses] = useState<UserPass[]>(MOCK_USER_PASSES);
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
      { label: 'Your passes', run: () => fetchCollection<UserPass>('/api/passes/user-passes', 'passes').then(setUserPasses) },
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

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

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
                onOpenSOS={() => setActiveTab('safety')}
                onOpenAI={() => setIsNamoAIOpen(true)}
                announcements={announcements}
                places={places}
              />
            )}

            {activeTab === 'explore' && (
              <ExploreScreen
                places={places}
                currentLanguage={currentLanguage}
                onSelectPlace={(id) => setSelectedPlaceId(id)}
              />
            )}

            {activeTab === 'map' && (
              <MapScreen
                places={places}
                currentLanguage={currentLanguage}
                onSelectPlace={(id) => setSelectedPlaceId(id)}
              />
            )}

            {activeTab === 'travel' && (
              <TravelScreen
                transportOptions={transportOptions}
                currentLanguage={currentLanguage}
                onOpenPassTab={() => setActiveTab('pass')}
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

      {/* Floating Namo AI Assistant Button (for quick access) */}
      <button
        id="floating-namo-ai-btn"
        onClick={() => setIsNamoAIOpen(true)}
        className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-40 bg-gradient-to-r from-orange-600 to-amber-600 text-white p-3.5 sm:px-4 sm:py-3 rounded-full shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition flex items-center gap-2 border-2 border-amber-300"
        title="Open Namo AI Guide"
      >
        <Sparkles className="w-5 h-5 text-amber-200" />
        <span className="text-xs font-bold hidden sm:inline">Ask Namo AI</span>
      </button>

      {/* Bottom Navigation for Tourist mode */}
      {currentRole === 'tourist' && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onSelectTab={setActiveTab}
          currentLanguage={currentLanguage}
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

/**
 * Standalone mobile ride booking page, reached at `?screen=ride`.
 * It brings its own bottom bar, so it renders instead of the app shell rather
 * than inside it. Still needs the auth popup, which normally lives in AppContent.
 */
function StandaloneRideBooking() {
  const { authModalOpen, authModalReason, closeAuthModal } = useAuth();

  return (
    <>
      <RideBookingScreen />
      <AuthModal
        isOpen={authModalOpen}
        onClose={closeAuthModal}
        reason={authModalReason}
        currentLanguage="en"
      />
    </>
  );
}

export default function App() {
  const standaloneScreen =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('screen');

  return (
    <AuthProvider>
      {standaloneScreen === 'ride' ? <StandaloneRideBooking /> : <AppContent />}
    </AuthProvider>
  );
}
