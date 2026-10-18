import type { Coordinates } from '@vertex-shifa/contracts';
import type { MapConfig } from '@vertex-shifa/ui';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

/**
 * The map of the location pickers (ADR 0023), from the build's `VITE_MAP_*` variables. Unset (local
 * development without the extract, CI), the pickers show the paste field only.
 */
export const mapConfig: MapConfig | undefined =
  import.meta.env.VITE_MAP_STYLE_URL &&
  import.meta.env.VITE_MAP_TILES_URL &&
  import.meta.env.VITE_MAP_GLYPHS_URL
    ? {
        styleUrl: import.meta.env.VITE_MAP_STYLE_URL,
        tilesUrl: import.meta.env.VITE_MAP_TILES_URL,
        glyphsUrl: import.meta.env.VITE_MAP_GLYPHS_URL,
        workerUrl,
      }
    : undefined;

/**
 * Where the map opens before a pin is set: Azaz. Areas carry no coordinates, so the map cannot
 * open on the chosen city yet.
 */
export const defaultMapCenter: Coordinates = { latitudeE7: 365_866_000, longitudeE7: 370_469_000 };
