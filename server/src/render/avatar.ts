// Téléchargement de l'avatar pour l'embarquer en data URI dans le SVG.
// Timeout 3 s ; en cas d'échec, la carte retombe sur les initiales.
// Formats acceptés : png, jpeg, gif. Le webp n'est PAS décodé par resvg-js 2.6.2.

const TIMEOUT_MS = 3000;
const MAX_BYTES = 2_000_000;
const ACCEPTED = ["image/png", "image/jpeg", "image/gif"];
const cache = new Map<string, string>();
const CACHE_MAX = 300;

/** Demande une taille adaptée au rendu (avatars GitHub : paramètre s). */
function sized(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("githubusercontent.com")) u.searchParams.set("s", "460");
    return u.toString();
  } catch {
    return url;
  }
}

export async function fetchAvatar(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  if (url.startsWith("data:")) {
    // resvg-js 2.6 ne décode pas le webp (vérifié) : repli sur les initiales
    const type = url.slice(5).split(/[;,]/)[0].toLowerCase();
    return ACCEPTED.includes(type) ? url : undefined;
  }
  const hit = cache.get(url);
  if (hit) return hit;
  let result: string | null = null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(sized(url), { signal: ctrl.signal, redirect: "follow" });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (res.ok && ACCEPTED.includes(type)) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0 && buf.length <= MAX_BYTES) result = `data:${type};base64,${buf.toString("base64")}`;
    }
  } catch {
    result = null;
  } finally {
    clearTimeout(timer);
  }
  // on ne garde que les succès : un échec réseau ne doit pas figer les initiales
  if (result) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(url, result);
  }
  return result ?? undefined;
}
