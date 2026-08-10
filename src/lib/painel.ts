/**
 * Camada de dados do painel operacional.
 *
 * Toda agregação vem pronta do banco. O navegador não baixa a base de leads para
 * contar em JavaScript: além de lento, é como duas telas passam a mostrar
 * números diferentes para a mesma pergunta.
 */
import { supabase } from './supabase';

// --- Tipos -------------------------------------------------------------------

export type Estagio =
  | 'novo'
  | 'qualificando'
  | 'qualificado'
  | 'agendando'
  | 'agendado'
  | 'aguardando_humano'
  | 'perdido'
  | 'encerrado';

export type Agente = 'sdr' | 'agendador' | 'follow_up' | 'handoff' | null;

export type Temperatura = 'frio' | 'morno' | 'quente';

export interface FaixaTemperatura {
  temperatura: Temperatura;
  total: number;
  parados_24h: number;
  agendaram: number;
}

export interface EtapaFunil {
  estagio: Estagio;
  ordem: number;
  alcancaram: number;
  estao_aqui: number;
  taxa_da_etapa_anterior: number | null;
}

export interface ResumoPainel {
  leads_no_periodo: number;
  qualificados: number;
  agendados: number;
  perdidos: number;
  em_handoff: number;
  handoff_atrasados: number;
  sem_resposta_24h: number;
  taxa_agendamento: number;
}

export interface Lead {
  conversation_id: string;
  clinic_id: string;
  wa_contact_id: string;
  contact_name: string | null;
  stage: Estagio;
  agente_atual: Agente;
  temperatura: Temperatura;
  /** false = ninguém leu a conversa ainda; o valor veio dos sinais. */
  temperatura_avaliada: boolean;
  temperatura_motivo: string | null;
  origem: string;
  procedure_id: string | null;
  interesse: string | null;
  categoria_procedimento: string | null;
  sinal_orcamento: string | null;
  urgencia: 'imediata' | 'ate_30_dias' | 'sem_pressa' | null;
  motivo_perda: string | null;
  qualificado_em: string | null;
  last_inbound_at: string | null;
  message_count: number;
  follow_up_count: number;
  virou_cliente: boolean;
  janela_aberta: boolean;
  created_at: string;
}

export interface ItemHandoff {
  conversation_id: string;
  clinic_id: string;
  wa_contact_id: string;
  contact_name: string | null;
  previous_stage: Estagio | null;
  handoff_motivo: string | null;
  handoff_severidade: 'baixa' | 'media' | 'alta' | 'critica' | null;
  handoff_aberto_em: string | null;
  handoff_assumido_por: string | null;
  handoff_assumido_em: string | null;
  minutos_esperando: number;
  atrasado_para_assumir: boolean;
  timeout_atingido: boolean;
}

export interface MetricasTempo {
  respostas: number;
  mediana_segundos: number | null;
  primeiro_contato_mediana_segundos: number | null;
  respondidas_ate_1min: number | null;
  horas_ate_agendar: number | null;
  fora_do_horario: number | null;
}

export interface ItemFollowUp {
  conversation_id: string;
  wa_contact_id: string;
  contact_name: string | null;
  stage: Estagio;
  follow_up_count: number;
  follow_up_max_tentativas: number;
  next_follow_up_at: string;
  last_inbound_at: string | null;
  vencido: boolean;
  janela_aberta: boolean;
  /** Fora da janela de 24h o envio exige template e abre conversa COBRADA. */
  sera_cobrado: boolean;
  interesse: string | null;
}

export interface OrigemLead {
  origem: string;
  total: number;
  agendados: number;
  perdidos: number;
  taxa_conversao: number;
}

export interface ProcedimentoDemanda {
  procedure_id: string;
  nome: string;
  categoria: string;
  interessados: number;
  agendados: number;
  taxa_conversao: number;
}

// --- Leitura -----------------------------------------------------------------

