/**
 * Solara Estética — Design Tokens
 * ---------------------------------------------------------------------------
 * Paleta direcionada a clínica de estética avançada e cirurgia plástica.
 * Substitui o azul-marinho hospitalar (#130f40) e o teal de tech (#33d9b2)
 * da versão médica genérica por um sistema quente: aubergine profundo,
 * rosé e champagne sobre off-white.
 *
 * CONTRASTE — verificado contra WCAG 2.1 AA:
 *   ink       sobre surface .... ~15:1  ✓ qualquer tamanho
 *   rose      + texto branco ....  5.0:1 ✓ texto normal (é o CTA)
 *   textMuted sobre surface ....   5.9:1 ✓ texto normal
 *   success   sobre surface ....   4.9:1 ✓ texto normal
 *   gold      sobre surface ....   3.5:1 ✗ texto corrido
 *                                        ✓ display 24px+, ícone, borda
 *
 * Regra do gold: é acento, nunca corpo de texto. Se precisar de dourado
 * legível em parágrafo, use `ink` e reserve o gold para o detalhe.
 */

export const colors = {
  // Base
  inkDeep: '#17101A', // fundo das telas de autenticação
  ink: '#241B29', // aubergine profundo — títulos, seções escuras, sidebar
  inkSoft: '#4B3D52', // texto secundário sobre claro
  inkField: '#2E2434', // campos de formulário sobre fundo escuro
  textMuted: '#6B5F71', // apoio, legendas

  // Marca
  plum: '#7D3F55', // cor de marca, logo
  rose: '#A4566B', // CTA principal
  roseDark: '#843F53', // hover do CTA
  gold: '#A9814E', // acento premium (ver regra acima)
  goldDeep: '#8A6636', // dourado legível em texto corrido — 5.0:1 sobre surface
  goldLight: '#E0C9A6', // realce suave, bordas de destaque

  // Superfícies
  surface: '#FFFFFF', // fundo da página — branco puro (era o off-white #FDFBFA)
  // Faixas e cards. Era #F5EDE7, um bege rosado que puxava para o pastel e
  // brigava com o rosé do CTA. Hoje é um erva-doce bem lavado: verde suave o
  // suficiente para descansar a página entre as seções quentes, e frio o
  // bastante para o dourado e o rosé ganharem destaque por contraste.
  sand: '#EDF1E8',
  border: '#DDE3D6', // divisórias no mesmo eixo do erva-doce
  white: '#FFFFFF',

  // Semânticas
  success: '#2F7D62',
  warn: '#C08A2E',
  danger: '#B4453C',

  glass: 'rgba(253, 251, 250, 0.72)',
} as const;

/**
 * Alias de compatibilidade.
 * LandingPage e Dashboard já consomem um objeto `colors` com nomes próprios
 * (primary, bg, cardBg, btnSuccess...). Estes mapas deixam as telas existentes
 * adotarem a paleta nova trocando uma linha de import, sem varrer o JSX inteiro.
 */
export const landingColors = {
  primary: colors.ink,
  bg: colors.surface,
  cardBorder: colors.border,
  cardBg: colors.sand,
  btnSuccess: colors.rose, // o "botão de ação" agora é rosé, não teal
  btnDanger: colors.danger,
  btnWarn: colors.gold,
  /** Dourado para texto (menu, links): o `gold` puro reprova em corpo de texto. */
  goldText: colors.goldDeep,
  extra: colors.plum,
} as const;

/** Telas escuras de autenticação: Login, Cadastro e Checkout.
 *  Sobre fundo escuro o acento é o `goldLight` — o `gold` fica em 4:1 contra
 *  o ink e só serviria para texto grande. */
export const authColors = {
  bgRight: colors.ink,
  bgLeft: colors.inkDeep,
  cyan: colors.goldLight, // nome herdado; hoje é o champagne da marca
  cyanDark: 'rgba(224, 201, 166, 0.2)',
  textMuted: '#A092A6',
  inputBg: colors.inkField,
  success: colors.success,
  danger: colors.danger,
  /** Botão principal das telas escuras. Chapado, sem degradê: é o mesmo rosé
   *  do CTA da landing, então a ação primária tem a mesma cor no site inteiro. */
  cta: colors.rose,
} as const;

export const dashboardColors = {
  bg: colors.surface,
  sidebar: colors.ink,
  primary: colors.ink,
  accent: colors.gold,
  success: colors.success,
  danger: colors.danger,
  warn: colors.warn,
  text: colors.ink,
  textMuted: colors.textMuted,
  white: colors.white,
  glass: colors.glass,
} as const;

/**
 * Tipografia.
 * Fraunces (serif com eixo óptico) nos títulos carrega o tom editorial/premium
 * que o nicho pede; Outfit segue no corpo por já estar no projeto e ser neutra
 * o bastante para interface densa de dashboard.
 */
export const fonts = {
  display: "'Fraunces', Georgia, 'Times New Roman', serif",
  body: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;

/**
 * Escala tipográfica — sete degraus, e nada fora deles.
 *
 * Antes eram catorze tamanhos, com 12.5, 13.5 e 14.5 no meio. Meio-ponto é o
 * que se escreve empurrando pixel até "ficar bom", não seguindo um sistema — e
 * num produto vendido como alto padrão, a disciplina tipográfica é parte do que
 * se está vendendo.
 *
 * Consequência prática: com escala, dá para aumentar tudo em tela grande
 * multiplicando um objeto. Com catorze valores soltos, não há o que multiplicar.
 */
export const texto = {
  micro: 11,     // etiqueta, marca de "estimado"
  rotulo: 12,    // rótulo em caixa alta sobre indicador
  apoio: 13,     // legenda, texto secundário, dica de campo
  corpo: 14,     // texto padrão, tabela, botão
  destaque: 17,  // título de cartão, número dentro da barra do funil
  secao: 20,     // título de seção
  pagina: 28,    // h1 da tela
  numero: 32,    // indicador grande
} as const;

/**
 * Pesos. O teto é 600 — decisão de marca.
 *
 * `strong` e `b` puxam 700 do navegador por padrão, e é isso que dá o negrito
 * pesado que destoa do resto. index.css normaliza os dois para 600; aqui fica a
 * referência de quem escreve estilo em linha.
 */
export const peso = {
  normal: 400,
  medio: 500,
  forte: 600, // máximo. Não existe 700 neste produto.
} as const;

/** Raio único de 3px no projeto inteiro (decisão de marca).
 *  `circle` fica de fora: é para bolinha de status e avatar, que viram
 *  quadrado se receberem raio fixo. */
export const radius = {
  base: '3px',
  circle: '50%',
} as const;

export const shadow = {
  sm: '0 1px 2px rgba(36, 27, 41, 0.06)',
  md: '0 8px 24px rgba(36, 27, 41, 0.08)',
  lg: '0 24px 60px rgba(36, 27, 41, 0.12)',
  cta: '0 8px 24px rgba(164, 86, 107, 0.32)',
} as const;

/** Identidade textual — trocar aqui muda a marca no site inteiro. */
export const brand = {
  name: 'Solara Estética',
  shortName: 'Solara',
  tagline: 'Gestão e atendimento por IA para clínicas de estética e cirurgia plástica',
  domain: 'solaraestetica.com.br',
} as const;
