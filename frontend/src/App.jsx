import { Marketplace } from './features/marketplace/marketplace.jsx';

export default function App() {
  if (window.location.pathname !== '/') {
    return (
      <main className="site-width unavailable">
        <h1>Page not found</h1>
        <a className="primary-button" href="/">Go to RentMall</a>
      </main>
    );
  }
  return <Marketplace />;
}
