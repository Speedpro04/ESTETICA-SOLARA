/**
 * Camada de dados do briefing.
 *
 * O briefing é o que separa um SDR que não erra de um que vende: é aqui que a
 * clínica diz para quem ela é boa, o que faz melhor, por que custa o que custa e
 * quando parar de insistir. Campo vazio não vira prompt — vira vendedor genérico.
 *
 * Por isso o formulário salva SEÇÃO A SEÇÃO, e não tudo no fim: um briefing rico
 * é longo, e quem preenche vai embora no meio. Perder o que já foi escrito é a
 * forma mais rápida de a clínica nunca terminar.
 */
import { supabase } from './supabase';

// --- Tipos -------------------------------------------------------------------

export type DivulgacaoPreco = 'valor' | 'faixa' | 'nunca';
export type PosturaComercial = 'consultivo' | 'equilibrado' | 'direto';
export type ProximaAcao =
  | 'avaliacao_presencial'
  | 'avaliacao_online'
  | 'orcamento'
  | 'visita_conhecer';

export interface PerguntaQualificacao {
  pergunta: string;
  porque?: string;
}

export type Posicionamento = 'alto_padrao' | 'volume';

export interface Briefing {
  clinic_id: string;

  // Chave mestra: troca tom, agressividade e régua de uma vez.
  posicionamento: Posicionamento;
  max_perguntas_antes_de_agendar: number;

  // Identidade
  tom_de_voz: string | null;
  tratamento: 'voce' | 'senhor_senhora';
  usar_emoji: boolean;
  palavras_proibidas: string[];
  publico_alvo: string | null;
  diferenciais: string | null;

  // Cliente ideal
  cliente_ideal: string | null;
  faixa_etaria_principal: string | null;
  motivacoes_comuns: string | null;
  perfil_desqualificado: string | null;

  // Valor
  diferenciais_concretos: string | null;
  prova_social: string | null;
  garantias: string | null;
  justificativa_de_preco: string | null;

  // Preço
  divulgacao_preco: DivulgacaoPreco;
  resposta_quando_nao_informa: string | null;
  condicoes_pagamento: string | null;
  parcelamento_maximo: number | null;

  // Conversão
  gatilhos_de_urgencia: string | null;
  oferta_vigente: string | null;
  oferta_valida_ate: string | null;
  oferta_de_destrave: string | null;
  proxima_acao_desejada: ProximaAcao;

  // Qualificação
  criterio_qualificado: string | null;
  perguntas_qualificacao: PerguntaQualificacao[];
  assuntos_autorizados: string | null;
  exige_interesse_procedimento: boolean;
  exige_sinal_orcamento: boolean;
  exige_urgencia: boolean;
  idade_minima: number;

  // Postura
  postura_comercial: PosturaComercial;
  pode_oferecer_desconto: boolean;
  desconto_maximo_percentual: number | null;
  tentativas_antes_de_recuar: number;
  resposta_a_concorrente: string | null;

  // Agenda
  antecedencia_minima_horas: number;
  antecedencia_maxima_dias: number;
  duracao_avaliacao_minutos: number;
  aviso_cancelamento_horas: number;
  politica_cancelamento: string | null;
  avaliacao_e_paga: boolean;
  avaliacao_preco_centavos: number | null;

  // Handoff
  handoff_so_em_horario_comercial: boolean;
  handoff_prazo_assumir_minutos: number;
  handoff_timeout_minutos: number;
  handoff_mensagem_espera: string | null;

  // Follow-up
  follow_up_ativo: boolean;
  follow_up_max_tentativas: number;
  follow_up_silencio_inicio: string;
  follow_up_silencio_fim: string;

  // Conformidade
  proibir_promessa_resultado: boolean;
  observacoes_conformidade: string | null;
}

export interface Procedimento {
  id?: string;
  clinic_id?: string;
  nome: string;
  apelidos: string[];
  categoria: 'facial' | 'corporal' | 'injetavel' | 'cirurgico' | 'capilar' | 'outro';
  descricao: string | null;
  preco_de_centavos: number | null;
  preco_ate_centavos: number | null;
  duracao_minutos: number | null;
  sessoes_tipicas: number | null;
  parcelamento_maximo: number | null;
  exige_avaliacao: boolean;
  preparo: string | null;
  recuperacao: string | null;
  contraindicacoes: string | null;
  ativo: boolean;
}

export interface Objecao {
  id?: string;
  clinic_id?: string;
  objecao: string;
  resposta: string;
  categoria: 'preco' | 'medo' | 'tempo' | 'confianca' | 'concorrente' | 'outro';
  ativo: boolean;
}

export interface JanelaExpediente {
  id?: string;
  clinic_id?: string;
  /** ISO: 1 = segunda ... 7 = domingo. Igual ao banco, sem conversão no meio. */
  dia_semana: number;
  abre: string;
  fecha: string;
  ativo: boolean;
}

export interface ItemProntidao {
  item: string;
  ok: boolean;
  detalhe: string;
}

export interface Completude {
  secao: string;
  preenchidos: number;
  total: number;
}

// --- Briefing ----------------------------------------------------------------

/**
 * Carrega o briefing, criando a linha se ainda não existir.
 *
 * Criar na leitura evita o caso em que a clínica preenche a primeira seção e o
 * salvamento falha porque não havia linha para atualizar.
 */
