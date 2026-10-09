---
name: spec
description: Interview the owner about a spec from docs/ROADMAP.md (S01–S23) and write it to docs/specs/. First step of the feature cycle, before any plan or code.
argument-hint: <spec id, e.g. S09>
disable-model-invocation: true
effort: high
---

Write the spec for **$ARGUMENTS**.

## 1. Read (only this)
- The spec's line in `docs/ROADMAP.md` (its features), then each feature's section of `docs/product/v1-scope.md`: find the heading with a search and read that section only.
- `docs/open-questions.md`, and the ADRs the features touch (`docs/decisions/README.md` lists them). Scheduling work always reads 0008 and 0009; clinical work 0007 and 0016; anything with tenant data 0004.
- Specs it depends on in `docs/specs/`, the relevant schema and contracts when they exist (`packages/db/src/schema/`, `packages/contracts/src/`), and `docs/glossary.md`.
- The template: `docs/specs/_template.md`.

## 2. Interview the owner
- In Arabic, with the question tool, at most 4 questions per round, each with concrete options and your recommendation first.
- Ask only what changes the result: business and clinical rules, limits, states and transitions, who can do what, required fields, what the patient sees, offline behavior and conflict outcomes, notifications, edge cases. Don't ask what the scope, an ADR or the code already answers.
- For offline features, settle explicitly what works offline, what the server re-checks, which conflicts can occur and who wins. For clinical features, settle what is versioned, what is shared with the patient, and what must never leave the clinic. For money, settle currencies, rounding and reversals.
- Open questions that block this spec ("Needed before" in `docs/open-questions.md`) are asked here; record the answers. Never fill one in yourself.
- Stop when every template section can be written without guessing.

## 3. Write
- `docs/specs/<id>-<kebab-name>.md` (for example `docs/specs/S09-appointments-and-offline-policy.md`), in English, following the template. Mark anything still undecided under "Open questions" instead of guessing.
- New domain terms go to `docs/glossary.md`.
- Answered open questions move to Resolved in `docs/open-questions.md` with the date. A decision that shapes the system also gets an ADR.
- Mark the spec `[~]` in `docs/ROADMAP.md`.

## 4. Hand over
Summarize the spec for the owner in Arabic, in a few lines: what V1 of it does, the main rules, the offline behavior, what stays open. Revise until the owner approves, then set `Status: Approved` and, in the same turn, open the spec's PR on branch `docs/<id>-spec` following "Finishing a task" in `AGENTS.md`. The next session starts `/feature-slice <id>`.
