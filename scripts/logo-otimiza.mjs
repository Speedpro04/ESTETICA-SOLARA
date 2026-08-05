import sharp from 'sharp';
import { writeFileSync } from 'fs';

const SRC = 'C:/LOGO-ESTETICA-7777/LOGO-ESTETICA-7777.png';
const OUT_DIR = 'C:/ESTETICA-SOLARA/public/';

// 1) Recorta a moldura branca. threshold alto porque o fundo tem ruído de
//    compressão e não é branco puro em todo pixel.
const trimmed = await sharp(SRC)
  .trim({ background: '#ffffff', threshold: 12 })
  .toBuffer({ resolveWithObject: true });

console.log('após recorte:', trimmed.info.width, 'x', trimmed.info.height);

// 2) Branco -> transparente.
//    A logo é dourada sobre branco puro. Derivamos o alfa da distância até o
//    branco (alpha = 255 - min(r,g,b)) e depois DESFAZEMOS a pré-multiplicação,
//    senão o dourado sai lavado, como se tivesse véu branco por cima.
const { data, info } = await sharp(trimmed.data)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const px = Buffer.from(data);
for (let i = 0; i < px.length; i += 4) {
  const r = px[i], g = px[i + 1], b = px[i + 2];
  const alpha = 255 - Math.min(r, g, b);
  if (alpha === 0) {
    px[i] = px[i + 1] = px[i + 2] = 255;
    px[i + 3] = 0;
    continue;
  }
  const k = 255 / alpha;
  px[i] = Math.max(0, Math.min(255, Math.round((r - (255 - alpha)) * k)));
  px[i + 1] = Math.max(0, Math.min(255, Math.round((g - (255 - alpha)) * k)));
  px[i + 2] = Math.max(0, Math.min(255, Math.round((b - (255 - alpha)) * k)));
  px[i + 3] = alpha;
}

const base = sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } });

// 3) Duas larguras: 1x para telas comuns, 2x para retina. O header exibe ~180px,
//    então 360px cobre densidade dupla sem desperdiçar bytes.
for (const w of [180, 360]) {
  const buf = await base
    .clone()
    .resize({ width: w, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, effort: 6, alphaQuality: 90 })
    .toBuffer();
  const name = w === 180 ? 'logo-solara-estetica.webp' : 'logo-solara-estetica@2x.webp';
  writeFileSync(OUT_DIR + name, buf);
  const meta = await sharp(buf).metadata();
  console.log(`${name}: ${meta.width}x${meta.height} — ${(buf.length / 1024).toFixed(1)} KB`);
}

// PNG de reserva para contextos que não aceitam WebP (assinatura de e-mail, etc).
const png = await base
  .clone()
  .resize({ width: 360, fit: 'inside', withoutEnlargement: true })
  .png({ compressionLevel: 9, palette: true, quality: 90 })
  .toBuffer();
writeFileSync(OUT_DIR + 'logo-solara-estetica.png', png);
console.log(`logo-solara-estetica.png — ${(png.length / 1024).toFixed(1)} KB`);
