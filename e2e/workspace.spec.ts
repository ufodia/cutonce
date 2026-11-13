import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const savedProject = (name = 'Saved workbench') => ({
  version: 1,
  name,
  calibrated: true,
  board: [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 },
  ],
  defects: [],
  parts: [{ id: 'panel', name: 'Panel', width: 100, height: 80, quantity: 2, canRotate: true }],
  kerf: 3,
  step: 5,
});

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find a layout', exact: true })).toBeEnabled();
}

async function clickMaterialPoint(page: Page, x: number, y: number): Promise<void> {
  const position = await page.getByTestId('material-stage').evaluate(
    (element, point) => {
      const svg = element as SVGSVGElement;
      const matrix = svg.getScreenCTM();
      if (!matrix) throw new Error('Material canvas is not laid out.');
      const model = svg.createSVGPoint();
      model.x = point.x;
      model.y = point.y;
      const screen = model.matrixTransform(matrix);
      return { x: screen.x, y: screen.y };
    },
    { x, y },
  );
  await page.mouse.click(position.x, position.y);
}

test('sample nests, exports exact-scale SVG, and invalidates a changed plan', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await page.getByRole('button', { name: 'Find a layout', exact: true }).click();
  await expect(
    page.getByTestId('material-stage').locator('[data-placement]').first(),
  ).toBeVisible();
  await expect(page.getByTestId('plan-summary')).not.toBeEmpty();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save SVG', exact: true }).click();
  const file = await downloadPromise;
  const svg = await readFile((await file.path())!, 'utf8');
  expect(svg).toMatch(/width="[\d.]+mm"/);
  expect(svg).toContain('<svg');
  const save = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const projectDownload = await save;
  const project = JSON.parse(await readFile((await projectDownload.path())!, 'utf8'));
  expect(project.version).toBe(1);
  expect(project.parts.length).toBeGreaterThan(0);
  await page.getByLabel('Shelf width', { exact: true }).fill('225');
  await page.getByLabel('Shelf width', { exact: true }).press('Tab');
  await expect(page.getByRole('button', { name: 'Save SVG', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('invalid and hostile projects are rejected without executing content', async ({ page }) => {
  await ready(page);
  await page
    .getByLabel('Import project', { exact: true })
    .setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":999,"name":"<img src=x onerror=alert(1)>"}'),
    });
  await expect(page.getByRole('status')).toContainText(/invalid|version|project|unsupported/i);
  await expect(page.getByRole('button', { name: 'Find a layout', exact: true })).toBeEnabled();
});

test('a saved project round-trips through the editor and is escaped as text', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await ready(page);
  const project = savedProject('<img src=x onerror=alert(1)>');
  project.parts[0]!.name = '<svg onload=alert(2)>';
  await page.getByLabel('Import project', { exact: true }).setInputFiles({
    name: 'workbench.cutonce.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole('button', { name: 'Find a layout', exact: true }).click();
  await expect(page.getByTestId('material-stage').locator('[data-placement]')).toHaveCount(2);
  const save = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const file = await save;
  expect(JSON.parse(await readFile((await file.path())!, 'utf8'))).toEqual(project);
  expect(dialogs).toEqual([]);
  await expect(page.locator('img[onerror], svg[onload]')).toHaveCount(0);
});

test('print view tiles a measured layout into actual-size A4 pages', async ({ page }) => {
  await ready(page);
  await page.getByLabel('Import project', { exact: true }).setInputFiles({
    name: 'print.cutonce.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(savedProject())),
  });
  await page.getByRole('button', { name: 'Find a layout', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print at 100%', exact: true })).toBeEnabled();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Print at 100%', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'Your 1:1 cutting plan' })).toBeVisible();
  const tiles = popup.getByLabel('Cutting plan tile', { exact: true });
  await expect(tiles).toHaveCount(6);
  await expect(tiles.first()).toHaveAttribute('width', '190mm');
  await expect(tiles.first()).toHaveAttribute('height', '267mm');
  await expect(tiles.nth(5)).toHaveAttribute('viewBox', '380 267 190 267');
  await expect(popup.getByLabel('100 millimetre calibration ruler')).toHaveCount(6);
  await expect(popup.getByRole('button', { name: 'Print cutting plan' })).toBeVisible();
  await popup.close();
});

test('a real raster photo requires two-point calibration and preserves physical part sizes', async ({
  page,
}) => {
  await ready(page);
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#d5b88d';
    context.fillRect(0, 0, 600, 400);
    context.strokeStyle = '#80613e';
    context.lineWidth = 3;
    context.strokeRect(20, 20, 560, 360);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByLabel('Upload material photo', { exact: true }).setInputFiles({
    name: 'measured-board.png',
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  });
  await expect(page.getByRole('button', { name: 'Find a layout', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Apply scale', exact: true })).toBeDisabled();
  await clickMaterialPoint(page, 100, 100);
  await clickMaterialPoint(page, 300, 100);
  // A pointer is quantized to screen pixels. Use the two points the editor
  // actually marked rather than pretending a mouse can pick exact millimetres.
  const marked = (await page
    .getByTestId('material-stage')
    .locator('polyline')
    .getAttribute('points'))!
    .trim()
    .split(/\s+/)
    .map((point) => point.split(',').map(Number));
  expect(marked).toHaveLength(2);
  const pickedDistance = Math.hypot(
    marked[1]![0]! - marked[0]![0]!,
    marked[1]![1]! - marked[0]![1]!,
  );
  expect(Math.abs(pickedDistance - 200)).toBeLessThan(5);
  const expectedScale = 100 / pickedDistance;
  await page.getByLabel('Known reference distance in millimeters', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Apply scale', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Scale applied');
  await expect(page.getByRole('button', { name: 'Find a layout', exact: true })).toBeEnabled();
  const save = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const file = await save;
  const project = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(project.calibrated).toBe(true);
  expect(project.image.width).toBeCloseTo(600 * expectedScale, 4);
  expect(project.image.height).toBeCloseTo(400 * expectedScale, 4);
  expect(project.board[2].x).toBeCloseTo(600 * expectedScale, 4);
  expect(project.board[2].y).toBeCloseTo(400 * expectedScale, 4);
  expect(project.parts.find((part: { id: string }) => part.id === 'shelf').width).toBe(220);
  await page.getByRole('button', { name: 'Find a layout', exact: true }).click();
  await expect(
    page.getByTestId('material-stage').locator('[data-placement]').first(),
  ).toBeVisible();
});

test('desktop and narrow layouts remain usable and produce documentation evidence', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await ready(page);
  await page.getByRole('button', { name: 'Find a layout', exact: true }).click();
  await expect(
    page.getByTestId('material-stage').locator('[data-placement]').first(),
  ).toBeVisible();
  await page.screenshot({ path: 'docs/assets/workspace.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Find a layout', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/mobile-workspace.png', fullPage: true });
});
