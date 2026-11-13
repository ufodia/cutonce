# From an offcut to a measured layout

This guide describes CutOnce 0.1.0. You need the running application and, for a physical template, a printer and a ruler.

## Try the included sample

1. Open CutOnce using the local address printed by `npm run dev`.
2. Inspect the sample material outline, its defect region, and the rectangular parts list.
3. Choose **Find a layout**. The workspace shows placed parts; the result lists any quantities that remain unplaced.
4. Change a part dimension or quantity and run it again.
5. Choose **Save project** before leaving the page if you want to keep your edits. **Load sample** resets the workspace to the included example.

The sample uses measured coordinates and does not require photo calibration.

## Photograph your material

Lay the material flat. Place a known-length reference in the same plane, and photograph the surface as square-on as possible. Make the full boundary visible. A ruler raised above the material is a poor scale reference because its distance from the camera differs.

Choose **Bring an offcut photo** and open a local PNG, JPEG or WebP file. CutOnce displays the image in its workspace and starts with a rectangular boundary. A new photo resets the outline and defects and must be calibrated before planning. You can later use **Replace material photo** to choose another image.

Photos may be at most 8 MiB, 12,000 pixels on either side, and 40 megapixels in total. Resize a copy if your photograph exceeds those limits.

Calibration applies a single uniform scale. It does not correct perspective or lens distortion. If opposite edges appear to converge, take a better-aligned photograph and verify measurements directly on the material.

## Trace the usable boundary

Choose **Trace outline** and click around the perimeter in order. Choose **Finish outline** when the points surround the material. Use **Undo point** while drawing to remove a misplaced point.

Keep the polygon simple: its edges must not cross. Include missing corners and deep notches. Avoid adding many almost-identical points; a simpler accurate outline is easier to inspect.

For numeric editing, expand **Precise outline coordinates**, enter one `x, y` pair per line, and choose **Apply outline**. The units shown next to the control follow the current calibration state. While a drawing tool is active, **Enter a point by keyboard** also lets you enter X and Y and choose **Add point**.

## Set the scale

1. Choose **Set scale** in the canvas toolbar.
2. Select the two ends of your known reference distance.
3. Enter the real distance in millimetres in **Known distance**.
4. Choose **Apply scale** and inspect the resulting material dimensions.

Place the points carefully and use a long reference where possible. Calibration scales the project geometry, including the photo's display extent. Calibrate before entering the final material geometry if you are starting from an unmeasured image, then check that later edits still match it.

## Exclude defects

Choose **Mark defect** and trace each unusable region. Choose **Finish defect** before starting another polygon. **Clear defects** removes the current excluded regions. Include enough margin around a crack, hole or damaged area for your own use case. The planner only knows the region you draw; it cannot judge material integrity.

## Describe the parts

In **The pieces**, each part type has a name, width, height, quantity, and **Allow 90° rotation** setting. Use **Add a piece** for another type. All lengths are in millimetres. Allow rotation only when the material's grain, printed pattern, or intended use permits it.

**Cutting gap** controls clearance in the layout; it is saved as the project's `kerf` field. **Search grid** controls how finely the planner searches for a candidate position. Smaller spacing can find more positions but costs more work. A finer grid does not turn the search into an optimal solver.

## Generate and inspect a plan

Choose **Find a layout** after editing the boundary, defects, parts or settings. Review the placed labels and the unplaced quantities. Check the layout against the material before exporting it.

The engine places larger parts first and uses a deterministic bounded search. Results are repeatable for the same project. They can depend on search spacing and the chosen greedy ordering. The regular grid is thinned for large boards, and the whole run has a 250,000-candidate check budget. An unplaced part is not proof that it cannot fit: the planner may have found no fit in its candidate positions or reached its work budget.

Utilization is the placed-part area divided by the **gross boundary area**. Defect areas remain in that denominator. The core returns a ratio, such as `0.5` for 50%; it is a planning metric, not a guaranteed material yield after cutting.

A placement diagram is not a cutting procedure. Some layouts require tools or access that your workshop does not provide.

## Save the project

Choose **Save project** to keep the geometry, settings, parts and optional embedded photo in JSON. Reopen that JSON through **Open project**. Imported data is validated before use. Project-file import accepts files up to 13 MiB.

Do not assume your browser session is a backup. Save a file before refreshing, closing the tab, or replacing the current project. A saved project can contain your original photograph; review it before sharing.

## Export an SVG

Choose **Save SVG** after nesting. The export contains measured geometry with physical dimensions in millimetres; it omits the original photo. Open it in a vector editor or a viewer that respects the file's dimensions. Keep its scale when placing it into another document.

Check a known distance after any conversion. A correctly dimensioned SVG can still be scaled by other software.

## Print at actual size

Choose **Print at 100%** after nesting. The generated view contains tiled A4 pages; use **Print cutting plan** or your browser's print command. Export is limited to 200 A4 pages; use SVG for a larger plan. Allow the print pop-up if your browser blocks it.

Use A4 paper, **100% / actual size**, and turn off any “fit to page” scaling and browser headers/footers. Align the tiles using their origins and marks. Measure the **100 mm test ruler** on the paper before transferring the layout to material. If it is not exactly 100 mm, correct your printer settings and print again.

CutOnce does not establish your printer's physical accuracy. Check more than one direction and more than one part of a large tiled layout.

## Troubleshooting

| What you see                                       | What to check                                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Planning is unavailable after importing a photo    | Complete two-point calibration.                                                                           |
| A part that looks small enough remains unplaced    | Check rotation, defects, kerf, a concave boundary, and grid spacing; another arrangement may be needed.   |
| Results disappear or become outdated after editing | Generate a fresh plan for the new geometry and settings.                                                  |
| The image looks distorted                          | Retake a square-on photograph; uniform calibration cannot undo perspective.                               |
| The printed ruler has the wrong length             | Disable fit-to-page, select actual size, and verify A4 and printer settings.                              |
| Import reports invalid data                        | Use a CutOnce version-1 project and inspect the error. Do not paste arbitrary HTML or SVG into a project. |
| Refreshing removed changes                         | Reopen your saved JSON. Unsaved session edits are not a durable backup.                                   |

For reproducible software errors, see [CONTRIBUTING.md](../CONTRIBUTING.md). Remove private photos from reports when they are not needed.
