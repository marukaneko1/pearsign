import { test, expect } from '@playwright/test';

/**
 * E2E: Document Signing flow
 * Covers: accessing a signing link, drawing a signature,
 * completing signing, and viewing the completion certificate.
 *
 * The TEST_SIGN_TOKEN env var should be set to a valid (unexpired)
 * signing token from the test database for full coverage.
 * Without it, we still test the public signing page structure.
 */

const SIGN_TOKEN = process.env.TEST_SIGN_TOKEN;

test.describe('Document Signing Flow', () => {
  test('signing page renders for an invalid/expired token', async ({ page }) => {
    await page.goto('/sign/invalid-token-for-testing');

    // Should show an error page (expired/invalid link), not crash
    await expect(
      page
        .getByText(/invalid|expired|not found|signing link/i)
        .or(page.getByRole('heading', { name: /error|oops/i }))
    ).toBeVisible({ timeout: 8000 });
  });

  test('signing page renders for a fusion form with invalid code', async ({ page }) => {
    await page.goto('/f/invalid-form-code');

    await expect(
      page.getByText(/not found|invalid|expired/i)
        .or(page.getByRole('heading'))
    ).toBeVisible({ timeout: 8000 });
  });

  test.skip(!SIGN_TOKEN, 'Skipped: set TEST_SIGN_TOKEN env var to run full signing tests');

  test('signing page loads for a valid token', async ({ page }) => {
    await page.goto(`/sign/${SIGN_TOKEN}`);

    // The signing viewer should render the PDF
    await expect(page.getByText(/sign|signature|document/i)).toBeVisible({ timeout: 10_000 });
  });

  test('can draw a signature and submit', async ({ page }) => {
    await page.goto(`/sign/${SIGN_TOKEN}`);
    await page.waitForLoadState('networkidle');

    // Find and click the signature field or "Start Signing" button
    const startBtn = page.getByRole('button', { name: /start signing|sign here|click to sign/i });
    if (await startBtn.isVisible({ timeout: 5000 })) {
      await startBtn.click();
    }

    // Signature pad / canvas should appear
    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ timeout: 8000 });

    // Draw on canvas
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 50, box.y + 50);
      await page.mouse.down();
      await page.mouse.move(box.x + 150, box.y + 80);
      await page.mouse.move(box.x + 200, box.y + 50);
      await page.mouse.up();
    }

    // Apply/confirm signature
    const applyBtn = page.getByRole('button', { name: /apply|confirm|use this/i });
    if (await applyBtn.isVisible({ timeout: 3000 })) {
      await applyBtn.click();
    }

    // Submit signing
    const submitBtn = page.getByRole('button', { name: /complete|finish signing|submit/i });
    await submitBtn.waitFor({ timeout: 5000 });
    await submitBtn.click();

    // Success screen / certificate should appear
    await expect(
      page.getByText(/signed|complete|certificate|thank you/i)
    ).toBeVisible({ timeout: 15_000 });
  });

  test('can view the signing certificate after completion', async ({ page }) => {
    await page.goto(`/sign/${SIGN_TOKEN}`);

    // If already signed, the completion screen should show
    const certBtn = page.getByRole('button', { name: /view certificate|download certificate/i });
    if (await certBtn.isVisible({ timeout: 5000 })) {
      await certBtn.click();

      // Certificate opens in new tab or inline
      await expect(
        page.getByText(/certificate of completion|digital signature/i)
          .or(page.getByRole('dialog'))
      ).toBeVisible({ timeout: 8000 });
    }
  });
});
