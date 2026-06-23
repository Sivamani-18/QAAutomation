import { expect } from '@playwright/test';

export class AnnSacksPage {
  constructor(page, config) {
    this.page = page;
    this.config = config;
  }

  async loginThroughDarklaunch() {
    await this.page.goto(this.config.darklaunchUrl, { waitUntil: 'domcontentloaded' });
    await this.page.getByPlaceholder('Password').fill(this.config.darklaunchPassword);
    await Promise.all([
      this.page.waitForURL(/stage-annsacks\.kohler\.com/, { timeout: 30_000 }),
      this.page.getByRole('button', { name: /login/i }).click()
    ]);
    await this.page.waitForLoadState('networkidle');
  }

  async searchSku(sku) {
    await this.page.goto(this.config.baseUrl, { waitUntil: 'domcontentloaded' });
    await this.dismissOverlays();

    const searchTrigger = this.page
      .getByRole('button', { name: /search/i })
      .or(this.page.getByRole('link', { name: /search/i }))
      .first();
    await expect(searchTrigger).toBeVisible();
    await searchTrigger.click();

    const searchInput = this.page
      .locator('input[type="search"], input[type="text"]:not([type="hidden"])')
      .first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill(sku);
    const searchPanelState = await this.captureSearchPanelState(sku);
    await this.dismissOverlays({ preserveSearchPanel: true });
    const resultsHeading = this.page.locator('.search-side-panel, [class*="search-side-panel"]').getByText(
      /top product results/i
    ).first();
    await expect(resultsHeading).toBeVisible();
    return { destination: 'results', panel: searchPanelState };
  }

  async dismissOverlays(options = {}) {
    const { preserveSearchPanel = false } = options;
    const overlayActions = [
      this.page.getByRole('button', { name: /reject all/i }).first(),
      this.page.getByRole('button', { name: /accept all cookies/i }).first(),
      this.page
        .locator('text=/sign up for our newsletter/i')
        .locator('xpath=ancestor::*[self::div or self::section][1]')
        .locator('button[aria-label*="close" i], button')
        .first(),
      this.page
        .locator('.newsletter-popup button, .newsletter-popup [role="button"], footer .newsletter-popup button')
        .filter({ has: this.page.locator('svg, img') })
        .first(),
      this.page
        .locator('text=/sign up for our newsletter/i')
        .locator('xpath=ancestor::*[self::div or self::section][1]')
        .locator('button')
        .first()
    ];

    if (!preserveSearchPanel) {
      overlayActions.push(
        this.page.getByRole('button', { name: /close/i }).first(),
        this.page.locator('button[aria-label*="close" i], button[aria-label*="dismiss" i]').first()
      );
    }

    for (const action of overlayActions) {
      if (await action.isVisible().catch(() => false)) {
        await action.click().catch(() => {});
        await this.page.waitForTimeout(500);
      }
    }
  }

  async getFirstResultCard() {
    const card = this.page.locator('.product-list-tile__wrapper__card[role="link"]').first();
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    return card;
  }

  async validateSearchResults(sku) {
    const card = await this.getFirstResultCard();
    const swatches = card.locator('button, li, span, div').filter({ has: this.page.locator('img, svg') });
    const image = card.locator('img').first();
    await expect(image).toBeVisible();
    await expect
      .poll(async () => image.evaluate((node) => node.complete && node.naturalWidth > 0))
      .toBeTruthy();

    return {
      sku,
      cardText: (await card.innerText()).replace(/\s+/g, ' ').trim(),
      price: await this.extractPrice(card),
      swatchCount: await swatches.count(),
      imageLoaded: true
    };
  }

  async openPdpFromResults() {
    const card = await this.getFirstResultCard();
    await this.dismissOverlays({ preserveSearchPanel: true });
    await expect(card).toBeVisible();
    await Promise.all([
      this.page.waitForURL(/\/p\//, { timeout: 30_000 }),
      card.click({ force: true })
    ]);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async validatePdp(sku) {
    await this.dismissOverlays();

    const title = this.page.locator('h1').first();
    await expect(title).toBeVisible();

    const price = await this.extractPdpLoadedPrice();

    const galleryImage = this.page.locator('img[src]').first();
    await expect(galleryImage).toBeVisible();
    await expect
      .poll(async () => galleryImage.evaluate((node) => node.complete && node.naturalWidth > 0))
      .toBeTruthy();

    const bodyText = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    return {
      sku,
      title: (await title.innerText()).trim(),
      url: this.page.url(),
      urlSkuId: this.getUrlSkuId(),
      price,
      skuFoundOnPage: bodyText.includes(sku),
      swatchCount: await this.page.locator('button, li, span, div').filter({ has: this.page.locator('img, svg') }).count()
    };
  }

  isPdpUrl() {
    return /\/p\//.test(this.page.url());
  }

  async captureSearchPanelState(sku) {
    const searchPanel = this.page.locator('.search-side-panel, [class*="search-side-panel"]').first();
    const panelText = ((await searchPanel.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    const suggestion = this.page.locator(`a[aria-label="Search list for ${sku}"]`).first();

    return {
      sku,
      suggestionVisible: await suggestion.isVisible().catch(() => false),
      price: this.findFirstPrice(panelText)
    };
  }

  async extractPdpLoadedPrice() {
    const summaryPrice = this.page.locator('.product-summary__price').first();
    if (await summaryPrice.isVisible().catch(() => false)) {
      const text = ((await summaryPrice.textContent()) || '').replace(/\s+/g, ' ').trim();
      const price = this.findFirstPrice(text);
      if (price) {
        return price;
      }
    }

    const srOnlyPrice = summaryPrice.locator('.sr-only').first();
    if (await srOnlyPrice.isVisible().catch(() => false)) {
      const text = ((await srOnlyPrice.textContent()) || '').replace(/\s+/g, ' ').trim();
      const price = this.findFirstPrice(text);
      if (price) {
        return price;
      }
    }

    return null;
  }

  async extractPrice(locator) {
    const text = ((await locator.textContent()) || '').replace(/\s+/g, ' ').trim();
    return this.findFirstPrice(text);
  }

  findFirstPrice(text) {
    const match = text.match(/\$\s?\d[\d,]*\.\d{2}/);
    return match ? match[0].replace(/\s+/g, '') : null;
  }

  getUrlSkuId() {
    try {
      return new URL(this.page.url()).searchParams.get('skuId');
    } catch {
      return null;
    }
  }
}
