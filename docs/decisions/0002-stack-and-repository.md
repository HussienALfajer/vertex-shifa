# 0002 — Stack and repository: TypeScript everywhere, one monorepo

Status: Accepted · Date: 2026-10-09

## Context
Claude Code writes the whole system (ADR 0019). One language across server, desktop, web and mobile lets contracts, validation, i18n and business rules be written once, and lets every session learn one set of patterns. The owner's other Vertex projects (Vertex Hub, Vertex Digital) run a proven TypeScript stack; staying on it keeps tools, skills and the design system shared across Vertex.

## Decision
- **Repository:** one public GitHub repository, pnpm workspaces + Turborepo, TypeScript strict, Node 24, package scope `@vertex-shifa/*`.
- **Backend:** NestJS (`apps/api`, `apps/worker`, `apps/whatsapp-gateway`), Drizzle ORM with SQL migrations, PostgreSQL 17 with row-level security (ADR 0004), Zod contracts (Standard Schema) with OpenAPI generated from them, pg-boss for jobs and the outbox dispatcher, Better Auth for sessions (ADR 0005), Server-Sent Events for live updates (queue, sync status).
- **Clinic app (`apps/clinic`):** React + Vite + TanStack Router and Query, packaged with Electron for Windows; local SQLite and the sync client (ADR 0008). The same build runs in a browser for online-only use.
- **Console (`apps/console`):** React + Vite + TanStack, browser only.
- **Public site (`apps/site`):** Next.js (App Router), serving platform subdomains and custom domains (ADR 0015).
- **Patient app (`apps/patient`):** React Native + Expo (ADR 0003).
- **Shared packages:** `contracts` (schemas, error codes, pure rules), `db` (schema, migrations, RLS policies, shared write paths), `sync` (command definitions and sync rules), `tokens` (design tokens), `ui` (web components), `ui-native` (React Native components), `i18n` (Arabic catalog), `config` (TypeScript, Biome, test presets).
- **Quality:** Biome (lint and format), Vitest, Playwright (E2E with RTL screenshots), architecture and convention tests, GitHub Actions CI with gitleaks.
- **Exact versions** are pinned in the Phase 0 scaffold, the newest stable at that time.

## Consequences
- One Zod schema validates the same payload in the API, the desktop app, the console and the patient app.
- Patterns, skills and components can be copied from the owner's other Vertex projects and adapted.
- Dart, Kotlin or Swift code is avoided except where a native module is unavoidable.
