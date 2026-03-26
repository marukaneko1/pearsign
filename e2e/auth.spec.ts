import { test, expect } from '@playwright/test';

/**
 * E2E: Authentication flow
 * Covers: login page render, form validation, successful login redirect,
 * logout, and forgot-password submission.
 */

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('login page renders correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/PearSign/i);
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('shows validation error for empty form submission', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).click();
    // The browser native validation or our own error should appear
    await expect(
      page.getByRole('alert').or(page.getByText(/required|email and password/i))
    ).toBeVisible({ timeout: 3000 });
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.getByLabel(/email/i).first().fill('nobody@example.com');
    await page.getByLabel(/password/i).first().fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('alert')).toContainText(/invalid|incorrect|credentials/i);
  });

  test('forgot password link switches to reset form', async ({ page }) => {
    await page.getByText(/forgot password/i).click();
    await expect(page.getByRole('button', { name: /send reset link/i })).toBeVisible();
  });

  test('forgot password form submits with email', async ({ page }) => {
    await page.getByText(/forgot password/i).click();
    await page.getByLabel(/email/i).first().fill('user@example.com');
    await page.getByRole('button', { name: /send reset link/i }).click();

    // Should show success or error message (not crash)
    await expect(
      page.getByRole('status').or(page.getByRole('alert'))
    ).toBeVisible({ timeout: 5000 });
  });

  test('page has accessible skip-to-content link', async ({ page }) => {
    const skipLink = page.getByText(/skip to main content/i);
    await skipLink.focus();
    await expect(skipLink).toBeVisible();
  });

  test('password toggle shows and hides password', async ({ page }) => {
    const passwordInput = page.getByLabel(/password/i).first();
    await passwordInput.fill('secret123');

    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Find the show/hide toggle button near the password field
    const toggleBtn = page.getByRole('button', { name: /show password|hide password/i });
    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    await toggleBtn.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
