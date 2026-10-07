import { Request, Response, NextFunction } from 'express';

/**
 * Production Security Headers Middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // HSTS (HTTP Strict Transport Security)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // XSS Auditor
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Permissions policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=()');

  // Content Security Policy - tailored for AI Studio preview & Firebase Auth
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.firebaseapp.com https://*.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.run.app wss://*.run.app",
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
    "frame-ancestors 'self' https://*.google.com https://*.run.app https://ai.studio",
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);

  next();
}

/**
 * Controlled CORS Middleware
 * Disallows wildcard '*' on authenticated endpoints
 */
/** Hosts allowed in full, matched exactly against the parsed hostname. */
const ALLOWED_ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Parent domains whose subdomains are allowed. */
const ALLOWED_ORIGIN_SUFFIXES = ['.run.app', '.google.com', '.firebaseapp.com'];

/** Origins allowed as an exact string, scheme included. */
const ALLOWED_ORIGINS = new Set(['https://ai.studio']);

/**
 * Decides whether an Origin header may be echoed back.
 *
 * The hostname is parsed rather than substring-matched. A substring test lets
 * an attacker register a domain that merely contains an allowed name -
 * `localhost.attacker.com` or `evil.com/?x=127.0.0.1` - and be granted
 * credentialed cross-origin access.
 */
export function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;

  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false; // Not a parseable origin, so not one we trust.
  }

  if (ALLOWED_ORIGIN_HOSTS.has(hostname)) return true;

  // endsWith on the hostname, so `attacker-run.app` and
  // `run.app.attacker.com` both fail while `svc.run.app` passes.
  return ALLOWED_ORIGIN_SUFFIXES.some(suffix => hostname.endsWith(suffix));
}

export function secureCors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  // Verify origin if present
  if (origin) {
    if (isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  res.setHeader(
    'Access-Control-Allow-Methods', 
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers', 
    'Content-Type, Authorization, X-Requested-With, Accept'
  );

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

/**
 * In-Memory Sliding Window Rate Limiter Factory
 */
interface RateLimitBucket {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyPrefix?: string;
}) {
  const { windowMs, maxRequests, message = 'Too many requests. Please slow down.', keyPrefix = 'rl' } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Resolve IP safely
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    const bucket = rateLimitStore.get(key);

    if (!bucket || now > bucket.resetTime) {
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      next();
      return;
    }

    if (bucket.count >= maxRequests) {
      const retryAfter = Math.ceil((bucket.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json({
        error: message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    bucket.count += 1;
    next();
  };
}

// Clean up stale rate limit records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (now > bucket.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Centralized Production Error Handler
 * Suppresses stack traces and sensitive server environment details
 */
export function centralizedErrorHandler(
  err: any, 
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  // Always log full diagnostics on server side only
  console.error(`[Server Error] [${req.method} ${req.path}]`, err);

  const statusCode = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Sanitized client response
  res.status(statusCode).json({
    error: isProduction 
      ? 'An unexpected service error occurred. Please retry shortly.' 
      : (err.message || 'Internal Server Error'),
    code: err.code || 'INTERNAL_SERVER_ERROR',
  });
}
