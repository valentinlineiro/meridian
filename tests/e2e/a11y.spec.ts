import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Rutas principales: sin violaciones WCAG 2 A/AA detectables automáticamente.
// No sustituye a una revisión manual.
const ROUTES = ['/overview', '/changes', '/changes?w=historial', '/games', '/games/queens', '/chess', '/languages', '/profile', '/settings'];

test.describe('Accesibilidad (axe)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'owner@localhost');
    await page.fill('input[name="password"]', 'local-dev-password-123');
    await page.click('button[type="submit"]');
  });

  for (const route of ROUTES) {
    test(`shouldHaveNoAxeViolationsWhenOn${route.slice(1)}`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${route}$`)); // una ruta inexistente redirige a /overview
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1')).toHaveCount(1); // un título de página por ruta
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target})`)).toEqual([]);
    });
  }
});

// Canario: si axe no detecta una infracción conocida, el resto de pruebas no prueban nada.
test('shouldDetectViolationWhenImageHasNoAlt', async ({ page }) => {
  await page.setContent('<!doctype html><html lang="es"><head><title>x</title></head><body><main><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>');
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(violations.map((v) => v.id)).toContain('image-alt');
});
