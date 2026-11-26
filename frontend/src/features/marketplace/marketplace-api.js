import { requestSignal } from '../../api/request-signal.js';
const origin = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

async function accountData(user, path, method = 'GET', body, signal) {
  const response = await fetch(origin + '/api/v1/account/me' + path, {
    method,
    headers: { Authorization: 'Bearer ' + await user.getIdToken(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: requestSignal(15000, signal),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw Object.assign(new Error(result?.error ?? 'Could not complete your request. Try again.'), { code: result?.code });
  }
  return response.status === 204 ? null : response.json();
}

export async function getOwnerAds(user) {
  return (await accountData(user, '/ads')).items;
}

export async function getListingContact(user, slug, signal) {
  const { contact } = await accountData(user, '/listings/' + encodeURIComponent(slug) + '/contact', 'GET', undefined, signal);
  return contact;
}

async function encodePhoto(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .75);
  } finally {
    bitmap.close();
  }
}

async function encodePhotos(files) {
  const images = [];
  for (const file of files) images.push(await encodePhoto(file));
  return images;
}

export async function publishAd(user, ad) {
  const { photos, ...fields } = ad;
  const images = await encodePhotos(photos);
  const { adId } = await accountData(user, '/ads/' + encodeURIComponent(ad.slug), 'PUT', { ...fields, imageCount: images.length, images });
  return { ...ad, adId, available: true };
}

export async function editAd(user, slug, fields, photos) {
  const body = photos === undefined ? fields : { ...fields, images: await encodePhotos(photos) };
  const { item } = await accountData(user, '/ads/' + encodeURIComponent(slug), 'PATCH', body);
  return item;
}

export function editAvailability(user, slug, available) {
  return accountData(user, '/ads/' + encodeURIComponent(slug), 'PATCH', { available });
}

export function deleteAd(user, slug) {
  return accountData(user, '/ads/' + encodeURIComponent(slug), 'DELETE');
}
