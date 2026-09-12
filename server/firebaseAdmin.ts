import fs from 'fs';
import path from 'path';
import { getApps, initializeApp, getApp, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { ServerUserRole, ServerVerificationStatus, AuthenticatedUser } from './types';
import { recordAuditEvent } from './audit';

let firebaseAdminApp: App | null = null;
let projectId = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0748280227';

// Attempt to load project config from firebase-applet-config.json
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.projectId) {
      projectId = parsed.projectId;
    }
  }
} catch (e) {
  console.warn('[Firebase Admin] Warning: could not parse firebase-applet-config.json:', e);
}

// Initialize Firebase Admin SDK
try {
  const existingApps = getApps();
  if (existingApps.length === 0) {
    firebaseAdminApp = initializeApp({
      projectId,
    });
    console.log(`[Firebase Admin] Initialized successfully for project: ${projectId}`);
  } else {
    firebaseAdminApp = existingApps[0];
  }
} catch (err) {
  console.error('[Firebase Admin] Initialization error:', err);
}

// Server-authoritative in-memory RBAC store
// Maps uid -> authoritative role & status
interface ServerUserRecord {
  uid: string;
  role: ServerUserRole;
  verificationStatus: ServerVerificationStatus;
  updatedAt: string;
  assignedBy: string;
}

const serverUserDirectory = new Map<string, ServerUserRecord>();

// Designated initial bootstrap admin email for initial setup
const BOOTSTRAP_ADMIN_EMAIL = 'namoyatriindia@gmail.com';

/**
 * Resolves authoritative user role and verification status on the server.
 * Never trusts frontend-supplied roles.
 */
export function resolveServerRoleAndStatus(
  uid: string, 
  email?: string | null, 
  emailVerified?: boolean,
  tokenClaimsRole?: string
): { role: ServerUserRole; verificationStatus: ServerVerificationStatus } {
  // 1. Check existing authoritative record in server store
  const existing = serverUserDirectory.get(uid);
  if (existing) {
    return {
      role: existing.role,
      verificationStatus: existing.verificationStatus,
    };
  }

  // 2. Initial Secure Bootstrap Mechanism:
  // If the user email strictly matches the designated bootstrap admin AND is verified by Firebase Auth,
  // provision initial ADMIN role with audit logging.
  if (email && email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase() && emailVerified === true) {
    const adminRecord: ServerUserRecord = {
      uid,
      role: 'ADMIN',
      verificationStatus: 'VERIFIED',
      updatedAt: new Date().toISOString(),
      assignedBy: 'SYSTEM_BOOTSTRAP',
    };
    serverUserDirectory.set(uid, adminRecord);
    recordAuditEvent({
      actorId: uid,
      actorRole: 'ADMIN',
      action: 'BOOTSTRAP_ADMIN_PROVISIONED',
      details: `Bootstrap administrator provisioned for verified identity ${email}`,
      severity: 'WARNING',
    });
    return { role: 'ADMIN', verificationStatus: 'VERIFIED' };
  }

  // 3. Custom claims from Firebase Auth token (if set via admin.auth().setCustomUserClaims)
  if (tokenClaimsRole) {
    const upper = tokenClaimsRole.toUpperCase();
    if (['TOURIST', 'DRIVER', 'VOLUNTEER', 'BUSINESS_PARTNER', 'ADMIN', 'OPERATIONS'].includes(upper)) {
      const record: ServerUserRecord = {
        uid,
        role: upper as ServerUserRole,
        verificationStatus: 'VERIFIED',
        updatedAt: new Date().toISOString(),
        assignedBy: 'FIREBASE_CUSTOM_CLAIMS',
      };
      serverUserDirectory.set(uid, record);
      return { role: upper as ServerUserRole, verificationStatus: 'VERIFIED' };
    }
  }

  // 4. Default to strictly unprivileged TOURIST
  const defaultRecord: ServerUserRecord = {
    uid,
    role: 'TOURIST',
    verificationStatus: 'PENDING',
    updatedAt: new Date().toISOString(),
    assignedBy: 'DEFAULT_POLICY',
  };
  serverUserDirectory.set(uid, defaultRecord);
  return { role: 'TOURIST', verificationStatus: 'PENDING' };
}

