// Generates logo/icon assets from docs/RooSuk Logo.jpg (white background).
// Usage: node scripts/make-brand-assets.mjs
import sharp from "sharp";

const SRC = "docs/RooSuk Logo.jpg";
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// Heart + dot only (no wordmark), then padded to a square.
const MARK = { left: 235, top: 125, width: 800, height: 712 };

async function mark(size, padRatio = 0.08) {
  const inner = Math.round(size * (1 - padRatio * 2));
  const m = await sharp(SRC)
    .extract(MARK)
    .resize(inner, inner, { fit: "contain", background: WHITE })
    .toBuffer();
  const pad = Math.round((size - inner) / 2);
  return sharp(m).extend({
    top: pad,
    bottom: size - inner - pad,
    left: pad,
    right: size - inner - pad,
    background: WHITE,
  });
}

/**
 * "Colour to alpha" against white: un-blends each pixel from a white
 * background, so anti-aliased edges keep their colour instead of a white
 * fringe. Alphas under ~4% are JPEG noise and are dropped.
 */
async function markTransparent(size) {
  const { data, info } = await sharp(SRC)
    .extract(MARK)
    .resize(size, size, { fit: "contain", background: WHITE })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const a = Math.max(255 - r, 255 - g, 255 - b) / 255;
    if (a < 0.04) {
      data[i + 3] = 0;
      continue;
    }
    data[i] = Math.round(255 - (255 - r) / a);
    data[i + 1] = Math.round(255 - (255 - g) / a);
    data[i + 2] = Math.round(255 - (255 - b) / a);
    data[i + 3] = Math.round(a * 255);
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png({ compressionLevel: 9 });
}

// The owner-supplied PNG has a real transparent background, so use it as-is for the full logo.
await sharp("docs/RooSuk Logo.png")
  .png({ compressionLevel: 9 })
  .toFile("public/brand/logo-full.png");
await (await markTransparent(512)).toFile("public/brand/logo-mark.png");
await (await mark(512, 0.1)).png().toFile("src/app/icon.png");
await (await mark(180, 0.1)).png().toFile("src/app/apple-icon.png");
await (await mark(192, 0.1)).png().toFile("public/icons/icon-192.png");
await (await mark(512, 0.1)).png().toFile("public/icons/icon-512.png");
// Maskable icons need a ~20% safe zone.
await (
  await mark(512, 0.22)
)
  .png()
  .toFile("public/icons/icon-maskable-512.png");
console.log("brand assets written");
