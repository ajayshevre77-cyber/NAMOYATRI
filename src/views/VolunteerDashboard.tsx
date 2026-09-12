import React, { useState } from 'react';
import { 
  HeartHandshake, 
  MapPin, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Users, 
  PhoneCall,
  Check,
  AlertTriangle
} from 'lucide-react';
import { SupportedLanguage } from '../i18n';
import { VerificationBadge } from '../components/VerificationBadge';
import { PlaceholderNotice } from '../components/PlaceholderNotice';

interface Props {
  currentLanguage: SupportedLanguage;
}

export const VolunteerDashboard: React.FC<Props> = ({ currentLanguage }) => {
  const [isCheckedIn, setIsCheckedIn] = useState(true);

  const activeAssistanceQueue = [
    {
      id: 'ast_01',
      pilgrimName: 'Kanta Devi (Senior Citizen, 74 yrs)',
      location: 'Ramkund Step 2 near Water Dispenser',
      need: 'Wheelchair guidance & safe seating at sacred bathing ghat',
      time: '5 mins ago',
      contact: '+91 98220 11111',
    },
    {
      id: 'ast_02',
      pilgrimName: 'D. K. Venkatraman (Language Barrier - Tamil/Telugu)',
      location: 'Panchavati Circle Bus Terminus',
      need: 'Needs bus route direction to Kushavarta Kund Trimbakeshwar',
      time: '12 mins ago',
      contact: '+91 94440 22334',
    },
  ];

  return (
    <div id="volunteer-dashboard-view" className="space-y-5 pb-12">
      {/* Volunteer Header */}
      <div className="bg-gradient-to-br from-sky-950 via-stone-900 to-stone-950 text-white rounded-3xl p-5 sm:p-6 border border-sky-900/40 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-sky-400 font-bold uppercase tracking-wider">
                Authorized Volunteer Field Portal
              </span>
              <VerificationBadge tier="official_authorized" size="sm" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-serif text-white mt-1">
              Pooja Madhavrao Deshmukh
            </h2>
            <p className="text-xs text-stone-300">
              Badge: VOL-NAS-2027-0104 • Bharat Seva Mandal & DDMA Empanelled
            </p>
          </div>

          <button
            onClick={() => setIsCheckedIn(!isCheckedIn)}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm ${
              isCheckedIn ? 'bg-emerald-600 text-white' : 'bg-stone-700 text-stone-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isCheckedIn ? 'bg-white animate-pulse' : 'bg-stone-400'}`} />
            <span>{isCheckedIn ? 'ON DUTY (SECTOR 1)' : 'CHECK IN'}</span>
          </button>
        </div>

        {/* Sector Info */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-stone-800 text-xs">
          <div className="p-2 bg-black/40 rounded-xl">
            <span className="text-stone-400 block text-[10px]">Duty Sector</span>
            <span className="font-bold text-white">Sector 1 (Ramkund Core)</span>
          </div>
          <div className="p-2 bg-black/40 rounded-xl">
            <span className="text-stone-400 block text-[10px]">Duty Shift</span>
            <span className="font-bold text-white">06:00 AM - 02:00 PM</span>
          </div>
          <div className="p-2 bg-black/40 rounded-xl">
            <span className="text-stone-400 block text-[10px]">Assists Completed</span>
            <span className="font-bold text-emerald-400">14 Pilgrims</span>
          </div>
          <div className="p-2 bg-black/40 rounded-xl">
            <span className="text-stone-400 block text-[10px]">Sector Officer</span>
            <span className="font-bold text-amber-300">Insp. V. K. Kadam</span>
          </div>
        </div>
      </div>

      <PlaceholderNotice
        title="Field Volunteer Coordination Network"
        description="Volunteer assignments are coordinated via the District Disaster Management Authority (DDMA) volunteer desk. Direct escalation lines are available to Sector Police & Medical Teams."
        integrationName="Kumbh Seva Ops Desk"
      />

      {/* Assistance Requests Queue */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-stone-800">
          Assistance Requests Assigned to Your Post ({activeAssistanceQueue.length})
        </h3>

        <div className="space-y-2.5">
          {activeAssistanceQueue.map((ast) => (
            <div
              key={ast.id}
              className="bg-white border border-stone-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-2.5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-stone-900 text-sm">
                    {ast.pilgrimName}
                  </h4>
                  <div className="flex items-center gap-1 text-xs text-stone-500 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                    <span>{ast.location}</span>
                  </div>
                </div>
                <span className="text-[10px] text-stone-400">{ast.time}</span>
              </div>

              <p className="text-xs text-stone-700 bg-stone-50 p-2.5 rounded-2xl border border-stone-100 leading-relaxed">
                <strong>Need:</strong> {ast.need}
              </p>

              <div className="flex items-center justify-between pt-1">
                <a
                  href={`tel:${ast.contact}`}
                  className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Call Pilgrim ({ast.contact})</span>
                </a>

                <button className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Mark Resolved</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
