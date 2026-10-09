# S01 — Tenancy and clinic setup

Status: Approved · Date: 2026-10-10 · Features: `docs/product/v1-scope.md` F01 · ADRs: 0004, 0005, 0008, 0013, 0014, 0016, 0018, 0020, 0021, 0023

## Summary
Every clinic on the platform is a tenant with one or more branches (facilities), from a solo doctor to a multi-branch center, in one model (ADR 0004). V1 lets Vertex staff create a tenant, lets the clinic owner finish an onboarding wizard in the clinic app (name, logo, address with a location on the map, contact phones, default currency, working days, waiting-room display options), and lets the owner add, edit and archive branches. It is the first platform module and the pattern every later API module copies.

## In scope / out of scope
- In:
  - Tables `tenants`, `tenant_logos`, `facilities`, `areas` (seeded), their RLS, grants, convention-test entries and audit.
  - Tenant states and transitions; the onboarding wizard; clinic profile and branch settings screens in the clinic app; branch archive and restore.
  - Console API routes to create and list tenants and change their status (screens in S22), and an API CLI that does the same for Vertex staff until S22.
  - Location by a pin on the OpenStreetMap map (the map component of `packages/ui`, ADR 0023), or a pasted Google Maps link or coordinates; the logo upload, re-encoded on the server.
  - The web map component in `packages/ui` (MapLibre, provider-neutral props: center, pin, on-change, attribution), configured by tile, style and glyph URLs; the clinic app's CSP widened for the map host and blob workers only (ADR 0023). Local development points the URLs at a small extract of the Azaz area, documented in `packages/ui/CLAUDE.md`.
  - Contracts: tenant, facility, area, phone number (Syrian and Turkish, shared with S02), working days, coordinates, the new error codes; i18n texts.
- Out (later or never):
  - Owner account, invitation by phone, sign-in, roles and the permission catalog: S02. S01 only names the permissions it needs.
  - Replicating tenant and branch rows to clinic devices: S04 (S01 states what is replicated).
  - Branch-count limit and the global read-only enforcement of suspended tenants: S05.
  - Working hours per practitioner role and visit types: S07. Holidays and closures: S07.
  - Waiting-room display screens and the per-screen choice of branch or doctor: S10.
  - Public slug, subdomain, public page and the map on it: S21. Patient app clinic discovery and its map: S19.
  - Serving the full Syria and Turkey tile file on a server: the deploy skeleton (Q1). The native map component: S19.
  - Console screens for tenants: S22. Export of a tenant's data: S06.
  - Units (departments, ADR 0004): not in V1 until a spec needs them.
  - Self sign-up by doctors and trials without Vertex staff: not in V1.
  - Time zones per branch: V1 is `Asia/Damascus` everywhere.

## Access and entitlements
Permissions named here are added to the S02 permission catalog and role presets. Until S02 (sessions) every staff and console route is refused by the fail-closed guard with `UNAUTHENTICATED`; S01 tests the rules through the service with a tenant context, and S02 adds the per-endpoint HTTP cases (success, 403, another tenant) for these routes. No session stub or bypass is added.

| Action | Surface | Who (permission) | Feature key |
|---|---|---|---|
| Read own tenant, branches, logo, areas | Clinic app | Every staff role (`tenant.read`) | none (`@NoFeature()`) |
| Edit clinic profile and logo; complete onboarding | Clinic app | Owner only (`tenant.manage`, not grantable) | none |
| Add, archive, restore a branch | Clinic app | Owner only (`tenant.manage`) | none; branch limit `branches` from S05 |
| Edit a branch's settings | Clinic app | Owner, or staff granted `facility.manage` for that branch (branch-scoped, grantable by the owner in S02) | none |
| Resolve a pasted Google Maps link | Clinic app | `tenant.manage` or `facility.manage` | none |
| List tenants | Console API, CLI | Platform staff (`tenants.read`) | none |
| Create a tenant | Console API, CLI | Platform staff (`tenants.create`) | none |
| Suspend, reactivate, close a tenant | Console API, CLI | Platform staff (`tenants.change-status`) | none |
| List or hide a tenant in the patient app directory and map | Console API, CLI | Platform staff (`tenants.manage-directory`) | none |

Clinic setup belongs to every package, so tenancy routes declare `@NoFeature()`. From S05, `POST /api/facilities` also checks the tenant's `branches` limit (an S05 acceptance item).

