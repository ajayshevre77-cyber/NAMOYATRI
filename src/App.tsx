import React, { useState, useEffect } from 'react';
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

  // Fetch live endpoints on boot
  useEffect(() => {
    fetch('/api/places')
      .then(res => res.json())
      .then(data => { 
        const items = data.places || data;
        if (Array.isArray(items)) setPlaces(items); 
      })
      .catch(() => {});

    fetch('/api/passes/products')
      .then(res => res.json())
      .then(data => { 
        const items = data.products || data;
        if (Array.isArray(items)) setPassProducts(items); 
      })
      .catch(() => {});

    fetch('/api/passes/user')
      .then(res => res.json())
      .then(data => { 
        const items = data.passes || data;
        if (Array.isArray(items)) setUserPasses(items); 
      })
      .catch(() => {});

    fetch('/api/announcements')
      .then(res => res.json())
      .then(data => { 
        const items = data.announcements || data;
        if (Array.isArray(items)) setAnnouncements(items); 
      })
      .catch(() => {});

    fetch('/api/volunteers')
      .then(res => res.json())
      .then(data => { 
        const items = data.volunteers || data;
        if (Array.isArray(items)) setVolunteers(items); 
      })
      .catch(() => {});
  }, []);

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
        isOpen={!!selectedPlace}
        onClose={() => setSelectedPlaceId(null)}
        currentLanguage={currentLanguage}
        onOpenTravel={(placeName) => {
          setSelectedPlaceId(null);
          setActiveTab('travel');
        }}
        onOpenVolunteer={(zone) => {
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
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
