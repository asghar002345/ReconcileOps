import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installMockApi } from './mockApi';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const paymentsCsv = path.join(fixtureDir, 'fixtures/payments.csv');
const bankCsv = path.join(fixtureDir, 'fixtures/bank.csv');

async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(blocking, `${label}\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}

test('import, reconcile, and approve a discrepancy', async ({ page }) => {
  await installMockApi(page);
  const nav = page.getByRole('navigation', { name: 'ReconcileOps' });
  await page.goto('/login');
  await expectAccessible(page, 'login');

  await signIn(page, 'analyst@demo.reconcileops.local');
  await expectAccessible(page, 'overview');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect
    .poll(() =>
      page
        .locator('.shell__link:not(.shell__link--active)')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    )
    .toBe('rgb(168, 181, 175)');
  await expectAccessible(page, 'overview dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect
    .poll(() =>
      page
        .locator('.shell__link:not(.shell__link--active)')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    )
    .toBe('rgb(74, 88, 82)');

  await nav.getByRole('link', { name: 'Import CSV' }).click();
  await expect(page.getByRole('heading', { name: 'Import CSV' })).toBeVisible();
  await page.getByLabel('CSV file').setInputFiles(paymentsCsv);
  await page.getByRole('button', { name: 'Upload and publish' }).click();
  await expect(page.getByText('Import published')).toBeVisible();

  await page.getByLabel('Import type').selectOption('bank-entries');
  await page.getByLabel('CSV file').setInputFiles(bankCsv);
  await page.getByRole('button', { name: 'Upload and publish' }).click();
  await expect(page.getByText('Rows are available for payments, reconciliation, and review.')).toBeVisible();
  await expectAccessible(page, 'import');

  await nav.getByRole('link', { name: 'Reconciliation' }).click();
  await expect(page.getByText('No reconciliation run yet')).toBeVisible();
  await page.getByRole('button', { name: 'Run reconciliation' }).click();
  await expect(page.getByRole('cell', { name: 'REF-IMP-01' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Amount mismatch' })).toBeVisible();
  await expectAccessible(page, 'reconciliation');

  await page.getByRole('button', { name: 'Investigate' }).click();
  await expect(page.getByRole('heading', { name: 'REF-IMP-01' })).toBeVisible();
  await expect(page.getByText('Amount mismatch')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await page
    .getByLabel('Propose resolution')
    .fill('Accept the fee shortfall documented for this reference.');
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Pending approval')).toBeVisible();
  await expect(page.getByText('Pending', { exact: true })).toBeVisible();
  await expectAccessible(page, 'investigation detail');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Email').fill('approver@demo.reconcileops.local');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Sign-out stashes the investigation path, so the approver returns there.
  await expect(page.getByRole('heading', { name: 'REF-IMP-01' })).toBeVisible();
  await expect(page.getByText('Demo Approver')).toBeVisible();
  await nav.getByRole('link', { name: 'Investigations' }).click();
  await expect(page.getByRole('link', { name: 'REF-IMP-01' })).toBeVisible();
  await expect(page.getByText('Pending approval')).toBeVisible();
  await page.getByRole('link', { name: 'REF-IMP-01' }).click();
  await page.getByLabel('Approver note (optional)').fill('Matches the fee schedule.');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Resolved')).toBeVisible();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByText('Matches the fee schedule.')).toBeVisible();
  await expectAccessible(page, 'approved investigation');
});

test('overview retry recovers from a failed payments load', async ({ page }) => {
  await installMockApi(page, { failPaymentsOnce: true });
  await page.goto('/login');
  await signIn(page, 'analyst@demo.reconcileops.local');
  await expect(page.getByText('The server had a problem. Try again shortly.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('The server had a problem. Try again shortly.')).toHaveCount(0);
  await expect(page.getByText('Payments in workspace')).toBeVisible();
  await expect(page.getByText('No reconciliation run yet')).toBeVisible();
});
