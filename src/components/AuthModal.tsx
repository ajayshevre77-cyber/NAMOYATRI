import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Phone, 
  Mail, 
  ShieldCheck, 
  Lock, 
  User as UserIcon, 
  AlertCircle, 
  ArrowRight, 
  Sparkles, 
  CheckCircle2,
  KeyRound,
  Info
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatAuthError, ConfirmationResult } from '../lib/firebase';
import { SupportedLanguage } from '../i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
  currentLanguage: SupportedLanguage;
}

type AuthMode = 
  | 'welcome'
  | 'phone_input'
  | 'otp_verify'
  | 'email_login'
  | 'email_register'
  | 'forgot_password';

export const AuthModal: React.FC<Props> = ({
  isOpen,
  onClose,
  reason,
  currentLanguage,
}) => {
  const { 
    loginWithEmail, 
    registerWithEmail, 
    requestPasswordReset, 
    sendPhoneOtp, 
    verifyPhoneOtp, 
    continueAsGuest,
    setupRecaptcha,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('welcome');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [timerCount, setTimerCount] = useState(45);
  const [canResend, setCanResend] = useState(false);

  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setMode('welcome');
      setErrorMessage(null);
      setSuccessNotice(null);
    }
  }, [isOpen]);

  // Resend countdown
  useEffect(() => {
    let interval: any;
    if (mode === 'otp_verify' && timerCount > 0) {
      interval = setInterval(() => {
        setTimerCount(prev => prev - 1);
      }, 1000);
    } else if (timerCount === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [mode, timerCount]);

  if (!isOpen) return null;

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length !== 10) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number (+91).');
      return;
    }

    const fullPhone = `+91${cleaned}`;
    setIsLoading(true);

    try {
      if (!recaptchaContainerRef.current) {
        throw new Error('reCAPTCHA container initializing, please try in a moment.');
      }
      const appVerifier = setupRecaptcha('recaptcha-container');
      const confirmation = await sendPhoneOtp(fullPhone, appVerifier);
      setConfirmationResult(confirmation);
      setMode('otp_verify');
      setTimerCount(45);
      setCanResend(false);
    } catch (err: any) {
      console.error('Phone OTP error:', err);
      const friendly = formatAuthError(err);
      setErrorMessage(friendly);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index: number, val: string) => {
    if (val.length > 1) {
      val = val.slice(-1);
    }
    const newOtp = [...otpCode];
    newOtp[index] = val;
    setOtpCode(newOtp);

    // Auto-focus next input
    if (val && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const code = otpCode.join('');
    if (code.length !== 6) {
      setErrorMessage('Please enter the complete 6-digit verification code.');
      return;
    }

    if (!confirmationResult) {
      setErrorMessage('Verification session expired. Please re-enter your mobile number.');
      setMode('phone_input');
      return;
    }

    setIsLoading(true);
    try {
      await verifyPhoneOtp(confirmationResult, code);
      onClose();
    } catch (err: any) {
      setErrorMessage(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    try {
      await loginWithEmail(email, password);
      onClose();
    } catch (err: any) {
      setErrorMessage(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email || !password || !displayName) {
      setErrorMessage('Please fill in your name, email, and password.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    try {
      await registerWithEmail(email, password, displayName);
      onClose();
    } catch (err: any) {
      setErrorMessage(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email) {
      setErrorMessage('Please enter your registered email address.');
      return;
    }

    setIsLoading(true);
    try {
      await requestPasswordReset(email);
      setSuccessNotice('Password reset link has been dispatched to your email.');
    } catch (err: any) {
      setErrorMessage(formatAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      id="auth-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/70 backdrop-blur-xs"
    >
      {/* Invisible container for Firebase reCAPTCHA */}
      <div id="recaptcha-container" ref={recaptchaContainerRef}></div>

      <div 
        id="auth-modal-card"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200"
      >
        {/* Header */}
        <div className="bg-stone-900 text-white p-5 relative border-b border-orange-600/30">
          <button 
            id="auth-modal-close-btn"
            onClick={onClose}
            className="absolute top-4 right-4 text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></div>
            <span className="text-xs tracking-wider uppercase font-semibold text-orange-400">
              Namo Yatri Simhastha 2027
            </span>
          </div>
          <h3 className="text-xl font-bold font-serif text-amber-100">
            {mode === 'welcome' && 'Pilgrim Identity & Access'}
            {mode === 'phone_input' && 'Mobile OTP Verification'}
            {mode === 'otp_verify' && 'Enter Verification Code'}
            {mode === 'email_login' && 'Sign In to Namo Yatri'}
            {mode === 'email_register' && 'Create Pilgrim Profile'}
            {mode === 'forgot_password' && 'Recover Account Password'}
          </h3>
          <p className="text-xs text-stone-300 mt-1">
            {reason || 'Secure, verified authentication for Kumbh pilgrim services.'}
          </p>
        </div>

        {/* Error / Success Notifications */}
        {errorMessage && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold">Authentication Notice:</span> {errorMessage}
            </div>
          </div>
        )}

        {successNotice && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold">Success:</span> {successNotice}
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 overflow-y-auto max-h-[75vh]">
          {/* 1. WELCOME SCREEN */}
          {mode === 'welcome' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-orange-50/60 border border-orange-200/80 rounded-xl text-xs text-stone-700 space-y-1.5">
                <div className="font-semibold text-orange-950 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-orange-600" />
                  Protected Services Policy
                </div>
                <p>
                  Browsing sacred ghats, timetable, and public announcements is open to everyone. Purchasing mobility passes, booking auto rides, safety SOS, or volunteering requires a verified account.
                </p>
              </div>

              <div className="space-y-2.5 pt-1">
                <button
                  id="auth-select-phone-btn"
                  onClick={() => { setErrorMessage(null); setMode('phone_input'); }}
                  className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold flex items-center justify-between text-sm shadow-sm transition"
                >
                  <span className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4" />
                    Sign In with Mobile OTP (+91)
                  </span>
                  <ArrowRight className="w-4 h-4 opacity-80" />
                </button>

                <button
                  id="auth-select-email-btn"
                  onClick={() => { setErrorMessage(null); setMode('email_login'); }}
                  className="w-full py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl font-semibold flex items-center justify-between text-sm transition border border-stone-300"
                >
                  <span className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-stone-600" />
                    Sign In with Email & Password
                  </span>
                  <ArrowRight className="w-4 h-4 opacity-70" />
                </button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-stone-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-stone-500 font-medium">Or continue exploring</span>
                  </div>
                </div>

                <button
                  id="auth-continue-guest-btn"
                  onClick={continueAsGuest}
                  className="w-full py-2.5 px-4 bg-white hover:bg-stone-50 text-stone-600 border border-stone-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-stone-400" />
                  Continue as Guest (Limited Public Browsing)
                </button>
              </div>
            </div>
          )}

          {/* 2. PHONE NUMBER INPUT */}
          {mode === 'phone_input' && (
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Indian Mobile Number
                </label>
                <div className="flex rounded-xl border border-stone-300 overflow-hidden focus-within:border-orange-600 focus-within:ring-2 focus-within:ring-orange-600/20">
                  <span className="bg-stone-100 px-3.5 py-2.5 text-sm font-semibold text-stone-700 border-r border-stone-300 flex items-center">
                    🇮🇳 +91
                  </span>
                  <input
                    id="auth-phone-input"
                    type="tel"
                    maxLength={10}
                    placeholder="98765 43210"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3 py-2.5 text-sm text-stone-900 focus:outline-none"
                    required
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-stone-500 mt-1.5 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  We send a 6-digit OTP via SMS. Your phone number is strictly private.
                </p>
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-relaxed">
                <div className="font-semibold flex items-center gap-1 mb-0.5">
                  <Info className="w-3.5 h-3.5 text-amber-700" />
                  SMS Gateway Status
                </div>
                Real-world Firebase phone OTP is dispatched through Google Cloud SMS gateway. If phone provider is in sandbox mode, you can also use Email authentication or Guest mode.
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('welcome')}
                  className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold transition"
                >
                  Back
                </button>
                <button
                  id="auth-phone-submit-btn"
                  type="submit"
                  disabled={isLoading || phoneNumber.length !== 10}
                  className="flex-2 py-2.5 px-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5"
                >
                  {isLoading ? 'Requesting OTP...' : 'Send Verification OTP'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}

          {/* 3. OTP VERIFICATION */}
          {mode === 'otp_verify' && (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div className="text-center space-y-1">
                <div className="text-xs text-stone-600">
                  Enter the 6-digit verification code sent to:
                </div>
                <div className="font-mono font-bold text-stone-900 text-sm">
                  +91 {phoneNumber}
                </div>
              </div>

              <div className="flex justify-between gap-2 my-4">
                {otpCode.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { otpInputRefs.current[idx] = el; }}
                    id={`auth-otp-box-${idx}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="w-11 h-12 text-center text-lg font-bold font-mono border border-stone-300 rounded-xl focus:border-orange-600 focus:ring-2 focus:ring-orange-600/20 focus:outline-none"
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-stone-600 pt-1">
                <span>Didn't receive code?</span>
                {canResend ? (
                  <button
                    type="button"
                    onClick={handlePhoneSubmit}
                    className="text-orange-600 font-semibold hover:underline"
                  >
                    Resend OTP
                  </button>
                ) : (
                  <span className="text-stone-400">Resend in {timerCount}s</span>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('phone_input')}
                  className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold transition"
                >
                  Change Number
                </button>
                <button
                  id="auth-verify-otp-submit-btn"
                  type="submit"
                  disabled={isLoading || otpCode.join('').length !== 6}
                  className="flex-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5"
                >
                  {isLoading ? 'Verifying OTP...' : 'Verify & Continue'}
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}

          {/* 4. EMAIL LOGIN */}
          {mode === 'email_login' && (
            <form onSubmit={handleEmailLoginSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Registered Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    id="auth-email-input"
                    type="email"
                    placeholder="yatri@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-stone-300 rounded-xl focus:border-orange-600 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-stone-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setErrorMessage(null); setMode('forgot_password'); }}
                    className="text-[11px] text-orange-600 hover:underline font-semibold"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    id="auth-password-input"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-stone-300 rounded-xl focus:border-orange-600 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('welcome')}
                  className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold transition"
                >
                  Back
                </button>
                <button
                  id="auth-email-login-submit-btn"
                  type="submit"
                  disabled={isLoading}
                  className="flex-2 py-2.5 px-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5"
                >
                  {isLoading ? 'Signing In...' : 'Sign In'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-center pt-2 text-xs text-stone-600">
                New to Namo Yatri?{' '}
                <button
                  type="button"
                  onClick={() => { setErrorMessage(null); setMode('email_register'); }}
                  className="text-orange-600 font-semibold hover:underline"
                >
                  Create an account
                </button>
              </div>
            </form>
          )}

          {/* 5. EMAIL REGISTER */}
          {mode === 'email_register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Full Name / Pilgrim Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    id="auth-register-name-input"
                    type="text"
                    placeholder="e.g., Rajesh Sharma"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-stone-300 rounded-xl focus:border-orange-600 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    id="auth-register-email-input"
                    type="email"
                    placeholder="yatri@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-stone-300 rounded-xl focus:border-orange-600 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Choose a Password (min. 6 characters)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    id="auth-register-password-input"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-stone-300 rounded-xl focus:border-orange-600 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-[11px] text-stone-600 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                Default role assigned: <span className="font-bold text-stone-800">TOURIST</span>. Drivers & volunteers undergo verified application.
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('email_login')}
                  className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold transition"
                >
                  Back
                </button>
                <button
                  id="auth-register-submit-btn"
                  type="submit"
                  disabled={isLoading}
                  className="flex-2 py-2.5 px-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5"
                >
                  {isLoading ? 'Creating...' : 'Register Profile'}
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}

          {/* 6. FORGOT PASSWORD */}
          {mode === 'forgot_password' && (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              <p className="text-xs text-stone-600">
                Enter your email address and we'll dispatch an official Firebase password reset link.
              </p>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Registered Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    id="auth-forgot-email-input"
                    type="email"
                    placeholder="yatri@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-stone-300 rounded-xl focus:border-orange-600 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('email_login')}
                  className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold transition"
                >
                  Back
                </button>
                <button
                  id="auth-forgot-submit-btn"
                  type="submit"
                  disabled={isLoading}
                  className="flex-2 py-2.5 px-4 bg-stone-900 hover:bg-black disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5"
                >
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                  <KeyRound className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
