# 0017 — Deployment and hosting: provider-independent, simple, recoverable

Status: Accepted (provider and region open: Q1) · Date: 2026-10-09

## Context
Several global cloud services are blocked or restricted for Syrian users; Cloudflare is blocked in Syria. Health data may later have to be hosted in a specific country. The system must be movable between providers in hours. The owner already runs Ubuntu VPS servers with PM2 and nginx for other Vertex projects.

## Decision
- **Provider-independent:** only portable components: PostgreSQL 17, the sync service (PowerSync self-hosted, ADR 0008), an S3-compatible object store, the Node apps, a reverse proxy. No proprietary managed service the system depends on.
- **Shape at launch:** one Ubuntu VPS (or two: apps and database) at a provider that serves Syrian users; Node apps under PM2 as on the owner's other servers; services that ship as containers (the sync service, object storage if self-hosted) under Docker Compose; nginx or Caddy as the only public gateway (choice made with the custom-domain design, ADR 0015); apps listen on `127.0.0.1` only.
- **Releases:** atomic releases with rollback, health checks, database migrations by the owner role (ADR 0004), production deploys once per phase in their own session (ADR 0019).
- **Backups:** daily encrypted database and object-store backups off the server; restore tested before the pilot.
- **Data residency:** the system can run as separate "cells" (one per country or region) if a law requires it; tenant routing is by the tenant catalog (ADR 0004).
- **Monitoring:** error tracking without medical data, uptime and health checks, alerts to the owner; clinic and gateway health in the console (F37).
- The provider, region and platform domain are decided before the Phase 0 deploy skeleton (Q1).

## Consequences
- Moving providers is an operational task, not a rewrite.
- The server shape is described in `deploy/` with its own `CLAUDE.md` when Phase 0 adds it.
