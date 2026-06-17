import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Prevent browser devtools from leaking DOM elements printed in warning logs
if (typeof window !== 'undefined') {
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...args: any[]) => {
    const cleanArgs = args.map(arg => 
      (arg && typeof arg === 'object' && (arg instanceof HTMLElement || arg.nodeType)) ? `[DOM Element]` : arg
    );
    originalWarn.apply(console, cleanArgs);
  };
  console.error = (...args: any[]) => {
    const cleanArgs = args.map(arg => 
      (arg && typeof arg === 'object' && (arg instanceof HTMLElement || arg.nodeType)) ? `[DOM Element]` : arg
    );
    originalError.apply(console, cleanArgs);
  };
}
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';
import { theme } from './theme';
import { seedAndMigrate } from './seed';
import { hasDemoData, seedDemoData } from './demoData';
import { useFilters } from './store';
import { DEMO_ONLY_BUILD } from './env';

/**
 * In demo-only builds (see env.ts for the flag), the app:
 *   - is mounted with HashRouter so the bundle works under any static host
 *     without server-side SPA fallback
 *   - auto-seeds demo data on first load if the IndexedDB is empty
 *   - forces demoMode on, hiding real-data paths so visitors can't
 *     accidentally clear anything
 */
async function bootstrap() {
  await seedAndMigrate();
  if (DEMO_ONLY_BUILD) {
    if (!(await hasDemoData())) {
      await seedDemoData();
    }
    // Force demo mode on so the views filter to source === 'demo' only.
    useFilters.setState({ demoMode: true });
  } else {
    const hasDemo = await hasDemoData();
    if (!hasDemo && useFilters.getState().demoMode) {
      useFilters.setState({ demoMode: false });
    }
  }
}

bootstrap();

const Router = DEMO_ONLY_BUILD ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </Router>
  </StrictMode>
);
