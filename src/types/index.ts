/**
 * Namo Yatri - Core Domain Models & Type Definitions
 * Designed for production architecture (Tourist, Driver, Volunteer, Business, Admin, Operations)
 */

export type StandardUserRole = 
  | 'TOURIST' 
  | 'DRIVER' 
  | 'VOLUNTEER' 
  | 'BUSINESS_PARTNER' 
  | 'ADMIN' 
  | 'OPERATIONS';

export type UserRole = 
  | StandardUserRole
  | 'tourist' 
  | 'driver' 
  | 'volunteer' 
  | 'business' 
  | 'admin' 
  | 'operations';

export type VerificationStatus = 
  | 'PENDING' 
  | 'UNDER_REVIEW' 
  | 'VERIFIED' 
  | 'REJECTED' 
  | 'SUSPENDED';

export type InformationSourceType = 
  | 'DEMO' 
  | 'COMMUNITY' 
  | 'VERIFIED' 
  | 'AUTHORIZED_OFFICIAL';

export type LocationSharingMode = 
  | 'location_disabled' 
  | 'while_using_app' 
  | 'temporary_sharing' 
  | 'family_sharing';

export interface PrivacySettings {
  isProfilePublic: boolean;
  locationSharingMode: LocationSharingMode;
  shareContactInEmergency: boolean;
}

export type VerificationTier = 
  | 'unverified' 
  | 'pending' 
  | 'verified_namo' 
  | 'verified_partner' 
  | 'verified_official' 
  | 'rejected'
  | VerificationStatus;

export interface User {
  id: string;
  userId?: string;
  name: string;
  displayName?: string;
  phone: string;
  phoneNumber?: string;
  email?: string;
  role: UserRole;
  createdAt: string;
  updatedAt?: string;
  preferredLanguage: 'en' | 'hi' | 'mr';
  isPhoneVerified: boolean;
  avatarUrl?: string;
  profilePhoto?: string;
  verificationStatus?: VerificationStatus;
  privacySettings?: PrivacySettings;
}

export interface UserProfile extends User {
  emergencyContactId?: string;
  activePassId?: string;
  familyGroupId?: string;
  locationSharingOptIn: boolean;
  savedPlaceIds: string[];
}

export type PlaceCategory = 
  | 'temple' 
  | 'ghat' 
  | 'kumbh_zone' 
  | 'attraction' 
  | 'food' 
  | 'accommodation' 
  | 'parking' 
  | 'medical' 
  | 'toilets' 
  | 'drinking_water' 
  | 'rest_area';

export interface Place {
  id: string;
  name: {
    en: string;
    hi: string;
    mr: string;
  };
  category: PlaceCategory;
  description: {
    en: string;
    hi: string;
    mr: string;
  };
  historicalImportance?: {
    en: string;
    hi: string;
    mr: string;
  };
  location: {
    area: string;
    address: string;
    latitude: number;
    longitude: number;
    zoneId: string;
  };
  timings: string;
  facilities: string[];
  verificationTier: VerificationTier;
  isOfficialKumbhSite: boolean;
  distanceKmPlaceholder: number;
  imageUrl: string;
  crowdLevel?: 'low' | 'moderate' | 'high' | 'peak';
}

export type TransportType = 'auto' | 'cab' | 'electric_shuttle' | 'govt_bus';

export interface TransportOption {
  id: string;
  type: TransportType;
  title: string;
  capacity: number;
  baseFare: number;
  perKmRate: number;
  estimatedWaitMins: number;
  isRegulatedFare: boolean;
  icon: string;
  disclaimer: string;
}

export interface RideBooking {
  id: string;
  bookingRef: string;
  userId: string;
  driverId?: string;
  fromLocation: string;
  toLocation: string;
  transportType: TransportType;
  estimatedFare: number;
  estimatedTimeMins: number;
  status: 'requested' | 'driver_assigned' | 'in_transit' | 'completed' | 'cancelled';
  createdAt: string;
  paymentMethod: 'cash' | 'pass' | 'upi_placeholder';
  isDemoSimulation: boolean;
}

export type PassType = '1_day' | '3_day' | '7_day' | 'custom_family';

export interface MobilityPassProduct {
  id: PassType;
  title: {
    en: string;
    hi: string;
    mr: string;
  };
  durationDays: number;
  priceInr: number;
  isRegulatedTariff: boolean;
  eligibleTransport: string[];
  terms: string[];
}

export interface UserPass {
  id: string;
  passRefNumber: string;
  userId: string;
  userName: string;
  passType: PassType;
  validFrom: string;
  validTo: string;
  status: 'active' | 'expired' | 'suspended' | 'revoked';
  qrSecureTokenSpec: {
    tokenHash: string;
    issuedAt?: string;
    expiresAt?: string;
    expiresInSeconds?: number;
    securityAlgorithm: string;
    conductorVerificationKeyId?: string;
    conductorNotice?: string;
  };
  ridesUsedCount: number;
  maxRidesAllowed?: number;
  eligibleZones?: string[];
  eligibleVehiclesSummary?: string;
}

export type VolunteerExpertise = 
  | 'temple_info' 
  | 'local_history' 
  | 'navigation' 
  | 'language_assist' 
  | 'senior_citizen_assist' 
  | 'accessibility_assist' 
  | 'tourist_guide';

