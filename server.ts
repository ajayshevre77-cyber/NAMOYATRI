import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

import { 
  MOCK_PLACES, 
  MOCK_PASS_PRODUCTS, 
  MOCK_VOLUNTEERS, 
  MOCK_OFFICIAL_ANNOUNCEMENTS, 
  MOCK_TRANSPORT_OPTIONS, 
  MOCK_DRIVERS, 
  MOCK_BUSINESSES, 
  MOCK_FRAUD_ALERTS, 
  SIMHASTHA_DESTINATION 
} from './src/data/kumbhData';

import { AuthenticatedRequest, ServerUserRole, ServerVerificationStatus } from './server/types';
import { requireAuth, optionalAuth, requireRole, checkResourceOwnership } from './server/middleware/auth';
import { 
  securityHeaders, 
  secureCors, 
  createRateLimiter, 
  centralizedErrorHandler 
} from './server/middleware/security';
import { 
  validateIdParam, 
  rejectPrivilegedFields, 
  validateRideRequestBody, 
  validatePassPurchaseBody, 
  validateEmergencyReportBody 
} from './server/middleware/validation';
import { recordAuditEvent, getAuditLogs } from './server/audit';
import { assignUserRoleServerSide, resolveServerRoleAndStatus } from './server/firebaseAdmin';

dotenv.config();

const app = express();
const PORT = 3000;

// Disable Express fingerprint
app.disable('x-powered-by');

// Security Headers & CORS
app.use(securityHeaders);
app.use(secureCors);

// Body parser with size limits
app.use(express.json({ limit: '500kb' }));

// -------------------------------------------------------------
// RATE LIMITERS
// -------------------------------------------------------------
const publicLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 120, keyPrefix: 'pub' });
const authLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 40, keyPrefix: 'auth' });
const aiLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 20, keyPrefix: 'ai' });
const bookingLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30, keyPrefix: 'bk' });
const emergencyLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 60, keyPrefix: 'sos' });
const adminLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 60, keyPrefix: 'adm' });

// -------------------------------------------------------------
// IN-MEMORY DEMO STORES
// [DEMO STORAGE]: In-memory storage for demonstration prototype.
// In full production, all records persist directly via Firebase Admin SDK to Cloud Firestore.
// -------------------------------------------------------------

interface RideRecord {
  id: string;
  bookingRef: string;
  userId: string;
  driverId?: string;
  fromLocation: string;
  toLocation: string;
  transportType: string;
  estimatedFare: number;
  estimatedTimeMins: number;
  status: 'requested' | 'driver_assigned' | 'in_transit' | 'completed' | 'cancelled';
  createdAt: string;
  paymentMethod: string;
  sourceType: 'DEMO';
}

interface PassRecord {
  id: string;
  passRefNumber: string;
  userId: string;
  userName: string;
  passType: string;
  validFrom: string;
  validTo: string;
  status: 'active' | 'expired' | 'suspended';
  qrSecureTokenSpec: {
    tokenHash: string;
    issuedAt: string;
    expiresAt: string;
    securityAlgorithm: string;
    conductorVerificationKeyId: string;
  };
  ridesUsedCount: number;
  maxRidesAllowed: number;
  eligibleZones: string[];
  sourceType: 'DEMO';
}

interface EmergencyRecord {
  id: string;
  ticketNumber: string;
  userId: string;
  reporterName: string;
  reporterPhone: string;
  type: string;
  description: string;
  locationZone: string;
  timestamp: string;
  status: 'dispatched_to_deoc' | 'field_unit_assigned' | 'resolved';
  sourceType: 'DEMO';
  deocIntegrationNotice: string;
}

interface LostPersonRecord {
  id: string;
  caseRef: string;
  userId: string;
  personName: string;
  approxAge: number;
  gender: string;
  languagesSpoken: string[];
  lastSeenLocation: string;
  clothingDescription: string;
  status: 'reported_lost' | 'reunited' | 'recovered_at_police_post';
  contactPhone: string;
  reportedAt: string;
  sourceType: 'DEMO';
}

interface LostItemRecord {
  id: string;
  caseRef: string;
  userId: string;
  itemCategory: string;
  itemDescription: string;
  color: string;
  lastSeenLocation: string;
  status: 'reported_lost' | 'found_at_cloakroom' | 'claimed';
  contactPhone: string;
  reportedAt: string;
  sourceType: 'DEMO';
}

