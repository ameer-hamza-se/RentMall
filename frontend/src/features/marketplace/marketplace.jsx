import { validateDetails } from '../../../../shared/profile-details.js';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { categories, cities, rateUnits } from '../../../../shared/catalog.js';
import { listingSearchCriteria, listingSorts, matchesListingSearch, sortListings } from '../../../../shared/listing-discovery.js';
import { getOwnerAds, editAvailability, deleteAd } from './marketplace-api.js';
import { Dialog } from '../../components/dialog.jsx';
import { ListingPhoto } from './listing-photo.jsx';
import { MarketIcon } from './market-icon.jsx';
import { ListingContact } from './listing-contact.jsx';
import { PostRental } from './rental-dialogs.jsx';
import { useApi } from '../../api/use-api.js';

const money = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });
const categoryLabels = Object.fromEntries(categories.map(({ id, label }) => [id, label]));
const AccountDialog = lazy(() => import('../account/account-dialog.jsx'));

function changeUrl(params, changes) {
  const next = new URLSearchParams(params);
  for (const [name, value] of Object.entries(changes)) {
    if (value) next.set(name, value);
    else next.delete(name);
  }
  return next.size ? `/?${next}` : '/';
}

function NavLink({ href, navigate, children, ...props }) {
  return (
    <a href={href} {...props} onClick={(event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      navigate(href);
    }}>{children}</a>
  );
}

const themePreferenceKey = 'rentmall-theme';

function readDarkMode() {
  try {
    return localStorage.getItem(themePreferenceKey) === 'dark';
  } catch {
    return false;
  }
}

function ProfileMenu({ user, photo, onProfile, navigate, aboutPage, profilePage }) {
  const [open, setOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(readDarkMode);
  const menu = useRef(null);
  const trigger = useRef(null);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event) {
      if (!menu.current?.contains(event.target)) setOpen(false);
    }
    function dismissOnNavigation() {
      setOpen(false);
    }
    document.addEventListener('pointerdown', dismissOutside);
    window.addEventListener('popstate', dismissOnNavigation);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      window.removeEventListener('popstate', dismissOnNavigation);
    };
  }, [open]);

  function toggleTheme() {
    setDarkMode(!darkMode);
    try {
      localStorage.setItem(themePreferenceKey, darkMode ? 'light' : 'dark');
    } catch {
      // The current page can still switch themes when storage is unavailable.
    }
  }

  return (
    <div className="profile-menu" ref={menu} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
        trigger.current.focus();
      }
    }}>
      <button ref={trigger} type="button" className="profile-button" aria-label="Profile menu"
        aria-expanded={open} aria-controls="profile-options" onClick={() => setOpen(!open)}>
        <span className="profile-avatar" aria-hidden="true">
          {photo ? <img className="profile-photo" src={photo} alt="" /> : user
            ? (user.displayName?.trim() || user.email || 'R').charAt(0).toUpperCase()
            : <MarketIcon name="user" />}
        </span>
        <span className="profile-chevron"><MarketIcon name="chevron" /></span>
      </button>
      <div id="profile-options" className="profile-menu-panel" hidden={!open}>
        <button type="button" className="profile-menu-item" aria-current={profilePage ? 'page' : undefined} onClick={() => {
          setOpen(false);
          onProfile();
        }}><MarketIcon name="user" />Profile</button>
        <button type="button" className="profile-menu-item" role="switch" aria-checked={darkMode} onClick={toggleTheme}>
          <MarketIcon name="moon" />Dark mode
          <span className="profile-menu-switch" aria-hidden="true" />
        </button>
        <NavLink href="/?about=1" className="profile-menu-item" aria-current={aboutPage ? 'page' : undefined} navigate={(url) => {
          setOpen(false);
          navigate(url);
        }}><MarketIcon name="info" />About us</NavLink>
      </div>
    </div>
  );
}

function AboutPage({ navigate }) {
  return (
    <main id="main-content" className="site-width about-page">
      <NavLink href="/" navigate={navigate} className="back-link">Back to rentals</NavLink>
      <header className="about-intro">
        <h1>About RentMall</h1>
        <p>We built RentMall as a student project to make it easier to find local rentals in Sahiwal. Renters can browse available listings, and owners can post ads, manage availability, and update their listings in one place.</p>
      </header>
      <section className="about-team" aria-labelledby="about-team-title">
        <h2 id="about-team-title">Meet the team</h2>
        <p>We worked together on the design, development, and testing of the marketplace.</p>
        <ul>
          {['Ameer Hamza', 'Uzair Kaleem', 'Hamza'].map((name) => <li key={name}>{name}</li>)}
        </ul>
      </section>
    </main>
  );
}

