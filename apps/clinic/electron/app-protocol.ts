import { extname, isAbsolute, join, relative, resolve } from 'node:path';

/** The privileged scheme the built renderer is served from: `app://clinic/`. */
export const APP_SCHEME = 'app';
export const APP_HOST = 'clinic';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/**
 * The content security policy of every renderer response: only the app's own files, plus the
 * origins of our map server (ADR 0023) for the style, tiles, sprites and glyphs the map fetches.
 * MapLibre's worker is a file of the app (`setWorkerUrl`), so no blob worker is allowed. The sync
 * service and API origins join `connect-src` with S04.
 */
export function contentSecurityPolicy(mapOrigins: readonly string[]): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    ["connect-src 'self'", ...mapOrigins].join(' '),
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** The variables that hold the map URLs; Vite gives the renderer the same ones at build. */
export const MAP_URL_VARIABLES = [
  'VITE_MAP_STYLE_URL',
  'VITE_MAP_TILES_URL',
  'VITE_MAP_GLYPHS_URL',
] as const;

/** A DNS name or IPv4 address in ASCII (internationalized names arrive as punycode). */
const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

/**
 * The origins of the configured map URLs: HTTPS, or HTTP on the loopback interface for the local
 * extract. Anything else is left out, so the map fails to load and the renderer keeps the paste
 * field.
 */
export function mapOrigins(env: Readonly<Record<string, string | undefined>>): string[] {
  const origins = new Set<string>();
  for (const name of MAP_URL_VARIABLES) {
    let url: URL;
    try {
      url = new URL(env[name] ?? '');
    } catch {
      continue;
    }
    // The URL parser accepts `*` and `;` in a host, which would widen or break the policy.
    if (url.username || url.password || !HOSTNAME.test(url.hostname)) continue;
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol === 'https:' || (url.protocol === 'http:' && loopback))
      origins.add(url.origin);
  }
  return [...origins];
}

/**
 * The file under `rootDir` that answers `requestUrl`, or `null` when the URL is not the app's or
 * would leave `rootDir`. A path without an extension is a client route and gets `index.html`.
 */
export function resolveAppFile(rootDir: string, requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) return null;

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;

  const root = resolve(rootDir);
  const file = extname(pathname) === '' ? join(root, 'index.html') : resolve(root, `.${pathname}`);
  const inside = relative(root, file);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return null;
  return file;
}