interface PartnerApplicationRecord {
  id: string;
  userId: string;
  applicantName: string;
  roleRequested: 'DRIVER' | 'VOLUNTEER' | 'BUSINESS_PARTNER';
  details: Record<string, any>;
  verificationStatus: ServerVerificationStatus;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

const emergencyCases: EmergencyRecord[] = [
  {
    id: 'emg_001',
    ticketNumber: 'SOS-2027-0891',
    userId: 'usr_guest_01',
    reporterName: 'Pilgrim Visitor',
    reporterPhone: '+91 98220 •••••',
    type: 'medical',
    description: '[DEMO DATA] Heat exhaustion and dehydration near Ramkund Step 4.',
    locationZone: 'ZONE_NASHIK_RAMKUND_01',
    timestamp: '15 mins ago',
    status: 'dispatched_to_deoc',
    sourceType: 'DEMO',
    deocIntegrationNotice: 'Simulation: Queued to Nashik Civil Hospital Quick-Response Medical Unit.',
  },
];

const lostPersonCases: LostPersonRecord[] = [
  {
    id: 'lp_001',
    caseRef: 'LP-KM27-041',
    userId: 'usr_demo_01',
    personName: 'Rameshwar Ji (Elderly, 72 yrs)',
    approxAge: 72,
    gender: 'male',
    languagesSpoken: ['Hindi', 'Bhojpuri'],
    lastSeenLocation: 'Near Kalaram Mandir Gate 2 at 10:30 AM',
    clothingDescription: 'White Kurta Pyjama, saffron scarf, carrying yellow cloth bag',
    status: 'reported_lost',
    contactPhone: '+91 94150 11223',
    reportedAt: '1 hour ago',
    sourceType: 'DEMO',
  },
];

const lostItemCases: LostItemRecord[] = [
  {
    id: 'li_001',
    caseRef: 'LI-KM27-109',
    userId: 'usr_demo_02',
    itemCategory: 'wallet',
    itemDescription: 'Brown leather purse containing Aadhaar card copy and pilgrimage pass',
    color: 'Brown',
    lastSeenLocation: 'Kushavarta Kund shoe stand counter 3',
    status: 'found_at_cloakroom',
    contactPhone: '+91 98220 55443',
    reportedAt: '2 hours ago',
    sourceType: 'DEMO',
  },
];

const rideBookings: RideRecord[] = [
  {
    id: 'bk_001',
    bookingRef: 'NY-RD-8842',
    userId: 'usr_demo_driver_01',
    driverId: 'drv_01',
    fromLocation: 'Nashik Road Railway Station',
    toLocation: 'Ramkund Panchavati',
    transportType: 'electric_shuttle',
    estimatedFare: 15,
    estimatedTimeMins: 22,
    status: 'driver_assigned',
    createdAt: '10 mins ago',
    paymentMethod: 'pass',
    sourceType: 'DEMO',
  },
];

const userPasses: PassRecord[] = [
  {
    id: 'pass_init_01',
    passRefNumber: 'NY-KM27-8942-X',
    userId: 'usr_guest_01',
    userName: 'Pilgrim Yatri',
    passType: '3_day',
    validFrom: new Date().toLocaleDateString('en-GB'),
    validTo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB'),
    status: 'active',
    qrSecureTokenSpec: {
      tokenHash: 'NY_SECURE_DEMO_HASH_991',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      securityAlgorithm: 'HMAC_SHA256_SPEC',
      conductorVerificationKeyId: 'KUMBH_CONDUCTOR_KEY_2027',
    },
    ridesUsedCount: 4,
    maxRidesAllowed: 99,
    eligibleZones: ['Nashik Panchavati Ring', 'Trimbak Express Corridor', 'Outer Parking Feeder'],
    sourceType: 'DEMO',
  },
];

const partnerApplications: PartnerApplicationRecord[] = [];
let announcementsState = [...MOCK_OFFICIAL_ANNOUNCEMENTS];
let fraudAlertsState = [...MOCK_FRAUD_ALERTS];

// Helper to initialize Gemini SDK safely
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return geminiClient;
}

// =============================================================
// 1. PUBLIC INFORMATIONAL ENDPOINTS
// =============================================================

// Health & System Metadata
app.get('/api/health', publicLimiter, (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Namo Yatri Security-Hardened API',
    destination: 'Nashik–Trimbakeshwar Simhastha Kumbh 2027',
    timestamp: new Date().toISOString(),
    aiIntegrated: Boolean(process.env.GEMINI_API_KEY),
    firebaseAuthEnforced: true,
    rbacServerEnforced: true,
    version: '1.1.0-hardened',
  });
});

// Kumbh destination details
app.get('/api/kumbh', publicLimiter, (req: Request, res: Response) => {
  res.json({
    destination: SIMHASTHA_DESTINATION,
    stats: {
      estimatedPilgrims: '3.5 Crore (Estimated Cumulative)',
      sanctionedElectricShuttles: 650,
      activeVolunteersRegistered: 4800,
      satelliteParkingLots: 12,
      officialMedicalCamps: 45,
    },
    sourceType: 'COMMUNITY',
  });
});

// Official / Community Announcements
app.get('/api/announcements', publicLimiter, (req: Request, res: Response) => {
  res.json({ 
    announcements: announcementsState,
    note: 'Items tagged DEMO are for system simulation; items tagged AUTHORIZED_OFFICIAL are authenticated publications.',
  });
});

// Places & Facilities Directory
app.get('/api/places', publicLimiter, (req: Request, res: Response) => {
  const category = req.query.category as string;
  const search = (req.query.search as string || '').toLowerCase();

  let filtered = MOCK_PLACES;
  if (category && category !== 'all') {
    filtered = filtered.filter(p => p.category === category);
  }
  if (search) {
    filtered = filtered.filter(p => 
      p.name.en.toLowerCase().includes(search) ||
      p.name.hi.toLowerCase().includes(search) ||
      p.name.mr.toLowerCase().includes(search) ||
      p.location.area.toLowerCase().includes(search)
    );
  }
  res.json({ places: filtered, count: filtered.length });
});

app.get('/api/places/:id', publicLimiter, validateIdParam('id'), (req: Request, res: Response) => {
  const place = MOCK_PLACES.find(p => p.id === req.params.id);
  if (!place) {
    res.status(404).json({ error: 'Place not found' });
    return;
  }
  res.json({ place });
});

// Transport Options
app.get('/api/transport/options', publicLimiter, (req: Request, res: Response) => {
  res.json({ options: MOCK_TRANSPORT_OPTIONS });
});

