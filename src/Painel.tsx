/**
 * Painel operacional — o que a clínica abre de manhã.
 *
 * A ordem da tela é a ordem da urgência, não a da estética:
 *
 *   1. Quem está esperando um humano   (some quando a fila está vazia)
 *   2. Os números do período
 *   3. O funil, para ver ONDE está vazando
 *   4. A lista de leads, para agir
 *
 * A fila de handoff vem primeiro e só aparece quando existe. Card fixo escrito
 * "0 pendências" treina o olho a ignorar aquela região — e no dia em que tiver
 * alguém esperando, ninguém vê.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { colors, fonts, radius, texto } from './brand/tokens';
import {
  AgendaFollowUp,
  Cartao,
  FilaHandoff,
  Funil,
  Indicador,
  ListaLeads,
  TabelaOrigens,
  TabelaProcedimentos,
  Termometro,
  botaoSecundario,
} from './painel/componentes';
import {
  ajustarTemperatura,
  assumirAtendimento,
  cancelarFollowUp,
  carregarAgendaFollowUp,
  carregarFilaHandoff,
  carregarTemperatura,
  carregarFunil,
  carregarLeads,
  carregarOrigens,
  carregarProcedimentosDemanda,
  carregarMetricasTempo,
  carregarResumo,
  devolverParaIA,
  formatarDuracao,
  ROTULO_ESTAGIO,
  type Estagio,
  type EtapaFunil,
  type FaixaTemperatura,
  type ItemFollowUp,
  type ItemHandoff,
  type Lead,
  type MetricasTempo,
  type Temperatura,
  type OrigemLead,
  type ProcedimentoDemanda,
  type ResumoPainel,
} from './lib/painel';

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
] as const;

const ESTAGIOS_FILTRO: (Estagio | 'todos')[] = [
  'todos',
  'novo',
  'qualificando',
  'qualificado',
  'agendando',
  'agendado',
  'aguardando_humano',
  'perdido',
];

interface Props {
  clinicId: string;
  userId: string | null;
  aoAbrirBriefing?: () => void;
}

export default function Painel({ clinicId, userId, aoAbrirBriefing }: Props) {
  const [dias, setDias] = useState<number>(30);
  const [filtroEstagio, setFiltroEstagio] = useState<Estagio | 'todos'>('todos');
  const [filtroTemperatura, setFiltroTemperatura] = useState<Temperatura | 'todas'>('todas');
  const [busca, setBusca] = useState('');

  const [resumo, setResumo] = useState<ResumoPainel | null>(null);
  const [funil, setFunil] = useState<EtapaFunil[]>([]);
  const [fila, setFila] = useState<ItemHandoff[]>([]);
  const [agendaFollowUp, setAgendaFollowUp] = useState<ItemFollowUp[]>([]);
  const [tempo, setTempo] = useState<MetricasTempo | null>(null);
  const [faixas, setFaixas] = useState<FaixaTemperatura[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [origens, setOrigens] = useState<OrigemLead[]>([]);
  const [procedimentos, setProcedimentos] = useState<ProcedimentoDemanda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const [r, f, fl, o, p, ag, tp, tm] = await Promise.all([
        carregarResumo(clinicId, dias),
        carregarFunil(clinicId, dias),
        carregarFilaHandoff(clinicId),
        carregarOrigens(clinicId),
        carregarProcedimentosDemanda(clinicId),
        carregarAgendaFollowUp(clinicId),
        carregarMetricasTempo(clinicId, dias),
        carregarTemperatura(clinicId, dias),
      ]);
      setTempo(tp);
      setFaixas(tm);
      setResumo(r);
      setFunil(f);
      setFila(fl);
      setOrigens(o);
      setProcedimentos(p);
      setAgendaFollowUp(ag);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [clinicId, dias]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      await recarregar();
      if (vivo) setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [recarregar]);

  // A lista de leads recarrega sozinha ao mudar filtro ou busca, sem mexer no
  // resto da tela — trocar de filtro não deveria piscar o funil inteiro.
  useEffect(() => {
    let vivo = true;
    const atraso = setTimeout(async () => {
      try {
        const l = await carregarLeads(clinicId, {
          estagio: filtroEstagio,
          temperatura: filtroTemperatura,
          busca,
          // Só quando o filtro veio do termômetro, que conta apenas ativos.
          // Assim o número do card e o tamanho da lista batem.
          apenasAtivos: filtroTemperatura !== 'todas' && filtroEstagio === 'todos',
        });
        if (vivo) setLeads(l);
      } catch (e) {
        if (vivo) setErro((e as Error).message);
      }
    }, busca ? 300 : 0); // debounce só na digitação
    return () => {
      vivo = false;
      clearTimeout(atraso);
    };
  }, [clinicId, filtroEstagio, filtroTemperatura, busca]);

  async function assumir(id: string) {
    if (!userId) return;
    await assumirAtendimento(id, userId);
    await recarregar();
  }

  async function devolver(id: string) {
    await devolverParaIA(id, userId);
    await recarregar();
  }

  async function cancelarReengajamento(id: string, definitivo: boolean) {
    await cancelarFollowUp(id, definitivo);
    await recarregar();
  }

  async function mudarTemperatura(id: string, t: Temperatura) {
    // Otimista: a etiqueta muda na hora. Quem está atendendo não pode esperar
    // ida e volta de rede para ver a própria ação refletida.
    setLeads((atuais) =>
      atuais.map((l) =>
        l.conversation_id === id ? { ...l, temperatura: t, temperatura_avaliada: true } : l
      )
    );
    try {
      await ajustarTemperatura(id, t, 'Ajustado pela equipe no painel');
      await recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const gargalo = useMemo(() => encontrarGargalo(funil), [funil]);

  if (carregando) {
    return <Centro>Carregando o painel…</Centro>;
  }

  return (
    <div style={{ fontFamily: fonts.body, maxWidth: 1180, margin: '0 auto', padding: '8px 4px 48px' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 20,
          flexWrap: 'wrap',
          marginBottom: 26,
        }}
      >
        <div>
          <h1 style={{ fontFamily: fonts.display, fontSize: texto.pagina, color: colors.ink, margin: 0 }}>
            Atendimento
          </h1>
          <p style={{ fontSize: texto.corpo, color: colors.textMuted, margin: '6px 0 0' }}>
            O que a Solara fez pela clínica nos últimos {dias} dias.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              onClick={() => setDias(p.dias)}
              style={{
                ...botaoSecundario,
                fontWeight: dias === p.dias ? 600 : 500,
                color: dias === p.dias ? colors.white : colors.inkSoft,
                background: dias === p.dias ? colors.ink : colors.white,
                borderColor: dias === p.dias ? colors.ink : colors.border,
              }}
            >
              {p.rotulo}
            </button>
          ))}
          {aoAbrirBriefing && (
            <button type="button" onClick={aoAbrirBriefing} style={botaoSecundario}>
              Briefing
            </button>
          )}
        </div>
      </header>

      {erro && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: texto.corpo,
            color: colors.danger,
            background: '#FDF3F2',
            borderLeft: `3px solid ${colors.danger}`,
            borderRadius: radius.base,
          }}
        >
          {erro}
        </div>
      )}

      {/* 1. A fila só existe quando tem gente nela. */}
      {fila.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <Cartao
            titulo="Esperando a equipe"
            aparte={
              <span
                style={{
                  fontSize: texto.apoio,
                  fontWeight: 600,
                  color: fila.some((f) => f.atrasado_para_assumir) ? colors.danger : colors.textMuted,
                }}
              >
                {fila.length} na fila
                {fila.some((f) => f.atrasado_para_assumir) &&
                  ` · ${fila.filter((f) => f.atrasado_para_assumir).length} atrasado(s)`}
              </span>
            }
          >
            <FilaHandoff itens={fila} aoAssumir={assumir} aoDevolver={devolver} />
          </Cartao>
        </div>
      )}

      {/* 2. Números do período. */}
      {resumo && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
          <Indicador rotulo="Leads" valor={resumo.leads_no_periodo} nota={`nos últimos ${dias} dias`} />
          <Indicador rotulo="Qualificados" valor={resumo.qualificados} />
          <Indicador
            rotulo="Agendaram"
            valor={resumo.agendados}
            tom={resumo.agendados > 0 ? 'bom' : 'neutro'}
          />
          <Indicador
            rotulo="Taxa de agendamento"
            valor={resumo.taxa_agendamento}
            sufixo="%"
            nota="dos leads que entraram"
          />
          <Indicador
            rotulo="Parados há 24h"
            valor={resumo.sem_resposta_24h}
            tom={resumo.sem_resposta_24h > 0 ? 'atencao' : 'neutro'}
            nota={
              resumo.sem_resposta_24h > 0
                ? 'fora da janela: só template pago'
                : 'ninguém esfriando'
            }
          />
        </div>
      )}

      {/* Temperatura antes dos números do período: é o que diz em quem mexer
          agora. O resto da tela conta como foi o mês. */}
      {faixas.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <Cartao
            titulo="Termômetro dos leads"
            aparte={
              <span style={{ fontSize: texto.apoio, color: colors.textMuted }}>
                clique para filtrar a lista
              </span>
            }
          >
            <Termometro
              faixas={faixas}
              filtroAtivo={filtroTemperatura}
              aoFiltrar={setFiltroTemperatura}
            />
          </Cartao>
        </div>
      )}

      {/* O que a clínica está comprando: tempo. Vem antes do funil porque é a
          proposta de valor — funil mede resultado, isto mede o serviço. */}
      {tempo && tempo.respostas > 0 && (
        <div style={{ marginBottom: 22 }}>
          <Cartao
            titulo="Tempo de espera"
            aparte={
              <span style={{ fontSize: texto.apoio, color: colors.textMuted }}>
                {tempo.respostas} respostas medidas
              </span>
            }
          >
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Indicador
                rotulo="Primeira resposta"
                valor={formatarDuracao(tempo.primeiro_contato_mediana_segundos)}
                nota="mediana, do primeiro contato"
                tom={
                  (tempo.primeiro_contato_mediana_segundos ?? 999) <= 60 ? 'bom' : 'neutro'
                }
              />
              <Indicador
                rotulo="Resposta típica"
                valor={formatarDuracao(tempo.mediana_segundos)}
                nota="mediana de toda a conversa"
              />
              <Indicador
                rotulo="Em até 1 minuto"
                valor={tempo.respondidas_ate_1min ?? 0}
                sufixo="%"
                tom={(tempo.respondidas_ate_1min ?? 0) >= 80 ? 'bom' : 'neutro'}
              />
              <Indicador
                rotulo="Fora do expediente"
                valor={tempo.fora_do_horario ?? 0}
                sufixo="%"
                nota="atendidas quando a clínica estava fechada"
              />
              {tempo.horas_ate_agendar !== null && (
                <Indicador
                  rotulo="Do 1º contato ao agendamento"
                  valor={tempo.horas_ate_agendar}
                  sufixo="h"
                  nota="mediana"
                />
              )}
            </div>
          </Cartao>
        </div>
      )}

      {/* 3. Onde está vazando. */}
      <div style={{ marginBottom: 22 }}>
        <Cartao
          titulo="Funil"
          aparte={
            <span style={{ fontSize: texto.apoio, color: colors.textMuted }}>
              dos leads que entraram no período
            </span>
          }
        >
          <Funil etapas={funil} />
          {gargalo && (
            <p
              style={{
                margin: '18px 0 0',
                padding: '10px 12px',
                fontSize: texto.corpo,
                lineHeight: 1.55,
                color: colors.ink,
                background: colors.sand,
                borderLeft: `3px solid ${colors.goldDeep}`,
                borderRadius: radius.base,
              }}
            >
              <b>Maior queda:</b> de {ROTULO_ESTAGIO[gargalo.de]} para{' '}
              {ROTULO_ESTAGIO[gargalo.para]} — só {gargalo.taxa}% seguiram. É onde vale olhar
              primeiro.
            </p>
          )}
        </Cartao>
      </div>

      {/* Reengajamento: aparece só quando há alguém na régua. */}
      {agendaFollowUp.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <Cartao
            titulo="Reengajamento"
            aparte={
              <span style={{ fontSize: texto.apoio, color: colors.textMuted }}>
                {agendaFollowUp.filter((a) => a.sera_cobrado).length > 0
                  ? `${agendaFollowUp.filter((a) => a.sera_cobrado).length} abrirão conversa paga`
                  : 'todos dentro da janela gratuita'}
              </span>
            }
          >
            <AgendaFollowUp itens={agendaFollowUp} aoCancelar={cancelarReengajamento} />
          </Cartao>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 22,
          marginBottom: 22,
        }}
      >
        <Cartao titulo="De onde vêm">
          <TabelaOrigens origens={origens} />
        </Cartao>
        <Cartao titulo="O que procuram">
          <TabelaProcedimentos itens={procedimentos} />
        </Cartao>
      </div>

      {/* 4. A lista, para agir. */}
      <Cartao
        titulo="Leads"
        aparte={
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            style={{
              padding: '7px 11px',
              fontFamily: fonts.body,
              fontSize: texto.corpo,
              minWidth: 220,
              color: colors.ink,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.base,
              outline: 'none',
            }}
          />
        }
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {ESTAGIOS_FILTRO.map((e) => {
            const ativo = filtroEstagio === e;
            return (
              <button
                key={e}
                type="button"
                onClick={() => setFiltroEstagio(e)}
                style={{
                  padding: '5px 12px',
                  fontFamily: fonts.body,
                  fontSize: texto.apoio,
                  fontWeight: ativo ? 600 : 500,
                  color: ativo ? colors.white : colors.inkSoft,
                  background: ativo ? colors.plum : colors.white,
                  border: `1px solid ${ativo ? colors.plum : colors.border}`,
                  borderRadius: radius.base,
                  cursor: 'pointer',
                }}
              >
                {e === 'todos' ? 'Todos' : ROTULO_ESTAGIO[e]}
              </button>
            );
          })}
        </div>
        <ListaLeads leads={leads} aoAjustarTemperatura={mudarTemperatura} />
      </Cartao>
    </div>
  );
}

/**
 * A maior queda percentual entre etapas consecutivas.
 *
 * É a única leitura do funil que gera ação: o total diz como foi o mês, o
 * gargalo diz o que consertar. Ignora etapas sem volume — 1 de 2 leads é 50% e
 * não significa nada.
 */
function encontrarGargalo(
  etapas: EtapaFunil[]
): { de: Estagio; para: Estagio; taxa: number } | null {
  let pior: { de: Estagio; para: Estagio; taxa: number } | null = null;

  for (let i = 1; i < etapas.length; i++) {
    const anterior = etapas[i - 1];
    const atual = etapas[i];
    const taxa = atual.taxa_da_etapa_anterior;

    if (taxa === null || anterior.alcancaram < 5) continue;
    // A última etapa costuma ter taxa baixa só porque o ciclo ainda não fechou.
    if (i === etapas.length - 1) continue;

    if (!pior || taxa < pior.taxa) {
      pior = { de: anterior.estagio, para: atual.estagio, taxa };
    }
  }

  return pior && pior.taxa < 80 ? pior : null;
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 64, textAlign: 'center', fontFamily: fonts.body, color: colors.textMuted }}>
      {children}
    </div>
  );
}
