/**
 * Componentes do painel operacional.
 *
 * Princípio visual: o painel é lido de relance, várias vezes por dia, por quem
 * está atendendo. Então número grande, pouca cor, e cor SÓ onde exige ação —
 * fila atrasada e lead perdido. Dashboard colorido inteiro é dashboard onde nada
 * chama atenção.
 */
import type { ReactNode } from 'react';
import { colors, fonts, radius, shadow, texto } from '../brand/tokens';
import {
  EXPLICA_TEMPERATURA,
  formatarTelefone,
  haQuantoTempo,
  ROTULO_AGENTE,
  ROTULO_ESTAGIO,
  ROTULO_ORIGEM,
  ROTULO_TEMPERATURA,
  ROTULO_URGENCIA,
  type EtapaFunil,
  type FaixaTemperatura,
  type ItemFollowUp,
  type ItemHandoff,
  type Lead,
  type OrigemLead,
  type ProcedimentoDemanda,
  type Temperatura,
} from '../lib/painel';

// --- Cartão base -------------------------------------------------------------

export function Cartao({
  titulo,
  aparte,
  children,
}: {
  titulo?: string;
  aparte?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        padding: 24,
        background: colors.white,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.base,
        boxShadow: shadow.sm,
      }}
    >
      {titulo && (
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <h3 style={{ fontFamily: fonts.display, fontSize: texto.destaque, color: colors.ink, margin: 0 }}>
            {titulo}
          </h3>
          {aparte}
        </header>
      )}
      {children}
    </section>
  );
}

// --- Indicadores -------------------------------------------------------------