export async function carregarFunil(clinicId: string, dias = 30): Promise<EtapaFunil[]> {
  const { data, error } = await supabase.rpc('funil_periodo', {
    p_clinic_id: clinicId,
    p_dias: dias,
  });
  if (error) throw error;
  return (data ?? []).map((e: EtapaFunil) => ({
    ...e,
    // O Postgres devolve NUMERIC como string no JSON; sem converter, a barra do
    // gráfico recebe "83.3" e a aritmética silenciosamente vira concatenação.
    taxa_da_etapa_anterior:
      e.taxa_da_etapa_anterior === null ? null : Number(e.taxa_da_etapa_anterior),
    alcancaram: Number(e.alcancaram),
    estao_aqui: Number(e.estao_aqui),
  }));
}

export async function carregarResumo(clinicId: string, dias = 30): Promise<ResumoPainel> {
  const { data, error } = await supabase.rpc('painel_resumo', {
    p_clinic_id: clinicId,
    p_dias: dias,
  });
  if (error) throw error;
  const linha = (Array.isArray(data) ? data[0] : data) ?? {};
  return {
    leads_no_periodo: Number(linha.leads_no_periodo ?? 0),
    qualificados: Number(linha.qualificados ?? 0),
    agendados: Number(linha.agendados ?? 0),
    perdidos: Number(linha.perdidos ?? 0),
    em_handoff: Number(linha.em_handoff ?? 0),
    handoff_atrasados: Number(linha.handoff_atrasados ?? 0),
    sem_resposta_24h: Number(linha.sem_resposta_24h ?? 0),
    taxa_agendamento: Number(linha.taxa_agendamento ?? 0),
  };
}

/** Quantos leads em cada temperatura, e quantos estão esfriando. */
export async function carregarTemperatura(
  clinicId: string,
  dias = 30
): Promise<FaixaTemperatura[]> {
  const { data, error } = await supabase.rpc('painel_temperatura', {
    p_clinic_id: clinicId,
    p_dias: dias,
  });
  if (error) throw error;
  return (data ?? []).map((f: FaixaTemperatura) => ({
    ...f,
    total: Number(f.total),
    parados_24h: Number(f.parados_24h),
    agendaram: Number(f.agendaram),
  }));
}

/**
 * A equipe discorda da leitura da IA.
 *
 * Existe porque quem atende no balcão sabe coisas que não estão na conversa —
 * que a pessoa é indicação de uma cliente antiga, que já ligou antes. Travar a
 * temperatura no julgamento do modelo desperdiça isso.
 */
export async function ajustarTemperatura(
  conversationId: string,
  temperatura: Temperatura,
  motivo: string
) {
  const { error } = await supabase
    .from('conversations')
    .update({
      temperatura,
      temperatura_em: new Date().toISOString(),
      temperatura_motivo: motivo,
    })
    .eq('id', conversationId);
  if (error) throw error;
}

export interface FiltroLeads {
  estagio?: Estagio | 'todos';
  temperatura?: Temperatura | 'todas';
  origem?: string | 'todas';
  busca?: string;
  limite?: number;
  /**
   * Esconde perdidos e encerrados.
   *
   * Ligado junto com o filtro de temperatura, porque o termômetro conta só
   * leads ativos: clicar em "FRIO 3" e a lista mostrar 5 faz a equipe
   * desconfiar do painel inteiro, e com razão.
   */
  apenasAtivos?: boolean;
}

