# Restore CutOnce on a replacement computer

The public GitHub repository is the source location for the application. Your saved workshop-project JSON files are separate personal files; copy them from your own backup when needed.

## Fresh setup

Install Git and Node.js 24 LTS, then run:

```sh
git clone https://github.com/ufodia/cutonce.git
cd cutonce
git switch main
git pull --ff-only origin main
git rev-parse HEAD
npm ci
npm run verify
npm run dev
```

Record the full commit SHA printed by `git rev-parse HEAD` if you need to reproduce that exact source state. Open the local address printed by Vite, then import a saved CutOnce project file through the interface.

## Update an existing checkout

First inspect `git status`. Preserve local changes before pulling; do not discard them to make an update work. With a clean checkout on `main`, `git pull --ff-only origin main` updates through a normal fast-forward. If Git reports divergent history, stop and reconcile the changes deliberately.

Run `npm ci` again when the lockfile changes, then `npm run verify`.

## What the repository provides

- Application source, non-secret configuration and dependency lockfile.
- Tests, build instructions, sample behavior and documentation.
- Original presentation assets used by the project.

It does not contain credentials, a private user-data backup, your unsaved browser state, or proof that a printed template is accurate on a new printer.