## Data
All tables follow `packages/db/CLAUDE.md`: UUIDv7 `id`, `created_at`, `updated_at`, `archived_at` (business kind), a `tableRegistry` entry with module `tenancy`.

### `tenants` (scope `platform`, kind `business`)
The tenant registry (ADR 0004 tenant catalog). Platform scope because the console lists tenants across tenants and later the public site and patient app resolve them; it holds no medical or personal data. Only the tenancy module reads or writes it, and clinic routes only touch the row whose `id` is the session's tenant.

| Field | Type | Required | Constraints |
|---|---|---|---|
| `id` | uuid | yes | UUIDv7; also the tenant id used in RLS |
| `name_ar` | text | yes | trimmed, 2–100 characters |
| `name_latin` | text | no | trimmed, 2–100 characters, Latin letters, digits, spaces, `-`, `'`, `&`, `.` |
| `status` | text | yes | `onboarding`, `active`, `suspended`, `closed`; default `onboarding` |
| `status_changed_at` | timestamptz | yes | |
| `onboarding_completed_at` | timestamptz | no | set once, when the wizard completes |
| `directory_listed` | boolean | yes | default `false`; set only by Vertex staff (owner, 2026-10-10) |
| `data_location` | text | yes | `pool` only in V1 (silo option, ADR 0004) |
| `created_at`, `updated_at`, `archived_at` | timestamptz | | `archived_at` is set when the tenant is closed |

Index: `(status)`. App role: `SELECT, INSERT, UPDATE`.

### `tenant_logos` (scope `tenant`, kind `business`)
The clinic logo, stored in PostgreSQL because it is small, prints offline once replicated (S04), and no object storage exists yet. At most one row per tenant is not archived; replacing a logo archives the old row.

| Field | Type | Required | Constraints |
|---|---|---|---|
| `tenant_id` | uuid | yes | RLS |
| `content_type` | text | yes | `image/png` (always, after re-encoding) |
| `bytes` | bytea | yes | at most 262,144 bytes |
| `byte_size`, `width`, `height` | integer | yes | width and height 16–512 |
| `sha256` | text | yes | hex of `bytes` |

Unique partial index `(tenant_id) where archived_at is null`. App role: `SELECT, INSERT, UPDATE`.

### `facilities` (scope `tenant`, kind `business`)
A branch (ADR 0004). Type `clinic` in V1.

| Field | Type | Required | Constraints |
|---|---|---|---|
| `tenant_id` | uuid | yes | RLS; `unique (tenant_id, id)` for composite foreign keys |
| `type` | text | yes | `clinic` |
| `name` | text | yes | trimmed, 2–100 characters; the first branch takes the clinic's Arabic name |
| `area_id` | uuid | yes | references `areas(id)`; level `city` (the street-level place is the map pin and `address_details`) |
| `address_details` | text | yes | 2–200 characters (neighborhood, street, building, floor, landmark) |
| `latitude_e7`, `longitude_e7` | integer | yes | degrees × 10⁷ (no floats, ADR 0020); −900000000…900000000 and −1800000000…1800000000 |
| `contact_phones` | jsonb | yes | array of 1–3 `{ phone, whatsapp }`; `phone` E.164, unique within the array; checked by the contract and a `jsonb_array_length` check |
| `default_currency` | text | yes | `USD`, `TRY`, `SYP` (ADR 0014) |
| `working_days` | smallint | yes | bitmask, bit 0 = Saturday … bit 6 = Friday; 1–127 (at least one day); default 63 (Saturday–Thursday) |
| `display_name_format` | text | yes | `ticket_only` (default) or `first_name_father_initial` |
| `display_call_sound` | boolean | yes | default `true` |

Indexes: `(tenant_id, archived_at)`, `(tenant_id, area_id)` (foreign key). App role: `SELECT, INSERT, UPDATE` (no `DELETE`; archive instead).

### `areas` (scope `platform`, kind `business`)
Reference list for addresses and, later, discovery by city (F25). Two levels; no neighborhoods (the map pin locates the branch).

| Field | Type | Required | Constraints |
|---|---|---|---|
| `parent_id` | uuid | for `city` | references `areas(id)`, indexed |
| `level` | text | yes | `governorate`, `city`; a city's parent is a governorate |
| `name_ar` | text | yes | unique per parent |
| `name_latin` | text | yes | unique per parent |
| `position` | integer | yes | sort order within the parent |

Seeded by a custom migration: Syria's 14 governorates and the cities and towns of Aleppo governorate (synthetic data rules do not apply: these are public place names). Vertex staff add cities through migrations until S22. App role: `SELECT` only.

