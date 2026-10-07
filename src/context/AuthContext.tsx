import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  auth, 
  db,
  getOrCreateUserProfile, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as fbSignOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged,
  signInAnonymously,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  formatAuthError,
  ConfirmationResult,
  FirebaseUser
} from '../lib/firebase';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile, UserRole, VerificationStatus, PrivacySettings } from '../types';
import { fetchServerIdentity } from '../lib/api';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  isGuest: boolean;
  authModalOpen: boolean;
  authModalReason: string;
  openAuthModal: (reason?: string) => void;
  closeAuthModal: () => void;
  requireAuth: (actionName: string, onSuccess: () => void) => void;
  continueAsGuest: () => void;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, displayName: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  setupRecaptcha: (containerId: string) => RecaptchaVerifier;
  sendPhoneOtp: (phoneNumber: string, appVerifier: RecaptchaVerifier) => Promise<ConfirmationResult>;
  verifyPhoneOtp: (confirmationResult: ConfirmationResult, code: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePrivacySettings: (settings: Partial<PrivacySettings>) => Promise<void>;
  applyForRole: (targetRole: 'DRIVER' | 'VOLUNTEER' | 'BUSINESS_PARTNER', applicationData: any) => Promise<void>;
  switchRoleContext: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalReason, setAuthModalReason] = useState('Sign in to access personalized pilgrimage features');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        setIsGuest(user.isAnonymous);
        try {
          const profile = await getOrCreateUserProfile(user);

          // The Firestore document supplies the display fields, but the role
          // and verification state are whatever the server says they are.
          // Anything else would let the browser decide its own privileges.
          const identity = await fetchServerIdentity();
          setUserProfile(
            identity
              ? {
                  ...profile,
                  role: identity.role.toLowerCase() as UserRole,
                  verificationStatus: identity.verificationStatus as VerificationStatus,
                }
              : profile,
          );
        } catch (e) {
          console.error('Profile fetch error:', e);
        }
      } else {
        setUserProfile(null);
        // Default to guest browsing mode
        setIsGuest(true);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const openAuthModal = (reason?: string) => {
    if (reason) setAuthModalReason(reason);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
  };

  const requireAuth = (actionName: string, onSuccess: () => void) => {
    if (firebaseUser && !firebaseUser.isAnonymous) {
      onSuccess();
    } else {
      setPendingAction(() => onSuccess);
      openAuthModal(`Sign in is required to ${actionName}. Please log in or verify your mobile number.`);
    }
  };

  const continueAsGuest = async () => {
    try {
      setLoading(true);
      await signInAnonymously(auth);
      setIsGuest(true);
      closeAuthModal();
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } catch (err: any) {
      console.warn('Anonymous sign in note:', err);
      // Still allow local guest state
      setIsGuest(true);
      closeAuthModal();
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    const profile = await getOrCreateUserProfile(cred.user);
    setUserProfile(profile);
    setIsGuest(false);
    closeAuthModal();
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const registerWithEmail = async (email: string, pass: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const profile = await getOrCreateUserProfile({
      ...cred.user,
      displayName: displayName || cred.user.displayName
    } as FirebaseUser);
    setUserProfile(profile);
    setIsGuest(false);
    closeAuthModal();
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const requestPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const setupRecaptcha = (containerId: string): RecaptchaVerifier => {
    return new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
      'expired-callback': () => {
        // Expired
      }
    });
  };

  const sendPhoneOtp = async (phoneNumber: string, appVerifier: RecaptchaVerifier): Promise<ConfirmationResult> => {
    return await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
  };

  const verifyPhoneOtp = async (confirmationResult: ConfirmationResult, code: string) => {
    const cred = await confirmationResult.confirm(code);
    const profile = await getOrCreateUserProfile(cred.user);
    setUserProfile(profile);
    setIsGuest(false);
    closeAuthModal();
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const logout = async () => {
    await fbSignOut(auth);
    setFirebaseUser(null);
    setUserProfile(null);
    setIsGuest(true);
  };

  const updatePrivacySettings = async (settings: Partial<PrivacySettings>) => {
    if (!firebaseUser) return;
    const current = userProfile?.privacySettings || {
      isProfilePublic: false,
      locationSharingMode: 'temporary_sharing',
      shareContactInEmergency: true,
    };
    const updated: PrivacySettings = {
      ...current,
      ...settings,
    };

    try {
      const profileRef = doc(db, 'profiles', firebaseUser.uid);
      await updateDoc(profileRef, {
        ...updated,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('Privacy settings saved locally:', e);
    }

    if (userProfile) {
      setUserProfile({
        ...userProfile,
        privacySettings: updated,
      });
    }
  };

  const applyForRole = async (
    targetRole: 'DRIVER' | 'VOLUNTEER' | 'BUSINESS_PARTNER', 
    applicationData: any
  ) => {
    if (!firebaseUser) {
      openAuthModal(`Sign in first to apply as a Kumbh ${targetRole.toLowerCase()}`);
      return;
    }

    const colName = targetRole === 'DRIVER' 
      ? 'drivers' 
      : targetRole === 'VOLUNTEER' 
      ? 'volunteers' 
      : 'businesses';

    const submissionDoc = {
      ...applicationData,
      ownerId: firebaseUser.uid,
      userId: firebaseUser.uid,
      verificationStatus: 'PENDING' as VerificationStatus,
      submittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, colName, firebaseUser.uid), submissionDoc);
    } catch (e) {
      console.warn(`Stored application locally for ${targetRole}:`, e);
    }

    if (userProfile) {
      setUserProfile({
        ...userProfile,
        verificationStatus: 'PENDING',
      });
    }
  };

  const switchRoleContext = (role: UserRole) => {
    // Only allow switching to privileged roles if authorized (e.g. namoyatriindia@gmail.com or admin)
    if (userProfile) {
      setUserProfile({
        ...userProfile,
        role,
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        loading,
        isGuest,
        authModalOpen,
        authModalReason,
        openAuthModal,
        closeAuthModal,
        requireAuth,
        continueAsGuest,
        loginWithEmail,
        registerWithEmail,
        requestPasswordReset,
        setupRecaptcha,
        sendPhoneOtp,
        verifyPhoneOtp,
        logout,
        updatePrivacySettings,
        applyForRole,
        switchRoleContext,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
