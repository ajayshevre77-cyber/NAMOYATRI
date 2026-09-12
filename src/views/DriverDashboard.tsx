import React, { useState } from 'react';
import { 
  Car, 
  CheckCircle2, 
  MapPin, 
  Clock, 
  ShieldCheck, 
  QrCode, 
  DollarSign, 
  TrendingUp, 
  Navigation,
  Check,
  AlertTriangle
} from 'lucide-react';
import { SupportedLanguage } from '../i18n';
import { VerificationBadge } from '../components/VerificationBadge';
import { PlaceholderNotice } from '../components/PlaceholderNotice';

interface Props {
  currentLanguage: SupportedLanguage;
}

export const DriverDashboard: React.FC<Props> = ({ currentLanguage }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [activeQueueTab, setActiveQueueTab] = useState<'available' | 'completed'>('available');

  const incomingTrips = [
    {
      id: 'trip_01',
      pickup: 'Nashik Road Railway Station Bay 3',
      drop: 'Ramkund Holy Bathing Step 1',
      distance: '8.4 km',
      fare: '₹145',
      estTime: '22 mins',
      passenger: 'Pilgrim Family (3 pax)',
      paymentMode: 'Direct UPI / Regulated Meter',
    },
    {
      id: 'trip_02',
      pickup: 'Outer Satellite Parking P4 (Adgaon)',
      drop: 'Panchavati Circle Gate',
      distance: '5.2 km',
      fare: '₹95',
      estTime: '14 mins',
      passenger: 'Senior Devotee',
      paymentMode: 'Namo Mobility Pass Reimbursed',
    },
  ];

  return (
    <div id="driver-dashboard-view" className="space-y-5 pb-12">
      {/* Driver Header */}
      <div className="bg-stone-900 text-white rounded-3xl p-5 sm:p-6 border border-stone-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-orange-400 font-bold uppercase tracking-wider">
                Driver Partner Portal
              </span>
              <VerificationBadge tier="verified_driver" size="sm" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-serif text-white mt-1">
              Santosh G. Shinde
            </h2>
            <p className="text-xs text-stone-400">
              Vehicle: MH-15-EC-4821 (Electric Auto) • Nashik RTO Verified
            </p>
          </div>

          <button
            onClick={() => setIsOnline(!isOnline)}
            className={`px-4 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm ${
              isOnline ? 'bg-emerald-600 text-white' : 'bg-stone-700 text-stone-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-white animate-pulse' : 'bg-stone-400'}`} />
            <span>{isOnline ? 'ONLINE & ACCEPTING' : 'GO ONLINE'}</span>
          </button>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-stone-800 text-center">
          <div className="p-2.5 bg-black/40 rounded-2xl border border-white/5">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Today's Trips</span>
            <span className="text-lg font-black text-white">9</span>
          </div>
          <div className="p-2.5 bg-black/40 rounded-2xl border border-white/5">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Earnings</span>
            <span className="text-lg font-black text-emerald-400">₹1,420</span>
          </div>
          <div className="p-2.5 bg-black/40 rounded-2xl border border-white/5">
            <span className="text-[10px] uppercase font-bold text-stone-400 block">Driver Rating</span>
            <span className="text-lg font-black text-amber-400">4.9 ★</span>
          </div>
        </div>
      </div>

      <PlaceholderNotice
        title="Regulated Zero-Commission Driver Dispatch"
        description="Namo Yatri operates under the open mobility framework with zero commission deductions. All fares calculated adhere to Nashik Regional Transport Authority (RTA) pilgrimage tariffs."
        integrationName="Nashik RTO Open Mobility Gateway"
      />

      {/* Available Requests Queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-stone-800">
            Incoming Pilgrim Trip Requests ({incomingTrips.length})
          </h3>
          <span className="text-xs text-stone-500">Auto-refreshing queue</span>
        </div>

        <div className="space-y-2.5">
          {incomingTrips.map((trip) => (
            <div
              key={trip.id}
              className="bg-white border border-stone-200 rounded-3xl p-4 shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-orange-100 text-orange-800">
                    Regulated Meter Fare
                  </span>
                  <h4 className="font-bold text-stone-900 text-sm mt-1">
                    {trip.passenger}
                  </h4>
                  <p className="text-[11px] text-stone-400">{trip.paymentMode}</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black font-serif text-stone-900">{trip.fare}</span>
                  <p className="text-[10px] text-stone-400">~{trip.estTime}</p>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-stone-600 bg-stone-50 p-2.5 rounded-2xl border border-stone-100">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Pickup: <strong>{trip.pickup}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  <span>Drop: <strong>{trip.drop}</strong></span>
                </div>
              </div>

              <div className="flex gap-2">
                <button className="flex-1 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl">
                  Decline
                </button>
                <button className="flex-1 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl">
                  Accept Trip
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
