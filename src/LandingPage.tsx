import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Clock, ArrowRight, Stethoscope, Building, CheckCircle2, MessageSquare, Calendar, ChevronUp, Mic, Menu, X } from 'lucide-react';
import { LogoMarca } from './Logo';
import { landingColors, colors as brandColors } from './brand/tokens';
import { useViewport } from './lib/useViewport';

interface LandingPageProps {
  onNavigateToLogin: () => void;
  onNavigateToRegister: (planName: string, planPrice: string, planSlug: string, priceId: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onNavigateToLogin, onNavigateToRegister }) => {
  const [showScrollTop, setShowScrollTop] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  // Abre no mensal: é o valor cheio (R$497) e a âncora de preço da página.
  // O anual de R$397 fica a um clique, na outra aba.
  const [billing, setBilling] = React.useState<'mensal' | 'anual'>('mensal');
  const { isMobile, isTablet } = useViewport();

  // Plano único (decisão de negócio): R$497/mês, R$397/mês no anual.
  // O preço é a chave que o CheckoutPage usa para achar o Payment Link do Stripe.
  const PLANOS = {
    mensal: {
      name: 'Solara Estética — Mensal',
      slug: 'solara-mensal',
      price: '497',
      note: 'Cobrado todo mês. Cancele quando quiser, sem multa.',
      priceId: import.meta.env.VITE_STRIPE_PRICE_MENSAL
    },
    anual: {
      name: 'Solara Estética — Anual',
      slug: 'solara-anual',
      price: '397',
      note: 'R$ 4.764 cobrados uma vez por ano — economia de R$ 1.200 em relação ao mensal.',
      priceId: import.meta.env.VITE_STRIPE_PRICE_ANUAL
    }
  } as const;
  const plan = PLANOS[billing];

  const navItems = [
    { label: 'Soluções', target: 'solucoes' },
    { label: 'Especialistas', target: 'experiencia' },
    { label: 'Planos', target: 'planos' },
    { label: 'FAQ', target: 'faq' }
  ];

  // Fecha o menu mobile ao voltar para desktop e trava o scroll do body quando aberto.
  React.useEffect(() => {
    if (!isMobile && menuOpen) setMenuOpen(false);
  }, [isMobile, menuOpen]);

  React.useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  React.useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleWhatsAppClick = () => {
    window.open('https://wa.me/5512978138934?text=Olá!%20Quero%20testar%20a%20Solara%20Estética%20por%2010%20dias%20na%20minha%20clínica.', '_blank');
  };
  // Paleta da marca vem de src/brand/tokens.ts. O alias mantém as chaves que
  // este JSX já usa (primary, cardBg, btnSuccess...), então a troca de
  // identidade não exige varrer as ~900 linhas de estilo inline.
  const colors = landingColors;

  const fadeInUp = {
    initial: { opacity: 0, y: 40 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
  };

  const staggerContainer = {
    animate: {
      transition: { staggerChildren: 0.15 }
    }
  };

  const containerStyle = {
    maxWidth: '1140px',
    margin: '0 auto',
    width: '100%',
    position: 'relative' as const,
    zIndex: 1
  };

  // Componente de link do menu com hover elegante
  // Componente de link do menu com hover elegante
  const NavLink: React.FC<{ label: string; target: string; color: string; hoverColor: string }> = ({ label, target, color, hoverColor }) => {
    const [hovered, setHovered] = useState(false);
    return (
      <motion.a
        href={`#${target}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        whileHover={{ y: -2 }}
        style={{
          color: hovered ? hoverColor : color,
          textDecoration: 'none',
          fontWeight: '600',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          cursor: 'pointer',
          position: 'relative',
          padding: '8px 4px',
          fontSize: '1rem',
          letterSpacing: '-0.01em'
        }}
      >
        {label}
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: hovered ? '100%' : 0, opacity: hovered ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: 3,
            background: hoverColor,
            borderRadius: 3,
            boxShadow: `0 2px 10px ${hoverColor}40`
          }}
        />
      </motion.a>
    );
  };

  // Item de FAQ com acordeão acessível.
  const FaqItem: React.FC<{ q: string; a: string }> = ({ q, a }) => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ border: `1px solid ${colors.cardBorder}50`, borderRadius: 3, background: colors.bg, overflow: 'hidden' }}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
            padding: isMobile ? '20px' : '24px 28px', background: 'transparent', border: 'none', cursor: 'pointer',
            textAlign: 'left', fontFamily: 'inherit'
          }}
        >
          <span style={{ fontSize: isMobile ? '1.05rem' : '1.15rem', fontWeight: 700, color: colors.primary }}>{q}</span>
          <ChevronUp size={22} color={colors.btnSuccess} style={{ flexShrink: 0, transition: 'transform 0.3s ease', transform: open ? 'rotate(0deg)' : 'rotate(180deg)' }} />
        </button>
        <motion.div
          initial={false}
          animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          style={{ overflow: 'hidden' }}
        >
          <p style={{ padding: isMobile ? '0 20px 20px' : '0 28px 24px', color: '#666', fontSize: '1rem', lineHeight: 1.6 }}>{a}</p>
        </motion.div>
      </div>
    );
  };

  // Perguntas frequentes — também alimentam o structured data (FAQPage) para SEO.
  const faqs = [
    {
      q: 'O que é a Solara Estética?',
      a: 'A Solara Estética é uma recepcionista de inteligência artificial que atende o WhatsApp de clínicas de estética e cirurgia plástica. Ela responde a paciente em segundos, a qualquer hora, entende o que ela procura, oferece horários reais da agenda da clínica e marca a avaliação — usando só os dados que a clínica cadastrou, sem inventar preço nem horário. Não é sistema de gestão nem prontuário: faz duas coisas, atender e agendar, e faz bem.'
    },
    {
      q: 'Como a Solara reduz o no-show na minha clínica de estética?',
      a: 'A Solara envia lembrete e pedido de confirmação pelo WhatsApp antes de cada sessão, e reorganiza a agenda quando a paciente responde que não vai. Em clínica de estética o horário vago é receita que não volta: a cadeira ficou parada e o profissional também.'
    },
    {
      q: 'A Solara usa a API oficial do WhatsApp?',
      a: 'Sim. A integração é feita pela API oficial da Meta (WhatsApp Cloud API), não por robô conectado via QR Code. Isso significa número que não cai, conformidade com as regras da Meta e nenhum risco de banimento do WhatsApp da clínica.'
    },
    {
      q: 'Vou perder o WhatsApp Business que já uso no celular?',
      a: 'Não. A conexão usa o recurso de coexistência da Meta: o aplicativo WhatsApp Business continua funcionando normalmente no seu celular, com o mesmo número, enquanto a Solara atende pela API ao mesmo tempo.'
    },
    {
      q: 'Como funcionam os 10 dias grátis?',
      a: 'Você cria a conta e usa a plataforma por 10 dias, sem cartão de crédito. Nesse período você conversa com a sua própria Solara pelo WhatsApp para ver como ela atende. Gostou, assina; não gostou, é só não continuar.'
    },
    {
      q: 'Os dados das minhas pacientes ficam seguros?',
      a: 'Ficam. O que a paciente conta na conversa — o que a incomoda, o procedimento que procura, o que já fez antes — é dado sensível pela LGPD (Lei 13.709/18). As conversas trafegam e ficam armazenadas criptografadas, cada clínica só enxerga a própria base por isolamento no banco de dados, e cada decisão da IA fica registrada: o que ela respondeu, quando passou o atendimento para a equipe e por quê.'
    },
    {
      q: 'Preciso instalar algum programa?',
      a: 'Não. Funciona no navegador, no computador ou no celular. É só entrar com seu login.'
    },
    {
      q: 'Tem fidelidade ou multa para cancelar?',
      a: 'Não tem fidelidade nem multa. A assinatura é mensal e você cancela quando quiser. No plano anual o valor mensal cai, mas a escolha é sua.'
    }
  ];

  // JSON-LD para rich results no Google (FAQ + organização/produto).
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  };

  return (
    <div style={{ backgroundColor: colors.bg, color: colors.primary, minHeight: '100vh', fontFamily: "'Outfit', sans-serif", overflowX: 'hidden' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      
      {/* Navigation */}
      <nav style={{ 
        position: 'fixed', 
        width: '100%', 
        top: 0, 
        zIndex: 100, 
        background: '#FFFFFF',
        borderBottom: `1px solid ${colors.btnSuccess}`, 
        padding: '16px 0',
        transition: 'all 0.4s ease'
      }}>
        {/* Grade de três colunas em vez de space-between: as laterais têm a mesma
            largura (1fr), então o menu do meio fica no centro real da barra e não
            deslocado pela largura da logo. */}
        <div style={{ ...containerStyle, display: 'grid', gridTemplateColumns: isMobile ? '1fr auto' : '1fr auto 1fr', alignItems: 'center', padding: '0 24px' }}>
          <a href="#" aria-label="Solara Estética — início" style={{ display: 'block', lineHeight: 0, justifySelf: 'start' }}>
            <LogoMarca width={isMobile ? 130 : 160} />
          </a>

          {!isMobile && (
            <div style={{ display: 'flex', gap: 32, justifySelf: 'center' }}>
              {navItems.map((item) => (
                <NavLink key={item.label} label={item.label} target={item.target} color={colors.goldText} hoverColor={colors.btnSuccess} />
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: isMobile ? 12 : 32, alignItems: 'center', justifySelf: 'end' }}>
            {!isMobile && (
              <>
                <motion.button
                  onClick={onNavigateToLogin}
                  whileHover={{ scale: 1.02, boxShadow: `0 10px 30px ${colors.btnSuccess}30` }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    backgroundColor: colors.btnSuccess,
                    color: '#fff',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: 3,
                    fontWeight: '700',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    letterSpacing: '0.02em',
                    transition: 'all 0.3s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Acesso Restrito
                </motion.button>
              </>
            )}

            {isMobile && (
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
                aria-expanded={menuOpen}
                style={{
                  background: 'transparent',
                  border: `1px solid ${colors.cardBorder}`,
                  borderRadius: 3,
                  padding: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: colors.primary,
                  zIndex: 110
                }}
              >
                {menuOpen ? <X size={26} /> : <Menu size={26} />}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {isMobile && menuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(36, 27, 41, 0.45)', zIndex: 90 }}
            />
            {/* Painel lateral */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 95,
                width: 'min(80vw, 320px)', background: colors.bg,
                boxShadow: `-20px 0 60px ${colors.primary}20`,
                padding: '88px 24px 32px', display: 'flex', flexDirection: 'column', gap: 8
              }}
            >
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={`#${item.target}`}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    color: colors.goldText, textDecoration: 'none', fontWeight: 600, fontSize: '1.1rem',
                    padding: '16px 12px', borderRadius: 3, borderBottom: `1px solid ${colors.cardBorder}30`
                  }}
                >
                  {item.label}
                </a>
              ))}
              <button
                onClick={() => { setMenuOpen(false); onNavigateToLogin(); }}
                style={{
                  marginTop: 16, backgroundColor: colors.btnSuccess, color: '#fff', border: 'none',
                  padding: '16px 24px', borderRadius: 3, fontWeight: 700, cursor: 'pointer',
                  fontSize: '1rem', letterSpacing: '0.02em', width: '100%'
                }}
              >
                Acesso Restrito
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <header style={{ paddingTop: isMobile ? '120px' : '180px', paddingBottom: isMobile ? '70px' : '120px', position: 'relative' }}>

        <div style={{ ...containerStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 20px' }}>
          <motion.div initial="initial" animate="animate" variants={staggerContainer} style={{ maxWidth: '900px' }}>
            <motion.div variants={fadeInUp} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: colors.cardBg, border: `1px solid ${colors.cardBorder}80`, borderRadius: 3, color: colors.primary, fontSize: '0.9rem', fontWeight: '600', marginBottom: 40, textTransform: 'uppercase' }}>
              <span style={{ width: 8, height: 8, background: colors.btnSuccess, borderRadius: '50%', display: 'inline-block', boxShadow: `0 0 10px ${colors.btnSuccess}` }} />
              Software para clínicas de estética e cirurgia plástica
            </motion.div>

            <motion.h1 variants={fadeInUp} style={{ fontSize: 'clamp(2rem, 7vw, 46px)', fontWeight: 400, lineHeight: '1.18', marginBottom: 32, letterSpacing: '-0.015em', color: colors.primary }}>
              A recepcionista de IA da sua<br/>
              {/* Caixa alta via CSS, não no texto: o DOM segue com "clínica de
                  estética" em caixa natural, que é o que leitor de tela e
                  indexador leem. O visual muda, a semântica não. */}
              {/* fontSize em calc(1em - 2px): fica 2px menor que o H1 em qualquer
                  breakpoint, sem precisar duplicar o clamp.
                  O dourado #A9814E dá 3.5:1 sobre o off-white — reprovaria em texto
                  corrido, mas aqui é display acima de 24px, faixa em que o WCAG
                  pede 3:1. Por isso o dourado só vive em título, nunca em parágrafo. */}
              <span style={{ position: 'relative', color: brandColors.gold, display: 'inline-block', textTransform: 'uppercase', letterSpacing: '0.01em', fontWeight: 500, fontSize: 'calc(1em - 2px)' }}>
                clínica de estética.
                {/* Sublinhado: traço fino ancorado abaixo da linha de base.
                    Antes era stroke 12 num viewBox de altura 12 — uma tarja cheia,
                    que passou a cobrir o texto quando a cor deixou de ser clara. */}
                <svg style={{ position: 'absolute', bottom: -6, left: 0, width: '100%', height: 8, zIndex: -1 }} viewBox="0 0 300 8" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0 5 Q 150 9 300 5" fill="none" stroke={brandColors.gold} strokeWidth="3" strokeLinecap="round" opacity="0.4"/>
                </svg>
              </span>
            </motion.h1>

            <motion.p variants={fadeInUp} style={{ fontSize: '1.15rem', color: colors.primary, opacity: 0.78, maxWidth: 700, margin: '0 auto 48px', fontWeight: '400', lineHeight: '1.6' }}>
              A Solara atende no WhatsApp 24 horas por dia, agenda procedimentos, confirma consultas e resgata paciente sumida — usando os dados reais da sua clínica, sem inventar preço nem horário. Feita para clínica de estética avançada, harmonização facial e cirurgia plástica.
            </motion.p>
            
            <motion.div variants={fadeInUp} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'center', gap: isMobile ? 16 : 24, width: isMobile ? '100%' : 'auto' }}>
              <motion.button
                onClick={handleWhatsAppClick}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                style={{ backgroundColor: colors.btnSuccess, color: '#FFFFFF', border: 'none', padding: isMobile ? '18px 28px' : '20px 40px', borderRadius: 3, fontSize: '1.1rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, boxShadow: `0 12px 32px ${colors.btnSuccess}40`, width: isMobile ? '100%' : 'auto' }}
              >
                Testar 10 dias grátis <ArrowRight size={20} />
              </motion.button>
              <motion.button
                onClick={() => document.getElementById('solucoes')?.scrollIntoView({ behavior: 'smooth' })}
                whileHover={{ scale: 1.03, backgroundColor: colors.cardBg }}
                whileTap={{ scale: 0.97 }}
                style={{ backgroundColor: 'transparent', color: colors.primary, border: `1.5px solid ${colors.cardBorder}`, padding: isMobile ? '18px 28px' : '20px 40px', borderRadius: 3, fontSize: '1.1rem', fontWeight: '600', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}
              >
                Ver como funciona
              </motion.button>
            </motion.div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{ marginTop: '80px', width: '100%', position: 'relative' }}
          >
            <div style={{ borderRadius: 3, overflow: 'hidden', border: `1px solid ${colors.cardBorder}50`, boxShadow: `0 40px 80px ${colors.primary}15`, background: colors.bg, padding: '16px' }}>
               <img
                 src="/hero-solara.webp"
                 alt="Painel da Solara Estética com a agenda do dia e a conversa de confirmação de consulta no WhatsApp"
                 width="1024"
                 height="821"
                 fetchPriority="high"
                 decoding="async"
                 style={{ width: '100%', height: 'auto', borderRadius: 3, display: 'block', border: `1px solid ${colors.cardBorder}30` }}
               />
            </div>
            
            {/* No desktop o selo flutua para fora do quadro; no celular esse
                deslocamento de -30px jogava metade dele para fora da tela. */}
            <motion.div animate={{ y: [0, -15, 0] }} transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }} style={{ position: 'absolute', top: isMobile ? -16 : -30, right: isMobile ? 8 : -30, background: colors.bg, border: `1px solid ${colors.cardBorder}`, padding: isMobile ? '12px 16px' : '20px 32px', borderRadius: 3, boxShadow: `0 20px 40px ${colors.primary}10`, display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16, maxWidth: 'calc(100% - 16px)' }}>
               <div style={{ width: 48, height: 48, borderRadius: 3, background: `${colors.btnSuccess}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <ShieldCheck size={28} color={colors.btnSuccess} />
               </div>
               <div style={{ textAlign: 'left' }}>
                 <div style={{ fontWeight: '700', color: colors.primary, fontSize: '1.2rem' }}>LGPD</div>
                 <div style={{ fontSize: '0.9rem', color: colors.primary, opacity: 0.65, fontWeight: '500' }}>Dado de saúde protegido</div>
               </div>
            </motion.div>
          </motion.div>
        </div>
      </header>

      {/* Trust Section */}
      <section style={{ borderTop: `1px solid ${colors.cardBorder}30`, borderBottom: `1px solid ${colors.cardBorder}30`, background: colors.cardBg }}>
        <div style={{ ...containerStyle, padding: '60px 20px', textAlign: 'center' }}>
          <p style={{ color: colors.primary, opacity: 0.7, fontSize: '0.9rem', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 40 }}>Feito para as especialidades que mais crescem</p>
          {/* O grayscale e a opacidade de 0.6 vinham de quando esta faixa exibia
              logotipos de terceiros. Com palavras, os dois só lavavam o texto:
              o aubergine virava cinza claro em 5:1. Sem filtro e em 0.88 dá 12:1. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: isMobile ? '16px 24px' : 32, alignItems: 'center', opacity: 0.88 }}>
            {['HARMONIZAÇÃO FACIAL', 'CIRURGIA PLÁSTICA', 'ESTÉTICA CORPORAL', 'DERMATOLOGIA ESTÉTICA', 'CAPILAR'].map((brand, i) => (
              <h3 key={i} style={{ fontSize: 'clamp(1rem, 3vw, 1.5rem)', fontWeight: 400, color: colors.primary }}>{brand}</h3>
            ))}
          </div>
        </div>
      </section>

      {/* Tempo de resposta — o argumento central.
          Fica alto na página, logo depois da faixa de especialidades, porque é a
          única coisa aqui que um concorrente com formulário de contato não
          consegue copiar: ele pode escrever "atendimento humanizado", não pode
          responder domingo às 23h.
          Nenhum número inventado: a prova é o convite para cronometrar no teste. */}
      <section style={{ padding: isMobile ? '70px 0' : '110px 0' }}>
        <div style={{ ...containerStyle, padding: '0 20px' }}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            style={{ textAlign: 'center', maxWidth: 820, margin: '0 auto 64px' }}
          >
            <p style={{ color: colors.goldText, fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>
              O que realmente decide
            </p>
            <h2 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 400, color: colors.primary, marginBottom: 24, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              Quem responde primeiro, leva.
            </h2>
            <p style={{ fontSize: '1.2rem', color: colors.primary, opacity: 0.72, lineHeight: 1.6 }}>
              Sua paciente não escolhe a clínica que atende melhor. Escolhe a que atende <strong style={{ opacity: 1 }}>antes</strong> — porque enquanto ela espera, está conversando com outras três.
            </p>
          </motion.div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: isMobile ? 20 : 32, maxWidth: 940, margin: '0 auto' }}>
            {[
              {
                titulo: 'Como é hoje',
                cor: colors.cardBorder,
                destaque: false,
                linhas: [
                  ['22h47, domingo', 'Ela manda mensagem perguntando sobre o procedimento.'],
                  ['Domingo à noite', 'Ninguém vê. Ela pergunta em mais três clínicas.'],
                  ['Segunda, 9h20', 'A recepção responde. Ela já marcou avaliação em outra.'],
                ],
              },
              {
                titulo: 'Com a Solara',
                cor: colors.btnSuccess,
                destaque: true,
                linhas: [
                  ['22h47, domingo', 'Ela manda a mesma mensagem.'],
                  ['22h47, domingo', 'É respondida. Com o que a sua clínica cadastrou — sem inventar preço nem horário.'],
                  ['22h51, domingo', 'Sai com a avaliação marcada, em horário que existe na sua agenda.'],
                ],
              },
            ].map((coluna) => (
              <motion.div
                key={coluna.titulo}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                style={{
                  padding: isMobile ? '28px 24px' : '36px 32px',
                  background: coluna.destaque ? colors.cardBg : 'transparent',
                  border: `1px solid ${colors.cardBorder}`,
                  borderLeft: `3px solid ${coluna.cor}`,
                  borderRadius: 3,
                }}
              >
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: colors.primary, marginBottom: 24, opacity: coluna.destaque ? 1 : 0.6 }}>
                  {coluna.titulo}
                </h3>
                {coluna.linhas.map(([hora, texto], i) => (
                  <div key={i} style={{ marginBottom: i === 2 ? 0 : 22 }}>
                    <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.04em', color: coluna.destaque ? colors.btnSuccess : colors.primary, opacity: coluna.destaque ? 1 : 0.45, marginBottom: 4 }}>
                      {hora}
                    </span>
                    <span style={{ display: 'block', fontSize: '1.02rem', lineHeight: 1.55, color: colors.primary, opacity: coluna.destaque ? 0.88 : 0.6 }}>
                      {texto}
                    </span>
                  </div>
                ))}
              </motion.div>
            ))}
          </div>

          {/* O convite substitui a estatística. Número de clínica ativa entra
              aqui quando existir base para publicar — antes disso seria inventar,
              que é o oposto do que esta página promete. */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            style={{ textAlign: 'center', maxWidth: 680, margin: '56px auto 0', fontSize: '1.1rem', lineHeight: 1.6, color: colors.primary, opacity: 0.8 }}
          >
            Não precisa acreditar: nos seus 10 dias de teste, mande uma mensagem para a sua própria Solara às onze da noite e cronometre.
          </motion.p>
        </div>
      </section>

      {/* Features Detail */}
      <section id="solucoes" style={{ padding: isMobile ? '70px 0 0 0' : '120px 0 0 0' }}>
        <div style={{ ...containerStyle, padding: '0 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: 80, maxWidth: 800, margin: '0 auto 80px' }}>
            <h2 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 400, marginBottom: 24, color: colors.primary, letterSpacing: '-0.02em' }}>Feito para o jeito que uma clínica de estética funciona</h2>
            <p style={{ fontSize: '1.2rem', color: colors.primary, opacity: 0.72, lineHeight: '1.6' }}>Sua paciente decide pelo WhatsApp, remarca pelo WhatsApp e some pelo WhatsApp. É lá que a Solara trabalha.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 32 }}>
            {[
              { icon: <MessageSquare />, title: "Atendimento 24 horas", desc: "A Solara responde no WhatsApp de madrugada, no domingo e no feriado — com os dados reais da sua clínica, sem inventar preço nem horário." },
              { icon: <Calendar />, title: "Agendamento sem ligação", desc: "A paciente escolhe procedimento, profissional e horário na própria conversa. O agendamento entra direto na sua agenda." },
              { icon: <Clock />, title: "Menos no-show", desc: "Lembrete e confirmação automáticos antes da sessão. Horário vago é receita que não volta." },
              { icon: <Building />, title: "Funil de leads na tela", desc: "Quem chegou, quem está sendo qualificado e quem já marcou. Com a temperatura de cada lead: quem quer marcar agora e quem ainda está pesquisando." },
              { icon: <Stethoscope />, title: "Passa para a equipe na hora certa", desc: "Pergunta sobre contraindicação, risco ou reação adversa a IA não responde: ela chama a sua equipe na hora e sai da frente." },
              { icon: <ShieldCheck />, title: "LGPD desde o começo", desc: "Dado de paciente é dado sensível pela Lei 13.709/18. Cada clínica enxerga apenas a própria base, com isolamento no banco." }
            ].map((feat, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -8, boxShadow: `0 20px 40px ${colors.cardBorder}40` }}
                style={{ background: colors.bg, border: `1px solid ${colors.cardBorder}50`, padding: '40px 32px', borderRadius: 3, transition: 'all 0.3s ease' }}
              >
                <div style={{ width: 64, height: 64, background: colors.cardBg, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32, border: `1px solid ${colors.cardBorder}` }}>
                  {React.cloneElement(feat.icon as React.ReactElement<any>, { size: 32, color: colors.primary })}
                </div>
                <h3 style={{ fontSize: '1.6rem', fontWeight: 400, marginBottom: 16, color: colors.primary }}>{feat.title}</h3>
                <p style={{ color: '#666', fontSize: '1rem', lineHeight: '1.6' }}>{feat.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* LGPD Compliance Section */}
      <section style={{ padding: isMobile ? '70px 0' : '100px 0', background: colors.primary, color: '#fff', overflow: 'hidden', position: 'relative' }}>
        {/* minWidth 0 nas colunas: item de grid tem min-width auto por padrão, então
            um filho largo (o quadro de conformidade, que é outra grade) estica a
            trilha além do container e vaza a tela no celular. */}
        <div style={{ ...containerStyle, padding: '0 20px', display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: isMobile ? 48 : 80, alignItems: 'center' }}>
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            style={{ minWidth: 0 }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: 'rgba(224, 201, 166, 0.12)', border: '1px solid rgba(224, 201, 166, 0.32)', borderRadius: 3, color: '#E0C9A6', fontSize: '0.85rem', fontWeight: '600', marginBottom: 32, textTransform: 'uppercase' }}>
              <ShieldCheck size={18} /> Proteção de dados de paciente
            </div>
            <h2 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 400, marginBottom: 24, lineHeight: '1.1', letterSpacing: '-0.02em' }}>Dado de estética é dado sensível.</h2>
            <p style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.72)', lineHeight: '1.6', marginBottom: 40 }}>
              O que a paciente conta no WhatsApp — o que a incomoda, o procedimento que procura, o que já fez antes — é dado de saúde pela Lei 13.709/18, e a LGPD trata isso com regra mais dura que dado comum. A Solara foi construída com esse isolamento no banco desde o primeiro dia.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {[
                "Isolamento por clínica no banco (RLS): sua base nunca cruza com a de outra.",
                "Criptografia em trânsito e em repouso em toda a conversa.",
                "Número próprio por clínica, verificado na Meta — nada de número compartilhado.",
                "Histórico de cada decisão da IA: o que ela respondeu, quando passou para a equipe e por quê."
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '1.05rem', fontWeight: '500' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: colors.btnSuccess, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={16} color={colors.primary} />
                  </div>
                  {item}
                </div>
              ))}
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            style={{ position: 'relative', minWidth: 0 }}
          >
            <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: isMobile ? '28px 20px' : '48px', borderRadius: 3, position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: '700', marginBottom: isMobile ? 24 : 32, display: 'flex', alignItems: 'center', gap: 16 }}>
                <Building size={32} color="#E0C9A6" /> O que está em vigor hoje
              </div>
              {/* Aqui só entra o que é verificável. Alegar certificação que a empresa
                  não possui (ISO 27001, SOC2) é publicidade enganosa — e some junto
                  com a confiança no dia em que um cliente pede o certificado. */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: isMobile ? 12 : 24 }}>
                {['LGPD (Lei 13.709/18)', 'Isolamento por clínica', 'Criptografia TLS + repouso', 'Trilha de auditoria'].map((cert, i) => (
                  <div key={i} style={{ padding: isMobile ? '16px' : '24px', background: 'rgba(255,255,255,0.03)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center', fontWeight: '700' }}>
                    {cert}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* System Experience Showcase */}
      <section id="experiencia" style={{ padding: isMobile ? '70px 0' : '120px 0', backgroundColor: colors.bg }}>
        <div style={{ ...containerStyle, padding: '0 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: 80 }}>
            <h2 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 400, marginBottom: 24, color: colors.primary, letterSpacing: '-0.02em' }}>Por dentro da Solara</h2>
            <p style={{ fontSize: '1.2rem', color: colors.primary, opacity: 0.72, maxWidth: 850, margin: '0 auto', lineHeight: '1.6' }}>
              O funil das suas pacientes, o tempo que cada uma esperou e a fila que precisa de você — numa tela só, pensada para quem atende procedimento estético.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: isMobile ? '28px' : '48px' }}>
            {[
              { img: '/recepcao.webp', title: 'Fila da equipe', alt: 'Painel da Solara com a fila de pacientes que aguardam atendimento humano', desc: 'Quem a IA passou para vocês, e há quanto tempo espera.' },
              { img: '/agenda.webp', title: 'Funil de leads', alt: 'Funil de leads da clínica de estética, da primeira mensagem até o agendamento', desc: 'Da primeira mensagem até a avaliação marcada — e onde está vazando.' },
              { img: '/prontuario.webp', title: 'Tempo de espera', alt: 'Indicadores de tempo de resposta da Solara, com a mediana da primeira resposta', desc: 'Quanto sua paciente esperou, e quanto foi atendido fora do expediente.' },
              { img: '/whatsapp.webp', title: 'WhatsApp & IA', alt: 'Conversa no WhatsApp em que a Solara confirma a consulta da paciente', desc: 'Atendimento, agendamento e confirmação na conversa da paciente.' }
            ].map((item, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -10 }}
                style={{ background: '#fff', borderRadius: 3, overflow: 'hidden', border: `1px solid ${colors.cardBorder}40`, boxShadow: '0 20px 50px rgba(0,0,0,0.05)' }}
              >
                <div style={{ width: '100%', height: isMobile ? '220px' : '350px', overflow: 'hidden', backgroundColor: '#f9f9f9' }}>
                  <img src={item.img} alt={item.alt} width="1024" height="501" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ padding: '40px', textAlign: 'center' }}>
                  <h4 style={{ fontSize: '1.8rem', fontWeight: 400, marginBottom: 12, color: colors.primary }}>{item.title}</h4>
                  <p style={{ fontSize: '1.1rem', color: '#666', fontWeight: '400' }}>{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ 
              marginTop: '40px',
              marginBottom: '40px',
              padding: isMobile ? '0 4px' : '0 100px',
              textAlign: 'center'
            }}
          >
            <p style={{ fontSize: '1.15rem', color: '#555', lineHeight: '1.6', fontWeight: '400' }}>
              <strong style={{ color: colors.primary, fontWeight: 600 }}>Só API oficial da Meta</strong> — A Solara não usa robô conectado por QR Code. A clínica tem número próprio verificado no Business Manager, com o WhatsApp Business seguindo normal no celular pelo recurso de coexistência. Atender quem chamou é ilimitado e não tem custo por mensagem. Mensagem que a clínica inicia depois de 24 horas sem resposta — lembrete de sessão e campanha de reativação — é cobrada pela Meta, e o painel mostra quais são e quanto vão custar antes de sair.
            </p>
          </motion.div>
        </div>
      </section>


      {/* Solara Voice - Voice Command Section (Motion Graphics) */}
      <section style={{ padding: isMobile ? '70px 0' : '120px 0', background: colors.primary, position: 'relative', overflow: 'hidden' }}>
        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            animate={{ 
              y: [0, -40 - i * 15, 0], 
              x: [0, (i % 2 === 0 ? 20 : -20), 0],
              opacity: [0.15, 0.4, 0.15]
            }}
            transition={{ repeat: Infinity, duration: 4 + i * 0.8, ease: 'easeInOut', delay: i * 0.5 }}
            style={{ 
              position: 'absolute', 
              width: 4 + i * 2, height: 4 + i * 2, 
              borderRadius: '50%', 
              background: i % 2 === 0 ? colors.btnSuccess : colors.cardBorder,
              top: `${15 + i * 14}%`, 
              left: `${10 + i * 15}%`,
              pointerEvents: 'none'
            }} 
          />
        ))}

        <div style={{ ...containerStyle, padding: '0 20px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: isMobile ? 48 : 80, alignItems: 'center' }}>

            {/* Left: Content with staggered animations */}
            <motion.div
              initial={{ opacity: 0, x: -60 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              viewport={{ once: true }}
              style={{ minWidth: 0 }}
            >
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                viewport={{ once: true }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', padding: '8px 20px', borderRadius: 3, marginBottom: 32 }}
              >
                <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                  <Mic size={16} color={colors.btnSuccess} />
                </motion.div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: colors.btnSuccess, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Voice Activated</span>
              </motion.div>
              
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.7 }}
                viewport={{ once: true }}
                style={{ fontSize: 'clamp(2rem, 6vw, 3.2rem)', fontWeight: 400, color: '#fff', lineHeight: 1.15, marginBottom: 24, letterSpacing: '-0.02em' }}
              >
                Comande sua <br />
                <span style={{ color: colors.btnSuccess }}>operação por voz.</span>
              </motion.h2>
              
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.7 }}
                viewport={{ once: true }}
                style={{ fontSize: '1.15rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: 40 }}
              >
                Diga <strong style={{ color: colors.btnSuccess }}>"Solara"</strong> e deixe a IA cuidar do resto. A secretária não precisa digitar — basta falar. O sistema reconhece o comando e executa automaticamente.
              </motion.p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {[
                  '"Solara, agende o Dr. Paulo para amanhã às 14h"',
                  '"Solara, quantos clientes temos hoje?"',
                  '"Solara, envie lembrete para a Maria"'
                ].map((example, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + i * 0.15, duration: 0.5 }}
                    viewport={{ once: true }}
                    style={{ display: 'flex', alignItems: 'center', gap: 14 }}
                  >
                    <motion.div 
                      animate={{ boxShadow: [`0 0 8px ${colors.btnSuccess}`, `0 0 20px ${colors.btnSuccess}`, `0 0 8px ${colors.btnSuccess}`] }}
                      transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
                      style={{ width: 8, height: 8, borderRadius: '50%', background: colors.btnSuccess, flexShrink: 0 }} 
                    />
                    <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.75)', fontWeight: 500, fontStyle: 'italic' }}>{example}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Right: Motion Graphics Visual */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, ease: 'easeOut' }}
              viewport={{ once: true }}
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            >
              <div style={{ position: 'relative', width: 380, height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                
                {/* Expanding sound wave rings */}
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={`wave-${i}`}
                    animate={{ scale: [1, 2.2], opacity: [0.4, 0] }}
                    transition={{ repeat: Infinity, duration: 3, delay: i * 1, ease: 'easeOut' }}
                    style={{ 
                      position: 'absolute', 
                      width: 160, height: 160, 
                      borderRadius: '50%', 
                      border: `1.5px solid ${colors.btnSuccess}`,
                      top: '50%', left: '50%',
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'none'
                    }} 
                  />
                ))}

                {/* Rotating orbit ring */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
                  style={{ position: 'absolute', width: 320, height: 320, borderRadius: '50%', border: '1px dashed rgba(255,255,255,0.08)' }}
                >
                  <div style={{ position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, borderRadius: '50%', background: colors.btnSuccess, boxShadow: `0 0 12px ${colors.btnSuccess}` }} />
                </motion.div>

                {/* Counter-rotating orbit */}
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ repeat: Infinity, duration: 18, ease: 'linear' }}
                  style={{ position: 'absolute', width: 360, height: 360, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div style={{ position: 'absolute', bottom: -3, right: '30%', width: 6, height: 6, borderRadius: '50%', background: colors.cardBorder, boxShadow: `0 0 8px ${colors.cardBorder}` }} />
                </motion.div>

                {/* Audio Waveform Equalizer */}
                <div style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4, alignItems: 'flex-end' }}>
                  {[0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 1, 0.3, 0.7, 0.5, 0.9].map((h, i) => (
                    <motion.div
                      key={`bar-${i}`}
                      animate={{ height: [h * 12, h * 28, h * 12] }}
                      transition={{ repeat: Infinity, duration: 0.8 + Math.random() * 0.6, delay: i * 0.08, ease: 'easeInOut' }}
                      style={{ width: 3, borderRadius: 3, background: colors.btnSuccess }}
                    />
                  ))}
                </div>

                {/* Static outer ring */}
                <div style={{ width: 280, height: 280, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute' }} />

                {/* Middle ring with subtle pulse */}
                <motion.div
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                  style={{ width: 220, height: 220, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute' }}
                />

                {/* Core: Mic Icon with glow */}
                <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, position: 'relative', zIndex: 2 }}>
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], filter: [`drop-shadow(0 0 8px ${colors.btnSuccess}40)`, `drop-shadow(0 0 20px ${colors.btnSuccess}80)`, `drop-shadow(0 0 8px ${colors.btnSuccess}40)`] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                  >
                    <Mic size={44} color={colors.btnSuccess} />
                  </motion.div>
                  <motion.span
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.btnSuccess, letterSpacing: '0.12em', textTransform: 'uppercase' }}
                  >
                    Ouvindo...
                  </motion.span>
                </div>

              </div>
            </motion.div>
          </div>
        </div>
      </section>


      {/* Pricing Section */}
      <section id="planos" style={{ padding: isMobile ? '70px 0' : '120px 0', background: colors.cardBg, borderTop: `1px solid ${colors.cardBorder}30`, borderBottom: `1px solid ${colors.cardBorder}30`, marginBottom: isMobile ? '70px' : '120px' }}>
        <div style={{ ...containerStyle, padding: '0 20px' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: isMobile ? '0 auto 40px' : '0 auto 56px' }}>
            <h2 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 400, marginBottom: 20, color: colors.primary, letterSpacing: '-0.02em' }}>Um plano, tudo incluso</h2>
            <p style={{ fontSize: '1.2rem', color: colors.primary, opacity: 0.72, lineHeight: '1.6' }}>
              Sem plano escondido, sem cobrança por especialista, sem taxa de implantação. A clínica inteira usa a mesma assinatura.
            </p>
          </div>

          {/* Alternância mensal / anual */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: isMobile ? 28 : 40 }}>
            <div role="group" aria-label="Forma de cobrança" style={{ display: 'inline-flex', background: colors.bg, border: `1px solid ${colors.cardBorder}`, borderRadius: 3, padding: 4, gap: 4 }}>
              {[
                { key: 'mensal' as const, label: 'Mensal' },
                { key: 'anual' as const, label: 'Anual · 20% off' }
              ].map((opt) => {
                const active = billing === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setBilling(opt.key)}
                    aria-pressed={active}
                    style={{
                      background: active ? colors.btnSuccess : 'transparent',
                      color: active ? '#fff' : colors.primary,
                      border: 'none',
                      borderRadius: 3,
                      padding: isMobile ? '10px 16px' : '12px 24px',
                      fontSize: isMobile ? '0.9rem' : '1rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'background 0.2s ease, color 0.2s ease'
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{
              maxWidth: 980,
              margin: '0 auto',
              background: colors.bg,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: 3,
              overflow: 'hidden',
              display: 'grid',
              gridTemplateColumns: isTablet ? '1fr' : '1.15fr 1fr',
              boxShadow: `0 24px 60px ${colors.cardBorder}40`
            }}
          >
            {/* Coluna do que está incluso */}
            <div style={{ padding: isMobile ? '32px 24px' : '48px 44px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: colors.cardBg, border: `1px solid ${colors.cardBorder}`, borderRadius: 3, color: colors.primary, fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 24 }}>
                <Stethoscope size={16} color={colors.btnSuccess} /> Solara Estética
              </div>
              <h3 style={{ fontSize: isMobile ? '1.3rem' : '1.5rem', fontWeight: 400, color: colors.primary, marginBottom: 24, letterSpacing: '-0.01em' }}>
                Tudo que a clínica precisa, sem módulo extra
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  'Recepcionista de IA no WhatsApp, 24 horas por dia',
                  'API oficial da Meta, com o número que a clínica já usa',
                  'Atender quem chama: ilimitado, sem custo por mensagem',
                  'Campanhas de reativação da base fria, com teto que você define',
                  'Agenda com horários reais — a IA nunca oferece o que não existe',
                  'Até 3 profissionais na agenda, usuários ilimitados',
                  'Funil de leads, tempo de resposta e origem de cada paciente',
                  'Suporte por WhatsApp com gente de verdade'
                ].map((item) => (
                  <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: '1rem', color: colors.primary, opacity: 0.85, lineHeight: 1.5 }}>
                    <CheckCircle2 size={20} color={colors.btnSuccess} style={{ flexShrink: 0, marginTop: 2 }} /> {item}
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: '0.85rem', color: '#6B5F71', lineHeight: 1.6, marginTop: 24, marginBottom: 0 }}>
                Campanha de reativação segue política de uso justo: ao chegar em 500 envios no mês, a Solara avisa e pausa.
                Você nunca recebe uma fatura maior do que a assinatura.
              </p>
            </div>

            {/* Coluna do preço */}
            <div style={{ background: colors.cardBg, padding: isMobile ? '32px 24px' : '48px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderLeft: isTablet ? 'none' : `1px solid ${colors.cardBorder}`, borderTop: isTablet ? `1px solid ${colors.cardBorder}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, color: colors.primary }}>
                <span style={{ fontSize: '1.3rem', fontWeight: 700 }}>R$</span>
                <span style={{ fontSize: 'clamp(3rem, 9vw, 4.5rem)', fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1 }}>{plan.price}</span>
                <span style={{ fontSize: '1.05rem', color: '#6B5F71', fontWeight: 500 }}>/mês</span>
              </div>

              <p style={{ fontSize: '0.95rem', color: '#6B5F71', lineHeight: 1.6, margin: '16px 0 28px' }}>{plan.note}</p>

              <button
                onClick={() => onNavigateToRegister(plan.name, plan.price, plan.slug, plan.priceId || '')}
                style={{
                  width: '100%',
                  background: colors.btnSuccess,
                  color: '#fff',
                  border: 'none',
                  padding: '18px',
                  borderRadius: 3,
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: `0 8px 24px ${colors.btnSuccess}52`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10
                }}
              >
                Começar 10 dias grátis <ArrowRight size={20} />
              </button>

              <p style={{ fontSize: '0.9rem', color: '#6B5F71', lineHeight: 1.6, marginTop: 16, marginBottom: 0, textAlign: 'center' }}>
                Sem cartão de crédito no teste. Sem taxa de implantação.<br />Sem fidelidade — cancele quando quiser.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" style={{ padding: isMobile ? '0 0 70px' : '0 0 120px', background: colors.bg }}>
        <div style={{ ...containerStyle, padding: '0 20px', maxWidth: 860 }}>
          <div style={{ textAlign: 'center', marginBottom: isMobile ? 40 : 64 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: colors.cardBg, border: `1px solid ${colors.cardBorder}80`, borderRadius: 3, color: colors.primary, fontSize: '0.85rem', fontWeight: 700, marginBottom: 24, textTransform: 'uppercase' }}>
              <MessageSquare size={16} color={colors.btnSuccess} /> Tire suas dúvidas
            </div>
            <h2 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 400, marginBottom: 16, color: colors.primary, letterSpacing: '-0.02em' }}>Perguntas Frequentes</h2>
            <p style={{ fontSize: '1.15rem', color: colors.primary, opacity: 0.72, lineHeight: 1.6 }}>O que toda clínica de estética pergunta antes de começar.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {faqs.map((f, i) => (
              <FaqItem key={i} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{ padding: isMobile ? '0 0 70px' : '0 0 120px' }}>
        <div style={{ ...containerStyle, padding: '0 20px' }}>
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            style={{ background: colors.primary, padding: isMobile ? '48px 24px' : '80px 60px', borderRadius: 3, textAlign: 'center', position: 'relative', overflow: 'hidden' }}
          >
            <h2 style={{ fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 400, color: colors.bg, marginBottom: 24, letterSpacing: '-0.02em' }}>Sua agenda cheia começa no WhatsApp.</h2>
            <p style={{ fontSize: '1.2rem', color: `${colors.bg}B0`, maxWidth: 600, margin: '0 auto 48px', lineHeight: '1.6' }}>
              Teste 10 dias grátis, sem cartão. Converse com a sua própria Solara e veja como ela atende as suas pacientes.
            </p>
            <motion.button
              onClick={handleWhatsAppClick}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{ backgroundColor: colors.btnSuccess, color: '#FFFFFF', border: 'none', padding: '20px 48px', borderRadius: 3, fontSize: '1.2rem', fontWeight: '600', cursor: 'pointer', boxShadow: `0 12px 32px ${colors.btnSuccess}40` }}
            >
              Começar meus 10 dias grátis
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* Rodapé em aubergine: fecha a página com o mesmo tom da seção de LGPD e
          do cartão de CTA, e é onde a logo dourada tem mais presença. O bege
          anterior deixava o fim da página apagado. */}
      <footer style={{ background: colors.primary, color: 'rgba(255,255,255,0.72)', fontWeight: '500', padding: '72px 0 56px' }}>
        <div style={{ ...containerStyle, padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 40, alignItems: 'center' }}>

          {/* Três colunas: marca à esquerda, o menu do site no centro e o
              institucional (termos e privacidade) à direita — cada um empilhado. */}
          <div style={{ width: '100%', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr', gap: isMobile ? 32 : 40, alignItems: 'start', textAlign: isMobile ? 'center' : 'left', justifyItems: isMobile ? 'center' : 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: isMobile ? 'center' : 'flex-start' }}>
              <LogoMarca width={120} />
              <span style={{ fontWeight: '600', color: '#fff' }}>Solara Estética © 2026</span>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                CNPJ 26.998.571/0001-50
              </div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                Contato: <a href="mailto:contato@solaraestetica.online" style={{ color: brandColors.goldLight, textDecoration: 'none' }}>contato@solaraestetica.online</a>
              </div>
            </div>

            <nav aria-label="Navegação do rodapé" style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}>
              {navItems.map((item) => (
                <a key={item.label} href={`#${item.target}`} style={{ color: 'rgba(255,255,255,0.72)', textDecoration: 'none', fontSize: '0.95rem' }}>
                  {item.label}
                </a>
              ))}
            </nav>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, justifySelf: isMobile ? 'center' : 'end', textAlign: isMobile ? 'center' : 'right' }}>
              <a href="#" style={{ color: 'rgba(255,255,255,0.72)', textDecoration: 'none', fontSize: '0.95rem' }}>Termos de Uso</a>
              <a href="#" style={{ color: 'rgba(255,255,255,0.72)', textDecoration: 'none', fontSize: '0.95rem' }}>Política de Privacidade (LGPD)</a>
            </div>
          </div>

          <div style={{ textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '30px', width: '100%' }}>
            <div style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.6)', fontWeight: '400' }}>
              Sistema desenvolvido pela empresa digital <a href="https://axoshub.com" target="_blank" rel="noopener noreferrer" style={{ color: brandColors.goldLight, fontWeight: '700', letterSpacing: '0.02em', textDecoration: 'none' }}>Axos Hub</a>
            </div>
          </div>

        </div>
      </footer>

      {/* Back to Top Button */}
      {showScrollTop && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          whileHover={{ scale: 1.1, backgroundColor: colors.primary, color: '#fff' }}
          whileTap={{ scale: 0.9 }}
          onClick={scrollToTop}
          style={{
            position: 'fixed',
            bottom: '40px',
            right: '40px',
            width: '56px',
            height: '56px',
            backgroundColor: colors.btnSuccess,
            color: colors.primary,
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 1000,
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            border: 'none',
            transition: 'background-color 0.3s ease, color 0.3s ease'
          }}
        >
          <ChevronUp size={28} strokeWidth={2.5} />
        </motion.div>
      )}
    </div>
  );
};

export default LandingPage;
