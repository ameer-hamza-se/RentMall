import { useRef, useState } from 'react';
import { Dialog } from '../../components/dialog.jsx';
import { categories, individualAdLimitMessage, maxIndividualAdsPerCategory, rateUnits } from '../../../../shared/catalog.js';
import { maxKeywordLength, maxListingKeywords } from '../../../../shared/listing-discovery.js';
import { editAd, publishAd } from './marketplace-api.js';
import { ListingPhoto, UploadedPhoto } from './listing-photo.jsx';

const policies = [
  'List one item or place you own or have permission to rent. Choose the category that best fits it.',
  'Use a clear title, an accurate description, and photos you have permission to share. Describe any damage or restrictions.',
  'Show the full rental price for the selected rate unit. Disclose any deposit, extra fees, or return conditions before making an agreement.',
  'Use your real account type and list only in Sahiwal during this demo. Do not post duplicate, misleading, stolen, illegal, or unsafe listings.',
  'Keep private contact details, ID documents, and payment information out of public titles, descriptions, and photos.',
  'Review any rental terms with the owner before making a commitment.',
];

export function PostRental({ user, ownerUid, listing, ownerAds, onClose, onPosted, onUpdated, onView }) {
  const [stage, setStage] = useState('form');
  const [draft, setDraft] = useState(() => listing ? {
    title: listing.title, description: listing.summary, category: listing.category, area: listing.area,
    price: listing.priceMinor / 100, rateUnit: listing.rateUnit, keywords: listing.keywords,
  } : {});
  const [category, setCategory] = useState(listing?.category ?? '');
  const [blockedCategory, setBlockedCategory] = useState('');
  const [photos, setPhotos] = useState([]);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [business, setBusiness] = useState(listing?.ownerType === 'business');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [posted, setPosted] = useState(null);
  const submission = useRef(false);
  const title = listing ? 'Edit ad' : { form: 'Rent something out', policy: 'Rental ad policies', done: 'Ad placed' }[stage];
  const existingPhotoCount = listing?.photos?.length || listing?.imageCount || (listing?.photoUrl ? 1 : 0);
  const keepingPhotos = existingPhotoCount > 0 && !removeExisting && photos.length === 0;
  const keepingIndividualSlot = listing?.category === category && listing.ownerType !== 'business';
  const individualCount = ownerAds?.filter((ad) => ad.category === category && ad.ownerType !== 'business').length ?? 0;
  const limitReached = !business && !!category && !keepingIndividualSlot
    && (blockedCategory === category || individualCount >= maxIndividualAdsPerCategory);

  function addPhotos(event) {
    const files = Array.from(event.target.files);
    event.target.value = '';
    if (photos.length + files.length > 5) {
      setError('You can add up to five photos. Remove one before adding another.');
      return;
    }
    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10_000_000)) {
      setError('Choose JPG, PNG, or WebP photos up to 10 MB each.');
      return;
    }
    setError('');
    setPhotos([...photos, ...files.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }

  async function review(event) {
    event.preventDefault();
    if (limitReached) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    fields.title = fields.title.trim();
    fields.description = fields.description.trim();
    fields.keywords = [...new Set(fields.keywords.toLowerCase().split(',').map((keyword) => keyword.trim()).filter(Boolean))];
    if (listing ? !fields.title || !fields.description : fields.title.length < 3 || fields.description.length < 10) {
      setError(listing ? 'Enter a title and description.' : 'Enter a title of at least three characters and a description of at least ten.');
      return;
    }
    if (fields.keywords.length > maxListingKeywords || fields.keywords.some((keyword) => keyword.length > maxKeywordLength)) {
      setError(`Use up to ${maxListingKeywords} keywords, with up to ${maxKeywordLength} characters each.`);
      return;
    }
    setError('');
    if (!listing) {
      setDraft({ ...fields, slug: 'ad-' + crypto.randomUUID() });
      setStage('policy');
      return;
    }

    if (submission.current) return;
    submission.current = true;
    setSaving(true);
    try {
      const files = photos.length || removeExisting ? photos.map(({ file }) => file) : undefined;
      const updated = await editAd(user, listing.slug, {
        title: fields.title, summary: fields.description, category: fields.category, area: fields.area.trim(),
        priceMinor: Math.round(Number(fields.price) * 100), rateUnit: fields.rateUnit, keywords: fields.keywords,
        ownerType: business ? 'business' : 'individual',
      }, files);
      onUpdated(updated);
    } catch (error) {
      if (error.code === 'INDIVIDUAL_AD_LIMIT') setBlockedCategory(fields.category);
      else setError(error.message || 'Could not update your ad. Try again.');
    } finally {
      submission.current = false;
      setSaving(false);
    }
  }

  async function publish() {
    if (submission.current) return;
    submission.current = true;
    setSaving(true);
    setError('');
    const ad = {
      slug: draft.slug,
      title: draft.title,
      summary: draft.description,
      keywords: draft.keywords,
      category: draft.category,
      city: 'sahiwal',
      area: draft.area.trim(),
      priceMinor: Number(draft.price) * 100,
      rateUnit: draft.rateUnit,
      photos: photos.map(({ file }) => file),
      ownerType: business ? 'business' : 'individual',
      ownerUid,
      terms: 'Confirm the pickup, deposit, and return conditions with the owner.',
      createdAt: Date.now(),
      local: true,
    };
    try {
      const saved = await publishAd(user, ad);
      onPosted(saved);
      setPosted(saved);
      setStage('done');
    } catch (error) {
      if (error.code === 'INDIVIDUAL_AD_LIMIT') {
        setBlockedCategory(draft.category);
        setStage('form');
      } else {
        setError(error.message || 'Your ad could not be saved. Please try again.');
      }
    } finally {
      submission.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog title={title} subtitle={!listing && stage === 'form' ? 'Create a rental listing in Sahiwal' : undefined} onClose={onClose} busy={saving}>
      {stage === 'form' && (
        <form className="dialog-body ad-form" onSubmit={review}>
          <label>Title<input name="title" required minLength={listing ? 1 : 3} maxLength={listing ? 100 : 90} defaultValue={draft.title} placeholder="e.g. Cordless drill with accessories" /></label>
          <label>Description<textarea name="description" required minLength={listing ? 1 : 10} maxLength={listing ? 2000 : 1500} rows={3} defaultValue={draft.description} placeholder="Describe what’s included and its condition" /></label>
          <div className="field-pair">
            <label>Category<select name="category" value={category} onChange={(event) => setCategory(event.target.value)} required>
              <option value="" disabled>Select a category</option>
              {categories.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select></label>
            <label>Area <span className="optional">(optional)</span><input name="area" maxLength={listing ? 80 : 60} defaultValue={draft.area} placeholder="e.g. Farid Town" /></label>
          </div>
          <div className="field-pair">
            <label>Price (PKR)<input name="price" type="number" min={listing ? '0.01' : '1'} max="9999999" step={listing ? '0.01' : '1'} required defaultValue={draft.price} /></label>
            <label>Rate unit<select name="rateUnit" defaultValue={draft.rateUnit ?? 'day'} required>
              {rateUnits.map((unit) => <option key={unit} value={unit}>Per {unit}</option>)}
            </select></label>
          </div>
          <div>
            <label>
              <span>Search keywords <span className="optional">(optional)</span></span>
              <input name="keywords" defaultValue={draft.keywords?.join(', ')} aria-describedby="keyword-help" placeholder="e.g. car, automatic, hatchback" />
            </label>
            <small id="keyword-help" className="muted">Add up to {maxListingKeywords} words or phrases, separated by commas.</small>
          </div>
          <fieldset className="photo-field">
            <legend>Photos <span className="photo-count">{keepingPhotos ? existingPhotoCount : photos.length}/5</span></legend>
            {keepingPhotos && (
              <ul className="photo-previews">
                {Array.from({ length: existingPhotoCount }, (_, index) => <li key={index}><ListingPhoto item={listing} index={index} /></li>)}
              </ul>
            )}
            {existingPhotoCount > 0 && photos.length === 0 && (
              <button className="signin-link edit-photos-action" type="button" onClick={() => setRemoveExisting(!removeExisting)}>
                {removeExisting ? 'Keep existing photos' : 'Remove all photos'}
              </button>
            )}
            <label className="photo-picker" data-full={photos.length === 5}>
              <input id="post-photos" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} disabled={photos.length === 5} />
              <span className="upload-icon" aria-hidden="true">+</span>
              <span><strong>{photos.length === 5 ? 'Photo limit reached' : keepingPhotos ? 'Replace photos' : 'Add photos'}</strong><small>JPG, PNG, or WebP · Up to 10 MB each</small></span>
            </label>
            <ul className="photo-previews">
              {photos.map(({ id, file }, index) => (
                <li key={id}>
                  <UploadedPhoto file={file} alt={`Photo ${index + 1}`} />
                  <button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => {
                    setPhotos(photos.filter((photo) => photo.id !== id));
                    setError('');
                  }}>×</button>
                </li>
              ))}
            </ul>
          </fieldset>
          <div>
            <div className="owner-toggle">
              <span>Posting as <strong>{business ? 'a business' : 'an individual'}</strong></span>
              <button className="switch" type="button" role="switch" aria-label="Post as a business" aria-checked={business}
                aria-describedby="individual-ad-limit" onClick={() => setBusiness(!business)}><span /></button>
            </div>
            <p id="individual-ad-limit" className={limitReached ? 'ad-quota-note form-error' : 'ad-quota-note muted'} aria-live="polite">
              {limitReached ? individualAdLimitMessage : 'You can post up to two individual ads per category.'}
            </p>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-footer"><button type="submit" className="primary-button full-button" disabled={saving || limitReached}>{listing ? (saving ? 'Saving…' : 'Save changes') : 'Place ad'}</button></div>
        </form>
      )}
      {stage === 'policy' && (
        <div className="dialog-body">
          <p className="muted">Review these policies before publishing “{draft.title}”.</p>
          <p className="muted">Your listing and its photos will be visible to visitors. Signed-in renters can use your profile’s mobile number to call or reach you on WhatsApp.</p>
          <ul className="policies">{policies.map((policy) => <li key={policy}>{policy}</li>)}</ul>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={() => { setError(''); setStage('form'); }} disabled={saving}>Back</button>
            <button type="button" className="primary-button" onClick={publish} disabled={saving}>{saving ? 'Placing ad…' : 'Accept and place ad'}</button>
          </div>
        </div>
      )}
      {stage === 'done' && (
        <div className="dialog-body confirmation">
          <span className="success-mark" aria-hidden="true">✓</span>
          <p>“{posted.title}” was posted. Ad ID {posted.adId}.</p>
          <button className="primary-button" type="button" onClick={() => onView(posted)}>View listing</button>
        </div>
      )}
    </Dialog>
  );
}
