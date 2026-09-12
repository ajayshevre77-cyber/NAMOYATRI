import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  Auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as fbSignOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged,
  signInAnonymously,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  Firestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  onSnapshot
} from 'firebase/firestore';
import { User, UserProfile, UserRole, VerificationStatus, StandardUserRole } from '../types';
import firebaseConfigJson from '../../firebase-applet-config.json';

// Firebase Client Configuration
const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey || '',
  authDomain: firebaseConfigJson.authDomain || '',
  projectId: firebaseConfigJson.projectId || '',
  storageBucket: firebaseConfigJson.storageBucket || '',
  messagingSenderId: firebaseConfigJson.messagingSenderId || '',
  appId: firebaseConfigJson.appId || '',
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const auth: Auth = getAuth(app);

// Use named firestore database ID from configuration
export const db: Firestore = (function initDb() {
  try {
    if (firebaseConfigJson.firestoreDatabaseId) {
      return getFirestore(app, firebaseConfigJson.firestoreDatabaseId);
    }
    return getFirestore(app);
  } catch (err) {
    console.warn('Falling back to default Firestore database', err);
    return getFirestore(app);
  }
})();

export const ADMIN_EMAIL = 'namoyatriindia@gmail.com';

/**
 * Format raw Firebase Auth errors into clear, friendly guidance
 */
export function formatAuthError(error: any): string {
  if (!error) return 'An unexpected error occurred.';
  const code = error.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact the district helpdesk.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid credentials. Please verify your email and password or use mobile OTP.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters for safety.';
    case 'auth/invalid-phone-number':
      return 'Please enter a valid 10-digit Indian mobile number (+91).';
    case 'auth/invalid-verification-code':
      return 'Invalid 6-digit OTP code. Please check SMS and try again.';
    case 'auth/code-expired':
      return 'The OTP has expired. Please request a fresh code.';
    case 'auth/captcha-check-failed':
      return 'reCAPTCHA verification could not be completed. Please refresh and retry.';
    case 'auth/quota-exceeded':
      return 'Daily SMS verification limit reached for this sandbox project. You may sign in using Email or continue in Guest Mode.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is currently awaiting activation in Firebase Console. You may use Email or Guest mode in the interim.';
    default:
      return error.message || 'Authentication failed. Please try again.';
  }
}

/**
 * Fetch or bootstrap User document from Firestore
 */
export async function getOrCreateUserProfile(fbUser: FirebaseUser): Promise<UserProfile> {
  const userDocRef = doc(db, 'users', fbUser.uid);
  const profileDocRef = doc(db, 'profiles', fbUser.uid);

  try {
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        id: fbUser.uid,
        userId: fbUser.uid,
        name: data.displayName || fbUser.displayName || 'Pilgrim Yatri',
        displayName: data.displayName || fbUser.displayName || 'Pilgrim Yatri',
        phone: data.phoneNumber || fbUser.phoneNumber || '',
        phoneNumber: data.phoneNumber || fbUser.phoneNumber || '',
        email: data.email || fbUser.email || undefined,
        role: (fbUser.email === ADMIN_EMAIL ? 'ADMIN' : data.role || 'TOURIST') as UserRole,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        preferredLanguage: data.preferredLanguage || 'en',
        isPhoneVerified: Boolean(fbUser.phoneNumber),
        verificationStatus: (fbUser.email === ADMIN_EMAIL ? 'VERIFIED' : data.verificationStatus || 'PENDING') as VerificationStatus,
        privacySettings: {
          isProfilePublic: false,
          locationSharingMode: 'temporary_sharing',
          shareContactInEmergency: true,
        },
        locationSharingOptIn: false,
        savedPlaceIds: [],
      };
    }

    // Default new user is strictly TOURIST
    const initialRole: StandardUserRole = fbUser.email === ADMIN_EMAIL ? 'ADMIN' : 'TOURIST';
    const initialStatus: VerificationStatus = fbUser.email === ADMIN_EMAIL ? 'VERIFIED' : 'PENDING';

    const newUserData = {
      userId: fbUser.uid,
      displayName: fbUser.displayName || (fbUser.phoneNumber ? `Yatri-${fbUser.phoneNumber.slice(-4)}` : 'Pilgrim Yatri'),
      phoneNumber: fbUser.phoneNumber || '',
      email: fbUser.email || '',
      preferredLanguage: 'en',
      role: initialRole,
      verificationStatus: initialStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const newProfileData = {
      userId: fbUser.uid,
      isProfilePublic: false,
      locationSharingMode: 'temporary_sharing',
      shareContactInEmergency: true,
      savedPlaceIds: [],
      updatedAt: serverTimestamp(),
    };

    await setDoc(userDocRef, newUserData);
    await setDoc(profileDocRef, newProfileData);

    return {
      id: fbUser.uid,
      userId: fbUser.uid,
      name: newUserData.displayName,
      displayName: newUserData.displayName,
      phone: newUserData.phoneNumber,
      phoneNumber: newUserData.phoneNumber,
      email: newUserData.email || undefined,
      role: initialRole,
      createdAt: new Date().toISOString(),
      preferredLanguage: 'en',
      isPhoneVerified: Boolean(fbUser.phoneNumber),
      verificationStatus: initialStatus,
      privacySettings: {
        isProfilePublic: false,
        locationSharingMode: 'temporary_sharing',
        shareContactInEmergency: true,
      },
      locationSharingOptIn: false,
      savedPlaceIds: [],
    };
  } catch (err) {
    console.error('Firestore user profile sync warning (operating in local fallback):', err);
    // Fallback profile if offline or rule blocked
    return {
      id: fbUser.uid,
      userId: fbUser.uid,
      name: fbUser.displayName || 'Pilgrim Yatri',
      displayName: fbUser.displayName || 'Pilgrim Yatri',
      phone: fbUser.phoneNumber || '',
      phoneNumber: fbUser.phoneNumber || '',
      email: fbUser.email || undefined,
      role: (fbUser.email === ADMIN_EMAIL ? 'ADMIN' : 'TOURIST') as UserRole,
      createdAt: new Date().toISOString(),
      preferredLanguage: 'en',
      isPhoneVerified: Boolean(fbUser.phoneNumber),
      verificationStatus: 'PENDING',
      privacySettings: {
        isProfilePublic: false,
        locationSharingMode: 'temporary_sharing',
        shareContactInEmergency: true,
      },
      locationSharingOptIn: false,
      savedPlaceIds: [],
    };
  }
}

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  fbSignOut as signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signInAnonymously,
  RecaptchaVerifier,
  signInWithPhoneNumber,
};
export type { ConfirmationResult, FirebaseUser };