/**
 * Admin action: assigns a server-side role to a target user.
 * Must only be called after verifying caller is ADMIN.
 */
export function assignUserRoleServerSide(
  adminUid: string,
  targetUid: string,
  newRole: ServerUserRole,
  newStatus?: ServerVerificationStatus
): ServerUserRecord {
  const current = serverUserDirectory.get(targetUid) || {
    uid: targetUid,
    role: 'TOURIST' as ServerUserRole,
    verificationStatus: 'PENDING' as ServerVerificationStatus,
    updatedAt: new Date().toISOString(),
    assignedBy: 'SYSTEM',
  };

  const updated: ServerUserRecord = {
    ...current,
    role: newRole,
    verificationStatus: newStatus || current.verificationStatus,
    updatedAt: new Date().toISOString(),
    assignedBy: adminUid,
  };

  serverUserDirectory.set(targetUid, updated);

  recordAuditEvent({
    actorId: adminUid,
    actorRole: 'ADMIN',
    action: 'ROLE_ASSIGNED_BY_ADMIN',
    targetId: targetUid,
    details: `Assigned role ${newRole} and status ${updated.verificationStatus} to user ${targetUid}`,
    severity: 'WARNING',
  });

  return updated;
}

/**
 * Verifies a Firebase Authentication ID token.
 * Rejects missing, invalid, or expired tokens.
 */
export async function verifyFirebaseIdToken(token: string): Promise<
  | { success: true; user: AuthenticatedUser }
  | { success: false; reason: 'MISSING' | 'INVALID' | 'EXPIRED' | 'MALFORMED'; error: string }
> {
  if (!token || typeof token !== 'string') {
    return { success: false, reason: 'MISSING', error: 'Authentication token is required' };
  }

  // Handle test environment tokens strictly when NODE_ENV === 'test'
  if (process.env.NODE_ENV === 'test' && token.startsWith('TEST_TOKEN_')) {
    return handleTestToken(token);
  }

  try {
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);
    const { role, verificationStatus } = resolveServerRoleAndStatus(
      decodedToken.uid,
      decodedToken.email,
      decodedToken.email_verified,
      decodedToken.role as string | undefined
    );

    const user: AuthenticatedUser = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      emailVerified: Boolean(decodedToken.email_verified),
      phoneNumber: decodedToken.phone_number || null,
      role,
      verificationStatus,
      isAnonymous: decodedToken.firebase?.sign_in_provider === 'anonymous',
    };

    return { success: true, user };
  } catch (error: any) {
    if (error.code === 'auth/id-token-expired') {
      return { success: false, reason: 'EXPIRED', error: 'Firebase ID token has expired. Please refresh your session.' };
    }
    if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
      return { success: false, reason: 'INVALID', error: 'Invalid authentication credentials.' };
    }
    return { success: false, reason: 'INVALID', error: 'Token verification failed.' };
  }
}

/**
 * Isolated helper for security test suite (tests/security.test.ts)
 */
function handleTestToken(token: string): { success: true; user: AuthenticatedUser } | { success: false; reason: 'EXPIRED' | 'INVALID'; error: string } {
  const parts = token.split(':');
  // Format: TEST_TOKEN_<TYPE>:<UID>:<ROLE>:<STATUS>
  const tokenType = parts[0];
  if (tokenType === 'TEST_TOKEN_EXPIRED') {
    return { success: false, reason: 'EXPIRED', error: 'Token expired' };
  }
  if (tokenType === 'TEST_TOKEN_INVALID') {
    return { success: false, reason: 'INVALID', error: 'Invalid token' };
  }
  const uid = parts[1] || 'test_user';
  const role = (parts[2] || 'TOURIST').toUpperCase() as ServerUserRole;
  const status = (parts[3] || 'VERIFIED').toUpperCase() as ServerVerificationStatus;

  // Record into directory for tests
  serverUserDirectory.set(uid, {
    uid,
    role,
    verificationStatus: status,
    updatedAt: new Date().toISOString(),
    assignedBy: 'TEST_SUITE',
  });

  return {
    success: true,
    user: {
      uid,
      email: `${uid}@test.local`,
      emailVerified: true,
      phoneNumber: '+91 99999 00000',
      role,
      verificationStatus: status,
      isAnonymous: false,
    },
  };
}

export { firebaseAdminApp };
