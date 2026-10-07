import { auth } from './firebase';

/**
 * Retrieves the current Firebase Authentication ID Token
 */
export async function getAuthHeader(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (!currentUser) return {};
  try {
    const token = await currentUser.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (err) {
    console.error('Failed to retrieve Firebase ID token:', err);
    return {};
  }
}

/**
 * Standard fetch wrapper that automatically attaches the verified Firebase ID Token
 */
export async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const authHeaders = await getAuthHeader();
  const mergedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders,
    ...((options.headers as Record<string, string>) || {}),
  };

  return fetch(url, {
    ...options,
    headers: mergedHeaders,
  });
}

/**
 * The server's own view of who you are.
 *
 * This is the only trustworthy source of a user's role. The Firestore profile
 * is convenient for display, but the server decides what a role actually is,
 * and it is the server that enforces it on every request.
 */
export interface ServerIdentity {
  uid: string;
  email?: string;
  emailVerified: boolean;
  phoneNumber?: string;
  role: string;
  verificationStatus: string;
  isAnonymous: boolean;
}

/**
 * Asks the API who the signed-in user is.
 *
 * Returns null when the call fails or nobody is signed in, so callers fall back
 * to the least-privileged assumption rather than to a cached guess.
 */
export async function fetchServerIdentity(): Promise<ServerIdentity | null> {
  try {
    const res = await secureFetch('/api/users/me');
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.user as ServerIdentity) ?? null;
  } catch (err) {
    console.error('[Namo Yatri] Could not confirm identity with the server.', err);
    return null;
  }
}

/**
 * Reads a list endpoint and returns the array under `key`.
 *
 * Throws on a transport failure, a non-2xx status, or a body that is not the
 * shape we expect — so callers have something real to report. A plain
 * `fetch().then(r => r.json())` treats a 404 HTML page as success, which is how
 * a wrong URL can look like an empty feed forever.
 */
export async function fetchCollection<T>(url: string, key: string): Promise<T[]> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (cause) {
    throw new Error(`${url} is unreachable`, { cause });
  }

  if (!res.ok) {
    throw new Error(`${url} responded ${res.status} ${res.statusText}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (cause) {
    throw new Error(`${url} did not return JSON`, { cause });
  }

  const items = (body as Record<string, unknown>)?.[key] ?? body;
  if (!Array.isArray(items)) {
    throw new Error(`${url} returned no "${key}" array`);
  }

  return items as T[];
}
