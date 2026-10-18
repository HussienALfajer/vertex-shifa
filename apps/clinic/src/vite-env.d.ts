/// <reference types="vite/client" />

/** The renderer's build-time configuration; the Electron main process reads the same variables. */
interface ImportMetaEnv {
  /** The API's origin; unset, requests go to the renderer's own origin (E2E, a dev proxy). */
  readonly VITE_API_URL?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_MAP_TILES_URL?: string;
  readonly VITE_MAP_GLYPHS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