### Shapes in `packages/contracts/src/tenancy.ts`
`tenantStatusSchema`, `tenantSchema`, `createTenantSchema`, `changeTenantStatusSchema`, `setTenantDirectoryListingSchema`, `updateTenantProfileSchema`, `tenantLogoSchema`, `facilitySchema`, `createFacilitySchema`, `updateFacilitySchema`, `areaSchema`, `workingDaysSchema` (with the bitmask codec and Saturday-first order), `coordinatesSchema` (with the e7 codec and the Google Maps link parser), and `phoneNumberSchema` in `packages/contracts/src/phone.ts` (Syrian `+963` and Turkish `+90` numbers, mobile or landline, normalized to E.164 from local forms such as `09…` and `05…`; `whatsapp` allowed only on mobile numbers).

## States and rules
Tenant states:

| From | To | Trigger |
|---|---|---|
| (new) | `onboarding` | Vertex staff create the tenant (console or CLI) |
| `onboarding` | `active` | The owner completes the wizard (`POST /api/tenant/onboarding/complete`) |
| `active` | `suspended` | Vertex staff, with a reason (non-payment or other, ADR 0013) |
| `suspended` | `active` | Vertex staff, with a reason |
| `onboarding`, `active`, `suspended` | `closed` | Vertex staff, with a reason; sets `archived_at` |

`closed` is final in S01. S22 adds `closed → suspended` for a returning customer (owner, 2026-10-10), so the contract is renewed before reactivation. No other transition exists.

Rules:
1. A tenant is created with `name_ar` (and optionally `name_latin`) in `onboarding`; its first branch is created by the wizard, not at creation.
2. Onboarding completes only when `name_ar` is set and at least one branch is not archived and valid (area, address details, coordinates, at least one phone, currency, working days); otherwise `ONBOARDING_INCOMPLETE`. Completing it twice returns the tenant unchanged (idempotent).
3. Every wizard step saves to the server when the owner moves on, so the owner can stop and resume on any device.
4. While `onboarding`, the clinic app shows the wizard to the owner and a "clinic setup in progress" screen to any other staff member; no other clinic work is possible (later specs check `status = active` for their writes).
5. While `suspended` or `closed`, tenancy writes are refused with `TENANT_SUSPENDED` or `TENANT_CLOSED`; reads stay allowed (ADR 0013: read-only plus export). S05 extends this to every write.
6. A tenant is never deleted; nor is a branch. Archiving a branch hides it from new work; its records stay readable.
7. The last branch that is not archived cannot be archived (`LAST_ACTIVE_FACILITY`). From S02 and S09, a branch with registered devices that are not revoked or with upcoming appointments cannot be archived either (those specs add the checks).
8. An archived branch can be restored by the owner (subject to the S05 branch limit).
9. A single-branch tenant never sees the word "branch": the wizard asks for "the clinic" and its address, and branch lists and the branch picker appear only when two or more branches are not archived. Settings keep an "Add a branch" action.
10. `default_currency` is a default for new prices and invoices in that branch; changing it never converts or changes existing amounts (ADR 0014).
11. `working_days` defines the days the branch opens; S07 working hours fall within them. Calendars start the week on Saturday.
12. The waiting-room display shows the ticket number only, or the first name plus the first letter of the father's name ("محمد أ."); never the full name, never anything medical.
13. A location is required: picked on the map, or from a pasted Google Maps link or `latitude, longitude` text. Coordinates outside Syria and Turkey ask for confirmation but are allowed.
14. The logo is optional; uploads accept PNG, JPEG or WebP up to 2 MB, are decoded and re-encoded on the server to PNG with metadata stripped, scaled to fit 512 × 512, and refused (`FILE_REJECTED`) if they do not decode or exceed 262,144 bytes after re-encoding.
15. Only Vertex staff list or hide a tenant in the patient app directory and map (`directory_listed`, default `false`). A tenant appears only while it is `active` and listed; its branches that are not archived appear with their coordinates. The directory itself (list, map, filters) is built in S19 (F25).
16. Edits carry the `updated_at` the client last read; a stale value returns `CONFLICT` and the screen reloads with the current values (two owners or managers editing at once).

