# 0018 — Brand and design system: the Vertex identity, "Vertex" always visible

Status: Accepted · Date: 2026-10-09

## Context
The owner wants one visual identity, one set of components and one design system across all Vertex systems. Vertex Hub holds the reference identity (Vertex Media logo, colors, typography, the 60° motif) and a design system in `packages/ui`. The product name is Vertex Shifa (owner, 2026-10-09), and "Vertex" must always be visible to customers.

## Decision
- **Identity:** exactly the Vertex Hub identity (`D:\vertex-hub\brand\identity.md`): Vertex Green `#004139`, Vertex Sand `#B9A87A`, the tonal and status scales, typography, the 60° diagonal motif, the spacing grid, flat surfaces, light and dark themes.
- **Logo:** the Vertex Hub logo unchanged, with the word **MEDIA** replaced by **SHIFA** in the same typeface, tracking and position (both words have five letters, so the composition keeps its balance). Variants follow Vertex Hub's set (green, gold, white; mark, logo, favicon, app icons).
- **Components:** Vertex Hub's `packages/ui` components are copied into `packages/ui` and adapted where the clinic system needs it; new components are added in the same spirit (queue board and waiting-room display, odontogram, form engine fields, print templates, patient card, visit timeline, sync status). `packages/tokens` holds the tokens shared by `packages/ui` (web) and `packages/ui-native` (patient app).
- **Copy, never import:** Vertex Hub is read only (`AGENTS.md`), at the brand phase in Phase 0; nothing is imported across repositories.
- **Naming:** every product name starts with "Vertex Shifa" (Vertex Shifa Clinic, Vertex Shifa Lab, Vertex Shifa Pharmacy, Vertex Shifa Hospital); the patient app is "Vertex Shifa" in both stores; the Arabic name is "فيرتكس شفا".
- **Vertex always visible:** clinic-branded pages and prints carry the clinic's identity and always show "Powered by Vertex Shifa", which a tenant cannot remove.
- **UI rules:** Arabic-first RTL, logical CSS only, Latin digits, design-system components and tokens only, patterns to avoid listed in `brand/identity.md` when it arrives.

## Consequences
- The brand phase (Phase 0) creates `brand/` (identity, logo files) and the design-system packages from Vertex Hub.
- Changes to the shared identity should be made in Vertex Hub first and copied, so the Vertex systems do not drift apart.
