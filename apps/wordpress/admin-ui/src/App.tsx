import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Audit } from './pages/Audit.tsx';
import { InternalLinks } from './pages/InternalLinks.tsx';
import { SchemaPage } from './pages/Schema.tsx';
import { Settings } from './pages/Settings.tsx';

/** Maps the WP admin page slug → React route. */
const SLUG_TO_ROUTE: Record<string, string> = {
  'klyna-seo-suite': 'dashboard',
  'klyna-internal-links': 'links',
  'klyna-schema': 'schema',
  'klyna-settings': 'settings',
  'klyna-audit': 'audit',
};

function readRouteFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page') ?? '';
  const hash = window.location.hash.replace(/^#\/?/, '');
  return hash || SLUG_TO_ROUTE[page] || 'dashboard';
}

export default function App() {
  const [route, setRoute] = useState<string>(() => readRouteFromUrl());

  useEffect(() => {
    const onHash = () => setRoute(readRouteFromUrl());
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  const navigate = (next: string) => {
    window.location.hash = `#/${next}`;
    setRoute(next);
  };

  return (
    <div className="flex min-h-[calc(100vh-32px)]">
      <Sidebar current={route} onNavigate={navigate} />
      <div className="flex-1 flex flex-col min-w-0">
        {route === 'dashboard' && <Dashboard />}
        {route === 'audit' && <Audit />}
        {route === 'links' && <InternalLinks />}
        {route === 'schema' && <SchemaPage />}
        {route === 'settings' && <Settings />}
      </div>
    </div>
  );
}
