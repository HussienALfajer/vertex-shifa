import { describe, expect, it } from 'vitest';
import {
  coordinatesFromDegrees,
  coordinatesSchema,
  coordinatesToDegrees,
  isInServiceRegion,
  parseGoogleMapsLink,
  parseLink,
  parseMapLocation,
} from './coordinates.js';

// A point in Azaz.
const AZAZ = { latitudeE7: 365_864_000, longitudeE7: 370_453_000 };

describe('coordinates codec', () => {
  it('stores degrees × 10⁷ as integers within range', () => {
    expect(coordinatesSchema.safeParse(AZAZ).success).toBe(true);
    const valid = (latitudeE7: number, longitudeE7: number) =>
      coordinatesSchema.safeParse({ latitudeE7, longitudeE7 }).success;
    expect(valid(900_000_001, 0)).toBe(false);
    expect(valid(0, -1_800_000_001)).toBe(false);
    expect(valid(1.5, 0)).toBe(false);
  });

  it('converts a map pin to seven decimals and back', () => {
    expect(coordinatesFromDegrees(36.5864, 37.0453)).toEqual(AZAZ);
    expect(coordinatesFromDegrees(36.58640004, 37.04530006)).toEqual({
      latitudeE7: 365_864_000,
      longitudeE7: 370_453_001,
    });
    expect(coordinatesToDegrees(AZAZ)).toEqual([36.5864, 37.0453]);
    expect(coordinatesFromDegrees(91, 0)).toBeUndefined();
  });
});

describe('parseMapLocation', () => {
  it.each([
    '36.5864, 37.0453',
    '36.5864,37.0453',
    '36.5864 37.0453',
    '36.5864، 37.0453',
    '  +36.5864 , +37.0453 ',
  ])('reads plain coordinates %j', (text) => {
    expect(parseMapLocation(text)).toEqual({ kind: 'coordinates', coordinates: AZAZ });
  });

  it('reads plain coordinates exactly, rounding past the seventh decimal', () => {
    expect(parseMapLocation('36.58640005, -37.04530004')).toEqual({
      kind: 'coordinates',
      coordinates: { latitudeE7: 365_864_001, longitudeE7: -370_453_000 },
    });
    expect(parseMapLocation('36, 37')).toEqual({
      kind: 'coordinates',
      coordinates: { latitudeE7: 360_000_000, longitudeE7: 370_000_000 },
    });
  });

  it.each([
    [
      'place point',
      'https://www.google.com/maps/place/Azaz/@36.59,37.05,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d36.5864!4d37.0453',
    ],
    ['view centre', 'https://www.google.com/maps/@36.5864,37.0453,17z'],
    ['q', 'https://maps.google.com/?q=36.5864,37.0453'],
    ['encoded q', 'https://www.google.com/maps?q=36.5864%2C37.0453&z=17'],
    ['loc q', 'https://maps.google.com/maps?q=loc:36.5864,37.0453'],
    ['query', 'https://www.google.com/maps/search/?api=1&query=36.5864,37.0453'],
    ['ll', 'https://maps.google.com/maps?ll=36.5864,37.0453&z=16'],
    ['destination', 'https://www.google.com/maps/dir/?api=1&destination=36.5864,37.0453'],
    ['search path', 'https://www.google.com/maps/search/36.5864,+37.0453?entry=tts'],
    ['place path', 'https://www.google.com/maps/place/36.5864,37.0453'],
    ['country host', 'https://www.google.com.tr/maps/@36.5864,37.0453,17z'],
  ])('reads a full Google Maps link (%s)', (_, url) => {
    expect(parseMapLocation(url)).toEqual({ kind: 'coordinates', coordinates: AZAZ });
  });

  it('prefers the place point over the view centre', () => {
    const link = parseLink(
      'https://www.google.com/maps/place/X/@10.5,20.5,15z/data=!4m5!3m4!8m2!3d36.5864!4d37.0453',
    );
    expect(link && parseGoogleMapsLink(link)).toEqual(AZAZ);
  });

  it('hands short links to the server', () => {
    expect(parseMapLocation('https://maps.app.goo.gl/AbCdEf123')).toEqual({
      kind: 'short-link',
      url: 'https://maps.app.goo.gl/AbCdEf123',
    });
    expect(parseMapLocation('https://goo.gl/maps/AbCdEf123')?.kind).toBe('short-link');
    expect(parseMapLocation('https://maps.app.goo.gl/')).toBeUndefined();
    expect(parseMapLocation('https://goo.gl/other')).toBeUndefined();
  });

  it.each([
    '',
    'Azaz',
    '91, 37',
    '36.5864',
    'https://www.google.com/maps/place/Azaz',
    'https://www.google.com/search?q=36.5864,37.0453',
    'https://example.com/maps/@36.5864,37.0453,17z',
    'https://google.com.evil.example/maps/@36.5864,37.0453,17z',
    'ftp://maps.google.com/?q=36.5864,37.0453',
    'javascript:alert(1)',
    'https://google.com@example.com/maps/@36.5864,37.0453,17z',
    'https://maps.google.com:8443/?q=36.5864,37.0453',
  ])('finds no location in %j', (text) => {
    expect(parseMapLocation(text)).toBeUndefined();
  });
});

describe('isInServiceRegion', () => {
  it('holds Syria and Turkey, not far away', () => {
    expect(isInServiceRegion(AZAZ)).toBe(true);
    expect(isInServiceRegion({ latitudeE7: 410_082_000, longitudeE7: 289_784_000 })).toBe(true);
    expect(isInServiceRegion({ latitudeE7: 525_200_000, longitudeE7: 134_050_000 })).toBe(false);
  });
});
