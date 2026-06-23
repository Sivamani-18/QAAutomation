const required = ['DARKLAUNCH_PASSWORD'];

export function getConfig() {
  const config = {
    baseUrl: process.env.BASE_URL || 'https://stage-annsacks.kohler.com',
    darklaunchUrl:
      process.env.DARKLAUNCH_URL ||
      'https://darklaunch.kohler.com/confirm?dest=stage-annsacks.kohler.com/',
    darklaunchPassword: process.env.DARKLAUNCH_PASSWORD || '',
    skuFile: process.env.SKU_FILE || 'June-26 Campaign Launch Skus.xlsx',
    maxSkus: Number.parseInt(process.env.MAX_SKUS || '', 10) || null,
    jobStatusUrl: process.env.JOB_STATUS_URL || '',
    jobStatusSuccessText: process.env.JOB_STATUS_SUCCESS_TEXT || ''
  };

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return config;
}
