import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { StoreProvider } from './state/store';
import './design/global.css';

/**
 * `HashRouter`, not `BrowserRouter`.
 *
 * This is a static build with no server, and a deep link to `/trips` under BrowserRouter 404s on
 * any host that has not been told to rewrite unknown paths to `index.html`. The SPA rewrite is
 * configured for Vercel and Netlify anyway (see `vercel.json` / `netlify.toml`), but a hash route
 * additionally survives being opened from a file path, a preview URL with a sub-path, or a host
 * whose rewrite rules were not applied — which is exactly the set of ways a demonstration link gets
 * shared. The cost is a `#` in the URL, which no investor will care about.
 */
const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <StoreProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </StoreProvider>
  </StrictMode>,
);
