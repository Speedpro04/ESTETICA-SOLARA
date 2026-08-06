/**
 * Prepara as imagens da landing para SEO e Core Web Vitals.
 *
 * 1. Extrai o JPEG que estava embutido em base64 no LandingPage.tsx (365 KB de
 *    texto dentro do bundle: pesa no LCP e o Google não indexa imagem que não
 *    tem URL) e grava como WebP.
 * 2. Converte as quatro capturas de tela usadas na página para WebP.
 * 3. Gera o og-solara-estetica.png (1200x630) que o index.html já referencia e
 *    que hoje devolve 404 — link compartilhado no WhatsApp aparece sem imagem.
 *
 * Rodar com: node scripts/imagens-seo.mjs
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';

const SRC_DIR = 'C:/ESTETICA-SOLARA/public/';
const OUT_DIR = 'C:/ESTETICA-SOLARA/public/';
const LP = 'C:/ESTETICA-SOLARA/src/LandingPage.tsx';

const kb = (b) => `${(b.length / 1024).toFixed(1)} KB`;

// --- 1. Hero embutido em base64 -------------------------------------------
const lp = readFileSync(LP, 'utf8');
const match = lp.match(/data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)/);
if (match) {
  const bruto = Buffer.from(match[1], 'base64');
  const hero = await sharp(bruto)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 78, effort: 6 })
    .toBuffer();
  writeFileSync(OUT_DIR + 'hero-solara.webp', hero);
  const m = await sharp(hero).metadata();
  console.log(`hero-solara.webp: ${m.width}x${m.height} — ${kb(hero)} (base64 original: ${(match[1].length / 1024).toFixed(1)} KB)`);
} else {
  console.log('nenhum base64 encontrado no LandingPage.tsx');
}

// --- 2. Capturas de tela usadas na página ---------------------------------
for (const nome of ['recepcao', 'agenda', 'prontuario', 'whatsapp']) {
  const origem = readFileSync(SRC_DIR + `${nome}.png`);
  const webp = await sharp(origem)
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 76, effort: 6 })
    .toBuffer();
  writeFileSync(OUT_DIR + `${nome}.webp`, webp);
  const m = await sharp(webp).metadata();
  console.log(`${nome}.webp: ${m.width}x${m.height} — ${kb(webp)} (png: ${(origem.length / 1024).toFixed(1)} KB)`);
}

// --- 3. Imagem de compartilhamento (Open Graph) ---------------------------
// Aubergine de fundo, moldura dourada e a logo em champanhe. Texto em serifa
// para acompanhar a Fraunces da marca — o sistema não tem a Fraunces instalada,
// então cai em Georgia, que é do mesmo gênero.
const LARGURA = 1200;
const ALTURA = 630;

const fundo = Buffer.from(`
<svg width="${LARGURA}" height="${ALTURA}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${LARGURA}" height="${ALTURA}" fill="#241B29"/>
  <rect x="18" y="18" width="${LARGURA - 36}" height="${ALTURA - 36}" fill="none" stroke="#A9814E" stroke-width="3"/>
  <text x="${LARGURA / 2}" y="420" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="#FFFFFF">
    A recepcionista de IA da sua clínica
  </text>
  <text x="${LARGURA / 2}" y="478" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="#E0C9A6">
    de estética
  </text>
  <text x="${LARGURA / 2}" y="556" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" fill="#B9AEBE">
    Atende no WhatsApp 24h · agenda · reduz no-show · 10 dias grátis
  </text>
</svg>`);

// Logo em 340px: a 420 ela invadia a primeira linha de texto.
const LOGO_W = 340;
const logo = await sharp(SRC_DIR + 'logo-solara-estetica-claro.webp')
  .resize({ width: LOGO_W })
  .toBuffer();

const og = await sharp(fundo)
  .composite([{ input: logo, top: 74, left: Math.round((LARGURA - LOGO_W) / 2) }])
  .png({ compressionLevel: 9, palette: true, colors: 128 })
  .toBuffer();

writeFileSync(OUT_DIR + 'og-solara-estetica.png', og);
const ogMeta = await sharp(og).metadata();
console.log(`og-solara-estetica.png: ${ogMeta.width}x${ogMeta.height} — ${kb(og)}`);
