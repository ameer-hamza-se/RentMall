import { requestJson } from '../../api/api-client.js';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

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

export async function requestProfile(user, { method = 'GET', profile, signal, path = '', onRetry } = {}) {
  const saved = await requestMongoProfile(user, { method, profile, signal, path, onRetry });
  if (!saved || method !== 'GET' || path) return saved;
  try {
    return await importBrowserFavorites(user, saved, signal);
  } catch {
    return saved;
  }
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

async function requestMongoProfile(user, { method, profile, signal, path, onRetry }) {
  const result = await requestJson('/account/me' + path, {
    method,
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(profile ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(profile ? { body: JSON.stringify(profile) } : {}),
    signal,
    onRetry,
  });
  return result.profile;
}

export async function saveProfilePhoto(user, photo) {
  await requestProfile(user, { path: '/photo', method: 'PATCH', profile: { photo } });
}
