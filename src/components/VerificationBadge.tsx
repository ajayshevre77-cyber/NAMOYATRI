import React from 'react';
import { ShieldCheck, CheckCircle2, Building2, HelpCircle, Car, Store } from 'lucide-react';
import { VerificationTier } from '../types';

interface Props {
  tier:
    | VerificationTier
    | 'namo_verified'
    | 'partner_ngo'
    | 'official_authorized'
    | 'verified_driver'
    | 'verified_merchant';
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export const VerificationBadge: React.FC<Props> = ({ 
  tier, 
  size = 'sm', 
  showLabel = true 
}) => {
  const isSmall = size === 'sm';

  switch (tier) {
    case 'verified_official':
    case 'official_authorized':
      return (
        <span 
          id="badge-official-verified"
          className={`inline-flex items-center gap-1 font-semibold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 ${
            isSmall ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
          }`}
          title="Official Government / Kumbh Administration Verified"
        >
          <ShieldCheck className={isSmall ? 'w-3.5 h-3.5 text-emerald-600' : 'w-4 h-4 text-emerald-600'} />
          {showLabel && <span>Kumbh Official Verified</span>}
        </span>
      );

    case 'verified_partner':
    case 'partner_ngo':
      return (
        <span 
          id="badge-partner-verified"
          className={`inline-flex items-center gap-1 font-semibold rounded-full bg-sky-50 text-sky-800 border border-sky-200 ${
            isSmall ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
          }`}
          title="Empanelled Charitable / NGO Partner Verified"
        >
          <Building2 className={isSmall ? 'w-3.5 h-3.5 text-sky-600' : 'w-4 h-4 text-sky-600'} />
          {showLabel && <span>Partner Verified</span>}
        </span>
      );

    case 'verified_namo':
      return (
        <span 
          id="badge-namo-verified"
          className={`inline-flex items-center gap-1 font-semibold rounded-full bg-amber-50 text-amber-900 border border-amber-200 ${
            isSmall ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
          }`}
          title="Verified by Namo Yatri Platform Standards"
        >
          <CheckCircle2 className={isSmall ? 'w-3.5 h-3.5 text-amber-600' : 'w-4 h-4 text-amber-600'} />
          {showLabel && <span>Namo Verified</span>}
        </span>
      );

    case 'verified_driver':
      return (
        <span
          id="badge-driver-verified"
          className={`inline-flex items-center gap-1 font-semibold rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 ${
            isSmall ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
          }`}
          title="Licence and RTO badge verified by the regional transport authority"
        >
          <Car className={isSmall ? 'w-3.5 h-3.5 text-indigo-600' : 'w-4 h-4 text-indigo-600'} />
          {showLabel && <span>RTO Verified Driver</span>}
        </span>
      );

    case 'verified_merchant':
      return (
        <span
          id="badge-merchant-verified"
          className={`inline-flex items-center gap-1 font-semibold rounded-full bg-teal-50 text-teal-800 border border-teal-200 ${
            isSmall ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
          }`}
          title="Licensed establishment certified under Kumbh fair-pricing standards"
        >
          <Store className={isSmall ? 'w-3.5 h-3.5 text-teal-600' : 'w-4 h-4 text-teal-600'} />
          {showLabel && <span>Kumbh Certified</span>}
        </span>
      );

    case 'pending':
      return (
        <span 
          id="badge-verification-pending"
          className={`inline-flex items-center gap-1 font-medium rounded-full bg-yellow-50 text-yellow-800 border border-yellow-200 ${
            isSmall ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
          }`}
        >
          <HelpCircle className={isSmall ? 'w-3.5 h-3.5 text-yellow-600' : 'w-4 h-4 text-yellow-600'} />
          {showLabel && <span>Verification Pending</span>}
        </span>
      );

    default:
      return (
        <span 
          id="badge-community-sourced"
          className={`inline-flex items-center gap-1 font-normal rounded-full bg-stone-100 text-stone-600 border border-stone-200 ${
            isSmall ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
          }`}
        >
          {showLabel && <span>Community Info</span>}
        </span>
      );
  }
};
