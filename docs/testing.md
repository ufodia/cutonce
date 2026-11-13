# Verification guide

This guide describes how to reproduce checks for CutOnce 0.1.0. A command listed here is a check you can run, not a claim that every browser, tool or printer has passed it.

## Install reproducibly

Use Node.js 24 LTS and the committed lockfile:

```sh
npm ci
```

## Run source checks

```sh
npm run verify
```

`verify` combines TypeScript checking, core unit tests and the Vite production build. You can run the underlying commands separately:

```sh
npm run test
npm run build
```

## Run browser tests

Install the Playwright browser used by the test suite, then run the suite:

```sh
npx playwright install --no-shell chromium
npm run test:e2e
```

The Playwright configuration selects the full Chromium channel and controls server startup and evidence output. Read it before changing ports or adding browsers. On Linux CI, the workflow installs with `npx playwright install --with-deps --no-shell chromium` to include OS browser dependencies.

## Verification map

| Area             | Useful regression cases                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Geometry         | Polygon area, boundary points, a concave notch that a rectangle must not bridge                    |
| Defects          | Intersecting, enclosed and near-boundary excluded regions                                          |
| Clearance        | Part-to-part and part-to-boundary spacing with nonzero kerf                                        |
| Placement        | Rotation permission, repeated quantities, impossible fits and deterministic output                 |
| Validation       | Malformed numbers, unsupported versions, oversized data and unsafe labels or image types           |
| Export           | Millimetre dimensions, escaped labels, A4 tile geometry and the 100 mm print ruler                 |
| Browser workflow | Sample planning, input changes, stale-result handling, import/export and meaningful error feedback |

Keep assertions tied to the rule under test. A screenshot can show a layout, but it cannot prove geometric containment or physical print accuracy.

## Manual checks

Before treating a layout as usable, test these conditions in the environment where you will use it:

1. Use keyboard navigation to reach controls and inspect visible focus.
2. Resize the workspace and verify that controls remain usable.
3. Import a square-on photo, calibrate a known distance and compare other measured lengths.
4. Print a tiled plan at actual size; measure its ruler and multiple known dimensions.
5. Save JSON, reload the application and reopen the file.

Browser automation does not certify printer accuracy, real material behavior, cutting access, full assistive-technology compatibility, or the global optimality of the planner. Record the actual browser, command results and any limitations when reporting validation.
