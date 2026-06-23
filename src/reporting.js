import fs from 'node:fs';
import path from 'node:path';

const artifactsDir = path.resolve('artifacts');
const screenshotsDir = path.join(artifactsDir, 'screenshots');

export function ensureArtifactsDir() {
  fs.mkdirSync(screenshotsDir, { recursive: true });
  return { artifactsDir, screenshotsDir };
}

export function writeJsonReport(filename, payload) {
  ensureArtifactsDir();
  const target = path.join(artifactsDir, filename);
  fs.writeFileSync(target, JSON.stringify(payload, null, 2));
  return target;
}
