import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, AlertCircle, LockKeyhole, Lock, MailCheck, CreditCard } from "lucide-react";
import { u as useViewport, a as authColors, L as LogoMarca } from "../main.mjs";
import "vite-react-ssg/single-page";
import "@supabase/supabase-js";
globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/CheckoutPage.tsx");
const STRIPE_PAYMENT_LINKS = {
  "497": "",
  "397": ""
};
const CheckoutPage = ({ planName, planPrice, priceId: _priceId, clinicId, userEmail, onPaymentSuccess: _onPaymentSuccess, onBack, onDevPass: _onDevPass }) => {
  const { isMobile, isTablet } = useViewport();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess] = useState(false);
  const [error, setError] = useState("");
  const colors = authColors;
  const handlePayment = async (e) => {
    e.preventDefault();
    setError("");
    setIsProcessing(true);
    try {
      const baseLink = STRIPE_PAYMENT_LINKS[planPrice];
      if (!baseLink) {
        throw new Error("Link de pagamento Stripe não configurado para este plano");
      }
      if (!clinicId) {
        throw new Error("Clínica não identificada. Refaça o cadastro.");
      }
      const params = new URLSearchParams({
        client_reference_id: clinicId,
        prefilled_email: userEmail
      });
      window.location.href = `${baseLink}?${params.toString()}`;
    } catch (err) {
      setError(err.message || "Erro ao processar pagamento.");
      setIsProcessing(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", minHeight: "100vh", backgroundColor: colors.bgRight, fontFamily: "'Outfit', sans-serif", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { width: isTablet ? "100%" : "35%", minWidth: isTablet ? 0 : "450px", backgroundColor: colors.bgLeft, padding: isMobile ? "24px 20px" : "40px 60px", display: "flex", flexDirection: "column", borderRight: isTablet ? "none" : "1px solid rgba(255,255,255,0.02)", zIndex: 10 }, children: [
      !isSuccess && /* @__PURE__ */ jsxs("button", { onClick: onBack, style: { alignSelf: "flex-start", background: "none", border: "none", color: colors.textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", marginBottom: "auto" }, children: [
        /* @__PURE__ */ jsx(ArrowLeft, { size: 16 }),
        " Voltar"
      ] }),
      /* @__PURE__ */ jsx(motion.div, { initial: { opacity: 0, x: -30 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.6 }, style: { display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: "360px", margin: "auto" }, children: isSuccess ? /* @__PURE__ */ jsxs(motion.div, { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 }, style: { textAlign: "center" }, children: [
        /* @__PURE__ */ jsx("div", { style: { width: 80, height: 80, background: `${colors.success}20`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", boxShadow: `0 0 30px ${colors.success}40` }, children: /* @__PURE__ */ jsx(CheckCircle2, { size: 40, color: colors.success, strokeWidth: 2.5 }) }),
        /* @__PURE__ */ jsx("h2", { style: { fontSize: "2rem", color: colors.success, marginBottom: 16 }, children: "Pagamento Aprovado!" }),
        /* @__PURE__ */ jsxs("p", { style: { color: "#fff", fontSize: "1.1rem", marginBottom: 8 }, children: [
          "Plano ",
          /* @__PURE__ */ jsx("strong", { children: planName }),
          " ativado com sucesso."
        ] }),
        /* @__PURE__ */ jsxs("p", { style: { color: colors.textMuted, fontSize: "0.9rem", lineHeight: 1.6, marginBottom: 24 }, children: [
          "Um e-mail de confirmação foi enviado para ",
          /* @__PURE__ */ jsx("strong", { style: { color: colors.cyan }, children: userEmail })
        ] }),
        /* @__PURE__ */ jsx("p", { style: { color: colors.textMuted, fontSize: "0.85rem" }, children: "Redirecionando para o dashboard..." })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { style: { marginBottom: 24, display: "flex", justifyContent: "center" }, children: /* @__PURE__ */ jsx(LogoMarca, { width: isMobile ? 160 : 200 }) }),
        /* @__PURE__ */ jsxs("div", { style: { width: "100%", background: colors.inputBg, border: `1px solid ${colors.cyanDark}`, borderRadius: 3, padding: "20px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", color: colors.textMuted, marginBottom: 4 }, children: "Plano Selecionado" }),
            /* @__PURE__ */ jsx("div", { style: { fontSize: "1.1rem", color: "#fff", fontWeight: 700 }, children: planName })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { textAlign: "right" }, children: [
            /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", color: colors.textMuted, marginBottom: 4 }, children: "Valor mensal" }),
            /* @__PURE__ */ jsxs("div", { style: { fontSize: "1.4rem", color: colors.cyan, fontWeight: 800 }, children: [
              "R$ ",
              planPrice
            ] })
          ] })
        ] }),
        error && /* @__PURE__ */ jsxs(motion.div, { initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 0 }, style: { width: "100%", background: `${colors.danger}20`, border: `1px solid ${colors.danger}50`, borderRadius: 3, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem", color: colors.danger }, children: [
          /* @__PURE__ */ jsx(AlertCircle, { size: 18 }),
          " ",
          error
        ] }),
        /* @__PURE__ */ jsxs("form", { style: { width: "100%" }, onSubmit: handlePayment, children: [
          /* @__PURE__ */ jsx("div", { style: { marginBottom: 24, background: colors.inputBg, border: `1px solid ${colors.cyanDark}`, borderRadius: 3, padding: "14px 16px", color: "#c9c9c9", fontSize: "0.9rem", lineHeight: 1.5 }, children: "Você será redirecionado para o ambiente seguro do Stripe para inserir os dados de pagamento." }),
          /* @__PURE__ */ jsx(motion.button, { disabled: isProcessing, whileHover: !isProcessing ? { scale: 1.02 } : {}, whileTap: !isProcessing ? { scale: 0.98 } : {}, type: "submit", style: { width: "100%", background: isProcessing ? colors.inputBg : colors.cta, border: isProcessing ? `1px solid ${colors.cyan}` : "none", padding: "16px", borderRadius: 3, color: isProcessing ? colors.cyan : "#ffffff", fontWeight: 700, fontSize: "1.05rem", cursor: isProcessing ? "wait" : "pointer", marginBottom: 24, display: "flex", justifyContent: "center", alignItems: "center", gap: 12 }, children: isProcessing ? /* @__PURE__ */ jsx(motion.div, { animate: { rotate: 360 }, transition: { repeat: Infinity, duration: 1, ease: "linear" }, children: /* @__PURE__ */ jsx(LockKeyhole, { size: 20 }) }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx(LockKeyhole, { size: 20 }),
            " Ir para o Stripe Checkout"
          ] }) }),
          /* @__PURE__ */ jsxs("div", { style: { textAlign: "center", fontSize: "0.8rem", color: colors.textMuted, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }, children: [
            /* @__PURE__ */ jsx(Lock, { size: 14 }),
            " Transação 100% criptografada"
          ] })
        ] })
      ] }) }),
      /* @__PURE__ */ jsx("div", { style: { marginTop: "auto" } })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { display: isTablet ? "none" : "flex", width: "65%", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", padding: "0 40px" }, children: /* @__PURE__ */ jsx(motion.div, { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { duration: 0.8, ease: "easeOut" }, style: { zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }, children: isSuccess ? /* @__PURE__ */ jsxs(motion.div, { initial: { y: 50, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { delay: 0.5, duration: 0.8 }, style: { background: "rgba(255,255,255,0.03)", border: `1px solid ${colors.success}40`, borderRadius: 3, padding: 32, width: "100%", maxWidth: 500 }, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 20, marginBottom: 20 }, children: [
        /* @__PURE__ */ jsx("div", { style: { background: colors.success, padding: 12, borderRadius: "50%" }, children: /* @__PURE__ */ jsx(MailCheck, { size: 24, color: colors.bgRight }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("div", { style: { color: "#fff", fontWeight: 600, fontSize: "1.1rem" }, children: "Recibo & Acesso Liberado" }),
          /* @__PURE__ */ jsx("div", { style: { color: colors.success, fontSize: "0.9rem" }, children: "De: contato@solaraestetica.online" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { color: "#ccc", lineHeight: 1.6, fontSize: "1rem" }, children: [
        /* @__PURE__ */ jsx("p", { children: "Olá! O pagamento da sua clínica foi processado com sucesso." }),
        /* @__PURE__ */ jsxs("p", { children: [
          "Sua infraestrutura ",
          /* @__PURE__ */ jsx("strong", { children: "Solara Estética" }),
          " já foi provisionada."
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { background: "rgba(0,0,0,0.3)", padding: 16, borderRadius: 3, marginTop: 16, border: "1px dashed rgba(255,255,255,0.2)" }, children: [
          /* @__PURE__ */ jsx("strong", { children: "Plano:" }),
          " ",
          planName,
          /* @__PURE__ */ jsx("br", {}),
          /* @__PURE__ */ jsx("strong", { children: "Valor:" }),
          " R$ ",
          planPrice,
          "/mês",
          /* @__PURE__ */ jsx("br", {}),
          /* @__PURE__ */ jsx("strong", { children: "Usuário:" }),
          " ",
          userEmail,
          /* @__PURE__ */ jsx("br", {}),
          /* @__PURE__ */ jsx("strong", { children: "Status:" }),
          " ",
          /* @__PURE__ */ jsx("span", { style: { color: colors.success }, children: "Ativo" })
        ] })
      ] })
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { style: { width: 180, height: 180, background: "rgba(224, 201, 166, 0.06)", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 40, border: `1px solid ${colors.cyan}30` }, children: /* @__PURE__ */ jsx(CreditCard, { size: 90, color: colors.cyan, strokeWidth: 1.5 }) }),
      /* @__PURE__ */ jsx("h2", { style: { fontSize: "3rem", color: colors.cyan, marginBottom: 20, fontWeight: 800, letterSpacing: "-0.02em" }, children: "Transação Segura" }),
      /* @__PURE__ */ jsx("p", { style: { textAlign: "center", color: "#a0a0a0", maxWidth: 450, fontSize: "1.2rem", lineHeight: 1.6, fontWeight: 400 }, children: "Processamos seu pagamento com os mais rígidos protocolos bancários globais." })
    ] }) }) })
  ] });
};
export {
  CheckoutPage as default
};
