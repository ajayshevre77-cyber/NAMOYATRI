import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  PhoneCall, 
  ShieldAlert, 
  Cross, 
  SearchX, 
  FileText, 
  Check, 
  Loader2, 
  Info,
  Clock,
  MapPin
} from 'lucide-react';
import { SupportedLanguage, translations } from '../i18n';
import { EmergencyCase } from '../types';
import { PlaceholderNotice } from '../components/PlaceholderNotice';
import { secureFetch } from '../lib/api';

interface Props {
  currentLanguage: SupportedLanguage;
  onOpenLostAndFound: () => void;
}

export const SafetySOSScreen: React.FC<Props> = ({
  currentLanguage,
  onOpenLostAndFound,
}) => {
  const t = translations[currentLanguage];

  // 3-second hold state for SOS
  const [holding, setHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isSubmittingSOS, setIsSubmittingSOS] = useState(false);
  const [activeSOSTicket, setActiveSOSTicket] = useState<EmergencyCase | null>(null);

  // Safety Incident Report form modal
  const [showReportForm, setShowReportForm] = useState(false);
  const [incidentType, setIncidentType] = useState('safety_report');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentLocation, setIncidentLocation] = useState('Panchavati Ramkund Ghat Sector');
  const [reportSuccess, setReportSuccess] = useState(false);

  useEffect(() => {
    let interval: any;
    if (holding) {
      interval = setInterval(() => {
        setHoldProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            triggerSOS();
            return 100;
          }
          return prev + 5; // ~2 seconds total for responsive feel
        });
      }, 100);
    } else {
      setHoldProgress(0);
    }
    return () => clearInterval(interval);
  }, [holding]);

  const triggerSOS = async () => {
    setIsSubmittingSOS(true);
    setHolding(false);
    try {
      const res = await secureFetch('/api/safety/emergency', {
        method: 'POST',
        body: JSON.stringify({
          type: 'sos_panic',
          description: 'Emergency SOS button triggered from pilgrim mobile application.',
          locationZone: 'Panchavati / Ramkund Ghat Sector (Cell Tower Approximate)',
          reporterName: 'Pilgrim Anonymous/Emergency Trigger',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveSOSTicket(data.emergencyCase);
      }
    } catch (err) {
      console.error('SOS dispatch error', err);
    } finally {
      setIsSubmittingSOS(false);
    }
  };

  const handleIncidentReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await secureFetch('/api/safety/emergency', {
        method: 'POST',
        body: JSON.stringify({
          type: incidentType,
          description: incidentDescription,
          locationZone: incidentLocation,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReportSuccess(true);
        setTimeout(() => {
          setReportSuccess(false);
          setShowReportForm(false);
          setIncidentDescription('');
        }, 2000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div id="safety-sos-screen-view" className="space-y-5 pb-12">
      {/* Title */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900">
          Emergency Services & Pilgrim Safety
        </h2>
        <p className="text-xs sm:text-sm text-stone-500">
          Instant SOS ticket logging, rapid hotline access, and medical camp coordination.
        </p>
      </div>

      {/* Honest Production Transparency Notice */}
      <PlaceholderNotice
        title="Emergency Operations Center (DEOC) Protocol"
        description="Pressing the SOS button creates an active incident ticket in the District Emergency Operations Center (DEOC) queue. For life-threatening emergencies, please also dial direct state emergency hotlines (112 / 108) immediately."
        integrationName="District Emergency Cell Protocol"
      />

      {/* Big High-Visibility SOS Button */}
      <div className="p-6 bg-gradient-to-b from-red-900 via-stone-900 to-black rounded-3xl text-center space-y-4 border-2 border-red-700/50 shadow-2xl">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full bg-red-600/30 text-red-300 border border-red-500/30 inline-block">
            HIGH-PRIORITY ASSISTANCE
          </span>
          <h3 className="text-lg font-black text-white mt-1">
            Pilgrim Emergency Panic SOS
          </h3>
          <p className="text-xs text-stone-300 max-w-sm mx-auto mt-0.5">
            Press and hold for 3 seconds to generate an emergency panic dispatch ticket to the Kumbh Central Control Room.
          </p>
        </div>

        {/* The 3-second hold circular button */}
        <div className="flex flex-col items-center justify-center py-2">
          <div className="relative">
            <svg className="w-36 h-36 -rotate-90">
              <circle
                cx="72"
                cy="72"
                r="64"
                className="text-stone-800"
                strokeWidth="8"
                stroke="currentColor"
                fill="transparent"
              />
              <circle
                cx="72"
                cy="72"
                r="64"
                className="text-red-500 transition-all duration-75"
                strokeWidth="8"
                strokeDasharray={402}
                strokeDashoffset={402 - (402 * holdProgress) / 100}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
              />
            </svg>

            <button
              id="sos-hold-trigger-btn"
              type="button"
              onMouseDown={() => setHolding(true)}
              onMouseUp={() => setHolding(false)}
              onTouchStart={() => setHolding(true)}
              onTouchEnd={() => setHolding(false)}
              disabled={isSubmittingSOS}
              className={`absolute inset-3 rounded-full bg-gradient-to-br from-red-600 to-red-800 text-white font-black text-xs sm:text-sm flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all select-none cursor-pointer ${
                holding ? 'ring-4 ring-red-400/50' : ''
              }`}
            >
              <AlertTriangle className="w-8 h-8 mb-1 animate-pulse" />
              <span>{holding ? `HOLDING (${Math.round(holdProgress)}%)` : 'HOLD SOS'}</span>
              <span className="text-[9px] font-medium opacity-80">3 SECONDS</span>
            </button>
          </div>
        </div>

        {/* SOS Ticket Active Confirmation Banner */}
        {activeSOSTicket && (
          <div 
            id="active-sos-ticket-alert"
            className="p-3.5 bg-red-950/90 border border-red-500 rounded-2xl text-left text-xs space-y-1 text-white animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between font-bold text-red-200">
              <span className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Ticket Generated: {activeSOSTicket.ticketNumber}</span>
              </span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-red-700 text-white rounded">
                {activeSOSTicket.status}
              </span>
            </div>
            <p className="text-stone-300 text-[11px] leading-relaxed">
              {activeSOSTicket.deocIntegrationNotice}
            </p>
            <div className="flex items-center justify-between text-[10px] text-stone-400 pt-1 border-t border-red-800">
              <span>Location: {activeSOSTicket.locationZone}</span>
              <button 
                onClick={() => setActiveSOSTicket(null)}
                className="underline text-red-300 font-bold"
              >
                Dismiss Notice
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Direct Emergency Hotlines (Click to Call) */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-stone-800">
          Official Emergency Hotlines
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Medical 108 */}
          <a
            id="hotline-108"
            href="tel:108"
            className="p-3.5 bg-white border border-stone-200 hover:border-red-300 rounded-2xl shadow-xs flex items-center justify-between transition group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <Cross className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-sm">
                  {t.medicalEmergency}
                </h4>
                <p className="text-[11px] text-stone-500">
                  Ambulance & Trauma Medical Base
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-red-600 font-bold text-xs bg-red-50 px-2.5 py-1.5 rounded-xl group-hover:bg-red-600 group-hover:text-white transition">
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Call 108</span>
            </div>
          </a>

          {/* Police 112 */}
          <a
            id="hotline-112"
            href="tel:112"
            className="p-3.5 bg-white border border-stone-200 hover:border-blue-300 rounded-2xl shadow-xs flex items-center justify-between transition group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-sm">
                  {t.policeHelp}
                </h4>
                <p className="text-[11px] text-stone-500">
                  Kumbh Security Cell & Police Control
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-blue-600 font-bold text-xs bg-blue-50 px-2.5 py-1.5 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition">
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Call 112</span>
            </div>
          </a>

          {/* Kumbh Control Center */}
          <a
            id="hotline-kumbh-control"
            href="tel:180023302027"
            className="p-3.5 bg-white border border-stone-200 hover:border-orange-300 rounded-2xl shadow-xs flex items-center justify-between transition group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-sm">
                  {t.kumbhControlRoom}
                </h4>
                <p className="text-[11px] text-stone-500">
                  Toll Free: 1800-233-02027
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-orange-600 font-bold text-xs bg-orange-50 px-2.5 py-1.5 rounded-xl group-hover:bg-orange-600 group-hover:text-white transition">
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Toll Free</span>
            </div>
          </a>

          {/* Lost & Found Desk trigger */}
          <div
            id="quick-link-lost-and-found"
            onClick={onOpenLostAndFound}
            className="p-3.5 bg-white border border-stone-200 hover:border-purple-300 rounded-2xl shadow-xs flex items-center justify-between transition cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <SearchX className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-sm">
                  Lost Person & Lost Item Desk
                </h4>
                <p className="text-[11px] text-stone-500">
                  File missing person report or claim found property
                </p>
              </div>
            </div>
            <span className="text-purple-600 font-bold text-xs bg-purple-50 px-2.5 py-1.5 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition">
              Open Desk →
            </span>
          </div>
        </div>
      </div>

      {/* Safety Incident Reporting Button */}
      <div className="pt-1">
        <button
          id="report-safety-incident-btn"
          onClick={() => setShowReportForm(true)}
          className="w-full py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs sm:text-sm rounded-2xl transition flex items-center justify-center gap-2 shadow-xs"
        >
          <FileText className="w-4 h-4 text-orange-400" />
          <span>{t.reportSafetyIssue} (Non-Emergency Incident)</span>
        </button>
      </div>

      {/* Incident Report Modal */}
      {showReportForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-3.5 border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h3 className="font-bold text-stone-900 text-base">
                Report Safety or Crowd Incident
              </h3>
              <button
                onClick={() => setShowReportForm(false)}
                className="text-stone-400 hover:text-stone-700 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            {reportSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-950 text-xs text-center space-y-1">
                <Check className="w-6 h-6 text-emerald-600 mx-auto" />
                <p className="font-bold text-sm">Incident Report Registered</p>
                <p className="text-[11px] text-emerald-800">
                  Forwarded to Sector Safety Marshal & Municipal Health cell.
                </p>
              </div>
            ) : (
              <form onSubmit={handleIncidentReportSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Incident Category</label>
                  <select
                    value={incidentType}
                    onChange={(e) => setIncidentType(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 font-medium"
                  >
                    <option value="safety_report">Crowd Overcrowding / Chokepoint</option>
                    <option value="medical">Sanitation / Water Contamination Hazard</option>
                    <option value="police">Barricade Damage / Structural Concern</option>
                    <option value="other">Other Pilgrim Safety Matter</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Specific Location</label>
                  <input
                    type="text"
                    value={incidentLocation}
                    onChange={(e) => setIncidentLocation(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                    placeholder="e.g. Sector 2 bridge entry corridor"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Description & Urgency</label>
                  <textarea
                    required
                    rows={3}
                    value={incidentDescription}
                    onChange={(e) => setIncidentDescription(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                    placeholder="Provide clear details of what you observed..."
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReportForm(false)}
                    className="flex-1 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl"
                  >
                    Submit Report
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