export async function carregarBriefing(clinicId: string): Promise<Briefing | null> {
  const { data, error } = await supabase
    .from('clinic_briefing')
    .select('*')
    .eq('clinic_id', clinicId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data as Briefing;

  const { data: criado, error: erroCriacao } = await supabase
    .from('clinic_briefing')
    .insert({ clinic_id: clinicId })
    .select()
    .single();

  if (erroCriacao) throw erroCriacao;
  return criado as Briefing;
}

export async function salvarBriefing(
  clinicId: string,
  campos: Partial<Briefing>
): Promise<void> {
  const { error } = await supabase
    .from('clinic_briefing')
    .update(campos)
    .eq('clinic_id', clinicId);
  if (error) throw error;
}

// --- Expediente --------------------------------------------------------------

export async function carregarExpediente(clinicId: string): Promise<JanelaExpediente[]> {
  const { data, error } = await supabase
    .from('clinic_hours')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('dia_semana')
    .order('abre');
  if (error) throw error;
  return (data ?? []) as JanelaExpediente[];
}

/**
 * Substitui o expediente inteiro pelo que está na tela.
 *
 * Apaga e reinsere em vez de diferenciar linha a linha: o expediente é pequeno
 * (raramente passa de 14 linhas) e a substituição elimina a classe de bug em que
 * uma janela removida na interface continua valendo no banco — que, aqui, faria
 * a Solara oferecer horário com a clínica fechada.
 */
export async function salvarExpediente(
  clinicId: string,
  janelas: JanelaExpediente[]
): Promise<void> {
  const { error: erroDelete } = await supabase
    .from('clinic_hours')
    .delete()
    .eq('clinic_id', clinicId);
  if (erroDelete) throw erroDelete;

  const validas = janelas.filter((j) => j.abre && j.fecha && j.fecha > j.abre);
  if (validas.length === 0) return;

  const { error } = await supabase.from('clinic_hours').insert(
    validas.map((j) => ({
      clinic_id: clinicId,
      dia_semana: j.dia_semana,
      abre: j.abre,
      fecha: j.fecha,
      ativo: true,
    }))
  );
  if (error) throw error;
}

// --- Procedimentos -----------------------------------------------------------

export async function carregarProcedimentos(clinicId: string): Promise<Procedimento[]> {
  const { data, error } = await supabase
    .from('procedures')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('display_order')
    .order('nome');
  if (error) throw error;
  return (data ?? []) as Procedimento[];
}

export async function salvarProcedimento(
  clinicId: string,
  procedimento: Procedimento
): Promise<Procedimento> {
  const payload = { ...procedimento, clinic_id: clinicId };
  delete (payload as Record<string, unknown>).id;

  const query = procedimento.id
    ? supabase.from('procedures').update(payload).eq('id', procedimento.id)
    : supabase.from('procedures').insert(payload);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as Procedimento;
}

export async function removerProcedimento(id: string): Promise<void> {
  const { error } = await supabase.from('procedures').delete().eq('id', id);
  if (error) throw error;
}

// --- Objeções ----------------------------------------------------------------

export async function carregarObjecoes(clinicId: string): Promise<Objecao[]> {
  const { data, error } = await supabase
    .from('briefing_objections')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('categoria');
  if (error) throw error;
  return (data ?? []) as Objecao[];
}

export async function salvarObjecao(clinicId: string, objecao: Objecao): Promise<Objecao> {
  const payload = { ...objecao, clinic_id: clinicId };
  delete (payload as Record<string, unknown>).id;

  const query = objecao.id
    ? supabase.from('briefing_objections').update(payload).eq('id', objecao.id)
    : supabase.from('briefing_objections').insert(payload);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as Objecao;
}

export async function removerObjecao(id: string): Promise<void> {
  const { error } = await supabase.from('briefing_objections').delete().eq('id', id);
  if (error) throw error;
}

// --- Diagnóstico -------------------------------------------------------------

/** O que ainda falta para a Solara poder atender. Vem pronto do banco. */
export async function carregarProntidao(clinicId: string): Promise<ItemProntidao[]> {
  const { data, error } = await supabase.rpc('clinica_pronta', { p_clinic_id: clinicId });
  if (error) throw error;
  return (data ?? []) as ItemProntidao[];
}

export async function carregarCompletude(clinicId: string): Promise<Completude[]> {
  const { data, error } = await supabase.rpc('briefing_completude', { p_clinic_id: clinicId });
  if (error) throw error;
  return (data ?? []) as Completude[];
}

// --- Utilidades --------------------------------------------------------------

export const DIAS_SEMANA = [
  { valor: 1, curto: 'Seg', longo: 'Segunda' },
  { valor: 2, curto: 'Ter', longo: 'Terça' },
  { valor: 3, curto: 'Qua', longo: 'Quarta' },
  { valor: 4, curto: 'Qui', longo: 'Quinta' },
  { valor: 5, curto: 'Sex', longo: 'Sexta' },
  { valor: 6, curto: 'Sáb', longo: 'Sábado' },
  { valor: 7, curto: 'Dom', longo: 'Domingo' },
] as const;

/** "1.250,00" -> 125000. Aceita o que a pessoa digitar, sem exigir formato. */
export function paraCentavos(texto: string): number | null {
  const limpo = (texto ?? '').replace(/[^\d,.-]/g, '').trim();
  if (!limpo) return null;
  // Vírgula é decimal no Brasil; ponto costuma ser separador de milhar.
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? Math.round(numero * 100) : null;
}

export function deCentavos(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return '';
  return (centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
