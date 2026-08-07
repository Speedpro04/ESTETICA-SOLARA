/**
 * Briefing da clínica — o que ensina a Solara a vender.
 *
 * Três decisões de desenho, e cada uma resolve um jeito conhecido de este
 * formulário falhar:
 *
 *   Salva por seção.       Um briefing rico é longo. Quem preenche vai embora no
 *                          meio, e perder o que já escreveu é a forma mais rápida
 *                          de a clínica nunca terminar.
 *   Dica em cada campo.    Explica o que a Solara FAZ com aquilo. Sem isso vem
 *                          "atendimento humanizado" — que não vende nada, porque
 *                          todo mundo escreve igual.
 *   Progresso por seção.   Briefing pela metade não dá erro: dá vendedor
 *                          genérico. A clínica precisa ver isso em número, e não
 *                          descobrir três semanas depois pela conversa ruim.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { colors, fonts, radius, shadow } from './brand/tokens';
import { Area, Aviso, Campo, Chave, Escolha, ListaTexto, Numero, Texto } from './briefing/campos';
import {
  carregarBriefing,
  carregarCompletude,
  carregarExpediente,
  carregarObjecoes,
  carregarProcedimentos,
  carregarProntidao,
  deCentavos,
  DIAS_SEMANA,
  paraCentavos,
  removerObjecao,
  removerProcedimento,
  salvarBriefing,
  salvarExpediente,
  salvarObjecao,
  salvarProcedimento,
  type Briefing as DadosBriefing,
  type Completude,
  type ItemProntidao,
  type JanelaExpediente,
  type Objecao,
  type Procedimento,
} from './lib/briefing';

type ChaveSecao =
  | 'identidade'
  | 'cliente_ideal'
  | 'procedimentos'
  | 'valor'
  | 'conversao'
  | 'postura'
  | 'objecoes'
  | 'agenda'
  | 'atendimento';

const SECOES: { chave: ChaveSecao; titulo: string; resumo: string; completude?: string }[] = [
  { chave: 'identidade', titulo: 'Identidade e tom', resumo: 'Como a Solara fala em nome da clínica', completude: 'identidade' },
  { chave: 'cliente_ideal', titulo: 'Cliente ideal', resumo: 'Para quem esta clínica é boa — e para quem não é', completude: 'cliente_ideal' },
  { chave: 'procedimentos', titulo: 'Procedimentos', resumo: 'O catálogo que o SDR usa para qualificar', completude: 'procedimentos' },
  { chave: 'valor', titulo: 'Valor e preço', resumo: 'Por que vale o que custa', completude: 'valor' },
  { chave: 'conversao', titulo: 'Conversão', resumo: 'Como levar a pessoa ao próximo passo', completude: 'conversao' },
  { chave: 'postura', titulo: 'Postura comercial', resumo: 'Quanto insistir, e quando parar' },
  { chave: 'objecoes', titulo: 'Objeções', resumo: 'A resposta autorizada para cada "mas..."', completude: 'objecoes' },
  { chave: 'agenda', titulo: 'Agenda', resumo: 'Expediente real — sem isso não se agenda nada', completude: 'agenda' },
  { chave: 'atendimento', titulo: 'Handoff e follow-up', resumo: 'Quando chamar um humano e quando reengajar' },
];

const ROTULO_PRONTIDAO: Record<string, string> = {
  expediente: 'Expediente cadastrado',
  procedimentos: 'Catálogo de procedimentos',
  briefing: 'Briefing de vendas',
  numero_whatsapp: 'Número do WhatsApp conectado',
  destinatario_handoff: 'Quem recebe os alertas',
};

export default function Briefing({ clinicId }: { clinicId: string }) {
  const [secao, setSecao] = useState<ChaveSecao>('identidade');
  const [dados, setDados] = useState<DadosBriefing | null>(null);
  const [procedimentos, setProcedimentos] = useState<Procedimento[]>([]);
  const [objecoes, setObjecoes] = useState<Objecao[]>([]);
  const [expediente, setExpediente] = useState<JanelaExpediente[]>([]);
  const [prontidao, setProntidao] = useState<ItemProntidao[]>([]);
  const [completude, setCompletude] = useState<Completude[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);

  const recarregarDiagnostico = useCallback(async () => {
    const [p, c] = await Promise.all([carregarProntidao(clinicId), carregarCompletude(clinicId)]);
    setProntidao(p);
    setCompletude(c);
  }, [clinicId]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [b, procs, objs, exp] = await Promise.all([
          carregarBriefing(clinicId),
          carregarProcedimentos(clinicId),
          carregarObjecoes(clinicId),
          carregarExpediente(clinicId),
        ]);
        if (!vivo) return;
        setDados(b);
        setProcedimentos(procs);
        setObjecoes(objs);
        setExpediente(exp);
        await recarregarDiagnostico();
      } catch (erro) {
        if (vivo) setAviso({ texto: `Não consegui carregar: ${(erro as Error).message}`, erro: true });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clinicId, recarregarDiagnostico]);

  const editar = (campos: Partial<DadosBriefing>) =>
    setDados((atual) => (atual ? { ...atual, ...campos } : atual));

  async function salvarSecao() {
    if (!dados) return;
    setSalvando(true);
    setAviso(null);
    try {
      if (secao === 'agenda') await salvarExpediente(clinicId, expediente);
      await salvarBriefing(clinicId, semChavesDerivadas(dados));
      await recarregarDiagnostico();
      setAviso({ texto: 'Seção salva.', erro: false });
    } catch (erro) {
      setAviso({ texto: `Não salvou: ${(erro as Error).message}`, erro: true });
    } finally {
      setSalvando(false);
    }
  }

  const progressoPorSecao = useMemo(() => {
    const mapa = new Map<string, Completude>();
    completude.forEach((c) => mapa.set(c.secao, c));
    return mapa;
  }, [completude]);

  const pendencias = prontidao.filter((p) => !p.ok);

  if (carregando) return <Centro>Carregando o briefing…</Centro>;
  if (!dados) return <Centro>Não foi possível abrir o briefing desta clínica.</Centro>;

  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', fontFamily: fonts.body }}>
      <nav style={{ width: 268, flexShrink: 0, position: 'sticky', top: 24 }}>
        <h2 style={{ fontFamily: fonts.display, fontSize: 22, color: colors.ink, margin: '0 0 4px' }}>
          Briefing da clínica
        </h2>
        <p style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.5, margin: '0 0 18px' }}>
          É isto que a Solara sabe sobre vocês. Quanto mais completo, melhor ela vende.
        </p>

        {SECOES.map((s) => {
          const prog = s.completude ? progressoPorSecao.get(s.completude) : undefined;
          const ativa = s.chave === secao;
          return (
            <button
              key={s.chave}
              type="button"
              onClick={() => setSecao(s.chave)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                marginBottom: 4,
                background: ativa ? colors.sand : 'transparent',
                border: 'none',
                borderLeft: `3px solid ${ativa ? colors.rose : 'transparent'}`,
                borderRadius: radius.base,
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: ativa ? 600 : 500, color: colors.ink }}>
                  {s.titulo}
                </span>
                {prog && (
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: prog.preenchidos >= prog.total ? colors.success : colors.textMuted,
                    }}
                  >
                    {Math.min(prog.preenchidos, prog.total)}/{prog.total}
                  </span>
                )}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                {s.resumo}
              </span>
            </button>
          );
        })}
      </nav>

      <main style={{ flex: 1, minWidth: 0, maxWidth: 760 }}>
        {pendencias.length > 0 && (
          <div
            style={{
              padding: '14px 16px',
              marginBottom: 22,
              background: colors.white,
              border: `1px solid ${colors.border}`,
              borderLeft: `3px solid ${colors.warn}`,
              borderRadius: radius.base,
              boxShadow: shadow.sm,
            }}
          >
            <strong style={{ fontSize: 14, color: colors.ink }}>
              Falta {pendencias.length === 1 ? 'um item' : `${pendencias.length} itens`} para a
              Solara começar a atender
            </strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {pendencias.map((p) => (
                <li key={p.item} style={{ fontSize: 13, color: colors.inkSoft, lineHeight: 1.6 }}>
                  <b>{ROTULO_PRONTIDAO[p.item] ?? p.item}</b> — {p.detalhe}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          style={{
            padding: 28,
            background: colors.white,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.base,
            boxShadow: shadow.sm,
          }}
        >
          {secao === 'identidade' && <SecaoIdentidade dados={dados} editar={editar} />}
          {secao === 'cliente_ideal' && <SecaoClienteIdeal dados={dados} editar={editar} />}
          {secao === 'procedimentos' && (
            <SecaoProcedimentos
              clinicId={clinicId}
              procedimentos={procedimentos}
              setProcedimentos={setProcedimentos}
              aoMudar={recarregarDiagnostico}
            />
          )}
          {secao === 'valor' && <SecaoValor dados={dados} editar={editar} />}
          {secao === 'conversao' && <SecaoConversao dados={dados} editar={editar} />}
          {secao === 'postura' && <SecaoPostura dados={dados} editar={editar} />}
          {secao === 'objecoes' && (
            <SecaoObjecoes
              clinicId={clinicId}
              objecoes={objecoes}
              setObjecoes={setObjecoes}
              aoMudar={recarregarDiagnostico}
            />
          )}
          {secao === 'agenda' && (
            <SecaoAgenda
              dados={dados}
              editar={editar}
              expediente={expediente}
              setExpediente={setExpediente}
            />
          )}
          {secao === 'atendimento' && <SecaoAtendimento dados={dados} editar={editar} />}

          {secao !== 'procedimentos' && secao !== 'objecoes' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginTop: 26,
                paddingTop: 20,
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              <button
                type="button"
                onClick={salvarSecao}
                disabled={salvando}
                style={{
                  padding: '10px 22px',
                  fontFamily: fonts.body,
                  fontSize: 14,
                  fontWeight: 600,
                  color: colors.white,
                  background: salvando ? colors.textMuted : colors.rose,
                  border: 'none',
                  borderRadius: radius.base,
                  cursor: salvando ? 'default' : 'pointer',
                }}
              >
                {salvando ? 'Salvando…' : 'Salvar esta seção'}
              </button>
              {aviso && (
                <span style={{ fontSize: 13.5, color: aviso.erro ? colors.danger : colors.success }}>
                  {aviso.texto}
                </span>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** Remove o que não é coluna gravável antes do update. */
