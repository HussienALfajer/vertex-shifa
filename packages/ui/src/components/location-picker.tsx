'use client';

import {
  type Coordinates,
  coordinatesFromDegrees,
  coordinatesToDegrees,
  parseMapLocation,
} from '@vertex-shifa/contracts';
import { MapPin } from 'lucide-react';
import type { Map as MapLibreMap, Marker, StyleSpecification } from 'maplibre-gl';
import {
  type ComponentProps,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn';
import { Field, FieldDescription, FieldError, FieldLabel } from './field';
import { Input } from './input';

/**
 * Where the map comes from (ADR 0023): our own OpenStreetMap vector tiles in one PMTiles file,
 * with the style, sprites and glyphs beside it. The app builds it from its configuration; without
 * it the picker shows the paste field only.
 */
type MapConfig = {
  /** A MapLibre style. Its vector sources are pointed at `tilesUrl`, its glyphs at `glyphsUrl`. */
  styleUrl: string;
  /** The PMTiles file, read with HTTP range requests. */
  tilesUrl: string;
  /** The glyph template, with `{fontstack}` and `{range}`. */
  glyphsUrl: string;
  /**
   * MapLibre's worker script served by the app itself (in Vite:
   * `maplibre-gl/dist/maplibre-gl-worker.mjs?url`), so the CSP needs no blob workers.
   */
  workerUrl: string;
};

/** What the app's resolver of short links (`POST /api/maps/resolve-link`) answers, translated. */
type ShortLinkResult = { coordinates: Coordinates } | { error: string };

type LocationPickerLabels = {
  /** The map's accessible name. */
  map: string;
  /** The pin's accessible name. */
  pin: string;
  /** The paste field's label. */
  paste: string;
  pasteDescription: string;
  resolving: string;
  /** Shown when the pasted text is neither coordinates nor a Google Maps link with them. */
  unrecognized: string;
};

type LocationPickerProps = Omit<ComponentProps<'div'>, 'onChange'> & {
  /** Unset (local development, CI): the paste field only. */
  map?: MapConfig | undefined;
  /** Where the map opens without a location: the chosen city. */
  center: Coordinates;
  value?: Coordinates | undefined;
  onChange: (coordinates: Coordinates) => void;
  /**
   * `false` while the paste field holds text that is not `value`: refused, a link still resolving,
   * or emptied while a location is set. The form refuses to save then, so it never saves the previous location as the edit.
   */
  onSettledChange?: (settled: boolean) => void;
  resolveShortLink: (url: string) => Promise<ShortLinkResult>;
  labels: LocationPickerLabels;
  disabled?: boolean;
};

/**
 * A location picked with a pin on the map or pasted as a Google Maps link or `latitude, longitude`
 * text (S01). Screens never see the map provider: they pass coordinates in and get coordinates out,
 * so another provider is a new implementation of this component only (ADR 0023). When the map is
 * not configured or does not load, the paste field still sets the location.
 */
function LocationPicker({
  map,
  center,
  value,
  onChange,
  onSettledChange,
  resolveShortLink,
  labels,
  disabled = false,
  className,
  ...props
}: LocationPickerProps) {
  const [mapFailed, setMapFailed] = useState(false);
  /**
   * Counts the owner's choices (a pin moved, the field edited or applied): a short link resolves
   * into the location only if no newer choice was made while it was resolving.
   */
  const choice = useRef(0);
  return (
    <div data-slot="location-picker" className={cn('flex flex-col gap-3', className)} {...props}>
      {map && !mapFailed && (
        <LocationMap
          config={map}
          center={center}
          value={value}
          onChange={(coordinates) => {
            choice.current += 1;
            onChange(coordinates);
          }}
          onFail={() => setMapFailed(true)}
          labels={labels}
          disabled={disabled}
        />
      )}
      <PasteField
        choice={choice}
        value={value}
        onChange={onChange}
        onSettledChange={onSettledChange}
        resolveShortLink={resolveShortLink}
        labels={labels}
        disabled={disabled}
      />
    </div>
  );
}

/** Without a `load` by then, the map counts as failed and the picker keeps the paste field only. */
const LOAD_TIMEOUT_MS = 10_000;
const CITY_ZOOM = 13;
const PIN_ZOOM = 16;

type MapLibre = typeof import('maplibre-gl');

let tilesProtocolAdded = false;

/** MapLibre and its stylesheet load with the first map, not with every screen of the app. */
async function loadMapLibre(): Promise<MapLibre> {
  const [maplibre, { Protocol }] = await Promise.all([
    import('maplibre-gl'),
    import('pmtiles'),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ]);
  if (!tilesProtocolAdded) {
    maplibre.addProtocol('pmtiles', new Protocol().tile);
    tilesProtocolAdded = true;
  }
  return maplibre;
}

/** The style as served, pointed at our tiles and glyphs; its sources' attributions are ours to show. */
function pointStyleAt(style: StyleSpecification, { tilesUrl, glyphsUrl }: MapConfig) {
  const sources = Object.fromEntries(
    Object.entries(style.sources).map(([id, source]) => {
      if (source.type !== 'vector') return [id, source];
      const { tiles: _tiles, attribution: _attribution, ...rest } = source;
      return [id, { ...rest, url: `pmtiles://${tilesUrl}` }];
    }),
  );
  return { ...style, sources, glyphs: glyphsUrl } satisfies StyleSpecification;
}

function degrees(coordinates: Coordinates): [longitude: number, latitude: number] {
  const [latitude, longitude] = coordinatesToDegrees(coordinates);
  return [longitude, latitude];
}

function same(a: Coordinates | undefined, b: Coordinates | undefined): boolean {
  return a?.latitudeE7 === b?.latitudeE7 && a?.longitudeE7 === b?.longitudeE7;
}

type LocationMapProps = {
  config: MapConfig;
  center: Coordinates;
  value: Coordinates | undefined;
  onChange: (coordinates: Coordinates) => void;
  onFail: () => void;
  labels: LocationPickerLabels;
  disabled: boolean;
};

function LocationMap({
  config,
  center,
  value,
  onChange,
  onFail,
  labels,
  disabled,
}: LocationMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ map: MapLibreMap; marker: Marker; pin: HTMLElement }>();
  /** The last point the map itself reported, so it does not fly to a point the owner just set. */
  const reported = useRef<Coordinates>(undefined);
  const shown = useRef<typeof view>(undefined);
  const latest = useRef({ center, value, onChange, onFail, labels, disabled });
  useLayoutEffect(() => {
    latest.current = { center, value, onChange, onFail, labels, disabled };
  });

  const { styleUrl, tilesUrl, glyphsUrl, workerUrl } = config;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let loaded = false;
    let created: MapLibreMap | undefined;
    const fail = () => {
      if (!disposed && !loaded) latest.current.onFail();
    };
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS);

    const report = (longitude: number, latitude: number) => {
      const coordinates = coordinatesFromDegrees(latitude, longitude);
      if (!coordinates) return;
      reported.current = coordinates;
      latest.current.onChange(coordinates);
    };

    loadMapLibre()
      .then((maplibre) => {
        if (disposed) return;
        const { center, value, labels, disabled } = latest.current;
        maplibre.setWorkerUrl(workerUrl);
        const map = new maplibre.Map({
          container: element,
          center: degrees(value ?? center),
          zoom: value ? PIN_ZOOM : CITY_ZOOM,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          locale: { 'Map.Title': labels.map },
        });
        created = map;
        map.on('load', () => {
          loaded = true;
          clearTimeout(timer);
        });
        map.on('error', fail);
        map.setStyle(styleUrl, {
          transformStyle: (_previous, next) =>
            pointStyleAt(next, { styleUrl, tilesUrl, glyphsUrl, workerUrl }),
        });

        const pin = document.createElement('div');
        const marker = new maplibre.Marker({ element: pin, anchor: 'bottom', draggable: !disabled })
          .setLngLat(degrees(value ?? center))
          .addTo(map);
        marker.on('dragend', () => {
          const { lng, lat } = marker.getLngLat();
          report(lng, lat);
        });
        map.on('click', (event) => {
          if (latest.current.disabled) return;
          marker.setLngLat(event.lngLat);
          report(event.lngLat.lng, event.lngLat.lat);
        });
        setView({ map, marker, pin });
      })
      .catch(fail);

    return () => {
      disposed = true;
      clearTimeout(timer);
      created?.remove();
      setView(undefined);
    };
  }, [styleUrl, tilesUrl, glyphsUrl, workerUrl]);

  // A location set outside the map (pasted, or another city chosen) moves the pin and the view.
  const point = value ?? center;
  const { latitudeE7, longitudeE7 } = point;
  const hasValue = value !== undefined;
  useEffect(() => {
    if (!view) return;
    const target = { latitudeE7, longitudeE7 };
    view.marker.setLngLat(degrees(target));
    // A new map already opens on the point; a point the map reported is already in view.
    if (shown.current !== view) {
      shown.current = view;
      return;
    }
    const fromMap = same(target, reported.current);
    reported.current = undefined;
    if (fromMap) return;
    view.map.easeTo({ center: degrees(target), zoom: hasValue ? PIN_ZOOM : CITY_ZOOM });
  }, [view, latitudeE7, longitudeE7, hasValue]);

  useEffect(() => {
    view?.marker.setDraggable(!disabled);
  }, [view, disabled]);

  // MapLibre names only its default marker; ours is named here. The paste field is the keyboard
  // way to set the location.
  useEffect(() => {
    view?.pin.setAttribute('role', 'img');
    view?.pin.setAttribute('aria-label', labels.pin);
  }, [view, labels.pin]);

  return (
    <div
      data-slot="location-map"
      className="relative h-72 overflow-hidden rounded-md border border-border bg-muted"
    >
      <div ref={container} className="size-full" />
      {view &&
        createPortal(
          <MapPin
            aria-hidden
            className={cn(
              'size-9 fill-surface',
              value ? 'text-primary' : 'text-muted-foreground',
              !disabled && 'cursor-grab',
            )}
          />,
          view.pin,
        )}
      {/* The ODbL attribution every map shows (ADR 0023): the provider's, so not a label. */}
      <p
        dir="ltr"
        className="pointer-events-none absolute end-0 bottom-0 rounded-ss-md bg-surface px-1.5 text-xs text-muted-foreground"
      >
        © OpenStreetMap
      </p>
    </div>
  );
}

