import { z } from 'zod';

/**
 * A point on the map in degrees × 10⁷, as integers (ADR 0020: no floats in stored data). Seven
 * decimals locate a point to about one centimetre, more than any map pin needs.
 */
export const coordinatesSchema = z
  .object({
    latitudeE7: z.int().min(-900_000_000).max(900_000_000),
    longitudeE7: z.int().min(-1_800_000_000).max(1_800_000_000),
  })
  .meta({ id: 'Coordinates' });

export type Coordinates = z.infer<typeof coordinatesSchema>;

const E7 = 10_000_000;

/** From degrees as numbers (a map pin), rounded to seven decimals. */
export function coordinatesFromDegrees(
  latitude: number,
  longitude: number,
): Coordinates | undefined {
  const result = coordinatesSchema.safeParse({
    latitudeE7: Math.round(latitude * E7),
    longitudeE7: Math.round(longitude * E7),
  });
  return result.success ? result.data : undefined;
}

/** To degrees as numbers, for a map component. */
export function coordinatesToDegrees(
  coordinates: Coordinates,
): [latitude: number, longitude: number] {
  return [coordinates.latitudeE7 / E7, coordinates.longitudeE7 / E7];
}

const DEGREES = /^([+-]?)(\d{1,3})(?:\.(\d+))?$/;

/** A decimal degree as written (`36.5864`) to × 10⁷, exactly: digits past the seventh are rounded half up. */
function e7(text: string): number | undefined {
  const match = DEGREES.exec(text);
  if (!match) return undefined;
  const [, sign, whole = '', fraction = ''] = match;
  let value = Number(whole) * E7 + Number(fraction.slice(0, 7).padEnd(7, '0'));
  if ((fraction[7] ?? '0') >= '5') value += 1;
  return sign === '-' ? -value : value;
}

function pair(
  latitude: string | undefined,
  longitude: string | undefined,
): Coordinates | undefined {
  if (latitude === undefined || longitude === undefined) return undefined;
  const result = coordinatesSchema.safeParse({
    latitudeE7: e7(latitude),
    longitudeE7: e7(longitude),
  });
  return result.success ? result.data : undefined;
}

const NUMBER = String.raw`[+-]?\d{1,3}(?:\.\d+)?`;
/** `36.5864, 37.0453`, `36.5864,37.0453` or `36.5864 37.0453`. */
const PLAIN = new RegExp(String.raw`^(${NUMBER})\s*[,،\s]\s*(${NUMBER})$`);
const PLACE = new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`);
const CENTER = new RegExp(String.raw`@(${NUMBER}),(${NUMBER})(?:,|$|/|\?)`);
const VALUE = new RegExp(String.raw`^(?:loc:)?(${NUMBER})\s*,\s*(${NUMBER})$`);
const SEARCH = new RegExp(
  String.raw`/maps/(?:search|place|dir)/(?:[^/]*/)?(${NUMBER}),\s*(${NUMBER})(?:/|$)`,
);

/** Hosts of full Google Maps links: `google.com`, `www.google.com.tr`, `maps.google.com`… */
const GOOGLE_HOST = /^(?:www\.|maps\.)?google\.(?:com|com\.[a-z]{2}|co\.[a-z]{2}|[a-z]{2})$/;

/**
 * The parts of an `http` or `https` link that matter here. A link with credentials or a port is
 * refused: `https://google.com@example.com/` names `example.com`. Parsed by hand because the
 * patient app's runtime has only part of `URL`.
 */
export type Link = { host: string; path: string; query: Map<string, string> };

const LINK = /^https?:\/\/([a-z0-9.-]+)(\/[^?#\s]*)?(?:\?([^#\s]*))?(?:#\S*)?$/i;

function decode(text: string): string | undefined {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return undefined;
  }
}

export function parseLink(text: string): Link | undefined {
  const match = LINK.exec(text.trim());
  if (!match) return undefined;
  const [, host = '', path = '/', search = ''] = match;
  const query = new Map<string, string>();
  for (const part of search.split('&')) {
    const [name = '', value = ''] = part.split('=', 2);
    const decoded = decode(value);
    if (name && decoded !== undefined && !query.has(name)) query.set(name, decoded);
  }
  return { host: host.toLowerCase(), path, query };
}

/** A full Google Maps link: the coordinates are in it. */
export function isGoogleMapsLink(link: Link): boolean {
  if (!GOOGLE_HOST.test(link.host)) return false;
  return link.host.startsWith('maps.') || link.path === '/maps' || link.path.startsWith('/maps/');
}

/** A Google Maps short link: the coordinates are known only after following its redirect. */
export function isShortMapLink(link: Link): boolean {
  if (link.host === 'maps.app.goo.gl') return link.path.length > 1;
  return link.host === 'goo.gl' && link.path.startsWith('/maps/');
}

/**
 * The coordinates of a full Google Maps link, or undefined. The place's own point (`!3d…!4d…`)
 * wins over a searched point (`q=`, `query=`, `ll=`, `destination=`, `/maps/search/…`), which wins
 * over the centre of the view (`@lat,lng,zoom`), since the view may be panned away from the place.
 */
export function parseGoogleMapsLink(link: Link): Coordinates | undefined {
  if (!isGoogleMapsLink(link)) return undefined;
  const path = decode(link.path.replace(/\+/g, '%20')) ?? '';
  const place = PLACE.exec(path) ?? PLACE.exec([...link.query.values()].join('&'));
  if (place) return pair(place[1], place[2]);
  for (const name of ['q', 'query', 'll', 'destination', 'center']) {
    const value = VALUE.exec(link.query.get(name)?.trim() ?? '');
    if (value) return pair(value[1], value[2]);
  }
  const search = SEARCH.exec(path);
  if (search) return pair(search[1], search[2]);
  const center = CENTER.exec(path);
  return center ? pair(center[1], center[2]) : undefined;
}

export type MapLocation =
  | { kind: 'coordinates'; coordinates: Coordinates }
  /** Resolved by the server (`POST /api/maps/resolve-link`), which follows the redirect. */
  | { kind: 'short-link'; url: string };

/**
 * What the owner pasted in the location field: `latitude, longitude` text, a full Google Maps link,
 * or a short link to resolve on the server. Undefined when none of these gives a location.
 */
export function parseMapLocation(text: string): MapLocation | undefined {
  const trimmed = text.trim();
  const plain = PLAIN.exec(trimmed);
  if (plain) {
    const coordinates = pair(plain[1], plain[2]);
    return coordinates && { kind: 'coordinates', coordinates };
  }
  const link = parseLink(trimmed);
  if (!link) return undefined;
  if (isShortMapLink(link)) return { kind: 'short-link', url: trimmed };
  const coordinates = parseGoogleMapsLink(link);
  return coordinates && { kind: 'coordinates', coordinates };
}

/** Roughly Syria and Turkey; a point outside asks the owner to confirm it (S01 rule 13). */
export function isInServiceRegion({ latitudeE7, longitudeE7 }: Coordinates): boolean {
  return (
    latitudeE7 >= 320_000_000 &&
    latitudeE7 <= 425_000_000 &&
    longitudeE7 >= 255_000_000 &&
    longitudeE7 <= 450_000_000
  );
}

/** What `POST /api/maps/resolve-link` takes. */
export const resolveMapLinkSchema = z
  .object({ url: z.url({ protocol: /^https?$/ }).max(2048) })
  .meta({ id: 'ResolveMapLink' });

export type ResolveMapLink = z.infer<typeof resolveMapLinkSchema>;
