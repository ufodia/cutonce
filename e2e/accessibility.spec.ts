import { test, expect, type Page, type Locator } from '@playwright/test';
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 120; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw Error('Control is not reachable with Tab');
}
test('keyboard canvas modes and part editing retain focus at narrow reflow widths', async ({
  page,
}) => {
  await page.goto('/');
  const project = page.getByRole('textbox', { name: 'Project name', exact: true });
  await tabTo(page, project);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Keyboard project');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Bring an offcut photo', exact: false }),
  ).toBeFocused();
  await tabTo(page, project);
  await page.keyboard.press('End');
  await page.keyboard.type(' reverse');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.support-button')).toBeFocused();
  const width = page.getByRole('spinbutton', { name: 'Shelf width', exact: true });
  await tabTo(page, width);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('221');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('spinbutton', { name: 'Shelf height', exact: true })).toBeFocused();
  const outline = page.locator('.canvas-toolbar [data-mode="outline"]');
  await tabTo(page, outline);
  await page.keyboard.press('Enter');
  await expect(outline).toBeFocused();
  await expect(outline).toHaveAttribute('aria-pressed', 'true');
  const add = page.getByRole('button', { name: 'Add a piece', exact: true });
  await tabTo(page, add);
  await page.keyboard.press('Enter');
  await expect(add).toBeFocused();
  const remove = page.locator('[data-action="remove-part"]').last();
  await tabTo(page, remove);
  await page.keyboard.press('Enter');
  await expect(add).toBeFocused();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const colors = await page.locator('.count-pill').evaluate((el) => ({
    fg: getComputedStyle(el).color,
    bg: getComputedStyle(el).backgroundColor,
  }));
  const lum = (s: string) =>
    s
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number)
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const values = [lum(colors.fg), lum(colors.bg)].sort((a, b) => a - b);
  expect((values[1] + 0.05) / (values[0] + 0.05)).toBeGreaterThanOrEqual(4.5);
});
