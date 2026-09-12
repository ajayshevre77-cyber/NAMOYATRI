import React, { useState } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Bell, 
  Users, 
  Activity, 
  Plus, 
  Check, 
  Clock, 
  QrCode, 
  Send,
  FileText
} from 'lucide-react';
import { SupportedLanguage } from '../i18n';
import { OfficialAnnouncement, EmergencyCase } from '../types';
import { PlaceholderNotice } from '../components/PlaceholderNotice';

interface Props {
  announcements: OfficialAnnouncement[];
  onAddAnnouncement: (ann: OfficialAnnouncement) => void;
  currentLanguage: SupportedLanguage;
}

export const AdminOperationsDashboard: React.FC<Props> = ({
  announcements,
  onAddAnnouncement,
  currentLanguage,
}) => {
  const [showAnnounceForm, setShowAnnounceForm] = useState(false);
  const [titleEn, setTitleEn] = useState('');
  const [titleHi, setTitleHi] = useState('');
  const [summaryEn, setSummaryEn] = useState('');
  const [priority, setPriority] = useState<'info' | 'advisory' | 'high_alert'>('advisory');
  const [issuedBy, setIssuedBy] = useState('District Magistrate & Simhastha Nodal Officer');

  const handleCreateAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    const newAnn: OfficialAnnouncement = {
      id: 'ann_' + Date.now(),
      title: { en: titleEn, hi: titleHi || titleEn, mr: titleEn },
      summary: { en: summaryEn, hi: summaryEn, mr: summaryEn },
      publishedAt: 'Just now',
      priority,
      issuedBy,
      sourceType: 'AUTHORIZED_OFFICIAL',
      sourceName: 'Simhastha Operations Center',
      status: 'PUBLISHED',
      validUntil: 'Active Simhastha 2027 Season',
      verificationSeal: 'COMMUNITY_VERIFIED_NOTICE',
    };
    onAddAnnouncement(newAnn);
    setShowAnnounceForm(false);
    setTitleEn('');
    setTitleHi('');
    setSummaryEn('');
  };

  return (
    <div id="admin-operations-view" className="space-y-5 pb-12">
      {/* Admin Operations Header */}
      <div className="bg-stone-950 text-white rounded-3xl p-5 sm:p-6 border border-stone-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
              SIMHASTHA COMMAND & OPERATIONS
            </span>
            <h2 className="text-xl sm:text-2xl font-bold font-serif text-white mt-1">
              Central Control & Disaster Operations Desk
            </h2>
            <p className="text-xs text-stone-400">
              Nashik District Collectorate • Kumbh Mela Nodal Cell • Nashik City Police
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-red-500/20 text-red-300 border border-red-500/30 rounded-full">
            Live Monitoring
          </span>
        </div>

        {/* Live Operations Telemetry */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-stone-800 text-xs">
          <div className="p-2.5 bg-black/40 rounded-2xl">
            <span className="text-stone-400 block text-[10px]">Ramkund Crowd Density</span>
            <span className="font-bold text-amber-400 text-sm">62% (Moderate Flow)</span>
          </div>
          <div className="p-2.5 bg-black/40 rounded-2xl">
            <span className="text-stone-400 block text-[10px]">Kushavarta Trimbak</span>
            <span className="font-bold text-emerald-400 text-sm">48% (Steady)</span>
          </div>
          <div className="p-2.5 bg-black/40 rounded-2xl">
            <span className="text-stone-400 block text-[10px]">Active Passes Verified</span>
            <span className="font-bold text-white text-sm">18,490</span>
          </div>
          <div className="p-2.5 bg-black/40 rounded-2xl">
            <span className="text-stone-400 block text-[10px]">Field Volunteers On Duty</span>
            <span className="font-bold text-sky-400 text-sm">1,240</span>
          </div>
        </div>
      </div>

      <PlaceholderNotice
        title="District Emergency Operations Center (DEOC) Integration"
        description="Broadcast announcements issued here trigger push notifications and update public LED displays across railway stations, bus stands, and river ghats."
        integrationName="Nashik DEOC Broadcast Controller"
      />

      {/* Broadcast Announcement Controller */}
      <div className="bg-white border border-stone-200 rounded-3xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-orange-600" />
            <h3 className="font-bold text-stone-900 text-base">
              Official Kumbh Advisories & Alerts ({announcements.length})
            </h3>
          </div>
          <button
            onClick={() => setShowAnnounceForm(true)}
            className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Publish New Advisory</span>
          </button>
        </div>

        {/* Existing Announcements */}
        <div className="space-y-2 pt-1">
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-1 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  ann.priority === 'high_alert' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {ann.priority}
                </span>
                <span className="text-stone-400">{ann.publishedAt}</span>
              </div>
              <h4 className="font-bold text-stone-900 text-sm">
                {ann.title.en}
              </h4>
              <p className="text-stone-600 leading-relaxed">
                {ann.summary.en}
              </p>
              <div className="text-[11px] text-stone-400 pt-1">
                Issued By: {ann.issuedBy}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New Advisory Modal */}
      {showAnnounceForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-3.5 border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h3 className="font-bold text-stone-900 text-base">
                Broadcast Official Kumbh Bulletin
              </h3>
              <button
                onClick={() => setShowAnnounceForm(false)}
                className="text-stone-400 hover:text-stone-700 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAnnouncement} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Priority Level</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 font-medium"
                >
                  <option value="advisory">Advisory (General Pilgrim Guidance)</option>
                  <option value="high_alert">High Alert (Crowd Divert / Weather)</option>
                  <option value="normal">Normal (Schedule / Event Update)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Title (English)</label>
                <input
                  required
                  type="text"
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  placeholder="e.g. Ramkund Footbridge One-Way Traffic Restriction"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Summary / Advisory Text</label>
                <textarea
                  required
                  rows={3}
                  value={summaryEn}
                  onChange={(e) => setSummaryEn(e.target.value)}
                  placeholder="Clear instructions for pilgrims, transport reroutes, etc."
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Issuing Authority</label>
                <input
                  required
                  type="text"
                  value={issuedBy}
                  onChange={(e) => setIssuedBy(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAnnounceForm(false)}
                  className="flex-1 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl"
                >
                  Broadcast Bulletin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
