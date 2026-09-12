import React, { useState } from 'react';
import { 
  User as UserIcon, 
  Shield, 
  ShieldCheck, 
  Lock, 
  Smartphone, 
  MapPin, 
  Eye, 
  EyeOff, 
  LogOut, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  ChevronRight, 
  FileText, 
  Briefcase, 
  HeartHandshake, 
  Car, 
  Save, 
  Info,
  Laptop
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SupportedLanguage, translations } from '../i18n';
import { LocationSharingMode, StandardUserRole } from '../types';

interface Props {
  currentLanguage: SupportedLanguage;
  onNavigateTab: (tab: any) => void;
}

export const AccountSecurityView: React.FC<Props> = ({
  currentLanguage,
  onNavigateTab,
}) => {
  const { 
    firebaseUser, 
    userProfile, 
    isGuest, 
    openAuthModal, 
    logout, 
    updatePrivacySettings,
    applyForRole
  } = useAuth();

  const t = translations[currentLanguage];

  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'privacy' | 'security' | 'role_application'>('profile');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Privacy states
  const [isPublic, setIsPublic] = useState(userProfile?.privacySettings?.isProfilePublic || false);
  const [locationMode, setLocationMode] = useState<LocationSharingMode>(
    userProfile?.privacySettings?.locationSharingMode || 'temporary_sharing'
  );
  const [shareEmergency, setShareEmergency] = useState(
    userProfile?.privacySettings?.shareContactInEmergency ?? true
  );

  // Role Application state
  const [applyingRole, setApplyingRole] = useState<'DRIVER' | 'VOLUNTEER' | 'BUSINESS_PARTNER' | null>(null);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [rtoBadge, setRtoBadge] = useState('');
  const [vehicleType, setVehicleType] = useState('auto_rickshaw');
  const [volunteerZone, setVolunteerZone] = useState('Panchavati & Ramkund');
  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState('dharamshala');
  const [fairPledgeChecked, setFairPledgeChecked] = useState(false);
  const [appSubmitted, setAppSubmitted] = useState(false);

  const handleSavePrivacy = async () => {
    await updatePrivacySettings({
      isProfilePublic: isPublic,
      locationSharingMode: locationMode,
      shareContactInEmergency: shareEmergency,
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleRoleApplicationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyingRole) return;

    let payload: any = {
      role: applyingRole,
      applicantName: userProfile?.displayName || firebaseUser?.displayName || 'Applicant',
      phone: userProfile?.phoneNumber || firebaseUser?.phoneNumber || '',
      email: userProfile?.email || firebaseUser?.email || '',
      fairPricePledge: fairPledgeChecked,
    };

    if (applyingRole === 'DRIVER') {
      payload = { ...payload, licenseNumber, rtoBadge, vehicleType };
    } else if (applyingRole === 'VOLUNTEER') {
      payload = { ...payload, assignedZone: volunteerZone, languages: ['en', 'hi', 'mr'] };
    } else if (applyingRole === 'BUSINESS_PARTNER') {
      payload = { ...payload, businessName, category: businessCategory };
    }

    await applyForRole(applyingRole, payload);
    setAppSubmitted(true);
    setApplyingRole(null);
  };

  return (
    <div id="account-security-view" className="space-y-6 pb-20">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-13 h-13 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-orange-700 font-serif font-bold text-xl shrink-0">
            {userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : <UserIcon className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-stone-900">
                {userProfile?.displayName || (isGuest ? 'Guest Pilgrim' : 'Pilgrim Account')}
              </h2>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${
                userProfile?.role === 'ADMIN'
                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                  : userProfile?.role === 'OPERATIONS'
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : userProfile?.verificationStatus === 'VERIFIED'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-stone-100 text-stone-700 border border-stone-200'
              }`}>
                {userProfile?.role || 'GUEST'}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              {userProfile?.email || (userProfile?.phoneNumber ? `Mobile: ${userProfile.phoneNumber}` : 'Guest browsing mode')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isGuest || !firebaseUser ? (
            <button
              id="account-sign-in-prompt-btn"
              onClick={() => openAuthModal('Sign in to link mobile pass, vehicle bookings, and emergency profile')}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-semibold shadow-xs transition"
            >
              Sign In / Register
            </button>
          ) : (
            <button
              id="account-logout-btn"
              onClick={logout}
              className="px-3.5 py-2 bg-stone-100 hover:bg-red-50 hover:text-red-700 text-stone-700 rounded-xl text-xs font-semibold border border-stone-200 transition flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          )}
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className="flex border-b border-stone-200 bg-white rounded-xl p-1 shadow-2xs gap-1">
        <button
          onClick={() => setActiveSubTab('profile')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition ${
            activeSubTab === 'profile' ? 'bg-orange-600 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          Profile Details
        </button>
        <button
          onClick={() => setActiveSubTab('privacy')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition ${
            activeSubTab === 'privacy' ? 'bg-orange-600 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          Privacy Controls
        </button>
        <button
          onClick={() => setActiveSubTab('security')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition ${
            activeSubTab === 'security' ? 'bg-orange-600 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          Security & Sessions
        </button>
        <button
          onClick={() => setActiveSubTab('role_application')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition ${
            activeSubTab === 'role_application' ? 'bg-orange-600 text-white shadow-xs' : 'text-stone-600 hover:bg-stone-100'
          }`}
        >
          Partner Application
        </button>
      </div>

      {/* 1. PROFILE DETAILS */}
      {activeSubTab === 'profile' && (
        <div className="bg-white rounded-2xl p-5 border border-stone-200 space-y-4">
          <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-orange-600" />
            Pilgrim Identity Model
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1">
              <span className="text-stone-500 text-[11px] uppercase tracking-wider font-semibold">User Identifier (UID)</span>
              <div className="font-mono text-stone-800 break-all">{userProfile?.userId || firebaseUser?.uid || 'GUEST_UNAUTHENTICATED'}</div>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1">
              <span className="text-stone-500 text-[11px] uppercase tracking-wider font-semibold">Assigned Role</span>
              <div className="font-bold text-stone-900">{userProfile?.role || 'TOURIST (Public Consumer)'}</div>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1">
              <span className="text-stone-500 text-[11px] uppercase tracking-wider font-semibold">Verification State</span>
              <div className="flex items-center gap-1.5 font-semibold text-stone-800">
                {userProfile?.verificationStatus === 'VERIFIED' ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-800">VERIFIED PILGRIM</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="text-amber-800">{userProfile?.verificationStatus || 'PENDING'}</span>
                  </>
                )}
              </div>
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1">
              <span className="text-stone-500 text-[11px] uppercase tracking-wider font-semibold">Registered Phone / Email</span>
              <div className="font-medium text-stone-800">
                {userProfile?.phoneNumber || userProfile?.email || 'None (Guest Mode)'}
              </div>
            </div>
          </div>

          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Role-Based Access Control Notice:</span> New users receive the <span className="font-bold">TOURIST</span> role by default. Driver, Volunteer, and Business Partner roles require official credential verification. Administrative and Operations roles are strictly granted through backend authorization.
            </div>
          </div>
        </div>
      )}

      {/* 2. PRIVACY CONTROLS */}
      {activeSubTab === 'privacy' && (
        <div className="bg-white rounded-2xl p-5 border border-stone-200 space-y-5">
          <div>
            <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange-600" />
              Privacy-by-Design & Data Minimization
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              Namo Yatri enforces zero public phone exposure, private family groups, and strict opt-in location sharing.
            </p>
          </div>

          <div className="space-y-4">
            {/* Profile Visibility */}
            <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl border border-stone-200">
              <div className="space-y-0.5 pr-4">
                <div className="text-xs font-semibold text-stone-900 flex items-center gap-1.5">
                  {isPublic ? <Eye className="w-3.5 h-3.5 text-stone-600" /> : <EyeOff className="w-3.5 h-3.5 text-emerald-600" />}
                  Profile Visibility
                </div>
                <div className="text-[11px] text-stone-500">
                  {isPublic ? 'Your display name is visible to volunteer guides.' : 'Private (Strict): Profile details are never exposed publicly.'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
              />
            </div>

            {/* Location Sharing Mode */}
            <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
              <div className="text-xs font-semibold text-stone-900 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-orange-600" />
                Location Sharing Preference
              </div>
              <p className="text-[11px] text-stone-500">
                Continuous background tracking is completely disabled. Select your opt-in sharing tier:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {[
                  { id: 'location_disabled', label: 'Disabled (No GPS access)', desc: 'Pure offline/schematic view' },
                  { id: 'while_using_app', label: 'While Using App Only', desc: 'Find nearest ghat or water bay' },
                  { id: 'family_sharing', label: 'Family Safety Circle Only', desc: 'Share location with linked family' },
                  { id: 'temporary_sharing', label: 'Temporary Ride Transit', desc: 'Shared only during active auto trip' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setLocationMode(mode.id as LocationSharingMode)}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      locationMode === mode.id
                        ? 'bg-orange-50 border-orange-500 text-orange-950 font-semibold'
                        : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <div className="text-xs">{mode.label}</div>
                    <div className="text-[10px] text-stone-500 font-normal">{mode.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Emergency Contact Broadcast */}
            <div className="flex items-center justify-between p-3.5 bg-stone-50 rounded-xl border border-stone-200">
              <div className="space-y-0.5 pr-4">
                <div className="text-xs font-semibold text-stone-900">
                  Emergency Medical Contact Dispatch
                </div>
                <div className="text-[11px] text-stone-500">
                  Transmit masked emergency contact to 108 medical personnel only when SOS is actively triggered.
                </div>
              </div>
              <input
                type="checkbox"
                checked={shareEmergency}
                onChange={(e) => setShareEmergency(e.target.checked)}
                className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {saveSuccess ? (
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Privacy settings saved securely
              </span>
            ) : <span />}
            <button
              id="privacy-settings-save-btn"
              onClick={handleSavePrivacy}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              Save Privacy Settings
            </button>
          </div>
        </div>
      )}

      {/* 3. SECURITY & SESSIONS */}
      {activeSubTab === 'security' && (
        <div className="bg-white rounded-2xl p-5 border border-stone-200 space-y-5">
          <div>
            <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2">
              <Lock className="w-4 h-4 text-orange-600" />
              Security Architecture & Active Devices
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              Active sessions authenticated via Firebase Authentication tokens.
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800">
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-stone-900 flex items-center gap-2">
                    Current Web Browser Session
                    <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] rounded font-semibold">Active</span>
                  </div>
                  <div className="text-[11px] text-stone-500">
                    Chrome / Web Client • Masked IP: 157.34.••.••
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-stone-400 font-mono">Now</div>
            </div>

            <div className="p-3.5 bg-stone-50/60 rounded-xl border border-stone-200/60 flex items-center justify-between opacity-80">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-300 flex items-center justify-center text-stone-600">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-stone-800">
                    Mobile Device (Android / iOS PWA)
                  </div>
                  <div className="text-[11px] text-stone-500">
                    Namo Yatri Simhastha Companion • Ready for sync
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-stone-400">Standby</span>
            </div>
          </div>

          <div className="p-3.5 bg-orange-50/70 border border-orange-200 rounded-xl text-xs text-stone-700 space-y-1.5">
            <div className="font-semibold text-orange-950 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-orange-600" />
              Security Audit Policy
            </div>
            <p>
              Administrative actions, pass redemptions, and driver verification state transitions are logged in an immutable Firestore <span className="font-mono text-stone-900 font-semibold">/auditLogs</span> collection.
            </p>
          </div>
        </div>
      )}

      {/* 4. PARTNER & ROLE APPLICATION */}
      {activeSubTab === 'role_application' && (
        <div className="bg-white rounded-2xl p-5 border border-stone-200 space-y-5">
          <div>
            <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-orange-600" />
              Role Upgrade & Partner Onboarding
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              Apply to become an empanelled Kumbh seva partner. All applications undergo verification before activation.
            </p>
          </div>

          {appSubmitted && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Application Received (UNDER_REVIEW):</span> Your credentials have been submitted to the Kumbh Operations desk for badge verification. You will receive an SMS upon review.
              </div>
            </div>
          )}

          {!applyingRole ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Driver Card */}
              <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 hover:border-orange-500 transition space-y-2.5 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center">
                    <Car className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-stone-900 text-xs">Verified Driver Partner</div>
                  <p className="text-[11px] text-stone-500">
                    Auto rickshaw & taxi drivers with valid RTO badge and RTO meter compliance. Zero commission.
                  </p>
                </div>
                <button
                  id="apply-driver-btn"
                  onClick={() => setApplyingRole('DRIVER')}
                  className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg transition"
                >
                  Apply as Driver
                </button>
              </div>

              {/* Volunteer Card */}
              <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 hover:border-orange-500 transition space-y-2.5 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                    <HeartHandshake className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-stone-900 text-xs">Kumbh Seva Volunteer</div>
                  <p className="text-[11px] text-stone-500">
                    Guide senior citizens, lost pilgrims, and assist at holy ghats and medical helpdesks.
                  </p>
                </div>
                <button
                  id="apply-volunteer-btn"
                  onClick={() => setApplyingRole('VOLUNTEER')}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition"
                >
                  Apply as Volunteer
                </button>
              </div>

              {/* Business Partner Card */}
              <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 hover:border-orange-500 transition space-y-2.5 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <div className="font-bold text-stone-900 text-xs">Local Business & Ashram</div>
                  <p className="text-[11px] text-stone-500">
                    Dharamshalas, bhojanalayas, and cloakrooms pledging to transparent fair tariffs.
                  </p>
                </div>
                <button
                  id="apply-business-btn"
                  onClick={() => setApplyingRole('BUSINESS_PARTNER')}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition"
                >
                  Apply as Business
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRoleApplicationSubmit} className="space-y-4 p-4 bg-stone-50 rounded-xl border border-stone-200">
              <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                <h4 className="font-bold text-xs text-stone-900 uppercase tracking-wider">
                  Applying as: {applyingRole.replace('_', ' ')}
                </h4>
                <button
                  type="button"
                  onClick={() => setApplyingRole(null)}
                  className="text-xs text-stone-500 hover:text-stone-800"
                >
                  Cancel
                </button>
              </div>

              {applyingRole === 'DRIVER' && (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Driving License Number</label>
                    <input
                      type="text"
                      placeholder="MH-15-2018-0012345"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">RTO Public Service Vehicle Badge</label>
                    <input
                      type="text"
                      placeholder="BDG-NSK-9921"
                      value={rtoBadge}
                      onChange={(e) => setRtoBadge(e.target.value)}
                      className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Vehicle Type</label>
                    <select
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    >
                      <option value="auto_rickshaw">Auto Rickshaw (Metered)</option>
                      <option value="electric_shuttle">Electric Pilgrim Shuttle</option>
                      <option value="taxi">Sedan / Maxi-cab</option>
                    </select>
                  </div>
                </div>
              )}

              {applyingRole === 'VOLUNTEER' && (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Preferred Seva Sector</label>
                    <select
                      value={volunteerZone}
                      onChange={(e) => setVolunteerZone(e.target.value)}
                      className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    >
                      <option value="Panchavati & Ramkund">Panchavati & Ramkund Ghats</option>
                      <option value="Trimbakeshwar & Kushavarta">Trimbakeshwar & Kushavarta</option>
                      <option value="Nashik Road Station & CBS">Nashik Road Station & CBS Terminal</option>
                      <option value="Outer Ring Parking Shuttles">Outer Ring Parking Shuttles</option>
                    </select>
                  </div>
                </div>
              )}

              {applyingRole === 'BUSINESS_PARTNER' && (
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Establishment Name</label>
                    <input
                      type="text"
                      placeholder="e.g., Shri Ram Ashram Dharamshala"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Category</label>
                    <select
                      value={businessCategory}
                      onChange={(e) => setBusinessCategory(e.target.value)}
                      className="w-full p-2 border border-stone-300 rounded-lg bg-white"
                    >
                      <option value="dharamshala">Dharamshala / Pilgrim Lodge</option>
                      <option value="bhojanalaya">Bhojanalaya / Satvik Dining</option>
                      <option value="cloakroom">Secure Luggage & Cloakroom</option>
                      <option value="parking">Authorized Vehicle Parking</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Fair Price & Ethical Pledge */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1.5">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="fair-pledge-check"
                    checked={fairPledgeChecked}
                    onChange={(e) => setFairPledgeChecked(e.target.checked)}
                    className="w-4 h-4 text-orange-600 rounded mt-0.5"
                    required
                  />
                  <label htmlFor="fair-pledge-check" className="text-stone-800 leading-tight">
                    <span className="font-bold text-amber-950">Simhastha Kumbh 2027 Fair Pricing Pledge:</span> I solemnly pledge to charge only official government-regulated tariffs with zero surge pricing, and assist pilgrims with utmost integrity.
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={!fairPledgeChecked}
                className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition shadow-xs"
              >
                Submit Application for Verification
              </button>
            </form>
          )}

          <div className="p-3 bg-stone-100 rounded-xl text-[11px] text-stone-600 flex items-center gap-2">
            <Lock className="w-4 h-4 text-stone-500 shrink-0" />
            <span><strong className="text-stone-800">Security Rule:</strong> Admin and Operations roles can only be provisioned by district authorized personnel and cannot be requested via self-service.</span>
          </div>
        </div>
      )}
    </div>
  );
};
