import React, { useState } from 'react';
import { 
  SearchX, 
  User, 
  Package, 
  MapPin, 
  Phone, 
  Clock, 
  AlertCircle, 
  Check, 
  Plus, 
  ShieldCheck,
  Search
} from 'lucide-react';
import { SupportedLanguage, translations } from '../i18n';
import { PlaceholderNotice } from '../components/PlaceholderNotice';

interface LostReport {
  id: string;
  type: 'person' | 'item';
  title: string;
  categoryOrAge: string;
  description: string;
  lastSeenLocation: string;
  reportedAt: string;
  status: 'active_search' | 'reunited' | 'recovered_at_police_post';
  contactPhone: string;
  identifyingMarks: string;
}

const INITIAL_REPORTS: LostReport[] = [
  {
    id: 'lr_01',
    type: 'person',
    title: 'Anand Gopal Joshi',
    categoryOrAge: 'Age: 76 Years (Senior Citizen)',
    description: 'Wearing white dhoti kurta, saffron scarf, speaks Marathi and broken Hindi. Walks with a wooden cane.',
    lastSeenLocation: 'Ramkund Step 3 near Annachhatra counter',
    reportedAt: '1 hour ago',
    status: 'active_search',
    contactPhone: '+91 98221 44555',
    identifyingMarks: 'Wears thick black spectacles, red sacred thread on right wrist',
  },
  {
    id: 'lr_02',
    type: 'person',
    title: 'Aarav Patil',
    categoryOrAge: 'Age: 7 Years (Child)',
    description: 'Wearing blue T-shirt and beige shorts. Separated near Laxman Kund entry bridge during crowd movement.',
    lastSeenLocation: 'Laxman Kund Pedestrian Footbridge',
    reportedAt: '25 mins ago',
    status: 'active_search',
    contactPhone: '+91 94222 88990',
    identifyingMarks: 'Carrying a small orange school backpack',
  },
  {
    id: 'lr_03',
    type: 'item',
    title: 'Brown Leather Wallet with Aadhaar Card',
    categoryOrAge: 'Valuable Document / Wallet',
    description: 'Contains Aadhaar card in name of "D. K. Mishra", SBI debit card, and cash. Recovered by volunteer team.',
    lastSeenLocation: 'Sadhu Gram Sector 4 Seva Camp',
    reportedAt: '3 hours ago',
    status: 'recovered_at_police_post',
    contactPhone: 'Police Chowki Sector 4: 0253-222401',
    identifyingMarks: 'Initials "DKM" stamped on bottom corner',
  },
];

interface Props {
  currentLanguage: SupportedLanguage;
}

