import { useEffect, useState } from 'react';

/**
 * Breakpoints do projeto, em um lugar só.
 *
 * mobile  <= 768  — telas de celular: layout em coluna única
 * tablet  <= 1024 — grades de 4 colunas caem para 2, painéis decorativos somem
 */
export const BREAKPOINTS = { mobile: 768, tablet: 1024 } as const;

const getWidth = () => (typeof window !== 'undefined' ? window.innerWidth : 1200);

/**
 * Observa a largura da viewport. `width` é o valor bruto para casos que
 * precisam de um corte próprio; na maioria das telas basta isMobile/isTablet.
 */
export function useViewport() {
  const [width, setWidth] = useState(getWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    // Uma leitura na montagem: em SSG o primeiro render assume 1200 e precisa
    // se corrigir assim que o componente encontra o window de verdade.
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return {
    width,
    isMobile: width <= BREAKPOINTS.mobile,
    isTablet: width <= BREAKPOINTS.tablet,
  };
}
