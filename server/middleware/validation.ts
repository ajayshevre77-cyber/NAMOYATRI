import { Request, Response, NextFunction } from 'express';
import { MOCK_TRANSPORT_OPTIONS, PICKUP_POINTS, DROP_POINTS } from '../../src/data/kumbhData';
import { MAX_PASSENGERS, MAX_ADVANCE_BOOKING_DAYS, maxPassengersFor } from '../../src/lib/fare';
import { TransportOption } from '../../src/types';

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

interface FieldProblem {
  error: string;
  code: string;
}

/**
 * Checks the route and ride type of a trip. Shared by the fare estimate and the
 * ride request so both accept exactly the same trips.
 *
 * Pickup and drop must come from the fixed point lists the app offers, and the
 * ride type from the transport catalogue, because the server prices the trip
 * from those values.
 */
export function checkTripFields(body: any): FieldProblem | null {
  const { from, to, transportType } = body ?? {};

  if (typeof from !== 'string' || !PICKUP_POINTS.includes(from)) {
    return { error: 'Choose a pickup point from the list.', code: 'INVALID_PICKUP_POINT' };
  }
  if (typeof to !== 'string' || !DROP_POINTS.includes(to)) {
    return { error: 'Choose a destination from the list.', code: 'INVALID_DROP_POINT' };
  }
  if (!MOCK_TRANSPORT_OPTIONS.some(o => o.type === transportType)) {
    const allowed = MOCK_TRANSPORT_OPTIONS.map(o => o.type).join(', ');
    return { error: `Invalid transportType. Allowed: ${allowed}`, code: 'INVALID_TRANSPORT_TYPE' };
  }
  return null;
}

/** Validated, normalised ride request, left on `res.locals.rideRequest`. */
export interface ValidRideRequest {
  from: string;
  to: string;
  option: TransportOption;
  passengers: number;
  /** ISO string, or null for "leave now". */
  departAt: string | null;
}

/** Allowance for clock drift between the pilgrim's phone and the server. */
const DEPARTURE_GRACE_MS = 60 * 1000;

/**
 * Validator for Ride Booking Request.
 *
 * Fare and travel time are deliberately not read from the body: the server
 * computes them. Any `estimatedFare` or `estimatedTimeMins` sent is ignored.
 */
export function validateRideRequestBody(req: Request, res: Response, next: NextFunction): void {
  const tripProblem = checkTripFields(req.body);
  if (tripProblem) {
    res.status(400).json(tripProblem);
    return;
  }

  const { from, to, transportType, passengers = 1, departAt = null } = req.body;
  const option = MOCK_TRANSPORT_OPTIONS.find(o => o.type === transportType)!;

  if (!Number.isInteger(passengers) || passengers < 1 || passengers > MAX_PASSENGERS) {
    res.status(400).json({
      error: `Passengers must be a whole number from 1 to ${MAX_PASSENGERS}.`,
      code: 'INVALID_PASSENGER_COUNT',
    });
    return;
  }
  if (passengers > maxPassengersFor(option)) {
    res.status(400).json({
      error: `${option.title} seats at most ${maxPassengersFor(option)} passengers.`,
      code: 'PASSENGERS_EXCEED_CAPACITY',
    });
    return;
  }

  let departAtIso: string | null = null;
  if (departAt !== null) {
    const departMs = typeof departAt === 'string' && departAt.length <= 40 ? Date.parse(departAt) : NaN;
    if (Number.isNaN(departMs)) {
      res.status(400).json({
        error: 'departAt must be an ISO date-time string, or null to leave now.',
        code: 'INVALID_DEPARTURE_TIME',
      });
      return;
    }
    if (departMs < Date.now() - DEPARTURE_GRACE_MS) {
      res.status(400).json({ error: 'That departure time has already passed.', code: 'DEPARTURE_IN_PAST' });
      return;
    }
    if (departMs > Date.now() + MAX_ADVANCE_BOOKING_DAYS * 24 * 60 * 60 * 1000) {
      res.status(400).json({
        error: `Rides can be scheduled at most ${MAX_ADVANCE_BOOKING_DAYS} days ahead.`,
        code: 'DEPARTURE_TOO_FAR',
      });
      return;
    }
    departAtIso = new Date(departMs).toISOString();
  }

  const rideRequest: ValidRideRequest = { from, to, option, passengers, departAt: departAtIso };
  res.locals.rideRequest = rideRequest;
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