function semChavesDerivadas(dados: DadosBriefing): Partial<DadosBriefing> {
  const copia: Record<string, unknown> = { ...dados };
  ['clinic_id', 'created_at', 'updated_at', 'secoes_preenchidas'].forEach((k) => delete copia[k]);
  return copia as Partial<DadosBriefing>;
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 48, textAlign: 'center', fontFamily: fonts.body, color: colors.textMuted }}>
      {children}
    </div>
  );
}

function Titulo({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h3 style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink, margin: 0 }}>
        {children}
      </h3>
      {sub && (
        <p style={{ fontSize: 13.5, color: colors.textMuted, lineHeight: 1.55, margin: '6px 0 0' }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// --- Seções ------------------------------------------------------------------

interface PropsSecao {
  dados: DadosBriefing;
  editar: (campos: Partial<DadosBriefing>) => void;
}

function SecaoIdentidade({ dados, editar }: PropsSecao) {
  return (
    <>
      <Titulo sub="A Solara sempre se chama Solara, mas fala com a voz de vocês.">
        Identidade e tom
      </Titulo>

      <Campo
        rotulo="Posicionamento da clínica"
        dica="É a escolha que mais muda o comportamento da Solara: tom, quanto ela insiste e quanto pergunta antes de oferecer horário."
        obrigatorio
      >
        <Escolha
          valor={dados.posicionamento}
          aoMudar={(v) => editar({ posicionamento: v })}
          opcoes={[
            {
              valor: 'alto_padrao',
              rotulo: 'Alto padrão',
              descricao:
                'O que se vende é tempo: não esperar, não repetir, não voltar amanhã. Ela é breve, não pressiona e nunca usa promoção como argumento.',
            },
            {
              valor: 'volume',
              rotulo: 'Volume e acessibilidade',
              descricao:
                'Parcelamento e condição de pagamento entram cedo na conversa, junto com a facilidade de agendar.',
            },
          ]}
        />
      </Campo>

      <Campo
        rotulo="Perguntas antes de oferecer horário"
        dica="Quanto menor, mais rápido a pessoa vê uma data. Cada pergunta a mais é uma chance a mais de ela sumir — o que faltar, a equipe descobre na avaliação."
      >
        <Numero
          valor={dados.max_perguntas_antes_de_agendar}
          aoMudar={(v) => editar({ max_perguntas_antes_de_agendar: v ?? 2 })}
          min={0}
          max={6}
          sufixo="no máximo"
        />
      </Campo>

      <Campo
        rotulo="Como a marca fala"
        dica="Descreva o jeito, não adjetivos. Ex.: 'acolhedora e direta, sem termo técnico; explica como se estivesse conversando na recepção'."
      >
        <Area
          valor={dados.tom_de_voz ?? ''}
          aoMudar={(v) => editar({ tom_de_voz: v })}
          exemplo="Acolhedora, discreta e segura. Nada de euforia nem de promessa."
        />
      </Campo>

      <Campo rotulo="Tratamento">
        <Escolha
          valor={dados.tratamento}
          aoMudar={(v) => editar({ tratamento: v })}
          opcoes={[
            { valor: 'voce', rotulo: 'Você', descricao: 'Mais próximo. Funciona na maioria das clínicas.' },
            { valor: 'senhor_senhora', rotulo: 'Senhor / Senhora', descricao: 'Mais formal. Público mais velho ou tradicional.' },
          ]}
        />
      </Campo>

      <Campo rotulo="Emoji" dica="Por padrão a Solara não usa nenhum: em clínica de alto padrão, emoji entrega atendimento automatizado.">
        <Chave
          valor={dados.usar_emoji}
          aoMudar={(v) => editar({ usar_emoji: v })}
          rotulo="Autorizar emoji"
          dica="Se ligar, ela usa no máximo um, e só quando somar."
        />
      </Campo>

      <Campo
        rotulo="Palavras que vocês não usam"
        dica="Uma por linha. A Solara evita todas. Útil para termos que o conselho restringe ou que a marca não adota."
      >
        <ListaTexto
          itens={dados.palavras_proibidas ?? []}
          aoMudar={(v) => editar({ palavras_proibidas: v })}
          exemplo={'milagre\ngarantido\nbarato'}
        />
      </Campo>

      <Campo rotulo="Público da clínica, em uma frase">
        <Texto
          valor={dados.publico_alvo ?? ''}
          aoMudar={(v) => editar({ publico_alvo: v })}
          exemplo="Mulheres de 30 a 55 anos, classe A/B, da zona sul"
        />
      </Campo>

      <Campo rotulo="Diferenciais, em uma frase" dica="O detalhe fica na seção Valor. Aqui é o resumo que ela pode usar na abertura.">
        <Texto
          valor={dados.diferenciais ?? ''}
          aoMudar={(v) => editar({ diferenciais: v })}
          exemplo="Avaliação sem pressa, com a médica, e acompanhamento incluso"
        />
      </Campo>
    </>
  );
}

function SecaoClienteIdeal({ dados, editar }: PropsSecao) {
  return (
    <>
      <Titulo sub="Sem isto o SDR trata igual quem quer botox aos 30 e quem quer lifting aos 60. São conversas diferentes, com medos diferentes.">
        Cliente ideal
      </Titulo>

      <Campo
        rotulo="Quem é a cliente ideal de vocês"
        dica="Quanto mais específico, melhor a Solara reconhece quem tem perfil já nas primeiras mensagens."
        obrigatorio
      >
        <Area
          valor={dados.cliente_ideal ?? ''}
          aoMudar={(v) => editar({ cliente_ideal: v })}
          exemplo="Mulher de 35 a 50 anos que já fez algum procedimento antes, valoriza resultado natural e tem medo de ficar com aparência artificial."
        />
      </Campo>

      <Campo rotulo="Faixa etária predominante">
        <Texto
          valor={dados.faixa_etaria_principal ?? ''}
          aoMudar={(v) => editar({ faixa_etaria_principal: v })}
          exemplo="35 a 50 anos"
        />
      </Campo>

      <Campo
        rotulo="O que costuma trazer essas pessoas"
        dica="A dor ou o desejo REAL por trás do procedimento. É o que a Solara precisa nomear para a pessoa se sentir entendida em vez de atendida."
      >
        <Area
          valor={dados.motivacoes_comuns ?? ''}
          aoMudar={(v) => editar({ motivacoes_comuns: v })}
          exemplo="Sentir que o rosto ficou cansado. Corpo depois da gestação. Evento importante chegando. Voltar a se reconhecer no espelho."
        />
      </Campo>

      <Campo
        rotulo="Quem NÃO é cliente de vocês"
        dica="Reconhecer cedo economiza a agenda: evita avaliação com quem chegou com expectativa irreal ou procurando só o menor preço."
      >
        <Area
          valor={dados.perfil_desqualificado ?? ''}
          aoMudar={(v) => editar({ perfil_desqualificado: v })}
          exemplo="Quem quer resultado de cirurgia com procedimento injetável. Quem só compara preço. Quem quer fazer no mesmo dia."
        />
      </Campo>
    </>
  );
}

function SecaoValor({ dados, editar }: PropsSecao) {
  return (
    <>
      <Titulo sub="É aqui que se defende preço sem dar desconto.">Valor e preço</Titulo>

      <Aviso>
        <b>Evite adjetivo.</b> "Atendimento humanizado" não convence ninguém — todo mundo escreve
        igual. "Toxina da marca X, importada, com nota do lote" convence.
      </Aviso>

      <Campo rotulo="Diferenciais concretos" dica="Coisas verificáveis: marca do produto, equipamento, formação, tempo de avaliação." obrigatorio>
        <Area
          valor={dados.diferenciais_concretos ?? ''}
          aoMudar={(v) => editar({ diferenciais_concretos: v })}
          exemplo="Avaliação de 40 minutos com a médica, não com consultora. Toxina importada com rastreio de lote. Retorno de 15 dias incluso."
        />
      </Campo>

      <Campo rotulo="Prova social" dica="Número específico convence; adjetivo, não. A Solara pode citar isto.">
        <Area
          valor={dados.prova_social ?? ''}
          aoMudar={(v) => editar({ prova_social: v })}
          exemplo="12 anos de clínica, mais de 4 mil procedimentos, médica com título pela SBD."
          linhas={3}
        />
      </Campo>

      <Campo rotulo="Garantias e acompanhamento" dica="É o que destrava quem tem MEDO — que é diferente de quem acha caro.">
        <Area
          valor={dados.garantias ?? ''}
          aoMudar={(v) => editar({ garantias: v })}
          exemplo="Retorno em 15 dias incluso. Retoque sem custo se necessário. WhatsApp direto com a equipe no pós."
          linhas={3}
        />
      </Campo>

      <Campo rotulo="Por que custa o que custa" dica="Sem isto a Solara defende preço com 'vale a pena', que é o mesmo que não defender.">
        <Area
          valor={dados.justificativa_de_preco ?? ''}
          aoMudar={(v) => editar({ justificativa_de_preco: v })}
          exemplo="O valor inclui a avaliação com a médica, o produto importado e o retorno. Clínica mais barata costuma usar produto nacional e atendimento de 10 minutos."
        />
      </Campo>

      <Campo
        rotulo="A Solara pode informar preço no WhatsApp?"
        dica="Decisão comercial mais sensível do nicho. Muita clínica de alto padrão só fala valor na avaliação."
      >
        <Escolha
          valor={dados.divulgacao_preco}
          aoMudar={(v) => editar({ divulgacao_preco: v })}
          opcoes={[
            { valor: 'nunca', rotulo: 'Nunca', descricao: 'Só na avaliação. Ela acolhe e conduz para a consulta.' },
            { valor: 'faixa', rotulo: 'Faixa de valores', descricao: 'Diz "de X a Y", conforme o cadastro do procedimento.' },
            { valor: 'valor', rotulo: 'Valor a partir de', descricao: 'Informa o valor inicial do procedimento.' },
          ]}
        />
      </Campo>

      {dados.divulgacao_preco === 'nunca' && (
        <Campo rotulo="O que dizer quando perguntarem o preço" dica="Ela usa esta ideia, com as palavras dela, sem soar ensaiada.">
          <Area
            valor={dados.resposta_quando_nao_informa ?? ''}
            aoMudar={(v) => editar({ resposta_quando_nao_informa: v })}
            exemplo="O valor depende do que você precisa, e isso a médica só define vendo de perto. A avaliação é o que dá o número certo — sem ela eu chutaria."
            linhas={3}
          />
        </Campo>
      )}

      <Campo rotulo="Condições de pagamento">
        <Area
          valor={dados.condicoes_pagamento ?? ''}
          aoMudar={(v) => editar({ condicoes_pagamento: v })}
          exemplo="Pix, cartão em até 6x sem juros, ou 10x com juros."
          linhas={2}
        />
      </Campo>

      <Campo rotulo="Parcelamento máximo">
        <Numero
          valor={dados.parcelamento_maximo}
          aoMudar={(v) => editar({ parcelamento_maximo: v })}
          min={1}
          max={24}
          sufixo="vezes"
        />
      </Campo>
    </>
  );
}

function SecaoConversao({ dados, editar }: PropsSecao) {
  const perguntas = dados.perguntas_qualificacao ?? [];

  return (
    <>
      <Titulo sub="O que a Solara está tentando conseguir, e como ela chega lá.">Conversão</Titulo>

      <Campo rotulo="Objetivo de toda conversa" obrigatorio>
        <Escolha
          valor={dados.proxima_acao_desejada}
          aoMudar={(v) => editar({ proxima_acao_desejada: v })}
          opcoes={[
            { valor: 'avaliacao_presencial', rotulo: 'Avaliação presencial', descricao: 'O padrão em estética e plástica.' },
            { valor: 'avaliacao_online', rotulo: 'Avaliação online', descricao: 'Primeira conversa por vídeo.' },
            { valor: 'orcamento', rotulo: 'Enviar orçamento', descricao: 'Coleta os dados e a equipe envia.' },
            { valor: 'visita_conhecer', rotulo: 'Visita para conhecer', descricao: 'Sem compromisso de avaliação.' },
          ]}
        />
      </Campo>

      <Campo
        rotulo="O que conta como lead qualificado aqui"
        dica="É o critério que faz a Solara passar a pessoa para o agendamento. Seja concreto."
        obrigatorio
      >
        <Area
          valor={dados.criterio_qualificado ?? ''}
          aoMudar={(v) => editar({ criterio_qualificado: v })}
          exemplo="Disse qual procedimento quer, mora na região, e demonstrou querer marcar nos próximos 30 dias."
        />
      </Campo>

      <Campo
        rotulo="Perguntas que ela deve fazer, na ordem"
        dica="Uma por linha. A Solara faz uma por mensagem e espera a resposta — nunca todas de uma vez."
      >
        <ListaTexto
          itens={perguntas.map((p) => p.pergunta)}
          aoMudar={(linhas) =>
            editar({ perguntas_qualificacao: linhas.map((pergunta) => ({ pergunta })) })
          }
          exemplo={'O que te incomoda hoje?\nJá fez algum procedimento antes?\nTem algum prazo em mente?'}
        />
      </Campo>

      <Campo
        rotulo="Urgência real"
        dica="Só use se for verdade. Urgência inventada queima a marca e a pessoa percebe."
      >
        <Area
          valor={dados.gatilhos_de_urgencia ?? ''}
          aoMudar={(v) => editar({ gatilhos_de_urgencia: v })}
          exemplo="A agenda da médica costuma fechar com 3 semanas de antecedência. Procedimento antes do verão precisa começar em março."
          linhas={3}
        />
      </Campo>

      <Campo rotulo="Oferta vigente" dica="Deixe em branco se não houver. A Solara não inventa promoção.">
        <Texto
          valor={dados.oferta_vigente ?? ''}
          aoMudar={(v) => editar({ oferta_vigente: v })}
          exemplo="Avaliação sem custo até o fim do mês"
        />
      </Campo>

      <Campo
        rotulo="Se a pessoa travar, ofereça"
        dica="A carta na manga, usada uma vez e no momento certo — não como primeira resposta a preço."
      >
        <Texto
          valor={dados.oferta_de_destrave ?? ''}
          aoMudar={(v) => editar({ oferta_de_destrave: v })}
          exemplo="Uma conversa rápida com a médica, sem compromisso"
        />
      </Campo>

      <Campo
        rotulo="Assuntos que ela PODE responder sozinha"
        dica="O que não estiver aqui e for sensível, ela passa para um humano. Na dúvida, ela escala."
      >
        <Area
          valor={dados.assuntos_autorizados ?? ''}
          aoMudar={(v) => editar({ assuntos_autorizados: v })}
          exemplo="Como funciona cada procedimento, tempo de recuperação em linhas gerais, formas de pagamento, localização e estacionamento."
          linhas={3}
        />
      </Campo>
    </>
  );
}

function SecaoPostura({ dados, editar }: PropsSecao) {
  return (
    <>
      <Titulo sub="Pressão em estética soa como desespero e derruba o valor percebido. Aqui vocês definem o limite.">
        Postura comercial
      </Titulo>

      <Campo rotulo="Como ela conduz">
        <Escolha
          valor={dados.postura_comercial}
          aoMudar={(v) => editar({ postura_comercial: v })}
          opcoes={[
            { valor: 'consultivo', rotulo: 'Consultiva', descricao: 'Pergunta, escuta e conduz. Recomendado para alto padrão.' },
            { valor: 'equilibrado', rotulo: 'Equilibrada', descricao: 'Qualifica com calma e propõe quando fizer sentido.' },
            { valor: 'direto', rotulo: 'Direta', descricao: 'Propõe o próximo passo cedo, sem rodeio.' },
          ]}
        />
      </Campo>

      <Campo
        rotulo='Quantas vezes insistir depois de um "vou pensar"'
        dica="Passando disso, irrita, perde o lead de vez e ainda derruba a nota de qualidade do número no WhatsApp."
      >
        <Numero
          valor={dados.tentativas_antes_de_recuar}
          aoMudar={(v) => editar({ tentativas_antes_de_recuar: v ?? 2 })}
          min={0}
          max={5}
          sufixo="vez(es)"
        />
      </Campo>

      <Chave
        valor={dados.pode_oferecer_desconto}
        aoMudar={(v) => editar({ pode_oferecer_desconto: v })}
        rotulo="Ela pode mencionar condição especial"
        dica="Só depois de ter apresentado valor — nunca como primeira resposta a preço."
      />

      {dados.pode_oferecer_desconto && (
        <Campo rotulo="Desconto máximo">
          <Numero
            valor={dados.desconto_maximo_percentual}
            aoMudar={(v) => editar({ desconto_maximo_percentual: v })}
            min={0}
            max={100}
            sufixo="%"
          />
        </Campo>
      )}

      <Campo
        rotulo="Se citarem outra clínica"
        dica="A Solara nunca cita nome de concorrente. Escreva aqui o que ela deve dizer no lugar."
      >
        <Area
          valor={dados.resposta_a_concorrente ?? ''}
          aoMudar={(v) => editar({ resposta_a_concorrente: v })}
          exemplo="Não conheço o trabalho de outras clínicas para comparar. O que posso te contar é como é aqui: a avaliação é com a médica e dura 40 minutos."
          linhas={3}
        />
      </Campo>

      <Chave
        valor={dados.proibir_promessa_resultado}
        aoMudar={(v) => editar({ proibir_promessa_resultado: v })}
        rotulo="Proibir qualquer promessa de resultado"
        dica="Recomendado manter ligado: publicidade em estética tem limite de conselho (CFM 2.336/2023 e equivalentes)."
      />
    </>
  );
}

function SecaoAgenda({
  dados,
  editar,
  expediente,
  setExpediente,
}: PropsSecao & {
  expediente: JanelaExpediente[];
  setExpediente: (j: JanelaExpediente[]) => void;
}) {
  function alternarDia(dia: number) {
    const tem = expediente.some((j) => j.dia_semana === dia);
    setExpediente(
      tem
        ? expediente.filter((j) => j.dia_semana !== dia)
        : [...expediente, { dia_semana: dia, abre: '09:00', fecha: '18:00', ativo: true }]
    );
  }

  function atualizar(indice: number, campos: Partial<JanelaExpediente>) {
    setExpediente(expediente.map((j, i) => (i === indice ? { ...j, ...campos } : j)));
  }

  return (
    <>
      <Titulo sub="A Solara só oferece horário que existe aqui. O banco recusa qualquer agendamento fora disto.">
        Agenda
      </Titulo>

      <Aviso tom="alerta">
        <b>Sem expediente cadastrado, nada é agendado.</b> É proposital: melhor a Solara dizer que
        vai confirmar com a equipe do que marcar num horário em que vocês estão fechados.
      </Aviso>

      <Campo
        rotulo="Dias de atendimento"
        dica="Clique no dia para ativar. Para intervalo de almoço, adicione a segunda janela do mesmo dia."
        obrigatorio
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {DIAS_SEMANA.map((d) => {
            const ativo = expediente.some((j) => j.dia_semana === d.valor);
            return (
              <button
                key={d.valor}
                type="button"
                onClick={() => alternarDia(d.valor)}
                style={{
                  padding: '8px 14px',
                  fontFamily: fonts.body,
                  fontSize: 13.5,
                  fontWeight: ativo ? 600 : 500,
                  color: ativo ? colors.white : colors.inkSoft,
                  background: ativo ? colors.rose : colors.white,
                  border: `1px solid ${ativo ? colors.rose : colors.border}`,
                  borderRadius: radius.base,
                  cursor: 'pointer',
                }}
              >
                {d.curto}
              </button>
            );
          })}
        </div>

        {expediente
          .map((janela, indice) => ({ janela, indice }))
          .sort((a, b) => a.janela.dia_semana - b.janela.dia_semana || a.janela.abre.localeCompare(b.janela.abre))
          .map(({ janela, indice }) => {
            const dia = DIAS_SEMANA.find((d) => d.valor === janela.dia_semana);
            const invalida = janela.fecha <= janela.abre;
            return (
              <div
                key={`${janela.dia_semana}-${indice}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
              >
                <span style={{ width: 78, fontSize: 13.5, color: colors.inkSoft }}>{dia?.longo}</span>
                <input
                  type="time"
                  value={janela.abre?.slice(0, 5) ?? ''}
                  onChange={(e) => atualizar(indice, { abre: e.target.value })}
                  style={{
                    padding: '7px 9px',
                    fontFamily: fonts.body,
                    border: `1px solid ${invalida ? colors.danger : colors.border}`,
                    borderRadius: radius.base,
                  }}
                />
                <span style={{ color: colors.textMuted }}>às</span>
                <input
                  type="time"
                  value={janela.fecha?.slice(0, 5) ?? ''}
                  onChange={(e) => atualizar(indice, { fecha: e.target.value })}
                  style={{
                    padding: '7px 9px',
                    fontFamily: fonts.body,
                    border: `1px solid ${invalida ? colors.danger : colors.border}`,
                    borderRadius: radius.base,
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setExpediente([
                      ...expediente,
                      { dia_semana: janela.dia_semana, abre: '14:00', fecha: '18:00', ativo: true },
                    ])
                  }
                  title="Adicionar outra janela neste dia (intervalo de almoço)"
                  style={botaoDiscreto}
                >
                  + janela
                </button>
                <button
                  type="button"
                  onClick={() => setExpediente(expediente.filter((_, i) => i !== indice))}
                  style={{ ...botaoDiscreto, color: colors.danger }}
                >
                  remover
                </button>
                {invalida && (
                  <span style={{ fontSize: 12.5, color: colors.danger }}>
                    o fechamento tem que ser depois da abertura
                  </span>
                )}
              </div>
            );
          })}
      </Campo>

      <Campo rotulo="Antecedência mínima" dica="A Solara não oferece horário antes disso — dá tempo de a equipe se organizar.">
        <Numero
          valor={dados.antecedencia_minima_horas}
          aoMudar={(v) => editar({ antecedencia_minima_horas: v ?? 24 })}
          min={0}
          sufixo="horas"
        />
      </Campo>

      <Campo rotulo="Duração da avaliação">
        <Numero
          valor={dados.duracao_avaliacao_minutos}
          aoMudar={(v) => editar({ duracao_avaliacao_minutos: v ?? 30 })}
          min={10}
          sufixo="minutos"
        />
      </Campo>

      <Campo rotulo="Até quando dá para marcar">
        <Numero
          valor={dados.antecedencia_maxima_dias}
          aoMudar={(v) => editar({ antecedencia_maxima_dias: v ?? 60 })}
          min={1}
          sufixo="dias à frente"
        />
      </Campo>

      <Campo rotulo="Política de cancelamento" dica="A Solara informa isto ao confirmar o horário.">
        <Area
          valor={dados.politica_cancelamento ?? ''}
          aoMudar={(v) => editar({ politica_cancelamento: v })}
          exemplo="Cancelamento com até 24h de antecedência, sem custo. Depois disso, a avaliação é cobrada."
          linhas={2}
        />
      </Campo>

      <Chave
        valor={dados.avaliacao_e_paga}
        aoMudar={(v) => editar({ avaliacao_e_paga: v })}
        rotulo="A avaliação é paga"
        dica="Se sim, a Solara avisa antes de marcar — descobrir na recepção gera cancelamento."
      />

      {dados.avaliacao_e_paga && (
        <Campo rotulo="Valor da avaliação">
          <Texto
            valor={deCentavos(dados.avaliacao_preco_centavos)}
            aoMudar={(v) => editar({ avaliacao_preco_centavos: paraCentavos(v) })}
            exemplo="250,00"
          />
        </Campo>
      )}
    </>
  );
}

function SecaoAtendimento({ dados, editar }: PropsSecao) {
  return (
    <>
      <Titulo sub="Quando a IA sai de cena, e quando ela volta a chamar quem sumiu.">
        Handoff e follow-up
      </Titulo>

      <Aviso>
        Pergunta sobre contraindicação, risco, complicação ou ameaça judicial <b>sempre</b> passa
        para um humano — isso não é configurável, é o piso de segurança do sistema.
      </Aviso>

      <Campo
        rotulo="O que a pessoa lê enquanto espera um humano"
        dica="Se ficar em branco, a Solara usa uma mensagem padrão de acolhimento."
      >
        <Area
          valor={dados.handoff_mensagem_espera ?? ''}
          aoMudar={(v) => editar({ handoff_mensagem_espera: v })}
          exemplo="Essa é uma pergunta importante e quero que você receba a resposta certa. Já estou chamando a médica para falar com você por aqui."
          linhas={3}
        />
      </Campo>

      <Campo rotulo="Prazo para alguém assumir" dica="Passando disso, o painel marca o atendimento como atrasado.">
        <Numero
          valor={dados.handoff_prazo_assumir_minutos}
          aoMudar={(v) => editar({ handoff_prazo_assumir_minutos: v ?? 15 })}
          min={1}
          sufixo="minutos"
        />
      </Campo>

      <Campo
        rotulo="Devolver para a IA se ninguém assumir"
        dica="Sem este prazo, um lead entra na fila numa sexta à tarde e não recebe resposta nenhuma até segunda."
      >
        <Numero
          valor={dados.handoff_timeout_minutos}
          aoMudar={(v) => editar({ handoff_timeout_minutos: v ?? 120 })}
          min={10}
          sufixo="minutos"
        />
      </Campo>

      <Chave
        valor={dados.follow_up_ativo}
        aoMudar={(v) => editar({ follow_up_ativo: v })}
        rotulo="Reengajar quem parou de responder"
        dica="Cada tentativa fora de 24h abre uma conversa cobrada pela Meta. Por isso o limite existe."
      />

      {dados.follow_up_ativo && (
        <>
          <Campo rotulo="Máximo de tentativas" dica="A terceira raramente converte e some do orçamento sem ninguém notar.">
            <Numero
              valor={dados.follow_up_max_tentativas}
              aoMudar={(v) => editar({ follow_up_max_tentativas: v ?? 2 })}
              min={0}
              max={5}
              sufixo="tentativas"
            />
          </Campo>

          <Campo rotulo="Não incomodar entre">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="time"
                value={(dados.follow_up_silencio_inicio ?? '21:00').slice(0, 5)}
                onChange={(e) => editar({ follow_up_silencio_inicio: e.target.value })}
                style={{ padding: '8px 10px', fontFamily: fonts.body, border: `1px solid ${colors.border}`, borderRadius: radius.base }}
              />
              <span style={{ color: colors.textMuted }}>e</span>
              <input
                type="time"
                value={(dados.follow_up_silencio_fim ?? '08:00').slice(0, 5)}
                onChange={(e) => editar({ follow_up_silencio_fim: e.target.value })}
                style={{ padding: '8px 10px', fontFamily: fonts.body, border: `1px solid ${colors.border}`, borderRadius: radius.base }}
              />
            </div>
          </Campo>
        </>
      )}
    </>
  );
}

// --- Listas (procedimentos e objeções) ---------------------------------------

const botaoDiscreto: React.CSSProperties = {
  padding: '5px 9px',
  fontFamily: fonts.body,
  fontSize: 12.5,
  color: colors.inkSoft,
  background: 'transparent',
  border: `1px solid ${colors.border}`,
  borderRadius: radius.base,
  cursor: 'pointer',
};

const PROCEDIMENTO_VAZIO: Procedimento = {
  nome: '',
  apelidos: [],
  categoria: 'injetavel',
  descricao: null,
  preco_de_centavos: null,
  preco_ate_centavos: null,
  duracao_minutos: null,
  sessoes_tipicas: null,
  parcelamento_maximo: null,
  exige_avaliacao: true,
  preparo: null,
  recuperacao: null,
  contraindicacoes: null,
  ativo: true,
};

function SecaoProcedimentos({
  clinicId,
  procedimentos,
  setProcedimentos,
  aoMudar,
}: {
  clinicId: string;
  procedimentos: Procedimento[];
  setProcedimentos: (p: Procedimento[]) => void;
  aoMudar: () => Promise<void>;
}) {
  const [editando, setEditando] = useState<Procedimento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!editando?.nome.trim()) {
      setErro('O procedimento precisa de um nome.');
      return;
    }
    try {
      const salvo = await salvarProcedimento(clinicId, editando);
      setProcedimentos(
        editando.id
          ? procedimentos.map((p) => (p.id === salvo.id ? salvo : p))
          : [...procedimentos, salvo]
      );
      setEditando(null);
      setErro(null);
      await aoMudar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function remover(id: string) {
    await removerProcedimento(id);
    setProcedimentos(procedimentos.filter((p) => p.id !== id));
    await aoMudar();
  }

  return (
    <>
      <Titulo sub="O que o SDR usa para reconhecer o interesse e para qualificar. Sem catálogo, ele conversa bonito e não fecha nada.">
        Procedimentos
      </Titulo>

      <Aviso>
        <b>Os apelidos importam mais que o nome técnico.</b> Ninguém pede "toxina botulínica" — pede
        botox. É pelo apelido que a Solara reconhece o que a pessoa quer.
      </Aviso>

      {procedimentos.map((p) => (
        <div
          key={p.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            marginBottom: 8,
            background: colors.sand,
            borderRadius: radius.base,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 14, color: colors.ink }}>{p.nome}</strong>
            <span style={{ display: 'block', fontSize: 12.5, color: colors.textMuted, marginTop: 2 }}>
              {p.categoria}
              {p.apelidos.length > 0 && ` · ${p.apelidos.join(', ')}`}
              {p.preco_de_centavos !== null && ` · a partir de R$ ${deCentavos(p.preco_de_centavos)}`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button type="button" onClick={() => setEditando(p)} style={botaoDiscreto}>
              editar
            </button>
            <button
              type="button"
              onClick={() => p.id && remover(p.id)}
              style={{ ...botaoDiscreto, color: colors.danger }}
            >
              remover
            </button>
          </div>
        </div>
      ))}

      {!editando && (
        <button
          type="button"
          onClick={() => setEditando({ ...PROCEDIMENTO_VAZIO })}
          style={{
            marginTop: 12,
            padding: '10px 20px',
            fontFamily: fonts.body,
            fontSize: 14,
            fontWeight: 600,
            color: colors.white,
            background: colors.rose,
            border: 'none',
            borderRadius: radius.base,
            cursor: 'pointer',
          }}
        >
          Adicionar procedimento
        </button>
      )}

      {editando && (
        <div
          style={{
            marginTop: 18,
            padding: 20,
            background: colors.sand,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.base,
          }}
        >
          <Campo rotulo="Nome" obrigatorio>
            <Texto
              valor={editando.nome}
              aoMudar={(v) => setEditando({ ...editando, nome: v })}
              exemplo="Toxina botulínica"
            />
          </Campo>

          <Campo rotulo="Como as pessoas chamam" dica="Uma por linha. É o que faz a Solara entender o pedido.">
            <ListaTexto
              itens={editando.apelidos}
              aoMudar={(v) => setEditando({ ...editando, apelidos: v })}
              exemplo={'botox\nbotox na testa\naplicação de botox'}
            />
          </Campo>

          <Campo rotulo="Categoria">
            <Escolha
              valor={editando.categoria}
              aoMudar={(v) => setEditando({ ...editando, categoria: v })}
              opcoes={[
                { valor: 'injetavel', rotulo: 'Injetável' },
                { valor: 'facial', rotulo: 'Facial' },
                { valor: 'corporal', rotulo: 'Corporal' },
                { valor: 'cirurgico', rotulo: 'Cirúrgico' },
                { valor: 'capilar', rotulo: 'Capilar' },
                { valor: 'outro', rotulo: 'Outro' },
              ]}
            />
          </Campo>

          <div style={{ display: 'flex', gap: 14 }}>
            <Campo rotulo="Preço de (R$)">
              <Texto
                valor={deCentavos(editando.preco_de_centavos)}
                aoMudar={(v) => setEditando({ ...editando, preco_de_centavos: paraCentavos(v) })}
                exemplo="1.200,00"
              />
            </Campo>
            <Campo rotulo="até (R$)">
              <Texto
                valor={deCentavos(editando.preco_ate_centavos)}
                aoMudar={(v) => setEditando({ ...editando, preco_ate_centavos: paraCentavos(v) })}
                exemplo="2.400,00"
              />
            </Campo>
          </div>

          <Campo rotulo="Recuperação" dica="Em linguagem de leigo. É a pergunta mais comum depois do preço.">
            <Area
              valor={editando.recuperacao ?? ''}
              aoMudar={(v) => setEditando({ ...editando, recuperacao: v })}
              exemplo="Pode voltar à rotina no mesmo dia. Pode haver vermelhidão por algumas horas."
              linhas={2}
            />
          </Campo>

          <Campo
            rotulo="Contraindicações"
            dica="A Solara NUNCA recita isto para o lead. Serve para ela reconhecer o assunto e passar para a equipe."
          >
            <Area
              valor={editando.contraindicacoes ?? ''}
              aoMudar={(v) => setEditando({ ...editando, contraindicacoes: v })}
              exemplo="Gestantes, lactantes, doenças neuromusculares."
              linhas={2}
            />
          </Campo>

          <Chave
            valor={editando.exige_avaliacao}
            aoMudar={(v) => setEditando({ ...editando, exige_avaliacao: v })}
            rotulo="Exige avaliação antes"
            dica="Se sim, o Agendador marca a avaliação — nunca o procedimento direto."
          />

          {erro && <p style={{ color: colors.danger, fontSize: 13 }}>{erro}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={salvar}
              style={{
                padding: '9px 20px',
                fontFamily: fonts.body,
                fontSize: 14,
                fontWeight: 600,
                color: colors.white,
                background: colors.rose,
                border: 'none',
                borderRadius: radius.base,
                cursor: 'pointer',
              }}
            >
              Salvar procedimento
            </button>
            <button type="button" onClick={() => setEditando(null)} style={botaoDiscreto}>
              cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function SecaoObjecoes({
  clinicId,
  objecoes,
  setObjecoes,
  aoMudar,
}: {
  clinicId: string;
  objecoes: Objecao[];
  setObjecoes: (o: Objecao[]) => void;
  aoMudar: () => Promise<void>;
}) {
  const [nova, setNova] = useState<Objecao>({
    objecao: '',
    resposta: '',
    categoria: 'preco',
    ativo: true,
  });

  async function adicionar() {
    if (!nova.objecao.trim() || !nova.resposta.trim()) return;
    const salva = await salvarObjecao(clinicId, nova);
    setObjecoes([...objecoes, salva]);
    setNova({ objecao: '', resposta: '', categoria: 'preco', ativo: true });
    await aoMudar();
  }

  return (
    <>
      <Titulo sub="A resposta que VOCÊS autorizam. Sem isto, a Solara improvisa argumento comercial — e improviso em venda é onde ela erra.">
        Objeções
      </Titulo>

      <Aviso>
        As cinco mais comuns em estética: <b>está caro</b>, <b>tenho medo de ficar artificial</b>,{' '}
        <b>vou pensar</b>, <b>não tenho tempo</b>, <b>vi mais barato em outro lugar</b>.
      </Aviso>

      {objecoes.map((o) => (
        <div
          key={o.id}
          style={{ padding: '12px 14px', marginBottom: 8, background: colors.sand, borderRadius: radius.base }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <strong style={{ fontSize: 14, color: colors.ink }}>"{o.objecao}"</strong>
            <button
              type="button"
              onClick={async () => {
                if (o.id) {
                  await removerObjecao(o.id);
                  setObjecoes(objecoes.filter((x) => x.id !== o.id));
                  await aoMudar();
                }
              }}
              style={{ ...botaoDiscreto, color: colors.danger, flexShrink: 0 }}
            >
              remover
            </button>
          </div>
          <p style={{ fontSize: 13.5, color: colors.inkSoft, lineHeight: 1.55, margin: '6px 0 0' }}>
            {o.resposta}
          </p>
        </div>
      ))}

      <div
        style={{
          marginTop: 18,
          padding: 20,
          background: colors.sand,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.base,
        }}
      >
        <Campo rotulo="O que a pessoa diz">
          <Texto
            valor={nova.objecao}
            aoMudar={(v) => setNova({ ...nova, objecao: v })}
            exemplo="Está caro"
          />
        </Campo>
        <Campo rotulo="O que a Solara responde" dica="Escreva como você falaria. Ela adapta às palavras dela, mantendo o argumento.">
          <Area
            valor={nova.resposta}
            aoMudar={(v) => setNova({ ...nova, resposta: v })}
            exemplo="Entendo. O valor inclui a avaliação com a médica, o produto importado e o retorno de 15 dias — não é só a aplicação. Quer que eu te explique o que entra?"
            linhas={3}
          />
        </Campo>
        <button
          type="button"
          onClick={adicionar}
          style={{
            padding: '9px 20px',
            fontFamily: fonts.body,
            fontSize: 14,
            fontWeight: 600,
            color: colors.white,
            background: colors.rose,
            border: 'none',
            borderRadius: radius.base,
            cursor: 'pointer',
          }}
        >
          Adicionar objeção
        </button>
      </div>
    </>
  );
}