export function Indicador({
  rotulo,
  valor,
  sufixo,
  nota,
  tom = 'neutro',
}: {
  rotulo: string;
  valor: number | string;
  sufixo?: string;
  nota?: string;
  tom?: 'neutro' | 'bom' | 'atencao';
}) {
  const corValor =
    tom === 'bom' ? colors.success : tom === 'atencao' ? colors.danger : colors.ink;

  return (
    <div
      style={{
        flex: '1 1 160px',
        minWidth: 0,
        padding: '18px 20px',
        background: colors.white,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.base,
      }}
    >
      <span
        style={{
          display: 'block',
          fontFamily: fonts.body,
          fontSize: texto.rotulo,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: colors.textMuted,
          marginBottom: 8,
        }}
      >
        {rotulo}
      </span>
      <span
        style={{
          fontFamily: fonts.display,
          fontSize: texto.numero,
          lineHeight: 1,
          color: corValor,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
        {sufixo && (
          <span style={{ fontSize: texto.destaque, color: colors.textMuted, marginLeft: 2 }}>{sufixo}</span>
        )}
      </span>
      {nota && (
        <span
          style={{
            display: 'block',
            fontFamily: fonts.body,
            fontSize: texto.apoio,
            color: colors.textMuted,
            marginTop: 8,
            lineHeight: 1.4,
          }}
        >
          {nota}
        </span>
      )}
    </div>
  );
}

// --- Funil -------------------------------------------------------------------

/**
 * Funil de coorte: dos leads que entraram no período, quantos chegaram a cada
 * etapa. A largura da barra é proporcional ao topo, e a queda entre etapas
 * aparece como número — é ali que está a informação acionável, não no total.
 */
export function Funil({ etapas }: { etapas: EtapaFunil[] }) {
  const topo = etapas[0]?.alcancaram ?? 0;
  if (topo === 0) {
    return (
      <p style={{ fontFamily: fonts.body, fontSize: texto.corpo, color: colors.textMuted, margin: 0 }}>
        Nenhum lead no período. Assim que o primeiro chegar pelo WhatsApp, ele aparece aqui.
      </p>
    );
  }

  return (
    <div>
      {etapas.map((etapa, i) => {
        const largura = Math.max((etapa.alcancaram / topo) * 100, etapa.alcancaram > 0 ? 4 : 0.6);
        const anterior = etapas[i - 1];
        const perdaAbsoluta = anterior ? anterior.alcancaram - etapa.alcancaram : 0;
        // Queda forte marca em vermelho: é onde a clínica está perdendo dinheiro.
        const quedaForte =
          etapa.taxa_da_etapa_anterior !== null && etapa.taxa_da_etapa_anterior < 50;

        return (
          <div key={etapa.estagio} style={{ marginBottom: 4 }}>
            {i > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '3px 0 6px 2px',
                  fontFamily: fonts.body,
                  fontSize: texto.rotulo,
                  color: quedaForte ? colors.danger : colors.textMuted,
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {etapa.taxa_da_etapa_anterior ?? 0}%
                </span>
                <span>seguiram</span>
                {perdaAbsoluta > 0 && (
                  <span>
                    · {perdaAbsoluta} {perdaAbsoluta === 1 ? 'parou' : 'pararam'} aqui
                  </span>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span
                style={{
                  width: 108,
                  flexShrink: 0,
                  fontFamily: fonts.body,
                  fontSize: texto.corpo,
                  fontWeight: 500,
                  color: colors.ink,
                }}
              >
                {ROTULO_ESTAGIO[etapa.estagio]}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    width: `${largura}%`,
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 12,
                    boxSizing: 'border-box',
                    // Degradê sutil do plum ao rosé: dá profundidade sem virar
                    // gráfico colorido de apresentação.
                    background: `linear-gradient(90deg, ${colors.plum}, ${colors.rose})`,
                    borderRadius: radius.base,
                    minWidth: 44,
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonts.display,
                      fontSize: texto.destaque,
                      color: colors.white,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {etapa.alcancaram}
                  </span>
                </div>
              </div>

              <span
                style={{
                  width: 96,
                  flexShrink: 0,
                  textAlign: 'right',
                  fontFamily: fonts.body,
                  fontSize: texto.apoio,
                  color: colors.textMuted,
                }}
                title="Quantos estão parados nesta etapa agora"
              >
                {etapa.estao_aqui > 0 ? `${etapa.estao_aqui} aqui agora` : '—'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Fila de handoff ---------------------------------------------------------

const CORES_SEVERIDADE: Record<string, string> = {
  critica: colors.danger,
  alta: colors.warn,
  media: colors.goldDeep,
  baixa: colors.textMuted,
};

export function FilaHandoff({
  itens,
  aoAssumir,
  aoDevolver,
}: {
  itens: ItemHandoff[];
  aoAssumir: (id: string) => void;
  aoDevolver: (id: string) => void;
}) {
  if (itens.length === 0) {
    return (
      <p style={{ fontFamily: fonts.body, fontSize: texto.corpo, color: colors.textMuted, margin: 0 }}>
        Ninguém esperando. A Solara está dando conta sozinha.
      </p>
    );
  }

  return (
    <div>
      {itens.map((item) => (
        <div
          key={item.conversation_id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            padding: '14px 16px',
            marginBottom: 8,
            background: item.atrasado_para_assumir ? '#FDF3F2' : colors.sand,
            borderLeft: `3px solid ${
              CORES_SEVERIDADE[item.handoff_severidade ?? 'media'] ?? colors.textMuted
            }`,
            borderRadius: radius.base,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontFamily: fonts.body, fontSize: texto.corpo, color: colors.ink }}>
                {item.contact_name || formatarTelefone(item.wa_contact_id)}
              </strong>
              <span
                style={{
                  fontFamily: fonts.body,
                  fontSize: texto.apoio,
                  fontWeight: item.atrasado_para_assumir ? 600 : 400,
                  color: item.atrasado_para_assumir ? colors.danger : colors.textMuted,
                }}
              >
                esperando {haQuantoTempo(item.handoff_aberto_em).replace('há ', '')}
                {item.atrasado_para_assumir && ' · atrasado'}
              </span>
            </div>
            <span
              style={{
                display: 'block',
                fontFamily: fonts.body,
                fontSize: texto.apoio,
                color: colors.inkSoft,
                marginTop: 3,
              }}
            >
              {item.handoff_motivo ?? 'Escalonamento'}
              {item.previous_stage && ` · estava em ${ROTULO_ESTAGIO[item.previous_stage]}`}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {!item.handoff_assumido_em && (
              <button
                type="button"
                onClick={() => aoAssumir(item.conversation_id)}
                style={botaoPrimario}
              >
                Assumir
              </button>
            )}
            <button
              type="button"
              onClick={() => aoDevolver(item.conversation_id)}
              style={botaoSecundario}
              title="A Solara volta a atender do ponto onde parou"
            >
              Devolver à Solara
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Termômetro --------------------------------------------------------------

export const CORES_TEMPERATURA: Record<Temperatura, string> = {
  quente: colors.danger,
  morno: colors.warn,
  frio: colors.textMuted,
};

/**
 * Quantos leads em cada temperatura, e quantos estão esfriando.
 *
 * O número que mais importa não é o total: é `parados_24h` na faixa QUENTE.
 * Lead quente parado é venda feita escorrendo — e é a única linha desta tela
 * que pede ação imediata da equipe.
 */
export function Termometro({
  faixas,
  aoFiltrar,
  filtroAtivo,
}: {
  faixas: FaixaTemperatura[];
  aoFiltrar: (t: Temperatura | 'todas') => void;
  filtroAtivo: Temperatura | 'todas';
}) {
  const total = faixas.reduce((s, f) => s + f.total, 0);
  if (total === 0) {
    return (
      <p style={{ fontFamily: fonts.body, fontSize: texto.corpo, color: colors.textMuted, margin: 0 }}>
        Nenhum lead ativo no período.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {faixas.map((faixa) => {
        const cor = CORES_TEMPERATURA[faixa.temperatura];
        const ativo = filtroAtivo === faixa.temperatura;
        const esfriando = faixa.temperatura === 'quente' && faixa.parados_24h > 0;

        return (
          <button
            key={faixa.temperatura}
            type="button"
            onClick={() => aoFiltrar(ativo ? 'todas' : faixa.temperatura)}
            title={EXPLICA_TEMPERATURA[faixa.temperatura]}
            style={{
              flex: '1 1 180px',
              minWidth: 0,
              textAlign: 'left',
              padding: '16px 18px',
              background: ativo ? colors.sand : colors.white,
              border: `1px solid ${ativo ? cor : colors.border}`,
              borderLeft: `3px solid ${cor}`,
              borderRadius: radius.base,
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'block',
                fontFamily: fonts.body,
                fontSize: texto.rotulo,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: cor,
                marginBottom: 6,
              }}
            >
              {ROTULO_TEMPERATURA[faixa.temperatura]}
            </span>
            <span
              style={{
                fontFamily: fonts.display,
                fontSize: texto.pagina,
                lineHeight: 1,
                color: colors.ink,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {faixa.total}
            </span>
            <span
              style={{
                display: 'block',
                fontFamily: fonts.body,
                fontSize: texto.apoio,
                marginTop: 8,
                lineHeight: 1.45,
                color: esfriando ? colors.danger : colors.textMuted,
                fontWeight: esfriando ? 600 : 400,
              }}
            >
              {esfriando
                ? `${faixa.parados_24h} esfriando — sem resposta há 24h`
                : faixa.agendaram > 0
                  ? `${faixa.agendaram} já agendaram`
                  : faixa.parados_24h > 0
                    ? `${faixa.parados_24h} parados há 24h`
                    : 'todos em movimento'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// --- Agenda de reengajamento -------------------------------------------------

/**
 * Quem a Solara vai reprocurar, e quando.
 *
 * Mostra o que ainda VAI sair, não só o que já venceu. É a diferença entre
 * a recepção poder cancelar um reengajamento antes de ele virar conversa paga
 * e só descobrir o gasto na fatura da Meta.
 */
export function AgendaFollowUp({
  itens,
  aoCancelar,
}: {
  itens: ItemFollowUp[];
  aoCancelar: (id: string, definitivo: boolean) => void;
}) {
  if (itens.length === 0) {
    return (
      <p style={{ fontFamily: fonts.body, fontSize: texto.corpo, color: colors.textMuted, margin: 0 }}>
        Ninguém na fila de reengajamento. Quem some volta pra cá automaticamente.
      </p>
    );
  }

  return (
    <div>
      {itens.map((item) => (
        <div
          key={item.conversation_id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 14,
            padding: '12px 14px',
            marginBottom: 8,
            background: colors.sand,
            borderLeft: `3px solid ${item.vencido ? colors.warn : colors.border}`,
            borderRadius: radius.base,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontFamily: fonts.body, fontSize: texto.corpo, color: colors.ink }}>
                {item.contact_name || formatarTelefone(item.wa_contact_id)}
              </strong>
              <span style={{ fontFamily: fonts.body, fontSize: texto.apoio, color: colors.textMuted }}>
                {item.vencido ? 'sai no próximo ciclo' : `sai ${emQuantoTempo(item.next_follow_up_at)}`}
                {' · '}
                tentativa {item.follow_up_count + 1} de {item.follow_up_max_tentativas}
              </span>
              {/* O aviso de custo é o ponto: fora da janela, cada tentativa é
                  uma conversa cobrada pela Meta. */}
              {item.sera_cobrado && (
                <Etiqueta rotulo="conversa paga" cor={colors.warn} />
              )}
            </div>
            <span
              style={{
                display: 'block',
                fontFamily: fonts.body,
                fontSize: texto.apoio,
                color: colors.inkSoft,
                marginTop: 3,
              }}
            >
              {ROTULO_ESTAGIO[item.stage]}
              {item.interesse && ` · ${item.interesse}`}
              {item.last_inbound_at && ` · sumiu ${haQuantoTempo(item.last_inbound_at)}`}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => aoCancelar(item.conversation_id, false)}
              style={botaoSecundario}
              title="Não envia desta vez. O lead volta à fila se sumir de novo."
            >
              Não enviar
            </button>
            <button
              type="button"
              onClick={() => aoCancelar(item.conversation_id, true)}
              style={{ ...botaoSecundario, color: colors.danger }}
              title="A pessoa pediu para não ser mais procurada. Nunca mais recebe."
            >
              Não procurar mais
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** "em 3 h", "em 2 dias" — o espelho de haQuantoTempo, para o futuro. */
function emQuantoTempo(iso: string): string {
  const minutos = Math.floor((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutos <= 0) return 'agora';
  if (minutos < 60) return `em ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `em ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `em ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

// --- Lista de leads ----------------------------------------------------------

const CORES_ESTAGIO: Record<string, string> = {
  novo: colors.textMuted,
  qualificando: colors.goldDeep,
  qualificado: colors.plum,
  agendando: colors.rose,
  agendado: colors.success,
  aguardando_humano: colors.warn,
  perdido: colors.danger,
  encerrado: colors.inkSoft,
};

export function Etiqueta({ rotulo, cor }: { rotulo: string; cor: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        fontFamily: fonts.body,
        fontSize: texto.micro,
        fontWeight: 600,
        color: cor,
        background: `${cor}14`,
        border: `1px solid ${cor}33`,
        borderRadius: radius.base,
        whiteSpace: 'nowrap',
      }}
    >
      {rotulo}
    </span>
  );
}

export function ListaLeads({
  leads,
  aoAjustarTemperatura,
}: {
  leads: Lead[];
  aoAjustarTemperatura?: (id: string, t: Temperatura) => void;
}) {
  if (leads.length === 0) {
    return (
      <p style={{ fontFamily: fonts.body, fontSize: texto.corpo, color: colors.textMuted, margin: 0 }}>
        Nenhum lead com esse filtro.
      </p>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          minWidth: 820,
          borderCollapse: 'collapse',
          fontFamily: fonts.body,
        }}
      >
        <thead>
          <tr>
            {['Lead', 'Temperatura', 'Etapa', 'Interesse', 'Origem', 'Última msg'].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '0 12px 10px 0',
                  fontSize: texto.micro,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: colors.textMuted,
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.conversation_id} style={{ borderBottom: `1px solid ${colors.border}` }}>
              <td style={{ padding: '12px 12px 12px 0' }}>
                <span style={{ display: 'block', fontSize: texto.corpo, color: colors.ink, fontWeight: 500 }}>
                  {lead.contact_name || formatarTelefone(lead.wa_contact_id)}
                </span>
                <span style={{ fontSize: texto.rotulo, color: colors.textMuted }}>
                  {formatarTelefone(lead.wa_contact_id)}
                  {lead.agente_atual && ` · ${ROTULO_AGENTE[lead.agente_atual] ?? ''}`}
                </span>
              </td>
              <td style={{ padding: '12px 12px 12px 0' }}>
                {aoAjustarTemperatura ? (
                  <select
                    value={lead.temperatura}
                    onChange={(e) =>
                      aoAjustarTemperatura(lead.conversation_id, e.target.value as Temperatura)
                    }
                    title={
                      EXPLICA_TEMPERATURA[lead.temperatura] +
                      (lead.temperatura_motivo ? `\n\nSolara: ${lead.temperatura_motivo}` : '')
                    }
                    style={{
                      padding: '3px 6px',
                      fontFamily: fonts.body,
                      fontSize: texto.rotulo,
                      fontWeight: 600,
                      color: CORES_TEMPERATURA[lead.temperatura],
                      background: `${CORES_TEMPERATURA[lead.temperatura]}14`,
                      border: `1px solid ${CORES_TEMPERATURA[lead.temperatura]}44`,
                      borderRadius: radius.base,
                      cursor: 'pointer',
                    }}
                  >
                    {(['quente', 'morno', 'frio'] as Temperatura[]).map((t) => (
                      <option key={t} value={t}>
                        {ROTULO_TEMPERATURA[t]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Etiqueta
                    rotulo={ROTULO_TEMPERATURA[lead.temperatura]}
                    cor={CORES_TEMPERATURA[lead.temperatura]}
                  />
                )}
                {/* Sem leitura da Solara, o valor veio dos sinais. A equipe
                    precisa saber a diferença antes de confiar. */}
                {!lead.temperatura_avaliada && (
                  <span
                    style={{ display: 'block', fontSize: texto.micro, color: colors.textMuted, marginTop: 3 }}
                    title="Calculado por sinais (urgência, orçamento, mensagens). A Solara ainda não classificou."
                  >
                    estimado
                  </span>
                )}
              </td>
              <td style={{ padding: '12px 12px 12px 0' }}>
                <Etiqueta
                  rotulo={ROTULO_ESTAGIO[lead.stage]}
                  cor={CORES_ESTAGIO[lead.stage] ?? colors.textMuted}
                />
                {lead.stage === 'perdido' && lead.motivo_perda && (
                  <span
                    style={{ display: 'block', fontSize: texto.micro, color: colors.textMuted, marginTop: 3 }}
                  >
                    {lead.motivo_perda}
                  </span>
                )}
              </td>
              <td style={{ padding: '12px 12px 12px 0', fontSize: texto.corpo, color: colors.inkSoft }}>
                {lead.interesse ?? '—'}
                {lead.urgencia && (
                  <span style={{ display: 'block', fontSize: texto.micro, color: colors.textMuted }}>
                    {ROTULO_URGENCIA[lead.urgencia]}
                  </span>
                )}
              </td>
              <td style={{ padding: '12px 12px 12px 0', fontSize: texto.corpo, color: colors.inkSoft }}>
                {ROTULO_ORIGEM[lead.origem] ?? lead.origem}
              </td>
              <td style={{ padding: '12px 0', fontSize: texto.apoio, color: colors.textMuted }}>
                {haQuantoTempo(lead.last_inbound_at)}
                {/* Fora da janela de 24h só sai template pago — a recepção
                    precisa saber disso antes de tentar responder. */}
                {!lead.janela_aberta && lead.last_inbound_at && (
                  <span style={{ display: 'block', fontSize: texto.micro, color: colors.warn }}>
                    fora da janela de 24h
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Origem e procedimentos --------------------------------------------------

export function TabelaOrigens({ origens }: { origens: OrigemLead[] }) {
  if (origens.length === 0) return <Vazio>Sem dados de origem ainda.</Vazio>;
  const maior = Math.max(...origens.map((o) => o.total), 1);

  return (
    <div>
      {origens.map((o) => (
        <div key={o.origem} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontFamily: fonts.body, fontSize: texto.corpo, color: colors.ink }}>
              {ROTULO_ORIGEM[o.origem] ?? o.origem}
            </span>
            <span style={{ fontFamily: fonts.body, fontSize: texto.apoio, color: colors.textMuted }}>
              {o.total} {o.total === 1 ? 'lead' : 'leads'} ·{' '}
              <b style={{ color: o.taxa_conversao >= 30 ? colors.success : colors.ink }}>
                {o.taxa_conversao}%
              </b>{' '}
              agendam
            </span>
          </div>
          <div style={{ height: 6, background: colors.sand, borderRadius: radius.base }}>
            <div
              style={{
                width: `${(o.total / maior) * 100}%`,
                height: '100%',
                background: colors.plum,
                borderRadius: radius.base,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TabelaProcedimentos({ itens }: { itens: ProcedimentoDemanda[] }) {
  if (itens.length === 0) {
    return <Vazio>Nenhum procedimento com interesse registrado ainda.</Vazio>;
  }

  return (
    <div>
      {itens.map((p) => (
        <div
          key={p.procedure_id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 0',
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <span style={{ fontFamily: fonts.body, fontSize: texto.corpo, color: colors.ink }}>{p.nome}</span>
          <span style={{ fontFamily: fonts.body, fontSize: texto.apoio, color: colors.textMuted }}>
            {p.interessados} interessados · {p.agendados} agendaram
          </span>
        </div>
      ))}
    </div>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontFamily: fonts.body, fontSize: texto.corpo, color: colors.textMuted, margin: 0 }}>
      {children}
    </p>
  );
}

// --- Botões ------------------------------------------------------------------

export const botaoPrimario: React.CSSProperties = {
  padding: '7px 16px',
  fontFamily: fonts.body,
  fontSize: texto.apoio,
  fontWeight: 600,
  color: colors.white,
  background: colors.rose,
  border: 'none',
  borderRadius: radius.base,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export const botaoSecundario: React.CSSProperties = {
  padding: '7px 16px',
  fontFamily: fonts.body,
  fontSize: texto.apoio,
  fontWeight: 500,
  color: colors.inkSoft,
  background: colors.white,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.base,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