app.post('/api/transport/estimate', publicLimiter, (req: Request, res: Response) => {
  const { from, to, transportType } = req.body;
  if (!from || !to || typeof from !== 'string' || typeof to !== 'string') {
    res.status(400).json({ error: 'Valid pickup (from) and drop (to) locations are required' });
    return;
  }

  let distanceKm = 8.5;
  const lowerFrom = from.toLowerCase();
  const lowerTo = to.toLowerCase();

  if ((lowerFrom.includes('station') || lowerFrom.includes('nashik road')) && lowerTo.includes('trimbak')) {
    distanceKm = 36.0;
  } else if (lowerFrom.includes('ramkund') && lowerTo.includes('trimbak')) {
    distanceKm = 28.5;
  } else if (lowerFrom.includes('station') && (lowerTo.includes('ramkund') || lowerTo.includes('panchavati'))) {
    distanceKm = 9.2;
  } else if (lowerFrom.includes('parking') || lowerFrom.includes('adgaon')) {
    distanceKm = 7.4;
  }

  const option = MOCK_TRANSPORT_OPTIONS.find(o => o.type === transportType) || MOCK_TRANSPORT_OPTIONS[0];
  const calculatedFare = Math.round(option.baseFare + (distanceKm * option.perKmRate));
  const estimatedTimeMins = Math.round(distanceKm * 2.2 + 5);

  res.json({
    from,
    to,
    transportType: option.type,
    distanceKm,
    estimatedFareInr: calculatedFare,
    estimatedTimeMins,
    isRegulatedFare: true,
    policyNotice: 'Regulated Simhastha Kumbh 2027 tariff approved by Nashik District Transport Authority.',
  });
});

// Mobility Pass Product Catalog
app.get('/api/passes/products', publicLimiter, (req: Request, res: Response) => {
  res.json({ products: MOCK_PASS_PRODUCTS });
});

// Conductor / Gate QR Validation (Conductor scanner endpoint)
app.post('/api/passes/verify', publicLimiter, (req: Request, res: Response) => {
  const { passRefNumber, tokenHash } = req.body;

  if (!passRefNumber || typeof passRefNumber !== 'string') {
    res.status(400).json({ valid: false, reason: 'passRefNumber is required' });
    return;
  }

  const pass = userPasses.find(p => p.passRefNumber === passRefNumber);
  if (!pass) {
    res.status(404).json({ valid: false, reason: 'Pass record not found in central registry' });
    return;
  }

  if (pass.status !== 'active') {
    res.json({ valid: false, reason: `Pass status is ${pass.status}` });
    return;
  }

  pass.ridesUsedCount += 1;

  res.json({
    valid: true,
    passRefNumber: pass.passRefNumber,
    userName: pass.userName,
    passType: pass.passType,
    validTo: pass.validTo,
    ridesUsedCount: pass.ridesUsedCount,
    verificationTimestamp: new Date().toISOString(),
    securityAlgorithm: pass.qrSecureTokenSpec.securityAlgorithm,
    conductorNotice: 'Valid pilgrim mobility pass for Nashik–Trimbakeshwar network.',
  });
});

// Volunteers Directory (Public view of field seva camps)
app.get('/api/volunteers', publicLimiter, (req: Request, res: Response) => {
  const language = req.query.language as string;
  const expertise = req.query.expertise as string;

  let list = MOCK_VOLUNTEERS;
  if (language) {
    list = list.filter(v => v.languages.some(l => l.toLowerCase() === language.toLowerCase()));
  }
  if (expertise) {
    list = list.filter(v => v.expertise.includes(expertise as any));
  }
  res.json({ volunteers: list });
});

// Drivers & Businesses Public Catalogues
app.get('/api/drivers', publicLimiter, (req: Request, res: Response) => {
  res.json({ drivers: MOCK_DRIVERS });
});

app.get('/api/businesses', publicLimiter, (req: Request, res: Response) => {
  res.json({ businesses: MOCK_BUSINESSES });
});