## Offline behavior and conflicts
Online only. Clinic structure and settings are configuration, which changes only online (ADR 0008); the map picker and logo upload also need the internet.
- The wizard and settings screens show an offline state ("needs an internet connection") and disable saving while offline; nothing is queued.
- From S04, the device's replication scope includes its tenant's row of `tenants`, the active `tenant_logos` row, the tenant's `facilities` (all branches, for names in pickers; settings of the device's branch) and the `areas` they reference, read-only, so headers, printouts and the waiting-room display work offline.
- No sync commands, number ranges or offline conflicts. Concurrent online edits are refused by rule 16.

## Clinical data and privacy
None. Tenant and branch data are business data. Contact phones are the clinic's public numbers, not patients'. The display-name format controls how much of a patient's name the waiting-room screen shows (rule 12), and the default is the ticket number only.

## Money
None. `default_currency` names a currency code only (ADR 0014); no amounts are stored.

## API and commands
Module `apps/api/src/modules/platform/tenancy/` (ADR 0020 anatomy): `tenancy.controller.ts`, `tenancy.console.controller.ts`, `tenancy.service.ts`, `index.ts`. No sync commands.

| Method and path | Access | Request | Response | Error codes |
|---|---|---|---|---|
| `GET /api/tenant` | Staff, `tenant.read` | — | `tenantSchema` | `UNAUTHENTICATED`, `FORBIDDEN` |
| `PATCH /api/tenant/profile` | Staff, `tenant.manage` | `updateTenantProfileSchema` | `tenantSchema` | `VALIDATION_FAILED`, `CONFLICT`, `TENANT_SUSPENDED`, `TENANT_CLOSED` |
| `PUT /api/tenant/logo` (multipart, field `file`) | Staff, `tenant.manage` | file ≤ 2 MB | `tenantLogoSchema` | `FILE_REJECTED`, `TENANT_SUSPENDED`, `TENANT_CLOSED` |
| `GET /api/tenant/logo` | Staff, `tenant.read` | — | `tenantLogoSchema` (base64 PNG, `sha256`) | `NOT_FOUND` |
| `DELETE /api/tenant/logo` (archives) | Staff, `tenant.manage` | — | `tenantSchema` | `NOT_FOUND`, `TENANT_SUSPENDED`, `TENANT_CLOSED` |
| `POST /api/tenant/onboarding/complete` | Staff, `tenant.manage` | — | `tenantSchema` | `ONBOARDING_INCOMPLETE`, `TENANT_SUSPENDED`, `TENANT_CLOSED` |
| `GET /api/facilities` | Staff, `tenant.read` | `archived` filter, list params | `{ items: facilitySchema[], total, page, pageSize }` | — |
| `GET /api/facilities/:id` | Staff, `tenant.read` | — | `facilitySchema` | `NOT_FOUND` (also for another tenant's id) |
| `POST /api/facilities` | Staff, `tenant.manage` | `createFacilitySchema` | `facilitySchema` | `VALIDATION_FAILED`, `TENANT_SUSPENDED`, `TENANT_CLOSED` (S05: `NOT_ENTITLED` at the limit) |
| `PATCH /api/facilities/:id` | Staff, `facility.manage` for that branch | `updateFacilitySchema` | `facilitySchema` | `VALIDATION_FAILED`, `CONFLICT`, `NOT_FOUND`, `TENANT_SUSPENDED`, `TENANT_CLOSED` |
| `POST /api/facilities/:id/archive` | Staff, `tenant.manage` | — | `facilitySchema` | `LAST_ACTIVE_FACILITY`, `NOT_FOUND` |
| `POST /api/facilities/:id/restore` | Staff, `tenant.manage` | — | `facilitySchema` | `NOT_FOUND` |
| `GET /api/areas` | Staff, `tenant.read` | `parentId` (absent = governorates) | `areaSchema[]` | — |
| `POST /api/maps/resolve-link` | Staff, `tenant.manage` or `facility.manage` | `{ url }` | `coordinatesSchema` | `MAP_LINK_UNRECOGNIZED`, `RATE_LIMITED` |
| `GET /api/console/tenants` | Console, `tenants.read` | `status` filter, list params | `{ items: tenantSchema[], … }` | — |
| `POST /api/console/tenants` | Console, `tenants.create` | `createTenantSchema` | `tenantSchema` | `VALIDATION_FAILED` |
| `POST /api/console/tenants/:id/status` | Console, `tenants.change-status` | `changeTenantStatusSchema` (`status`, `reason`) | `tenantSchema` | `INVALID_STATUS_TRANSITION`, `NOT_FOUND` |
| `POST /api/console/tenants/:id/directory` | Console, `tenants.manage-directory` | `setTenantDirectoryListingSchema` (`listed`, `reason`) | `tenantSchema` | `NOT_FOUND` |

New error codes in `packages/contracts/src/errors.ts` with Arabic texts: `TENANT_CLOSED` (403), `ONBOARDING_INCOMPLETE` (422), `INVALID_STATUS_TRANSITION` (409), `LAST_ACTIVE_FACILITY` (409), `FILE_REJECTED` (422), `MAP_LINK_UNRECOGNIZED` (422).

`POST /api/maps/resolve-link` parses coordinates from full Google Maps URLs on the server and follows short links (`maps.app.goo.gl`, `goo.gl/maps`) only to Google Maps hosts on an allow list, at most 3 redirects, 5-second timeout, 20 requests per minute per tenant; it never fetches any other host. Coordinates typed or in a full URL are parsed in the client with the same contract parser, without a request.

CLI (`apps/api/src/cli/`), for Vertex staff until the S22 screens, run with the API's `.env`: `tenant:create --name-ar <name> [--name-latin <name>] --reason <text>`, `tenant:list [--status <status>]`, `tenant:set-status <tenant-id> --status <status> --reason <text>`, `tenant:set-directory <tenant-id> --listed <true|false> --reason <text>`. It calls the same service as the console routes. S02 adds `--owner-phone` to `tenant:create` (owner invitation). The command is added to the `AGENTS.md` commands table.

## Jobs, events and notifications
None. No outbox events: nothing consumes tenancy changes yet (S05 and S04 add what they need). No push or WhatsApp messages.

## Screens
All in the clinic app, Arabic RTL, design-system components, online-only screens through TanStack Query (ADR 0020). Each has loading, error and offline states; the offline state explains that setup needs the internet and disables saving.

1. **Onboarding wizard** (`/setup`), owner, tenant `onboarding`. Steps with a progress indicator, each saved on "Next":
   1. Clinic: Arabic name (prefilled from creation), Latin name (optional, explained as "for your web address later"), logo upload with preview and remove.
   2. Location: governorate → city pickers, address details (neighborhood, street, building, landmark), the map (ADR 0023) with a draggable pin centered on the chosen city and the "© OpenStreetMap" attribution, a field to paste a Google Maps link or coordinates, contact phones (1–3, each with a WhatsApp toggle on mobile numbers).
   3. Working days (seven toggles, Saturday first, default Saturday–Thursday) and default currency (USD, TRY, SYP).
   4. Waiting-room display: name format (ticket number only, default, or first name and father's initial, with a sample) and call sound.
   5. Review: a summary with "Edit" per step, and "Finish setup".
   Empty state: none (the wizard always starts at the first incomplete step). Errors: the field errors from the contract; `ONBOARDING_INCOMPLETE` jumps to the missing step.
2. **Setup in progress** (`/setup`), any non-owner staff while `onboarding`: an explanation and "Sign out".
3. **Clinic settings** (`/settings/clinic`), owner: the step 1 fields, editable after onboarding. Staff with `tenant.read` only see them read-only.
4. **Branches** (`/settings/branches`), owner, shown only with two or more branches not archived, or after "Add a branch": the list with name, area and status; add, archive (with the `LAST_ACTIVE_FACILITY` message), restore; archived branches behind a filter.
5. **Branch settings** (`/settings/branches/:id`, or `/settings/location` for a single-branch tenant), owner or `facility.manage` on that branch: the step 2–4 fields and the branch name.
6. **Directory status** (in clinic settings), every staff member: "Shown in the Vertex Shifa app: yes / not yet", read-only, with "managed by Vertex".
7. **Suspended or closed banner** (app-wide), every staff member: "Your clinic account is read-only" with the reason category (no free text) and a contact line for Vertex; edit actions are disabled.

When the map tile URLs are not configured (local development, CI) or the tiles fail to load, the map component shows the paste-a-link-or-coordinates field only.

## Audit
Every change writes an audit entry in the same transaction (ADR 0016, configuration data), with ids only:
`tenant.created`, `tenant.status_changed` (the reason in `reason`), `tenant.directory_listing_changed` (the reason in `reason`), `tenant.profile_updated`, `tenant.onboarding_completed`, `tenant_logo.replaced`, `tenant_logo.archived`, `facility.created`, `facility.updated`, `facility.archived`, `facility.restored`. Console and CLI actions use `actor_kind` `platform` (console, from S02) or `system` (CLI). Reads are not audited (no medical data).

## Abuse and failure cases
- **Cross-tenant access:** `tenant_logos` and `facilities` use forced RLS; a branch id of another tenant returns `NOT_FOUND`; the `tenants` row used by clinic routes is always the session's tenant, never an id from the request.
- **Server-side request forgery through map links:** host allow list, redirect limit, timeout, no request body forwarded, rate limit.
- **Malicious image upload:** size limit before decoding, decode with a pixel limit, re-encode, metadata stripped, only PNG stored and served.
- **Map tiles unavailable** (server down, not configured): the paste field still sets the location; saving never depends on the map loading.
- **Abuse of our tile server:** tiles are static files behind the gateway's rate limits (ADR 0015); no key to steal.
- **Double submit of onboarding completion or tenant creation:** completion is idempotent; the console form and CLI create one tenant per call (the operator sees the new id).
- **Lost owner access during onboarding:** handled by S02 recovery (owner recovers through Vertex support, ADR 0005).
- **Status change by mistake:** every transition needs a reason and is audited; reactivation is one call.

## Edge cases
1. Two owners edit the same branch at once: the second save gets `CONFLICT` and reloads (rule 16).
2. The owner removes a working day that later has S07 working hours: S07 decides (warn and keep, or block); S01 only stores the days.
3. The city is not in the list: the owner asks Vertex, which adds it by migration (S22: from the console); until then the owner picks the nearest city and the pin gives the exact place.
4. An area is archived later: branches that reference it keep it and show it; pickers stop offering it.
5. A pasted short link resolves to a place without coordinates: `MAP_LINK_UNRECOGNIZED`, and the owner sets the pin on the map.
6. The tenant is suspended while the owner is in the wizard: the next save returns `TENANT_SUSPENDED` and the banner appears.
7. A tenant is closed while onboarding (the deal fell through): allowed; no branch may exist.
8. A phone appears twice in a branch's list: refused by the contract; the same phone in two branches is allowed.
9. A branch's default currency changes: existing amounts keep their currencies (rule 10).
10. The logo is removed: printouts and headers show the clinic name and the Vertex Shifa mark (ADR 0018).

## Open questions

## Acceptance
- **Owner checks now (S01):**
  1. Run `tenant:create --name-ar "عيادة تجريبية" --reason "test"` and `tenant:list`: the tenant appears in `onboarding`.
  2. Run `tenant:set-status <id> --status closed --reason "test"`, then `--status active`: the second is refused with `INVALID_STATUS_TRANSITION`.
  3. Review the RTL screenshots (light and dark) of every wizard step, the settings screens, the branch list, the read-only banner and the offline state.
- **Owner checks after S02 (sign-in):** created by CLI with `--owner-phone`, sign in as the owner, finish the wizard with a logo, a map pin and two phones; add a second branch and see the branch list appear; try to archive both branches; go offline and see the settings screens refuse to save; suspend the tenant by CLI and see the banner.
- **Tests:**
  - API now: every route answers 401 without a session; the architecture test sees each route's access, entitlement and schema; `openapi.json` regenerated.
  - Service (with a tenant context): every endpoint's success path, another tenant's branch or logo (`NOT_FOUND`), writes refused when `suspended` and `closed`, `CONFLICT` on a stale `updated_at`.
  - API after S02 (an S02 acceptance item): success, 403 (missing permission; `facility.manage` on another branch), another tenant, and console routes refused for staff sessions, over HTTP for every route above.
  - Unit (contracts): phone normalization (Syrian and Turkish, mobile and landline, local forms), working-days codec, coordinates codec and Google Maps URL parser (full URLs, `@lat,lng`, `q=`, `!3d…!4d…`, plain text), tenant transition table.
  - Service: onboarding completion rules, `LAST_ACTIVE_FACILITY`, logo re-encoding (oversize, wrong type, undecodable, metadata stripped), map link resolver (allow list, redirect limit, timeout) against a fake HTTP server.
  - Database: convention test passes for the new tables (RLS forced on `tenant_logos` and `facilities`, composite keys, grants); seed migration loads the areas.
  - CLI: create, list, status change, invalid transition, directory listing.
  - Service: a listed tenant that is suspended or closed is reported as not shown.
  - Unit (clinic app): the map component sets coordinates from a pin, shows the attribution, and falls back to the paste field without tile URLs.
  - E2E with a mocked API: the wizard end to end (no tile URLs, paste field), settings, branch list with one and two branches, offline state, read-only banner; RTL screenshots light and dark.
