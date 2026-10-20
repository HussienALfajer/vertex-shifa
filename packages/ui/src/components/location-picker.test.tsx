// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Coordinates } from '@vertex-shifa/contracts';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationPicker, type MapConfig, type ShortLinkResult } from './location-picker';

type Handler = (event?: unknown) => void;
type LngLat = { lng: number; lat: number };

/** MapLibre needs WebGL, which jsdom lacks: the tests drive a stand-in through its events. */
const fake = vi.hoisted(() => {
  class Evented {
    handlers = new Map<string, Handler[]>();
    on(event: string, handler: Handler) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    fire(event: string, data?: unknown) {
      for (const handler of this.handlers.get(event) ?? []) handler(data);
    }
  }
  class FakeMap extends Evented {
    style: { url: string; transform: (previous: unknown, next: unknown) => unknown } | undefined;
    eased: unknown[] = [];
    removed = false;
    constructor(readonly options: Record<string, unknown>) {
      super();
      state.maps.push(this);
    }
    setStyle(
      url: string,
      options: { transformStyle: (previous: unknown, next: unknown) => unknown },
    ) {
      this.style = { url, transform: options.transformStyle };
    }
    easeTo(options: unknown) {
      this.eased.push(options);
    }
    remove() {
      this.removed = true;
    }
  }
  class FakeMarker extends Evented {
    lngLat: LngLat = { lng: 0, lat: 0 };
    draggable: boolean;
    constructor(readonly options: { element: HTMLElement; draggable: boolean }) {
      super();
      this.draggable = options.draggable;
      state.markers.push(this);
    }
    setLngLat(value: [number, number] | LngLat) {
      this.lngLat = Array.isArray(value) ? { lng: value[0], lat: value[1] } : value;
      return this;
    }
    getLngLat() {
      return this.lngLat;
    }
    setDraggable(draggable: boolean) {
      this.draggable = draggable;
    }
    addTo(map: FakeMap) {
      (map.options.container as HTMLElement).append(this.options.element);
      return this;
    }
  }
  const state = {
    maps: [] as FakeMap[],
    markers: [] as FakeMarker[],
    workerUrl: '',
    protocols: [] as string[],
  };
  return { state, FakeMap, FakeMarker };
});

vi.mock('maplibre-gl', () => ({
  Map: fake.FakeMap,
  Marker: fake.FakeMarker,
  addProtocol: (name: string) => fake.state.protocols.push(name),
  setWorkerUrl: (url: string) => {
    fake.state.workerUrl = url;
  },
}));
vi.mock('pmtiles', () => ({ Protocol: class {} }));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

const azaz: Coordinates = { latitudeE7: 365_864_000, longitudeE7: 370_453_000 };

const map: MapConfig = {
  styleUrl: 'https://maps.example.test/style.json',
  tilesUrl: 'https://maps.example.test/azaz.pmtiles',
  glyphsUrl: 'https://maps.example.test/fonts/{fontstack}/{range}.pbf',
  workerUrl: '/assets/maplibre-gl-worker.mjs',
};

const labels = {
  map: 'map',
  pin: 'pin',
  paste: 'paste',
  pasteDescription: 'description',
  resolving: 'resolving',
  unrecognized: 'unrecognized',
};

function setup(
  props: {
    map?: MapConfig;
    value?: Coordinates;
    resolveShortLink?: (url: string) => Promise<ShortLinkResult>;
  } = {},
) {
  const onChange = vi.fn();
  const onSettledChange = vi.fn();
  const resolveShortLink = vi.fn(props.resolveShortLink ?? (async () => ({ error: 'none' })));
  render(
    <LocationPicker
      map={props.map}
      center={azaz}
      value={props.value}
      onChange={onChange}
      onSettledChange={onSettledChange}
      resolveShortLink={resolveShortLink}
      labels={labels}
    />,
  );
  return { onChange, onSettledChange, resolveShortLink, input: screen.getByLabelText('paste') };
}

