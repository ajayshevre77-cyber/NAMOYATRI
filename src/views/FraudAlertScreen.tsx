import React, { useState } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  CheckCircle2, 
  FileText, 
  Check, 
  Info, 
  PhoneCall,
  ShieldCheck,
  Building,
  Car,
  QrCode,
  DollarSign
} from 'lucide-react';
import { SupportedLanguage, translations } from '../i18n';
import { FraudAlert } from '../types';
import { PlaceholderNotice } from '../components/PlaceholderNotice';

interface Props {
  fraudAlerts: FraudAlert[];
  currentLanguage: SupportedLanguage;
}

const VERIFICATION_CHECKLIST = [
  {
    title: 'Always Check Dynamic QR & Security Token on Passes',
    description: 'Legitimate Namo Yatri mobility passes display rotating cryptographic hashes. Static paper printouts claiming to be "all-access passes" sold outside bus stations are counterfeit.',
  },
  {
    title: 'Only Pay Regulated Metered / App-Quoted Auto & Taxi Fares',
    description: 'Maharashtra Transport Department has fixed flat Kumbh rates. If any driver demands ₹500+ for standard city hops, decline and report vehicle number.',
  },
  {
    title: 'Official Volunteers Wear Verified Photo IDs with QR',
    description: 'Authorized Seva volunteers will never ask for cash tips, VIP darshan fees, or personal valuables.',
  },
  {
    title: 'Beware of Fake Dharamshala UPI QR Codes',
    description: 'Only transfer advance room deposits to registered Ashrams listed in the official Kumbh Directory. Do not transfer to personal phone numbers found on random social media posts.',
  },
];

export const FraudAlertScreen: React.FC<Props> = ({
  fraudAlerts,
  currentLanguage,
}) => {
  const t = translations[currentLanguage];

  const [showAlertModal, setShowAlertModal] = useState(false);
  const [reportType, setReportType] = useState('fake_guide');
  const [suspectDetails, setSuspectDetails] = useState('');
  const [locationArea, setLocationArea] = useState('Near Panchavati Godavari Steps');
  const [incidentText, setIncidentText] = useState('');
  const [success, setSuccess] = useState(false);

  const handleReportFraud = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/safety/emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'fraud_report',
          description: `Category: ${reportType}. Suspect: ${suspectDetails}. Details: ${incidentText}`,
          locationZone: locationArea,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setShowAlertModal(false);
          setSuspectDetails('');
          setIncidentText('');
        }, 2500);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div id="fraud-alert-screen-view" className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900">
            Trust, Safety & Scam Advisories
          </h2>
          <p className="text-xs sm:text-sm text-stone-500">
            Protect your pilgrimage from overcharging, fake passes, and unauthorized agents.
          </p>
        </div>

        <button
          id="open-report-scam-btn"
          onClick={() => setShowAlertModal(true)}
          className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs"
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Report Scam</span>
        </button>
      </div>

      <PlaceholderNotice
        title="Anti-Fraud & Cyber Enforcement Feed"
        description="Active advisories are issued in direct collaboration with Nashik Police Special Investigation Unit and the Simhastha Vigilance Bureau."
        integrationName="Nashik City Police Anti-Fraud Cell"
      />

      {/* Official Pilgrim Verification Checklist */}
      <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h3 className="font-bold text-stone-900 text-sm sm:text-base">
            Official Pilgrim Verification Checklist
          </h3>
        </div>

        <div className="space-y-2.5">
          {VERIFICATION_CHECKLIST.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2.5 text-xs text-stone-600">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-stone-900 block">{item.title}</strong>
                <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Scam Alerts List */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-stone-800">
          Active Scam Bulletins Issued by Police Cell
        </h3>

        <div className="space-y-2.5">
          {fraudAlerts.map((alert) => (
            <div
              key={alert.id}
              id={`fraud-alert-${alert.id}`}
              className="bg-white border border-stone-200 rounded-2xl p-4 shadow-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-red-100 text-red-800">
                  {alert.category.toUpperCase().replace('_', ' ')}
                </span>
                <span className="text-[11px] text-stone-400">
                  Issued: {alert.reportedDate}
                </span>
              </div>

              <h4 className="font-bold text-stone-900 text-sm">
                {alert.title[currentLanguage] || alert.title.en}
              </h4>

              <p className="text-xs text-stone-600 leading-relaxed">
                {alert.description[currentLanguage] || alert.description.en}
              </p>

              <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-950 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Advisory / Safe Action:</span>
                  <span className="text-[11px]">{alert.advisory[currentLanguage] || alert.advisory.en}</span>
                </div>
              </div>

              <p className="text-[11px] text-stone-400">
                Identified Corridors: <strong>{alert.affectedAreas.join(', ')}</strong>
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Report Scam Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-3.5 border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h3 className="font-bold text-stone-900 text-base">
                Report Suspicious Activity / Fraud
              </h3>
              <button
                onClick={() => setShowAlertModal(false)}
                className="text-stone-400 hover:text-stone-700 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            {success ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-950 text-xs text-center space-y-1">
                <Check className="w-6 h-6 text-emerald-600 mx-auto" />
                <p className="font-bold text-sm">Report Forwarded to Vigilance Cell</p>
                <p className="text-[11px] text-emerald-800">
                  Thank you for safeguarding fellow pilgrims. Patrol teams alerted.
                </p>
              </div>
            ) : (
              <form onSubmit={handleReportFraud} className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Scam / Deception Type</label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 font-medium"
                  >
                    <option value="fake_guide">Unauthorized / Fake Guide</option>
                    <option value="overcharging_driver">Auto/Taxi Overcharging / Refusal</option>
                    <option value="counterfeit_pass">Counterfeit / Fake Mobility Pass</option>
                    <option value="fake_hotel">Fake Accommodation / Deposit Scam</option>
                    <option value="fake_donation">Illegal Donation / Begging Syndicate</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Vehicle No. / Suspect Name (If Known)</label>
                  <input
                    type="text"
                    value={suspectDetails}
                    onChange={(e) => setSuspectDetails(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                    placeholder="e.g. Auto MH-15-AB-1234 or Person wearing black jacket"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Location of Occurrence</label>
                  <input
                    type="text"
                    value={locationArea}
                    onChange={(e) => setLocationArea(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                    placeholder="e.g. Outside CBS bus terminal Gate 2"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Incident Summary</label>
                  <textarea
                    required
                    rows={3}
                    value={incidentText}
                    onChange={(e) => setIncidentText(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                    placeholder="Describe what happened, money demanded, etc."
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAlertModal(false)}
                    className="flex-1 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl"
                  >
                    Send to Police Bureau
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
