export function getConfig() {
  const baseUrl = process.env.BASE_URL || 'https://stage-annsacks.kohler.com';
  const requiresDarklaunch = shouldUseDarklaunch(baseUrl);

  const config = {
    baseUrl,
    requiresDarklaunch,
    darklaunchUrl:
      process.env.DARKLAUNCH_URL ||
      'https://darklaunch.kohler.com/confirm?dest=stage-annsacks.kohler.com/',
    darklaunchPassword: process.env.DARKLAUNCH_PASSWORD || '',
    skuFile: process.env.SKU_FILE || 'June-26 Campaign Launch Skus.xlsx',
    maxSkus: Number.parseInt(process.env.MAX_SKUS || '', 10) || null,
    jobStatusUrl: process.env.JOB_STATUS_URL || '',
    jobStatusSuccessText: process.env.JOB_STATUS_SUCCESS_TEXT || ''
  };

  if (requiresDarklaunch && !process.env.DARKLAUNCH_PASSWORD) {
    throw new Error('Missing required environment variable: DARKLAUNCH_PASSWORD');
  }

  return config;
}

function shouldUseDarklaunch(baseUrl) {
  try {
    return new URL(baseUrl).hostname !== 'annsacks.kohler.com';
  } catch {
    return true;
  }
}
