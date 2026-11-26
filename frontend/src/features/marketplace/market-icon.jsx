export function MarketIcon({ name, filled = false }) {
  const paths = {
    heart: 'M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6l1.2 1.2L12 21l7.6-7.6 1.2-1.2a5.4 5.4 0 0 0 0-7.6Z',
    pin: 'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    plus: 'M12 5v14M5 12h14',
    phone: 'M8 3H5a2 2 0 0 0-2 2c.4 8.4 7.6 15.6 16 16a2 2 0 0 0 2-2v-3l-5-2-2 2a13 13 0 0 1-6-6l2-2-2-5Z',
    chat: 'M3 20l1.5-4.5A8.5 8.5 0 1 1 8.6 20L3 21Z',
    whatsapp: 'm3 21 1.4-4.4a8.6 8.6 0 1 1 3.9 3.4L3 21Zm6.2-12.9-.7.5c-.5.4-.6 1.1-.3 1.7a9.3 9.3 0 0 0 5.6 5.6c.6.3 1.3.2 1.7-.3l.5-.7-2.3-1.3-.8 1c-1.5-.7-2.6-1.8-3.3-3.3l1-.8-1.4-2.4Z',
    search: 'm21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
    edit: 'm4 16 12-12a2 2 0 0 1 3 3L7 19l-4 1 1-4Zm10-10 3 3',
    chevron: 'm6 9 6 6 6-6',
    trash: 'M4 7h16m-11 0V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5',
    refresh: 'M20 5v5h-5m5 0a8 8 0 0 0-14-4m-2 13v-5h5m-5 0a8 8 0 0 0 14 4',
    moon: 'M20.9 13.3A8.9 8.9 0 0 1 10.7 3.1 9 9 0 1 0 20.9 13.3Z',
    info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v5m0-8v.1',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  };
  return (
    <svg className="market-icon" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
