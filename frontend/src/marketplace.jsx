import { validateDetails } from '../../shared/profile-details.js';
import { lazy, Suspense, useEffect, useState } from 'react';
import { categories, cities, rateUnits } from '../../shared/catalog.js';
import { listingSearchCriteria, listingSorts, matchesListingSearch, sortListings } from '../../shared/listing-discovery.js';
import { getOwnerAds, editAvailability, deleteAd } from './marketplace-api.js';
import { ListingPhoto } from './listing-photo.jsx';
import { PostRental, RentRequest } from './rental-dialogs.jsx';
import { useApi } from './use-api.js';

const money = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });
const categoryLabels = Object.fromEntries(categories.map(({ id, label }) => [id, label]));
const AccountDialog = lazy(() => import('./account.jsx'));

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

function MarketIcon({ name, filled = false }) {
  const paths = {
    heart: 'M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6l1.2 1.2L12 21l7.6-7.6 1.2-1.2a5.4 5.4 0 0 0 0-7.6Z',
    pin: 'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    plus: 'M12 5v14M5 12h14',
    search: 'm21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
    edit: 'm4 16 12-12a2 2 0 0 1 3 3L7 19l-4 1 1-4Zm10-10 3 3',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  };
  return (
    <svg className="market-icon" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function Header({ city, query, saved, link, navigate, onPost, onProfile, user, photo }) {
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
          <button className="primary-button post-button" type="button" onClick={onPost} disabled={city !== 'sahiwal'}>
            <MarketIcon name="plus" />
            <span>Rent something out</span>
          </button>
          <button type="button" className="profile-button" aria-label={user ? 'My profile' : 'Sign in or create an account'} onClick={onProfile}>
            {photo ? <img className="profile-photo" src={photo} alt="" /> : user ? <span aria-hidden="true">{(user.displayName?.trim() || user.email || 'R').charAt(0).toUpperCase()}</span> : (
              <MarketIcon name="user" />
            )}
          </button>
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

function Availability({ available }) {
  return (
    <span className="availability" data-unavailable={available === false}>
      {available === false ? 'Unavailable' : 'Available now'}
    </span>
  );
}

function AvailabilityControl({ item, onChange }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const available = item.available === false;
  async function change() {
    setSaving(true);
    setError('');
    try {
      await onChange(item, available);
    } catch {
      setError('Could not update availability. Try again.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="ad-availability-control">
      <button className="secondary-button" type="button" onClick={change} disabled={saving}>
        {saving ? 'Updating…' : available ? 'Mark available' : 'Mark unavailable'}
      </button>
      {error && <p className="account-error" role="alert">{error}</p>}
    </div>
  );
}

function ListingCard({ item, href, navigate, favorite, onFavorite }) {
  return (
    <article className="listing-card">
      <NavLink className="card-link" href={href} navigate={navigate}>
        <ListingPhoto item={item} />
        <div className="card-info">
          <Availability available={item.available} />
          <p className="price"><strong>{money.format(item.priceMinor / 100)}</strong><span> / {item.rateUnit}</span></p>
          <h3>{item.title}</h3>
          <p className="card-location">
            <span className="city-pin card-pin" aria-hidden="true"><MarketIcon name="pin" /></span>
            <span>{[item.area, 'Sahiwal'].filter(Boolean).join(', ')}</span>
          </p>
        </div>
      </NavLink>
      <button type="button" className="favorite" aria-label={`${favorite ? 'Remove from' : 'Add to'} saved rentals: ${item.title}`} aria-pressed={favorite} onClick={() => onFavorite(item.slug)}>
        <MarketIcon name="heart" filled={favorite} />
      </button>
    </article>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <span className="hero-city"><MarketIcon name="pin" /> Sahiwal, Punjab</span>
        <h1>Rent from local owners</h1>
        <p>Find vehicles, rooms, event spaces, tools and more in Sahiwal.</p>
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

function Detail({ item, onRent, onAvailability, backUrl, navigate }) {
  const [photo, setPhoto] = useState(0);
  const photoCount = item.photos?.length ?? item.imageCount ?? 0;
  return (
    <main className="site-width detail-page" id="main-content">
      <NavLink className="back-link" href={backUrl} navigate={navigate}>Back to rentals</NavLink>
      <div className="detail-layout">
        <div>
          <div className="detail-image"><ListingPhoto item={item} index={photo} loading="eager" /></div>
          {photoCount > 1 && <div className="gallery-controls" aria-label="Listing photos">
            {Array.from({ length: photoCount }, (_, index) => (
              <button key={index} type="button" className="secondary-button" aria-pressed={photo === index} onClick={() => setPhoto(index)}>Photo {index + 1}</button>
            ))}
          </div>}
        </div>
        <article className="detail-content">
          <div className="detail-meta">
            <p className="eyebrow">{categoryLabels[item.category]}</p>
            {item.adId && <small className="ad-id">Ad ID {item.adId}</small>}
          </div>
          <h1>{item.title}</h1>
          <Availability available={item.available} />
          <p className="muted">{[item.area, 'Sahiwal'].filter(Boolean).join(', ')} · {item.ownerType === 'business' ? 'Business' : 'Individual'}</p>
          <p className="price"><strong>{money.format(item.priceMinor / 100)}</strong><span> / {item.rateUnit}</span></p>
          <button className="primary-button full-button" type="button" disabled={item.available === false} onClick={onRent}>Rent this</button>
          {onAvailability && <AvailabilityControl item={item} onChange={onAvailability} />}
          <h2>Description</h2>
          <p className="listing-description">{item.summary}</p>
          <h2>Rental conditions</h2>
          <p>{item.terms}</p>
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

function ProfilePage({ user, profile, onPhoto, onAvailability, onAdChange, ads, favorites, navigate, onFavorite, onEdit, onPost }) {
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
      const { resizeProfilePhoto } = await import('./profile-photo.js');
      const photo = await resizeProfilePhoto(file);
      const { saveProfilePhoto } = await import('./account-api.js');
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
      const { logoutAccount } = await import('./account-api.js');
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
                <div key={item.slug}>
                  <ListingCard item={item} href={changeUrl([], { listing: item.slug, from: 'profile' })} navigate={navigate} favorite={favorites.includes(item.slug)} onFavorite={onFavorite} />
                  <AvailabilityControl item={item} onChange={onAvailability} />
                  <div className="profile-ads-heading">
                    <button type="button" className="signin-link" onClick={async () => {
                      if (!window.confirm('Delete this ad?')) return;
                      try { await deleteAd(user, item.slug); onAdChange(item.slug, null); }
                      catch { setError('Could not delete ad.'); }
                    }}>Delete ad</button>
                  </div>
                </div>
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
    import('./account-api.js').then(({ watchAccount, requestProfile }) => {
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
    setLocalAds((ads) => (ads ?? []).map((ad) => ad.slug === item.slug ? { ...ad, available } : ad));
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
    if (!uid) {
      setModal({ name: 'account', continuation: { name: 'favorite', slug, label: 'Save this rental' } });
      return;
    }
    try {
      const { requestProfile } = await import('./account-api.js');
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
  const profilePage = params.get('profile') === '1';
  const link = (changes) => changeUrl(params, { profile: null, from: null, ...changes });
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
  const loading = catalog.status === 'loading' || localAds === null;
  const filtered = sortListings(all.filter((item) => (
    (!category || item.category === category.id)
    && matchesListingSearch(item, search)
    && (!unit || item.rateUnit === unit)
    && (!maxPrice || item.priceMinor <= Number(maxPrice) * 100)
    && (!saved || favorites.includes(item.slug))
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
      }} user={user} photo={session.profile?.photo} />
      {!profilePage && <CategoryNav category={category?.id} link={link} navigate={navigate} />}
      {profilePage ? (
        uid && session.profile ? (
          <ProfilePage onAvailability={changeAvailability} onAdChange={(slug, changes) => {
            setLocalAds((ads) => changes ? ads.map((ad) => ad.slug === slug ? { ...ad, ...changes } : ad) : ads.filter((ad) => ad.slug !== slug));
            catalog.retry();
          }} key={uid} user={user} profile={session.profile} onPhoto={(photo) => {
            setSession((previous) => previous.user?.uid === uid ? { ...previous, profile: { ...previous.profile, photo } } : previous);
          }} ads={myAds} favorites={favorites} navigate={navigate} onFavorite={toggleFavorite} onEdit={() => setModal({ name: 'account', editing: true })} onPost={showPosts} />
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
        selected ? <Detail key={slug} item={selected} onAvailability={myAds?.some((ad) => ad.slug === selected.slug) ? changeAvailability : undefined} onRent={() => setModal({ name: 'rent' })} backUrl={params.get('from') === 'profile' ? '/?profile=1' : link({ listing: null })} navigate={navigate} /> : loading ? (
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
                    <ListingCard key={item.slug} item={item} href={link({ listing: item.slug })} navigate={navigateToAccountPage} favorite={favorites.includes(item.slug)} onFavorite={toggleFavorite} />
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
      {uid && modal?.name === 'post' && <PostRental user={user} ownerUid={uid} onClose={() => setModal(null)} onPosted={(ad) => { setLocalAds((existing) => [...(existing ?? []), ad]); }} onView={(ad) => { setModal(null); navigate(link({ city: null, listing: ad.slug, saved: null, from: profilePage ? 'profile' : null })); }} />}
      {uid && modal?.name === 'rent' && selected && selected.available !== false && <RentRequest item={selected} user={user} onClose={() => setModal(null)} />}
    </>
  );
}