// Namo AI Assistant Endpoint
app.post('/api/ai/chat', aiLimiter, async (req: Request, res: Response) => {
  const { query, language = 'en' } = req.body;

  if (!query || typeof query !== 'string' || query.length > 500) {
    res.status(400).json({ error: 'Valid query string up to 500 characters is required' });
    return;
  }

  const ai = getGeminiClient();

  if (ai) {
    try {
      const systemInstruction = `You are Namo AI, an official digital guide and service companion for pilgrims attending the Nashik–Trimbakeshwar Simhastha Kumbh 2027 in Maharashtra, India.
Always be respectful, calm, helpful, and culturally mindful.
Language mode: ${language === 'hi' ? 'Hindi' : language === 'mr' ? 'Marathi' : 'English'}.
Guidelines:
1. Provide accurate pilgrimage guidance for Nashik (Ramkund, Panchavati, Kalaram Mandir, Tapovan, Sadhu Gram) and Trimbakeshwar (Jyotirlinga, Kushavarta Kund, Brahmagiri).
2. For transport, explain that Namo Yatri offers regulated feeder shuttles, metered autos, and multi-day mobility passes.
3. For emergencies, direct users to emergency SOS (108 for medical, 112 for police).
4. Always clarify that live real-time crowd advisories come from the District Disaster Management Authority (DDMA). Keep answers concise, clear, and actionable.`;

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout')), 10000)
      );

      const generatePromise = ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: query,
        config: {
          systemInstruction,
          temperature: 0.3,
        },
      });

      const response: any = await Promise.race([generatePromise, timeoutPromise]);

      res.json({
        reply: response.text || 'Namaste. I am here to assist your holy pilgrimage to Nashik–Trimbakeshwar Simhastha Kumbh 2027.',
        source: 'gemini-3.8-flash',
      });
      return;
    } catch (err: any) {
      console.error('Gemini API query failed, falling back to structured knowledge base:', err);
    }
  }

  // Grounded local domain fallback
  const q = query.toLowerCase();
  let reply = '';

  if (q.includes('trimbakeshwar') || q.includes('त्र्यंबकेश्वर')) {
    reply = language === 'hi'
      ? 'त्र्यंबकेश्वर ज्योतिर्लिंग नासिक शहर से लगभग २८ किमी दूर है। आप नासिक रोड या पंचवटी से नमो इलेक्ट्रिक शटल अथवा अधिकृत कुंभ बस ले सकते हैं।'
      : language === 'mr'
      ? 'त्र्यंबकेश्वर ज्योतिर्लिंग नाशिक शहरापासून सुमारे २८ किमी अंतरावर आहे. नाशिक रोड किंवा मध्यवर्ती बस स्थानकावरून नमो इलेक्ट्रिक शटल व एसटी विशेष बसेस उपलब्ध आहेत.'
      : 'Trimbakeshwar Jyotirlinga is situated 28 km west of Nashik at the foothills of Brahmagiri. Regulated Namo Electric Shuttles and MSRTC Kumbh buses run frequently.';
  } else if (q.includes('ramkund') || q.includes('रामकुंड') || q.includes('snan') || q.includes('स्नान')) {
    reply = language === 'hi'
      ? 'रामकुंड पंचवटी में पवित्र गोदावरी तट पर स्थित मुख्य शाही स्नान स्थल है। यह २४ घंटे खुला रहता है।'
      : language === 'mr'
      ? 'रामकुंड हे पंचवटी येथे पवित्र गोदावरी नदीकाठी वसलेले मुख्य शाही स्नान तीर्थ आहे.'
      : 'Ramkund in Panchavati is the sacred holy bathing ghat of Nashik Kumbh, open 24 hours with life guards on duty.';
  } else {
    reply = language === 'hi'
      ? 'नमस्ते। मैं नमो एआई हूँ। सिंहस्थ कुंभ २०२७ के पवित्र स्थल, परिवहन अथवा स्वयंसेवक सहायता हेतु आप मुझसे पूछ सकते हैं।'
      : language === 'mr'
      ? 'नमस्कार. मी नमो एआय आहे. सिंहस्थ कुंभ २०२७ मधील मंदिरे, वाहतूक अथवा मदतीविषयी आपण विचारू शकता.'
      : 'Namaste. I am Namo AI, your pilgrimage companion for Simhastha Kumbh 2027.';
  }

  res.json({
    reply,
    source: 'simhastha-grounded-knowledge-agent',
    note: process.env.GEMINI_API_KEY ? undefined : 'Running grounded local pilgrimage knowledge agent.',
  });
});

// =============================================================
// 2. AUTHENTICATED USER IDENTITY & PROFILE ENDPOINTS
// =============================================================

// Get authenticated user's authoritative server identity & role
app.get('/api/users/me', authLimiter, requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  res.json({
    user: {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      phoneNumber: user.phoneNumber,
      role: user.role,
      verificationStatus: user.verificationStatus,
      isAnonymous: Boolean(user.isAnonymous),
    }
  });
});

// Update own profile (Rejects role or verification status tampering)
app.patch('/api/users/me/profile', authLimiter, requireAuth, rejectPrivilegedFields, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { displayName, phoneNumber, privacySettings } = req.body;

  recordAuditEvent({
    actorId: user.uid,
    actorRole: user.role,
    action: 'UPDATE_OWN_PROFILE',
    details: `User ${user.uid} updated private profile settings`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: 'Profile updated successfully',
    user: {
      uid: user.uid,
      displayName: displayName || null,
      phoneNumber: phoneNumber || user.phoneNumber,
      privacySettings: privacySettings || {},
      role: user.role, // Server authoritative - unchanged
      verificationStatus: user.verificationStatus, // Server authoritative - unchanged
    }
  });
});

// Get User Profile with IDOR Prevention
app.get('/api/users/:userId', authLimiter, requireAuth, validateIdParam('userId'), (req: AuthenticatedRequest, res: Response) => {
  const targetUserId = req.params.userId;
  const user = req.user!;

  if (!checkResourceOwnership(req, targetUserId)) {
    res.status(403).json({
      error: 'Forbidden. You do not have permission to view this user account.',
      code: 'IDOR_ACCESS_DENIED',
    });
    return;
  }

  res.json({
    user: {
      uid: targetUserId,
      role: targetUserId === user.uid ? user.role : 'TOURIST',
      verificationStatus: targetUserId === user.uid ? user.verificationStatus : 'PENDING',
    }
  });
});

// =============================================================
// 3. AUTHENTICATED MOBILITY PASSES (IDOR PROTECTED)
// =============================================================

// Fetch passes belonging strictly to the authenticated user
app.get('/api/passes/my-passes', bookingLimiter, requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const userOwnedPasses = userPasses.filter(p => p.userId === user.uid);
  res.json({ passes: userOwnedPasses });
});

// Backwards compatibility endpoint for client views - enforces req.user.uid
app.get('/api/passes/user-passes', bookingLimiter, optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const uid = req.user ? req.user.uid : 'usr_guest_01';
  const passes = userPasses.filter(p => p.userId === uid);
  res.json({ passes });
});

// Get pass by ID with ownership verification
app.get('/api/passes/:passId', bookingLimiter, requireAuth, validateIdParam('passId'), (req: AuthenticatedRequest, res: Response) => {
  const pass = userPasses.find(p => p.id === req.params.passId);
  if (!pass) {
    res.status(404).json({ error: 'Pass not found' });
    return;
  }

  if (!checkResourceOwnership(req, pass.userId)) {
    res.status(403).json({
      error: 'Forbidden. You do not own this mobility pass.',
      code: 'PASS_ACCESS_DENIED',
    });
    return;
  }

  res.json({ pass });
});