function formatDegrees(coordinates: Coordinates): string {
  const [latitude, longitude] = coordinatesToDegrees(coordinates);
  return `${latitude}, ${longitude}`;
}

type PasteFieldProps = {
  choice: RefObject<number>;
  value: Coordinates | undefined;
  onChange: (coordinates: Coordinates) => void;
  onSettledChange: ((settled: boolean) => void) | undefined;
  resolveShortLink: (url: string) => Promise<ShortLinkResult>;
  labels: LocationPickerLabels;
  disabled: boolean;
};

/** A Google Maps link or `latitude, longitude` text, parsed with the contract parser. */
function PasteField({
  choice,
  value,
  onChange,
  onSettledChange,
  resolveShortLink,
  labels,
  disabled,
}: PasteFieldProps) {
  const id = useId();
  const [text, setText] = useState(() => (value ? formatDegrees(value) : ''));
  const [error, setError] = useState<string>();
  const [resolving, setResolving] = useState(false);
  /** The text applied or resolving now, so a blur after Enter does not apply it twice. */
  const applied = useRef<string | undefined>(text);
  /** Set by a paste: the change that follows applies the field's new text. */
  const pasted = useRef(false);

  // Told when the picker appears and on every change, and settled when it goes (a step left, a
  // form discarded), so the form's flag never outlives the field it describes. An emptied field
  // does not clear a location either.
  const settled = error === undefined && !resolving && (value === undefined || text.trim() !== '');
  const reported = useRef<boolean>(undefined);
  const report = useRef(onSettledChange);
  useEffect(() => {
    report.current = onSettledChange;
  }, [onSettledChange]);
  useEffect(() => {
    if (settled === reported.current) return;
    reported.current = settled;
    report.current?.(settled);
  }, [settled]);
  useEffect(
    () => () => {
      if (reported.current === false) report.current?.(true);
    },
    [],
  );

  // A location set elsewhere (the pin moved on the map, or cleared by the screen) shows here, and
  // wins over a short link still resolving.
  const latitudeE7 = value?.latitudeE7;
  const longitudeE7 = value?.longitudeE7;
  useEffect(() => {
    const coordinates =
      latitudeE7 === undefined || longitudeE7 === undefined
        ? undefined
        : { latitudeE7, longitudeE7 };
    const parsed = parseMapLocation(applied.current ?? '');
    if (!coordinates && applied.current === '') return;
    if (coordinates && parsed?.kind === 'coordinates' && same(parsed.coordinates, coordinates)) {
      return;
    }
    choice.current += 1;
    const shown = coordinates ? formatDegrees(coordinates) : '';
    applied.current = shown;
    setText(shown);
    setResolving(false);
    setError(undefined);
  }, [choice, latitudeE7, longitudeE7]);

  // A short link resolving after the picker is gone sets nothing.
  useEffect(
    () => () => {
      choice.current += 1;
    },
    [choice],
  );

  async function apply(input: string) {
    const trimmed = input.trim();
    if (trimmed === applied.current) return;
    applied.current = trimmed;
    const current = ++choice.current;
    setError(undefined);
    setResolving(false);
    if (trimmed === '') return;
    const location = parseMapLocation(trimmed);
    if (!location) {
      applied.current = undefined;
      setError(labels.unrecognized);
      return;
    }
    if (location.kind === 'coordinates') {
      onChange(location.coordinates);
      return;
    }
    setResolving(true);
    const result = await resolveShortLink(location.url).catch(
      (): ShortLinkResult => ({ error: labels.unrecognized }),
    );
    if (current !== choice.current) return;
    setResolving(false);
    if ('coordinates' in result) {
      onChange(result.coordinates);
      return;
    }
    // A failed link may be tried again as it is (the connection may be back).
    applied.current = undefined;
    setError(result.error);
  }

  function onValueChange(next: string) {
    setText(next);
    if (pasted.current) {
      pasted.current = false;
      void apply(next);
    } else if (next.trim() !== applied.current) {
      // Editing the field is a newer choice than a link still resolving.
      choice.current += 1;
      applied.current = undefined;
      setResolving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void apply(event.currentTarget.value);
  }

  return (
    <Field invalid={error !== undefined} disabled={disabled}>
      <FieldLabel htmlFor={id}>{labels.paste}</FieldLabel>
      <Input
        id={id}
        dir="ltr"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={text}
        onValueChange={onValueChange}
        onBlur={(event) => void apply(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        onPaste={() => {
          // The change follows in the same task; a paste that changes nothing must not leave
          // the flag for the next keystroke.
          pasted.current = true;
          setTimeout(() => {
            pasted.current = false;
          });
        }}
      />
      <FieldDescription>{resolving ? labels.resolving : labels.pasteDescription}</FieldDescription>
      <FieldError match={error !== undefined}>{error}</FieldError>
    </Field>
  );
}

export {
  LocationPicker,
  type LocationPickerLabels,
  type LocationPickerProps,
  type MapConfig,
  type ShortLinkResult,
};