export async function carregarLeads(clinicId: string, filtro: FiltroLeads = {}): Promise<Lead[]> {
  let query = supabase
    .from('vw_leads')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(filtro.limite ?? 100);

  if (filtro.estagio && filtro.estagio !== 'todos') query = query.eq('stage', filtro.estagio);
  if (filtro.origem && filtro.origem !== 'todas') query = query.eq('origem', filtro.origem);
  if (filtro.temperatura && filtro.temperatura !== 'todas') {
    query = query.eq('temperatura', filtro.temperatura);
  }
  if (filtro.apenasAtivos) {
    query = query.not('stage', 'in', '("perdido","encerrado")');
  }

  const busca = filtro.busca?.trim();
  if (busca) {
    // Nome do perfil do WhatsApp ou o próprio número — é por um dos dois que a
    // recepção procura alguém, nunca por id.
    query = query.or(`contact_name.ilike.%${busca}%,wa_contact_id.ilike.%${busca}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Lead[];
}

export async function carregarFilaHandoff(clinicId: string): Promise<ItemHandoff[]> {
  const { data, error } = await supabase
    .from('vw_handoff_queue')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('handoff_aberto_em', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((h: ItemHandoff) => ({
    ...h,
    minutos_esperando: Number(h.minutos_esperando ?? 0),
  }));
}

/**
 * Tempo de espera — a prova da proposta de valor.
 *
 * Mediana, não média: uma conversa esquecida por 10 horas distorce a média e o
 * número deixa de descrever o atendimento típico.
 */
export async function carregarMetricasTempo(
  clinicId: string,
  dias = 30
): Promise<MetricasTempo | null> {
  const { data, error } = await supabase.rpc('metricas_tempo', {
    p_clinic_id: clinicId,
    p_dias: dias,
  });
  if (error) throw error;
  const linha = (Array.isArray(data) ? data[0] : data) ?? null;
  if (!linha) return null;
  // O Postgres devolve NUMERIC como string no JSON.
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    respostas: Number(linha.respostas ?? 0),
    mediana_segundos: num(linha.mediana_segundos),
    primeiro_contato_mediana_segundos: num(linha.primeiro_contato_mediana_segundos),
    respondidas_ate_1min: num(linha.respondidas_ate_1min),
    horas_ate_agendar: num(linha.horas_ate_agendar),
    fora_do_horario: num(linha.fora_do_horario),
  };
}

/** "8 s", "3 min", "2 h" — o número tem que ser lido de relance. */
export function formatarDuracao(segundos: number | null): string {
  if (segundos === null) return '—';
  if (segundos < 60) return `${Math.round(segundos)} s`;
  if (segundos < 3600) return `${Math.round(segundos / 60)} min`;
  return `${(segundos / 3600).toFixed(1)} h`;
}

/** Reengajamento agendado: o que já venceu e o que ainda vai sair. */
export async function carregarAgendaFollowUp(clinicId: string): Promise<ItemFollowUp[]> {
  const { data, error } = await supabase
    .from('vw_agenda_follow_up')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('next_follow_up_at', { ascending: true })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ItemFollowUp[];
}

/**
 * Cancela o reengajamento de um lead.
 *
 * `definitivo` marca opt-out: nunca mais recebe, nem quando a régua reiniciar.
 * É o que a recepção usa quando a pessoa pede para não ser mais procurada —
 * insistir depois disso derruba a nota de qualidade do número na Meta.
 */
export async function cancelarFollowUp(conversationId: string, definitivo = false) {
  const { error } = await supabase.rpc('cancelar_follow_up', {
    p_conversation_id: conversationId,
    p_definitivo: definitivo,
  });
  if (error) throw error;
}

export async function carregarOrigens(clinicId: string): Promise<OrigemLead[]> {
  const { data, error } = await supabase
    .from('vw_origem_leads')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('total', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((o: OrigemLead) => ({
    ...o,
    total: Number(o.total),
    agendados: Number(o.agendados),
    taxa_conversao: Number(o.taxa_conversao),
  }));
}

export async function carregarProcedimentosDemanda(
  clinicId: string
): Promise<ProcedimentoDemanda[]> {
  const { data, error } = await supabase
    .from('vw_procedimentos_demanda')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('interessados', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p: ProcedimentoDemanda) => ({
    ...p,
    interessados: Number(p.interessados),
    agendados: Number(p.agendados),
    taxa_conversao: Number(p.taxa_conversao),
  }));
}

// --- Ações -------------------------------------------------------------------

/**
 * Devolve a conversa para a IA, no estágio de onde ela saiu.
 *
 * Passa pela função do banco, e não por um UPDATE direto, porque é ela que
 * valida o grafo de transições e grava o histórico. Estágio alterado por fora
 * é transição perdida — e três meses depois ninguém explica o que aconteceu.
 */
export async function devolverParaIA(conversationId: string, userId: string | null) {
  const { error } = await supabase.rpc('close_handoff', {
    p_conversation_id: conversationId,
    p_actor_user_id: userId,
    p_to_stage: null,
    p_motivo: 'Atendimento humano concluído pelo painel',
  });
  if (error) throw error;
}

export async function assumirAtendimento(conversationId: string, userId: string) {
  const { error } = await supabase
    .from('conversations')
    .update({ handoff_assumido_por: userId, handoff_assumido_em: new Date().toISOString() })
    .eq('id', conversationId);
  if (error) throw error;
}

export async function moverEstagio(
  conversationId: string,
  paraEstagio: Estagio,
  userId: string | null,
  motivo: string
) {
  const { error } = await supabase.rpc('advance_conversation_stage', {
    p_conversation_id: conversationId,
    p_to_stage: paraEstagio,
    // 'humano' é o único gatilho que pode forçar caminho fora do grafo: a equipe
    // precisa conseguir destravar uma conversa presa, mesmo sem rota prevista.
    p_trigger: 'humano',
    p_motivo: motivo,
    p_actor_user_id: userId,
    p_metadata: {},
  });
  if (error) throw error;
}

// --- Apresentação ------------------------------------------------------------

export const ROTULO_ESTAGIO: Record<Estagio, string> = {
  novo: 'Novo',
  qualificando: 'Qualificando',
  qualificado: 'Qualificado',
  agendando: 'Agendando',
  agendado: 'Agendado',
  aguardando_humano: 'Com a equipe',
  perdido: 'Perdido',
  encerrado: 'Encerrado',
};

export const ROTULO_ORIGEM: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  trafego_pago: 'Tráfego pago',
  indicacao: 'Indicação',
  site: 'Site',
  outro: 'Outro',
};

export const ROTULO_AGENTE: Record<string, string> = {
  sdr: 'SDR',
  agendador: 'Agendador',
  follow_up: 'Follow-up',
  handoff: 'Equipe',
};

export const ROTULO_TEMPERATURA: Record<Temperatura, string> = {
  quente: 'Quente',
  morno: 'Morno',
  frio: 'Frio',
};

/** O que a Solara faz em cada temperatura — a equipe precisa saber o que esperar. */
export const EXPLICA_TEMPERATURA: Record<Temperatura, string> = {
  quente: 'Quer marcar. A Solara não faz mais pergunta, passa direto pro agendamento.',
  morno: 'Tem interesse, mas algo trava. A Solara resolve essa objeção e propõe o próximo passo.',
  frio: 'Está pesquisando. A Solara informa e faz a pessoa perceber o que ganha — sem empurrar horário.',
};

export const ROTULO_URGENCIA: Record<string, string> = {
  imediata: 'Quer agora',
  ate_30_dias: 'Até 30 dias',
  sem_pressa: 'Sem pressa',
};

/** "há 3 min", "há 2 h", "há 4 dias" — leitura de fila, não data exata. */
export function haQuantoTempo(iso: string | null): string {
  if (!iso) return '—';
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/** 5511987654321 -> (11) 98765-4321 */
export function formatarTelefone(waId: string): string {
  const digitos = waId.replace(/\D/g, '');
  const semDdi = digitos.startsWith('55') ? digitos.slice(2) : digitos;
  if (semDdi.length === 11) {
    return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 7)}-${semDdi.slice(7)}`;
  }
  if (semDdi.length === 10) {
    return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 6)}-${semDdi.slice(6)}`;
  }
  return waId;
}
