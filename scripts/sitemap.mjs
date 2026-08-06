/**
 * Gera o sitemap.xml no build.
 *
 * O arquivo era escrito à mão e o <lastmod> ficava congelado numa data antiga.
 * `lastmod` que não corresponde a mudança real é sinal que o Google aprende a
 * ignorar — e um sitemap ignorado é um sitemap inútil. Aqui a data sai do
 * último commit que tocou a landing, não do relógio: reconstruir o projeto sem
 * mudar nada não deve alegar que a página mudou.
 *
 * Rodar: node scripts/sitemap.mjs (já encadeado no `npm run build`)
 */
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const SITE = 'https://solaraestetica.online';
const SAIDA = 'public/sitemap.xml';

// Arquivos cujo conteúdo aparece na página. Mudança neles é mudança de página.
const FONTES = ['src/LandingPage.tsx', 'index.html', 'src/brand/tokens.ts'];

function ultimaAlteracao() {
  try {
    const datas = FONTES.map((arquivo) =>
      execSync(`git log -1 --format=%cs -- ${arquivo}`, { encoding: 'utf8' }).trim()
    ).filter(Boolean);
    if (datas.length) return datas.sort().at(-1);
  } catch {
    // Sem git — é o caso do build dentro do Docker, onde .dockerignore corta o
    // .git. Aqui NÃO se usa a data de hoje: isso faria todo rebuild alegar
    // mudança que não houve, que é exatamente o vício que este script existe
    // para corrigir. Preserva-se o valor já commitado.
  }

  if (existsSync(SAIDA)) {
    const atual = readFileSync(SAIDA, 'utf8').match(/<lastmod>([^<]+)<\/lastmod>/);
    if (atual) return atual[1];
  }

  return new Date().toISOString().slice(0, 10);
}

const IMAGENS = [
  ['og-solara-estetica.png', 'Solara Estética — recepcionista de IA para clínica de estética'],
  ['whatsapp.webp', 'Atendimento e confirmação de consulta pelo WhatsApp'],
  ['agenda.webp', 'Agenda da clínica de estética na Solara'],
  ['prontuario.webp', 'Prontuário eletrônico e ficha de anamnese'],
];

const lastmod = ultimaAlteracao();

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${lastmod}</lastmod>
${IMAGENS.map(
  ([arquivo, titulo]) => `    <image:image>
      <image:loc>${SITE}/${arquivo}</image:loc>
      <image:title>${titulo}</image:title>
    </image:image>`
).join('\n')}
  </url>
</urlset>
`;

writeFileSync(SAIDA, xml);
console.log(`sitemap.xml gerado — lastmod ${lastmod}`);
