import React, { useState, useEffect, useRef } from 'react';
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
import { createSosHold, SosHold, SosHoldInput, SosHoldState, SOS_HOLD_MS } from '../lib/sosHold';

const HOLD_SECONDS = SOS_HOLD_MS / 1000;
const SOS_RECORDED_ANNOUNCEMENT =
  'Demo report recorded. Emergency services have NOT been notified, and no one is on the way. If you need help, call 112 or 108.';

interface Props {
  currentLanguage: SupportedLanguage;
  onOpenLostAndFound: () => void;
}

// The API accepts a fixed set of report types; each form category maps to one.
// Sending the category value itself was rejected for three of the four.
const INCIDENT_API_TYPES: Record<string, string> = {
  safety_report: 'stampede_risk',
  medical: 'medical',
  police: 'general',
  other: 'general',
};

export const SafetySOSScreen: React.FC<Props> = ({
  currentLanguage,
  onOpenLostAndFound,
}) => {
  const t = translations[currentLanguage];

  // SOS press-and-hold. The logic lives in lib/sosHold; this screen forwards
  // events to it and renders its state.
  const [hold, setHold] = useState<SosHoldState>({
    holding: false,
    progress: 0,
    secondsLeft: HOLD_SECONDS,
    submitting: false,
  });
  // What the screen-reader live region says when no hold is in progress.
  const [sosAnnouncement, setSosAnnouncement] = useState('');
  const [activeSOSTicket, setActiveSOSTicket] = useState<EmergencyCase | null>(null);
  const [sosError, setSosError] = useState(false);

  // Safety Incident Report form modal
  const [showReportForm, setShowReportForm] = useState(false);
  const [incidentType, setIncidentType] = useState('safety_report');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentLocation, setIncidentLocation] = useState('Panchavati Ramkund Ghat Sector');
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Records one demo report. Only the hold logic calls this, once per
  // completed hold, and never while a previous report is still being recorded.
  const recordDemoSOS = async () => {
    setSosError(false);
    setActiveSOSTicket(null);
    try {
      // The app does not read the phone's location, so it sends none rather
      // than a made-up place a pilgrim might think responders were given.
      const res = await secureFetch('/api/safety/emergency', {
        method: 'POST',
        body: JSON.stringify({
          type: 'sos_panic',
          description: 'Emergency SOS button triggered from pilgrim mobile application.',
          locationZone: 'Location not shared (demo)',
          reporterName: 'Pilgrim Anonymous/Emergency Trigger',
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setActiveSOSTicket(data.emergencyCase);
        setSosAnnouncement(SOS_RECORDED_ANNOUNCEMENT);
      } else {
        setSosError(true);
        setSosAnnouncement(''); // the error alert below announces itself
      }
    } catch (err) {
      console.error('Demo SOS report failed', err);
      setSosError(true);
      setSosAnnouncement('');
    }
  };

  // Created once. Its callbacks only use state setters and recordDemoSOS,
  // whose dependencies never change, so the first render's versions are fine.
  const holdRef = useRef<SosHold | null>(null);
  if (holdRef.current === null) {
    holdRef.current = createSosHold({
      submit: recordDemoSOS,
      onChange: setHold,
      onEnd: (outcome) =>
        setSosAnnouncement(
          outcome === 'cancelled'
            ? `Released before ${HOLD_SECONDS} seconds. No report was recorded.`
            : 'Recording demo SOS report.',
        ),
    });
  }
  useEffect(() => () => holdRef.current?.dispose(), []);

  // Forwards one button event; suppresses the browser default when asked to,
  // so a keyboard hold does not also fire a click.
  const feedHold = (input: SosHoldInput, event?: { preventDefault: () => void }) => {
    if (holdRef.current?.handle(input)) event?.preventDefault();
  };

  // The live region speaks once per second while holding, not on every tick.
  const holdLiveText = hold.holding
    ? `Keep holding: ${hold.secondsLeft} second${hold.secondsLeft === 1 ? '' : 's'} left. Release to cancel.`
    : sosAnnouncement;

  const handleIncidentReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportError(null);
    try {
      const res = await secureFetch('/api/safety/emergency', {
        method: 'POST',
        body: JSON.stringify({
          type: INCIDENT_API_TYPES[incidentType] ?? 'general',
          description: incidentDescription,
          locationZone: incidentLocation,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setReportSuccess(true);
        setTimeout(() => {
          setReportSuccess(false);
          setShowReportForm(false);
          setIncidentDescription('');
        }, 2000);
      } else {
        setReportError(
          typeof data?.error === 'string' && data.error
            ? data.error
            : 'The demo report could not be recorded. Please try again.',
        );
      }
    } catch (err) {
      console.error(err);
      setReportError('Could not reach the server. Check your connection and try again.');
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
          For real help, call 112 or 108. The SOS button and incident report on this screen are demos that alert no one.
        </p>
      </div>

      {/* Honest Production Transparency Notice */}
      <PlaceholderNotice
        title="In-app SOS is a demo and reaches no one"
        description="The SOS button only records a demo ticket on this app's server. It does not alert the District Emergency Operations Center (DEOC), police or ambulance. In an emergency, call 112 or 108 directly."
        integrationName="DEOC Integration"
      />

      {/* Big High-Visibility SOS Button */}
      <div className="p-6 bg-gradient-to-b from-red-900 via-stone-900 to-black rounded-3xl text-center space-y-4 border-2 border-red-700/50 shadow-2xl">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full bg-red-600/30 text-red-300 border border-red-500/30 inline-block">
            Demo · alerts no one
          </span>
          <h3 className="text-lg font-black text-white mt-1">
            Pilgrim Emergency Panic SOS
          </h3>
          <p id="sos-hold-instructions" className="text-xs text-stone-300 max-w-sm mx-auto mt-0.5">
            Press and hold for {HOLD_SECONDS} seconds, or hold Enter or Space, to record a demo SOS report. Letting go sooner cancels it. No one is alerted. Call 112 or 108 for real help.
          </p>
        </div>

        {/* The 3-second hold circular button */}
        <div className="flex flex-col items-center justify-center py-2">
          <div className="relative">
            <svg className="w-36 h-36 -rotate-90" aria-hidden="true">
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
                strokeDashoffset={402 - 402 * hold.progress}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
              />
            </svg>

            {/* Pointer events cover mouse, touch and pen. touch-none keeps the
                browser from turning a held finger into a scroll, which would
                cancel the hold. No onClick: the hold logic does the submitting,
                and a click must never add a second report. The button stays
                focusable while a report is recorded (aria-disabled, not
                disabled), so keyboard focus is not lost. */}
            <button
              id="sos-hold-trigger-btn"
              type="button"
              aria-describedby="sos-hold-instructions"
              aria-disabled={hold.submitting || undefined}
              onPointerDown={(e) => feedHold({ type: 'pointerdown', pointerType: e.pointerType, button: e.button })}
              onPointerUp={() => feedHold({ type: 'pointerup' })}
              onPointerLeave={() => feedHold({ type: 'pointerleave' })}
              onPointerCancel={() => feedHold({ type: 'pointercancel' })}
              onBlur={() => feedHold({ type: 'blur' })}
              onKeyDown={(e) => feedHold({ type: 'keydown', key: e.key, repeat: e.repeat }, e)}
              onKeyUp={(e) => feedHold({ type: 'keyup', key: e.key }, e)}
              onContextMenu={(e) => e.preventDefault()}
              style={{ WebkitTouchCallout: 'none' }}
              className={`absolute inset-3 rounded-full bg-gradient-to-br from-red-600 to-red-800 text-white font-black text-xs sm:text-sm flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all select-none touch-none cursor-pointer focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 ${
                hold.holding ? 'ring-4 ring-red-400/50' : ''
              } ${hold.submitting ? 'opacity-60 cursor-wait' : ''}`}
            >
              {hold.submitting ? (
                <Loader2 className="w-8 h-8 mb-1 animate-spin" aria-hidden="true" />
              ) : (
                <AlertTriangle className="w-8 h-8 mb-1 animate-pulse" aria-hidden="true" />
              )}
              <span>
                {hold.submitting ? 'RECORDING…' : hold.holding ? `KEEP HOLDING · ${hold.secondsLeft}s` : 'HOLD SOS'}
              </span>
              <span className="text-[9px] font-medium opacity-80">{HOLD_SECONDS} SECONDS</span>
            </button>
          </div>
        </div>

        {/* Screen-reader updates: time left while holding, a cancelled hold,
            then the result. Always rendered, so changes are announced. */}
        <p id="sos-hold-status" role="status" aria-live="polite" className="sr-only">
          {holdLiveText}
        </p>

        {/* Demo SOS result. Recording a report is not dispatching help: the
            server stores it and nothing else happens, so this must never read
            as an alert that went out. The wording is fixed here rather than
            taken from the server. Screen readers hear it from the status
            region above, so this card is not a live region itself. */}
        {activeSOSTicket && (
          <div
            id="active-sos-ticket-alert"
            className="p-3.5 bg-red-950/90 border border-red-500 rounded-2xl text-left text-xs space-y-1.5 text-white animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between gap-2 font-bold text-red-200">
              <span className="flex items-center gap-1.5">
                <Info className="w-4 h-4 text-amber-300 shrink-0" aria-hidden="true" />
                <span>Demo report recorded · {activeSOSTicket.ticketNumber}</span>
              </span>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-red-700 text-white rounded shrink-0">
                Demo · not sent
              </span>
            </div>
            <p className="text-white text-xs font-semibold leading-relaxed">
              Emergency services have NOT been notified, and no one is on the way.
            </p>
            <p className="text-stone-300 text-[11px] leading-relaxed">
              This button only records a demo report on the app's server. If you need help, call{' '}
              <a href="tel:112" className="font-bold text-white underline">112</a> or{' '}
              <a href="tel:108" className="font-bold text-white underline">108</a> now.
            </p>
            <div className="flex justify-end text-[10px] pt-1 border-t border-red-800">
              <button
                onClick={() => setActiveSOSTicket(null)}
                className="underline text-red-300 font-bold"
              >
                Dismiss Notice
              </button>
            </div>
          </div>
        )}

        {sosError && (
          <p
            id="sos-error-alert"
            role="alert"
            className="p-3 bg-red-950/90 border border-red-500 rounded-2xl text-left text-xs text-white leading-relaxed"
          >
            The demo SOS could not be recorded. It would not have alerted anyone anyway: if you need help, call{' '}
            <a href="tel:112" className="font-bold underline">112</a> or{' '}
            <a href="tel:108" className="font-bold underline">108</a> now.
          </p>
        )}
      </div>

      {/* Direct Emergency Hotlines (Click to Call) */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-stone-800">
          Emergency Numbers
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
                  Emergency ambulance number
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
                  National emergency number
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-blue-600 font-bold text-xs bg-blue-50 px-2.5 py-1.5 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition">
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Call 112</span>
            </div>
          </a>

          {/* Kumbh Control Center: no verified number yet, so nothing to dial.
              A made-up number here could be called in a real emergency. */}
          <div
            id="hotline-kumbh-control"
            className="p-3.5 bg-white border border-stone-200 rounded-2xl shadow-xs flex items-center justify-between"
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
                  Number not yet published. Call 112 meanwhile.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-stone-500 font-bold text-xs bg-stone-100 px-2.5 py-1.5 rounded-xl">
              <span>Not available</span>
            </div>
          </div>

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
          onClick={() => { setReportError(null); setShowReportForm(true); }}
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
              <div
                id="incident-report-result"
                role="status"
                className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-950 text-xs text-center space-y-1"
              >
                <Check className="w-6 h-6 text-amber-600 mx-auto" aria-hidden="true" />
                <p className="font-bold text-sm">Demo report recorded</p>
                <p className="text-[11px] text-amber-900">
                  Emergency services have NOT been notified. It was not sent to police, marshals or any health team. For urgent help, call 112 or 108.
                </p>
              </div>
            ) : (
              <form onSubmit={handleIncidentReportSubmit} className="space-y-3 text-xs">
                <p className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                  Demo only: the report is stored on the demo server and sent to no one. For urgent help, call 112 or 108.
                </p>

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

                {reportError && (
                  <p role="alert" className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-800">
                    {reportError}
                  </p>
                )}

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
                    Submit Demo Report
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
