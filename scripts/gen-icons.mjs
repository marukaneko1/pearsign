/**
 * Generates the full PWA icon suite from public/pearsign-logo.png.
 * Run with: node scripts/gen-icons.mjs
 * Requires: sharp (npm install -D sharp)
 */

import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'public', 'pearsign-logo.png');
const iconsDir = join(root, 'public', 'icons');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function main() {
  await mkdir(iconsDir, { recursive: true });

  for (const size of sizes) {
    const dest = join(iconsDir, `icon-${size}.png`);
    await sharp(src)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(dest);
    console.log(`Generated ${dest}`);
  }

  // apple-touch-icon (180×180)
  await sharp(src)
    .resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: '#ffffff' })
    .png()
    .toFile(join(root, 'public', 'apple-touch-icon.png'));
  console.log('Generated public/apple-touch-icon.png');

  // favicon (32×32 PNG — browsers accept PNG for favicon.ico equivalent)
  await sharp(src)
    .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(join(root, 'public', 'favicon.png'));
  console.log('Generated public/favicon.png');

  console.log('\nAll icons generated successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
