import { useState } from 'react';
import { createUserWithEmailAndPassword, GoogleAuthProvider, getAdditionalUserInfo, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { auth, requestProfile } from './account-api.js';
import { validateDetails } from '../../shared/profile-details.js';
import { Dialog } from './rental-dialogs.jsx';

const firebaseMessages = {
  'auth/email-already-in-use': 'This email already has an account. Sign in or reset your password.',
  'auth/invalid-credential': 'Check your email and password and try again.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
  'auth/weak-password': 'Choose a stronger password.',
  'auth/popup-blocked': 'Allow pop-ups for RentMall to sign in with Google.',
  'auth/operation-not-allowed': 'This sign-in option is not available yet.',
  'auth/unauthorized-domain': 'Google sign-in is not enabled for this address yet.',
  'auth/account-exists-with-different-credential': 'An account already uses that email. Sign in with your email and password.',
};

export default function AccountDialog({ user, profile, ready, profileError, onRetry, onClose, onContinue, continuation, editing, onboarding, onComplete, onAuthenticated, onEdit }) {
  if (!user) return <CredentialsDialog onClose={onClose} onAuthenticated={onAuthenticated} />;
  if (!ready || profileError) {
    return (
      <Dialog title="My profile" onClose={onClose}>
        <div className="dialog-body account-form">
          {profileError ? (
            <>
              <p role="alert">Could not load your saved profile.</p>
              <button className="secondary-button" type="button" onClick={onRetry}>Try again</button>
            </>
          ) : <p role="status">Loading your profile…</p>}
        </div>
      </Dialog>
    );
  }
  const complete = profile && !validateDetails(profile).error;
  if (editing || (onboarding && !complete)) {
    return <ProfileDialog key={user.uid} user={user} profile={profile} complete={complete} onComplete={onComplete} onClose={onClose} />;
  }
  return (
    <Dialog title={complete ? 'You’re signed in' : 'Set up your profile'} onClose={onClose}>
      <div className="dialog-body account-form">
        {complete ? <button className="primary-button" type="button" onClick={onContinue}>{continuation?.label ?? 'Open my profile'}</button> : (
          <>
            <p>Add your profile details to use this feature.</p>
            <button className="primary-button" type="button" onClick={onEdit}>Set up profile</button>
          </>
        )}
      </div>
    </Dialog>
  );
}

function CredentialsDialog({ onClose, onAuthenticated }) {
  const [mode, setMode] = useState('choose');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const title = { choose: 'Sign in to RentMall', signin: 'Sign in with email', register: 'Create an account', reset: 'Reset your password' }[mode];

  function changeMode(value) {
    setError('');
    setMessage('');
    setShowPassword(false);
    setMode(value);
  }

  async function submit(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError('');
    setMessage('');
    setBusy(true);
    try {
      if (mode === 'reset') {
        try {
          await sendPasswordResetEmail(auth, email.trim());
        } catch (failure) {
          if (failure.code !== 'auth/user-not-found') throw failure;
        }
        setMessage('If an account exists for this email, check your inbox for a password reset link.');
      } else {
        const method = mode === 'register' ? createUserWithEmailAndPassword : signInWithEmailAndPassword;
        await method(auth, email.trim(), fields.get('password'));
        onAuthenticated(mode === 'register');
      }
    } catch (failure) {
      setError(firebaseMessages[failure.code] ?? 'Sign-in services are unavailable. Try again shortly.');
    } finally {
      setBusy(false);
    }
  }

  async function useGoogle() {
    setError('');
    setBusy(true);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      onAuthenticated(getAdditionalUserInfo(result)?.isNewUser === true);
    } catch (failure) {
      if (failure.code !== 'auth/popup-closed-by-user') {
        setError(firebaseMessages[failure.code] ?? 'Could not sign in with Google. Try again or use your email.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={title} className="signin-dialog" headingMark={<span className="brand-mark signin-mark" aria-hidden="true"><i /><i /></span>} busy={busy} onClose={onClose}>
      {!auth ? <div className="dialog-body">Account sign-in is unavailable on this build.</div> : mode === 'choose' ? (
        <div className="dialog-body signin-choices">
          <button className="secondary-button google-button" type="button" disabled={busy} onClick={useGoogle}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.7 3.3-8z" />
              <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.8l-3.6-2.7c-1 .6-2.2 1-3.7 1-2.9 0-5.3-2-6.2-4.6H2.1v2.9A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.8 13.9a6.6 6.6 0 0 1 0-3.8V7.2H2.1a11 11 0 0 0 0 9.6z" />
              <path fill="#EA4335" d="M12 5.5c1.6 0 3 .6 4.2 1.7l3.2-3.2A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.1 7.2l3.7 2.9c.9-2.7 3.3-4.6 6.2-4.6z" />
            </svg>
            {busy ? 'Opening Google…' : 'Login with Google'}
          </button>
          <div className="signin-divider">or</div>
          <button className="secondary-button signin-email-button" type="button" disabled={busy} onClick={() => changeMode('signin')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <path d="m4 7 8 6 8-6" />
            </svg>
            Login with email
          </button>
          {error && <p role="alert" className="account-error">{error}</p>}
          <p className="signin-signup">New to RentMall? <button className="signin-link" type="button" disabled={busy} onClick={() => changeMode('register')}>Create an account</button></p>
        </div>
      ) : (
        <form className="dialog-body ad-form account-form" onSubmit={submit}>
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          {mode !== 'reset' && (
            <div className="password-field">
              <label htmlFor="account-password">Password</label>
              <div className="password-input">
                <input
                  key={mode}
                  id="account-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={mode === 'register' ? 6 : undefined}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
                <button
                  className="signin-link"
                  type="button"
                  aria-controls="account-password"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="account-error">{error}</p>}
          {message && <p role="status">{message}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'reset' ? 'Send reset email' : mode === 'register' ? 'Create an account' : 'Sign in'}
          </button>
          <div className="signin-form-actions">
            <button className="signin-link" type="button" disabled={busy} onClick={() => changeMode(mode === 'reset' ? 'signin' : 'choose')}>
              {mode === 'reset' ? 'Back to email sign-in' : 'Back to sign-in options'}
            </button>
            {mode === 'signin' && <button className="signin-link" type="button" disabled={busy} onClick={() => changeMode('reset')}>Forgot password?</button>}
          </div>
        </form>
      )}
    </Dialog>
  );
}

function ProfileDialog({ user, profile, complete, onClose, onComplete }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function saveProfile(fields) {
    setBusy(true);
    setError('');
    try {
      const saved = await requestProfile(user, { method: profile ? 'PATCH' : 'PUT', profile: fields });
      onComplete(user.uid, saved);
    } catch {
      setError('Could not save your profile. Try again shortly.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await signOut(auth);
      onClose();
    } catch {
      setError('Could not sign out. Try again.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={complete ? 'Edit profile' : 'Complete your profile'} subtitle={user.email} onClose={onClose} busy={busy}>
      <div className="dialog-body account-form">
        <ProfileFields profile={profile} nameHint={user.displayName} onSubmit={saveProfile} busy={busy} />
        {error && <p className="account-error" role="alert">{error}</p>}
        {!complete && <button type="button" className="secondary-button" onClick={logout} disabled={busy}>Sign out</button>}
      </div>
    </Dialog>
  );
}

function ProfileFields({ profile, nameHint, onSubmit, busy }) {
  const [validation, setValidation] = useState('');
  const names = (profile?.name || nameHint || '').trim().split(/\s+/);
  const [accountType, setAccountType] = useState(profile?.accountType ?? 'individual');
  return (
    <form className="ad-form account-form" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const result = validateDetails(Object.fromEntries(data));
      setValidation(result.error || '');
      if (!result.error) onSubmit({ ...result.fields, accountType, businessName: data.get('businessName')?.trim() ?? '' });
    }}>
      <div className="form-row">
        <label>First name<input name="firstName" autoComplete="given-name" defaultValue={profile?.firstName ?? names[0]} maxLength={60} required /></label>
        <label>Last name<input name="lastName" autoComplete="family-name" defaultValue={profile?.lastName ?? names.slice(1).join(' ')} maxLength={60} required /></label>
      </div>
      <label>Address<input name="address" autoComplete="street-address" defaultValue={profile?.address} placeholder="House, street, area and city" maxLength={250} required /></label>
      <label>Pakistan mobile number<input name="phone" type="tel" autoComplete="tel" defaultValue={profile?.phone} placeholder="+92 300 1234567" maxLength={24} required /></label>
      {validation && <p role="alert" className="account-error">{validation}</p>}
      <label>Account type
        <select value={accountType} onChange={(event) => setAccountType(event.target.value)}>
          <option value="individual">Individual</option>
          <option value="business">Business</option>
        </select>
      </label>
      {accountType === 'business' && <label>Business name<input name="businessName" autoComplete="organization" defaultValue={profile?.businessName} maxLength={120} required /></label>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : 'Save profile'}</button>
    </form>
  );
}
