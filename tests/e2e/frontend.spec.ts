import { test, expect } from '@playwright/test';

test.describe('Frontend E2E Integration Suite', () => {
  test('shouldProtectAssetsAndRedirectUnauthenticatedRequestsToLogin', async ({ page, request }) => {
    // 1. Protected HTML navigation redirects to /login with next param
    await page.goto('/');
    await expect(page).toHaveURL(/\/login\?next=%2F/);
    await expect(page.locator('h1')).toHaveText('Meridian');

    await page.goto('/chess');
    await expect(page).toHaveURL(/\/login\?next=%2Fchess/);

    // 2. /next/* preserves path in next parameter
    await page.goto('/next/languages');
    await expect(page).toHaveURL(/\/login\?next=%2Fnext%2Flanguages/);

    // 3. API endpoints are closed (401)
    const apiRes = await request.get('/api/stats/summary');
    expect(apiRes.status()).toBe(401);
  });

  test('shouldRejectLoginWithInvalidCredentials', async ({ page }) => {
    await page.goto('/login?next=%2Foverview');
    await page.fill('input[name="email"]', 'owner@localhost');
    await page.fill('input[name="password"]', 'bad-password-1234');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('.err, [role="alert"]')).toContainText('Email o contraseña incorrectos');
  });

  test('shouldAuthenticateAndLoadRealBundlesAndRenderShell', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Login with valid credentials
    await page.goto('/login?next=%2Foverview');
    await page.fill('input[name="email"]', 'owner@localhost');
    await page.fill('input[name="password"]', 'local-dev-password-123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/overview/);
    await expect(page).toHaveTitle('Hoy · Meridian');

    // Verify shell markup rendered from real Angular bundle
    await expect(page.locator('header h1')).toHaveText('Meridian');
    await expect(page.locator('nav.side')).toBeVisible();
    await expect(page.locator('a.side-item.active')).toHaveText('Hoy');

    // Verify side menu sections
    const sideGroups = page.locator('.side-group');
    await expect(sideGroups.nth(0)).toHaveText('Resumen');
    await expect(sideGroups.nth(1)).toHaveText('Dominios');
    await expect(sideGroups.nth(2)).toHaveText('Cuenta');

    expect(pageErrors).toEqual([]);
  });

  test('shouldDirectNavigateAndReloadDeepRoutesWithout404', async ({ page }) => {
    // Session login
    await page.goto('/login?next=%2Fchess');
    await page.fill('input[name="email"]', 'owner@localhost');
    await page.fill('input[name="password"]', 'local-dev-password-123');
    await page.click('button[type="submit"]');

    // 1. Deep link /chess
    await expect(page).toHaveURL(/\/chess/);
    await expect(page).toHaveTitle('Ajedrez · Meridian');
    await expect(page.locator('a.side-item.active')).toHaveText('Ajedrez');

    // Reload /chess
    await page.reload();
    await expect(page).toHaveURL(/\/chess/);
    await expect(page).toHaveTitle('Ajedrez · Meridian');

    // 2. Direct navigate /languages
    await page.goto('/languages');
    await expect(page).toHaveURL(/\/languages/);
    await expect(page).toHaveTitle('Idiomas · Meridian');
    await page.reload();
    await expect(page).toHaveURL(/\/languages/);

    // 3. Direct navigate /games
    await page.goto('/games');
    await expect(page).toHaveURL(/\/games/);
    await expect(page).toHaveTitle('LinkedIn Games · Meridian');
    await page.reload();
    await expect(page).toHaveURL(/\/games/);
  });

  test('shouldHandleBrowserBackAndForwardNavigation', async ({ page }) => {
    // Session login
    await page.goto('/login?next=%2Foverview');
    await page.fill('input[name="email"]', 'owner@localhost');
    await page.fill('input[name="password"]', 'local-dev-password-123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/overview/);

    // Navigate to Ajedrez
    await page.click('a.side-item:has-text("Ajedrez")');
    await expect(page).toHaveURL(/\/chess/);
    await expect(page.locator('a.side-item.active')).toHaveText('Ajedrez');

    // Navigate to LinkedIn Games
    await page.click('a.side-item:has-text("LinkedIn Games")');
    await expect(page).toHaveURL(/\/games/);
    await expect(page.locator('a.side-item.active')).toHaveText('LinkedIn Games');

    // Browser back -> Ajedrez
    await page.goBack();
    await expect(page).toHaveURL(/\/chess/);
    await expect(page.locator('a.side-item.active')).toHaveText('Ajedrez');

    // Browser forward -> LinkedIn Games
    await page.goForward();
    await expect(page).toHaveURL(/\/games/);
    await expect(page.locator('a.side-item.active')).toHaveText('LinkedIn Games');
  });

  test('shouldOpenModalTrapFocusAndCloseRestoringFocus', async ({ page }) => {
    // Session login to /games
    await page.goto('/login?next=%2Fgames');
    await page.fill('input[name="email"]', 'owner@localhost');
    await page.fill('input[name="password"]', 'local-dev-password-123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/games/);

    const openBtn = page.locator('#gamesEntryOpen');
    await expect(openBtn).toBeVisible();
    await openBtn.click();

    const modal = page.locator('#lgModal');
    await expect(modal).toBeVisible();

    // Verify auto-focus on #lgScore
    await expect(page.locator('#lgScore')).toBeFocused();

    // Verify Tab stays within modal
    await page.keyboard.press('Tab');
    await expect(modal.locator(':focus')).toHaveCount(1);

    // Verify Shift+Tab stays within modal
    await page.keyboard.press('Shift+Tab');
    await expect(modal.locator(':focus')).toHaveCount(1);

    // Press Escape to close modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();

    // Focus restored to opener button
    await expect(openBtn).toBeFocused();
  });

  test('shouldLogoutAndClearSession', async ({ page }) => {
    // Session login
    await page.goto('/login?next=%2Foverview');
    await page.fill('input[name="email"]', 'owner@localhost');
    await page.fill('input[name="password"]', 'local-dev-password-123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/overview/);

    // Click Salir (Logout)
    await page.click('button:has-text("Salir")');
    await expect(page).toHaveURL(/\/login/);

    // Attempting to go back to protected page redirects to login
    await page.goto('/overview');
    await expect(page).toHaveURL(/\/login\?next=%2Foverview/);
  });
});
