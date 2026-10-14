// Petit routeur sur l'API history : un chemin, des écouteurs, rien de plus.
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", notify);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function usePath(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => "/",
  );
}

/** État attaché à l'entrée d'historique courante (ex. pré-remplissage). */
export function historyState<T>(): T | null {
  return (window.history.state as T) ?? null;
}

export function navigate(to: string, opts: { replace?: boolean; state?: unknown; keepScroll?: boolean } = {}) {
  // On garde la query (?mock=1) pour ne pas perdre le mode démo en route.
  const url = to.includes("?") ? to : to + window.location.search;
  if (opts.replace) window.history.replaceState(opts.state ?? null, "", url);
  else window.history.pushState(opts.state ?? null, "", url);
  if (!opts.keepScroll) window.scrollTo({ top: 0 });
  notify();
}

/** Clic gauche simple sur un lien interne : on navigue sans recharger. */
export function onLinkClick(e: React.MouseEvent<HTMLAnchorElement>, to: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(to);
}
