import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import React, { useState, useEffect, lazy, Suspense, StrictMode } from "react";
import { ViteReactSSG } from "vite-react-ssg/single-page";
import { motion, AnimatePresence } from "framer-motion";
import { X, Menu, ArrowRight, ShieldCheck, MessageSquare, Calendar, Clock, Building, Stethoscope, CheckCircle2, Mic, ChevronUp, ArrowLeft, AlertCircle, Mail, Lock, EyeOff, Eye, LockKeyhole, Building2, Phone, UserPlus } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/brand/tokens.ts");
const colors = {
  // Base
  inkDeep: "#17101A",
  // fundo das telas de autenticação
  ink: "#241B29",
  // texto secundário sobre claro
  inkField: "#2E2434",
  // campos de formulário sobre fundo escuro
  textMuted: "#6B5F71",
  // cor de marca, logo
  rose: "#A4566B",
  // hover do CTA
  gold: "#A9814E",
  // acento premium (ver regra acima)
  goldDeep: "#8A6636",
  // dourado legível em texto corrido — 5.0:1 sobre surface
  goldLight: "#E0C9A6",
  // realce suave, bordas de destaque
  // Superfícies
  surface: "#FFFFFF",
  // fundo da página — branco puro (era o off-white #FDFBFA)
  // Faixas e cards. Era #F5EDE7, um bege rosado que puxava para o pastel e
  // brigava com o rosé do CTA. Hoje é um erva-doce bem lavado: verde suave o
  // suficiente para descansar a página entre as seções quentes, e frio o
  // bastante para o dourado e o rosé ganharem destaque por contraste.
  sand: "#EDF1E8",
  border: "#DDE3D6",
  // Semânticas
  success: "#2F7D62",
  warn: "#C08A2E",
  danger: "#B4453C"
};
const landingColors = {
  primary: colors.ink,
  bg: colors.surface,
  cardBorder: colors.border,
  cardBg: colors.sand,
  btnSuccess: colors.rose,
  /** Dourado para texto (menu, links): o `gold` puro reprova em corpo de texto. */
  goldText: colors.goldDeep
};
const authColors = {
  bgRight: colors.ink,
  bgLeft: colors.inkDeep,
  cyan: colors.goldLight,
  // nome herdado; hoje é o champagne da marca
  cyanDark: "rgba(224, 201, 166, 0.2)",
  textMuted: "#A092A6",
  inputBg: colors.inkField,
  success: colors.success,
  danger: colors.danger,
  /** Botão principal das telas escuras. Chapado, sem degradê: é o mesmo rosé
   *  do CTA da landing, então a ação primária tem a mesma cor no site inteiro. */
  cta: colors.rose
};
const dashboardColors = {
  bg: colors.surface,
  sidebar: colors.ink,
  primary: colors.ink,
  accent: colors.gold,
  success: colors.success,
  danger: colors.danger,
  warn: colors.warn,
  text: colors.ink,
  textMuted: colors.textMuted
};
globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/Logo.tsx");
const ASPECTO = 394 / 537;
const LogoMarca = ({
  width,
  alt = "Solara Estética — Atendimento Automatizado",
  style
}) => /* @__PURE__ */ jsx(
  "img",
  {
    src: "/logo-solara-estetica.webp",
    alt,
    width,
    height: Math.round(width * ASPECTO),
    style: { width, height: "auto", display: "block", ...style }
  }
);
globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/lib/useViewport.ts");
const BREAKPOINTS = { mobile: 768, tablet: 1024 };
const getWidth = () => typeof window !== "undefined" ? window.innerWidth : 1200;
function useViewport() {
  const [width, setWidth] = useState(getWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return {
    width,
    isMobile: width <= BREAKPOINTS.mobile,
    isTablet: width <= BREAKPOINTS.tablet
  };
}
globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/LandingPage.tsx");
const LandingPage = ({ onNavigateToLogin, onNavigateToRegister }) => {
  const [showScrollTop, setShowScrollTop] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [billing, setBilling] = React.useState("mensal");
  const { isMobile, isTablet } = useViewport();
  const PLANOS = {
    mensal: {
      name: "Solara Estética — Mensal",
      slug: "solara-mensal",
      price: "497",
      note: "Cobrado todo mês. Cancele quando quiser, sem multa.",
      priceId: void 0
    },
    anual: {
      name: "Solara Estética — Anual",
      slug: "solara-anual",
      price: "397",
      note: "R$ 4.764 cobrados uma vez por ano — economia de R$ 1.200 em relação ao mensal.",
      priceId: void 0
    }
  };
  const plan = PLANOS[billing];
  const navItems = [
    { label: "Soluções", target: "solucoes" },
    { label: "Especialistas", target: "experiencia" },
    { label: "Planos", target: "planos" },
    { label: "FAQ", target: "faq" }
  ];
  React.useEffect(() => {
    if (!isMobile && menuOpen) setMenuOpen(false);
  }, [isMobile, menuOpen]);
  React.useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);
  React.useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleWhatsAppClick = () => {
    window.open("https://wa.me/5512978138934?text=Olá!%20Quero%20testar%20a%20Solara%20Estética%20por%2010%20dias%20na%20minha%20clínica.", "_blank");
  };
  const colors$1 = landingColors;
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
    maxWidth: "1140px",
    margin: "0 auto",
    width: "100%",
    position: "relative",
    zIndex: 1
  };
  const NavLink = ({ label, target, color, hoverColor }) => {
    const [hovered, setHovered] = useState(false);
    return /* @__PURE__ */ jsxs(
      motion.a,
      {
        href: `#${target}`,
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
        whileHover: { y: -2 },
        style: {
          color: hovered ? hoverColor : color,
          textDecoration: "none",
          fontWeight: "600",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          cursor: "pointer",
          position: "relative",
          padding: "8px 4px",
          fontSize: "1rem",
          letterSpacing: "-0.01em"
        },
        children: [
          label,
          /* @__PURE__ */ jsx(
            motion.div,
            {
              initial: { width: 0, opacity: 0 },
              animate: { width: hovered ? "100%" : 0, opacity: hovered ? 1 : 0 },
              transition: { duration: 0.3 },
              style: {
                position: "absolute",
                bottom: 0,
                left: 0,
                height: 3,
                background: hoverColor,
                borderRadius: 3,
                boxShadow: `0 2px 10px ${hoverColor}40`
              }
            }
          )
        ]
      }
    );
  };
  const FaqItem = ({ q, a }) => {
    const [open, setOpen] = useState(false);
    return /* @__PURE__ */ jsxs("div", { style: { border: `1px solid ${colors$1.cardBorder}50`, borderRadius: 3, background: colors$1.bg, overflow: "hidden" }, children: [
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => setOpen((v) => !v),
          "aria-expanded": open,
          style: {
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            padding: isMobile ? "20px" : "24px 28px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "inherit"
          },
          children: [
            /* @__PURE__ */ jsx("span", { style: { fontSize: isMobile ? "1.05rem" : "1.15rem", fontWeight: 700, color: colors$1.primary }, children: q }),
            /* @__PURE__ */ jsx(ChevronUp, { size: 22, color: colors$1.btnSuccess, style: { flexShrink: 0, transition: "transform 0.3s ease", transform: open ? "rotate(0deg)" : "rotate(180deg)" } })
          ]
        }
      ),
      /* @__PURE__ */ jsx(
        motion.div,
        {
          initial: false,
          animate: { height: open ? "auto" : 0, opacity: open ? 1 : 0 },
          transition: { duration: 0.3, ease: "easeInOut" },
          style: { overflow: "hidden" },
          children: /* @__PURE__ */ jsx("p", { style: { padding: isMobile ? "0 20px 20px" : "0 28px 24px", color: "#666", fontSize: "1rem", lineHeight: 1.6 }, children: a })
        }
      )
    ] });
  };
  const faqs = [
    {
      q: "O que é a Solara Estética?",
      a: "A Solara Estética é um sistema de gestão para clínicas de estética e cirurgia plástica com uma recepcionista de inteligência artificial que atende no WhatsApp. Ela agenda procedimentos, confirma consultas e responde pacientes 24 horas por dia, junto com agenda, prontuário e gestão de atendimento na mesma plataforma."
    },
    {
      q: "Como a Solara reduz o no-show na minha clínica de estética?",
      a: "A Solara envia lembrete e pedido de confirmação pelo WhatsApp antes de cada sessão, e reorganiza a agenda quando a paciente responde que não vai. Em clínica de estética o horário vago é receita que não volta: a cadeira ficou parada e o profissional também."
    },
    {
      q: "A Solara usa a API oficial do WhatsApp?",
      a: "Sim. A integração é feita pela API oficial da Meta (WhatsApp Cloud API), não por robô conectado via QR Code. Isso significa número que não cai, conformidade com as regras da Meta e nenhum risco de banimento do WhatsApp da clínica."
    },
    {
      q: "Vou perder o WhatsApp Business que já uso no celular?",
      a: "Não. A conexão usa o recurso de coexistência da Meta: o aplicativo WhatsApp Business continua funcionando normalmente no seu celular, com o mesmo número, enquanto a Solara atende pela API ao mesmo tempo."
    },
    {
      q: "Como funcionam os 10 dias grátis?",
      a: "Você cria a conta e usa a plataforma por 10 dias, sem cartão de crédito. Nesse período você conversa com a sua própria Solara pelo WhatsApp para ver como ela atende. Gostou, assina; não gostou, é só não continuar."
    },
    {
      q: "Os dados das minhas pacientes ficam seguros?",
      a: "Ficam. Ficha de anamnese, histórico de procedimento e foto de evolução são dados sensíveis pela LGPD (Lei 13.709/18). Os dados trafegam e ficam armazenados criptografados, cada clínica só enxerga a própria base por isolamento no banco de dados, e todo acesso a dado de paciente fica registrado em trilha de auditoria."
    },
    {
      q: "Preciso instalar algum programa?",
      a: "Não. Funciona no navegador, no computador ou no celular. É só entrar com seu login."
    },
    {
      q: "Tem fidelidade ou multa para cancelar?",
      a: "Não tem fidelidade nem multa. A assinatura é mensal e você cancela quando quiser. No plano anual o valor mensal cai, mas a escolha é sua."
    }
  ];
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a }
    }))
  };
  return /* @__PURE__ */ jsxs("div", { style: { backgroundColor: colors$1.bg, color: colors$1.primary, minHeight: "100vh", fontFamily: "'Outfit', sans-serif", overflowX: "hidden" }, children: [
    /* @__PURE__ */ jsx("script", { type: "application/ld+json", dangerouslySetInnerHTML: { __html: JSON.stringify(faqJsonLd) } }),
    /* @__PURE__ */ jsx("nav", { style: {
      position: "fixed",
      width: "100%",
      top: 0,
      zIndex: 100,
      background: "#FFFFFF",
      borderBottom: `1px solid ${colors$1.btnSuccess}`,
      padding: "16px 0",
      transition: "all 0.4s ease"
    }, children: /* @__PURE__ */ jsxs("div", { style: { ...containerStyle, display: "grid", gridTemplateColumns: isMobile ? "1fr auto" : "1fr auto 1fr", alignItems: "center", padding: "0 24px" }, children: [
      /* @__PURE__ */ jsx("a", { href: "#", "aria-label": "Solara Estética — início", style: { display: "block", lineHeight: 0, justifySelf: "start" }, children: /* @__PURE__ */ jsx(LogoMarca, { width: isMobile ? 130 : 160 }) }),
      !isMobile && /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 32, justifySelf: "center" }, children: navItems.map((item) => /* @__PURE__ */ jsx(NavLink, { label: item.label, target: item.target, color: colors$1.goldText, hoverColor: colors$1.btnSuccess }, item.label)) }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: isMobile ? 12 : 32, alignItems: "center", justifySelf: "end" }, children: [
        !isMobile && /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx(
          motion.button,
          {
            onClick: onNavigateToLogin,
            whileHover: { scale: 1.02, boxShadow: `0 10px 30px ${colors$1.btnSuccess}30` },
            whileTap: { scale: 0.98 },
            style: {
              backgroundColor: colors$1.btnSuccess,
              color: "#fff",
              border: "none",
              padding: "12px 24px",
              borderRadius: 3,
              fontWeight: "700",
              cursor: "pointer",
              fontSize: "0.95rem",
              letterSpacing: "0.02em",
              transition: "all 0.3s ease",
              whiteSpace: "nowrap"
            },
            children: "Acesso Restrito"
          }
        ) }),
        isMobile && /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setMenuOpen((v) => !v),
            "aria-label": menuOpen ? "Fechar menu" : "Abrir menu",
            "aria-expanded": menuOpen,
            style: {
              background: "transparent",
              border: `1px solid ${colors$1.cardBorder}`,
              borderRadius: 3,
              padding: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: colors$1.primary,
              zIndex: 110
            },
            children: menuOpen ? /* @__PURE__ */ jsx(X, { size: 26 }) : /* @__PURE__ */ jsx(Menu, { size: 26 })
          }
        )
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(AnimatePresence, { children: isMobile && menuOpen && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(
        motion.div,
        {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          onClick: () => setMenuOpen(false),
          style: { position: "fixed", inset: 0, background: "rgba(36, 27, 41, 0.45)", zIndex: 90 }
        }
      ),
      /* @__PURE__ */ jsxs(
        motion.div,
        {
          initial: { x: "100%" },
          animate: { x: 0 },
          exit: { x: "100%" },
          transition: { type: "tween", duration: 0.3, ease: [0.16, 1, 0.3, 1] },
          style: {
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 95,
            width: "min(80vw, 320px)",
            background: colors$1.bg,
            boxShadow: `-20px 0 60px ${colors$1.primary}20`,
            padding: "88px 24px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 8
          },
          children: [
            navItems.map((item) => /* @__PURE__ */ jsx(
              "a",
              {
                href: `#${item.target}`,
                onClick: () => setMenuOpen(false),
                style: {
                  color: colors$1.goldText,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: "1.1rem",
                  padding: "16px 12px",
                  borderRadius: 3,
                  borderBottom: `1px solid ${colors$1.cardBorder}30`
                },
                children: item.label
              },
              item.label
            )),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => {
                  setMenuOpen(false);
                  onNavigateToLogin();
                },
                style: {
                  marginTop: 16,
                  backgroundColor: colors$1.btnSuccess,
                  color: "#fff",
                  border: "none",
                  padding: "16px 24px",
                  borderRadius: 3,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: "1rem",
                  letterSpacing: "0.02em",
                  width: "100%"
                },
                children: "Acesso Restrito"
              }
            )
          ]
        }
      )
    ] }) }),
    /* @__PURE__ */ jsx("header", { style: { paddingTop: isMobile ? "120px" : "180px", paddingBottom: isMobile ? "70px" : "120px", position: "relative" }, children: /* @__PURE__ */ jsxs("div", { style: { ...containerStyle, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 20px" }, children: [
      /* @__PURE__ */ jsxs(motion.div, { initial: "initial", animate: "animate", variants: staggerContainer, style: { maxWidth: "900px" }, children: [
        /* @__PURE__ */ jsxs(motion.div, { variants: fadeInUp, style: { display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 20px", background: colors$1.cardBg, border: `1px solid ${colors$1.cardBorder}80`, borderRadius: 3, color: colors$1.primary, fontSize: "0.9rem", fontWeight: "600", marginBottom: 40, textTransform: "uppercase" }, children: [
          /* @__PURE__ */ jsx("span", { style: { width: 8, height: 8, background: colors$1.btnSuccess, borderRadius: "50%", display: "inline-block", boxShadow: `0 0 10px ${colors$1.btnSuccess}` } }),
          "Software para clínicas de estética e cirurgia plástica"
        ] }),
        /* @__PURE__ */ jsxs(motion.h1, { variants: fadeInUp, style: { fontSize: "clamp(2rem, 7vw, 46px)", fontWeight: 400, lineHeight: "1.18", marginBottom: 32, letterSpacing: "-0.015em", color: colors$1.primary }, children: [
          "A recepcionista de IA da sua",
          /* @__PURE__ */ jsx("br", {}),
          /* @__PURE__ */ jsxs("span", { style: { position: "relative", color: colors.gold, display: "inline-block", textTransform: "uppercase", letterSpacing: "0.01em", fontWeight: 500, fontSize: "calc(1em - 2px)" }, children: [
            "clínica de estética.",
            /* @__PURE__ */ jsx("svg", { style: { position: "absolute", bottom: -6, left: 0, width: "100%", height: 8, zIndex: -1 }, viewBox: "0 0 300 8", preserveAspectRatio: "none", "aria-hidden": "true", children: /* @__PURE__ */ jsx("path", { d: "M0 5 Q 150 9 300 5", fill: "none", stroke: colors.gold, strokeWidth: "3", strokeLinecap: "round", opacity: "0.4" }) })
          ] })
        ] }),
        /* @__PURE__ */ jsx(motion.p, { variants: fadeInUp, style: { fontSize: "1.15rem", color: colors$1.primary, opacity: 0.78, maxWidth: 700, margin: "0 auto 48px", fontWeight: "400", lineHeight: "1.6" }, children: "A Solara atende no WhatsApp 24 horas por dia, agenda procedimentos, confirma consultas e resgata paciente sumida — usando os dados reais da sua clínica, sem inventar preço nem horário. Feita para clínica de estética avançada, harmonização facial e cirurgia plástica." }),
        /* @__PURE__ */ jsxs(motion.div, { variants: fadeInUp, style: { display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "center", gap: isMobile ? 16 : 24, width: isMobile ? "100%" : "auto" }, children: [
          /* @__PURE__ */ jsxs(
            motion.button,
            {
              onClick: handleWhatsAppClick,
              whileHover: { scale: 1.03, y: -2 },
              whileTap: { scale: 0.97 },
              style: { backgroundColor: colors$1.btnSuccess, color: "#FFFFFF", border: "none", padding: isMobile ? "18px 28px" : "20px 40px", borderRadius: 3, fontSize: "1.1rem", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, boxShadow: `0 12px 32px ${colors$1.btnSuccess}40`, width: isMobile ? "100%" : "auto" },
              children: [
                "Testar 10 dias grátis ",
                /* @__PURE__ */ jsx(ArrowRight, { size: 20 })
              ]
            }
          ),
          /* @__PURE__ */ jsx(
            motion.button,
            {
              onClick: () => document.getElementById("solucoes")?.scrollIntoView({ behavior: "smooth" }),
              whileHover: { scale: 1.03, backgroundColor: colors$1.cardBg },
              whileTap: { scale: 0.97 },
              style: { backgroundColor: "transparent", color: colors$1.primary, border: `1.5px solid ${colors$1.cardBorder}`, padding: isMobile ? "18px 28px" : "20px 40px", borderRadius: 3, fontSize: "1.1rem", fontWeight: "600", cursor: "pointer", width: isMobile ? "100%" : "auto" },
              children: "Ver como funciona"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs(
        motion.div,
        {
          initial: { opacity: 0, y: 60 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] },
          style: { marginTop: "80px", width: "100%", position: "relative" },
          children: [
            /* @__PURE__ */ jsx("div", { style: { borderRadius: 3, overflow: "hidden", border: `1px solid ${colors$1.cardBorder}50`, boxShadow: `0 40px 80px ${colors$1.primary}15`, background: colors$1.bg, padding: "16px" }, children: /* @__PURE__ */ jsx(
              "img",
              {
                src: "/hero-solara.webp",
                alt: "Painel da Solara Estética com a agenda do dia e a conversa de confirmação de consulta no WhatsApp",
                width: "1024",
                height: "821",
                fetchPriority: "high",
                decoding: "async",
                style: { width: "100%", height: "auto", borderRadius: 3, display: "block", border: `1px solid ${colors$1.cardBorder}30` }
              }
            ) }),
            /* @__PURE__ */ jsxs(motion.div, { animate: { y: [0, -15, 0] }, transition: { repeat: Infinity, duration: 5, ease: "easeInOut" }, style: { position: "absolute", top: isMobile ? -16 : -30, right: isMobile ? 8 : -30, background: colors$1.bg, border: `1px solid ${colors$1.cardBorder}`, padding: isMobile ? "12px 16px" : "20px 32px", borderRadius: 3, boxShadow: `0 20px 40px ${colors$1.primary}10`, display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, maxWidth: "calc(100% - 16px)" }, children: [
              /* @__PURE__ */ jsx("div", { style: { width: 48, height: 48, borderRadius: 3, background: `${colors$1.btnSuccess}20`, display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ jsx(ShieldCheck, { size: 28, color: colors$1.btnSuccess }) }),
              /* @__PURE__ */ jsxs("div", { style: { textAlign: "left" }, children: [
                /* @__PURE__ */ jsx("div", { style: { fontWeight: "700", color: colors$1.primary, fontSize: "1.2rem" }, children: "LGPD" }),
                /* @__PURE__ */ jsx("div", { style: { fontSize: "0.9rem", color: colors$1.primary, opacity: 0.65, fontWeight: "500" }, children: "Dado de saúde protegido" })
              ] })
            ] })
          ]
        }
      )
    ] }) }),
    /* @__PURE__ */ jsx("section", { style: { borderTop: `1px solid ${colors$1.cardBorder}30`, borderBottom: `1px solid ${colors$1.cardBorder}30`, background: colors$1.cardBg }, children: /* @__PURE__ */ jsxs("div", { style: { ...containerStyle, padding: "60px 20px", textAlign: "center" }, children: [
      /* @__PURE__ */ jsx("p", { style: { color: colors$1.primary, opacity: 0.7, fontSize: "0.9rem", fontWeight: "600", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 40 }, children: "Feito para as especialidades que mais crescem" }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: isMobile ? "16px 24px" : 32, alignItems: "center", opacity: 0.88 }, children: ["HARMONIZAÇÃO FACIAL", "CIRURGIA PLÁSTICA", "ESTÉTICA CORPORAL", "DERMATOLOGIA ESTÉTICA", "CAPILAR"].map((brand, i) => /* @__PURE__ */ jsx("h3", { style: { fontSize: "clamp(1rem, 3vw, 1.5rem)", fontWeight: 400, color: colors$1.primary }, children: brand }, i)) })
    ] }) }),
    /* @__PURE__ */ jsx("section", { id: "solucoes", style: { padding: isMobile ? "70px 0 0 0" : "120px 0 0 0" }, children: /* @__PURE__ */ jsxs("div", { style: { ...containerStyle, padding: "0 20px" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { textAlign: "center", marginBottom: 80, maxWidth: 800, margin: "0 auto 80px" }, children: [
        /* @__PURE__ */ jsx("h2", { style: { fontSize: "clamp(2rem, 6vw, 3.5rem)", fontWeight: 400, marginBottom: 24, color: colors$1.primary, letterSpacing: "-0.02em" }, children: "Feito para o jeito que uma clínica de estética funciona" }),
        /* @__PURE__ */ jsx("p", { style: { fontSize: "1.2rem", color: colors$1.primary, opacity: 0.72, lineHeight: "1.6" }, children: "Sua paciente decide pelo WhatsApp, remarca pelo WhatsApp e some pelo WhatsApp. É lá que a Solara trabalha." })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 32 }, children: [
        { icon: /* @__PURE__ */ jsx(MessageSquare, {}), title: "Atendimento 24 horas", desc: "A Solara responde no WhatsApp de madrugada, no domingo e no feriado — com os dados reais da sua clínica, sem inventar preço nem horário." },
        { icon: /* @__PURE__ */ jsx(Calendar, {}), title: "Agendamento sem ligação", desc: "A paciente escolhe procedimento, profissional e horário na própria conversa. O agendamento entra direto na sua agenda." },
        { icon: /* @__PURE__ */ jsx(Clock, {}), title: "Menos no-show", desc: "Lembrete e confirmação automáticos antes da sessão. Horário vago é receita que não volta." },
        { icon: /* @__PURE__ */ jsx(Building, {}), title: "Kanban de atendimento", desc: "Quem chegou, quem está em procedimento e quem já saiu — o dia inteiro numa tela só." },
        { icon: /* @__PURE__ */ jsx(Stethoscope, {}), title: "Prontuário e histórico", desc: "Procedimentos, evolução e anotações de cada paciente reunidos em um lugar, prontos antes dela sentar na cadeira." },
        { icon: /* @__PURE__ */ jsx(ShieldCheck, {}), title: "LGPD desde o começo", desc: "Dado de paciente é dado sensível pela Lei 13.709/18. Cada clínica enxerga apenas a própria base, com isolamento no banco." }
      ].map((feat, i) => /* @__PURE__ */ jsxs(
        motion.div,
        {
          initial: { opacity: 0, y: 40 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-100px" },
          transition: { delay: i * 0.1 },
          whileHover: { y: -8, boxShadow: `0 20px 40px ${colors$1.cardBorder}40` },
          style: { background: colors$1.bg, border: `1px solid ${colors$1.cardBorder}50`, padding: "40px 32px", borderRadius: 3, transition: "all 0.3s ease" },
          children: [
            /* @__PURE__ */ jsx("div", { style: { width: 64, height: 64, background: colors$1.cardBg, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 32, border: `1px solid ${colors$1.cardBorder}` }, children: React.cloneElement(feat.icon, { size: 32, color: colors$1.primary }) }),
            /* @__PURE__ */ jsx("h3", { style: { fontSize: "1.6rem", fontWeight: 400, marginBottom: 16, color: colors$1.primary }, children: feat.title }),
            /* @__PURE__ */ jsx("p", { style: { color: "#666", fontSize: "1rem", lineHeight: "1.6" }, children: feat.desc })
          ]
        },
        i
      )) })
    ] }) }),
    /* @__PURE__ */ jsx("section", { style: { padding: isMobile ? "70px 0" : "100px 0", background: colors$1.primary, color: "#fff", overflow: "hidden", position: "relative" }, children: /* @__PURE__ */ jsxs("div", { style: { ...containerStyle, padding: "0 20px", display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)", gap: isMobile ? 48 : 80, alignItems: "center" }, children: [
      /* @__PURE__ */ jsxs(
        motion.div,
        {
          initial: { opacity: 0, x: -40 },
          whileInView: { opacity: 1, x: 0 },
          viewport: { once: true },
          style: { minWidth: 0 },
          children: [
            /* @__PURE__ */ jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 16px", background: "rgba(224, 201, 166, 0.12)", border: "1px solid rgba(224, 201, 166, 0.32)", borderRadius: 3, color: "#E0C9A6", fontSize: "0.85rem", fontWeight: "600", marginBottom: 32, textTransform: "uppercase" }, children: [
              /* @__PURE__ */ jsx(ShieldCheck, { size: 18 }),
              " Proteção de dados de paciente"
            ] }),
            /* @__PURE__ */ jsx("h2", { style: { fontSize: "clamp(2rem, 6vw, 3.5rem)", fontWeight: 400, marginBottom: 24, lineHeight: "1.1", letterSpacing: "-0.02em" }, children: "Dado de estética é dado sensível." }),
            /* @__PURE__ */ jsx("p", { style: { fontSize: "1.2rem", color: "rgba(255,255,255,0.72)", lineHeight: "1.6", marginBottom: 40 }, children: "Foto de antes e depois, histórico de procedimento e ficha de anamnese são dados de saúde pela Lei 13.709/18 — a LGPD trata isso com regra mais dura que dado comum. A Solara foi construída com esse isolamento no banco desde o primeiro dia." }),
            /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 20 }, children: [
              "Isolamento por clínica no banco (RLS): sua base nunca cruza com a de outra.",
              "Criptografia em trânsito e em repouso nos prontuários e anexos.",
              "Registro de consentimento para uso de imagem e termo de procedimento.",
              "Trilha de auditoria de cada acesso a dado de paciente."
            ].map((item, i) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 16, fontSize: "1.05rem", fontWeight: "500" }, children: [
              /* @__PURE__ */ jsx("div", { style: { width: 24, height: 24, borderRadius: "50%", background: colors$1.btnSuccess, display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ jsx(CheckCircle2, { size: 16, color: colors$1.primary }) }),
              item
            ] }, i)) })
          ]
        }
      ),
      /* @__PURE__ */ jsx(
        motion.div,
        {
          initial: { opacity: 0, scale: 0.9 },
          whileInView: { opacity: 1, scale: 1 },
          viewport: { once: true },
          style: { position: "relative", minWidth: 0 },
          children: /* @__PURE__ */ jsxs("div", { style: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", padding: isMobile ? "28px 20px" : "48px", borderRadius: 3, position: "relative", zIndex: 1 }, children: [
            /* @__PURE__ */ jsxs("div", { style: { fontSize: isMobile ? "1.25rem" : "1.5rem", fontWeight: "700", marginBottom: isMobile ? 24 : 32, display: "flex", alignItems: "center", gap: 16 }, children: [
              /* @__PURE__ */ jsx(Building, { size: 32, color: "#E0C9A6" }),
              " O que está em vigor hoje"
            ] }),
            /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)", gap: isMobile ? 12 : 24 }, children: ["LGPD (Lei 13.709/18)", "Isolamento por clínica", "Criptografia TLS + repouso", "Trilha de auditoria"].map((cert, i) => /* @__PURE__ */ jsx("div", { style: { padding: isMobile ? "16px" : "24px", background: "rgba(255,255,255,0.03)", borderRadius: 3, border: "1px solid rgba(255,255,255,0.05)", textAlign: "center", fontWeight: "700" }, children: cert }, i)) })
          ] })
        }
      )
    ] }) }),
    /* @__PURE__ */ jsx("section", { id: "experiencia", style: { padding: isMobile ? "70px 0" : "120px 0", backgroundColor: colors$1.bg }, children: /* @__PURE__ */ jsxs("div", { style: { ...containerStyle, padding: "0 20px" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { textAlign: "center", marginBottom: 80 }, children: [
        /* @__PURE__ */ jsx("h2", { style: { fontSize: "clamp(2rem, 6vw, 3.5rem)", fontWeight: 400, marginBottom: 24, color: colors$1.primary, letterSpacing: "-0.02em" }, children: "Por dentro da Solara" }),
        /* @__PURE__ */ jsx("p", { style: { fontSize: "1.2rem", color: colors$1.primary, opacity: 0.72, maxWidth: 850, margin: "0 auto", lineHeight: "1.6" }, children: "Sua recepção, sua agenda e o WhatsApp da clínica na mesma tela — pensada para quem atende procedimento estético, não para quem administra hospital." })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: isMobile ? "28px" : "48px" }, children: [
        { img: "/recepcao.webp", title: "Recepção Inteligente", alt: "Painel de recepção da Solara com a fila de pacientes e as salas da clínica em tempo real", desc: "Controle de fila e salas em tempo real." },
        { img: "/agenda.webp", title: "Agenda da Clínica", alt: "Agenda da clínica de estética com os procedimentos do dia por profissional", desc: "Procedimentos do dia por profissional e por sala." },
        { img: "/prontuario.webp", title: "Prontuário Digital", alt: "Prontuário eletrônico da paciente com histórico de procedimentos e ficha de anamnese", desc: "Histórico clínico unificado e seguro." },
        { img: "/whatsapp.webp", title: "WhatsApp & IA", alt: "Conversa no WhatsApp em que a Solara confirma a consulta da paciente", desc: "Automação de lembretes e confirmação de presença no WhatsApp." }
      ].map((item, i) => /* @__PURE__ */ jsxs(
        motion.div,
        {
          whileHover: { y: -10 },
          style: { background: "#fff", borderRadius: 3, overflow: "hidden", border: `1px solid ${colors$1.cardBorder}40`, boxShadow: "0 20px 50px rgba(0,0,0,0.05)" },
          children: [
            /* @__PURE__ */ jsx("div", { style: { width: "100%", height: isMobile ? "220px" : "350px", overflow: "hidden", backgroundColor: "#f9f9f9" }, children: /* @__PURE__ */ jsx("img", { src: item.img, alt: item.alt, width: "1024", height: "501", loading: "lazy", decoding: "async", style: { width: "100%", height: "100%", objectFit: "cover" } }) }),
            /* @__PURE__ */ jsxs("div", { style: { padding: "40px", textAlign: "center" }, children: [
              /* @__PURE__ */ jsx("h4", { style: { fontSize: "1.8rem", fontWeight: 400, marginBottom: 12, color: colors$1.primary }, children: item.title }),
              /* @__PURE__ */ jsx("p", { style: { fontSize: "1.1rem", color: "#666", fontWeight: "400" }, children: item.desc })
            ] })
          ]
        },
        i
      )) }),
      /* @__PURE__ */ jsx(
        motion.div,
        {
          initial: { opacity: 0, y: 20 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true },
          style: {
            marginTop: "40px",
            marginBottom: "40px",
            padding: isMobile ? "0 4px" : "0 100px",
            textAlign: "center"
          },
          children: /* @__PURE__ */ jsxs("p", { style: { fontSize: "1.15rem", color: "#555", lineHeight: "1.6", fontWeight: "400" }, children: [
            /* @__PURE__ */ jsx("strong", { style: { color: colors$1.primary, fontWeight: "700" }, children: "Automação Inteligente de WhatsApp" }),
            " — Para clínicas de rotina padrão (até 50 lembretes diários), a integração é imediata, via QR Code e sem custos extras. Para clínicas com alto volume de campanhas de marketing (acima de 50 disparos/dia), nossa plataforma integra-se diretamente com a API Oficial da Meta para garantir a entrega e blindar seu número contra bloqueios (aplicam-se taxas de consumo da Meta)."
          ] })
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxs("section", { style: { padding: isMobile ? "70px 0" : "120px 0", background: colors$1.primary, position: "relative", overflow: "hidden" }, children: [
      [...Array(6)].map((_, i) => /* @__PURE__ */ jsx(
        motion.div,
        {
          animate: {
            y: [0, -40 - i * 15, 0],
            x: [0, i % 2 === 0 ? 20 : -20, 0],
            opacity: [0.15, 0.4, 0.15]
          },
          transition: { repeat: Infinity, duration: 4 + i * 0.8, ease: "easeInOut", delay: i * 0.5 },
          style: {
            position: "absolute",
            width: 4 + i * 2,
            height: 4 + i * 2,
            borderRadius: "50%",
            background: i % 2 === 0 ? colors$1.btnSuccess : colors$1.cardBorder,
            top: `${15 + i * 14}%`,
            left: `${10 + i * 15}%`,
            pointerEvents: "none"
          }
        },
        `particle-${i}`
      )),
      /* @__PURE__ */ jsx("div", { style: { ...containerStyle, padding: "0 20px", position: "relative", zIndex: 1 }, children: /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)", gap: isMobile ? 48 : 80, alignItems: "center" }, children: [
        /* @__PURE__ */ jsxs(
          motion.div,
          {
            initial: { opacity: 0, x: -60 },
            whileInView: { opacity: 1, x: 0 },
            transition: { duration: 0.8, ease: "easeOut" },
            viewport: { once: true },
            style: { minWidth: 0 },
            children: [
              /* @__PURE__ */ jsxs(
                motion.div,
                {
                  initial: { opacity: 0, y: 10 },
                  whileInView: { opacity: 1, y: 0 },
                  transition: { delay: 0.2 },
                  viewport: { once: true },
                  style: { display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", padding: "8px 20px", borderRadius: 3, marginBottom: 32 },
                  children: [
                    /* @__PURE__ */ jsx(motion.div, { animate: { scale: [1, 1.3, 1] }, transition: { repeat: Infinity, duration: 1.5 }, children: /* @__PURE__ */ jsx(Mic, { size: 16, color: colors$1.btnSuccess }) }),
                    /* @__PURE__ */ jsx("span", { style: { fontSize: "0.85rem", fontWeight: 700, color: colors$1.btnSuccess, letterSpacing: "0.05em", textTransform: "uppercase" }, children: "Voice Activated" })
                  ]
                }
              ),
              /* @__PURE__ */ jsxs(
                motion.h2,
                {
                  initial: { opacity: 0, y: 20 },
                  whileInView: { opacity: 1, y: 0 },
                  transition: { delay: 0.35, duration: 0.7 },
                  viewport: { once: true },
                  style: { fontSize: "clamp(2rem, 6vw, 3.2rem)", fontWeight: 400, color: "#fff", lineHeight: 1.15, marginBottom: 24, letterSpacing: "-0.02em" },
                  children: [
                    "Comande sua ",
                    /* @__PURE__ */ jsx("br", {}),
                    /* @__PURE__ */ jsx("span", { style: { color: colors$1.btnSuccess }, children: "operação por voz." })
                  ]
                }
              ),
              /* @__PURE__ */ jsxs(
                motion.p,
                {
                  initial: { opacity: 0, y: 20 },
                  whileInView: { opacity: 1, y: 0 },
                  transition: { delay: 0.5, duration: 0.7 },
                  viewport: { once: true },
                  style: { fontSize: "1.15rem", color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginBottom: 40 },
                  children: [
                    "Diga ",
                    /* @__PURE__ */ jsx("strong", { style: { color: colors$1.btnSuccess }, children: '"Solara"' }),
                    " e deixe a IA cuidar do resto. A secretária não precisa digitar — basta falar. O sistema reconhece o comando e executa automaticamente."
                  ]
                }
              ),
              /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 20 }, children: [
                '"Solara, agende o Dr. Paulo para amanhã às 14h"',
                '"Solara, quantos clientes temos hoje?"',
                '"Solara, envie lembrete para a Maria"'
              ].map((example, i) => /* @__PURE__ */ jsxs(
                motion.div,
                {
                  initial: { opacity: 0, x: -30 },
                  whileInView: { opacity: 1, x: 0 },
                  transition: { delay: 0.7 + i * 0.15, duration: 0.5 },
                  viewport: { once: true },
                  style: { display: "flex", alignItems: "center", gap: 14 },
                  children: [
                    /* @__PURE__ */ jsx(
                      motion.div,
                      {
                        animate: { boxShadow: [`0 0 8px ${colors$1.btnSuccess}`, `0 0 20px ${colors$1.btnSuccess}`, `0 0 8px ${colors$1.btnSuccess}`] },
                        transition: { repeat: Infinity, duration: 2, delay: i * 0.3 },
                        style: { width: 8, height: 8, borderRadius: "50%", background: colors$1.btnSuccess, flexShrink: 0 }
                      }
                    ),
                    /* @__PURE__ */ jsx("span", { style: { fontSize: "1rem", color: "rgba(255,255,255,0.75)", fontWeight: 500, fontStyle: "italic" }, children: example })
                  ]
                },
                i
              )) })
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          motion.div,
          {
            initial: { opacity: 0, scale: 0.8 },
            whileInView: { opacity: 1, scale: 1 },
            transition: { duration: 1, ease: "easeOut" },
            viewport: { once: true },
            style: { display: "flex", justifyContent: "center", alignItems: "center" },
            children: /* @__PURE__ */ jsxs("div", { style: { position: "relative", width: 380, height: 380, display: "flex", alignItems: "center", justifyContent: "center" }, children: [
              [0, 1, 2].map((i) => /* @__PURE__ */ jsx(
                motion.div,
                {
                  animate: { scale: [1, 2.2], opacity: [0.4, 0] },
                  transition: { repeat: Infinity, duration: 3, delay: i * 1, ease: "easeOut" },
                  style: {
                    position: "absolute",
                    width: 160,
                    height: 160,
                    borderRadius: "50%",
                    border: `1.5px solid ${colors$1.btnSuccess}`,
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "none"
                  }
                },
                `wave-${i}`
              )),
              /* @__PURE__ */ jsx(
                motion.div,
                {
                  animate: { rotate: 360 },
                  transition: { repeat: Infinity, duration: 12, ease: "linear" },
                  style: { position: "absolute", width: 320, height: 320, borderRadius: "50%", border: "1px dashed rgba(255,255,255,0.08)" },
                  children: /* @__PURE__ */ jsx("div", { style: { position: "absolute", top: -4, left: "50%", transform: "translateX(-50%)", width: 8, height: 8, borderRadius: "50%", background: colors$1.btnSuccess, boxShadow: `0 0 12px ${colors$1.btnSuccess}` } })
                }
              ),
              /* @__PURE__ */ jsx(
                motion.div,
                {
                  animate: { rotate: -360 },
                  transition: { repeat: Infinity, duration: 18, ease: "linear" },
                  style: { position: "absolute", width: 360, height: 360, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.04)" },
                  children: /* @__PURE__ */ jsx("div", { style: { position: "absolute", bottom: -3, right: "30%", width: 6, height: 6, borderRadius: "50%", background: colors$1.cardBorder, boxShadow: `0 0 8px ${colors$1.cardBorder}` } })
                }
              ),
              /* @__PURE__ */ jsx("div", { style: { position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, alignItems: "flex-end" }, children: [0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 1, 0.3, 0.7, 0.5, 0.9].map((h, i) => /* @__PURE__ */ jsx(
                motion.div,
                {
                  animate: { height: [h * 12, h * 28, h * 12] },
                  transition: { repeat: Infinity, duration: 0.8 + Math.random() * 0.6, delay: i * 0.08, ease: "easeInOut" },
                  style: { width: 3, borderRadius: 3, background: colors$1.btnSuccess }
                },
                `bar-${i}`
              )) }),
              /* @__PURE__ */ jsx("div", { style: { width: 280, height: 280, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", position: "absolute" } }),
              /* @__PURE__ */ jsx(
                motion.div,
                {
                  animate: { scale: [1, 1.03, 1] },
                  transition: { repeat: Infinity, duration: 4, ease: "easeInOut" },
                  style: { width: 220, height: 220, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", position: "absolute" }
                }
              ),
              /* @__PURE__ */ jsxs("div", { style: { width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, position: "relative", zIndex: 2 }, children: [
                /* @__PURE__ */ jsx(
                  motion.div,
                  {
                    animate: { scale: [1, 1.2, 1], filter: [`drop-shadow(0 0 8px ${colors$1.btnSuccess}40)`, `drop-shadow(0 0 20px ${colors$1.btnSuccess}80)`, `drop-shadow(0 0 8px ${colors$1.btnSuccess}40)`] },
                    transition: { repeat: Infinity, duration: 2, ease: "easeInOut" },
                    children: /* @__PURE__ */ jsx(Mic, { size: 44, color: colors$1.btnSuccess })
                  }
                ),
                /* @__PURE__ */ jsx(
                  motion.span,
                  {
                    animate: { opacity: [0.5, 1, 0.5] },
                    transition: { repeat: Infinity, duration: 2 },
                    style: { fontSize: "0.75rem", fontWeight: 700, color: colors$1.btnSuccess, letterSpacing: "0.12em", textTransform: "uppercase" },
                    children: "Ouvindo..."
                  }
                )
              ] })
            ] })
          }
        )
      ] }) })
    ] }),
    /* @__PURE__ */ jsx("section", { id: "planos", style: { padding: isMobile ? "70px 0" : "120px 0", background: colors$1.cardBg, borderTop: `1px solid ${colors$1.cardBorder}30`, borderBottom: `1px solid ${colors$1.cardBorder}30`, marginBottom: isMobile ? "70px" : "120px" }, children: /* @__PURE__ */ jsxs("div", { style: { ...containerStyle, padding: "0 20px" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { textAlign: "center", maxWidth: 760, margin: isMobile ? "0 auto 40px" : "0 auto 56px" }, children: [
        /* @__PURE__ */ jsx("h2", { style: { fontSize: "clamp(2rem, 6vw, 3.5rem)", fontWeight: 400, marginBottom: 20, color: colors$1.primary, letterSpacing: "-0.02em" }, children: "Um plano, tudo incluso" }),
        /* @__PURE__ */ jsx("p", { style: { fontSize: "1.2rem", color: colors$1.primary, opacity: 0.72, lineHeight: "1.6" }, children: "Sem plano escondido, sem cobrança por especialista, sem taxa de implantação. A clínica inteira usa a mesma assinatura." })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", justifyContent: "center", marginBottom: isMobile ? 28 : 40 }, children: /* @__PURE__ */ jsx("div", { role: "group", "aria-label": "Forma de cobrança", style: { display: "inline-flex", background: colors$1.bg, border: `1px solid ${colors$1.cardBorder}`, borderRadius: 3, padding: 4, gap: 4 }, children: [
        { key: "mensal", label: "Mensal" },
        { key: "anual", label: "Anual · 20% off" }
      ].map((opt) => {
        const active = billing === opt.key;
        return /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setBilling(opt.key),
            "aria-pressed": active,
            style: {
              background: active ? colors$1.btnSuccess : "transparent",
              color: active ? "#fff" : colors$1.primary,
              border: "none",
              borderRadius: 3,
              padding: isMobile ? "10px 16px" : "12px 24px",
              fontSize: isMobile ? "0.9rem" : "1rem",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background 0.2s ease, color 0.2s ease"
            },
            children: opt.label
          },
          opt.key
        );
      }) }) }),
      /* @__PURE__ */ jsxs(
        motion.div,
        {
          initial: { opacity: 0, y: 40 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-100px" },
          transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
          style: {
            maxWidth: 980,
            margin: "0 auto",
            background: colors$1.bg,
            border: `1px solid ${colors$1.cardBorder}`,
            borderRadius: 3,
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: isTablet ? "1fr" : "1.15fr 1fr",
            boxShadow: `0 24px 60px ${colors$1.cardBorder}40`
          },
          children: [
            /* @__PURE__ */ jsxs("div", { style: { padding: isMobile ? "32px 24px" : "48px 44px" }, children: [
              /* @__PURE__ */ jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 16px", background: colors$1.cardBg, border: `1px solid ${colors$1.cardBorder}`, borderRadius: 3, color: colors$1.primary, fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 24 }, children: [
                /* @__PURE__ */ jsx(Stethoscope, { size: 16, color: colors$1.btnSuccess }),
                " Solara Estética"
              ] }),
              /* @__PURE__ */ jsx("h3", { style: { fontSize: isMobile ? "1.3rem" : "1.5rem", fontWeight: 400, color: colors$1.primary, marginBottom: 24, letterSpacing: "-0.01em" }, children: "Tudo que a clínica precisa, sem módulo extra" }),
              /* @__PURE__ */ jsx("ul", { style: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }, children: [
                "Recepcionista de IA no WhatsApp, 24 horas por dia",
                "API oficial da Meta, com o número que a clínica já usa",
                "Atendimento e lembrete de sessão ilimitados",
                "Até 500 mensagens de campanha de reativação por mês",
                "Agenda, prontuário e ficha de anamnese",
                "Especialistas, salas e usuários ilimitados",
                "Relatórios de faturamento, no-show e retorno",
                "Suporte por WhatsApp com gente de verdade"
              ].map((item) => /* @__PURE__ */ jsxs("li", { style: { display: "flex", alignItems: "flex-start", gap: 12, fontSize: "1rem", color: colors$1.primary, opacity: 0.85, lineHeight: 1.5 }, children: [
                /* @__PURE__ */ jsx(CheckCircle2, { size: 20, color: colors$1.btnSuccess, style: { flexShrink: 0, marginTop: 2 } }),
                " ",
                item
              ] }, item)) }),
              /* @__PURE__ */ jsx("p", { style: { fontSize: "0.85rem", color: "#6B5F71", lineHeight: 1.6, marginTop: 24, marginBottom: 0 }, children: "Campanha de reativação segue política de uso justo: ao chegar em 500 envios no mês, a Solara avisa e pausa. Você nunca recebe uma fatura maior do que a assinatura." })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { background: colors$1.cardBg, padding: isMobile ? "32px 24px" : "48px 44px", display: "flex", flexDirection: "column", justifyContent: "center", borderLeft: isTablet ? "none" : `1px solid ${colors$1.cardBorder}`, borderTop: isTablet ? `1px solid ${colors$1.cardBorder}` : "none" }, children: [
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 6, color: colors$1.primary }, children: [
                /* @__PURE__ */ jsx("span", { style: { fontSize: "1.3rem", fontWeight: 700 }, children: "R$" }),
                /* @__PURE__ */ jsx("span", { style: { fontSize: "clamp(3rem, 9vw, 4.5rem)", fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1 }, children: plan.price }),
                /* @__PURE__ */ jsx("span", { style: { fontSize: "1.05rem", color: "#6B5F71", fontWeight: 500 }, children: "/mês" })
              ] }),
              /* @__PURE__ */ jsx("p", { style: { fontSize: "0.95rem", color: "#6B5F71", lineHeight: 1.6, margin: "16px 0 28px" }, children: plan.note }),
              /* @__PURE__ */ jsxs(
                "button",
                {
                  onClick: () => onNavigateToRegister(plan.name, plan.price, plan.slug, plan.priceId || ""),
                  style: {
                    width: "100%",
                    background: colors$1.btnSuccess,
                    color: "#fff",
                    border: "none",
                    padding: "18px",
                    borderRadius: 3,
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    boxShadow: `0 8px 24px ${colors$1.btnSuccess}52`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10
                  },
                  children: [
                    "Começar 10 dias grátis ",
                    /* @__PURE__ */ jsx(ArrowRight, { size: 20 })
                  ]
                }
              ),
              /* @__PURE__ */ jsxs("p", { style: { fontSize: "0.9rem", color: "#6B5F71", lineHeight: 1.6, marginTop: 16, marginBottom: 0, textAlign: "center" }, children: [
                "Sem cartão de crédito no teste. Sem taxa de implantação.",
                /* @__PURE__ */ jsx("br", {}),
                "Sem fidelidade — cancele quando quiser."
              ] })
            ] })
          ]
        }
      )
    ] }) }),
    /* @__PURE__ */ jsx("section", { id: "faq", style: { padding: isMobile ? "0 0 70px" : "0 0 120px", background: colors$1.bg }, children: /* @__PURE__ */ jsxs("div", { style: { ...containerStyle, padding: "0 20px", maxWidth: 860 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { textAlign: "center", marginBottom: isMobile ? 40 : 64 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 16px", background: colors$1.cardBg, border: `1px solid ${colors$1.cardBorder}80`, borderRadius: 3, color: colors$1.primary, fontSize: "0.85rem", fontWeight: 700, marginBottom: 24, textTransform: "uppercase" }, children: [
          /* @__PURE__ */ jsx(MessageSquare, { size: 16, color: colors$1.btnSuccess }),
          " Tire suas dúvidas"
        ] }),
        /* @__PURE__ */ jsx("h2", { style: { fontSize: "clamp(2rem, 6vw, 3.5rem)", fontWeight: 400, marginBottom: 16, color: colors$1.primary, letterSpacing: "-0.02em" }, children: "Perguntas Frequentes" }),
        /* @__PURE__ */ jsx("p", { style: { fontSize: "1.15rem", color: colors$1.primary, opacity: 0.72, lineHeight: 1.6 }, children: "O que toda clínica de estética pergunta antes de começar." })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 16 }, children: faqs.map((f, i) => /* @__PURE__ */ jsx(FaqItem, { q: f.q, a: f.a }, i)) })
    ] }) }),
    /* @__PURE__ */ jsx("section", { style: { padding: isMobile ? "0 0 70px" : "0 0 120px" }, children: /* @__PURE__ */ jsx("div", { style: { ...containerStyle, padding: "0 20px" }, children: /* @__PURE__ */ jsxs(
      motion.div,
      {
        initial: { scale: 0.95, opacity: 0 },
        whileInView: { scale: 1, opacity: 1 },
        viewport: { once: true },
        style: { background: colors$1.primary, padding: isMobile ? "48px 24px" : "80px 60px", borderRadius: 3, textAlign: "center", position: "relative", overflow: "hidden" },
        children: [
          /* @__PURE__ */ jsx("h2", { style: { fontSize: "clamp(2rem, 6vw, 3.5rem)", fontWeight: 400, color: colors$1.bg, marginBottom: 24, letterSpacing: "-0.02em" }, children: "Sua agenda cheia começa no WhatsApp." }),
          /* @__PURE__ */ jsx("p", { style: { fontSize: "1.2rem", color: `${colors$1.bg}B0`, maxWidth: 600, margin: "0 auto 48px", lineHeight: "1.6" }, children: "Teste 10 dias grátis, sem cartão. Converse com a sua própria Solara e veja como ela atende as suas pacientes." }),
          /* @__PURE__ */ jsx(
            motion.button,
            {
              onClick: handleWhatsAppClick,
              whileHover: { scale: 1.03 },
              whileTap: { scale: 0.97 },
              style: { backgroundColor: colors$1.btnSuccess, color: "#FFFFFF", border: "none", padding: "20px 48px", borderRadius: 3, fontSize: "1.2rem", fontWeight: "600", cursor: "pointer", boxShadow: `0 12px 32px ${colors$1.btnSuccess}40` },
              children: "Começar meus 10 dias grátis"
            }
          )
        ]
      }
    ) }) }),
    /* @__PURE__ */ jsx("footer", { style: { background: colors$1.primary, color: "rgba(255,255,255,0.72)", fontWeight: "500", padding: "72px 0 56px" }, children: /* @__PURE__ */ jsxs("div", { style: { ...containerStyle, padding: "0 20px", display: "flex", flexDirection: "column", gap: 40, alignItems: "center" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { width: "100%", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto 1fr", gap: isMobile ? 32 : 40, alignItems: "start", textAlign: isMobile ? "center" : "left", justifyItems: isMobile ? "center" : "start" }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10, alignItems: isMobile ? "center" : "flex-start" }, children: [
          /* @__PURE__ */ jsx(LogoMarca, { width: 120 }),
          /* @__PURE__ */ jsx("span", { style: { fontWeight: "600", color: "#fff" }, children: "Solara Estética © 2026" }),
          /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", color: "rgba(255,255,255,0.6)" }, children: "CNPJ 26.998.571/0001-50" }),
          /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.85rem", color: "rgba(255,255,255,0.6)" }, children: [
            "Contato: ",
            /* @__PURE__ */ jsx("a", { href: "mailto:contato@solaraestetica.online", style: { color: colors.goldLight, textDecoration: "none" }, children: "contato@solaraestetica.online" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("nav", { "aria-label": "Navegação do rodapé", style: { display: "flex", flexDirection: "column", gap: 12, textAlign: "center" }, children: navItems.map((item) => /* @__PURE__ */ jsx("a", { href: `#${item.target}`, style: { color: "rgba(255,255,255,0.72)", textDecoration: "none", fontSize: "0.95rem" }, children: item.label }, item.label)) }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12, justifySelf: isMobile ? "center" : "end", textAlign: isMobile ? "center" : "right" }, children: [
          /* @__PURE__ */ jsx("a", { href: "#", style: { color: "rgba(255,255,255,0.72)", textDecoration: "none", fontSize: "0.95rem" }, children: "Termos de Uso" }),
          /* @__PURE__ */ jsx("a", { href: "#", style: { color: "rgba(255,255,255,0.72)", textDecoration: "none", fontSize: "0.95rem" }, children: "Política de Privacidade (LGPD)" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: "30px", width: "100%" }, children: /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.95rem", color: "rgba(255,255,255,0.6)", fontWeight: "400" }, children: [
        "Sistema desenvolvido pela empresa digital ",
        /* @__PURE__ */ jsx("a", { href: "https://axoshub.com", target: "_blank", rel: "noopener noreferrer", style: { color: colors.goldLight, fontWeight: "700", letterSpacing: "0.02em", textDecoration: "none" }, children: "Axos Hub" })
      ] }) })
    ] }) }),
    showScrollTop && /* @__PURE__ */ jsx(
      motion.div,
      {
        initial: { opacity: 0, scale: 0.5 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.5 },
        whileHover: { scale: 1.1, backgroundColor: colors$1.primary, color: "#fff" },
        whileTap: { scale: 0.9 },
        onClick: scrollToTop,
        style: {
          position: "fixed",
          bottom: "40px",
          right: "40px",
          width: "56px",
          height: "56px",
          backgroundColor: colors$1.btnSuccess,
          color: colors$1.primary,
          borderRadius: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 1e3,
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          border: "none",
          transition: "background-color 0.3s ease, color 0.3s ease"
        },
        children: /* @__PURE__ */ jsx(ChevronUp, { size: 28, strokeWidth: 2.5 })
      }
    )
  ] });
};
globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/lib/supabase.ts");
const supabaseUrl = "https://szssizgchukffmmcjxoh.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6c3NpemdjaHVrZmZtbWNqeG9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MzM1MTksImV4cCI6MjEwMTUwOTUxOX0.hvBl1i3ETvjBGEpqYL7ssxZo2Sh3qTydJmPr-2Zb-MA";
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/lib/auth.ts");
async function registerClinic(data) {
  const tempPassword = data.password || generateTempPassword();
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: tempPassword,
    options: {
      data: {
        clinic_name: data.clinicName,
        phone: data.phone,
        role: "owner"
      }
    }
  });
  if (authError) {
    if (authError.message.includes("rate limit") || authError.message.includes("email rate")) {
      throw new Error("Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.");
    }
    if (authError.message.includes("already registered") || authError.message.includes("already been registered")) {
      throw new Error("Este e-mail já está cadastrado. Tente fazer login ou recupere sua senha.");
    }
    if (authError.message.includes("invalid email")) {
      throw new Error("O e-mail informado não é válido.");
    }
    if (authError.message.includes("weak password") || authError.message.includes("at least")) {
      throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    }
    throw new Error(`Erro ao criar conta: ${authError.message}`);
  }
  if (!authData.user) throw new Error("Falha ao criar usuário");
  const authUserId = authData.user.id;
  const { data: result, error: rpcError } = await supabase.rpc("register_clinic", {
    p_auth_id: authUserId,
    p_clinic_name: data.clinicName,
    p_email: data.email,
    p_plan_slug: data.planSlug,
    p_phone: data.phone
  });
  if (rpcError) throw new Error(`Erro ao criar clínica: ${rpcError.message}`);
  return { userId: authUserId, clinicId: result.clinic_id, tempPassword };
}
async function loginUser(data) {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password
  });
  if (authError) {
    if (authError.message.includes("Invalid login") || authError.message.includes("invalid_credentials")) {
      throw new Error("E-mail ou senha incorretos. Verifique e tente novamente.");
    }
    if (authError.message.includes("Email not confirmed")) {
      throw new Error("Confirme seu e-mail antes de fazer login. Verifique sua caixa de entrada.");
    }
    throw new Error(`Erro no login: ${authError.message}`);
  }
  if (!authData.user) throw new Error("Falha no login");
  const { data: userProfile, error: profileError } = await supabase.from("users").select(`
      id,
      email,
      name,
      role,
      clinic_id,
      clinics (
        id,
        name,
        plan_id,
        plans (
          name
        )
      )
    `).eq("auth_id", authData.user.id).single();
  if (profileError || !userProfile) {
    throw new Error("Perfil do usuário não encontrado. Contate o suporte.");
  }
  const clinic = userProfile.clinics;
  return {
    id: userProfile.id,
    email: userProfile.email,
    clinicId: clinic?.id || "",
    clinicName: clinic?.name || "",
    role: userProfile.role,
    planName: clinic?.plans?.name || ""
  };
}
async function getAccessInfo(clinicId) {
  const negado = { allowed: false, trial: false, trialDaysLeft: 0 };
  const { data, error } = await supabase.from("subscriptions").select("status, trial_ends_at, created_at").eq("clinic_id", clinicId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return negado;
  const status = String(data.status || "").toLowerCase();
  if (status === "active") return { allowed: true, trial: false, trialDaysLeft: 0 };
  if (status !== "trialing") return negado;
  if (!data.trial_ends_at) return negado;
  const fim = new Date(data.trial_ends_at).getTime();
  const restanteMs = fim - Date.now();
  if (restanteMs <= 0) return negado;
  return {
    allowed: true,
    trial: true,
    trialDaysLeft: Math.ceil(restanteMs / (1e3 * 60 * 60 * 24))
  };
}
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}
async function logoutUser() {
  await supabase.auth.signOut();
}
async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/LoginPage.tsx");
const LoginPage = ({ onLogin, onBack, onNavigateToRegister, onDevPass }) => {
  const { isMobile, isTablet } = useViewport();
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [passFocus, setPassFocus] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetFocus, setResetFocus] = useState(false);
  const colors2 = authColors;
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!formData.email.trim()) {
      setError("Informe o e-mail");
      return;
    }
    if (!formData.password) {
      setError("Informe a senha");
      return;
    }
    setIsLoading(true);
    try {
      const user = await loginUser({ email: formData.email, password: formData.password });
      await onLogin(user.clinicId);
    } catch (err) {
      setError(err.message || "E-mail ou senha incorretos.");
    } finally {
      setIsLoading(false);
    }
  };
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setError("Informe o e-mail para recuperação");
      return;
    }
    setResetLoading(true);
    setError("");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin
      });
      if (resetError) throw resetError;
      setResetSent(true);
    } catch (err) {
      setError(err.message || "Erro ao enviar e-mail de recuperação.");
    } finally {
      setResetLoading(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", minHeight: "100vh", backgroundColor: colors2.bgRight, fontFamily: "'Outfit', sans-serif", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { width: isTablet ? "100%" : "35%", minWidth: isTablet ? 0 : "400px", backgroundColor: colors2.bgLeft, padding: isMobile ? "24px 20px" : "40px 60px", display: "flex", flexDirection: "column", borderRight: isTablet ? "none" : "1px solid rgba(255,255,255,0.02)", zIndex: 10 }, children: [
      /* @__PURE__ */ jsxs("button", { onClick: showResetForm ? () => {
        setShowResetForm(false);
        setResetSent(false);
        setError("");
      } : onBack, style: { alignSelf: "flex-start", background: "none", border: "none", color: colors2.textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", marginBottom: "auto" }, children: [
        /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
        " ",
        showResetForm ? "Voltar ao Login" : "Voltar"
      ] }),
      /* @__PURE__ */ jsxs(motion.div, { initial: { opacity: 0, x: -30 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.6 }, style: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: "340px", margin: "0 auto" }, children: [
        /* @__PURE__ */ jsx("div", { style: { marginBottom: 24, marginTop: 16, display: "flex", justifyContent: "center" }, children: /* @__PURE__ */ jsx(LogoMarca, { width: isMobile ? 160 : 200 }) }),
        showResetForm ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx("p", { style: { textAlign: "center", fontSize: "0.85rem", color: colors2.textMuted, marginBottom: 32, lineHeight: 1.6 }, children: resetSent ? "Um link de recuperação foi enviado para o seu e-mail." : "Informe seu e-mail cadastrado e enviaremos um link para redefinir sua senha." }),
          resetSent ? /* @__PURE__ */ jsxs(motion.div, { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 }, style: { textAlign: "center", width: "100%" }, children: [
            /* @__PURE__ */ jsx("div", { style: { width: 64, height: 64, background: `${colors2.success}20`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }, children: /* @__PURE__ */ jsx(CheckCircle2, { size: 32, color: colors2.success }) }),
            /* @__PURE__ */ jsx("p", { style: { color: colors2.success, fontSize: "1rem", fontWeight: 600, marginBottom: 8 }, children: "E-mail enviado!" }),
            /* @__PURE__ */ jsx("p", { style: { color: colors2.textMuted, fontSize: "0.85rem", marginBottom: 32 }, children: "Verifique sua caixa de entrada e spam." }),
            /* @__PURE__ */ jsx("button", { onClick: () => {
              setShowResetForm(false);
              setResetSent(false);
            }, style: { width: "100%", background: colors2.cta, border: "none", padding: "16px", borderRadius: 3, color: "#ffffff", fontWeight: 700, fontSize: "1rem", cursor: "pointer" }, children: "Voltar ao Login" })
          ] }) : /* @__PURE__ */ jsxs("form", { style: { width: "100%" }, onSubmit: handleResetPassword, children: [
            error && /* @__PURE__ */ jsxs(motion.div, { initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 0 }, style: { width: "100%", background: `${colors2.danger}20`, border: `1px solid ${colors2.danger}50`, borderRadius: 3, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem", color: colors2.danger }, children: [
              /* @__PURE__ */ jsx(AlertCircle, { size: 18 }),
              " ",
              error
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { marginBottom: 32 }, children: [
              /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "0.85rem", color: colors2.cyan, marginBottom: 8, fontWeight: 600 }, children: "E-mail cadastrado" }),
              /* @__PURE__ */ jsxs("div", { style: { position: "relative" }, children: [
                /* @__PURE__ */ jsx(Mail, { size: 18, color: resetFocus ? colors2.cyan : colors2.textMuted, style: { position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", transition: "color 0.3s" } }),
                /* @__PURE__ */ jsx("input", { type: "email", placeholder: "seu@email.com", value: resetEmail, onChange: (e) => setResetEmail(e.target.value), onFocus: () => setResetFocus(true), onBlur: () => setResetFocus(false), style: { width: "100%", backgroundColor: colors2.inputBg, border: `1px solid ${resetFocus ? colors2.cyan : colors2.cyanDark}`, borderRadius: 3, padding: "14px 14px 14px 44px", color: "#ffffff", fontSize: "0.95rem", outline: "none", transition: "all 0.3s", boxShadow: resetFocus ? `0 0 0 3px ${colors2.cyan}20` : "none" } })
              ] })
            ] }),
            /* @__PURE__ */ jsx(motion.button, { disabled: resetLoading, whileHover: !resetLoading ? { scale: 1.02 } : {}, type: "submit", style: { width: "100%", background: resetLoading ? colors2.inputBg : colors2.cta, border: resetLoading ? `1px solid ${colors2.cyan}` : "none", padding: "16px", borderRadius: 3, color: resetLoading ? colors2.cyan : "#ffffff", fontWeight: 700, fontSize: "1.05rem", cursor: resetLoading ? "wait" : "pointer" }, children: resetLoading ? "Enviando..." : "Enviar Link de Recuperação" })
          ] })
        ] }) : (
          /* ===== FORMULÁRIO DE LOGIN ===== */
          /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("p", { style: { textAlign: "center", fontSize: "0.85rem", color: colors2.textMuted, marginBottom: 40, lineHeight: 1.6 }, children: "Sistema seguro com criptografia de ponta a ponta. Seus dados protegidos com a mais alta tecnologia." }),
            error && /* @__PURE__ */ jsxs(motion.div, { initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 0 }, style: { width: "100%", background: `${colors2.danger}20`, border: `1px solid ${colors2.danger}50`, borderRadius: 3, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem", color: colors2.danger }, children: [
              /* @__PURE__ */ jsx(AlertCircle, { size: 18 }),
              " ",
              error
            ] }),
            /* @__PURE__ */ jsxs("form", { style: { width: "100%" }, onSubmit: handleSubmit, children: [
              /* @__PURE__ */ jsxs("div", { style: { marginBottom: 24 }, children: [
                /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "0.85rem", color: colors2.cyan, marginBottom: 8, fontWeight: 600 }, children: "E-mail" }),
                /* @__PURE__ */ jsxs("div", { style: { position: "relative" }, children: [
                  /* @__PURE__ */ jsx(Mail, { size: 18, color: emailFocus ? colors2.cyan : colors2.textMuted, style: { position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", transition: "color 0.3s" } }),
                  /* @__PURE__ */ jsx("input", { type: "email", placeholder: "seu@email.com", value: formData.email, onChange: (e) => setFormData((p) => ({ ...p, email: e.target.value })), onFocus: () => setEmailFocus(true), onBlur: () => setEmailFocus(false), style: { width: "100%", backgroundColor: colors2.inputBg, border: `1px solid ${emailFocus ? colors2.cyan : colors2.cyanDark}`, borderRadius: 3, padding: "14px 14px 14px 44px", color: "#ffffff", fontSize: "0.95rem", outline: "none", transition: "all 0.3s", boxShadow: emailFocus ? `0 0 0 3px ${colors2.cyan}20` : "none" } })
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { marginBottom: 16 }, children: [
                /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "0.85rem", color: colors2.cyan, marginBottom: 8, fontWeight: 600 }, children: "Senha" }),
                /* @__PURE__ */ jsxs("div", { style: { position: "relative" }, children: [
                  /* @__PURE__ */ jsx(Lock, { size: 18, color: passFocus ? colors2.cyan : colors2.textMuted, style: { position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", transition: "color 0.3s" } }),
                  /* @__PURE__ */ jsx("input", { type: showPassword ? "text" : "password", placeholder: "••••••••", value: formData.password, onChange: (e) => setFormData((p) => ({ ...p, password: e.target.value })), onFocus: () => setPassFocus(true), onBlur: () => setPassFocus(false), style: { width: "100%", backgroundColor: colors2.inputBg, border: `1px solid ${passFocus ? colors2.cyan : colors2.cyanDark}`, borderRadius: 3, padding: "14px 44px", color: "#ffffff", fontSize: "1rem", outline: "none", letterSpacing: showPassword ? "normal" : "3px", transition: "all 0.3s", boxShadow: passFocus ? `0 0 0 3px ${colors2.cyan}20` : "none" } }),
                  /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setShowPassword(!showPassword), style: { position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer" }, children: showPassword ? /* @__PURE__ */ jsx(EyeOff, { size: 18, color: colors2.textMuted }) : /* @__PURE__ */ jsx(Eye, { size: 18, color: colors2.textMuted }) })
                ] })
              ] }),
              /* @__PURE__ */ jsx("div", { style: { textAlign: "right", marginBottom: 32 }, children: /* @__PURE__ */ jsx("button", { type: "button", onClick: () => {
                setShowResetForm(true);
                setError("");
              }, style: { background: "none", border: "none", color: colors2.cyan, fontSize: "0.85rem", cursor: "pointer", fontWeight: 500, padding: 0 }, children: "Esqueceu a senha?" }) }),
              /* @__PURE__ */ jsx(motion.button, { disabled: isLoading, whileHover: !isLoading ? { scale: 1.02 } : {}, whileTap: !isLoading ? { scale: 0.98 } : {}, type: "submit", style: { width: "100%", background: isLoading ? colors2.inputBg : colors2.cta, border: isLoading ? `1px solid ${colors2.cyan}` : "none", padding: "16px", borderRadius: 3, color: isLoading ? colors2.cyan : "#ffffff", fontWeight: 700, fontSize: "1.05rem", cursor: isLoading ? "wait" : "pointer", marginBottom: 32, display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }, children: isLoading ? /* @__PURE__ */ jsx(motion.div, { animate: { rotate: 360 }, transition: { repeat: Infinity, duration: 1, ease: "linear" }, children: /* @__PURE__ */ jsx(LockKeyhole, { size: 20 }) }) : "Entrar" }),
              /* @__PURE__ */ jsxs("div", { style: { textAlign: "center", fontSize: "0.9rem", color: colors2.textMuted }, children: [
                "Não tem conta? ",
                /* @__PURE__ */ jsx("button", { type: "button", onClick: onNavigateToRegister, style: { background: "none", border: "none", color: colors2.cyan, fontWeight: 600, cursor: "pointer", padding: 0 }, children: "Cadastrar" })
              ] }),
              /* @__PURE__ */ jsx("div", { style: { marginTop: 20, textAlign: "center" }, children: /* @__PURE__ */ jsx("button", { type: "button", onClick: onDevPass, style: { background: "none", border: "none", color: "rgba(255,255,255,0.25)", fontSize: "0.75rem", cursor: "pointer" }, children: "Passe Livre" }) })
            ] })
          ] })
        )
      ] }),
      /* @__PURE__ */ jsx("div", { style: { marginTop: "auto" } })
    ] }),
    !isTablet && /* @__PURE__ */ jsx("div", { style: { width: "65%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", padding: "0 40px" }, children: /* @__PURE__ */ jsxs(motion.div, { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { duration: 0.8, ease: "easeOut" }, style: { zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("div", { style: { width: 180, height: 180, background: "rgba(224, 201, 166, 0.06)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 40, border: `1px solid ${colors2.cyan}30` }, children: /* @__PURE__ */ jsx(LockKeyhole, { size: 90, color: colors2.cyan, strokeWidth: 1.5 }) }),
      /* @__PURE__ */ jsx("h2", { style: { fontSize: "clamp(2rem, 4vw, 3rem)", color: colors2.cyan, marginBottom: 20, fontWeight: 800, letterSpacing: "-0.02em", textAlign: "center" }, children: showResetForm ? "Recuperar Acesso" : "Segurança Máxima" }),
      /* @__PURE__ */ jsx("p", { style: { textAlign: "center", color: "#a0a0a0", maxWidth: 450, fontSize: "1.2rem", lineHeight: 1.6, fontWeight: 400 }, children: showResetForm ? "Enviaremos um link seguro para o e-mail cadastrado na sua clínica." : "Seus dados protegidos com criptografia de última geração e autenticação segura." })
    ] }) })
  ] });
};
globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/RegisterPage.tsx");
const RegisterPage = ({ onRegisterSuccess, onBack, onNavigateToLogin, selectedPlanSlug = "solara-anual" }) => {
  const { isMobile, isTablet } = useViewport();
  const [showPassword, setShowPassword] = useState(false);
  const [focusState, setFocusState] = useState({ name: false, email: false, pass: false, phone: false });
  const [formData, setFormData] = useState({ clinicName: "", email: "", password: "", phone: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const colors2 = authColors;
  const setFocus = (field, value) => {
    setFocusState((prev) => ({ ...prev, [field]: value }));
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!formData.clinicName.trim()) {
      setError("Informe o nome da clínica");
      return;
    }
    if (!formData.email.trim()) {
      setError("Informe o e-mail");
      return;
    }
    if (formData.password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres");
      return;
    }
    setIsLoading(true);
    try {
      const result = await registerClinic({
        clinicName: formData.clinicName,
        email: formData.email,
        password: formData.password,
        planSlug: selectedPlanSlug,
        phone: formData.phone
      });
      onRegisterSuccess(result.clinicId, formData.email);
    } catch (err) {
      setError(err.message || "Erro ao criar conta. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", minHeight: "100vh", backgroundColor: colors2.bgRight, fontFamily: "'Outfit', sans-serif", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { width: isTablet ? "100%" : "35%", minWidth: isTablet ? 0 : "400px", backgroundColor: colors2.bgLeft, padding: isMobile ? "24px 20px" : "40px 60px", display: "flex", flexDirection: "column", borderRight: isTablet ? "none" : "1px solid rgba(255,255,255,0.02)", zIndex: 10 }, children: [
      /* @__PURE__ */ jsxs("button", { onClick: onBack, style: { alignSelf: "flex-start", background: "none", border: "none", color: colors2.textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", marginBottom: "auto" }, children: [
        /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
        " Voltar"
      ] }),
      /* @__PURE__ */ jsxs(motion.div, { initial: { opacity: 0, x: -30 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.6 }, style: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: "340px", margin: "0 auto" }, children: [
        /* @__PURE__ */ jsx("div", { style: { marginBottom: 24, marginTop: 16, display: "flex", justifyContent: "center" }, children: /* @__PURE__ */ jsx(LogoMarca, { width: isMobile ? 160 : 200 }) }),
        /* @__PURE__ */ jsx("p", { style: { textAlign: "center", fontSize: "0.85rem", color: colors2.textMuted, marginBottom: 32, lineHeight: 1.6 }, children: "Crie a conta da sua clínica agora e transforme o atendimento aos seus clientes." }),
        error && /* @__PURE__ */ jsxs(motion.div, { initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 0 }, style: { width: "100%", background: `${colors2.danger}20`, border: `1px solid ${colors2.danger}50`, borderRadius: 3, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem", color: colors2.danger }, children: [
          /* @__PURE__ */ jsx(AlertCircle, { size: 18 }),
          " ",
          error
        ] }),
        /* @__PURE__ */ jsxs("form", { style: { width: "100%" }, onSubmit: handleSubmit, children: [
          /* @__PURE__ */ jsxs("div", { style: { marginBottom: 20 }, children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "0.85rem", color: colors2.cyan, marginBottom: 8, fontWeight: 600 }, children: "Nome da Clínica" }),
            /* @__PURE__ */ jsxs("div", { style: { position: "relative" }, children: [
              /* @__PURE__ */ jsx(Building2, { size: 18, color: focusState.name ? colors2.cyan : colors2.textMuted, style: { position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", transition: "color 0.3s" } }),
              /* @__PURE__ */ jsx("input", { type: "text", placeholder: "Sua Clínica", value: formData.clinicName, onChange: (e) => setFormData((p) => ({ ...p, clinicName: e.target.value })), onFocus: () => setFocus("name", true), onBlur: () => setFocus("name", false), style: { width: "100%", backgroundColor: colors2.inputBg, border: `1px solid ${focusState.name ? colors2.cyan : colors2.cyanDark}`, borderRadius: 3, padding: "14px 14px 14px 44px", color: "#ffffff", fontSize: "0.95rem", outline: "none", transition: "all 0.3s", boxShadow: focusState.name ? `0 0 0 3px ${colors2.cyan}20` : "none" } })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { marginBottom: 20 }, children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "0.85rem", color: colors2.cyan, marginBottom: 8, fontWeight: 600 }, children: "WhatsApp / Telefone" }),
            /* @__PURE__ */ jsxs("div", { style: { position: "relative" }, children: [
              /* @__PURE__ */ jsx(Phone, { size: 18, color: focusState.phone ? colors2.cyan : colors2.textMuted, style: { position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", transition: "color 0.3s" } }),
              /* @__PURE__ */ jsx("input", { type: "text", placeholder: "(00) 00000-0000", value: formData.phone, onChange: (e) => setFormData((p) => ({ ...p, phone: e.target.value })), onFocus: () => setFocus("phone", true), onBlur: () => setFocus("phone", false), style: { width: "100%", backgroundColor: colors2.inputBg, border: `1px solid ${focusState.phone ? colors2.cyan : colors2.cyanDark}`, borderRadius: 3, padding: "14px 14px 14px 44px", color: "#ffffff", fontSize: "0.95rem", outline: "none", transition: "all 0.3s", boxShadow: focusState.phone ? `0 0 0 3px ${colors2.cyan}20` : "none" } })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { marginBottom: 20 }, children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "0.85rem", color: colors2.cyan, marginBottom: 8, fontWeight: 600 }, children: "E-mail" }),
            /* @__PURE__ */ jsxs("div", { style: { position: "relative" }, children: [
              /* @__PURE__ */ jsx(Mail, { size: 18, color: focusState.email ? colors2.cyan : colors2.textMuted, style: { position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", transition: "color 0.3s" } }),
              /* @__PURE__ */ jsx("input", { type: "email", placeholder: "contato@clinica.com", value: formData.email, onChange: (e) => setFormData((p) => ({ ...p, email: e.target.value })), onFocus: () => setFocus("email", true), onBlur: () => setFocus("email", false), style: { width: "100%", backgroundColor: colors2.inputBg, border: `1px solid ${focusState.email ? colors2.cyan : colors2.cyanDark}`, borderRadius: 3, padding: "14px 14px 14px 44px", color: "#ffffff", fontSize: "0.95rem", outline: "none", transition: "all 0.3s", boxShadow: focusState.email ? `0 0 0 3px ${colors2.cyan}20` : "none" } })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { marginBottom: 32 }, children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "0.85rem", color: colors2.cyan, marginBottom: 8, fontWeight: 600 }, children: "Senha" }),
            /* @__PURE__ */ jsxs("div", { style: { position: "relative" }, children: [
              /* @__PURE__ */ jsx(Lock, { size: 18, color: focusState.pass ? colors2.cyan : colors2.textMuted, style: { position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", transition: "color 0.3s" } }),
              /* @__PURE__ */ jsx("input", { type: showPassword ? "text" : "password", placeholder: "Mínimo 6 caracteres", value: formData.password, onChange: (e) => setFormData((p) => ({ ...p, password: e.target.value })), onFocus: () => setFocus("pass", true), onBlur: () => setFocus("pass", false), style: { width: "100%", backgroundColor: colors2.inputBg, border: `1px solid ${focusState.pass ? colors2.cyan : colors2.cyanDark}`, borderRadius: 3, padding: "14px 44px", color: "#ffffff", fontSize: "1rem", outline: "none", letterSpacing: showPassword ? "normal" : "3px", transition: "all 0.3s", boxShadow: focusState.pass ? `0 0 0 3px ${colors2.cyan}20` : "none" } }),
              /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setShowPassword(!showPassword), style: { position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer" }, children: showPassword ? /* @__PURE__ */ jsx(EyeOff, { size: 18, color: colors2.textMuted }) : /* @__PURE__ */ jsx(Eye, { size: 18, color: colors2.textMuted }) })
            ] })
          ] }),
          /* @__PURE__ */ jsx(motion.button, { disabled: isLoading, whileHover: !isLoading ? { scale: 1.02 } : {}, whileTap: !isLoading ? { scale: 0.98 } : {}, type: "submit", style: { width: "100%", background: isLoading ? colors2.inputBg : colors2.cta, border: isLoading ? `1px solid ${colors2.cyan}` : "none", padding: "16px", borderRadius: 3, color: isLoading ? colors2.cyan : "#ffffff", fontWeight: 700, fontSize: "1.05rem", cursor: isLoading ? "wait" : "pointer", marginBottom: 32, display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }, children: isLoading ? /* @__PURE__ */ jsx(motion.div, { animate: { rotate: 360 }, transition: { repeat: Infinity, duration: 1, ease: "linear" }, children: /* @__PURE__ */ jsx(Building2, { size: 20 }) }) : "Criar Conta e Prosseguir" }),
          /* @__PURE__ */ jsxs("div", { style: { textAlign: "center", fontSize: "0.9rem", color: colors2.textMuted }, children: [
            "Já possui conta? ",
            /* @__PURE__ */ jsx("button", { type: "button", onClick: onNavigateToLogin, style: { background: "none", border: "none", color: colors2.cyan, fontWeight: 600, cursor: "pointer", padding: 0 }, children: "Fazer Login" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { marginTop: "auto" } })
    ] }),
    !isTablet && /* @__PURE__ */ jsx("div", { style: { width: "65%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", padding: "0 40px" }, children: /* @__PURE__ */ jsxs(motion.div, { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { duration: 0.8, ease: "easeOut" }, style: { zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx("div", { style: { width: 180, height: 180, background: "rgba(224, 201, 166, 0.06)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 40, border: `1px solid ${colors2.cyan}30` }, children: /* @__PURE__ */ jsx(UserPlus, { size: 90, color: colors2.cyan, strokeWidth: 1.5 }) }),
      /* @__PURE__ */ jsx("h2", { style: { fontSize: "clamp(2rem, 4vw, 3rem)", color: colors2.cyan, marginBottom: 20, fontWeight: 800, letterSpacing: "-0.02em", textAlign: "center" }, children: "Comece pelos 10 dias grátis" }),
      /* @__PURE__ */ jsx("p", { style: { textAlign: "center", color: "#a0a0a0", maxWidth: 450, fontSize: "1.2rem", lineHeight: 1.6, fontWeight: 400 }, children: "Crie a conta da clínica, converse com a sua própria Solara e só depois decida se assina." })
    ] }) })
  ] });
};
globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/App.tsx");
const Dashboard = lazy(() => (globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/Dashboard.tsx"), import("./assets/Dashboard-qQTYwJkF.js")));
const CheckoutPage = lazy(() => (globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/CheckoutPage.tsx"), import("./assets/CheckoutPage-CJPHwCMM.js")));
function LazyFallback({ label }) {
  return /* @__PURE__ */ jsx("div", { style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    backgroundColor: colors.inkDeep,
    fontFamily: "'Outfit', sans-serif"
  }, children: /* @__PURE__ */ jsxs("div", { style: { textAlign: "center" }, children: [
    /* @__PURE__ */ jsx("div", { style: {
      width: 48,
      height: 48,
      border: "3px solid rgba(224, 201, 166, 0.2)",
      borderTop: `3px solid ${colors.goldLight}`,
      borderRadius: "50%",
      animation: "spin 1s linear infinite",
      margin: "0 auto 20px"
    } }),
    /* @__PURE__ */ jsx("p", { style: { color: colors.goldLight, fontWeight: 600, fontSize: "1rem" }, children: label }),
    /* @__PURE__ */ jsx("style", { children: `@keyframes spin { to { transform: rotate(360deg); } }` })
  ] }) });
}
function App() {
  const [view, setView] = useState("landing");
  const [selectedPlan, setSelectedPlan] = useState({
    name: "Solara Estética — Anual",
    price: "397",
    slug: "solara-anual",
    priceId: ""
  });
  const [clinicId, setClinicId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [billingError, setBillingError] = useState("");
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const checkoutSuccess = queryParams.get("checkout") === "success";
    const restoreSession = async () => {
      try {
        const session = await getCurrentSession();
        if (session?.user) {
          const { data: userProfile } = await supabase.from("users").select("clinic_id").eq("auth_id", session.user.id).single();
          if (userProfile?.clinic_id) {
            setClinicId(userProfile.clinic_id);
            setUserEmail(session.user.email || "");
            const acesso = await getAccessInfo(userProfile.clinic_id);
            if (!acesso.allowed) {
              setBillingError("Seu teste de 10 dias terminou. Assine para voltar a usar o painel.");
              setView("landing");
              return;
            }
            if (checkoutSuccess) {
              window.history.replaceState({}, document.title, "/");
            }
            setView("dashboard");
            return;
          }
        }
      } catch (err) {
        console.warn("Nenhuma sessão ativa:", err);
      }
      if (checkoutSuccess) {
        window.history.replaceState({}, document.title, "/");
      }
      setView("landing");
    };
    restoreSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setClinicId("");
        setUserEmail("");
        setView("landing");
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  const handleDevPass = () => {
    return;
  };
  const handleNavigateToRegister = (name, price, slug, priceId) => {
    setSelectedPlan({ name, price, slug, priceId });
    setView("register");
  };
  const handleRegisterSuccess = (newClinicId, email) => {
    setClinicId(newClinicId);
    setUserEmail(email);
    setBillingError("");
    setView("dashboard");
  };
  const handleLoginSuccess = async (loggedClinicId) => {
    const acesso = await getAccessInfo(loggedClinicId);
    if (!acesso.allowed) {
      setBillingError("Seu teste de 10 dias terminou. Assine para voltar a usar o painel.");
      setView("landing");
      return;
    }
    setClinicId(loggedClinicId);
    setBillingError("");
    setView("dashboard");
  };
  const handlePaymentSuccess = () => {
    setView("dashboard");
  };
  const handleLogout = async () => {
    await logoutUser();
    setClinicId("");
    setUserEmail("");
    setView("landing");
  };
  return /* @__PURE__ */ jsxs("div", { className: "App", children: [
    view === "landing" && /* @__PURE__ */ jsx(
      LandingPage,
      {
        onNavigateToLogin: () => setView("login"),
        onNavigateToRegister: handleNavigateToRegister
      }
    ),
    billingError && view === "landing" && /* @__PURE__ */ jsx("div", { style: { position: "fixed", bottom: 20, left: 20, right: 20, background: "#fff3cd", color: "#856404", border: "1px solid #ffeeba", padding: "12px 16px", borderRadius: 3, zIndex: 1e3 }, children: billingError }),
    view === "login" && /* @__PURE__ */ jsx(
      LoginPage,
      {
        onBack: () => setView("landing"),
        onLogin: handleLoginSuccess,
        onNavigateToRegister: () => setView("register"),
        onDevPass: handleDevPass
      }
    ),
    view === "register" && /* @__PURE__ */ jsx(
      RegisterPage,
      {
        onBack: () => setView("landing"),
        onNavigateToLogin: () => setView("login"),
        onRegisterSuccess: handleRegisterSuccess,
        selectedPlanSlug: selectedPlan.slug
      }
    ),
    view === "checkout" && /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx(LazyFallback, { label: "Abrindo checkout..." }), children: /* @__PURE__ */ jsx(
      CheckoutPage,
      {
        planName: selectedPlan.name,
        planPrice: selectedPlan.price,
        priceId: selectedPlan.priceId,
        clinicId,
        userEmail,
        onBack: () => setView("register"),
        onPaymentSuccess: handlePaymentSuccess,
        onDevPass: handlePaymentSuccess
      }
    ) }),
    view === "dashboard" && /* @__PURE__ */ jsx(Suspense, { fallback: /* @__PURE__ */ jsx(LazyFallback, { label: "Carregando seu painel..." }), children: /* @__PURE__ */ jsx(Dashboard, { onLogout: handleLogout, clinicId }) })
  ] });
}
globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/main.tsx");
const createRoot = ViteReactSSG(
  /* @__PURE__ */ jsx(StrictMode, { children: /* @__PURE__ */ jsx(App, {}) })
);
export {
  LogoMarca as L,
  authColors as a,
  createRoot,
  dashboardColors as d,
  getAuthHeaders as g,
  supabase as s,
  useViewport as u
};
