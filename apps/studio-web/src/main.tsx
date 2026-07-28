import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initStudioToken } from './api/auth-token';
import { App } from './App';

// Before anything else — captures a bootstrap token from the URL (if
// Studio's auth is configured, see ADR-0022) and strips it from the
// visible URL, so it never lingers in browser history.
initStudioToken();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root element in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
