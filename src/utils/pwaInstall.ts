import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const fn of listeners) {
    fn();
  }
}

export function initPwaServiceWorker(): void {
  if (typeof window === 'undefined') return;
  const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (isTauri) return;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notifyListeners();
  });

  if ('serviceWorker' in navigator) {
    const registerSw = () => {
      const swUrl = `${import.meta.env.BASE_URL || '/'}sw.js`;
      navigator.serviceWorker.register(swUrl).catch(() => {
        // Ignore service worker registration errors in restricted contexts
      });
    };
    if (document.readyState === 'complete') {
      registerSw();
    } else {
      window.addEventListener('load', registerSw);
    }
  }
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIphoneOrIpad = /iPhone|iPad|iPod/i.test(ua);
  const isIpadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isIphoneOrIpad || isIpadOs;
}

export function getDirectPwaTesterUrl(): string {
  if (typeof window === 'undefined') {
    return 'https://barnesy.github.io/strictly-spending/?pwa=1';
  }
  const { origin, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('100.')) {
    return 'https://barnesy.github.io/strictly-spending/?pwa=1';
  }
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${origin}${normalizedBase}?pwa=1`;
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState<boolean>(() => deferredPrompt !== null);
  const [isIos] = useState<boolean>(() => isIosDevice());
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });

  useEffect(() => {
    const update = () => {
      setCanInstall(deferredPrompt !== null);
      setIsStandalone(
        window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as unknown as { standalone?: boolean }).standalone === true
      );
    };
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    notifyListeners();
    return choice.outcome === 'accepted';
  }, []);

  return { canInstall, isIos, isStandalone, promptInstall };
}
