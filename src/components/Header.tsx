import React from 'react';
import { 
  Compass, 
  Globe, 
  Sparkles, 
  AlertOctagon, 
  Users, 
  ShieldAlert, 
  Truck, 
  HeartHandshake, 
  Store,
  ChevronDown,
  User as UserIcon,
  ShieldCheck
} from 'lucide-react';
import { UserRole } from '../types';
import { SupportedLanguage, LANGUAGES, translations } from '../i18n';
import { useAuth } from '../context/AuthContext';

interface Props {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  currentLanguage: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  onOpenAI: () => void;
  onOpenSOS: () => void;
  onOpenAccount?: () => void;
  activeDestination: string;
}

export const Header: React.FC<Props> = ({
  currentRole,
  onRoleChange,
  currentLanguage,
  onLanguageChange,
  onOpenAI,
  onOpenSOS,
  onOpenAccount,
  activeDestination,
}) => {
  const t = translations[currentLanguage];
  const { firebaseUser, userProfile, isGuest, openAuthModal } = useAuth();

  const roleOptions: { role: UserRole; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { role: 'tourist', label: t.roleTourist, icon: Compass },
    { role: 'driver', label: t.roleDriver, icon: Truck },
    { role: 'volunteer', label: t.roleVolunteer, icon: HeartHandshake },
    { role: 'business', label: t.roleBusiness, icon: Store },
    { role: 'admin', label: t.roleAdmin, icon: ShieldAlert },
    { role: 'operations', label: t.roleOperations, icon: Users },
  ];

  const handleAccountClick = () => {
    if (onOpenAccount) {
      onOpenAccount();
    } else if (!firebaseUser || isGuest) {
      openAuthModal('Sign in to access your profile and security settings');
    }
  };

  return (
    <header 
      id="app-main-header"
      className="sticky top-0 z-40 bg-stone-900 text-stone-100 shadow-md border-b border-stone-800"
    >
      {/* Top Banner / Destination notice */}
      <div className="bg-gradient-to-r from-orange-700 via-amber-700 to-orange-800 text-orange-50 px-3 sm:px-6 py-1 text-xs font-medium flex items-center justify-between">
        <div className="flex items-center gap-1.5 truncate">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold">{t.destinationBadge}:</span>
          <span className="truncate">{activeDestination}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] shrink-0 text-orange-100">
          <span className="hidden md:inline">National Emergency: 112 | Medical: 108</span>
          <button 
            onClick={onOpenSOS}
            id="header-quick-sos-link"
            className="font-bold text-red-100 bg-red-600/90 hover:bg-red-600 px-2 py-0.5 rounded transition"
          >
            SOS Help
          </button>
        </div>
      </div>

      {/* Main Nav Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
        {/* Brand & Tagline. On phones this side gives way: the title stays on
            one line, the tagline truncates, and the year chip is dropped
            because the banner above already shows it. */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-sm shadow-orange-950/40">
            <span className="font-serif font-black text-lg tracking-tighter">NY</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-serif font-black text-base sm:text-lg tracking-wide text-stone-100 truncate">
                {t.brandName}
              </h1>
              <span className="hidden sm:inline text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-stone-800 text-orange-400 border border-stone-700 whitespace-nowrap">
                Simhastha 2027
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-stone-400 leading-none truncate">
              {t.tagline}
            </p>
          </div>
        </div>

        {/* Action Controls: Language, Role Switcher, Account */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Namo AI trigger, the app's AI entry point at every screen size.
              On phones it is an icon in a 40x44px target; the tighter gap
              above pays for the extra width so the title still fits at 360px. */}
          <button
            id="header-namo-ai-btn"
            onClick={onOpenAI}
            className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold text-xs sm:text-sm max-sm:w-10 max-sm:h-11 sm:px-3 sm:py-1.5 rounded-lg shadow-sm hover:from-amber-600 hover:to-orange-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            title="Ask Namo AI Pilgrim Assistant"
            aria-label="Ask Namo AI"
          >
            <Sparkles className="w-4 h-4 text-amber-200" aria-hidden="true" />
            <span className="hidden sm:inline">Namo AI</span>
          </button>

          {/* Language Selector. Phones get one compact dropdown: the three
              buttons are too wide to sit beside the title at 360px. */}
          <label className="sm:hidden">
            <span className="sr-only">Language</span>
            <select
              id="lang-select-mobile"
              value={currentLanguage}
              onChange={(e) => onLanguageChange(e.target.value as SupportedLanguage)}
              className="bg-stone-800 text-stone-100 text-xs font-semibold rounded-lg border border-stone-700 pl-2 pr-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code} className="bg-stone-900 text-stone-200">
                  {lang.nativeLabel}
                </option>
              ))}
            </select>
          </label>
          <div className="relative hidden sm:flex items-center bg-stone-800 rounded-lg p-0.5 border border-stone-700">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                id={`lang-btn-${lang.code}`}
                onClick={() => onLanguageChange(lang.code)}
                className={`px-1.5 sm:px-2 py-1 text-xs font-semibold rounded-md transition ${
                  currentLanguage === lang.code
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-stone-300 hover:text-white'
                }`}
              >
                {lang.nativeLabel}
              </button>
            ))}
          </div>

          {/* Verified Role Access / View Controller */}
          {(() => {
            const serverRole = (userProfile?.role || 'TOURIST').toUpperCase();
            const isAdmin = serverRole === 'ADMIN';
            const isOperations = serverRole === 'OPERATIONS';

            // Calculate authorized roles for this user's verified identity
            let authorizedRoles: UserRole[] = ['tourist'];
            if (isAdmin) {
              authorizedRoles = ['admin', 'operations', 'tourist', 'driver', 'volunteer', 'business'];
            } else if (isOperations) {
              authorizedRoles = ['operations', 'tourist'];
            } else if (serverRole === 'DRIVER') {
              authorizedRoles = ['driver', 'tourist'];
            } else if (serverRole === 'VOLUNTEER') {
              authorizedRoles = ['volunteer', 'tourist'];
            } else if (serverRole === 'BUSINESS_PARTNER') {
              authorizedRoles = ['business', 'tourist'];
            }

            // In local development mode only, permit client preview with explicit DEMO label
            const isDevEnv = import.meta.env.DEV;

            if (authorizedRoles.length > 1) {
              // User has verified multiple authorizations. On phones the
              // role names (up to ~190px) pushed the header past 360px, so
              // there the box shrinks to the shield icon with the same
              // native <select> laid invisibly over it: tapping the icon
              // opens the usual role list.
              return (
                <div className="relative group">
                  <label htmlFor="role-select" className="sr-only">Switch Authorized View</label>
                  <div
                    className="relative flex items-center gap-1 bg-stone-800 rounded-lg px-2 py-1 max-sm:py-1.5 border border-amber-600/50 focus-within:ring-2 focus-within:ring-orange-500"
                    title="Switch view"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    <select
                      id="role-select"
                      value={currentRole}
                      onChange={(e) => onRoleChange(e.target.value as UserRole)}
                      className="bg-transparent text-amber-200 text-xs font-semibold focus:outline-none cursor-pointer max-sm:absolute max-sm:inset-0 max-sm:w-full max-sm:opacity-0"
                    >
                      {roleOptions
                        .filter(opt => authorizedRoles.includes(opt.role))
                        .map((opt) => (
                          <option key={opt.role} value={opt.role} className="bg-stone-900 text-stone-200">
                            {opt.label}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              );
            }

            if (isDevEnv) {
              // Local development simulator only - strictly labeled and separated
              return (
                <div className="relative group hidden lg:block">
                  <label htmlFor="dev-role-simulator" className="sr-only">Dev View Simulator</label>
                  <select
                    id="dev-role-simulator"
                    value={currentRole}
                    onChange={(e) => onRoleChange(e.target.value as UserRole)}
                    className="bg-stone-900 text-amber-400/80 text-[11px] font-mono rounded-lg px-2 py-1 border border-dashed border-amber-500/40 focus:outline-none cursor-pointer"
                    title="Dev View Simulator (Local Dev Only): Server strictly rejects unverified tokens"
                  >
                    {roleOptions.map((opt) => (
                      <option key={opt.role} value={opt.role} className="bg-stone-900 text-stone-300">
                        [DEV VIEW] {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            }

            // Standard verified role display for single-role user
            return (
              <div 
                id="user-verified-role-badge" 
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-stone-800 border border-stone-700 text-stone-300 text-xs font-medium"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.roleTourist}</span>
              </div>
            );
          })()}

          {/* Account / Pilgrim Profile Button */}
          <button
            id="header-account-btn"
            onClick={handleAccountClick}
            className="flex items-center gap-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-stone-700 transition text-xs font-medium"
            title="Account & Security Settings"
          >
            <div className="w-5 h-5 rounded-full bg-orange-600/80 flex items-center justify-center text-white text-[10px] font-bold">
              {userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : <UserIcon className="w-3 h-3" />}
            </div>
            <span className="hidden md:inline max-w-[80px] truncate">
              {userProfile?.displayName || (isGuest ? 'Guest' : 'Account')}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
