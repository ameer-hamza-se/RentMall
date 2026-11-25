import { useEffect, useRef, useState } from 'react';
import { categories, rateUnits } from '../../shared/catalog.js';
import { maxKeywordLength, maxListingKeywords } from '../../shared/listing-discovery.js';
import { publishAd, saveRequest } from './marketplace-api.js';
import { UploadedPhoto } from './listing-photo.jsx';

const policies = [
  'List one item or place you own or have permission to rent. Choose the category that best fits it.',
  'Use a clear title, an accurate description, and photos you have permission to share. Describe any damage or restrictions.',
  'Show the full rental price for the selected rate unit. Disclose any deposit, extra fees, or return conditions before making an agreement.',
  'Use your real account type and list only in Sahiwal during this demo. Do not post duplicate, misleading, stolen, illegal, or unsafe listings.',
  'Keep private contact details, ID documents, and payment information out of public titles, descriptions, and photos.',
  'Review any rental terms with the owner before making a commitment.',
];

export function Dialog({ title, subtitle, className = '', headingMark, onClose, busy, children }) {
  const dialog = useRef(null);
  const heading = useRef(null);

  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);

  useEffect(() => {
    dialog.current.scrollTop = 0;
    heading.current.focus();
  }, [title]);

  return (
    <dialog ref={dialog} className={`rental-dialog ${className}`.trim()} aria-labelledby="dialog-title" onCancel={(event) => {
      event.preventDefault();
      if (!busy) onClose();
    }}>
      <header className="dialog-header">
        <div className="dialog-heading">
          {headingMark}
          <h2 id="dialog-title" ref={heading} tabIndex={-1}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="close-button" type="button" aria-label="Close" onClick={onClose} disabled={busy}>×</button>
      </header>
      {children}
    </dialog>
  );
}

export function PostRental({ user, ownerUid, onClose, onPosted, onView }) {
  const [stage, setStage] = useState('form');
  const [draft, setDraft] = useState({});
  const [photos, setPhotos] = useState([]);
  const [business, setBusiness] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [posted, setPosted] = useState(null);
  const submission = useRef(false);
  const title = { form: 'Rent something out', policy: 'Rental ad policies', done: 'Ad placed' }[stage];

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

  function review(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    fields.title = fields.title.trim();
    fields.description = fields.description.trim();
    fields.keywords = [...new Set(fields.keywords.toLowerCase().split(',').map((keyword) => keyword.trim()).filter(Boolean))];
    if (fields.title.length < 3 || fields.description.length < 10) {
      setError('Enter a title of at least three characters and a description of at least ten.');
      return;
    }
    if (fields.keywords.length > maxListingKeywords || fields.keywords.some((keyword) => keyword.length > maxKeywordLength)) {
      setError(`Use up to ${maxListingKeywords} keywords, with up to ${maxKeywordLength} characters each.`);
      return;
    }
    setDraft(fields);
    setError('');
    setStage('policy');
  }

  async function publish() {
    if (submission.current) return;
    submission.current = true;
    setSaving(true);
    setError('');
    const ad = {
      slug: `ad-${crypto.randomUUID()}`,
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
    } catch {
      setError('Your ad could not be saved. Please try again.');
    } finally {
      submission.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog title={title} subtitle={stage === 'form' ? 'Create a rental listing in Sahiwal' : undefined} onClose={onClose} busy={saving}>
      {stage === 'form' && (
        <form className="dialog-body ad-form" onSubmit={review}>
          <label>Title<input name="title" required minLength={3} maxLength={90} defaultValue={draft.title} placeholder="e.g. Cordless drill with accessories" /></label>
          <label>Description<textarea name="description" required minLength={10} maxLength={1500} rows={3} defaultValue={draft.description} placeholder="Describe what’s included and its condition" /></label>
          <div className="field-pair">
            <label>Category<select name="category" defaultValue={draft.category ?? ''} required>
              <option value="" disabled>Select a category</option>
              {categories.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select></label>
            <label>Area <span className="optional">(optional)</span><input name="area" maxLength={60} defaultValue={draft.area} placeholder="e.g. Farid Town" /></label>
          </div>
          <div className="field-pair">
            <label>Price (PKR)<input name="price" type="number" min="1" max="9999999" step="1" required defaultValue={draft.price} /></label>
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
            <legend>Photos <span className="photo-count">{photos.length}/5</span></legend>
            <label className="photo-picker" data-full={photos.length === 5}>
              <input id="post-photos" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} disabled={photos.length === 5} />
              <span className="upload-icon" aria-hidden="true">+</span>
              <span><strong>{photos.length === 5 ? 'Photo limit reached' : 'Add photos'}</strong><small>JPG, PNG, or WebP · Up to 10 MB each</small></span>
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
          <div className="owner-toggle">
            <span>Posting as <strong>{business ? 'a business' : 'an individual'}</strong></span>
            <button className="switch" type="button" role="switch" aria-label="Post as a business" aria-checked={business} onClick={() => setBusiness(!business)}><span /></button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-footer"><button type="submit" className="primary-button full-button">Place ad</button></div>
        </form>
      )}
      {stage === 'policy' && (
        <div className="dialog-body">
          <p className="muted">Review these policies before publishing “{draft.title}”.</p>
          <p className="muted">Your listing and the photos you attach will be visible to other visitors.</p>
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

const currency = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

export function RentRequest({ item, user, onClose }) {
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState('form');
  const [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const [localTime] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });

  async function submit(event) {
    event.preventDefault();
    if (status === 'saving') return;
    const startsAt = new FormData(event.currentTarget).get('startsAt');
    const timestamp = new Date(startsAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      setError('Choose a start time in the future.');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      await saveRequest(user, { id: requestId, listing: item.slug, startsAt: new Date(timestamp).toISOString(), quantity: Number(quantity) });
      setStatus('done');
    } catch {
      setStatus('form');
      setError('Your request could not be saved. Try again.');
    }
  }

  return (
    <Dialog title={status === 'done' ? 'Rental request saved' : `Rent ${item.title}`} onClose={onClose} busy={status === 'saving'}>
      {status === 'done' ? (
        <div className="dialog-body confirmation">
          <span className="success-mark" aria-hidden="true">✓</span>
          <p>Your demo request was saved to your RentMall account.</p>
          <button className="primary-button" type="button" onClick={onClose}>Done</button>
        </div>
      ) : (
        <form className="dialog-body ad-form" onSubmit={submit}>
          <p className="muted">Save a demo request for your preferred time. Availability and payment are arranged separately.</p>
          <div className="field-pair">
            <label>Start date and time<input type="datetime-local" name="startsAt" min={localTime} required /></label>
            <label>Number of {item.rateUnit}s<input type="number" min="1" max="365" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          </div>
          <div className="estimate"><span>Estimated rental price</span><strong>{currency.format(item.priceMinor * (Number(quantity) || 0) / 100)}</strong></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button full-button" type="submit" disabled={status === 'saving'}>Save rental request</button>
        </form>
      )}
    </Dialog>
  );
}