function deferred() {
  let resolve: (result: ShortLinkResult) => void = () => {};
  const promise = new Promise<ShortLinkResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** The picker under a screen that keeps the location in state, as the real screens do. */
function renderStateful(
  props: {
    map?: MapConfig;
    initial?: Coordinates;
    resolveShortLink?: (url: string) => Promise<ShortLinkResult>;
  } = {},
) {
  const onChange = vi.fn();
  const harness = { onChange, setValue: (_value: Coordinates | undefined) => {} };
  function Screen() {
    const [value, setValue] = useState(props.initial);
    harness.setValue = setValue;
    return (
      <LocationPicker
        map={props.map}
        center={azaz}
        value={value}
        onChange={(coordinates) => {
          onChange(coordinates);
          setValue(coordinates);
        }}
        resolveShortLink={props.resolveShortLink ?? (async () => ({ error: 'none' }))}
        labels={labels}
      />
    );
  }
  render(<Screen />);
  return harness;
}

async function mapReady() {
  await waitFor(() => expect(fake.state.markers).toHaveLength(1));
  const [created] = fake.state.maps;
  const [marker] = fake.state.markers;
  if (!created || !marker) throw new Error('no map');
  return { created, marker };
}

beforeEach(() => {
  fake.state.maps.length = 0;
  fake.state.markers.length = 0;
});

afterEach(cleanup);

describe('LocationPicker without map URLs', () => {
  it('shows the paste field only', () => {
    setup();
    expect(screen.queryByText('© OpenStreetMap')).toBeNull();
    expect(fake.state.maps).toHaveLength(0);
  });

  it('sets coordinates typed as latitude, longitude', () => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: '36.5864, 37.0453' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(azaz);
  });

  it('sets coordinates from a full Google Maps link on paste', () => {
    const { input, onChange } = setup();
    fireEvent.paste(input);
    fireEvent.change(input, {
      target: { value: 'https://www.google.com/maps/@36.5864,37.0453,17z' },
    });
    expect(onChange).toHaveBeenCalledWith(azaz);
  });

  it('drops a short link answer once the owner edits the field', async () => {
    const pending = deferred();
    const { input, onChange } = setup({ resolveShortLink: () => pending.promise });
    fireEvent.change(input, { target: { value: 'https://maps.app.goo.gl/abc123' } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: '36.7, 37.2' } });
    expect(screen.queryByText('resolving')).toBeNull();
    await act(async () => pending.resolve({ coordinates: azaz }));
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveProperty('value', '36.7, 37.2');
  });

  it('drops a short link answer after the picker is gone', async () => {
    const pending = deferred();
    const { input, onChange } = setup({ resolveShortLink: () => pending.promise });
    fireEvent.change(input, { target: { value: 'https://maps.app.goo.gl/abc123' } });
    fireEvent.blur(input);
    cleanup();
    await act(async () => pending.resolve({ coordinates: azaz }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tries a failed short link again on Enter', async () => {
    const { input, resolveShortLink } = setup({
      resolveShortLink: async () => ({ error: 'no connection' }),
    });
    fireEvent.change(input, { target: { value: 'https://maps.app.goo.gl/abc123' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('no connection')).toBeDefined();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(resolveShortLink).toHaveBeenCalledTimes(2));
  });

  it('clears the field when the screen clears the location', () => {
    const harness = renderStateful({ initial: azaz });
    const input = screen.getByLabelText('paste');
    expect(input).toHaveProperty('value', '36.5864, 37.0453');
    act(() => harness.setValue(undefined));
    expect(input).toHaveProperty('value', '');
  });

  it('refuses text without a location', () => {
    const { input, onChange } = setup();
    fireEvent.change(input, { target: { value: 'Azaz, near the mosque' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('unrecognized')).toBeDefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tells the form a refused edit is not the location it holds, until it is fixed', () => {
    const { input, onChange, onSettledChange } = setup({ value: azaz });
    fireEvent.change(input, { target: { value: 'not coordinates' } });
    fireEvent.blur(input);
    expect(onSettledChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(input, { target: { value: '36.5864, 37.0453' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(azaz);
    expect(onSettledChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onSettledChange).toHaveBeenLastCalledWith(false);
  });

  it('tells the form it is settled when it appears, and when it goes while refused', () => {
    const { input, onSettledChange } = setup({ value: azaz });
    expect(onSettledChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(input, { target: { value: 'not coordinates' } });
    fireEvent.blur(input);
    expect(onSettledChange).toHaveBeenLastCalledWith(false);
    cleanup();
    expect(onSettledChange).toHaveBeenLastCalledWith(true);
  });

  it('tells the form a short link is still resolving', async () => {
    const pending = deferred();
    const { input, onSettledChange } = setup({ resolveShortLink: () => pending.promise });
    fireEvent.change(input, { target: { value: 'https://maps.app.goo.gl/abc123' } });
    fireEvent.blur(input);
    expect(onSettledChange).toHaveBeenLastCalledWith(false);
    await act(async () => pending.resolve({ coordinates: azaz }));
    expect(onSettledChange).toHaveBeenLastCalledWith(true);
  });

  it('resolves a short link through the app and shows its error', async () => {
    const { input, onChange, resolveShortLink } = setup({
      resolveShortLink: async () => ({ error: 'no place in this link' }),
    });
    fireEvent.change(input, { target: { value: 'https://maps.app.goo.gl/abc123' } });
    fireEvent.blur(input);
    fireEvent.blur(input);
    expect(await screen.findByText('no place in this link')).toBeDefined();
    expect(resolveShortLink).toHaveBeenCalledTimes(1);
    expect(resolveShortLink).toHaveBeenCalledWith('https://maps.app.goo.gl/abc123');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('sets the coordinates a short link resolves to', async () => {
    const { input, onChange } = setup({ resolveShortLink: async () => ({ coordinates: azaz }) });
    fireEvent.change(input, { target: { value: 'https://maps.app.goo.gl/abc123' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(azaz));
  });
});

describe('LocationPicker with map URLs', () => {
  it('shows the OpenStreetMap attribution and the paste field', async () => {
    setup({ map });
    expect(screen.getByText('© OpenStreetMap')).toBeDefined();
    expect(screen.getByLabelText('paste')).toBeDefined();
    await mapReady();
  });

  it('opens on the city, with our worker, tiles and glyphs', async () => {
    setup({ map });
    const { created, marker } = await mapReady();
    expect(created.options.center).toEqual([37.0453, 36.5864]);
    expect(created.options.attributionControl).toBe(false);
    expect(fake.state.workerUrl).toBe(map.workerUrl);
    expect(fake.state.protocols).toEqual(['pmtiles']);
    expect(marker.lngLat).toEqual({ lng: 37.0453, lat: 36.5864 });
    expect(created.style?.url).toBe(map.styleUrl);
    const served = {
      version: 8,
      glyphs: 'https://elsewhere.test/{fontstack}/{range}.pbf',
      sources: {
        protomaps: { type: 'vector', url: 'https://elsewhere.test/tiles.json', attribution: 'x' },
        pins: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      },
      layers: [],
    };
    expect(created.style?.transform(undefined, served)).toEqual({
      ...served,
      glyphs: map.glyphsUrl,
      sources: {
        protomaps: { type: 'vector', url: `pmtiles://${map.tilesUrl}` },
        pins: served.sources.pins,
      },
    });
  });

  it('sets coordinates from the dragged pin', async () => {
    const { onChange } = setup({ map });
    const { created, marker } = await mapReady();
    act(() => {
      marker.setLngLat({ lng: 37.05123456, lat: 36.59987654 });
      marker.fire('dragend');
    });
    expect(onChange).toHaveBeenCalledWith({ latitudeE7: 365_998_765, longitudeE7: 370_512_346 });
    expect(created.eased).toEqual([]);
  });

  it('moves the pin to a clicked point', async () => {
    const { onChange } = setup({ map });
    const { created, marker } = await mapReady();
    act(() => created.fire('click', { lngLat: { lng: 37.04, lat: 36.58 } }));
    expect(marker.lngLat).toEqual({ lng: 37.04, lat: 36.58 });
    expect(onChange).toHaveBeenCalledWith({ latitudeE7: 365_800_000, longitudeE7: 370_400_000 });
  });

  it('names the pin', async () => {
    setup({ map });
    const { marker } = await mapReady();
    await waitFor(() => expect(marker.options.element.getAttribute('aria-label')).toBe('pin'));
    expect(marker.options.element.getAttribute('role')).toBe('img');
  });

  it('keeps a pin moved while a short link was still resolving', async () => {
    const pending = deferred();
    const { onChange } = renderStateful({ map, resolveShortLink: () => pending.promise });
    const { marker } = await mapReady();
    const input = screen.getByLabelText('paste');
    fireEvent.change(input, { target: { value: 'https://maps.app.goo.gl/abc123' } });
    fireEvent.blur(input);
    expect(screen.getByText('resolving')).toBeDefined();
    act(() => {
      marker.setLngLat({ lng: 37.04, lat: 36.58 });
      marker.fire('dragend');
    });
    await act(async () => pending.resolve({ coordinates: azaz }));
    expect(onChange.mock.calls).toEqual([[{ latitudeE7: 365_800_000, longitudeE7: 370_400_000 }]]);
    expect(input).toHaveProperty('value', '36.58, 37.04');
    expect(screen.queryByText('resolving')).toBeNull();
  });

  it('keeps a click on the current point over a short link still resolving', async () => {
    const pending = deferred();
    const { onChange } = renderStateful({
      map,
      initial: azaz,
      resolveShortLink: () => pending.promise,
    });
    const { created } = await mapReady();
    const input = screen.getByLabelText('paste');
    fireEvent.change(input, { target: { value: 'https://maps.app.goo.gl/abc123' } });
    fireEvent.blur(input);
    act(() => created.fire('click', { lngLat: { lng: 37.0453, lat: 36.5864 } }));
    await act(async () =>
      pending.resolve({ coordinates: { latitudeE7: 366_000_000, longitudeE7: 371_000_000 } }),
    );
    expect(onChange.mock.calls).toEqual([[azaz]]);
  });

  it('moves the view back to a point pasted again after the pin was there', async () => {
    renderStateful({ map });
    const { created } = await mapReady();
    const input = screen.getByLabelText('paste');
    act(() => created.fire('click', { lngLat: { lng: 37.04, lat: 36.58 } }));
    expect(created.eased).toEqual([]);
    fireEvent.change(input, { target: { value: '36.6, 37.1' } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: '36.58, 37.04' } });
    fireEvent.blur(input);
    expect(created.eased).toEqual([
      { center: [37.1, 36.6], zoom: 16 },
      { center: [37.04, 36.58], zoom: 16 },
    ]);
  });

  it('falls back to the paste field when the tiles fail to load', async () => {
    const { onChange } = setup({ map });
    const { created } = await mapReady();
    act(() => created.fire('error', { error: new Error('tiles') }));
    expect(screen.queryByText('© OpenStreetMap')).toBeNull();
    expect(created.removed).toBe(true);
    const input = screen.getByLabelText('paste');
    fireEvent.change(input, { target: { value: '36.5864,37.0453' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(azaz);
  });

  it('keeps the map after it has loaded', async () => {
    setup({ map });
    const { created } = await mapReady();
    act(() => {
      created.fire('load');
      created.fire('error', { error: new Error('one tile') });
    });
    expect(screen.getByText('© OpenStreetMap')).toBeDefined();
  });
});
