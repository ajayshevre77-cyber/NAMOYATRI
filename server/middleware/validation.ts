import { Request, Response, NextFunction } from 'express';

// ID format validation
export function isValidIdentifier(id: string): boolean {
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > 128) return false;
  return /^[a-zA-Z0-9_\-]+$/.test(id);
}

/**
 * Middleware: validates path parameter ':id', ':userId', ':passId', ':rideId'
 */
export function validateIdParam(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = req.params[paramName];
    if (id && !isValidIdentifier(id)) {
      res.status(400).json({
        error: `Invalid identifier format for parameter '${paramName}'.`,
        code: 'INVALID_PARAM_FORMAT',
      });
      return;
    }
    next();
  };
}

/**
 * Middleware: blocks client attempts to self-assign roles or tamper with security status
 */
export function rejectPrivilegedFields(req: Request, res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    const forbidden = ['role', 'isAdmin', 'verificationStatus', 'permissions', 'customClaims', 'isVerified'];
    const found = forbidden.filter(field => field in req.body);
    if (found.length > 0) {
      res.status(400).json({
        error: `Unauthorized payload modification: field(s) '${found.join(', ')}' cannot be set by client.`,
        code: 'FORBIDDEN_FIELD_MODIFICATION',
      });
      return;
    }
  }
  next();
}

/**
 * Validator for Ride Booking Request
 */
export function validateRideRequestBody(req: Request, res: Response, next: NextFunction): void {
  const { from, to, transportType, estimatedFare } = req.body;

  if (!from || typeof from !== 'string' || from.length > 150) {
    res.status(400).json({ error: 'Pickup location (from) is required and must be under 150 characters.' });
    return;
  }
  if (!to || typeof to !== 'string' || to.length > 150) {
    res.status(400).json({ error: 'Destination (to) is required and must be under 150 characters.' });
    return;
  }

  const validTypes = ['electric_shuttle', 'rickshaw', 'kumbh_bus', 'battery_cart', 'special_accessibility'];
  if (transportType && !validTypes.includes(transportType)) {
    res.status(400).json({ error: `Invalid transportType. Allowed: ${validTypes.join(', ')}` });
    return;
  }

  if (estimatedFare !== undefined && (typeof estimatedFare !== 'number' || estimatedFare < 0 || estimatedFare > 10000)) {
    res.status(400).json({ error: 'Invalid estimated fare value.' });
    return;
  }

  next();
}

/**
 * Validator for Mobility Pass Purchase
 */
export function validatePassPurchaseBody(req: Request, res: Response, next: NextFunction): void {
  const { passType, userName } = req.body;

  const validPassTypes = ['1_day', '3_day', '7_day', 'shahi_snan_special'];
  if (!passType || !validPassTypes.includes(passType)) {
    res.status(400).json({ error: `Invalid passType. Allowed: ${validPassTypes.join(', ')}` });
    return;
  }

  if (userName && (typeof userName !== 'string' || userName.length > 80)) {
    res.status(400).json({ error: 'User name must be a string up to 80 characters.' });
    return;
  }

  next();
}

/**
 * Validator for Emergency SOS Report
 */
export function validateEmergencyReportBody(req: Request, res: Response, next: NextFunction): void {
  const { type, description, locationZone, reporterName, reporterPhone } = req.body;

  const allowedTypes = ['sos_panic', 'medical', 'stampede_risk', 'lost_child', 'fire', 'general'];
  if (type && !allowedTypes.includes(type)) {
    res.status(400).json({ error: `Invalid emergency type. Allowed: ${allowedTypes.join(', ')}` });
    return;
  }

  if (description && (typeof description !== 'string' || description.length > 1000)) {
    res.status(400).json({ error: 'Description must be under 1000 characters.' });
    return;
  }

  if (locationZone && (typeof locationZone !== 'string' || locationZone.length > 120)) {
    res.status(400).json({ error: 'Location zone must be under 120 characters.' });
    return;
  }

  if (reporterName && (typeof reporterName !== 'string' || reporterName.length > 80)) {
    res.status(400).json({ error: 'Reporter name must be under 80 characters.' });
    return;
  }

  if (reporterPhone && (typeof reporterPhone !== 'string' || reporterPhone.length > 30)) {
    res.status(400).json({ error: 'Reporter phone must be under 30 characters.' });
    return;
  }

  next();
}
