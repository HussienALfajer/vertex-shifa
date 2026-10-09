# 0023 — Maps: OpenStreetMap served by us, coordinates owned by us

Status: Accepted · Date: 2026-10-10

## Context
Branches need a location (F01) that patients use to find the clinic and get directions, and the patient app shows a map of every listed clinic with filters (F25). The clinic app, the public site, the console and the patient app all show maps.

The owner first chose Google Maps Platform (S01 interview, 2026-10-10). Every Google Maps product, including the free ones (native mobile maps, Maps Embed), needs a Google Cloud billing account. Opening one failed for the owner: the payment page did not load, and creating a new billing account was refused with `OR_BACR2_59`, a refusal by Google's verification for which Google publishes no fix. Community reports in 2026 say Google still blocks payments from Syria. The owner then chose OpenStreetMap, keeping Google as a later option (2026-10-10).

## Decision
- **Maps:** OpenStreetMap data as vector tiles in one Protomaps (PMTiles) file covering Syria and Turkey, served by our own gateway with HTTP range requests, together with the style, the sprites and the glyphs (fonts with Arabic). No third-party tile service, no account, no key, no quota; no Cloudflare (ADR 0015).
- **Rendering:** MapLibre GL JS on the web (clinic app, site, console) and MapLibre native in the patient app (library confirmed in S19). Arabic labels where the data has them, with the RTL text plugin bundled into the app, never loaded from a CDN. Every map shows the "© OpenStreetMap" attribution (ODbL).
- **One component per platform:** a map component in `packages/ui` and one in `packages/ui-native` hide the provider. Screens and data never depend on MapLibre or OpenStreetMap, so moving to Google Maps later (when a billing account exists) is a new component implementation plus keys, with no change to data, screens or the API. Mixing providers (for example a Google satellite layer) follows the same path.
- **We own the data:** a location is stored as integer coordinates (`latitude_e7`, `longitude_e7`, degrees × 10⁷), never as a provider's place id.
- **Input without the map:** a pasted Google Maps link (short links resolved by the API, only to Google hosts on an allow list) or `latitude, longitude` text always works, so a missing or failing map never blocks saving.
- **Directions:** a link that opens the user's maps app (Google Maps, Apple Maps or another) with the coordinates; no API call, no key. No route drawing or travel times inside our apps in V1.
- **Patient app clinic map (F25):** markers per branch with our own images, clustering in the map library, distance computed on the phone from the patient's location, which never leaves the phone.
- **No search of places or addresses** (geocoding) in V1: governorate and city come from our list, the exact place from the pin.
- **Configuration:** the tile, style and glyph URLs come from configuration. Without them (local development, CI) the map component shows the paste field only.
- **Clinic app:** the Electron CSP is widened only for our map host and the blob workers MapLibre needs; the map appears only on online-only settings screens.

## Consequences
- No vendor account or bill for maps; no risk of a provider blocking Syrian users.
- No free satellite imagery, and small streets and shops in Azaz may be less complete than on Google; Vertex can add missing data to OpenStreetMap itself.
- Our servers serve the tiles: the PMTiles file (hundreds of megabytes) and its traffic are part of hosting (Q1, ADR 0017), and the file is refreshed from new Protomaps builds a few times a year.
- Offline maps become possible later (cached tiles on clinic devices, offline packs in the patient app).
