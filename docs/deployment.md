# Vercel deployment

CutOnce is a static browser application. Its image processing and layout engine
run on the visitor's device; a deployment does not add a photo-upload service.

## Reproduce the build

Use the Node.js version in `.nvmrc`, then run:

```sh
npm ci
npm run verify
npm run build
```

`vercel.json` pins the Vite preset, `npm ci` installation, build command, and
`dist` output. No application environment variables or backend credentials are
needed.

## Connect the repository

Import `ufodia/cutonce` into the authorized Vercel workspace. Keep the repository
root at `./` and the production branch at `main`. Confirm the deployment's source
commit matches the checked GitHub `main` commit.

Once connected, main-branch pushes can trigger production deployments. Run the
repository checks before pushing; preview deployment URLs are not canonical
production URLs and should not be submitted for search indexing.

## Verify production

Open the production URL, load the included sample, generate a layout, and export
SVG. Check that images, controls, the source link, and the support link work.
Use the Vercel deployment record to retain the live URL and source commit.

If a deployment fails, inspect its build logs before retrying. Rollback and
redeployment should select an existing checked commit rather than introducing
unreviewed source changes through the dashboard.
