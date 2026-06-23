# QAAutomation

Playwright automation for validating June launch SKUs on the Ann Sacks lower environment.

## Coverage

- Confirms all SKUs from `June-26 Campaign Launch Skus.xlsx` are searchable in the lower environment
- Verifies the first product result renders an image and opens a PDP
- Verifies the PDP renders a title, image, and the SKU appears on either the result card or PDP
- Captures browser request failures and console errors
- Optionally validates an indexing job status endpoint if you provide one

## Setup

```bash
npm install
npm run install:browsers
cp .env.example .env
```

Required environment variable:

- `DARKLAUNCH_PASSWORD`: password for `https://darklaunch.kohler.com/confirm`

Optional environment variables:

- `BASE_URL`: defaults to `https://stage-annsacks.kohler.com`
- `SKU_FILE`: defaults to `June-26 Campaign Launch Skus.xlsx`
- `MAX_SKUS`: limit records for smoke runs
- `JOB_STATUS_URL`: endpoint used to confirm indexing job completion
- `JOB_STATUS_SUCCESS_TEXT`: response text that must be present when `JOB_STATUS_URL` is set

## Run

```bash
npm test
```

Smoke run:

```bash
npm run test:smoke
```

Artifacts are written to `artifacts/` and Playwright outputs to `playwright-report/` and `test-results/`.

## Notes

- The lower environment is password-gated, so CI must inject `DARKLAUNCH_PASSWORD`.
- The indexing job validation is implemented as an endpoint check because the recording only shows storefront verification. If the job is surfaced elsewhere, the suite can be extended to that source directly.
