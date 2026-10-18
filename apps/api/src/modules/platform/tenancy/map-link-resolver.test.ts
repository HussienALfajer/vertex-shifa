import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DomainError } from '@vertex-shifa/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MapLinkResolver } from './map-link-resolver.js';

// A fake server stands in for every host: the resolver's fetch keeps the URL it was asked for
// (so the allow list sees real Google hosts) and sends the request here. Paths pick the answer.

const seen: { host: string; method: string; path: string; body: string }[] = [];
/** The protocol of every URL the resolver asked its fetch for. */
const protocols: string[] = [];
let server: Server;
let origin: string;

const FULL = 'https://www.google.com/maps/place/X/data=!3d36.5864!4d37.0453';

beforeAll(async () => {
  server = createServer(async (req: IncomingMessage, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const host = String(req.headers['x-original-host']);
    seen.push({ host, method: req.method ?? '', path: req.url ?? '', body });
    const [, kind, rest = ''] = /^\/([a-z-]+)(\d*)$/.exec(req.url ?? '') ?? [];
    if (kind === 'slow') return; // never answers
    // Each hop answers in 150 ms: three hops pass a 300 ms deadline, not each one alone.
    if (kind === 'delay') await new Promise((resolve) => setTimeout(resolve, 150));
    const location = {
      full: FULL,
      relative: '//www.google.com/maps/@36.5864,37.0453,17z',
      'no-coordinates': 'https://www.google.com/maps/place/Azaz',
      elsewhere: 'https://example.com/maps/@36.5864,37.0453,17z',
      loop: `https://maps.app.goo.gl/loop${rest}1`,
      chain: rest.length < 2 ? `https://maps.app.goo.gl/chain${rest}1` : FULL,
      delay: rest.length < 2 ? `https://maps.app.goo.gl/delay${rest}1` : FULL,
      'relative-path': '/full',
      plain: 'http://goo.gl/maps/full',
      credentials: 'https://user:secret@maps.app.goo.gl/full',
      port: 'https://maps.app.goo.gl:8443/full',
    }[kind ?? ''];
    if (kind === 'ok') {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<html></html>');
      return;
    }
    res.writeHead(location ? 302 : 404, location ? { location } : {}).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

function resolver(timeoutMs = 2000) {
  return new MapLinkResolver({
    timeoutMs,
    maxRedirects: 3,
    fetch: (input, init) => {
      const url = new URL(String(input));
      protocols.push(url.protocol);
      return fetch(`${origin}${url.pathname.replace(/^\/maps\//, '/')}`, {
        ...init,
        headers: { 'x-original-host': url.host },
      });
    },
  });
}

async function code(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

const AZAZ = { latitudeE7: 365_864_000, longitudeE7: 370_453_000 };

describe('MapLinkResolver', () => {
  it('follows a short link to the full link and reads its coordinates', async () => {
    seen.length = 0;
    expect(await resolver().resolve('https://maps.app.goo.gl/full')).toEqual(AZAZ);
    expect(await resolver().resolve('https://goo.gl/maps/relative')).toEqual(AZAZ);
    expect(seen).toEqual([
      { host: 'maps.app.goo.gl', method: 'GET', path: '/full', body: '' },
      { host: 'goo.gl', method: 'GET', path: '/relative', body: '' },
    ]);
  });

  it('never requests a full link, nor follows a redirect to another host', async () => {
    seen.length = 0;
    expect(await resolver().resolve(FULL)).toEqual(AZAZ);
    expect(await code(resolver().resolve('https://maps.app.goo.gl/elsewhere'))).toBe(
      'MAP_LINK_UNRECOGNIZED',
    );
    expect(await code(resolver().resolve('https://example.com/full'))).toBe(
      'MAP_LINK_UNRECOGNIZED',
    );
    expect(seen.map((request) => request.host)).toEqual(['maps.app.goo.gl']);
  });

  it('stops after three redirects', async () => {
    seen.length = 0;
    expect(await resolver().resolve('https://maps.app.goo.gl/chain')).toEqual(AZAZ);
    expect(await code(resolver().resolve('https://maps.app.goo.gl/loop'))).toBe(
      'MAP_LINK_UNRECOGNIZED',
    );
    expect(seen.filter((request) => request.path.startsWith('/loop'))).toHaveLength(3);
  });

  it('requests short links over TLS only, even when written or redirected as http', async () => {
    protocols.length = 0;
    expect(await resolver().resolve('http://maps.app.goo.gl/full')).toEqual(AZAZ);
    expect(await resolver().resolve('https://maps.app.goo.gl/plain')).toEqual(AZAZ);
    expect(protocols).toEqual(['https:', 'https:', 'https:']);
  });

  it('follows a redirect relative to the short link, refusing credentials and ports', async () => {
    expect(await resolver().resolve('https://maps.app.goo.gl/relative-path')).toEqual(AZAZ);
    for (const path of ['credentials', 'port']) {
      expect(await code(resolver().resolve(`https://maps.app.goo.gl/${path}`)), path).toBe(
        'MAP_LINK_UNRECOGNIZED',
      );
    }
  });

  it('holds one deadline for the whole resolution, every hop included', async () => {
    expect(await code(resolver(300).resolve('https://maps.app.goo.gl/delay'))).toBe(
      'MAP_LINK_UNRECOGNIZED',
    );
    expect(await resolver(2000).resolve('https://maps.app.goo.gl/delay')).toEqual(AZAZ);
  });

  it('gives up on a slow host, a page without a redirect, or a place without coordinates', async () => {
    const started = Date.now();
    expect(await code(resolver(200).resolve('https://maps.app.goo.gl/slow'))).toBe(
      'MAP_LINK_UNRECOGNIZED',
    );
    expect(Date.now() - started).toBeLessThan(2000);
    for (const path of ['ok', 'missing', 'no-coordinates']) {
      expect(await code(resolver().resolve(`https://maps.app.goo.gl/${path}`)), path).toBe(
        'MAP_LINK_UNRECOGNIZED',
      );
    }
  });
});