function Header({ city, query, saved, link, navigate, onPost, onProfile, user, photo, aboutPage, profilePage }) {
  function search(event) {
    event.preventDefault();
    navigate(link({ q: new FormData(event.currentTarget).get('q').trim(), listing: null, saved: null }));
  }

  return (
    <header className="site-header">
      <div className="site-width topbar">
        <NavLink className="brand" href="/" navigate={navigate} aria-label="RentMall home">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <span>Rent<span>Mall</span></span>
        </NavLink>
        <div className="header-actions">
          <NavLink className="saved-link" href={link({ city: null, saved: saved ? null : '1', q: null, category: null, listing: null })} navigate={navigate} aria-label="Saved" aria-current={saved ? 'page' : undefined}>
            <MarketIcon name="heart" filled={saved} /><span className="saved-copy">Saved</span>
          </NavLink>
          <button className="primary-button post-button" type="button" aria-label="Rent something out" onClick={onPost} disabled={city !== 'sahiwal'}>
            <MarketIcon name="plus" />
            <span className="post-label-full">Rent something out</span>
            <span className="post-label-short" aria-hidden="true">Post ad</span>
          </button>
          <ProfileMenu user={user} photo={photo} onProfile={onProfile} navigate={navigate} aboutPage={aboutPage} profilePage={profilePage} />
        </div>
      </div>
      <div className="site-width search-bar">
        <label className="city-selector">
          <span className="city-pin" aria-hidden="true"><MarketIcon name="pin" /></span>
          <select aria-label="City" value={city} onChange={(event) => navigate(link({ city: event.target.value, listing: null, saved: null }))}>
            {cities.map(({ id, label }) => <option key={id} value={id}>{label}{id !== 'sahiwal' ? ' · Coming soon' : ''}</option>)}
          </select>
        </label>
        <form className="search-form" role="search" onSubmit={search}>
          <input type="search" name="q" aria-label="Search rentals" placeholder="Search rentals" key={query} defaultValue={query} maxLength={80} />
          <button type="submit" className="primary-button search-button" aria-label="Search"><MarketIcon name="search" /></button>
        </form>
      </div>
    </header>
  );
}

function CategoryNav({ category, link, navigate }) {
  return (
    <nav className="category-strip" aria-label="Rental categories">
      <div className="site-width category-links">
        <NavLink href={link({ category: null, listing: null, saved: null })} navigate={navigate} aria-current={!category ? 'page' : undefined}>All categories</NavLink>
        {categories.map(({ id, label }) => (
          <NavLink key={id} href={link({ category: id, listing: null, saved: null })} navigate={navigate} aria-current={category === id ? 'page' : undefined}>{label}</NavLink>
        ))}
      </div>
    </nav>
  );
}

