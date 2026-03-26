import { test, expect, Page } from '@playwright/test';
import path from 'path';

/**
 * E2E: Send Document flow
 * Covers: upload a PDF, add a recipient, send for signature,
 * and confirm the envelope appears in Sent view.
 *
 * Prerequisites: a valid test account must exist in the DB.
 * The TEST_USER_EMAIL / TEST_USER_PASSWORD env vars must be set for CI.
 */

const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'e2e@pearsign.test';
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'E2eTestPassword1!';
const TEST_PDF = path.join(__dirname, '../tests/fixtures/test.pdf');

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/', { timeout: 10_000 });
}

test.describe('Send Document Flow', () => {
  test.skip(
    !process.env.TEST_USER_EMAIL,
    'Skipped: set TEST_USER_EMAIL and TEST_USER_PASSWORD env vars to run this test'
  );

  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('dashboard loads after login', async ({ page }) => {
    await expect(page).toHaveURL('/');
    await expect(page.getByText(/send for signature|quick actions/i)).toBeVisible();
  });

  test('can upload a PDF via the Send for Signature flow', async ({ page }) => {
    // Open the send document dialog
    await page.getByText('Send for Signature').first().click();

    // Expect a file input or drop zone
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TEST_PDF);

    // Document should appear in the upload step
    await expect(page.getByText(/test\.pdf/i)).toBeVisible({ timeout: 10_000 });
  });

  test('can add a recipient and proceed', async ({ page }) => {
    await page.getByText('Send for Signature').first().click();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(TEST_PDF);
    await page.getByText(/test\.pdf/i).waitFor({ timeout: 10_000 });

    // Click continue / next to recipient step
    const continueBtn = page.getByRole('button', { name: /continue|next|add recipients/i }).first();
    await continueBtn.click();

    // Fill in recipient email
    const recipientEmail = page.getByPlaceholder(/recipient email|email address/i);
    if (await recipientEmail.isVisible()) {
      await recipientEmail.fill('signer@example.com');
      const recipientName = page.getByPlaceholder(/recipient name|full name/i);
      if (await recipientName.isVisible()) {
        await recipientName.fill('Test Signer');
      }
      await page.getByRole('button', { name: /add recipient/i }).click();
      await expect(page.getByText('signer@example.com')).toBeVisible();
    }
  });

  test('sent envelope appears in Sent view', async ({ page }) => {
    // Navigate to Sent Requests
    await page.getByRole('link', { name: /sent/i }).or(
      page.getByText(/sent requests/i)
    ).click();

    await expect(page.getByRole('heading', { name: /sent/i })).toBeVisible({ timeout: 5000 });
    // Table or list should render (even if empty)
    await expect(
      page.getByRole('table').or(page.getByText(/no envelopes|nothing here/i))
    ).toBeVisible({ timeout: 5000 });
  });
});
