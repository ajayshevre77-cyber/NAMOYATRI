import React, { useState } from 'react';
import { 
  HeartHandshake, 
  Search, 
  MapPin, 
  Globe, 
  Star, 
  ShieldCheck, 
  Check, 
  Loader2, 
  UserPlus, 
  Info,
  Calendar,
  Sparkles
} from 'lucide-react';
import { SupportedLanguage, translations } from '../i18n';
import { Volunteer, VolunteerExpertise } from '../types';
import { VerificationBadge } from '../components/VerificationBadge';
import { PlaceholderNotice } from '../components/PlaceholderNotice';
import { secureFetch } from '../lib/api';

interface Props {
  volunteers: Volunteer[];
  currentLanguage: SupportedLanguage;
}

const EXPERTISE_LABELS: Record<VolunteerExpertise, string> = {
  temple_info: 'Temple & Darshan Rituals',
  local_history: 'Nashik & Trimbak History',
  navigation: 'Route & Crowd Navigation',
  language_assist: 'Language Translation',
  senior_citizen_assist: 'Senior Citizen Care',
  accessibility_assist: 'Wheelchair & Accessibility',
  tourist_guide: 'Authorized Pilgrimage Guide',
};

export const VolunteerScreen: React.FC<Props> = ({
  volunteers,
  currentLanguage,
}) => {
  const t = translations[currentLanguage];
  const [activeTab, setActiveTab] = useState<'find' | 'become'>('find');
  const [selectedExpertise, setSelectedExpertise] = useState<string>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');

  // Request Assistance modal state
  const [targetVolunteer, setTargetVolunteer] = useState<Volunteer | null>(null);
  const [requestLocation, setRequestLocation] = useState('Ramkund Holy Bathing Step 2');
  const [requestNotes, setRequestNotes] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);

  // Become volunteer form state
  const [volunteerName, setVolunteerName] = useState('');
  const [volunteerPhone, setVolunteerPhone] = useState('');
  const [volunteerLanguages, setVolunteerLanguages] = useState(['Marathi', 'Hindi']);
  const [selectedSkills, setSelectedSkills] = useState<VolunteerExpertise[]>(['senior_citizen_assist']);
  const [registerSuccess, setRegisterSuccess] = useState(false);

  const filteredVolunteers = volunteers.filter(v => {
    const matchesExp = selectedExpertise === 'all' || v.expertise.includes(selectedExpertise as any);
    const matchesLang = selectedLanguage === 'all' || v.languages.some(l => l.toLowerCase() === selectedLanguage.toLowerCase());
    return matchesExp && matchesLang;
  });

  const handleSendRequest = async () => {
    if (!targetVolunteer) return;
    setSubmittingRequest(true);
    try {
      const res = await secureFetch('/api/volunteers/request', {
        method: 'POST',
        body: JSON.stringify({
          volunteerId: targetVolunteer.id,
          locationArea: requestLocation,
          expertiseNeeded: targetVolunteer.expertise[0] || 'senior_citizen_assist',
          notes: requestNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setRequestSuccess(true);
        setTimeout(() => {
          setRequestSuccess(false);
          setTargetVolunteer(null);
          setRequestNotes('');
        }, 2500);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleRegisterVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await secureFetch('/api/partner/apply', {
        method: 'POST',
        body: JSON.stringify({
          roleRequested: 'VOLUNTEER',
          applicantName: volunteerName,
          details: {
            phone: volunteerPhone,
            languages: volunteerLanguages,
            skills: selectedSkills,
          },
        }),
      });
    } catch (err) {
      console.error('Registration submission notice', err);
    }
    setRegisterSuccess(true);
  };

  return (
    <div id="volunteer-screen-view" className="space-y-5 pb-12">
      {/* Title */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900">
          Pilgrim Seva & Volunteers
        </h2>
        <p className="text-xs sm:text-sm text-stone-500">
          Dedicated, verified volunteers for language support, senior citizen care & temple navigation.
        </p>
      </div>

      {/* View Switcher: Find vs. Become */}
      <div className="flex bg-stone-200/80 p-1 rounded-2xl">
        <button
          id="tab-find-volunteers"
          onClick={() => setActiveTab('find')}
          className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition ${
            activeTab === 'find'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          {t.qaFindVolunteer}
        </button>
        <button
          id="tab-become-volunteer"
          onClick={() => setActiveTab('become')}
          className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-xl transition ${
            activeTab === 'become'
              ? 'bg-white text-stone-900 shadow-xs'
              : 'text-stone-600 hover:text-stone-900'
          }`}
        >
          Become a Seva Volunteer
        </button>
      </div>

      {activeTab === 'find' ? (
        /* FIND VOLUNTEERS */
        <div className="space-y-4">
          {/* Transparency Disclaimer */}
          <PlaceholderNotice
            title="Verified Seva Standards"
            description="All listed volunteers undergo identity checks or represent empanelled Kumbh disaster relief partners (Bharat Seva Mandal, Red Cross). Government/official tags require verified DDMA accreditation."
            integrationName="Volunteer Accreditation Cell"
          />

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block mb-1">
                Filter by Language
              </label>
              <select
                id="volunteer-lang-filter"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full bg-white border border-stone-200 text-stone-900 text-xs rounded-xl p-2 font-medium focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="all">All Languages</option>
                <option value="marathi">Marathi (मराठी)</option>
                <option value="hindi">Hindi (हिन्दी)</option>
                <option value="english">English</option>
                <option value="gujarati">Gujarati</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block mb-1">
                Filter by Seva Expertise
              </label>
              <select
                id="volunteer-expertise-filter"
                value={selectedExpertise}
                onChange={(e) => setSelectedExpertise(e.target.value)}
                className="w-full bg-white border border-stone-200 text-stone-900 text-xs rounded-xl p-2 font-medium focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="all">All Expertise Categories</option>
                <option value="senior_citizen_assist">Senior Citizen Assistance</option>
                <option value="accessibility_assist">Wheelchair & Accessibility</option>
                <option value="temple_info">Temple & Darshan Rituals</option>
                <option value="local_history">Local History & Heritage</option>
                <option value="navigation">Navigation & Crowd Flow</option>
                <option value="language_assist">Language Translation</option>
              </select>
            </div>
          </div>

          {/* Volunteers List */}
          <div className="space-y-3">
            {filteredVolunteers.map((vol) => (
              <div
                key={vol.id}
                id={`volunteer-card-${vol.id}`}
                className="bg-white border border-stone-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-stone-900 text-base">
                        {vol.name}
                      </h3>
                      <VerificationBadge tier={vol.badgeType} size="sm" />
                    </div>
                    {vol.organizationName && (
                      <p className="text-xs text-stone-500 mt-0.5">
                        {vol.organizationName}
                      </p>
                    )}
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      Accreditation ID: {vol.verificationId}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-1 rounded-xl text-xs font-bold shrink-0">
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    <span>{vol.rating}</span>
                    <span className="text-[10px] text-amber-700 font-normal">({vol.totalAssists} assists)</span>
                  </div>
                </div>

                {/* Assigned Zone & Languages */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-stone-600">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                    <span>Duty Zone: <strong>{vol.assignedZone}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span>Languages: <strong>{vol.languages.join(', ')}</strong></span>
                  </div>
                </div>

                {/* Expertise Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {vol.expertise.map((exp, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 text-[11px] font-medium border border-stone-200"
                    >
                      {EXPERTISE_LABELS[exp] || exp}
                    </span>
                  ))}
                </div>

                {/* Action Button */}
                <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                  <span className={`text-[11px] font-bold flex items-center gap-1 ${
                    vol.availabilityStatus === 'available' ? 'text-emerald-700' : 'text-stone-400'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      vol.availabilityStatus === 'available' ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'
                    }`} />
                    <span>{vol.availabilityStatus === 'available' ? 'Available on field now' : 'Currently assisting another pilgrim'}</span>
                  </span>

                  <button
                    id={`request-volunteer-btn-${vol.id}`}
                    disabled={vol.availabilityStatus !== 'available'}
                    onClick={() => setTargetVolunteer(vol)}
                    className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition"
                  >
                    Request Assistance
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* BECOME A VOLUNTEER */
        <div className="bg-white border border-stone-200 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div>
            <h3 className="text-lg font-bold text-stone-900">
              Join Simhastha Kumbh Seva Corps
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Serve millions of sacred pilgrims in Nashik and Trimbakeshwar. Background verification and police clearance mandatory before official badge issuance.
            </p>
          </div>

          {registerSuccess ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-950 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                <Check className="w-5 h-5 text-emerald-600" />
                <span>Application Submitted to Kumbh Seva Registry</span>
              </div>
              <p className="leading-relaxed">
                Thank you for offering your seva. Your profile reference number is <strong>VOL-APP-2027-4482</strong>. The District Administration and partner NGO committee will contact you for mandatory briefing and ID credentialing.
              </p>
            </div>
          ) : (
            <form onSubmit={handleRegisterVolunteer} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Full Name (As per Govt ID)</label>
                <input
                  required
                  type="text"
                  value={volunteerName}
                  onChange={(e) => setVolunteerName(e.target.value)}
                  placeholder="e.g. Ramesh Narayan Kulkarni"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Mobile Number (With WhatsApp)</label>
                <input
                  required
                  type="tel"
                  value={volunteerPhone}
                  onChange={(e) => setVolunteerPhone(e.target.value)}
                  placeholder="+91 98220 00000"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Primary Seva Expertise</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {(Object.keys(EXPERTISE_LABELS) as VolunteerExpertise[]).map((exp) => (
                    <label 
                      key={exp} 
                      className="flex items-center gap-2 p-2 bg-stone-50 rounded-xl border border-stone-200 cursor-pointer hover:bg-stone-100"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSkills.includes(exp)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedSkills([...selectedSkills, exp]);
                          else setSelectedSkills(selectedSkills.filter(s => s !== exp));
                        }}
                        className="rounded text-orange-600 focus:ring-orange-500"
                      />
                      <span className="text-[11px] font-medium text-stone-800">
                        {EXPERTISE_LABELS[exp]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-stone-100 rounded-xl text-stone-600 text-[11px] leading-relaxed">
                By submitting, you pledge to adhere to the Kumbh Pilgrim Dignity Charter, attend certified disaster triage training, and consent to identity verification.
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl transition shadow-xs"
              >
                Submit Volunteer Registration
              </button>
            </form>
          )}
        </div>
      )}

      {/* Request Assistance Modal */}
      {targetVolunteer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-3.5 border border-stone-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
              <div>
                <h3 className="font-bold text-stone-900 text-base">
                  Request Seva Assistance
                </h3>
                <p className="text-xs text-stone-500">
                  From: {targetVolunteer.name} ({targetVolunteer.assignedZone})
                </p>
              </div>
              <button
                onClick={() => setTargetVolunteer(null)}
                className="text-xs font-bold text-stone-400 hover:text-stone-700 p-1"
              >
                ✕
              </button>
            </div>

            {requestSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-950 text-xs text-center space-y-1">
                <Check className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="font-bold text-sm">Assistance Request Sent</p>
                <p className="text-[11px] text-emerald-800">
                  {targetVolunteer.name} has been notified at their duty post. They will contact you shortly.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Your Current Location / Landmark</label>
                  <input
                    type="text"
                    value={requestLocation}
                    onChange={(e) => setRequestLocation(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                    placeholder="e.g. Ramkund Gate 2 near Water Dispenser"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Assistance Details / Special Needs</label>
                  <textarea
                    rows={3}
                    value={requestNotes}
                    onChange={(e) => setRequestNotes(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-stone-900"
                    placeholder="e.g. Wheelchair assistance needed for grandmother (80 yrs) to reach bathing enclosure."
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setTargetVolunteer(null)}
                    className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={submittingRequest}
                    onClick={handleSendRequest}
                    className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-1.5"
                  >
                    {submittingRequest ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <span>Dispatch Request</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
