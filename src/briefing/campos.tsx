/**
 * Primitivas de formulário do briefing.
 *
 * Cada campo carrega uma DICA explicando o que a Solara faz com aquela
 * informação. Não é decoração: briefing preenchido no automático gera vendedor
 * genérico, e a diferença entre "atendimento humanizado" e "toxina da marca X,
 * com nota do lote" está em quem preenche entender para que serve o campo.
 */
import type { ReactNode } from 'react';
import { colors, fonts, radius, texto } from '../brand/tokens';

const estiloRotulo: React.CSSProperties = {
  display: 'block',
  fontFamily: fonts.body,
  fontSize: texto.corpo,
  fontWeight: 600,
  color: colors.ink,
  marginBottom: 4,
};

const estiloDica: React.CSSProperties = {
  display: 'block',
  fontFamily: fonts.body,
  fontSize: texto.apoio,
  lineHeight: 1.5,
  color: colors.textMuted,
  marginBottom: 8,
};

const estiloEntrada: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  fontFamily: fonts.body,
  fontSize: texto.corpo,
  color: colors.ink,
  background: colors.white,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.base,
  outline: 'none',
};

interface CampoProps {
  rotulo: string;
  dica?: string;
  obrigatorio?: boolean;
  children: ReactNode;
}

export function Campo({ rotulo, dica, obrigatorio, children }: CampoProps) {
  return (
    <div style={{ marginBottom: 22 }}>
      <label style={estiloRotulo}>
        {rotulo}
        {obrigatorio && (
          <span
            style={{ color: colors.rose, marginLeft: 4 }}
            title="Sem este campo a Solara fica genérica nesta etapa"
          >
            *
          </span>
        )}
      </label>
      {dica && <span style={estiloDica}>{dica}</span>}
      {children}
    </div>
  );
}

interface TextoProps {
  valor: string;
  aoMudar: (v: string) => void;
  exemplo?: string;
  tipo?: string;
}

export function Texto({ valor, aoMudar, exemplo, tipo = 'text' }: TextoProps) {
  return (
    <input
      type={tipo}
      value={valor}
      placeholder={exemplo}
      onChange={(e) => aoMudar(e.target.value)}
      style={estiloEntrada}
    />
  );
}

interface AreaProps {
  valor: string;
  aoMudar: (v: string) => void;
  exemplo?: string;
  linhas?: number;
}

export function Area({ valor, aoMudar, exemplo, linhas = 4 }: AreaProps) {
  return (
    <textarea
      value={valor}
      placeholder={exemplo}
      rows={linhas}
      onChange={(e) => aoMudar(e.target.value)}
      style={{ ...estiloEntrada, resize: 'vertical', lineHeight: 1.55 }}
    />
  );
}

interface NumeroProps {
  valor: number | null;
  aoMudar: (v: number | null) => void;
  min?: number;
  max?: number;
  sufixo?: string;
}

export function Numero({ valor, aoMudar, min, max, sufixo }: NumeroProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="number"
        value={valor ?? ''}
        min={min}
        max={max}
        onChange={(e) => aoMudar(e.target.value === '' ? null : Number(e.target.value))}
        style={{ ...estiloEntrada, maxWidth: 140 }}
      />
      {sufixo && (
        <span style={{ fontFamily: fonts.body, fontSize: texto.corpo, color: colors.textMuted }}>
          {sufixo}
        </span>
      )}
    </div>
  );
}

interface OpcaoEscolha<T> {
  valor: T;
  rotulo: string;
  descricao?: string;
}

interface EscolhaProps<T extends string> {
  valor: T;
  opcoes: readonly OpcaoEscolha<T>[];
  aoMudar: (v: T) => void;
}

/** Botões em vez de <select>: as opções aqui têm consequência, e a descrição de
 *  cada uma precisa estar visível na hora de escolher — não escondida na lista. */
export function Escolha<T extends string>({ valor, opcoes, aoMudar }: EscolhaProps<T>) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {opcoes.map((opcao) => {
        const ativa = opcao.valor === valor;
        return (
          <button
            key={opcao.valor}
            type="button"
            onClick={() => aoMudar(opcao.valor)}
            style={{
              textAlign: 'left',
              padding: '10px 12px',
              fontFamily: fonts.body,
              background: ativa ? colors.sand : colors.white,
              border: `1px solid ${ativa ? colors.rose : colors.border}`,
              borderRadius: radius.base,
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: texto.corpo,
                fontWeight: ativa ? 600 : 500,
                color: colors.ink,
              }}
            >
              {opcao.rotulo}
            </span>
            {opcao.descricao && (
              <span
                style={{
                  display: 'block',
                  fontSize: texto.apoio,
                  color: colors.textMuted,
                  marginTop: 2,
                  lineHeight: 1.45,
                }}
              >
                {opcao.descricao}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface ChaveProps {
  valor: boolean;
  aoMudar: (v: boolean) => void;
  rotulo: string;
  dica?: string;
}

export function Chave({ valor, aoMudar, rotulo, dica }: ChaveProps) {
  return (
    <label
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        cursor: 'pointer',
        marginBottom: 14,
      }}
    >
      <input
        type="checkbox"
        checked={valor}
        onChange={(e) => aoMudar(e.target.checked)}
        style={{ marginTop: 3, width: 16, height: 16, accentColor: colors.rose }}
      />
      <span>
        <span
          style={{
            display: 'block',
            fontFamily: fonts.body,
            fontSize: texto.corpo,
            fontWeight: 500,
            color: colors.ink,
          }}
        >
          {rotulo}
        </span>
        {dica && (
          <span
            style={{
              display: 'block',
              fontFamily: fonts.body,
              fontSize: texto.apoio,
              color: colors.textMuted,
              lineHeight: 1.45,
            }}
          >
            {dica}
          </span>
        )}
      </span>
    </label>
  );
}

interface ListaTextoProps {
  itens: string[];
  aoMudar: (itens: string[]) => void;
  exemplo?: string;
}

/** Lista de termos (apelidos de procedimento, palavras proibidas). Uma por linha
 *  é mais fácil de revisar que separado por vírgula. */
export function ListaTexto({ itens, aoMudar, exemplo }: ListaTextoProps) {
  return (
    <Area
      valor={itens.join('\n')}
      exemplo={exemplo}
      linhas={3}
      aoMudar={(v) =>
        aoMudar(
          v
            .split('\n')
            .map((t) => t.trim())
            .filter(Boolean)
        )
      }
    />
  );
}

export function Aviso({ children, tom = 'info' }: { children: ReactNode; tom?: 'info' | 'alerta' }) {
  const cor = tom === 'alerta' ? colors.warn : colors.goldDeep;
  return (
    <div
      style={{
        padding: '10px 12px',
        marginBottom: 18,
        fontFamily: fonts.body,
        fontSize: texto.apoio,
        lineHeight: 1.55,
        color: colors.ink,
        background: colors.sand,
        borderLeft: `3px solid ${cor}`,
        borderRadius: radius.base,
      }}
    >
      {children}
    </div>
  );
}

export const estilos = { entrada: estiloEntrada, rotulo: estiloRotulo, dica: estiloDica };
