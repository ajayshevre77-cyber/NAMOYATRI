import { Request } from 'express';

export type ServerUserRole = 
  | 'TOURIST' 
  | 'DRIVER' 
  | 'VOLUNTEER' 
  | 'BUSINESS_PARTNER' 
  | 'ADMIN' 
  | 'OPERATIONS';

export type ServerVerificationStatus = 
  | 'PENDING' 
  | 'UNDER_REVIEW' 
  | 'VERIFIED' 
  | 'REJECTED' 
  | 'SUSPENDED';

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phoneNumber?: string | null;
  role: ServerUserRole;
  verificationStatus: ServerVerificationStatus;
  isAnonymous?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export interface AuditEventRecord {
  id: string;
  timestamp: string;
  actorId: string;
  actorRole: string;
  action: string;
  targetId?: string;
  details: string;
  ipAddressMasked: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}
