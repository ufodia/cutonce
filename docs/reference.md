# Project and core reference

This reference describes the version-1 project contract used by CutOnce 0.1.0. `src/core.ts` is the source of truth for validation bounds and behavior.

## Project data

| Field        | Type            | Meaning                                                    |
| ------------ | --------------- | ---------------------------------------------------------- |
| `version`    | `1`             | Saved-project format version.                              |
| `name`       | `string`        | Human-readable project name.                               |
| `board`      | `Point[]`       | Ordered material-boundary polygon.                         |
| `defects`    | `Point[][]`     | Ordered polygons for unusable material.                    |
| `parts`      | `Part[]`        | Requested rectangular part types.                          |
| `kerf`       | `number`        | Layout clearance in millimetres.                           |
| `step`       | `number`        | Search-grid spacing in millimetres.                        |
| `image`      | optional object | Embedded raster image and its display extent.              |
| `calibrated` | `boolean`       | Whether project coordinates have a known millimetre scale. |

`Point` has numeric `x` and `y` coordinates. A calibrated project expresses them in millimetres. A part has `id`, `name`, `width`, `height`, integer `quantity`, and boolean `canRotate`. Part dimensions are positive lengths in millimetres. `canRotate` permits a 90° rotation; it does not permit arbitrary angles.

The optional `image` object contains `dataUrl`, `width`, and `height`. It supports PNG, JPEG or WebP base64 data rather than arbitrary remote URLs or active SVG content. Its width and height describe its display extent in the project's coordinate plane. Validation checks the raster signature as well as the declared type. Saved files can therefore contain the photograph itself.

Do not rely on permissive JavaScript coercion or extra imported fields. Pass unknown input through `validateProject`.

## Validation and work limits

| Value                      | Accepted bound                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| Boundary or defect polygon | 3–64 corners; simple, without crossing or touching itself; area at least 1 square model unit |
| Outline geometry           | At most 24 defects and 256 total boundary/defect corners                                     |
| Coordinates                | Finite numbers within ±20,000 model units                                                    |
| Part types and copies      | At most 24 types, 1–40 copies per type, at most 120 requested pieces                         |
| Part dimensions            | 0.1–20,000 mm on each axis                                                                   |
| Kerf / cutting clearance   | 0–50 mm                                                                                      |
| Search step                | 0.5–100 mm; the bounded search may use a coarser regular grid                                |
| Names                      | Project: 1–120 characters; part: 1–80 characters; values are trimmed                         |
| Part IDs                   | 1–64 characters, unique; letters, numbers, dots, dashes and underscores                      |
| Embedded image extent      | Positive width and height, each at most 20,000 model units                                   |
| Embedded image URL         | At most 12 × 1024 × 1024 characters, supported base64 raster form with a matching signature  |
| Nesting run                | At most 250,000 candidate checks across all pieces                                           |
| Print export               | At most 200 A4 tiles                                                                         |

The core discards unknown fields when it returns a validated project. It does not require every defect polygon to lie inside the board; only regions that intersect a candidate affect that candidate. Nesting and cutting exports reject an uncalibrated project.

The interface adds file-input limits: photos up to 8 MiB, 12,000 pixels per side and 40 megapixels; project JSON up to 13 MiB. Its editable project-name and piece-name inputs are limited to 80 and 50 characters respectively, within the core's broader accepted import lengths.

## Planning result

`NestResult` contains:

| Field         | Type          | Meaning                                                       |
| ------------- | ------------- | ------------------------------------------------------------- |
| `placements`  | `Placement[]` | Pieces placed in the current plan.                            |
| `unplaced`    | object array  | Remaining `partId`, `name`, and `count` by part type.         |
| `utilization` | `number`      | `partArea / boardArea`, a ratio rather than a percentage.     |
| `boardArea`   | `number`      | Gross boundary-polygon area in mm², including defect regions. |
| `partArea`    | `number`      | Total area of placed pieces in mm².                           |

A `Placement` contains `partId`, `name`, `x`, `y`, `width`, `height`, and `rotated`. Its width and height describe the placed orientation. Multiple placements may refer to the same part type.

For example, a utilization value of `0.5` means 50%. Defect regions are not subtracted from `boardArea`. Utilization is a layout metric; it does not include a guarantee about cutting sequence, real-world waste or the optimal solution. Unplaced counts may reflect the work budget as well as failed candidate placements.

## Core functions

| Function                                                | Result       | Behavior                                                              |
| ------------------------------------------------------- | ------------ | --------------------------------------------------------------------- |
| `sampleProject()`                                       | `Project`    | Returns the included measured example.                                |
| `validateProject(value: unknown)`                       | `Project`    | Validates imported data; throws a readable `Error` for invalid input. |
| `polygonArea(points: Point[])`                          | `number`     | Calculates polygon area.                                              |
| `pointInPolygon(point: Point, polygon: Point[])`        | `boolean`    | Tests point containment, with boundary points counted as inside.      |
| `nest(project: Project)`                                | `NestResult` | Generates a deterministic bounded rectangular-parts layout.           |
| `exportSvg(project: Project, result: NestResult)`       | `string`     | Creates measured SVG content with escaped data labels.                |
| `exportPrintHtml(project: Project, result: NestResult)` | `string`     | Creates an A4 tiled print document with a physical scale check.       |

These functions are local module exports, not HTTP endpoints or a published npm-package API. Import them from source when developing this repository. Keep a result paired with the exact project that produced it; do not export stale placements after changing the project.

SVG and print exports validate the project and verify that placements still match its part definitions, quantities, rotation permissions, containment and clearance. Both are vector-only; neither embeds the original photo. SVG uses the board's bounding box for its physical width/height and viewBox. A4 pages use 190 × 267 mm drawing tiles within 10 mm page margins, plus a header and 100 mm ruler.

## Compatibility

Format version 1 is the only documented import format. Future format changes must document migration before they replace it. Keep a copy of your original saved project when testing a newer version.
