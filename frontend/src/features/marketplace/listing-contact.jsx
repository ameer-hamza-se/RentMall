import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../components/dialog.jsx';
import { MarketIcon } from './market-icon.jsx';
import { ProfileAvatar } from './profile-avatar.jsx';
import { getListingContact } from './marketplace-api.js';

export function ListingContact({ item, user, onClose }) {
  const { slug, title } = item;
  const [contact, setContact] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const callLink = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    getListingContact(user, slug, controller.signal).then((owner) => {
      if (!controller.signal.aborted) setContact(owner);
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      setError(failure.name === 'TimeoutError' || failure instanceof TypeError
        ? 'Could not load the owner’s contact details. Try again.'
        : failure.message);
    });
    return () => controller.abort();
  }, [user, slug, attempt]);

  useEffect(() => {
    if (revealed) callLink.current?.focus();
  }, [revealed]);

  const phone = contact?.phone;
  const displayPhone = phone?.replace(/^(\+92)(\d{3})(\d{7})$/, '$1 $2 $3');

  return (
    <Dialog title="Contact the owner" subtitle={title} className="contact-dialog" onClose={onClose}>
      <div className="dialog-body contact-body" aria-busy={!contact && !error}>
        {error ? (
          <div className="contact-state">
            <p className="account-error" role="alert">{error}</p>
            <button className="secondary-button" type="button" onClick={() => {
              setError('');
              setAttempt((value) => value + 1);
            }}>Try again</button>
          </div>
        ) : !contact ? (
          <p className="muted contact-state" role="status">Loading contact details…</p>
        ) : (
          <>
            <section className="contact-owner" aria-label="Listing owner">
              <div className="contact-identity">
                <ProfileAvatar className="contact-avatar" photo={contact.photo} />
                <div>
                  <p className="muted">Posted by</p>
                  <h3>{contact.name}</h3>
                </div>
              </div>
              <dl className="contact-facts">
                {contact.memberSince && <div><dt>Member since</dt><dd>{contact.memberSince}</dd></div>}
                <div><dt>Active ads</dt><dd>{contact.activeAds}</dd></div>
              </dl>
            </section>
            <div className="contact-actions">
              {phone && revealed ? (
                <a className="primary-button contact-action" href={'tel:' + phone} ref={callLink}>
                  <MarketIcon name="phone" /><bdi className="contact-number" dir="ltr">{displayPhone}</bdi><span className="contact-action-note">Call</span>
                </a>
              ) : (
                <button className="primary-button contact-action" type="button" disabled={!phone} onClick={() => setRevealed(true)}>
                  <MarketIcon name="phone" />{phone ? 'Show phone number' : 'Phone number unavailable'}
                </button>
              )}
              <div className="contact-action contact-pending">
                <MarketIcon name="chat" /><span>Chat</span><span className="contact-action-note">Coming soon</span>
              </div>
              {phone ? (
                <a className="secondary-button contact-action" href={'https://wa.me/' + phone.slice(1)} target="_blank" rel="noopener noreferrer">
                  <MarketIcon name="whatsapp" />WhatsApp
                </a>
              ) : (
                <button className="secondary-button contact-action" type="button" disabled>
                  <MarketIcon name="whatsapp" />WhatsApp
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
