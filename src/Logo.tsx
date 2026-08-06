import React from 'react';
import { colors, fonts } from './brand/tokens';

interface LogoProps {
  /** Altura do símbolo em px. O texto escala junto. */
  size?: number;
  showText?: boolean;
  /** Use "light" sobre fundos escuros (ink/plum). */
  variant?: 'dark' | 'light';
  /** Sobrescreve a cor do texto. Mantido para as telas que já passavam. */
  textColor?: string;
  text?: string;
  /**
   * Palavra de apoio ao lado da marca. Sai automaticamente quando `text`
   * é customizado (ex.: "Checkout"), para não gerar "Checkout Estética".
   * Passe explicitamente para forçar.
   */
  suffix?: string | null;
  /** Renderiza só o símbolo, sem wrapper — útil para favicon/OG. */
  markOnly?: boolean;
}

const DEFAULT_TEXT = 'Solara';

/**
 * Marca da Solara Estética.
 *
 * O símbolo é um sol de oito pétalas: "Solara" carrega o sol, e a pétala traz
 * o vocabulário de beleza e cuidado do nicho. Atende os dois públicos —
 * estética avançada e cirurgia plástica — sem cair no clichê do bisturi nem
 * no de spa. As pétalas alternam cheia e vazada para dar brilho sem gradiente,
 * o que mantém o SVG leve e nítido em qualquer escala (inclusive favicon 16px).
 */
const Mark: React.FC<{ size: number; petal: string; core: string }> = ({ size, petal, core }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Solara Estética"
  >
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
      <ellipse
        key={angle}
        cx="32"
        cy="15"
        rx="4.6"
        ry="12.5"
        transform={`rotate(${angle} 32 32)`}
        fill={i % 2 === 0 ? petal : 'none'}
        stroke={petal}
        strokeWidth="2"
        opacity={i % 2 === 0 ? 1 : 0.55}
      />
    ))}
    <circle cx="32" cy="32" r="7.5" fill={core} />
  </svg>
);

const Logo: React.FC<LogoProps> = ({
  size = 40,
  showText = true,
  variant = 'dark',
  textColor,
  text = DEFAULT_TEXT,
  suffix,
  markOnly = false,
}) => {
  const light = variant === 'light';
  const petal = light ? colors.goldLight : colors.gold;
  const core = light ? colors.white : colors.plum;
  const wordColor = textColor ?? (light ? colors.white : colors.ink);

  // Só acompanha a marca quando o texto é o padrão, salvo pedido explícito.
  const resolvedSuffix = suffix !== undefined ? suffix : text === DEFAULT_TEXT ? 'Estética' : null;

  if (markOnly) return <Mark size={size} petal={petal} core={core} />;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.28 }}>
      <Mark size={size} petal={petal} core={core} />
      {showText && (
        <span
          style={{
            fontFamily: fonts.display,
            fontSize: size * 0.62,
            fontWeight: 600,
            color: wordColor,
            letterSpacing: '-0.015em',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'baseline',
            gap: size * 0.16,
          }}
        >
          {text}
          {resolvedSuffix && (
            <span
              style={{
                fontFamily: fonts.body,
                fontSize: size * 0.26,
                fontWeight: 500,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: light ? colors.goldLight : colors.gold,
              }}
            >
              {resolvedSuffix}
            </span>
          )}
        </span>
      )}
    </div>
  );
};

/**
 * Lockup oficial em imagem (SOLARA ESTÉTICA + "Atendimento Automatizado").
 *
 * Arquivo único de 400px de largura para todos os usos — header, rodapé, login
 * e painel. Ver scripts/logo-otimiza.mjs: 12 KB em WebP sem perda, contra
 * 260 KB do PNG original.
 *
 * `width` é a largura de exibição em px; a altura vem da proporção 537x394 do
 * original recortado. `height` fica declarado no <img> para o navegador
 * reservar o espaço e não empurrar o layout quando a imagem carrega (CLS).
 */
const ASPECTO = 394 / 537;

export const LogoMarca: React.FC<{ width: number; alt?: string; style?: React.CSSProperties }> = ({
  width,
  alt = 'Solara Estética — Atendimento Automatizado',
  style,
}) => (
  <img
    src="/logo-solara-estetica.webp"
    alt={alt}
    width={width}
    height={Math.round(width * ASPECTO)}
    style={{ width, height: 'auto', display: 'block', ...style }}
  />
);

export default Logo;
