# scripts

Repository scripts run with plain Node (`node scripts/<name>.mjs`), with no dependencies beyond Node and git. The one exception is `cloud-session.sh`, the bash `SessionStart` hook that prepares a cloud session (`docs/workflow.md`, "Cloud sessions").

- New scripts are ESM `.mjs`, start with a comment that says what they do and how to call them, and are added to the commands table in `AGENTS.md` when they are a command people run.
