import React, { useState } from 'react';
import { 
  QrCode, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  Bus, 
  AlertCircle, 
  RefreshCw, 
  Users, 
  Check, 
  Loader2,
  ScanLine,
  Lock
} from 'lucide-react';
import { SupportedLanguage, translations } from '../i18n';
import { MobilityPassProduct, UserPass, PassType } from '../types';
import { PlaceholderNotice } from '../components/PlaceholderNotice';
import { useAuth } from '../context/AuthContext';
import { secureFetch } from '../lib/api';

interface Props {
  passProducts: MobilityPassProduct[];
  userPasses: UserPass[];
  currentLanguage: SupportedLanguage;
  onPassPurchased: (pass: UserPass) => void;
}

export const PassScreen: React.FC<Props> = ({
  passProducts,
  userPasses,
  currentLanguage,
  onPassPurchased,
}) => {
  const t = translations[currentLanguage];
  const { requireAuth, userProfile, firebaseUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'buy' | 'my_pass'>(
    userPasses.length > 0 ? 'my_pass' : 'buy'
  );
  const [selectedProductId, setSelectedProductId] = useState<PassType>('1_day');
  const [purchasing, setPurchasing] = useState(false);
  const [activePass, setActivePass] = useState<UserPass>(userPasses[0] || null);

  // Conductor Inspection Verification state
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any | null>(null);

  const doPurchase = async () => {
    setPurchasing(true);
    try {
      const res = await secureFetch('/api/passes/purchase', {
        method: 'POST',
        body: JSON.stringify({
          passType: selectedProductId,
          userName: userProfile?.displayName || firebaseUser?.displayName || 'Pilgrim Visitor',
        }),
      });
      const data = await res.json();
      if (data.success) {
        onPassPurchased(data.pass);
        setActivePass(data.pass);
        setActiveTab('my_pass');
      }
    } catch (err) {
      console.error('Pass purchase failed', err);
    } finally {
      setPurchasing(false);
    }
  };

  const handlePurchase = () => {
    requireAuth('purchase a digital mobility pass', doPurchase);
  };

  const handleConductorScanSimulation = async () => {
    if (!activePass) return;
    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const res = await fetch('/api/passes/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passRefNumber: activePass.passRefNumber,
          tokenHash: activePass.qrSecureTokenSpec.tokenHash,
        }),
      });
      const data = await res.json();
      setVerificationResult(data);
      if (data.valid) {
        // update local ride usage counter
        setActivePass(prev => ({ ...prev, ridesUsedCount: data.ridesUsedCount }));
      }
    } catch (err) {
      setVerificationResult({ valid: false, reason: 'Network communication error with verification server.' });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div id="pass-screen-view" className="space-y-5 pb-12">
      {/* View Switcher: Buy Passes vs. My Pass */}
      <div className="flex bg-stone-200/80 p-1 rounded-2xl">
        <button
          id="tab-buy-passes"
          onClick={() => setActiveTab('buy')}
          className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition ${
            activeTab === 'buy'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          {t.passHeading}
        </button>
        <button
          id="tab-my-passes"
          onClick={() => setActiveTab('my_pass')}
          className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition relative ${
            activeTab === 'my_pass'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          <span>{t.myPassTab}</span>
          {userPasses.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.2 bg-emerald-600 text-white rounded-full text-[10px] font-bold">
              {userPasses.length} Active
            </span>
          )}
        </button>
      </div>

      {activeTab === 'buy' ? (
        /* PURCHASE PASS SECTION */
        <div className="space-y-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900">
              {t.passHeading}
            </h2>
            <p className="text-xs sm:text-sm text-stone-500">
              {t.passSubtitle}
            </p>
          </div>

          <PlaceholderNotice
            title="Unified Mobility Pass Integration"
            description="Fares are statutory rates regulated for Simhastha Kumbh 2027 by Maharashtra Transport Department. External UPI and banking gateway APIs will process production transactions."
            integrationName="Statutory Kumbh Mobility Tariff"
          />

          {/* Pass Product Cards */}
          <div className="space-y-3">
            {passProducts.map((prod) => {
              const isSelected = selectedProductId === prod.id;
              return (
                <div
                  key={prod.id}
                  id={`pass-product-${prod.id}`}
                  onClick={() => setSelectedProductId(prod.id)}
                  className={`p-4 rounded-3xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-orange-50/60 border-orange-500 shadow-sm ring-2 ring-orange-500/20'
                      : 'bg-white border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-orange-100 text-orange-800">
                          {prod.durationDays === 1 ? '1 Day' : `${prod.durationDays} Days`} Validity
                        </span>
                        {prod.isRegulatedTariff && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            Regulated Tariff
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-stone-900 text-base sm:text-lg mt-1">
                        {prod.title[currentLanguage] || prod.title.en}
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black font-serif text-stone-900">
                        ₹{prod.priceInr}
                      </span>
                      <p className="text-[10px] text-stone-400">Total Fixed Rate</p>
                    </div>
                  </div>

                  {/* Eligible Transports */}
                  <div className="mt-3 pt-3 border-t border-stone-100 space-y-1.5 text-xs text-stone-600">
                    <p className="font-semibold text-stone-800">Eligible Transport:</p>
                    <ul className="space-y-1">
                      {prod.eligibleTransport.map((item, idx) => (
                        <li key={idx} className="flex items-center gap-1.5 text-[11px]">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Key Terms */}
                  <div className="mt-2.5 bg-stone-50 rounded-xl p-2.5 text-[11px] text-stone-500 space-y-1">
                    {prod.terms.map((term, idx) => (
                      <p key={idx}>• {term}</p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Checkout Button */}
          <button
            id="buy-mobility-pass-btn"
            disabled={purchasing}
            onClick={handlePurchase}
            className="w-full py-3.5 px-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-sm sm:text-base rounded-2xl transition shadow-md flex items-center justify-center gap-2"
          >
            {purchasing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Generating Cryptographic Pass Token...</span>
              </>
            ) : (
              <span>Get Mobility Pass (Instant Activation)</span>
            )}
          </button>
        </div>
      ) : (
        /* MY PASS SECTION */
        <div className="space-y-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900">
              Active Pilgrim Mobility Pass
            </h2>
            <p className="text-xs sm:text-sm text-stone-500">
              Present this dynamic QR code to bus conductors and gate ticket marshals.
            </p>
          </div>

          {activePass ? (
            <div 
              id="my-pass-card"
              className="bg-white border-2 border-stone-800 rounded-3xl overflow-hidden shadow-xl"
            >
              {/* Card Header */}
              <div className="bg-stone-900 text-white p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      STATUS: ACTIVE
                    </span>
                    <span className="text-xs text-stone-400">
                      Kumbh 2027
                    </span>
                  </div>
                  <h3 className="font-bold text-base mt-1 text-white capitalize">
                    {activePass.passType.replace('_', ' ')} Pilgrim Pass
                  </h3>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs text-orange-400 font-bold block">
                    {activePass.passRefNumber}
                  </span>
                  <span className="text-[10px] text-stone-400">{activePass.userName}</span>
                </div>
              </div>

              {/* Dynamic QR Display */}
              <div className="p-6 flex flex-col items-center justify-center bg-stone-50/70 border-b border-stone-200">
                <div className="p-4 bg-white rounded-3xl shadow-sm border border-stone-200 flex flex-col items-center relative">
                  {/* Visual QR representation with dynamic rotating token */}
                  <div className="w-48 h-48 sm:w-56 sm:h-56 bg-stone-950 rounded-2xl p-3 flex flex-col justify-between relative overflow-hidden">
                    {/* Simulated visual QR pattern with rotating security token hash */}
                    <div className="grid grid-cols-6 gap-1 w-full h-full opacity-90 p-1">
                      {Array.from({ length: 36 }).map((_, i) => (
                        <div 
                          key={i} 
                          className={`rounded-xs ${
                            (i % 2 === 0 && i % 3 !== 0) || i === 0 || i === 5 || i === 30 || i === 35 
                              ? 'bg-white' 
                              : 'bg-stone-900'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-orange-600 text-white p-2 rounded-xl shadow-md border-2 border-white flex items-center justify-center">
                        <Lock className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </div>

                  {/* Security spec label */}
                  <div className="mt-3 text-center space-y-0.5">
                    <p className="font-mono text-[11px] font-bold text-stone-700 tracking-wider">
                      TOKEN: {activePass.qrSecureTokenSpec.tokenHash}
                    </p>
                    <p className="text-[10px] text-stone-400 flex items-center justify-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      <span>{activePass.qrSecureTokenSpec.securityAlgorithm}</span>
                    </p>
                  </div>
                </div>

                <p className="text-center text-[11px] text-stone-500 max-w-xs mt-3 leading-relaxed">
                  {t.qrNotice}
                </p>
              </div>

              {/* Pass Metadata & Usage Counter */}
              <div className="p-4 sm:p-5 bg-white space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-100">
                    <span className="text-[10px] text-stone-400 font-semibold block uppercase">
                      {t.passValidFrom}
                    </span>
                    <span className="font-bold text-stone-900">{activePass.validFrom}</span>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-100">
                    <span className="text-[10px] text-stone-400 font-semibold block uppercase">
                      {t.passValidTo}
                    </span>
                    <span className="font-bold text-stone-900">{activePass.validTo}</span>
                  </div>
                </div>

                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-950">
                  <div>
                    <span className="font-bold block">Rides Logged:</span>
                    <span className="text-[11px] text-emerald-800">
                      {activePass.ridesUsedCount} rides completed (Unlimited pass active)
                    </span>
                  </div>
                  <span className="px-2 py-1 bg-emerald-200/80 rounded font-bold text-emerald-900">
                    Active
                  </span>
                </div>

                {/* Conductor Inspection Test Trigger */}
                <div className="pt-1">
                  <button
                    id="simulate-conductor-scan-btn"
                    onClick={handleConductorScanSimulation}
                    disabled={isVerifying}
                    className="w-full py-2.5 px-4 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2"
                  >
                    <ScanLine className="w-4 h-4 text-orange-400" />
                    <span>
                      {isVerifying 
                        ? 'Simulating Conductor Verification Handshake...' 
                        : 'Simulate Conductor Ticket Scan (Audit Verification)'
                      }
                    </span>
                  </button>
                </div>

                {/* Verification result output */}
                {verificationResult && (
                  <div className={`p-3 rounded-xl border text-xs leading-relaxed space-y-1 ${
                    verificationResult.valid 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950' 
                      : 'bg-red-50 border-red-200 text-red-950'
                  }`}>
                    <div className="flex items-center gap-1.5 font-bold">
                      {verificationResult.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-600" />
                      )}
                      <span>
                        {verificationResult.valid ? 'Pass Verified Successfully' : 'Verification Rejected'}
                      </span>
                    </div>
                    <p className="text-[11px]">
                      {verificationResult.valid 
                        ? `${verificationResult.conductorNotice} (Usage counter incremented to ${verificationResult.ridesUsedCount})`
                        : verificationResult.reason}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-white rounded-3xl border border-stone-200 space-y-3">
              <QrCode className="w-12 h-12 text-stone-400 mx-auto" />
              <h3 className="font-bold text-stone-900 text-base">No Active Pass Found</h3>
              <p className="text-xs text-stone-500 max-w-xs mx-auto">
                Get a 1-day or 3-day mobility pass for unlimited travel across Nashik–Trimbakeshwar Kumbh corridors.
              </p>
              <button
                onClick={() => setActiveTab('buy')}
                className="px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-bold transition hover:bg-orange-700"
              >
                Browse Pass Options
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
