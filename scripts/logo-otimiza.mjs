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

// 3) Um único arquivo de 400px de largura serve todos os usos: o header exibe
//    200px, o rodapé 120px, login e painel entre 140 e 180px — todos abaixo de
//    400, então 400px cobre até tela retina no maior deles.
//
//    Compressão: a arte é um degradê dourado. WebP *lossy* com alfa é péssimo
//    aqui (q62 dava 48 KB em 400px, e baixar a qualidade quase não reduz —
//    o custo está no canal alfa). Quantizar para 64 cores primeiro e depois
//    gravar WebP sem perda cai para ~12 KB: o degradê tem poucas cores de fato,
//    e o alfa quase binário comprime muito melhor sem o ruído do lossy.
const quantizado = await base
  .clone()
  .resize({ width: 400, fit: 'inside', withoutEnlargement: true })
  .png({ compressionLevel: 9, palette: true, colors: 64, dither: 0.6 })
  .toBuffer();

const webp = await sharp(quantizado).webp({ lossless: true, effort: 6 }).toBuffer();
writeFileSync(OUT_DIR + 'logo-solara-estetica.webp', webp);
const webpMeta = await sharp(webp).metadata();
console.log(`logo-solara-estetica.webp: ${webpMeta.width}x${webpMeta.height} — ${(webp.length / 1024).toFixed(1)} KB`);

// PNG de reserva para contextos que não aceitam WebP (assinatura de e-mail, etc).
writeFileSync(OUT_DIR + 'logo-solara-estetica.png', quantizado);
const pngMeta = await sharp(quantizado).metadata();
console.log(`logo-solara-estetica.png: ${pngMeta.width}x${pngMeta.height} — ${(quantizado.length / 1024).toFixed(1)} KB`);

// 4) Variante para fundo escuro.
//    O dourado do original foi desenhado para branco: tem sombra e contorno mais
//    escuros que, sobre o aubergine do rodapé/painel, empastelam a letra e somem
//    com a linha de apoio. Aqui a forma vem do canal alfa e recebe uma cor chapada
//    (champagne #E0C9A6, ~9:1 sobre o ink) — legível e sem degradê.
const CHAMPAGNE = { r: 0xE0, g: 0xC9, b: 0xA6 };

const claro = await base
  .clone()
  .resize({ width: 400, fit: 'inside', withoutEnlargement: true })
  .raw()
  .toBuffer({ resolveWithObject: true });

const lp = Buffer.from(claro.data);
for (let i = 0; i < lp.length; i += 4) {
  // O alfa do original já é a silhueta da letra; só trocamos o preenchimento.
  // Onde a arte é mais escura (contorno), o alfa é maior — a letra fica sólida.
  lp[i] = CHAMPAGNE.r;
  lp[i + 1] = CHAMPAGNE.g;
  lp[i + 2] = CHAMPAGNE.b;
}

const claroPng = await sharp(lp, { raw: { width: claro.info.width, height: claro.info.height, channels: 4 } })
  .png({ compressionLevel: 9, palette: true, colors: 32 })
  .toBuffer();
const claroWebp = await sharp(claroPng).webp({ lossless: true, effort: 6 }).toBuffer();
writeFileSync(OUT_DIR + 'logo-solara-estetica-claro.webp', claroWebp);
const claroMeta = await sharp(claroWebp).metadata();
console.log(`logo-solara-estetica-claro.webp: ${claroMeta.width}x${claroMeta.height} — ${(claroWebp.length / 1024).toFixed(1)} KB`);
