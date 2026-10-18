import {
  type Coordinates,
  DomainError,
  isGoogleMapsLink,
  isShortMapLink,
  parseGoogleMapsLink,
  parseLink,
} from '@vertex-shifa/contracts';

export type MapLinkResolverOptions = {
  /** `globalThis.fetch` in production; tests route it to a fake server. */
  fetch: typeof globalThis.fetch;
  timeoutMs: number;
  maxRedirects: number;
};

const unrecognized = () =>
  new DomainError('MAP_LINK_UNRECOGNIZED', 'The map link gives no coordinates');

/**
 * Turns a pasted Google Maps link into coordinates (S01). A full link is parsed without a request.
 * A short link (`maps.app.goo.gl`, `goo.gl/maps`) is followed only while each hop is a short link,
 * up to `maxRedirects` hops, until it names a full Google Maps link: the only hosts ever requested
 * are the short-link hosts, with a bodiless `GET`, no headers of ours and one timeout for the whole
 * resolution, and no page is read. Anything else is `MAP_LINK_UNRECOGNIZED`, and the owner sets the pin on the map.
 */
export class MapLinkResolver {
  constructor(private readonly options: MapLinkResolverOptions) {}

  async resolve(url: string): Promise<Coordinates> {
    // One deadline for the whole resolution, every hop included.
    const signal = AbortSignal.timeout(this.options.timeoutMs);
    let current = url;
    for (let hop = 0; ; hop++) {
      const link = parseLink(current);
      if (!link) throw unrecognized();
      if (isGoogleMapsLink(link)) {
        const coordinates = parseGoogleMapsLink(link);
        if (!coordinates) throw unrecognized();
        return coordinates;
      }
      if (!isShortMapLink(link) || hop >= this.options.maxRedirects) throw unrecognized();
      // Never in plain text (ADR 0016): a short link written or redirected as `http` goes over TLS.
      current = await this.redirectOf(current.replace(/^http:/i, 'https:'), signal);
    }
  }

  /** Where a short link redirects to, as an absolute URL. */
  private async redirectOf(url: string, signal: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await this.options.fetch(url, { method: 'GET', redirect: 'manual', signal });
    } catch {
      throw unrecognized();
    }
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (response.status < 300 || response.status > 399 || !location) throw unrecognized();
    try {
      return new URL(location, url).href;
    } catch {
      throw unrecognized();
    }
  }
}
