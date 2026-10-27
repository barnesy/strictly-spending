import { lazy, type ComponentType } from 'react';

const RELOAD_STORAGE_KEY = 'strictly_chunk_reload_ts';
const RELOAD_COOLDOWN_MS = 15_000;

export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Unable to preload CSS')
  );
}

/**
 * Attempts a one-time hard reload when a new deployment replaces hashed chunk assets on GitHub Pages.
 * Returns true if a reload was triggered.
 */
export function reloadOnceOnChunkError(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const now = Date.now();
    const lastReload = Number(sessionStorage.getItem(RELOAD_STORAGE_KEY) || '0');
    if (now - lastReload < RELOAD_COOLDOWN_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_STORAGE_KEY, String(now));
  } catch {
    // Ignore storage errors in private browsing
  }
  fetch(window.location.href, { cache: 'reload' })
    .catch(() => {})
    .finally(() => {
      window.location.reload();
    });
  return true;
}

export function installChunkErrorHandlers(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadOnceOnChunkError();
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (isChunkLoadError(error) && reloadOnceOnChunkError()) {
        // Return a never-resolving promise while the browser reloads so ErrorBoundary doesn't flash
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
