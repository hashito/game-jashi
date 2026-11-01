/* game-kit 6e0b6f0: js/analytics.js — edit in game-kit and run tools/kit-sync.js */
// Google Analytics (GA4) events. The gtag snippet is only injected by the site build
// when a measurement ID is configured, so every call here is a no-op otherwise.
export function track(name, params = {}) {
  if (typeof window.gtag === 'function') window.gtag('event', name, params);
}
