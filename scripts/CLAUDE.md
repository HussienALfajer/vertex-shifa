# scripts

Repository scripts run with plain Node (`node scripts/<name>.mjs`), with no dependencies beyond Node and git.

- `check-record.mjs`: records which whole-repo checks passed on which working tree (`fingerprint`, `record`, `status`). Used by the `checker` subagent and step 4 of "Finishing a task" in `AGENTS.md`. Markdown changes leave the record valid, since no check reads Markdown; if a check ever reads a Markdown file, exclude that path from `UNCHECKED_DOCS`.
- New scripts are ESM `.mjs`, start with a comment that says what they do and how to call them, and are added to the commands table in `AGENTS.md` when they are a command people run.
