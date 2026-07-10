#!/usr/bin/env node
/**
 * generate-thumbnails.mjs
 * ────────────────────────────────────────────────────────────────────────
 * One-time (repeatable) build step for the wedding gallery.
 *
 * The clothesline grid only needs small images — the full-resolution PNGs are
 * ~11 MB each, which makes the first paint painfully slow. This script produces
 * a compressed, resized copy of every numbered photo in /images and writes it to
 * /images/thumbs with the same base filename.
 *
 * WebP is used (not JPEG) because the source photos have a transparent alpha
 * channel — the Instax cards are cut out from their background — and that
 * transparency has to survive so the CSS drop-shadow hugs the card silhouette.
 * WebP keeps the alpha AND compresses well.
 *
 * Re-run this whenever photos are added or replaced:
 *
 *     npm run thumbs           # only (re)builds thumbs that are missing/stale
 *     npm run thumbs -- --force  # rebuild every thumbnail
 *
 * Requires the `sharp` dev dependency (npm install).
 */

import { readdir, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const SRC_DIR    = path.join(ROOT, 'images');
const THUMB_DIR  = path.join(SRC_DIR, 'thumbs');

/* Tunables ------------------------------------------------------------- */
const MAX_EDGE = 600;   // longest edge of a thumbnail, in pixels
const QUALITY  = 80;    // WebP quality (0–100); 80 is visually clean + small
const EXT_OUT  = '.webp';

/* Only the numbered gallery photos (001.png … NNN.png) get thumbnails.
   The decorative flower PNGs (First_Rose.png, etc.) are left alone. */
const NUMBERED = /^\d+\.png$/i;

const force = process.argv.includes('--force');

async function isStale(srcPath, outPath) {
  if (force) return true;
  if (!existsSync(outPath)) return true;
  const [s, o] = await Promise.all([stat(srcPath), stat(outPath)]);
  return s.mtimeMs > o.mtimeMs; // source changed after thumb was built
}

async function main() {
  await mkdir(THUMB_DIR, { recursive: true });

  const files = (await readdir(SRC_DIR))
    .filter(f => NUMBERED.test(f))
    .sort();

  if (files.length === 0) {
    console.error(`No numbered photos (NNN.png) found in ${SRC_DIR}`);
    process.exit(1);
  }

  let built = 0, skipped = 0;
  for (const file of files) {
    const srcPath = path.join(SRC_DIR, file);
    const outName = path.basename(file, path.extname(file)) + EXT_OUT;
    const outPath = path.join(THUMB_DIR, outName);

    if (!(await isStale(srcPath, outPath))) {
      skipped++;
      continue;
    }

    await sharp(srcPath)
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',            // cap the long edge, keep aspect ratio
        withoutEnlargement: true,
      })
      .webp({ quality: QUALITY, alphaQuality: QUALITY })
      .toFile(outPath);

    built++;
    process.stdout.write(`  ✓ ${file} → thumbs/${outName}\n`);
  }

  console.log(
    `\nThumbnails: ${built} built, ${skipped} up-to-date  →  ${path.relative(ROOT, THUMB_DIR)}/`,
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
