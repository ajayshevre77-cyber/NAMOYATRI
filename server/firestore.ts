import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { configuredFirestoreDatabaseId, firebaseAdminApp } from './firebaseAdmin';

/**
 * The Firestore database the server uses: FIRESTORE_DATABASE_ID when set,
 * else the named database in firebase-applet-config.json (the one the
 * browser already writes profiles to), else the project's (default) one.
 * Read lazily, because dotenv.config() runs after the imports.
 */
export function serverFirestoreDatabaseId(): string {
  return process.env.FIRESTORE_DATABASE_ID?.trim() || configuredFirestoreDatabaseId || '(default)';
}

let firestore: Firestore | null = null;

/**
 * The Admin SDK client for that database, on the app firebaseAdmin.ts already
 * initialised. Credentials are Application Default Credentials
 * (GOOGLE_APPLICATION_CREDENTIALS locally, the attached service account on
 * Google Cloud); FIRESTORE_EMULATOR_HOST points it at the emulator instead.
 * Nothing connects until the first read or write.
 */
export function getServerFirestore(): Firestore {
  if (firestore) return firestore;
  if (!firebaseAdminApp) throw new Error('The Firebase Admin app is not initialised.');
  const databaseId = serverFirestoreDatabaseId();
  firestore = databaseId === '(default)' ? getFirestore(firebaseAdminApp) : getFirestore(firebaseAdminApp, databaseId);
  return firestore;
}