export const LostAndFoundScreen: React.FC<Props> = ({ currentLanguage }) => {
  const t = translations[currentLanguage];

  const [reports, setReports] = useState<LostReport[]>(INITIAL_REPORTS);
  const [activeFilter, setActiveFilter] = useState<'all' | 'person' | 'item'>('all');
  const [showReportForm, setShowReportForm] = useState(false);

  // Form states
  const [formType, setFormType] = useState<'person' | 'item'>('person');
  const [formName, setFormName] = useState('');
  const [formAgeOrCategory, setFormAgeOrCategory] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formMarks, setFormMarks] = useState('');
  const [formSuccess, setFormSuccess] = useState(false);

  const filteredReports = reports.filter(r => 
    activeFilter === 'all' || r.type === activeFilter
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newRep: LostReport = {
      id: 'lr_' + Date.now(),
      type: formType,
      title: formName,
      categoryOrAge: formAgeOrCategory,
      description: formDescription,
      lastSeenLocation: formLocation,
      reportedAt: 'Just now',
      status: 'active_search',
      contactPhone: formContact,
      identifyingMarks: formMarks,
    };
    setReports([newRep, ...reports]);
    setFormSuccess(true);
    setTimeout(() => {
      setFormSuccess(false);
      setShowReportForm(false);
      setFormName('');
      setFormAgeOrCategory('');
      setFormDescription('');
      setFormContact('');
      setFormMarks('');
    }, 2000);
  };

  return (
    <div id="lost-and-found-view" className="space-y-5 pb-12">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900">
            {t.qaLostFound}
          </h2>
          <p className="text-xs sm:text-sm text-stone-500">
            Centralized missing person tracing & recovered property desk.
          </p>
        </div>

        <button
          id="open-lost-report-btn"
          onClick={() => setShowReportForm(true)}
          className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>File Report</span>
        </button>
      </div>

      <PlaceholderNotice
        title="Central Lost Person Tent Integration"
        description="Active reports synchronize directly with the Kumbh loudspeaker announcement system, public display kiosks, and Sector Police Chowkis across Nashik and Trimbakeshwar."
        integrationName="Kumbh Mela Public Address & Tracing Desk"
      />

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
            activeFilter === 'all'
              ? 'bg-stone-900 text-white border-stone-900'
              : 'bg-white text-stone-700 border-stone-200'
          }`}
        >
          All Notices ({reports.length})
        </button>
        <button
          onClick={() => setActiveFilter('person')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
            activeFilter === 'person'
              ? 'bg-stone-900 text-white border-stone-900'
              : 'bg-white text-stone-700 border-stone-200'
          }`}
        >
          Missing Persons ({reports.filter(r => r.type === 'person').length})
        </button>
        <button
          onClick={() => setActiveFilter('item')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
            activeFilter === 'item'
              ? 'bg-stone-900 text-white border-stone-900'
              : 'bg-white text-stone-700 border-stone-200'
          }`}
        >
          Recovered Property ({reports.filter(r => r.type === 'item').length})
        </button>
      </div>

      {/* Reports List */}
      <div className="space-y-3">
        {filteredReports.map((rep) => (
          <div
            key={rep.id}
            id={`lost-report-card-${rep.id}`}
            className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  rep.type === 'person' ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700'
                }`}>
                  {rep.type === 'person' ? <User className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-stone-900 text-sm sm:text-base">
                      {rep.title}
                    </h3>
                    <span className="text-[10px] font-semibold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                      {rep.categoryOrAge}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400">
                    Reported: {rep.reportedAt}
                  </p>
                </div>
              </div>

              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${
                rep.status === 'active_search'
                  ? 'bg-rose-100 text-rose-800 animate-pulse'
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {rep.status === 'active_search' ? 'Active Search' : 'Recovered / Safe'}
              </span>
            </div>

            <p className="text-xs text-stone-700 leading-relaxed">
              {rep.description}
            </p>

            {rep.identifyingMarks && (
              <p className="text-[11px] text-stone-600 bg-stone-50 p-2 rounded-xl border border-stone-100">
                <strong className="text-stone-800">Identifying Marks:</strong> {rep.identifyingMarks}
              </p>
            )}

            <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-100 text-stone-500">
              <div className="flex items-center gap-1 text-[11px]">
                <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                <span>Last seen / Location: <strong>{rep.lastSeenLocation}</strong></span>
              </div>
              <a
                href={`tel:${rep.contactPhone}`}
                className="font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 text-xs"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Contact Desk</span>
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* File Report Modal */}
      {showReportForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-3.5 border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h3 className="font-bold text-stone-900 text-base">
                File Lost Person or Property Report
              </h3>
              <button
                onClick={() => setShowReportForm(false)}
                className="text-stone-400 hover:text-stone-700 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            {formSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-950 text-xs text-center space-y-1">
                <Check className="w-6 h-6 text-emerald-600 mx-auto" />
                <p className="font-bold text-sm">Notice Published</p>
                <p className="text-[11px] text-emerald-800">
                  Broadcasted to Kumbh Lost Person Tents & Police Control.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Report Category</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormType('person')}
                      className={`flex-1 py-2 rounded-xl font-bold border transition ${
                        formType === 'person' ? 'bg-rose-600 text-white border-rose-600' : 'bg-stone-50 text-stone-700'
                      }`}
                    >
                      Missing Person
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormType('item')}
                      className={`flex-1 py-2 rounded-xl font-bold border transition ${
                        formType === 'item' ? 'bg-sky-600 text-white border-sky-600' : 'bg-stone-50 text-stone-700'
                      }`}
                    >
                      Lost Valuable / Item
                    </button>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">
                    {formType === 'person' ? 'Person Full Name' : 'Item Name & Model'}
                  </label>
                  <input
                    required
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                    placeholder={formType === 'person' ? 'e.g. Govind Sharma' : 'e.g. Black Leather Bag with Documents'}
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">
                    {formType === 'person' ? 'Age & Gender' : 'Category'}
                  </label>
                  <input
                    required
                    type="text"
                    value={formAgeOrCategory}
                    onChange={(e) => setFormAgeOrCategory(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                    placeholder={formType === 'person' ? 'e.g. Age: 68, Male' : 'e.g. Bag / Mobile Phone / Wallet'}
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Last Seen Location / Landmark</label>
                  <input
                    required
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                    placeholder="e.g. Ramkund Step 4 near Bhagur Darwaza"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Detailed Description (Clothing / Color)</label>
                  <textarea
                    required
                    rows={2}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                    placeholder="Detailed appearance, clothing, language, etc."
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Contact Phone Number</label>
                  <input
                    required
                    type="tel"
                    value={formContact}
                    onChange={(e) => setFormContact(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                    placeholder="+91 98220 00000"
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
                    Broadcast Report
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