export interface Volunteer {
  id: string;
  name: string;
  phoneMasked: string;
  badgeType: 'namo_verified' | 'partner_ngo' | 'official_authorized';
  languages: string[];
  expertise: VolunteerExpertise[];
  availabilityStatus: 'available' | 'busy' | 'offline';
  assignedZone: string;
  rating: number;
  totalAssists: number;
  organizationName?: string;
  joinedDate: string;
  verificationId: string;
}

export interface VolunteerRequest {
  id: string;
  userId: string;
  volunteerId?: string;
  requesterName: string;
  requesterPhone: string;
  locationArea: string;
  expertiseNeeded: VolunteerExpertise;
  notes: string;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface FamilyGroup {
  id: string;
  groupCode: string;
  name: string;
  leaderUserId: string;
  members: FamilyMember[];
  designatedMeetingPoint: string;
  createdAt: string;
}

export interface FamilyMember {
  userId: string;
  name: string;
  relationship: string;
  batteryLevelPercent: number;
  lastCheckInTime: string;
  approxZone: string;
  isLocationSharingEnabled: boolean;
  emergencyContactNumber: string;
}

export interface EmergencyCase {
  id: string;
  ticketNumber: string;
  userId: string;
  reporterName: string;
  reporterPhone: string;
  type: 'medical' | 'police' | 'lost_person' | 'lost_item' | 'safety_report' | 'sos_panic';
  description: string;
  locationZone: string;
  timestamp: string;
  status: 'logged' | 'dispatched_to_deoc' | 'attending' | 'resolved';
  isSimulatedEmergency: boolean;
  deocIntegrationNotice: string;
}

export interface LostPersonReport {
  id: string;
  caseRef?: string;
  reportedByUserId?: string;
  personName: string;
  approxAge: number;
  gender: 'male' | 'female' | 'other' | 'child' | string;
  languagesSpoken?: string[];
  lastSeenLocation: string;
  clothingDescription: string;
  photoPlaceholderUrl?: string;
  photoUrl?: string;
  status: 'reported_lost' | 'located' | 'reunited' | 'OPEN' | 'LOCATED' | 'CLOSED';
  contactPersonMasked?: string;
  contactNumberMasked?: string;
  sourceType?: InformationSourceType;
  reportedAt: string;
}

export interface LostItemReport {
  id: string;
  caseRef: string;
  itemCategory: 'bag' | 'phone' | 'documents' | 'wallet' | 'keys' | 'other';
  itemDescription: string;
  color: string;
  lastSeenLocation: string;
  status: 'reported_lost' | 'found_at_cloakroom' | 'claimed';
  maskedFinderDesk: string;
  reportedAt: string;
}

export interface DriverPartner {
  id: string;
  name: string;
  phone: string;
  vehicleType: TransportType;
  vehicleNumber: string;
  licenseNumberMasked: string;
  verificationTier: VerificationTier;
  isOnline: boolean;
  todaysEarningsInr: number;
  completedTripsCount: number;
  rating: number;
  activeZone: string;
}

export interface BusinessPartner {
  id: string;
  businessName: string;
  businessCategory: 'dharamshala' | 'bhojanalaya' | 'cloakroom' | 'parking' | 'pooja_store';
  ownerName: string;
  address: string;
  verificationTier: VerificationTier;
  isOpen: boolean;
  capacityTotal: number;
  capacityAvailable: number;
  rating: number;
}

export interface OfficialAnnouncement {
  id: string;
  title: {
    en: string;
    hi: string;
    mr: string;
  };
  summary: {
    en: string;
    hi: string;
    mr: string;
  };
  priority: 'info' | 'advisory' | 'high_alert';
  issuedBy: string;
  sourceType: InformationSourceType;
  sourceName: string;
  sourceUrl?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'FLAGGED' | 'ARCHIVED';
  validFrom?: string;
  validUntil: string;
  publishedAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
  verificationSeal?: string;
  createdBy?: string;
  reportCount?: number;
}

export interface SecuritySession {
  sessionId: string;
  deviceType: string;
  browser: string;
  ipMasked: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface EmergencyContact {
  id: string;
  userId: string;
  name: string;
  relationship: string;
  phoneMasked: string;
  isVerified: boolean;
  createdAt: string;
}

export interface FraudAlert {
  id: string;
  alertType: 
    | 'fake_driver_account' 
    | 'fake_volunteer' 
    | 'duplicate_account' 
    | 'excessive_cancellations' 
    | 'pass_sharing_attempt' 
    | 'qr_reuse_detected' 
    | 'gps_anomaly' 
    | 'suspicious_refund';
  riskScore: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  targetEntityType: 'user' | 'driver' | 'volunteer' | 'pass' | 'business';
  targetEntityId: string;
  detectedAt: string;
  reviewStatus: 'flagged_for_human_review' | 'under_appeal' | 'dismissed' | 'action_taken';
  notes: string;
  sourceType?: InformationSourceType;
  title?: {
    en: string;
    hi?: string;
    mr?: string;
  };
  description?: {
    en: string;
    hi?: string;
    mr?: string;
  };
  advisory?: {
    en: string;
    hi?: string;
    mr?: string;
  };
  affectedAreas?: string[];
  category?: string;
  reportedDate?: string;
}

export interface AuditLog {
  id: string;
  actorRole: UserRole;
  actorId: string;
  action: string;
  ipAddressMasked: string;
  timestamp: string;
  details: string;
}
