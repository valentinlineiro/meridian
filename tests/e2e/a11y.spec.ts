import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Rutas principales: sin violaciones WCAG 2 A/AA detectables automáticamente.
// No sustituye a una revisión manual.
const ROUTES = ['/overview', '/trajectory', '/changes', '/games', '/chess', '/languages', '/profile', '/settings'];

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
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0].target})`)).toEqual([]);
    });
  }
});
