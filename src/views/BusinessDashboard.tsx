import React, { useState } from 'react';
import { 
  Building, 
  CheckCircle2, 
  MapPin, 
  Clock, 
  ShieldCheck, 
  TrendingUp, 
  Eye, 
  Star,
  Check,
  AlertCircle
} from 'lucide-react';
import { SupportedLanguage } from '../i18n';
import { VerificationBadge } from '../components/VerificationBadge';
import { PlaceholderNotice } from '../components/PlaceholderNotice';

interface Props {
  currentLanguage: SupportedLanguage;
}

export const BusinessDashboard: React.FC<Props> = ({ currentLanguage }) => {
  const [pledgeSigned, setPledgeSigned] = useState(true);

  return (
    <div id="business-dashboard-view" className="space-y-5 pb-12">
      {/* Business Header */}
      <div className="bg-stone-900 text-white rounded-3xl p-5 sm:p-6 border border-stone-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400 font-bold uppercase tracking-wider">
                Local Business Partner Portal
              </span>
              <VerificationBadge tier="verified_merchant" size="sm" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-serif text-white mt-1">
              Shree Godavari Bhakt Nivas & Bhojanalaya
            </h2>
            <p className="text-xs text-stone-300">
              Panchavati Ghat Road, Nashik • FSSAI Lic #11524021000348
            </p>
          </div>
          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-full">
            Kumbh Certified
          </span>
        </div>

        {/* Footfall Glance */}
        <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-stone-800 text-center">
          <div className="p-2.5 bg-black/40 rounded-2xl">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Pilgrim Views</span>
            <span className="text-lg font-black text-white">4,820</span>
          </div>
          <div className="p-2.5 bg-black/40 rounded-2xl">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Directions Requested</span>
            <span className="text-lg font-black text-orange-400">920</span>
          </div>
          <div className="p-2.5 bg-black/40 rounded-2xl">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Fair Price Score</span>
            <span className="text-lg font-black text-emerald-400">100%</span>
          </div>
        </div>
      </div>

      <PlaceholderNotice
        title="Municipal & FSSAI Business Directory"
        description="Local hotels, dharamshalas, and bhojanalayas must register with Nashik Municipal Corporation (NMC) and undergo hygiene inspections to receive the verified partner badge."
        integrationName="NMC Kumbh Commercial Licensing Desk"
      />

      {/* Fair Price Commitment Pledge */}
      <div className="bg-emerald-50/80 border border-emerald-200 rounded-3xl p-4 sm:p-5 text-emerald-950 space-y-2">
        <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <span>Fair Price & Pilgrim Dignity Pledge: Active</span>
        </div>
        <p className="text-xs text-emerald-800 leading-relaxed">
          Your establishment has committed to standard, transparent meal rates (₹80 full satvik thali) with no surge pricing during Shahi Snan dates. This commitment gives your business a top-priority verified ranking in the Namo Yatri directory.
        </p>
      </div>

      {/* Listing Management Summary */}
      <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-xs space-y-3">
        <h3 className="font-bold text-stone-900 text-base">
          Listing Verification Documents
        </h3>
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded-xl border border-stone-200">
            <span>FSSAI Food Safety Registration</span>
            <span className="font-bold text-emerald-700">Verified ✓</span>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded-xl border border-stone-200">
            <span>Fire Safety NOC (Nashik Municipal Corp)</span>
            <span className="font-bold text-emerald-700">Verified ✓</span>
          </div>
          <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded-xl border border-stone-200">
            <span>Room Tariff Display Declaration</span>
            <span className="font-bold text-emerald-700">Published ✓</span>
          </div>
        </div>
      </div>
    </div>
  );
};
