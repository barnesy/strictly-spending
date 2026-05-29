/**
 * Build-time environment flags.
 *
 * `DEMO_ONLY_BUILD` is `true` when the app is built via `npm run build:demo`
 * for embedding into a static portfolio site. In that mode the app
 * auto-seeds demo data, forces demo mode on, and hides destructive UI
 * (Clear demo data, Disconnect watch folder) so visitors can't damage
 * their own session.
 */
export const DEMO_ONLY_BUILD = import.meta.env.VITE_DEMO_ONLY === 'true';
