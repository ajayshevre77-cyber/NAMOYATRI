import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { verifyFirebaseIdToken } from '../firebaseAdmin';

/**
 * Middleware: requireAuth
 * Mandates a valid Firebase Authentication ID Token in Authorization: Bearer <token>
 */
export async function requireAuth(
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized. Authentication token is missing.',
      code: 'AUTH_TOKEN_MISSING',
    });
    return;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    res.status(401).json({
      error: 'Unauthorized. Malformed Bearer token.',
      code: 'AUTH_TOKEN_MALFORMED',
    });
    return;
  }

  const result = await verifyFirebaseIdToken(token);

  if (!result.success) {
    const errorMsg = 'error' in result ? result.error : 'Unauthorized. Invalid or expired token.';
    const reason = 'reason' in result ? result.reason : 'INVALID';
    res.status(401).json({
      error: errorMsg,
      code: reason === 'EXPIRED' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
    });
    return;
  }

  // Attach verified user to request
  req.user = result.user;
  next();
}

/**
 * Middleware: optionalAuth
 * Parses and verifies Bearer token if supplied, but does not block unauthenticated users
 */
export async function optionalAuth(
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1]?.trim();
    if (token) {
      const result = await verifyFirebaseIdToken(token);
      if (result.success) {
        req.user = result.user;
      }
    }
  }

  next();
}

/**
 * Middleware: requireRole
 * Authorizes access based on verified server-side user roles
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized. Authentication required for this resource.',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    const currentRole = (req.user.role || 'TOURIST').toUpperCase();
    const normalizedAllowed = allowedRoles.map(r => r.toUpperCase());

    // ADMIN always has supervisory access
    if (currentRole === 'ADMIN' || normalizedAllowed.includes(currentRole)) {
      next();
      return;
    }

    res.status(403).json({
      error: 'Forbidden. Your verified role does not have authorization for this resource.',
      code: 'INSUFFICIENT_PERMISSIONS',
      userRole: currentRole,
      requiredRoles: allowedRoles,
    });
  };
}

/**
 * Helper to prevent IDOR (Insecure Direct Object Reference)
 * Verifies that the authenticated user owns the resource or is ADMIN
 */
export function checkResourceOwnership(
  req: AuthenticatedRequest, 
  resourceOwnerId: string
): boolean {
  if (!req.user) return false;
  if (req.user.role === 'ADMIN' || req.user.role === 'OPERATIONS') return true;
  return req.user.uid === resourceOwnerId;
}
