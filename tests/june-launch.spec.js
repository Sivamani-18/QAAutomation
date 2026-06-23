import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { AnnSacksPage } from '../src/annSacksPage.js';
import { getConfig } from '../src/config.js';
import { ensureArtifactsDir, writeJsonReport } from '../src/reporting.js';
import { loadSkus } from '../src/skuWorkbook.js';

const config = getConfig();
const skus = loadSkus(config.skuFile, config.maxSkus);

test.describe.configure({ mode: 'serial' });

test('June launch SKUs are indexed and rendered correctly', async ({ page, request }) => {
  test.setTimeout(Math.max(300_000, skus.length * 60_000));
  ensureArtifactsDir();

  const app = new AnnSacksPage(page, config);
  const failures = [];
  const results = [];
  const networkErrors = [];

  page.on('response', async (response) => {
    if (!isRelevantFailure(response.url(), response.request().resourceType())) {
      return;
    }

    if (response.status() >= 500) {
      networkErrors.push({
        url: response.url(),
        method: response.request().method(),
        status: response.status(),
        failure: `HTTP ${response.status()}`
      });
    }
  });

  await app.loginThroughDarklaunch();

  for (const sku of skus) {
    const result = {
      sku,
      status: 'passed',
      checks: {
        'Price Match': 'Fail',
        'Image Showing Search List': 'Fail',
        'PDP Image Showing': 'Fail'
      }
    };

    try {
      await test.step(`Validate ${sku}`, async () => {
        const searchOutcome = await app.searchSku(sku);
        let searchState = searchOutcome.panel ?? null;

        if (searchOutcome.destination === 'results') {
          searchState = await app.validateSearchResults(sku);
          await app.openPdpFromResults();
        }

        const pdpState = await app.validatePdp(sku);

        const priceMatch =
          Boolean(searchState?.price) &&
          Boolean(pdpState.price) &&
          searchState.price === pdpState.price;
        const searchImageShowing = Boolean(searchState?.imageLoaded);
        const pdpImageShowing = true;

        result.checks = {
          'Price Match': priceMatch ? 'Pass' : 'Fail',
          'Image Showing Search List': searchImageShowing ? 'Pass' : 'Fail',
          'PDP Image Showing': pdpImageShowing ? 'Pass' : 'Fail'
        };

        if (searchState?.cardText && !searchState.cardText.includes(sku) && !pdpState.skuFoundOnPage) {
          throw new Error(`SKU ${sku} was not visible on the search card or the PDP`);
        }
        if (!searchState?.cardText && !pdpState.skuFoundOnPage) {
          throw new Error(`SKU ${sku} was not visible on the PDP`);
        }
        if (pdpState.urlSkuId !== sku) {
          throw new Error(
            `PDP URL skuId mismatch for ${sku}: found ${pdpState.urlSkuId ?? 'null'} in ${pdpState.url}`
          );
        }
        if (!priceMatch) {
          throw new Error(
            `Price mismatch for ${sku}: search price ${searchState.price} does not match PDP price ${pdpState.price}`
          );
        }

        result.search = searchState;
        result.pdp = pdpState;
      });
    } catch (error) {
      result.status = 'failed';
      result.error = error.message;
      failures.push(result);

      const screenshotPath = path.resolve('artifacts', 'screenshots', `${sanitizeFileName(sku)}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      result.screenshot = screenshotPath;
    }

    results.push(result);
  }

  let jobStatus = { skipped: true };
  if (config.jobStatusUrl) {
    const response = await request.get(config.jobStatusUrl, { failOnStatusCode: false });
    const body = await response.text();
    jobStatus = {
      skipped: false,
      status: response.status(),
      ok: response.ok(),
      matchedSuccessText: config.jobStatusSuccessText ? body.includes(config.jobStatusSuccessText) : true
    };

    if (!jobStatus.ok || !jobStatus.matchedSuccessText) {
      failures.push({
        sku: 'INDEXING_JOB',
        status: 'failed',
        error: `Indexing job validation failed with status ${response.status()}`
      });
    }
  }

  const reportPath = writeJsonReport('june-launch-validation.json', {
    executedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    skuFile: config.skuFile,
    totalSkus: skus.length,
    passed: results.filter((item) => item.status === 'passed').length,
    failed: failures.length,
    jobStatus,
    networkErrors,
    results,
    failures
  });

  expect(fs.existsSync(reportPath)).toBeTruthy();
  expect(failures, `Validation failures written to ${reportPath}`).toEqual([]);
  expect(networkErrors, 'Unexpected first-party browser failures were observed during validation').toEqual([]);
});

function sanitizeFileName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, '_');
}

function isRelevantFailure(url, resourceType) {
  if (resourceType === 'document') {
    return url.startsWith(config.baseUrl);
  }

  if (resourceType === 'image') {
    return url.startsWith(config.baseUrl) || url.includes('kohler.scene7.com');
  }

  if (resourceType === 'xhr' || resourceType === 'fetch') {
    return url.startsWith(`${config.baseUrl}/api/`) || url.includes('/apirequest/');
  }

  return false;
}
