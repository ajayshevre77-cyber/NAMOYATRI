import { Request, Response, NextFunction } from 'express';
import { MOCK_TRANSPORT_OPTIONS, PICKUP_POINTS, DROP_POINTS } from '../../src/data/kumbhData';
import { MAX_PASSENGERS, MAX_ADVANCE_BOOKING_DAYS, maxPassengersFor } from '../../src/lib/fare';
import { TransportOption } from '../../src/types';
import { GeoPoint, isInServiceArea, SERVICE_AREA, NEARBY_RADII_M, DEFAULT_NEARBY_RADIUS_M } from '../../src/lib/geo';
import { MAX_ROUTE_STOPS, MIN_ROUTE_STOPS, TravelMode, isTravelMode, roundRouteStop } from '../../src/lib/routing';
import {
  MAX_START_LABEL_LENGTH,
  MAX_TRIP_DAYS,
  MIN_TRIP_DAYS,
  TRIP_INTERESTS,
  TripArea,
  TripBudget,
  TripInterest,
  TripPace,
  isTripArea,
  isTripBudget,
  isTripInterest,
  isTripPace,
} from '../../src/lib/itinerary';
import {
  ChatRequest,
  ChatTurn,
  MAX_CHAT_HISTORY,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_HISTORY_TEXT_LENGTH,
  isChatLanguage,
} from '../../src/lib/chat';

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

/** Validated nearby lookup, left on `res.locals.geoNearby`. */
export interface ValidNearbyQuery {
  point: GeoPoint;
  radiusM: number;
}

function parseCoordinate(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 20) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/**
 * Validator for GET /api/geo/nearby: `lat`, `lon` and an optional `radius`
 * from NEARBY_RADII_M. The point must be inside the service area.
 */
export function validateNearbyQuery(req: Request, res: Response, next: NextFunction): void {
  const lat = parseCoordinate(req.query.lat, -90, 90);
  const lon = parseCoordinate(req.query.lon, -180, 180);
  if (lat === null || lon === null) {
    res.status(400).json({ error: 'lat and lon must be valid coordinates.', code: 'INVALID_COORDINATES' });
    return;
  }
  if (!isInServiceArea({ lat, lon })) {
    res.status(400).json({ error: `Nearby search covers the ${SERVICE_AREA.name} only.`, code: 'OUTSIDE_SERVICE_AREA' });
    return;
  }

  const radiusRaw = req.query.radius;
  const radiusM =
    radiusRaw === undefined ? DEFAULT_NEARBY_RADIUS_M : typeof radiusRaw === 'string' ? Number(radiusRaw) : NaN;
  if (!(NEARBY_RADII_M as readonly number[]).includes(radiusM)) {
    res.status(400).json({ error: `radius must be one of ${NEARBY_RADII_M.join(', ')} metres.`, code: 'INVALID_RADIUS' });
    return;
  }

  const nearby: ValidNearbyQuery = { point: { lat, lon }, radiusM };
  res.locals.geoNearby = nearby;
  next();
}

export const GEO_SEARCH_MIN_LENGTH = 2;
export const GEO_SEARCH_MAX_LENGTH = 100;

/** Validated search, left on `res.locals.geoSearch`. */
export interface ValidGeoSearch {
  query: string;
  language: 'en' | 'hi' | 'mr';
}

/** Validator for GET /api/geo/search: `q` (2–100 characters) and optional `lang`. */
export function validateGeoSearchQuery(req: Request, res: Response, next: NextFunction): void {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < GEO_SEARCH_MIN_LENGTH || q.length > GEO_SEARCH_MAX_LENGTH) {
    res.status(400).json({
      error: `Search text must be ${GEO_SEARCH_MIN_LENGTH} to ${GEO_SEARCH_MAX_LENGTH} characters.`,
      code: 'INVALID_SEARCH_QUERY',
    });
    return;
  }

  const lang = req.query.lang ?? 'en';
  if (lang !== 'en' && lang !== 'hi' && lang !== 'mr') {
    res.status(400).json({ error: 'lang must be en, hi or mr.', code: 'INVALID_LANGUAGE' });
    return;
  }

  const search: ValidGeoSearch = { query: q, language: lang };
  res.locals.geoSearch = search;
  next();
}