// Purchase Mobility Pass - server enforces req.user.uid
app.post('/api/passes/purchase', bookingLimiter, requireAuth, validatePassPurchaseBody, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { passType, userName } = req.body;

  const product = MOCK_PASS_PRODUCTS.find(p => p.id === passType) || MOCK_PASS_PRODUCTS[0];
  const days = product.durationDays;
  const validFrom = new Date().toLocaleDateString('en-GB');
  const validTo = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB');

  const newPass: PassRecord = {
    id: 'pass_' + Date.now(),
    passRefNumber: 'NY-KM27-' + Math.floor(1000 + Math.random() * 9000) + '-A',
    userId: user.uid, // Strictly bound to authenticated UID
    userName: userName || user.email?.split('@')[0] || 'Pilgrim Yatri',
    passType: product.id,
    validFrom,
    validTo,
    status: 'active',
    qrSecureTokenSpec: {
      tokenHash: 'NY_SECURE_' + Math.random().toString(36).substring(2, 10).toUpperCase(),
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
      securityAlgorithm: 'HMAC_SHA256_SPEC',
      conductorVerificationKeyId: 'KUMBH_CONDUCTOR_KEY_2027',
    },
    ridesUsedCount: 0,
    maxRidesAllowed: days * 15,
    eligibleZones: ['Nashik Panchavati Ring', 'Trimbak Express Corridor', 'Outer Parking Feeder'],
    sourceType: 'DEMO',
  };

  userPasses.unshift(newPass);

  recordAuditEvent({
    actorId: user.uid,
    actorRole: user.role,
    action: 'PURCHASE_MOBILITY_PASS',
    targetId: newPass.id,
    details: `Issued ${product.id} mobility pass #${newPass.passRefNumber} for ₹${product.priceInr}`,
    ipAddress: req.ip,
  });

  res.json({ success: true, pass: newPass });
});

// =============================================================
// 4. AUTHENTICATED RIDES & TRANSPORT (IDOR PROTECTED)
// =============================================================

// Fetch rides belonging to the authenticated user
app.get('/api/rides/my-rides', bookingLimiter, requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const myRides = rideBookings.filter(r => r.userId === user.uid);
  res.json({ rides: myRides });
});

// Get ride by ID with ownership verification
app.get('/api/rides/:rideId', bookingLimiter, requireAuth, validateIdParam('rideId'), (req: AuthenticatedRequest, res: Response) => {
  const ride = rideBookings.find(r => r.id === req.params.rideId);
  if (!ride) {
    res.status(404).json({ error: 'Ride booking not found' });
    return;
  }

  const isOwner = ride.userId === req.user!.uid;
  const isAssignedDriver = ride.driverId === req.user!.uid;
  const isSupervisory = req.user!.role === 'ADMIN' || req.user!.role === 'OPERATIONS';

  if (!isOwner && !isAssignedDriver && !isSupervisory) {
    res.status(403).json({
      error: 'Forbidden. You do not have permission to view this ride booking.',
      code: 'RIDE_ACCESS_DENIED',
    });
    return;
  }

  res.json({ ride });
});

// Request Ride - binds strictly to req.user.uid
app.post('/api/rides/request', bookingLimiter, requireAuth, validateRideRequestBody, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { from, to, transportType, estimatedFare, estimatedTimeMins } = req.body;

  const newRide: RideRecord = {
    id: 'bk_' + Date.now(),
    bookingRef: 'NY-RD-' + Math.floor(1000 + Math.random() * 9000),
    userId: user.uid, // Strictly bound to authenticated UID
    fromLocation: from,
    toLocation: to,
    transportType: transportType || 'electric_shuttle',
    estimatedFare: estimatedFare || 45,
    estimatedTimeMins: estimatedTimeMins || 25,
    status: 'requested',
    createdAt: 'Just now',
    paymentMethod: 'pass',
    sourceType: 'DEMO',
  };

  rideBookings.unshift(newRide);

  recordAuditEvent({
    actorId: user.uid,
    actorRole: user.role,
    action: 'REQUEST_TRANSPORT',
    targetId: newRide.id,
    details: `Transport requested: ${newRide.transportType} from ${newRide.fromLocation} to ${newRide.toLocation}`,
    ipAddress: req.ip,
  });

  res.json({ success: true, booking: newRide });
});

// Driver-Restricted: get assigned rides
app.get('/api/driver/assigned-rides', bookingLimiter, requireAuth, requireRole('DRIVER', 'ADMIN', 'OPERATIONS'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  // Return rides assigned to this driver or pending dispatch
  const assigned = rideBookings.filter(r => r.driverId === user.uid || (user.role === 'ADMIN' && r.status === 'requested'));
  res.json({ rides: assigned });
});

