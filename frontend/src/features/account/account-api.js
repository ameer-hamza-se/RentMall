import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const apiOrigin = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const auth = Object.values(config).every(Boolean) ? getAuth(initializeApp(config)) : null;

export function logoutAccount() {
  return signOut(auth);
}

export function watchAccount(onChange) {
  if (!auth) {
    onChange(null);
    return () => {};
  }
  return onAuthStateChanged(auth, onChange, () => onChange(null));
}

export async function requestProfile(user, { method = 'GET', profile, signal, path = '' } = {}) {
  const saved = await requestMongoProfile(user, { method, profile, signal, path });
  return saved && method === 'GET' && !path ? importBrowserFavorites(user, saved, signal) : saved;
}

async function importBrowserFavorites(user, saved, signal) {
  const key = 'rentmall-favorites:' + user.uid;
  let slugs;
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!Array.isArray(value)) return saved;
    slugs = [...new Set(value.filter((slug) => typeof slug === 'string' && /^[a-z0-9-]{1,180}$/.test(slug)))];
  } catch {
    return saved;
  }
  for (let offset = 0; offset < slugs.length; offset += 200) {
    saved = await requestMongoProfile(user, {
      method: 'POST', profile: { slugs: slugs.slice(offset, offset + 200) }, signal, path: '/favorites/import',
    });
  }
  try { localStorage.removeItem(key); } catch { /* The import is safe to retry. */ }
  return saved;
}

async function requestMongoProfile(user, { method, profile, signal, path }) {
  const timeout = AbortSignal.timeout(10000);
  const response = await fetch(`${apiOrigin}/api/v1/account/me${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(profile ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(profile ? { body: JSON.stringify(profile) } : {}),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error ?? 'Could not reach your profile. Try again shortly.');
  return result.profile;
}

export async function saveProfilePhoto(user, photo) {
  await requestProfile(user, { path: '/photo', method: 'PATCH', profile: { photo } });
}