/** Validated route request, left on `res.locals.routeRequest`. */
export interface ValidRouteRequest {
  mode: TravelMode;
  stops: GeoPoint[];
}

const isCoordinate = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/**
 * Validator for POST /api/geo/route: `{ mode, stops: [{ lat, lon }, ...] }`.
 * Coordinates must be JSON numbers inside the service area, and two stops in
 * a row cannot be the same place. The order is kept exactly as sent.
 */
export function validateRouteRequestBody(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Send a JSON object with mode and stops.', code: 'INVALID_ROUTE_REQUEST' });
    return;
  }

  const { mode, stops } = body;
  if (!isTravelMode(mode)) {
    res.status(400).json({ error: 'mode must be walking or driving.', code: 'INVALID_TRAVEL_MODE' });
    return;
  }
  if (!Array.isArray(stops) || stops.length < MIN_ROUTE_STOPS) {
    res.status(400).json({ error: 'A route needs a start and a destination.', code: 'INVALID_ROUTE_STOPS' });
    return;
  }
  if (stops.length > MAX_ROUTE_STOPS) {
    res.status(400).json({ error: `A route can have at most ${MAX_ROUTE_STOPS} stops.`, code: 'TOO_MANY_ROUTE_STOPS' });
    return;
  }

  const points: GeoPoint[] = [];
  for (let i = 0; i < stops.length; i++) {
    const { lat, lon } = stops[i] ?? {};
    if (!isCoordinate(lat, -90, 90) || !isCoordinate(lon, -180, 180)) {
      res.status(400).json({ error: `Stop ${i + 1} does not have valid coordinates.`, code: 'INVALID_COORDINATES' });
      return;
    }
    if (!isInServiceArea({ lat, lon })) {
      res.status(400).json({ error: `Stop ${i + 1} is outside the ${SERVICE_AREA.name}.`, code: 'OUTSIDE_SERVICE_AREA' });
      return;
    }
    points.push({ lat, lon });
  }

  for (let i = 1; i < points.length; i++) {
    const a = roundRouteStop(points[i - 1]);
    const b = roundRouteStop(points[i]);
    if (a.lat === b.lat && a.lon === b.lon) {
      res.status(400).json({ error: `Stops ${i} and ${i + 1} are the same place.`, code: 'DUPLICATE_ROUTE_STOP' });
      return;
    }
  }

  const routeRequest: ValidRouteRequest = { mode, stops: points };
  res.locals.routeRequest = routeRequest;
  next();
}

/** Where a validated trip starts: a point (also each day's route start) or an area to plan around. */
export type ValidTripStart = { type: 'area'; area: TripArea } | { type: 'point'; point: GeoPoint; label: string };

/** Validated itinerary request, left on `res.locals.itineraryRequest`. */
export interface ValidItineraryRequest {
  days: number;
  start: ValidTripStart;
  interests: TripInterest[];
  budget: TripBudget;
  pace: TripPace;
  mode: TravelMode;
}

/** Trims a client label and drops control characters; null if nothing usable is left. */
function cleanLabel(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 && cleaned.length <= max ? cleaned : null;
}

/**
 * Validator for POST /api/itinerary/generate:
 * `{ days, start, interests, budget, pace, mode }`. `start` is either
 * `{ type: 'area', area }` or `{ type: 'point', lat, lon, label }` inside the
 * service area. Interests must be known and not repeated.
 */