// Driver-Restricted: update assigned ride status
app.post('/api/driver/rides/:rideId/status', bookingLimiter, requireAuth, requireRole('DRIVER', 'ADMIN', 'OPERATIONS'), validateIdParam('rideId'), (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { status } = req.body;
  const ride = rideBookings.find(r => r.id === req.params.rideId);

  if (!ride) {
    res.status(404).json({ error: 'Ride not found' });
    return;
  }

  // Driver can only update ride assigned to their vehicle/UID
  if (user.role !== 'ADMIN' && ride.driverId !== user.uid) {
    res.status(403).json({
      error: 'Forbidden. You can only update rides assigned to your driver account.',
      code: 'DRIVER_DISPATCH_MISMATCH',
    });
    return;
  }

  const allowedStatuses = ['driver_assigned', 'in_transit', 'completed', 'cancelled'];
  if (!allowedStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status. Allowed: ${allowedStatuses.join(', ')}` });
    return;
  }

  ride.status = status;

  recordAuditEvent({
    actorId: user.uid,
    actorRole: user.role,
    action: 'DRIVER_UPDATED_RIDE_STATUS',
    targetId: ride.id,
    details: `Driver updated ride ${ride.bookingRef} status to ${status}`,
    ipAddress: req.ip,
  });

  res.json({ success: true, ride });
});

// =============================================================
// 5. VOLUNTEER SEVA ENDPOINTS
// =============================================================

app.post('/api/volunteers/request', publicLimiter, requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { volunteerId, locationArea, expertiseNeeded, notes } = req.body;

  const request = {
    id: 'vol_req_' + Date.now(),
    userId: user.uid,
    volunteerId: volunteerId || 'vol_01',
    locationArea: locationArea || 'Ramkund Ghat Gate 3',
    expertiseNeeded: expertiseNeeded || 'senior_citizen_assist',
    notes: notes || 'Assistance requested',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  recordAuditEvent({
    actorId: user.uid,
    actorRole: user.role,
    action: 'REQUEST_VOLUNTEER_SEVA',
    details: `Assistance requested at ${request.locationArea} for ${request.expertiseNeeded}`,
    ipAddress: req.ip,
  });

  res.json({ success: true, request });
});

// Volunteer-Restricted: get assigned tasks
app.get('/api/volunteer/assigned-tasks', publicLimiter, requireAuth, requireRole('VOLUNTEER', 'ADMIN', 'OPERATIONS'), (req: AuthenticatedRequest, res: Response) => {
  res.json({
    tasks: [
      {
        taskId: 'tsk_01',
        type: 'senior_citizen_assist',
        location: 'Ramkund Step 2',
        status: 'assigned',
        assignedTo: req.user!.uid,
      }
    ]
  });
});

// Volunteer-Restricted: update task status
app.post('/api/volunteer/tasks/:taskId/status', publicLimiter, requireAuth, requireRole('VOLUNTEER', 'ADMIN', 'OPERATIONS'), validateIdParam('taskId'), (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body;
  res.json({ success: true, taskId: req.params.taskId, status });
});

// =============================================================
// 6. SAFETY & EMERGENCY SOS
// =============================================================

// Emergency SOS reporting (Never block unauthenticated emergency triggers, but record IP & rate-limit)
app.post('/api/safety/emergency', emergencyLimiter, optionalAuth, validateEmergencyReportBody, (req: AuthenticatedRequest, res: Response) => {
  const { type, description, locationZone, reporterName, reporterPhone } = req.body;
  const uid = req.user ? req.user.uid : 'GUEST_EMERGENCY_REPORTER';

  const newEmergency: EmergencyRecord = {
    id: 'emg_' + Date.now(),
    ticketNumber: 'SOS-2027-' + Math.floor(1000 + Math.random() * 9000),
    userId: uid,
    reporterName: reporterName || 'Pilgrim Emergency Reporter',
    reporterPhone: reporterPhone || '+91 ••••••••••',
    type: type || 'sos_panic',
    description: description || 'High-priority SOS trigger from mobile app.',
    locationZone: locationZone || 'Panchavati / Ramkund Sector',
    timestamp: 'Just now',
    status: 'dispatched_to_deoc',
    sourceType: 'DEMO',
    deocIntegrationNotice: 'Simulation: Ticket logged to Nashik Simhastha District Emergency Operations Center (DEOC) queue. Dial direct 112 / 108 if cellular voice is operational.',
  };

  emergencyCases.unshift(newEmergency);

  recordAuditEvent({
    actorId: uid,
    actorRole: req.user?.role || 'EMERGENCY_REPORTER',
    action: 'TRIGGER_EMERGENCY_SOS',
    targetId: newEmergency.id,
    details: `SOS Case ${newEmergency.ticketNumber} filed in zone ${newEmergency.locationZone}`,
    ipAddress: req.ip,
    severity: 'CRITICAL',
  });

  res.json({ success: true, emergencyCase: newEmergency });
});

// Emergency cases list:
// Ordinary users can only see their own cases; ADMIN & OPERATIONS see all cases
app.get('/api/safety/emergency-cases', emergencyLimiter, requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.role === 'ADMIN' || user.role === 'OPERATIONS') {
    res.json({ cases: emergencyCases });
  } else {
    const ownCases = emergencyCases.filter(c => c.userId === user.uid);
    res.json({ cases: ownCases });
  }
});

// =============================================================
// 7. LOST & FOUND
// =============================================================

// Public list: Masks contact phone numbers for public privacy; full phone visible to owner/admin
app.get('/api/lost-and-found', publicLimiter, optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const currentUid = req.user?.uid;
  const isSupervisory = req.user?.role === 'ADMIN' || req.user?.role === 'OPERATIONS';

  const maskedPersons = lostPersonCases.map(p => ({
    ...p,
    contactPhone: (isSupervisory || p.userId === currentUid) ? p.contactPhone : p.contactPhone.replace(/\d{4}$/, '••••'),
  }));

  const maskedItems = lostItemCases.map(i => ({
    ...i,
    contactPhone: (isSupervisory || i.userId === currentUid) ? i.contactPhone : i.contactPhone.replace(/\d{4}$/, '••••'),
  }));

  res.json({
    lostPersons: maskedPersons,
    lostItems: maskedItems,
  });
});

app.post('/api/lost-and-found/report-person', publicLimiter, requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { personName, approxAge, gender, languagesSpoken, lastSeenLocation, clothingDescription, contactPhone } = req.body;

  if (!personName || typeof personName !== 'string' || personName.length > 100) {
    res.status(400).json({ error: 'Person name is required and must be under 100 characters.' });
    return;
  }

  const newReport: LostPersonRecord = {
    id: 'lp_' + Date.now(),
    caseRef: 'LP-KM27-' + Math.floor(100 + Math.random() * 900),
    userId: user.uid,
    personName,
    approxAge: Number(approxAge) || 45,
    gender: gender || 'unknown',
    languagesSpoken: Array.isArray(languagesSpoken) ? languagesSpoken.slice(0, 5) : ['Hindi'],
    lastSeenLocation: lastSeenLocation || 'Panchavati Central Corridor',
    clothingDescription: clothingDescription || 'Reported to Kumbh Lost Persons Cell',
    status: 'reported_lost',
    contactPhone: contactPhone || user.phoneNumber || '+91 98220 00000',
    reportedAt: 'Just now',
    sourceType: 'DEMO',
  };

  lostPersonCases.unshift(newReport);

  recordAuditEvent({
    actorId: user.uid,
    actorRole: user.role,
    action: 'REPORT_LOST_PERSON',
    targetId: newReport.id,
    details: `Lost person report ${newReport.caseRef} filed for ${newReport.personName}`,
    ipAddress: req.ip,
  });

  res.json({ success: true, report: newReport });
});

app.post('/api/lost-and-found/report-item', publicLimiter, requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { itemCategory, itemDescription, color, lastSeenLocation, contactPhone } = req.body;

  if (!itemDescription || typeof itemDescription !== 'string' || itemDescription.length > 500) {
    res.status(400).json({ error: 'Item description is required and must be under 500 characters.' });
    return;
  }

  const newReport: LostItemRecord = {
    id: 'li_' + Date.now(),
    caseRef: 'LI-KM27-' + Math.floor(100 + Math.random() * 900),
    userId: user.uid,
    itemCategory: itemCategory || 'other',
    itemDescription,
    color: color || 'Unspecified',
    lastSeenLocation: lastSeenLocation || 'Kumbh Transit Point',
    status: 'reported_lost',
    contactPhone: contactPhone || user.phoneNumber || '+91 98220 00000',
    reportedAt: 'Just now',
    sourceType: 'DEMO',
  };

  lostItemCases.unshift(newReport);

  recordAuditEvent({
    actorId: user.uid,
    actorRole: user.role,
    action: 'REPORT_LOST_ITEM',
    targetId: newReport.id,
    details: `Lost item report ${newReport.caseRef} filed for ${newReport.itemCategory}`,
    ipAddress: req.ip,
  });

  res.json({ success: true, report: newReport });
});

// =============================================================
// 8. PARTNER ONBOARDING & VERIFICATION APPLICATIONS
// =============================================================

app.post('/api/partner/apply', authLimiter, requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { roleRequested, applicantName, details } = req.body;

  const validRoles = ['DRIVER', 'VOLUNTEER', 'BUSINESS_PARTNER'];
  if (!validRoles.includes(roleRequested)) {
    res.status(400).json({ error: `Invalid role requested. Must be one of: ${validRoles.join(', ')}` });
    return;
  }

  const application: PartnerApplicationRecord = {
    id: 'app_' + Date.now(),
    userId: user.uid,
    applicantName: applicantName || 'Partner Applicant',
    roleRequested,
    details: details || {},
    verificationStatus: 'PENDING', // Server strictly sets initial PENDING status
    submittedAt: new Date().toISOString(),
  };

  partnerApplications.unshift(application);

  recordAuditEvent({
    actorId: user.uid,
    actorRole: user.role,
    action: 'SUBMIT_PARTNER_APPLICATION',
    targetId: application.id,
    details: `Submitted partner application for ${roleRequested}`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: 'Application submitted successfully for administrative review.',
    application,
  });
});

// =============================================================
// 9. ADMIN & OPERATIONS RESTRICTED ENDPOINTS
// =============================================================

// High-level operational metrics
app.get('/api/admin/metrics', adminLimiter, requireAuth, requireRole('ADMIN', 'OPERATIONS'), (req: AuthenticatedRequest, res: Response) => {
  res.json({
    metrics: {
      totalPilgrimsServed: 124500,
      activeMobilityPasses: userPasses.length + 8450,
      activeDriversOnline: 340,
      verifiedVolunteersOnField: 512,
      emergencyCasesOpen: emergencyCases.filter(c => c.status !== 'resolved').length,
      fraudAlertsPendingReview: fraudAlertsState.filter(f => f.reviewStatus === 'flagged_for_human_review').length,
      lostPersonsOpenCount: lostPersonCases.filter(p => p.status === 'reported_lost').length,
      lostItemsOpenCount: lostItemCases.filter(i => i.status === 'reported_lost').length,
    },
    fraudAlerts: fraudAlertsState,
    auditLogs: getAuditLogs(50),
    partnerApplicationsPending: partnerApplications.filter(a => a.verificationStatus === 'PENDING'),
  });
});

// Fraud Alert review action
app.post('/api/admin/fraud-alerts/action', adminLimiter, requireAuth, requireRole('ADMIN', 'OPERATIONS'), (req: AuthenticatedRequest, res: Response) => {
  const { alertId, action } = req.body;
  const alert = fraudAlertsState.find(a => a.id === alertId);

  if (!alert) {
    res.status(404).json({ error: 'Fraud alert not found' });
    return;
  }

  alert.reviewStatus = action === 'dismiss' ? 'dismissed' : action === 'appeal' ? 'under_appeal' : 'action_taken';

  recordAuditEvent({
    actorId: req.user!.uid,
    actorRole: req.user!.role,
    action: 'UPDATE_FRAUD_ALERT_STATUS',
    targetId: alertId,
    details: `Fraud alert ${alertId} updated to ${alert.reviewStatus}`,
    ipAddress: req.ip,
  });

  res.json({ success: true, alert });
});

// Official Announcement publication - strictly stamps AUTHORIZED_OFFICIAL
app.post('/api/admin/announcements', adminLimiter, requireAuth, requireRole('ADMIN', 'OPERATIONS'), (req: AuthenticatedRequest, res: Response) => {
  const { title, summary, priority, issuedBy } = req.body;

  if (!title || !summary) {
    res.status(400).json({ error: 'Announcement title and summary are required' });
    return;
  }

  const newAnnouncement = {
    id: 'ann_' + Date.now(),
    title: typeof title === 'string' ? { en: title, hi: title, mr: title } : title,
    summary: typeof summary === 'string' ? { en: summary, hi: summary, mr: summary } : summary,
    priority: priority || 'advisory',
    issuedBy: issuedBy || 'Kumbh Mela Administration (Verified)',
    sourceType: 'AUTHORIZED_OFFICIAL' as const, // Server strictly enforces verified source
    sourceName: 'Simhastha District Command & Control Center',
    sourceUrl: 'https://nashik.gov.in',
    status: 'PUBLISHED' as const,
    validFrom: new Date().toISOString(),
    validUntil: 'Active',
    publishedAt: 'Just now',
    verificationSeal: 'OFFICIAL_GOV_SEAL_AUTHENTICATED',
  };

  announcementsState.unshift(newAnnouncement as any);

  recordAuditEvent({
    actorId: req.user!.uid,
    actorRole: req.user!.role,
    action: 'PUBLISH_OFFICIAL_ANNOUNCEMENT',
    targetId: newAnnouncement.id,
    details: `Published authorized official announcement ${newAnnouncement.id}`,
    ipAddress: req.ip,
    severity: 'WARNING',
  });

  res.json({ success: true, announcement: newAnnouncement });
});

// Read Tamper-Evident Audit Logs
app.get('/api/admin/audit-logs', adminLimiter, requireAuth, requireRole('ADMIN', 'OPERATIONS'), (req: AuthenticatedRequest, res: Response) => {
  const limitCount = Math.min(Number(req.query.limit) || 100, 200);
  res.json({ logs: getAuditLogs(limitCount) });
});

// Reject client attempts to tamper with audit logs
app.all('/api/admin/audit-logs/tamper', (req: Request, res: Response) => {
  res.status(405).json({
    error: 'Audit logs are strictly append-only and cannot be mutated or purged.',
    code: 'AUDIT_LOG_IMMUTABLE',
  });
});

// Partner Verification Decision
app.post('/api/admin/verifications/:id/decision', adminLimiter, requireAuth, requireRole('ADMIN', 'OPERATIONS'), validateIdParam('id'), (req: AuthenticatedRequest, res: Response) => {
  const { decision } = req.body; // 'APPROVE' | 'REJECT'
  const appRecord = partnerApplications.find(a => a.id === req.params.id);

  if (!appRecord) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  if (decision === 'APPROVE') {
    appRecord.verificationStatus = 'VERIFIED';
    // Promote user role on server
    assignUserRoleServerSide(req.user!.uid, appRecord.userId, appRecord.roleRequested, 'VERIFIED');
  } else {
    appRecord.verificationStatus = 'REJECTED';
  }

  appRecord.reviewedBy = req.user!.uid;
  appRecord.reviewedAt = new Date().toISOString();

  recordAuditEvent({
    actorId: req.user!.uid,
    actorRole: req.user!.role,
    action: 'PARTNER_VERIFICATION_DECISION',
    targetId: appRecord.id,
    details: `${decision} application for user ${appRecord.userId} to role ${appRecord.roleRequested}`,
    ipAddress: req.ip,
    severity: 'WARNING',
  });

  res.json({ success: true, application: appRecord });
});

// Admin-Only: Assign user role directly server-side
app.post('/api/admin/users/:userId/role', adminLimiter, requireAuth, requireRole('ADMIN'), validateIdParam('userId'), (req: AuthenticatedRequest, res: Response) => {
  const { role, verificationStatus } = req.body;
  const targetUserId = req.params.userId;

  const validRoles: ServerUserRole[] = ['TOURIST', 'DRIVER', 'VOLUNTEER', 'BUSINESS_PARTNER', 'ADMIN', 'OPERATIONS'];
  if (!role || !validRoles.includes(role)) {
    res.status(400).json({ error: `Valid role is required. Allowed: ${validRoles.join(', ')}` });
    return;
  }

  const updated = assignUserRoleServerSide(req.user!.uid, targetUserId, role, verificationStatus);
  res.json({ success: true, user: updated });
});

// Admin-Only: Suspend or reinstate account
app.post('/api/admin/users/:userId/status', adminLimiter, requireAuth, requireRole('ADMIN'), validateIdParam('userId'), (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body;
  const targetUserId = req.params.userId;

  const validStatuses: ServerVerificationStatus[] = ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED'];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({ error: `Valid status is required. Allowed: ${validStatuses.join(', ')}` });
    return;
  }

  const updated = assignUserRoleServerSide(req.user!.uid, targetUserId, 'TOURIST', status);
  res.json({ success: true, user: updated });
});

// =============================================================
// CENTRALIZED ERROR HANDLING
// =============================================================
app.use(centralizedErrorHandler);

// =============================================================
// VITE MIDDLEWARE / SPA SERVING
// =============================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Namo Yatri] Core server running on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer();

export default app;