function Availability({ item, onChange }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const unavailable = item.available === false;
  const action = unavailable ? 'Mark available' : 'Mark unavailable';

  async function change() {
    setSaving(true);
    setError('');
    try {
      await onChange(item, unavailable);
    } catch {
      setError('Could not update availability. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="availability-row">
      <span className="availability" data-unavailable={unavailable} aria-live={onChange ? 'polite' : undefined}>
        {unavailable ? 'Unavailable' : 'Available now'}
      </span>
      {onChange && (
        <button type="button" className="ad-icon availability-toggle" aria-label={action} title={action} data-saving={saving} disabled={saving} onClick={change}>
          <MarketIcon name="refresh" />
        </button>
      )}
      {error && <p className="account-error availability-error" role="alert">{error}</p>}
    </div>
  );
}

function OwnerAdActions({ item, actions }) {
  return (
    <div className="owner-ad-actions" role="group" aria-label={'Manage ' + item.title}>
      <button type="button" className="ad-icon delete-ad" aria-label={'Delete ad: ' + item.title} title="Delete ad" onClick={() => actions.remove(item)}>
        <MarketIcon name="trash" />
      </button>
      <button type="button" className="ad-icon edit-ad" aria-label={'Edit ad: ' + item.title} title="Edit ad" onClick={() => actions.edit(item)}>
        <MarketIcon name="edit" />
      </button>
    </div>
  );
}

function DeleteAdDialog({ item, user, onClose, onDeleted }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setSaving(true);
    setError('');
    try {
      await deleteAd(user, item.slug);
      onDeleted(item);
    } catch {
      setError('Could not delete your ad. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title="Delete ad?" onClose={onClose} busy={saving}>
      <div className="dialog-body">
        <p>“{item.title}” will be permanently removed from RentMall.</p>
        {error && <p className="account-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="button" className="primary-button delete-confirm" disabled={saving} onClick={confirm}>{saving ? 'Deleting…' : 'Delete ad'}</button>
        </div>
      </div>
    </Dialog>
  );
}

function ListingCard({ item, href, navigate, favorite, onFavorite, actions }) {
  return (
    <article className="listing-card">
      <ListingPhoto item={item} />
      <div className="card-info">
        <Availability item={item} onChange={actions?.availability} />
        <p className="price"><strong>{money.format(item.priceMinor / 100)}</strong><span> / {item.rateUnit}</span></p>
        <h3><NavLink className="card-link" href={href} navigate={navigate}>{item.title}</NavLink></h3>
        <p className="card-location">
          <span className="city-pin card-pin" aria-hidden="true"><MarketIcon name="pin" /></span>
          <span>{[item.area, 'Sahiwal'].filter(Boolean).join(', ')}</span>
        </p>
      </div>
      {actions && <OwnerAdActions item={item} actions={actions} />}
      {onFavorite && (
        <button type="button" className="favorite" aria-label={(favorite ? 'Remove from' : 'Add to') + ' saved rentals: ' + item.title} aria-pressed={favorite} onClick={() => onFavorite(item.slug)}>
          <MarketIcon name="heart" filled={favorite} />
        </button>
      )}
    </article>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <span className="hero-city"><MarketIcon name="pin" /> Sahiwal, Punjab</span>
        <h1>Rent from local owners</h1>
        <p>Find a car for the day, a room for the month, or tools for your next job.</p>
        <a href="#categories" className="hero-button">Explore rentals</a>
      </div>
      <figure className="hero-photo">
        <img src="/images/sahiwal-station.webp" width={1440} height={845} alt="The entrance to Sahiwal railway station" fetchPriority="high" />
        <figcaption><a href="/photo-credits.html#home-banner">Sahiwal railway station</a></figcaption>
      </figure>
    </section>
  );
}

function Categories({ link, navigate }) {
  return (
    <section className="categories-section" id="categories" aria-labelledby="categories-title">
      <h2 id="categories-title">Explore by category</h2>
      <div className="category-grid">
        {categories.map(({ id, label }) => (
          <NavLink key={id} href={link({ category: id })} navigate={navigate} className="category-tile">
            <img src={'/images/categories/' + id + '.jpg'} alt="" loading="lazy" decoding="async" />
            <span className="category-title">{label}</span>
          </NavLink>
        ))}
      </div>
    </section>
  );
}

function ListingSkeletons({ count = 4 } = {}) {
  return (
    <div className="listing-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, card) => (
        <div className="skeleton-card" key={card}>
          <div className="listing-photo skeleton" />
          <div className="card-info">
          
            <span className="skeleton skeleton-line skeleton-short" />
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line skeleton-caption" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton({ backUrl, navigate }) {
  return (
    <main className="site-width detail-page" id="main-content">
      <NavLink className="back-link" href={backUrl} navigate={navigate}>Back to rentals</NavLink>
      <span className="sr-only" role="status">Loading rental details…</span>
      <div className="detail-layout" aria-hidden="true">
        <div className="detail-image"><div className="listing-photo skeleton" /></div>
        <div className="detail-content">
          <span className="skeleton skeleton-line skeleton-short" />
          <span className="skeleton skeleton-line skeleton-heading" />
          <span className="skeleton skeleton-line skeleton-caption" />
          <span className="skeleton skeleton-line skeleton-heading" />
        </div>
      </div>
    </main>
  );
}

function Filters({ units, maxPrice, sort, onApply }) {
  const [rateUnit, setRateUnit] = useState(units);
  const [amount, setAmount] = useState(maxPrice);
  const [order, setOrder] = useState(sort);
  return (
    <form className="filters" onSubmit={(event) => {
      event.preventDefault();
      onApply({ rateUnit, maxPrice: rateUnit ? amount : null, sort: order });
    }}>
      <label>Rate unit
        <select value={rateUnit} onChange={(event) => {
          setRateUnit(event.target.value);
          setAmount('');
        }}>
          <option value="">Any unit</option>
          {rateUnits.map((unit) => <option key={unit} value={unit}>Per {unit}</option>)}
        </select>
      </label>
      <label>Maximum price (PKR)
        <input type="number" min="1" max="9999999" step="1" disabled={!rateUnit} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Any price" />
      </label>
      <label>Sort by
        <select value={order} onChange={(event) => setOrder(event.target.value)}>
          {listingSorts.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button type="submit" className="secondary-button">Apply</button>
    </form>
  );
}

function Detail({ item, onRent, actions, backUrl, navigate }) {
  const [photo, setPhoto] = useState(0);
  const photoCount = item.photos?.length ?? item.imageCount ?? 0;
  const photoIndex = Math.min(photo, Math.max(0, photoCount - 1));
  return (
    <main className="site-width detail-page" id="main-content">
      <NavLink className="back-link" href={backUrl} navigate={navigate}>Back to rentals</NavLink>
      <div className="detail-layout">
        <div>
          <div className="detail-image"><ListingPhoto item={item} index={photoIndex} loading="eager" /></div>
          {photoCount > 1 && <div className="gallery-controls" aria-label="Listing photos">
            {Array.from({ length: photoCount }, (_, index) => (
              <button key={index} type="button" className="secondary-button" aria-pressed={photoIndex === index} onClick={() => setPhoto(index)}>Photo {index + 1}</button>
            ))}
          </div>}
        </div>
        <article className="detail-content">
          <div className="detail-meta">
            <p className="eyebrow">{categoryLabels[item.category]}</p>
            {item.adId && <small className="ad-id">Ad ID {item.adId}</small>}
          </div>
          <h1>{item.title}</h1>
          <div className="detail-listing-actions">
            <Availability item={item} onChange={actions?.availability} />
            {actions && <OwnerAdActions item={item} actions={actions} />}
          </div>
          <p className="muted">{[item.area, 'Sahiwal'].filter(Boolean).join(', ')} · {item.ownerType === 'business' ? 'Business' : 'Individual'}</p>
          <p className="price"><strong>{money.format(item.priceMinor / 100)}</strong><span> / {item.rateUnit}</span></p>
          <button className="primary-button full-button" type="button" disabled={item.available === false} onClick={onRent}>Rent this</button>
          <h2>Description</h2>
          <p className="listing-description">{item.summary}</p>
          <h2>Safety measures</h2>
          <ul className="listing-safety">
            <li>Meet only in busy public places, such as metro stations or malls.</li>
            <li>Inspect the item carefully before renting it.</li>
            <li>Never pay or transfer money in advance before inspecting the item.</li>
          </ul>
        </article>
      </div>
    </main>
  );
}

function ProfileSkeleton() {
  return (
    <main className="site-width profile-page" id="main-content" aria-busy="true">
      <h1>My profile</h1>
      <p className="sr-only" role="status">Loading your profile…</p>
      <div className="profile-layout" aria-hidden="true">
        <div className="profile-sidebar profile-details">
          <div className="skeleton profile-avatar-skeleton" />
          <div className="skeleton skeleton-line skeleton-short" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line skeleton-caption" />
        </div>
        <ListingSkeletons count={2} />
      </div>
    </main>
  );
}

function ProfilePage({ user, profile, onPhoto, ads, adActions, navigate, onEdit, onPost }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const details = [
    ['Email', profile.email],
    ['Mobile number', profile.phone],
    ['Address', profile.address],
    ['Account type', profile.accountType === 'business' ? 'Business' : 'Individual'],
    ...(profile.businessName ? [['Business name', profile.businessName]] : []),
  ];

  async function changePhoto(event) {
    const input = event.currentTarget;
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    setUploading(true);
    try {
      const { resizeProfilePhoto } = await import('../account/profile-photo.js');
      const photo = await resizeProfilePhoto(file);
      const { saveProfilePhoto } = await import('../account/account-api.js');
      await saveProfilePhoto(user, photo);
      onPhoto(photo);
      setNotice('Profile photo updated.');
    } catch {
      setError('Could not save your photo. Choose a JPG, PNG or WebP image up to 10 MB and try again.');
    } finally {
      setUploading(false);
    }
  }

  async function logout() {
    setSigningOut(true);
    setError('');
    try {
      const { logoutAccount } = await import('../account/account-api.js');
      await logoutAccount();
      navigate('/');
    } catch {
      setError('Could not sign out. Try again.');
      setSigningOut(false);
    }
  }

  return (
    <main className="site-width profile-page" id="main-content">
      <NavLink className="back-link" href="/" navigate={navigate}>Back to rentals</NavLink>
      <h1>My profile</h1>
      <div className="profile-layout">
        <aside className="profile-sidebar" aria-label="Profile details">
          <button className="profile-drawer-toggle secondary-button" type="button" aria-expanded={detailsOpen} aria-controls="profile-details" onClick={() => setDetailsOpen(!detailsOpen)}>
            {detailsOpen ? 'Hide profile details' : 'Show profile details'}
          </button>
          <div className="profile-details" id="profile-details" data-open={detailsOpen}>
            <div className="profile-identity">
              <span className="profile-initial" aria-hidden="true">
                {profile.photo ? <img src={profile.photo} className="profile-photo" alt="" /> : <>{profile.firstName[0]}{profile.lastName[0]}</>}
              </span>
              <h2>{profile.name}</h2>
            </div>
            <label className="profile-photo-label">
              <span>{uploading ? 'Saving photo…' : profile.photo ? 'Change profile photo' : 'Upload profile photo'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={changePhoto} disabled={uploading || signingOut} />
            </label>
            {notice && <p role="status">{notice}</p>}
            <dl>
              {details.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
            <div className="profile-actions">
              <button className="profile-edit" type="button" disabled={uploading || signingOut} onClick={onEdit}>
                <MarketIcon name="edit" />
                Edit profile
              </button>
              <button className="signin-link" type="button" disabled={signingOut || uploading} onClick={logout}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
            </div>
            {error && <p className="account-error" role="alert">{error}</p>}
          </div>
        </aside>
        <section className="profile-listings" aria-labelledby="my-ads">
          <div className="profile-listings-header">
            <div>
              <h2 id="my-ads">My ads</h2>
              {ads && <p className="muted">{ads.length} {ads.length === 1 ? 'ad' : 'ads'}</p>}
            </div>
            <button className="primary-button" type="button" onClick={onPost}>Post an ad</button>
          </div>
          {ads === null ? (
            <div aria-busy="true">
              <p className="sr-only" role="status">Loading your ads…</p>
              <ListingSkeletons count={2} />
            </div>
          ) : ads.length ? (
            <div className="listing-grid">
              {ads.map((item) => (
                <ListingCard key={item.slug} item={item} href={changeUrl([], { listing: item.slug, from: 'profile' })} navigate={navigate} actions={adActions} />
              ))}
            </div>
          ) : <div className="state-box"><h3>You haven’t posted any ads yet.</h3></div>}
        </section>
      </div>
    </main>
  );
}

export function Marketplace() {
  const catalog = useApi('/listings?city=sahiwal&limit=60', { paginate: true });
  const [location, setLocation] = useState(window.location.search);
  const [localAds, setLocalAds] = useState(null);
  const [modal, setModal] = useState(null);
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [session, setSession] = useState({ ready: false, user: null });

  useEffect(() => {
    let active = true;
    let unsubscribe;
    import('../account/account-api.js').then(({ watchAccount, requestProfile }) => {
      let generation = 0;
      if (active) unsubscribe = watchAccount(async (user) => {
        const current = ++generation;
        setSession({ ready: !user, user });
        if (!user) return;
        try {
          const profile = await requestProfile(user);
          if (!active || current !== generation) return;
          const complete = !!profile && !validateDetails(profile).error;
          setSession({ ready: true, user, complete, profile });
        } catch {
          if (active && current === generation) setSession({ ready: true, user, profileError: true });
        }
      });
    }).catch(() => {
      if (active) setSession({ ready: true, user: null });
    });
    return () => { active = false; unsubscribe?.(); };
  }, [profileAttempt]);

  const { ready, user } = session;
  const uid = session.complete ? user?.uid : null;
  const favorites = session.profile?.favorites ?? [];
  const ownedLocal = localAds?.filter((ad) => uid && ad.ownerUid === uid) ?? [];
  const myAds = localAds === null ? null : ownedLocal;

  async function changeAvailability(item, available) {
    await editAvailability(user, item.slug, available);
    catalog.retry();
    setLocalAds((ads) => ads?.map((ad) => ad.slug === item.slug && ad.ownerUid === uid ? { ...ad, available } : ad));
  }

  useEffect(() => {
    const onPop = () => setLocation(window.location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    let current = true;
    const source = user ? getOwnerAds(user) : Promise.resolve([]);
    source.then((ads) => {
      if (current) setLocalAds(ads);
    }).catch(() => { if (current) setLocalAds((existing) => existing ?? []); });
    return () => { current = false; };
  }, [user]);

  function navigate(url) {
    if (url !== window.location.pathname + window.location.search) window.history.pushState(null, '', url);
    setLocation(window.location.search);
    window.scrollTo(0, 0);
  }

  function navigateToAccountPage(url) {
    navigate(url);
    if (!uid) {
      setModal({ name: 'account', continuation: { label: 'Continue to listing' } });
    }
  }

  function showPosts() {
    setModal(uid ? { name: 'post' } : { name: 'account', continuation: { name: 'post', label: 'Continue to post an ad' } });
  }

  async function toggleFavorite(slug) {
    if (ownedSlugs.has(slug)) return;
    if (!uid) {
      setModal({ name: 'account', continuation: { name: 'favorite', slug, label: 'Save this rental' } });
      return;
    }
    try {
      const { requestProfile } = await import('../account/account-api.js');
      const profile = await requestProfile(user, {
        method: favorites.includes(slug) ? 'DELETE' : 'PUT',
        path: '/favorites/' + encodeURIComponent(slug),
      });
      setSession((current) => current.user?.uid === uid
        ? { ...current, profile: { ...current.profile, favorites: profile.favorites ?? [] } } : current);
    } catch {
      window.alert('Could not update your saved rentals. Try again.');
    }
  }

  function continueAfterSignIn() {
    const next = modal.continuation;
    if (next?.name === 'favorite') toggleFavorite(next.slug);
    if (!next) navigate('/?profile=1');
    setModal(next?.name === 'post' ? { name: 'post' } : null);
  }

  const params = new URLSearchParams(location);
  const aboutPage = params.get('about') === '1';
  const profilePage = !aboutPage && params.get('profile') === '1';
  const link = (changes) => changeUrl(params, { about: null, profile: null, from: null, ...changes });
  const city = cities.find(({ id }) => id === params.get('city')) ?? cities[0];
  const category = categories.find(({ id }) => id === params.get('category'));
  const query = params.get('q')?.trim().slice(0, 80) ?? '';
  const search = listingSearchCriteria(query);
  const sort = listingSorts.find(({ value }) => value === params.get('sort'))?.value ?? '';
  const unit = rateUnits.find((rate) => rate === params.get('rateUnit')) ?? '';
  const maxPrice = unit && /^[1-9]\d{0,6}$/.test(params.get('maxPrice') ?? '') ? params.get('maxPrice') : '';
  const saved = params.get('saved') === '1';
  const slug = params.get('listing');
  const ownedSlugs = new Set(ownedLocal.map((ad) => ad.slug));
  const all = [...(catalog.body?.items ?? []).filter((ad) => !ownedSlugs.has(ad.slug)), ...ownedLocal];
  const selected = slug && all.find((item) => item.slug === slug);
  const detailBackUrl = params.get('from') === 'profile' ? '/?profile=1' : link({ listing: null });
  const adActions = {
    availability: changeAvailability,
    edit: (item) => setModal({ name: 'edit-ad', item }),
    remove: (item) => setModal({ name: 'delete-ad', item }),
  };
  const loading = catalog.status === 'loading' || localAds === null;
  const filtered = sortListings(all.filter((item) => (
    (!category || item.category === category.id)
    && matchesListingSearch(item, search)
    && (!unit || item.rateUnit === unit)
    && (!maxPrice || item.priceMinor <= Number(maxPrice) * 100)
    && (!saved || !ownedSlugs.has(item.slug) && favorites.includes(item.slug))
  )), sort);
  const home = !category && !query && !unit && !sort && !saved;
  const groups = home ? categories.map(({ id, label }) => ({ id, title: label, items: filtered.filter((item) => item.category === id) })) : [
    { title: saved ? 'Saved rentals' : category?.label ?? (query ? `Search results for “${query}”` : 'Rentals in Sahiwal'), items: filtered },
  ];

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header city={city.id} query={query} saved={saved} link={link} navigate={navigate} onPost={showPosts} onProfile={() => {
        navigate('/?profile=1');
        if (!user) setModal({ name: 'account', continuation: { label: 'Open my profile' } });
      }} user={user} photo={session.profile?.photo} aboutPage={aboutPage} profilePage={profilePage} />
      {!profilePage && !aboutPage && <CategoryNav category={category?.id} link={link} navigate={navigate} />}
      {aboutPage ? <AboutPage navigate={navigate} /> : profilePage ? (
        uid && session.profile ? (
          <ProfilePage key={uid} user={user} profile={session.profile} onPhoto={(photo) => {
            setSession((previous) => previous.user?.uid === uid ? { ...previous, profile: { ...previous.profile, photo } } : previous);
          }} ads={myAds} adActions={adActions} navigate={navigate} onEdit={() => setModal({ name: 'account', editing: true })} onPost={showPosts} />
        ) : (
          !ready ? <ProfileSkeleton /> : <main className="site-width unavailable" id="main-content">
            <h1>My profile</h1>
            {session.profileError ? (
              <>
                <p role="alert">Could not load your saved profile.</p>
                <button className="secondary-button" type="button" onClick={() => setProfileAttempt((value) => value + 1)}>Try again</button>
              </>
            ) : (
              <button className="primary-button" type="button" onClick={() => setModal({ name: 'account', editing: !!user, continuation: { label: 'Open my profile' } })}>
                {user ? 'Complete your profile' : 'Sign in or create an account'}
              </button>
            )}
            <NavLink className="back-link" href="/" navigate={navigate}>Back to rentals</NavLink>
          </main>
        )
      ) : city.id !== 'sahiwal' ? (
        <main className="site-width unavailable" id="main-content">
          <p className="eyebrow">{city.label}</p>
          <h1>Coming soon</h1>
          <p className="muted">RentMall is currently available in Sahiwal.</p>
          <NavLink className="primary-button" href="/" navigate={navigate}>Browse Sahiwal</NavLink>
        </main>
      ) : !uid && (slug || saved) ? (
        <main className="site-width unavailable" id="main-content">
          <h1>{ready ? (saved ? 'Sign in to see saved rentals' : 'Sign in to view this listing') : 'Checking your sign-in…'}</h1>
          {ready && <button type="button" className="primary-button" onClick={() => setModal({ name: 'account', continuation: { label: saved ? 'Continue to saved rentals' : 'Continue to listing' } })}>Sign in or create an account</button>}
          <NavLink className="back-link" href={link({ listing: null, saved: null })} navigate={navigate}>Back to rentals</NavLink>
        </main>
      ) : slug ? (
        selected ? <Detail key={slug} item={selected} actions={ownedSlugs.has(selected.slug) ? adActions : undefined} onRent={() => setModal({ name: 'rent' })} backUrl={detailBackUrl} navigate={navigate} /> : loading ? (
          <DetailSkeleton backUrl={link({ listing: null })} navigate={navigate} />
        ) : (
          <main className="site-width unavailable" id="main-content">
            <h1>{(catalog.status === 'error') ? 'Unable to load rental' : 'Listing not found'}</h1>
            <NavLink className="primary-button" href={link({ listing: null })} navigate={navigate}>Back to rentals</NavLink>
          </main>
        )
      ) : (
        <main className="site-width marketplace" id="main-content">
          {home && <><Hero /><Categories link={link} navigate={navigate} /></>}
          {loading && <span className="sr-only" role="status">Loading rentals…</span>}
          <section className="results" aria-label="Rentals in Sahiwal" aria-busy={loading}>
            <div className="results-toolbar">
              <div>
                {home ? <h2>Rentals in Sahiwal</h2> : <h1>{groups[0].title}</h1>}
                {loading
                  ? <span className="skeleton skeleton-line skeleton-count" aria-hidden="true" />
                  : <p className="muted">{filtered.length} {filtered.length === 1 ? 'listing' : 'listings'}</p>}
              </div>
              <Filters key={`${unit}:${maxPrice}:${sort}`} units={unit} maxPrice={maxPrice} sort={sort} onApply={(changes) => navigate(link(changes))} />
            </div>
            {loading && <ListingSkeletons />}
            {(catalog.status === 'error') && <div className="state-box" role="status"><p>{catalog.message}</p><button className="secondary-button" type="button" onClick={catalog.retry}>Try again</button></div>}
            {!loading && catalog.status === 'ready' && filtered.length === 0 && <div className="state-box"><h3>{saved ? 'No saved rentals yet' : home ? 'No rentals listed yet' : 'No matching rentals'}</h3>{home
              ? <button className="secondary-button" type="button" onClick={showPosts}>Post the first ad</button>
              : <NavLink href="/" navigate={navigate}>Browse all rentals</NavLink>}</div>}
            {!loading && groups.filter((group) => group.items.length).map((group) => (
              <section key={group.title} className="listing-group" aria-label={group.title}>
                {home && <div className="group-heading">
                  <h3>{group.title}</h3>
                  <NavLink href={link({ category: group.id })} navigate={navigate}>View all {group.items.length}</NavLink>
                </div>}
                <div className="listing-grid">
                  {(home ? group.items.slice(0, 4) : group.items).map((item) => (
                    <ListingCard key={item.slug} item={item} href={link({ listing: item.slug })} navigate={navigateToAccountPage} favorite={favorites.includes(item.slug)} onFavorite={ownedSlugs.has(item.slug) ? undefined : toggleFavorite} />
                  ))}
                </div>
              </section>
            ))}
          </section>
        </main>
      )}
      <footer className="site-footer"><div className="site-width"><strong>RentMall</strong><span>Sahiwal · Lahore and Faisalabad coming soon</span><a href="/photo-credits.html">Photo credits</a></div></footer>
      {modal?.name === 'account' && (
        <Suspense fallback={<span className="sr-only" role="status">Loading account options…</span>}>
          <AccountDialog
            onComplete={(id, profile) => {
              setSession((previous) => previous.user?.uid === id ? { ...previous, complete: true, profile: { ...previous.profile, ...profile } } : previous);
              if (modal.continuation?.name) setModal({ ...modal, editing: false, onboarding: false });
              else {
                setModal(null);
                if (!slug && !saved) navigate('/?profile=1');
              }
            }}
            onAuthenticated={(isNew) => {
              setModal((previous) => {
                if (previous?.name !== 'account') return previous;
                if (isNew) return { ...previous, onboarding: true };
                return previous.continuation?.name ? previous : null;
              });
            }}
            ready={ready}
            profile={session.profile}
            profileError={session.profileError}
            onRetry={() => setProfileAttempt((value) => value + 1)}
            onboarding={modal.onboarding}
            onEdit={() => setModal({ ...modal, editing: true })}
            user={user}
            onClose={() => setModal(null)}
            continuation={modal.continuation}
            onContinue={continueAfterSignIn}
            editing={modal.editing}
          />
        </Suspense>
      )}
      {uid && modal?.name === 'post' && <PostRental user={user} ownerUid={uid} ownerAds={myAds} onClose={() => setModal(null)} onPosted={(ad) => { setLocalAds((existing) => [...(existing ?? []), ad]); }} onView={(ad) => { setModal(null); navigate(link({ city: null, listing: ad.slug, saved: null, from: profilePage ? 'profile' : null })); }} />}
      {uid && modal?.name === 'edit-ad' && ownedSlugs.has(modal.item.slug) && (
        <PostRental key={modal.item.slug} user={user} listing={modal.item} ownerAds={myAds} onClose={() => setModal(null)} onUpdated={(item) => {
          setLocalAds((ads) => ads?.map((ad) => ad.slug === item.slug && ad.ownerUid === uid ? { ...item, available: ad.available } : ad));
          setModal(null);
          catalog.retry();
        }} />
      )}
      {uid && modal?.name === 'delete-ad' && ownedSlugs.has(modal.item.slug) && (
        <DeleteAdDialog item={modal.item} user={user} onClose={() => setModal(null)} onDeleted={(item) => {
          setLocalAds((ads) => ads?.filter((ad) => ad.slug !== item.slug || ad.ownerUid !== uid));
          setModal(null);
          if (slug === item.slug) navigate(detailBackUrl);
          catalog.retry();
        }} />
      )}
      {uid && modal?.name === 'rent' && selected && selected.available !== false && <ListingContact key={slug} item={selected} user={user} onClose={() => setModal(null)} />}
    </>
  );
}