export function validateItineraryRequestBody(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;
  const fail = (code: string, error: string) => {
    res.status(400).json({ error, code });
  };
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail('INVALID_ITINERARY_REQUEST', 'Send a JSON object with days, start, interests, budget, pace and mode.');
    return;
  }

  const { days, start, interests, budget, pace, mode } = body;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < MIN_TRIP_DAYS || days > MAX_TRIP_DAYS) {
    fail('INVALID_TRIP_DAYS', `A trip can be ${MIN_TRIP_DAYS} to ${MAX_TRIP_DAYS} days long.`);
    return;
  }
  if (
    !Array.isArray(interests) || interests.length === 0 || interests.length > TRIP_INTERESTS.length ||
    !interests.every(isTripInterest) || new Set(interests).size !== interests.length
  ) {
    fail('INVALID_INTERESTS', 'Choose at least one interest from the list, each only once.');
    return;
  }
  if (!isTripBudget(budget)) {
    fail('INVALID_BUDGET', 'budget must be economical, moderate or flexible.');
    return;
  }
  if (!isTripPace(pace)) {
    fail('INVALID_PACE', 'pace must be relaxed, balanced or packed.');
    return;
  }
  if (!isTravelMode(mode)) {
    fail('INVALID_TRAVEL_MODE', 'mode must be walking or driving.');
    return;
  }

  let validStart: ValidTripStart;
  if (start?.type === 'area' && isTripArea(start.area)) {
    validStart = { type: 'area', area: start.area };
  } else if (start?.type === 'point') {
    if (!isCoordinate(start.lat, -90, 90) || !isCoordinate(start.lon, -180, 180)) {
      fail('INVALID_COORDINATES', 'The starting point does not have valid coordinates.');
      return;
    }
    if (!isInServiceArea({ lat: start.lat, lon: start.lon })) {
      fail('OUTSIDE_SERVICE_AREA', `The starting point must be in the ${SERVICE_AREA.name}.`);
      return;
    }
    const label = cleanLabel(start.label, MAX_START_LABEL_LENGTH);
    if (!label) {
      fail('INVALID_TRIP_START', `The starting point needs a name of up to ${MAX_START_LABEL_LENGTH} characters.`);
      return;
    }
    validStart = { type: 'point', point: { lat: start.lat, lon: start.lon }, label };
  } else {
    fail('INVALID_TRIP_START', 'Choose a starting place, your location or an area to plan around.');
    return;
  }

  const itineraryRequest: ValidItineraryRequest = { days, start: validStart, interests, budget, pace, mode };
  res.locals.itineraryRequest = itineraryRequest;
  next();
}

/** Validated chat request, left on `res.locals.chatRequest`. */
export type ValidChatRequest = ChatRequest;

/** Control characters other than line breaks and tabs are dropped from chat text. */
const cleanChatText = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();

/**
 * Validator for POST /api/ai/chat: `{ message, language?, history? }`.
 * `message` is 1–MAX_CHAT_MESSAGE_LENGTH characters (`query`, which the chat
 * window sent before 2026-10-21, is accepted too). `history` is at most
 * MAX_CHAT_HISTORY earlier turns, each `{ role: 'user' | 'assistant', text }`
 * of up to MAX_HISTORY_TEXT_LENGTH characters.
 */
export function validateChatRequestBody(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;
  const fail = (code: string, error: string) => {
    res.status(400).json({ error, code });
  };
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail('INVALID_CHAT_REQUEST', 'Send a JSON object with your message.');
    return;
  }

  const raw = body.message ?? body.query;
  const message = typeof raw === 'string' ? cleanChatText(raw) : '';
  if (!message || message.length > MAX_CHAT_MESSAGE_LENGTH) {
    fail('INVALID_CHAT_MESSAGE', `Type a message of 1 to ${MAX_CHAT_MESSAGE_LENGTH} characters.`);
    return;
  }

  const language = body.language ?? 'en';
  if (!isChatLanguage(language)) {
    fail('INVALID_LANGUAGE', 'language must be en, hi or mr.');
    return;
  }

  const history = body.history ?? [];
  const validTurn = (turn: any) =>
    !!turn && typeof turn === 'object' && (turn.role === 'user' || turn.role === 'assistant') &&
    typeof turn.text === 'string' && cleanChatText(turn.text).length > 0 && turn.text.length <= MAX_HISTORY_TEXT_LENGTH;
  if (!Array.isArray(history) || history.length > MAX_CHAT_HISTORY || !history.every(validTurn)) {
    fail(
      'INVALID_CHAT_HISTORY',
      `history must be at most ${MAX_CHAT_HISTORY} earlier messages, each with a role (user or assistant) and text of up to ${MAX_HISTORY_TEXT_LENGTH} characters.`,
    );
    return;
  }

  const chatRequest: ValidChatRequest = {
    message,
    language,
    history: history.map((turn: ChatTurn) => ({ role: turn.role, text: cleanChatText(turn.text) })),
  };
  res.locals.chatRequest = chatRequest;
  next();
}
