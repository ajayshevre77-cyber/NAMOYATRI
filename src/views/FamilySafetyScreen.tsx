import React, { useState } from 'react';
import { 
  Users, 
  MapPin, 
  Battery, 
  Clock, 
  ShieldCheck, 
  Plus, 
  QrCode, 
  Phone, 
  Share2, 
  Lock, 
  Check, 
  AlertCircle,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { SupportedLanguage, translations } from '../i18n';
import { FamilyGroup, FamilyMember } from '../types';
import { PlaceholderNotice } from '../components/PlaceholderNotice';

interface Props {
  currentLanguage: SupportedLanguage;
}

const DEFAULT_FAMILY_GROUP: FamilyGroup = {
  id: 'grp_001',
  groupCode: 'KUMBH-7842',
  name: 'Sharma Parivar Yatra',
  leaderUserId: 'usr_guest_01',
  designatedMeetingPoint: 'Ramkund Information Tower 4 (Under Flagpole)',
  createdAt: 'Today, 06:30 AM',
  members: [
    {
      userId: 'usr_01',
      name: 'Ramesh Sharma (You)',
      relationship: 'Self / Leader',
      batteryLevelPercent: 88,
      lastCheckInTime: '2 mins ago',
      approxZone: 'Ramkund Bathing Step 1',
      isLocationSharingEnabled: true,
      emergencyContactNumber: '+91 98220 11111',
    },
    {
      userId: 'usr_02',
      name: 'Sunita Sharma',
      relationship: 'Spouse',
      batteryLevelPercent: 72,
      lastCheckInTime: '10 mins ago',
      approxZone: 'Panchavati Kalaram Mandir Corridor',
      isLocationSharingEnabled: true,
      emergencyContactNumber: '+91 98220 22222',
    },
    {
      userId: 'usr_03',
      name: 'Omkar Sharma',
      relationship: 'Son (14 yrs)',
      batteryLevelPercent: 44,
      lastCheckInTime: '18 mins ago',
      approxZone: 'Near Tapovan Shuttle Boarding Bay',
      isLocationSharingEnabled: true,
      emergencyContactNumber: '+91 98220 33333',
    },
    {
      userId: 'usr_04',
      name: 'Kanta Devi Sharma',
      relationship: 'Mother (Senior Citizen, 74 yrs)',
      batteryLevelPercent: 65,
      lastCheckInTime: '5 mins ago',
      approxZone: 'Senior Rest Camp #3 (Accompanied by Volunteer)',
      isLocationSharingEnabled: true,
      emergencyContactNumber: '+91 98220 11111',
    },
  ],
};

const MEETING_POINTS = [
  'Ramkund Information Tower 4 (Under Flagpole)',
  'Kalaram Mandir North Gate Fountain',
  'Panchavati Police Chowki Sector 1',
  'Trimbakeshwar Temple Bus Station Gate 3',
  'Sadhu Gram Central Lost Person Seva Tent',
  'Adgaon Satellite Parking Hub P4 Feeder Bay',
];

export const FamilySafetyScreen: React.FC<Props> = ({
  currentLanguage,
}) => {
  const t = translations[currentLanguage];

  const [familyGroup, setFamilyGroup] = useState<FamilyGroup | null>(DEFAULT_FAMILY_GROUP);
  const [meetingPoint, setMeetingPoint] = useState(DEFAULT_FAMILY_GROUP.designatedMeetingPoint);
  const [optInLocation, setOptInLocation] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  // Modal / input state for joining or creating
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [newGroupNameInput, setNewGroupNameInput] = useState('');

  const handleCopyCode = () => {
    if (familyGroup && navigator.clipboard) {
      navigator.clipboard.writeText(familyGroup.groupCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCheckInNow = () => {
    if (!familyGroup) return;
    const updated = { ...familyGroup };
    updated.members[0].lastCheckInTime = 'Just now';
    setFamilyGroup(updated);
  };

  return (
    <div id="family-safety-screen-view" className="space-y-5 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold font-serif text-stone-900">
          Family Safety & Group Coordination
        </h2>
        <p className="text-xs sm:text-sm text-stone-500">
          Stay connected with family members amidst large Kumbh gatherings with zero panic.
        </p>
      </div>

      {/* Privacy Notice */}
      <PlaceholderNotice
        title="Privacy-First Opt-In Geolocation"
        description="Location sharing is strictly opt-in and controllable by each pilgrim. Data is encrypted end-to-end and never sold or shared with commercial entities."
        integrationName="Private Family Safety Protocol"
      />

      {familyGroup ? (
        <div className="space-y-4">
          {/* Group Header Card */}
          <div className="bg-gradient-to-br from-purple-900 via-stone-900 to-stone-950 text-white p-5 rounded-3xl shadow-md border border-purple-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  FAMILY GROUP ACTIVE
                </span>
                <h3 className="text-lg sm:text-xl font-bold mt-1 text-white">
                  {familyGroup.name}
                </h3>
              </div>

              {/* Group Code Chip */}
              <button
                id="copy-family-code-btn"
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-1.5 rounded-xl text-xs font-mono transition"
                title="Tap to copy 6-digit Join Code"
              >
                <span>Code: <strong>{familyGroup.groupCode}</strong></span>
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-stone-300" />}
              </button>
            </div>

            {/* Designated Meeting Point */}
            <div className="p-3 bg-black/40 rounded-2xl border border-white/10 text-xs space-y-1">
              <div className="flex items-center justify-between text-purple-200">
                <span className="font-bold flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-orange-400" />
                  <span>Designated Kumbh Reunion Point</span>
                </span>
                <span className="text-[10px] text-stone-400">If disconnected, gather here</span>
              </div>
              <select
                id="meeting-point-select"
                value={meetingPoint}
                onChange={(e) => setMeetingPoint(e.target.value)}
                className="w-full bg-stone-900/90 text-white border border-stone-700 rounded-xl p-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                {MEETING_POINTS.map((mp, idx) => (
                  <option key={idx} value={mp}>
                    {mp}
                  </option>
                ))}
              </select>
            </div>

            {/* Personal Privacy Toggle & Check-in action */}
            <div className="flex items-center justify-between pt-1 text-xs">
              <div className="flex items-center gap-2">
                <button
                  id="opt-in-location-toggle"
                  onClick={() => setOptInLocation(!optInLocation)}
                  className="flex items-center gap-1.5 text-xs text-stone-300 hover:text-white"
                >
                  {optInLocation ? (
                    <ToggleRight className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-stone-500" />
                  )}
                  <span>Location Sharing: <strong>{optInLocation ? 'Enabled' : 'Paused'}</strong></span>
                </button>
              </div>

              <button
                id="manual-checkin-btn"
                onClick={handleCheckInNow}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl transition shadow-xs"
              >
                Check-in Now
              </button>
            </div>
          </div>

          {/* Members List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-stone-800">
                Group Members ({familyGroup.members.length})
              </h3>
              <span className="text-[11px] text-stone-500">Live Battery & Status</span>
            </div>

            <div className="space-y-2">
              {familyGroup.members.map((member, idx) => (
                <div
                  key={idx}
                  id={`family-member-card-${idx}`}
                  className="bg-white border border-stone-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-stone-900 text-xs sm:text-sm">
                        {member.name}
                      </h4>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 font-medium">
                        {member.relationship}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-stone-500">
                      <MapPin className="w-3 h-3 text-orange-600 shrink-0" />
                      <span className="truncate max-w-[200px] sm:max-w-xs">{member.approxZone}</span>
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-stone-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Last check-in: {member.lastCheckInTime}</span>
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0 space-y-1">
                    <div className="flex items-center gap-1 text-xs font-semibold justify-end">
                      <Battery className={`w-3.5 h-3.5 ${
                        member.batteryLevelPercent < 20 ? 'text-red-600' : 'text-emerald-600'
                      }`} />
                      <span className={member.batteryLevelPercent < 20 ? 'text-red-700 font-bold' : 'text-stone-700'}>
                        {member.batteryLevelPercent}%
                      </span>
                    </div>
                    <a
                      href={`tel:${member.emergencyContactNumber}`}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 px-2 py-0.5 rounded-lg"
                    >
                      <Phone className="w-3 h-3" />
                      <span>Call</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* NO GROUP JOINED YET */
        <div className="bg-white border border-stone-200 rounded-3xl p-6 text-center space-y-4 shadow-xs">
          <Users className="w-12 h-12 text-purple-600 mx-auto" />
          <div>
            <h3 className="font-bold text-stone-900 text-base">
              Coordinate with Your Family on Yatra
            </h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto mt-1 leading-relaxed">
              Create a private group or join using a 6-digit invitation code to view battery levels, check-in pings, and designate meeting points.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
            <button
              onClick={() => setFamilyGroup(DEFAULT_FAMILY_GROUP)}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
            >
              Create New Family Group
            </button>
            <button
              onClick={() => setShowJoinModal(true)}
              className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition border border-stone-200"
            >
              Join Existing Group with Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
