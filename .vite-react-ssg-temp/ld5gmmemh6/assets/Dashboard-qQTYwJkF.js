import { jsxs, jsx, Fragment } from "react/jsx-runtime";
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Users, Search, Clock, Stethoscope, Printer, Plus, UserPlus, Activity, AlertCircle, Check, TrendingUp, CheckCircle2, MessageSquare, Target, Building, FileText, UserCog, CheckCheck, Mic, Send, Zap, Settings, X, Trash2, Calendar, BarChart3 } from "lucide-react";
import { s as supabase, d as dashboardColors, L as LogoMarca, g as getAuthHeaders } from "../main.mjs";
import "vite-react-ssg/single-page";
import "@supabase/supabase-js";
globalThis.__VITE_REACT_SSG_TRACK_SSR_MODULE__?.("src/Dashboard.tsx");
const SOLARA_WELCOME_MESSAGE = "Olá! Sou a Solara, gestora inteligente do atendimento da sua clínica. Posso ajudar com operação, recepção, conversão de pacientes e decisões do dia a dia. O que você quer destravar agora?";
const Dashboard = ({ onLogout, clinicId }) => {
  const [activeTab, setActiveTab] = useState("reception");
  const [viewportWidth, setViewportWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = viewportWidth <= 768;
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    if (!isMobile && mobileMenuOpen) setMobileMenuOpen(false);
  }, [isMobile, mobileMenuOpen]);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [currentTime, setCurrentTime] = useState(/* @__PURE__ */ new Date());
  const [showModal, setShowModal] = useState(false);
  const [showSpecialistModal, setShowSpecialistModal] = useState(false);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [anamnese, setAnamnese] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalSearchResults, setShowGlobalSearchResults] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSolara, setShowSolara] = useState(false);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [solaraMessages, setSolaraMessages] = useState([
    { role: "assistant", content: SOLARA_WELCOME_MESSAGE }
  ]);
  const [solaraInput, setSolaraInput] = useState("");
  const [isSolaraSending, setIsSolaraSending] = useState(false);
  const [clinicLimit, setClinicLimit] = useState(2);
  const solaraChatRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceTarget, setVoiceTarget] = useState(null);
  const [voiceError, setVoiceError] = useState(null);
  const [voiceVolume, setVoiceVolume] = useState(0);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const volumeIntervalRef = useRef(null);
  const [specialistsList, setSpecialistsList] = useState([]);
  const [appointmentsList, setAppointmentsList] = useState([]);
  const [patientsList, setPatientsList] = useState([]);
  const [newPatient, setNewPatient] = useState({
    name: "",
    phone: "",
    age: "",
    insurance: "Particular",
    cpf: "",
    lgpd_consent: false
  });
  const [newAppointment, setNewAppointment] = useState({
    date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    time: "09:00",
    doctor_id: ""
  });
  const [newSpecialist, setNewSpecialist] = useState({
    name: "",
    email: "",
    specialty: "",
    crm: "",
    phone: "",
    active: true
  });
  const [automations, setAutomations] = useState([
    { id: 1, title: "Lembrete Pré-Consulta", desc: "Envia WhatsApp 2h antes para confirmar.", active: true },
    { id: 2, title: "Pesquisa NPS", desc: "Envia formulário de satisfação após finalização.", active: true },
    { id: 3, title: "Feliz Aniversário", desc: "Mensagem automática no dia do aniversário do cliente.", active: true },
    { id: 4, title: "Feliz Natal", desc: "Mensagem de boas festas no final do ano.", active: true },
    { id: 5, title: "Follow-up de Bem-Estar", desc: "Mensagem carinhosa 24h após o atendimento.", active: false }
  ]);
  const [whatsappStatus, setWhatsappStatus] = useState("disconnected");
  const [qrCode, setQrCode] = useState(null);
  const [isSyncingWA, setIsSyncingWA] = useState(false);
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: doctors } = await supabase.from("users").select("id, name, email, specialty, crm, active, role").in("role", ["doctor", "owner"]).eq("clinic_id", clinicId);
      if (clinicId) {
        const { data: clinicData } = await supabase.from("clinics").select("plans(max_specialists)").eq("id", clinicId).single();
        const plansData = clinicData?.plans;
        const planLimit = plansData?.max_specialists || plansData?.[0]?.max_specialists;
        if (planLimit) setClinicLimit(planLimit);
      }
      const { data: appointments, error: appError } = await supabase.from("appointments").select("*, patients(name, phone, email), users!appointments_doctor_id_fkey(name, specialty)").eq("clinic_id", clinicId).order("start_time", { ascending: true });
      const { data: patients } = await supabase.from("patients").select("*").eq("clinic_id", clinicId).order("created_at", { ascending: false });
      if (appError) console.error("Supabase Query Error:", appError);
      if (doctors) setSpecialistsList(doctors);
      if (appointments) setAppointmentsList(appointments);
      if (patients) setPatientsList(patients);
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
    } finally {
      setIsLoading(false);
    }
  };
  const checkWhatsAppStatus = async () => {
    if (!clinicId) return;
    try {
      const instanceName = `solara_${clinicId.substring(0, 8)}`;
      const response = await fetch(`${"https://solaraconnectclinicas.axoshub.com"}/api/whatsapp/status/${instanceName}`, {
        headers: await getAuthHeaders()
      });
      const data = await response.json();
      if (data.instance?.state === "open") {
        setWhatsappStatus("connected");
        setQrCode(null);
      } else {
        setWhatsappStatus("disconnected");
      }
    } catch (error) {
      console.error("Erro ao verificar status do WhatsApp:", error);
    }
  };
  const handleConnectWhatsApp = async () => {
    if (!clinicId) return;
    setIsSyncingWA(true);
    setWhatsappStatus("connecting");
    try {
      const instanceName = `solara_${clinicId.substring(0, 8)}`;
      const response = await fetch(`${"https://solaraconnectclinicas.axoshub.com"}/api/whatsapp/connect/${instanceName}`, {
        headers: await getAuthHeaders()
      });
      const data = await response.json();
      if (data.base64) {
        setQrCode(data.base64);
      } else if (data.instance?.state === "open") {
        setWhatsappStatus("connected");
      }
    } catch (error) {
      console.error("Erro ao conectar WhatsApp:", error);
      setWhatsappStatus("disconnected");
    } finally {
      setIsSyncingWA(false);
    }
  };
  const handleDisconnectWhatsApp = async () => {
    if (!clinicId || !window.confirm("Deseja realmente desconectar o WhatsApp?")) return;
    setIsSyncingWA(true);
    try {
      const instanceName = `solara_${clinicId.substring(0, 8)}`;
      await fetch(`${"https://solaraconnectclinicas.axoshub.com"}/api/whatsapp/logout/${instanceName}`, {
        method: "POST",
        headers: await getAuthHeaders()
      });
      setWhatsappStatus("disconnected");
      setQrCode(null);
    } catch (error) {
      console.error("Erro ao desconectar WhatsApp:", error);
    } finally {
      setIsSyncingWA(false);
    }
  };
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(/* @__PURE__ */ new Date()), 1e3);
    fetchData();
    checkWhatsAppStatus();
    const channel = supabase.channel("db-changes").on("postgres_changes", { event: "*", schema: "public" }, () => fetchData()).subscribe();
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);
  useEffect(() => {
    if (solaraChatRef.current) {
      solaraChatRef.current.scrollTop = solaraChatRef.current.scrollHeight;
    }
  }, [solaraMessages]);
  useEffect(() => {
    const loadChatMessages = async () => {
      if (!activeChat?.id) {
        setMessages([]);
        return;
      }
      try {
        const { data, error } = await supabase.from("messages").select("*").eq("patient_id", activeChat.id).order("created_at", { ascending: true });
        if (error) {
          console.error("Erro ao carregar histórico do WhatsApp:", error);
          return;
        }
        setMessages(data || []);
      } catch (error) {
        console.error("Erro ao buscar mensagens do chat ativo:", error);
      }
    };
    loadChatMessages();
    if (!activeChat?.id) return;
    const channel = supabase.channel(`messages-${activeChat.id}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "messages",
        filter: `patient_id=eq.${activeChat.id}`
      },
      () => {
        loadChatMessages();
      }
    ).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChat?.id]);
  const handleSaveAppointment = async (e) => {
    e.preventDefault();
    if (!newPatient.name || !newPatient.lgpd_consent) {
      console.error("Nome e Consentimento LGPD são obrigatórios!");
      return;
    }
    setIsLoading(true);
    const startTime = /* @__PURE__ */ new Date(`${newAppointment.date}T${newAppointment.time}:00`);
    const optimisticApp = {
      id: "temp-" + Date.now(),
      patient_id: "temp-p",
      doctor_id: newAppointment.doctor_id,
      clinic_id: clinicId,
      start_time: startTime.toISOString(),
      status: "pending",
      type: "Consulta",
      insurance: newPatient.insurance,
      patients: { name: newPatient.name, phone: newPatient.phone },
      users: specialistsList.find((s) => s.id === newAppointment.doctor_id) || { name: "Geral", specialty: "Clínico" }
    };
    setAppointmentsList((prev) => [...prev, optimisticApp]);
    setShowModal(false);
    const resetPatient = { name: "", phone: "", age: "", insurance: "Particular", cpf: "", lgpd_consent: false };
    const resetApp = { date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0], time: "09:00", doctor_id: "" };
    setNewPatient(resetPatient);
    setNewAppointment(resetApp);
    try {
      const { data: patient, error: pError } = await supabase.from("patients").insert([{
        name: optimisticApp.patients.name,
        phone: optimisticApp.patients.phone,
        clinic_id: clinicId,
        notes: optimisticApp.insurance !== "Particular" ? `Convênio: ${optimisticApp.insurance}` : null
      }]).select().single();
      if (pError) throw pError;
      const { error: aError } = await supabase.from("appointments").insert([{
        patient_id: patient.id,
        doctor_id: optimisticApp.doctor_id || null,
        clinic_id: clinicId,
        start_time: optimisticApp.start_time,
        end_time: new Date(startTime.getTime() + 30 * 60 * 1e3).toISOString(),
        status: "pending",
        type: "Consulta",
        insurance: optimisticApp.insurance
      }]);
      if (aError) throw aError;
      fetchData();
    } catch (error) {
      console.error("Erro ao sincronizar agendamento:", error.message);
    } finally {
      setIsLoading(false);
    }
  };
  const handleSaveSpecialist = async (e) => {
    e.preventDefault();
    if (!newSpecialist.name.trim() || !newSpecialist.specialty.trim()) {
      alert("Nome e Especialidade são obrigatórios!");
      return;
    }
    if (!clinicId) {
      alert("Erro: clínica não identificada. Faça login novamente.");
      return;
    }
    setIsLoading(true);
    const payload = {
      name: newSpecialist.name.trim(),
      email: newSpecialist.email.trim() || `${newSpecialist.name.toLowerCase().trim().replace(/\s+/g, ".")}@clinica.com`,
      specialty: newSpecialist.specialty.trim(),
      crm: newSpecialist.crm || null,
      phone: newSpecialist.phone || null,
      role: "doctor",
      clinic_id: clinicId,
      active: true
    };
    const formBackup = newSpecialist;
    const tempId = "temp-" + Date.now();
    setSpecialistsList((prev) => [...prev, { id: tempId, ...payload }]);
    setShowSpecialistModal(false);
    setNewSpecialist({ name: "", email: "", specialty: "", crm: "", phone: "", active: true });
    try {
      const { data, error } = await supabase.from("users").insert([payload]).select("id, name, email, specialty, crm, active").single();
      if (error) throw error;
      setSpecialistsList((prev) => prev.map((s) => s.id === tempId ? data : s));
    } catch (error) {
      setSpecialistsList((prev) => prev.filter((s) => s.id !== tempId));
      setNewSpecialist(formBackup);
      setShowSpecialistModal(true);
      alert("Não foi possível cadastrar o especialista: " + (error?.message || "erro desconhecido"));
    } finally {
      setIsLoading(false);
    }
  };
  const handleSaveMedicalRecord = async () => {
    if (!clinicId) return;
    setIsLoading(true);
    try {
      setShowSignatureModal(false);
      const contentToSave = anamnese;
      setAnamnese("");
      const { error } = await supabase.from("medical_records").insert([{
        clinic_id: clinicId,
        patient_id: selectedPatientId || "00000000-0000-0000-0000-000000000000",
        // Mock se não selecionado
        content: contentToSave,
        status: "finalizado",
        signed_at: (/* @__PURE__ */ new Date()).toISOString()
      }]);
      if (error) {
        console.error("Erro ao salvar prontuário no Supabase:", error.message);
      }
    } catch (error) {
      console.error("Erro completo ao salvar prontuário:", error);
      alert("Erro ao processar salvamento: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };
  const handleUpdateAppointmentStatus = async (appointmentId, newStatus) => {
    try {
      setAppointmentsList((prev) => prev.map(
        (app) => app.id === appointmentId ? { ...app, status: newStatus } : app
      ));
      if (newStatus === "em_atendimento") {
        const appointment = appointmentsList.find((a) => a.id === appointmentId);
        if (appointment) {
          setSelectedPatientId(appointment.patient_id);
          setActiveTab("emr");
          setAnamnese("");
        }
      }
      const { error } = await supabase.from("appointments").update({ status: newStatus }).eq("id", appointmentId);
      if (error) throw error;
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
    }
  };
  const handleSolaraSend = async (manualText) => {
    const msg = solaraInput.trim();
    if (!msg || isSolaraSending) return;
    const nextUserMessage = { role: "user", content: msg };
    const history = solaraMessages.filter((message) => message.content.trim()).slice(-10);
    setIsSolaraSending(true);
    setSolaraMessages((prev) => [...prev, nextUserMessage]);
    setSolaraInput("");
    try {
      const response = await fetch(`${"https://solaraconnectclinicas.axoshub.com"}/api/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...await getAuthHeaders()
        },
        body: JSON.stringify({
          message: msg,
          clinic_id: clinicId || void 0,
          chat_history: history
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || "Falha ao consultar a Solara.");
      }
      const responseText = String(data?.solara_response || "").trim();
      setSolaraMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: responseText || "Consigo te ajudar melhor se você me der um pouco mais de contexto sobre a situação."
        }
      ]);
    } catch (error) {
      console.error("Erro ao consultar Solara AI:", error);
      setSolaraMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Tive uma instabilidade ao processar sua solicitação agora. Se quiser, pode repetir a mensagem que eu continuo daqui."
        }
      ]);
    } finally {
      setIsSolaraSending(false);
    }
  };
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "pt-BR";
    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      const text = (finalTranscript + interimTranscript).trim();
      if (text !== "") {
        if (voiceTargetRef.current === "solara") {
          setSolaraInput(text);
        } else if (voiceTargetRef.current === "whatsapp") {
          setNewMessage(text);
        }
      }
    };
    recognition.onend = () => {
      console.log("🎙️ Motor de voz parou. Tentando reiniciar se isListening for true:", isListeningRef.current);
      if (isListeningRef.current) {
        setTimeout(() => {
          if (isListeningRef.current) {
            try {
              recognition.start();
              console.log("🎙️ Motor de voz reiniciado com sucesso.");
            } catch (e) {
              console.error("🎙️ Falha ao reiniciar motor:", e);
            }
          }
        }, 300);
      }
    };
    recognition.onerror = (event) => {
      console.error("Unified Voice Error:", event.error);
      if (event.error === "no-speech") return;
      if (event.error === "not-allowed") {
        setVoiceError("Permissão negada");
      } else if (event.error === "audio-capture") {
        setVoiceError("Mic não disponível");
      } else {
        setVoiceError("Erro: " + event.error);
      }
      setIsListening(false);
      setVoiceTarget(null);
      setTimeout(() => setVoiceError(null), 3e3);
    };
    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.stop();
      } catch (e) {
      }
    };
  }, []);
  const isListeningRef = useRef(isListening);
  const voiceTargetRef = useRef(voiceTarget);
  useEffect(() => {
    isListeningRef.current = isListening;
    voiceTargetRef.current = voiceTarget;
    try {
      recognitionRef.current?.stop();
    } catch (e) {
    }
    if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setVoiceVolume(0);
    if (isListening) {
      setVoiceError(null);
      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        volumeIntervalRef.current = window.setInterval(() => {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setVoiceVolume(average);
        }, 100);
      }).catch(() => {
      });
      const timer = setTimeout(() => {
        try {
          recognitionRef.current?.start();
        } catch (err) {
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isListening, voiceTarget]);
  const toggleVoice = () => {
    if (isListening && voiceTarget === "solara") {
      setIsListening(false);
      setVoiceTarget(null);
    } else {
      setSolaraInput("");
      setVoiceTarget("solara");
      setIsListening(true);
    }
  };
  const toggleVoiceWA = () => {
    if (isListening && voiceTarget === "whatsapp") {
      setIsListening(false);
      setVoiceTarget(null);
    } else {
      setVoiceError(null);
      setVoiceTarget("whatsapp");
      setIsListening(true);
    }
  };
  const handleVoiceSend = () => {
    handleSolaraSend();
    setIsListening(false);
    setVoiceTarget(null);
  };
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeChat) return;
    const msgContent = newMessage;
    const tempMsg = {
      patient_id: activeChat.id,
      content: msgContent,
      sender_type: "clinic",
      status: "sent",
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    setMessages((prev) => [...prev, tempMsg]);
    setNewMessage("");
    try {
      const { error } = await supabase.from("messages").insert([{
        patient_id: tempMsg.patient_id,
        content: tempMsg.content,
        sender_type: tempMsg.sender_type,
        status: "sent"
      }]);
      if (error) console.error("Erro ao sincronizar mensagem:", error);
    } catch (err) {
      console.error("Falha crítica no envio:", err);
    }
  };
  const timeString = currentTime.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const colors = dashboardColors;
  const menuItems = [
    { id: "reception", label: "Recepção", icon: /* @__PURE__ */ jsx(Users, { size: 20 }) },
    { id: "recovery", label: "Recuperação", icon: /* @__PURE__ */ jsx(TrendingUp, { size: 20 }) },
    { id: "agenda", label: "Agenda Kanban", icon: /* @__PURE__ */ jsx(Calendar, { size: 20 }) },
    { id: "contacts", label: "Lista de Clientes", icon: /* @__PURE__ */ jsx(Users, { size: 20 }) },
    { id: "emr", label: "Prontuário", icon: /* @__PURE__ */ jsx(FileText, { size: 20 }) },
    { id: "whatsapp", label: "WhatsApp", icon: /* @__PURE__ */ jsx(MessageSquare, { size: 20 }) },
    { id: "journey", label: "Pré e Pós Consulta", icon: /* @__PURE__ */ jsx(Zap, { size: 20 }) },
    { id: "specialists", label: "Especialistas", icon: /* @__PURE__ */ jsx(Stethoscope, { size: 20 }) },
    { id: "reports", label: "Relatórios", icon: /* @__PURE__ */ jsx(BarChart3, { size: 20 }) },
    { id: "settings", label: "Configurações", icon: /* @__PURE__ */ jsx(Settings, { size: 20 }) }
  ];
  const DonutChart = ({ percent, color, label }) => {
    const r = 35;
    const circ = 2 * Math.PI * r;
    return /* @__PURE__ */ jsxs("div", { style: { textAlign: "center" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { position: "relative", width: 80, height: 80, margin: "0 auto 8px" }, children: [
        /* @__PURE__ */ jsxs("svg", { width: "80", height: "80", viewBox: "0 0 100 100", children: [
          /* @__PURE__ */ jsx("circle", { cx: "50", cy: "50", r, fill: "none", stroke: "#f1f5f9", strokeWidth: "10" }),
          /* @__PURE__ */ jsx(motion.circle, { cx: "50", cy: "50", r, fill: "none", stroke: color, strokeWidth: "10", strokeDasharray: circ, initial: { strokeDashoffset: circ }, animate: { strokeDashoffset: circ - percent / 100 * circ }, transition: { duration: 1.5 }, strokeLinecap: "round", transform: "rotate(-90 50 50)" })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontWeight: 700, fontSize: "0.9rem", color: colors.primary }, children: [
          percent,
          "%"
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { fontSize: "0.75rem", fontWeight: 600, color: colors.textMuted }, children: label })
    ] });
  };
  const globalSearchResults = globalSearch.trim() === "" ? [] : [
    ...menuItems.filter((m) => m.label.toLowerCase().includes(globalSearch.toLowerCase())).map((m) => ({ type: "menu", id: m.id, label: m.label, icon: m.icon })),
    ...patientsList.filter((p) => p.name.toLowerCase().includes(globalSearch.toLowerCase())).map((p) => ({ type: "patient", id: p.id, label: p.name, data: p })),
    ...specialistsList.filter((s) => s.name.toLowerCase().includes(globalSearch.toLowerCase())).map((s) => ({ type: "specialist", id: s.id, label: s.name }))
  ].slice(0, 8);
  return /* @__PURE__ */ jsxs("div", { className: "dash-root", style: { display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: "100vh", backgroundColor: colors.bg, fontFamily: "'Outfit', sans-serif" }, children: [
    /* @__PURE__ */ jsx("style", { children: `
        @media (max-width: 1024px) {
          .dash-main div[style*="grid-template-columns: repeat(4, 1fr)"] { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 768px) {
          .dash-main div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
          .dash-main div[style*="height: calc(100vh - 250px)"] { height: auto !important; }
          .dash-main div[style*="position: sticky"] { position: static !important; height: auto !important; }
          .dash-main header > div { flex-wrap: wrap !important; gap: 12px; }
          .dash-main div[style*="width: 285px"] { width: 100% !important; }
          .dash-root div[style*="position: fixed"] > div { max-width: calc(100vw - 24px); }
          .dash-root div[style*="z-index: 1000"] > div { max-height: calc(100vh - 40px); overflow-y: auto; }
          .dash-root div[style*="z-index: 1000"] div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
          .dash-main button { max-width: 100%; }
        }
      ` }),
    isMobile && /* @__PURE__ */ jsxs("div", { style: { position: "fixed", top: 0, left: 0, right: 0, height: 60, zIndex: 110, background: colors.sidebar, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }, children: [
      /* @__PURE__ */ jsx(LogoMarca, { width: 120 }),
      /* @__PURE__ */ jsxs("button", { onClick: () => setMobileMenuOpen(!mobileMenuOpen), "aria-label": "Abrir menu", style: { background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 8, display: "flex", flexDirection: "column", gap: 5 }, children: [
        /* @__PURE__ */ jsx("span", { style: { width: 24, height: 2, background: "#fff", display: "block", transition: "transform 0.2s", transform: mobileMenuOpen ? "rotate(45deg) translate(5px, 5px)" : "none" } }),
        /* @__PURE__ */ jsx("span", { style: { width: 24, height: 2, background: "#fff", display: "block", opacity: mobileMenuOpen ? 0 : 1 } }),
        /* @__PURE__ */ jsx("span", { style: { width: 24, height: 2, background: "#fff", display: "block", transition: "transform 0.2s", transform: mobileMenuOpen ? "rotate(-45deg) translate(5px, -5px)" : "none" } })
      ] })
    ] }),
    isMobile && mobileMenuOpen && /* @__PURE__ */ jsx("div", { onClick: () => setMobileMenuOpen(false), style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 104 } }),
    /* @__PURE__ */ jsxs("div", { style: { width: "280px", backgroundColor: colors.sidebar, color: "#fff", padding: isMobile ? "76px 20px 32px" : "32px 20px", display: "flex", flexDirection: "column", position: "fixed", left: 0, top: 0, height: "100vh", zIndex: 105, overflowY: "auto", transform: isMobile && !mobileMenuOpen ? "translateX(-100%)" : "translateX(0)", transition: "transform 0.25s ease" }, children: [
      !isMobile && /* @__PURE__ */ jsx("div", { style: { marginBottom: 40, padding: "0 12px" }, children: /* @__PURE__ */ jsx(LogoMarca, { width: 180 }) }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [
        menuItems.map((item) => /* @__PURE__ */ jsxs("button", { onClick: () => {
          setActiveTab(item.id);
          setMobileMenuOpen(false);
        }, style: { display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 3, border: "none", cursor: "pointer", fontSize: "0.95rem", fontWeight: 600, transition: "all 0.2s", backgroundColor: activeTab === item.id ? "rgba(126, 214, 223, 0.15)" : "transparent", color: activeTab === item.id ? colors.accent : "rgba(255,255,255,0.6)", textAlign: "left" }, children: [
          item.icon,
          " ",
          item.label,
          activeTab === item.id && /* @__PURE__ */ jsx(motion.div, { layoutId: "active", style: { marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", backgroundColor: colors.accent } })
        ] }, item.id)),
        /* @__PURE__ */ jsxs("button", { onClick: onLogout, style: { display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 3, border: "none", cursor: "pointer", fontSize: "0.95rem", fontWeight: 600, transition: "all 0.2s", backgroundColor: "transparent", color: "rgba(255,255,255,0.4)", marginTop: "24px" }, onMouseEnter: (e) => e.currentTarget.style.color = colors.danger, onMouseLeave: (e) => e.currentTarget.style.color = "rgba(255,255,255,0.4)", children: [
          /* @__PURE__ */ jsx(LogOut, { size: 20 }),
          " Sair"
        ] })
      ] })
    ] }),
    activeTab === "whatsapp" && /* @__PURE__ */ jsxs("div", { style: isMobile ? { width: "100%", backgroundColor: "#fff", borderBottom: "1px solid rgba(0,0,0,0.05)", position: "relative", maxHeight: "40vh", zIndex: 1, display: activeChat ? "none" : "flex", flexDirection: "column", marginTop: 60 } : { width: "320px", backgroundColor: "#fff", borderRight: "1px solid rgba(0,0,0,0.05)", position: "fixed", left: "280px", top: 0, height: "100vh", zIndex: 100, display: "flex", flexDirection: "column" }, children: [
      /* @__PURE__ */ jsxs("div", { style: { padding: isMobile ? "16px 16px 12px" : "32px 24px 20px" }, children: [
        /* @__PURE__ */ jsxs("h3", { style: { fontSize: "1.2rem", fontWeight: 800, color: colors.primary, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }, children: [
          /* @__PURE__ */ jsx(Users, { size: 20, color: colors.accent }),
          " Clientes"
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { position: "relative" }, children: [
          /* @__PURE__ */ jsx(Search, { size: 18, color: colors.textMuted, style: { position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" } }),
          /* @__PURE__ */ jsx(
            "input",
            {
              placeholder: "Buscar...",
              value: patientSearch,
              onChange: (e) => setPatientSearch(e.target.value),
              style: { width: "100%", padding: "12px 12px 12px 42px", borderRadius: 3, border: "none", background: "#f1f5f9", outline: "none", fontSize: "0.9rem", fontWeight: 500 }
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { flex: 1, overflowY: "auto", padding: "0 12px 20px" }, className: "custom-scroll", children: patientsList.filter((p) => p.name.toLowerCase().includes(patientSearch.toLowerCase())).map((patient) => /* @__PURE__ */ jsx(
        "div",
        {
          onClick: () => {
            setActiveChat(patient);
            setSelectedPatientId(patient.id);
            if (["reception", "reports", "settings"].includes(activeTab)) {
              setActiveTab("whatsapp");
            }
          },
          style: {
            padding: "16px 12px",
            borderRadius: 3,
            cursor: "pointer",
            marginBottom: 8,
            transition: "all 0.2s",
            background: selectedPatientId === patient.id ? colors.accent + "20" : "transparent",
            border: selectedPatientId === patient.id ? `1px solid ${colors.accent}40` : "1px solid transparent"
          },
          onMouseEnter: (e) => selectedPatientId !== patient.id && (e.currentTarget.style.background = "#f8fafc"),
          onMouseLeave: (e) => selectedPatientId !== patient.id && (e.currentTarget.style.background = "transparent"),
          children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12 }, children: [
            /* @__PURE__ */ jsx("div", { style: { width: 44, height: 44, borderRadius: 3, background: colors.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "1.1rem" }, children: patient.name.charAt(0) }),
            /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
              /* @__PURE__ */ jsx("div", { style: { fontSize: "20px", fontWeight: 600, color: colors.primary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: patient.name }),
              /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.85rem", color: colors.textMuted, fontWeight: 500 }, children: [
                "CPF: ",
                patient.cpf || "---"
              ] })
            ] })
          ] })
        },
        patient.id
      )) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "dash-main", style: { flex: 1, marginLeft: isMobile ? 0 : activeTab === "whatsapp" ? "600px" : "280px", marginTop: isMobile && activeTab !== "whatsapp" ? 60 : 0, display: "flex", flexDirection: "column", minWidth: 0 }, children: [
      /* @__PURE__ */ jsxs("header", { style: { padding: isMobile ? "16px" : "24px 40px", backgroundColor: "rgba(255,255,255,0.8)", backdropFilter: "blur(20px)", position: "sticky", top: isMobile ? 60 : 0, zIndex: 50, borderBottom: "1px solid rgba(0,0,0,0.05)" }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexWrap: isMobile ? "wrap" : "nowrap", justifyContent: "space-between", alignItems: "center", gap: isMobile ? 12 : 0, marginBottom: 20 }, children: [
          /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
            /* @__PURE__ */ jsx("h1", { style: { fontSize: "1.8rem", fontWeight: 600, color: colors.primary, marginBottom: 4 }, children: menuItems.find((i) => i.id === activeTab)?.label }),
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12, color: colors.textMuted, fontSize: "0.95rem", fontWeight: 600 }, children: [
              /* @__PURE__ */ jsx(Clock, { size: 16, color: colors.accent }),
              " ",
              /* @__PURE__ */ jsx("span", { style: { letterSpacing: "1px" }, children: timeString }),
              /* @__PURE__ */ jsx("span", { style: { opacity: 0.3 }, children: "|" }),
              " ",
              /* @__PURE__ */ jsx("span", { children: "São Paulo" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs(
            "div",
            {
              onClick: () => setShowSolara(!showSolara),
              style: { display: "flex", alignItems: "center", gap: 12, background: colors.primary, padding: "10px 24px", borderRadius: 3, color: "#fff", cursor: "pointer", transition: "transform 0.2s", border: `1px solid rgba(255,255,255,0.1)` },
              onMouseEnter: (e) => e.currentTarget.style.transform = "scale(1.05)",
              onMouseLeave: (e) => e.currentTarget.style.transform = "scale(1)",
              children: [
                /* @__PURE__ */ jsx("div", { style: { width: 8, height: 8, borderRadius: "50%", background: colors.accent, boxShadow: `0 0 10px ${colors.accent}` } }),
                /* @__PURE__ */ jsx("span", { style: { fontSize: "0.95rem", fontWeight: 700, letterSpacing: "1px" }, children: "SOLARA IA" }),
                /* @__PURE__ */ jsx("span", { style: { fontSize: "0.7rem", color: colors.primary, background: colors.success, padding: "3px 8px", borderRadius: 3, fontWeight: 800 }, children: "ON" })
              ]
            }
          ),
          /* @__PURE__ */ jsxs("div", { style: { flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16 }, children: [
            ["reception", "agenda", "specialists", "emr"].includes(activeTab) && /* @__PURE__ */ jsxs("div", { style: { position: "relative", width: 285 }, children: [
              /* @__PURE__ */ jsx(Search, { size: 18, color: colors.textMuted, style: { position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" } }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  placeholder: "Buscar...",
                  value: globalSearch,
                  onChange: (e) => {
                    setGlobalSearch(e.target.value);
                    setShowGlobalSearchResults(true);
                  },
                  onFocus: () => setShowGlobalSearchResults(true),
                  onBlur: () => setTimeout(() => setShowGlobalSearchResults(false), 200),
                  style: { width: "100%", padding: "12px 16px 12px 48px", borderRadius: 3, border: "1px solid rgba(0,0,0,0.1)", outline: "none", background: "rgba(255,255,255,0.5)" }
                }
              ),
              showGlobalSearchResults && globalSearch.trim() !== "" && /* @__PURE__ */ jsx("div", { style: { position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid rgba(0,0,0,0.05)", borderRadius: 3, marginTop: 8, boxShadow: "0 10px 30px rgba(0,0,0,0.1)", zIndex: 1e3, maxHeight: 300, overflowY: "auto" }, children: globalSearchResults.length === 0 ? /* @__PURE__ */ jsx("div", { style: { padding: "16px", color: colors.textMuted, fontSize: "0.9rem", textAlign: "center" }, children: "Nenhum resultado encontrado" }) : globalSearchResults.map((result, idx) => /* @__PURE__ */ jsxs(
                "div",
                {
                  onClick: () => {
                    setGlobalSearch("");
                    setShowGlobalSearchResults(false);
                    if (result.type === "menu") {
                      setActiveTab(result.id);
                    } else if (result.type === "patient") {
                      setActiveChat(result.data);
                      setSelectedPatientId(result.id);
                      setActiveTab("whatsapp");
                    } else if (result.type === "specialist") {
                      setActiveTab("specialists");
                    }
                  },
                  style: { padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderBottom: "1px solid rgba(0,0,0,0.03)", transition: "background 0.2s" },
                  onMouseEnter: (e) => e.currentTarget.style.background = "#f8fafc",
                  onMouseLeave: (e) => e.currentTarget.style.background = "transparent",
                  children: [
                    /* @__PURE__ */ jsx("div", { style: { width: 28, height: 28, borderRadius: 3, background: `${colors.primary}10`, color: colors.primary, display: "flex", alignItems: "center", justifyContent: "center" }, children: result.type === "menu" ? result.icon : result.type === "patient" ? /* @__PURE__ */ jsx(Users, { size: 14 }) : /* @__PURE__ */ jsx(Stethoscope, { size: 14 }) }),
                    /* @__PURE__ */ jsxs("div", { children: [
                      /* @__PURE__ */ jsx("div", { style: { fontSize: "0.95rem", fontWeight: 600, color: colors.primary }, children: result.label }),
                      /* @__PURE__ */ jsx("div", { style: { fontSize: "0.7rem", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.5px" }, children: result.type === "menu" ? "Menu" : result.type === "patient" ? "Cliente" : "Especialista" })
                    ] })
                  ]
                },
                `${result.type}-${result.id}-${idx}`
              )) })
            ] }),
            activeTab === "reports" ? /* @__PURE__ */ jsxs("button", { onClick: () => window.print(), style: { background: "#fff", color: colors.primary, border: `1px solid ${colors.primary}20`, padding: "12px 24px", borderRadius: 3, fontSize: "1.1rem", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, boxShadow: `0 4px 10px rgba(0,0,0,0.05)` }, children: [
              /* @__PURE__ */ jsx(Printer, { size: 20 }),
              " Exportar Relatório (PDF)"
            ] }) : activeTab === "specialists" ? /* @__PURE__ */ jsxs("button", { onClick: () => {
              const especialistas = specialistsList.filter((s) => s.role !== "owner").length;
              if (especialistas >= clinicLimit) {
                alert(`Seu plano inclui ${clinicLimit} especialistas e todos estão em uso.

Para liberar mais, fale com a Solara.`);
              } else {
                setShowSpecialistModal(true);
              }
            }, style: { background: colors.primary, color: "#fff", border: "none", padding: "10px 20px", borderRadius: 3, fontSize: "15px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, boxShadow: `0 10px 20px ${colors.primary}30` }, children: [
              /* @__PURE__ */ jsx(Plus, { size: 20 }),
              " Novo Especialista"
            ] }) : /* @__PURE__ */ jsxs("button", { onClick: () => setShowModal(true), style: { background: colors.primary, color: "#fff", border: "none", padding: "12px 24px", borderRadius: 3, fontSize: "13px", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, boxShadow: `0 10px 20px ${colors.primary}30` }, children: [
              /* @__PURE__ */ jsx(UserPlus, { size: 20 }),
              " ",
              activeTab === "agenda" ? "Novo Agendamento" : "Check-in Rápido"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { style: { height: 2, width: "100%", background: colors.accent, opacity: 0.5 } })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { padding: isMobile ? "16px" : "40px" }, children: /* @__PURE__ */ jsxs(AnimatePresence, { mode: "wait", children: [
        activeTab === "reception" && /* @__PURE__ */ jsxs(motion.div, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, children: [
          /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginBottom: 40 }, children: [
            { label: "Na Fila", value: "08", sub: "Média 15m", icon: /* @__PURE__ */ jsx(Clock, {}), color: colors.accent },
            { label: "Em Atendimento", value: "03", sub: "Salas ativas", icon: /* @__PURE__ */ jsx(Activity, {}), color: colors.success },
            { label: "Urgências", value: "01", sub: "Prioridade Alta", icon: /* @__PURE__ */ jsx(AlertCircle, {}), color: colors.danger },
            { label: "Confirmados", value: "42", sub: "Total hoje", icon: /* @__PURE__ */ jsx(Check, {}), color: colors.primary }
          ].map((s, i) => /* @__PURE__ */ jsxs("div", { style: { background: "#fff", padding: "24px", borderRadius: 3, border: "1px solid rgba(0,0,0,0.05)", boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }, children: [
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 12 }, children: [
              /* @__PURE__ */ jsx("div", { style: { width: 44, height: 44, borderRadius: 3, background: `${s.color}15`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color }, children: s.icon }),
              /* @__PURE__ */ jsxs("div", { style: { textAlign: "right" }, children: [
                /* @__PURE__ */ jsx("div", { style: { fontSize: "1.6rem", fontWeight: 600, color: colors.primary }, children: s.value }),
                /* @__PURE__ */ jsx("div", { style: { fontSize: "0.75rem", fontWeight: 700, color: s.color }, children: s.sub })
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", fontWeight: 700, color: colors.textMuted }, children: s.label })
          ] }, i)) }),
          /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 320px", gap: 32 }, children: [
            /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, border: "1px solid rgba(0,0,0,0.05)", padding: "32px", boxShadow: "0 10px 30px rgba(0,0,0,0.03)" }, children: [
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }, children: [
                /* @__PURE__ */ jsx("h3", { style: { fontSize: "1.5rem", fontWeight: 600, color: colors.primary }, children: "Fila de Atendimento" }),
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8 }, children: [
                  /* @__PURE__ */ jsx("button", { style: { background: "#f1f5f9", border: "none", padding: "8px 16px", borderRadius: 3, fontSize: "0.8rem", fontWeight: 700, color: colors.textMuted }, children: "Filtros" }),
                  /* @__PURE__ */ jsx("button", { style: { background: "#f1f5f9", border: "none", padding: "8px 16px", borderRadius: 3, fontSize: "0.8rem", fontWeight: 700, color: colors.textMuted }, children: "Ver Tudo" })
                ] })
              ] }),
              /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 16 }, children: appointmentsList.length === 0 ? /* @__PURE__ */ jsx("div", { style: { textAlign: "center", padding: "40px", color: colors.textMuted }, children: "Nenhum cliente na fila." }) : appointmentsList.map((app) => /* @__PURE__ */ jsxs(motion.div, { whileHover: { x: 10 }, style: { display: "flex", alignItems: "center", padding: "20px", borderRadius: 3, background: "#fff", border: `1px solid #f1f5f9`, boxShadow: "0 4px 6px rgba(0,0,0,0.01)" }, children: [
                /* @__PURE__ */ jsx("div", { style: { width: 48, height: 48, borderRadius: 3, background: colors.primary, color: colors.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, marginRight: 20 }, children: app.patients?.name?.charAt(0) || "P" }),
                /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
                  /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, color: colors.primary, fontSize: "20px", marginBottom: 4 }, children: app.patients?.name }),
                  /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.85rem", color: colors.textMuted, display: "flex", gap: 12 }, children: [
                    /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
                      /* @__PURE__ */ jsx(Clock, { size: 14 }),
                      " Horário: ",
                      app.start_time ? new Date(app.start_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--"
                    ] }),
                    /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
                      /* @__PURE__ */ jsx(Stethoscope, { size: 14 }),
                      " ",
                      app.type || "Consulta"
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("div", { style: { textAlign: "right", marginRight: 24 }, children: [
                  /* @__PURE__ */ jsx("div", { style: { fontSize: "0.9rem", fontWeight: 800, color: colors.success }, children: app.status }),
                  /* @__PURE__ */ jsx("div", { style: {
                    fontSize: "0.75rem",
                    fontWeight: 800,
                    color: app.insurance === "Particular" ? colors.success : colors.accent,
                    background: app.insurance === "Particular" ? `${colors.success}15` : `${colors.accent}15`,
                    padding: "4px 12px",
                    borderRadius: 3,
                    marginTop: 6,
                    border: `1px solid ${app.insurance === "Particular" ? colors.success + "30" : colors.accent + "30"}`
                  }, children: app.insurance || "Particular" })
                ] })
              ] }, app.id)) })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 24 }, children: [
              /* @__PURE__ */ jsxs("div", { style: { background: colors.primary, borderRadius: 3, padding: "28px", color: "#fff", boxShadow: `0 20px 40px ${colors.primary}40` }, children: [
                /* @__PURE__ */ jsxs("h3", { style: { fontSize: "1.3rem", fontWeight: 600, marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }, children: [
                  /* @__PURE__ */ jsx(Stethoscope, { size: 20, color: colors.accent }),
                  " Especialistas"
                ] }),
                /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 20 }, children: specialistsList.length === 0 ? /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", textAlign: "center", padding: "20px" }, children: "Nenhum médico cadastrado." }) : specialistsList.slice(0, 3).map((d, i) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 16, borderBottom: i === specialistsList.length - 1 ? "none" : "1px solid rgba(255,255,255,0.1)" }, children: [
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("div", { style: { fontWeight: 700, fontSize: "0.95rem" }, children: d.name }),
                    /* @__PURE__ */ jsx("div", { style: { fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }, children: d.specialty })
                  ] }),
                  /* @__PURE__ */ jsxs("div", { style: { textAlign: "right" }, children: [
                    /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", fontWeight: 700, color: d.active ? colors.success : colors.warn }, children: d.active ? "Disponível" : "Em Pausa" }),
                    /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.7rem", opacity: 0.5 }, children: [
                      "Sala ",
                      i + 1
                    ] })
                  ] })
                ] }, i)) })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, border: "1px solid rgba(0,0,0,0.05)", padding: "28px", boxShadow: "0 10px 30px rgba(0,0,0,0.03)" }, children: [
                /* @__PURE__ */ jsx("h3", { style: { fontSize: "1.1rem", fontWeight: 800, color: colors.primary, marginBottom: 20 }, children: "Metas do Dia" }),
                /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }, children: [
                  /* @__PURE__ */ jsx(DonutChart, { percent: 75, color: colors.success, label: "Consultas" }),
                  /* @__PURE__ */ jsx(DonutChart, { percent: 40, color: colors.accent, label: "Retornos" })
                ] })
              ] })
            ] })
          ] })
        ] }, "reception"),
        activeTab === "recovery" && /* @__PURE__ */ jsxs(motion.div, { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1.05 }, style: { display: "flex", flexDirection: "column", gap: 32 }, children: [
          /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }, children: [
            { label: "Receita em Risco", value: "R$ 48.500", color: colors.warn, icon: /* @__PURE__ */ jsx(TrendingUp, { size: 24 }), desc: "Orçamentos pendentes" },
            { label: "Clientes Inativos", value: "142", color: colors.danger, icon: /* @__PURE__ */ jsx(Users, { size: 24 }), desc: "Há mais de 90 dias" },
            { label: "Taxa de Retorno", value: "12%", color: colors.success, icon: /* @__PURE__ */ jsx(CheckCircle2, { size: 24 }), desc: "+2% este mês" },
            { label: "Recuperado (Mês)", value: "R$ 8.200", color: colors.accent, icon: /* @__PURE__ */ jsx(Activity, { size: 24 }), desc: "Meta: R$ 10.000" }
          ].map((stat, i) => /* @__PURE__ */ jsxs("div", { style: { background: "#fff", padding: 24, borderRadius: 3, border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 10px 30px rgba(0,0,0,0.02)" }, children: [
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }, children: [
              /* @__PURE__ */ jsx("div", { style: { width: 48, height: 48, borderRadius: 3, background: `${stat.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }, children: React.cloneElement(stat.icon, { color: stat.color }) }),
              /* @__PURE__ */ jsx("div", { style: { fontSize: "0.75rem", fontWeight: 800, color: stat.color, background: `${stat.color}10`, padding: "4px 10px", borderRadius: 3 }, children: "AO VIVO" })
            ] }),
            /* @__PURE__ */ jsx("div", { style: { fontSize: "2rem", fontWeight: 600, color: colors.primary, marginBottom: 4 }, children: stat.value }),
            /* @__PURE__ */ jsx("div", { style: { fontSize: "20px", fontWeight: 600, color: colors.primary }, children: stat.label }),
            /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", color: colors.textMuted, marginTop: 4 }, children: stat.desc })
          ] }, i)) }),
          /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 32 }, children: [
            /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: 32, border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 15px 40px rgba(0,0,0,0.03)" }, children: [
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }, children: [
                /* @__PURE__ */ jsxs("h3", { style: { fontSize: "1.5rem", fontWeight: 600, color: colors.primary, display: "flex", alignItems: "center", gap: 12 }, children: [
                  /* @__PURE__ */ jsx(Users, { size: 24, color: colors.accent }),
                  " Clientes para Reativar"
                ] }),
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 10 }, children: [
                  /* @__PURE__ */ jsx("button", { style: { padding: "8px 16px", borderRadius: 3, border: `1px solid rgba(0,0,0,0.1)`, background: "#f8fafc", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }, children: "Filtrar por Tempo" }),
                  /* @__PURE__ */ jsx("button", { style: { padding: "8px 16px", borderRadius: 3, border: "none", background: colors.primary, color: "#fff", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer" }, children: "Exportar Lista" })
                ] })
              ] }),
              /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
                { name: "Ricardo Mendes", lastVisit: "120 dias atrás", procedure: "Implante Dentário", value: "R$ 4.500", risk: "Alto", cpf: "123.456.789-01" },
                { name: "Julia Rocha", lastVisit: "155 dias atrás", procedure: "Harmonização Facial", value: "R$ 2.800", risk: "Crítico", cpf: "987.654.321-02" },
                { name: "Marcos Braz", lastVisit: "95 dias atrás", procedure: "Limpeza e Profilaxia", value: "R$ 350", risk: "Médio", cpf: "456.789.123-03" },
                { name: "Luciana Costa", lastVisit: "210 dias atrás", procedure: "Clareamento Laser", value: "R$ 1.200", risk: "Crítico", cpf: "321.654.987-04" }
              ].map((p, i) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", padding: "16px 20px", background: "#f8fafc", borderRadius: 3, border: "1px solid transparent", transition: "all 0.2s", cursor: "pointer" }, onMouseEnter: (e) => e.currentTarget.style.borderColor = colors.accent, children: [
                /* @__PURE__ */ jsx("div", { style: { width: 44, height: 44, borderRadius: 3, background: colors.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, marginRight: 16 }, children: p.name.charAt(0) }),
                /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
                  /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, color: colors.primary, fontSize: "20px" }, children: p.name }),
                  /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.9rem", color: colors.textMuted }, children: [
                    "CPF: ",
                    p.cpf || "000.000.000-00",
                    " • ",
                    p.procedure
                  ] }),
                  /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.85rem", color: colors.textMuted, opacity: 0.7 }, children: [
                    "Última visita: ",
                    p.lastVisit
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("div", { style: { textAlign: "right", marginRight: 32 }, children: [
                  /* @__PURE__ */ jsx("div", { style: { fontSize: "1.2rem", fontWeight: 600, color: colors.primary }, children: p.value }),
                  /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.85rem", fontWeight: 600, color: p.risk === "Crítico" ? colors.danger : colors.warn }, children: [
                    "Risco ",
                    p.risk
                  ] })
                ] }),
                /* @__PURE__ */ jsxs("button", { onClick: () => alert("Mensagem de recuperação inteligente enviada via WhatsApp para " + p.name + "!"), style: { background: colors.success, color: "#fff", border: "none", padding: "10px 20px", borderRadius: 3, fontSize: "0.85rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: `0 8px 16px ${colors.success}30` }, children: [
                  /* @__PURE__ */ jsx(MessageSquare, { size: 16 }),
                  " Recuperar"
                ] })
              ] }, i)) })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 24 }, children: [
              /* @__PURE__ */ jsxs("div", { style: { background: colors.primary, borderRadius: 3, padding: 32, color: "#fff", position: "relative", overflow: "hidden" }, children: [
                /* @__PURE__ */ jsx("h3", { style: { fontSize: "1.4rem", fontWeight: 600, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }, children: "Campanhas Inteligentes" }),
                /* @__PURE__ */ jsx("p", { style: { fontSize: "0.9rem", color: "rgba(255,255,255,0.7)", marginBottom: 24, lineHeight: 1.6 }, children: "Selecione um modelo de campanha e deixe a IA da Solara cuidar das mensagens." }),
                /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 16 }, children: [
                  { title: "Reativação VIP", desc: "Para clientes inativos há +180 dias", color: colors.accent },
                  { title: "Fechamento de Orçamento", desc: "Follow-up para orçamentos pendentes", color: colors.success },
                  { title: "Promoção Especial", desc: "Envio em massa para toda a base", color: colors.warn }
                ].map((c, i) => /* @__PURE__ */ jsxs("div", { style: { background: "rgba(255,255,255,0.05)", padding: 16, borderRadius: 3, border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", transition: "all 0.2s" }, onMouseEnter: (e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)", children: [
                  /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, fontSize: "20px", color: "#fff", marginBottom: 4 }, children: c.title }),
                  /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", marginBottom: 12 }, children: c.desc }),
                  /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                    /* @__PURE__ */ jsx("span", { style: { fontSize: "0.75rem", color: c.color, fontWeight: 700 }, children: "Disponível" }),
                    /* @__PURE__ */ jsx("button", { style: { background: "transparent", border: `1px solid ${c.color}`, color: c.color, padding: "4px 12px", borderRadius: 3, fontSize: "0.75rem", fontWeight: 700 }, children: "Configurar" })
                  ] })
                ] }, i)) })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: 32, border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 15px 40px rgba(0,0,0,0.03)", textAlign: "center" }, children: [
                /* @__PURE__ */ jsx("div", { style: { width: 64, height: 64, borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }, children: /* @__PURE__ */ jsx(Target, { size: 32, color: colors.primary }) }),
                /* @__PURE__ */ jsx("h4", { style: { fontSize: "1.1rem", fontWeight: 800, color: colors.primary, marginBottom: 8 }, children: "Dica da IA" }),
                /* @__PURE__ */ jsxs("p", { style: { fontSize: "0.85rem", color: colors.textMuted, lineHeight: 1.5 }, children: [
                  "Clientes que realizaram ",
                  /* @__PURE__ */ jsx("strong", { children: "Limpeza" }),
                  " têm 40% mais chance de aceitar novos orçamentos se contatados em até 5 dias."
                ] })
              ] })
            ] })
          ] })
        ] }, "recovery"),
        activeTab === "agenda" && /* @__PURE__ */ jsx(motion.div, { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -20 }, style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32, height: "calc(100vh - 250px)" }, children: (() => {
          const statusMap = [
            { id: "confirmados", label: "Confirmados", statuses: ["confirmed", "pending"], color: colors.success, bg: "transparent", nextStatus: "in_progress", nextLabel: "Iniciar" },
            { id: "espera", label: "Em Atendimento", statuses: ["in_progress"], color: colors.warn, bg: "transparent", nextStatus: "completed", nextLabel: "Finalizar" },
            { id: "finalizados", label: "Finalizados", statuses: ["completed"], color: colors.textMuted, bg: "transparent", nextStatus: null, nextLabel: null }
          ];
          return statusMap.map((col) => {
            const items = appointmentsList.filter((a) => col.statuses.includes(a.status));
            return /* @__PURE__ */ jsxs("div", { style: { background: "#fff", backgroundImage: col.bg, borderRadius: 3, padding: "24px", display: "flex", flexDirection: "column", gap: 20, border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 15px 35px rgba(0,0,0,0.02)", position: "relative", overflow: "hidden" }, children: [
              /* @__PURE__ */ jsx("div", { style: { position: "absolute", top: 0, left: 0, right: 0, height: 4, background: col.color } }),
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 4px 16px", borderBottom: "1px dashed rgba(0,0,0,0.05)" }, children: [
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12 }, children: [
                  /* @__PURE__ */ jsx("div", { style: { width: 36, height: 36, borderRadius: 3, background: `${col.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ jsx(Users, { size: 18, color: col.color }) }),
                  /* @__PURE__ */ jsx("h3", { style: { fontSize: "1.2rem", fontWeight: 700, color: colors.primary }, children: col.label })
                ] }),
                /* @__PURE__ */ jsx("span", { style: { fontSize: "0.9rem", fontWeight: 700, color: col.color, background: `${col.color}15`, padding: "6px 14px", borderRadius: 3 }, children: items.length })
              ] }),
              /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", paddingBottom: "20px", paddingRight: "4px" }, children: items.length === 0 ? /* @__PURE__ */ jsx("div", { style: { textAlign: "center", padding: "30px 16px", color: colors.textMuted, fontSize: "0.85rem" }, children: "Nenhum cliente nesta coluna." }) : items.map((item) => {
                const patientName = item.patients?.name || "Cliente";
                const doctorName = item.users?.name || "Sem médico";
                const time = item.start_time ? new Date(item.start_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--";
                return /* @__PURE__ */ jsxs(
                  motion.div,
                  {
                    layout: true,
                    whileHover: { y: -4, boxShadow: "0 12px 24px -4px rgba(0,0,0,0.1)" },
                    style: { background: "#fff", padding: "20px", borderRadius: 3, boxShadow: "0 8px 20px -8px rgba(0,0,0,0.08)", border: "1px solid rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: 16, position: "relative", overflow: "hidden", cursor: "default" },
                    children: [
                      /* @__PURE__ */ jsx("div", { style: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: col.color, opacity: 0.5 } }),
                      item.status === "confirmed" && /* @__PURE__ */ jsxs("div", { style: { position: "absolute", top: 12, right: 12, background: colors.success, color: "#fff", fontSize: "0.65rem", fontWeight: 900, padding: "4px 8px", borderRadius: 3, display: "flex", alignItems: "center", gap: 4, boxShadow: `0 4px 10px ${colors.success}30` }, children: [
                        /* @__PURE__ */ jsx(CheckCircle2, { size: 10 }),
                        " CLIENTE CONFIRMADO"
                      ] }),
                      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 8 }, children: [
                        /* @__PURE__ */ jsx("span", { style: { fontSize: "0.75rem", fontWeight: 700, color: colors.primary, background: "#f1f5f9", padding: "6px 12px", borderRadius: 3, letterSpacing: "0.5px", textTransform: "uppercase" }, children: item.type || "Consulta" }),
                        /* @__PURE__ */ jsxs("span", { style: { fontSize: "0.9rem", fontWeight: 700, color: colors.primary, display: "flex", alignItems: "center", gap: 6, background: `${colors.accent}15`, padding: "4px 10px", borderRadius: 3 }, children: [
                          /* @__PURE__ */ jsx(Clock, { size: 14, color: colors.accent }),
                          " ",
                          time
                        ] }),
                        /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", fontWeight: 800, color: item.payment_status === "pago" ? colors.success : colors.danger, background: item.payment_status === "pago" ? `${colors.success}15` : `${colors.danger}15`, padding: "4px 8px", borderRadius: 3 }, children: item.payment_status === "pago" ? "PAGO" : "PENDENTE" })
                      ] }),
                      /* @__PURE__ */ jsxs("div", { style: { paddingLeft: 8 }, children: [
                        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }, children: [
                          /* @__PURE__ */ jsx("div", { style: { width: 40, height: 40, borderRadius: "50%", background: `${col.color}26`, color: col.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "1.1rem", border: `2px solid #fff`, boxShadow: "0 2px 5px rgba(0,0,0,0.05)" }, children: patientName.charAt(0) }),
                          /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, color: colors.primary, fontSize: "1.1rem" }, children: patientName })
                        ] }),
                        /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.85rem", color: colors.textMuted, display: "flex", alignItems: "center", gap: 8, fontWeight: 500, background: "#f8fafc", padding: "8px 12px", borderRadius: 3, marginBottom: 8 }, children: [
                          /* @__PURE__ */ jsx(Stethoscope, { size: 16, color: colors.accent }),
                          " ",
                          doctorName
                        ] }),
                        /* @__PURE__ */ jsxs("div", { style: {
                          fontSize: "0.8rem",
                          color: item.insurance === "Particular" ? colors.success : colors.accent,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontWeight: 800,
                          background: item.insurance === "Particular" ? `${colors.success}10` : `${colors.accent}10`,
                          padding: "8px 12px",
                          borderRadius: 3,
                          marginBottom: 12,
                          border: `1px solid ${item.insurance === "Particular" ? colors.success + "30" : colors.accent + "30"}`
                        }, children: [
                          /* @__PURE__ */ jsx(Building, { size: 16 }),
                          " ",
                          item.insurance || "Particular"
                        ] }),
                        /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.9rem", color: colors.success, display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }, children: [
                          "R$ ",
                          item.payment_value || "0,00"
                        ] })
                      ] }),
                      col.nextStatus && /* @__PURE__ */ jsxs("button", { onClick: () => handleUpdateAppointmentStatus(item.id, col.nextStatus), style: { background: `${col.color}15`, color: col.color, border: `1px solid ${col.color}40`, padding: "8px 16px", borderRadius: 3, fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", marginLeft: 8, transition: "all 0.2s" }, children: [
                        /* @__PURE__ */ jsx(Check, { size: 14, style: { verticalAlign: "middle", marginRight: 6 } }),
                        col.nextLabel
                      ] })
                    ]
                  },
                  item.id
                );
              }) })
            ] }, col.id);
          });
        })() }, "agenda"),
        activeTab === "emr" && /* @__PURE__ */ jsxs(motion.div, { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 }, style: { display: "flex", flexDirection: "column", gap: 32 }, children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("h2", { style: { fontSize: "2rem", fontWeight: 800, color: colors.primary, letterSpacing: "-0.5px" }, children: "Prontuário Digital" }),
              /* @__PURE__ */ jsx("p", { style: { color: colors.textMuted, fontWeight: 500 }, children: "Acesse o histórico e realize novas evoluções clínicas." })
            ] }),
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: () => setShowRecordModal(true),
                style: {
                  background: colors.primary,
                  color: "#fff",
                  border: "none",
                  padding: "16px 28px",
                  borderRadius: 3,
                  fontWeight: 700,
                  fontSize: "1rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  transition: "all 0.3s"
                },
                onMouseEnter: (e) => e.currentTarget.style.transform = "translateY(-3px)",
                onMouseLeave: (e) => e.currentTarget.style.transform = "translateY(0)",
                children: [
                  /* @__PURE__ */ jsx("div", { style: { background: "rgba(255,255,255,0.2)", borderRadius: "50%", padding: 4 }, children: /* @__PURE__ */ jsx(Plus, { size: 20 }) }),
                  "Novo Prontuário"
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "320px 1fr", gap: 32 }, children: [
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 20, position: "sticky", top: 120, height: "calc(100vh - 160px)" }, children: [
              (() => {
                const activePatient = patientsList.find((p) => p.id === selectedPatientId);
                if (!activePatient) return null;
                const lastApp = [...appointmentsList].reverse().find((a) => a.patient_id === activePatient.id);
                const specialist = lastApp ? specialistsList.find((s) => s.id === lastApp.doctor_id) : null;
                return /* @__PURE__ */ jsxs("div", { style: { background: colors.primary, borderRadius: 3, padding: 32, color: "#fff", textAlign: "center", boxShadow: `0 20px 40px ${colors.primary}40`, marginBottom: 8 }, children: [
                  /* @__PURE__ */ jsx("div", { style: { width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.1)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 600, margin: "0 auto 16px" }, children: activePatient.name.charAt(0) }),
                  /* @__PURE__ */ jsx("h3", { style: { fontSize: "1.2rem", fontWeight: 600 }, children: activePatient.name }),
                  /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.9rem", opacity: 0.7, marginBottom: 20 }, children: [
                    activePatient.age || "--",
                    " Anos • ",
                    activePatient.insurance || "Particular"
                  ] }),
                  /* @__PURE__ */ jsxs("div", { style: { background: "rgba(255,255,255,0.05)", padding: 16, borderRadius: 3, textAlign: "left", fontSize: "0.9rem", display: "flex", flexDirection: "column", gap: 8 }, children: [
                    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                      /* @__PURE__ */ jsx("span", { style: { opacity: 0.6 }, children: "WhatsApp:" }),
                      /* @__PURE__ */ jsx("span", { children: activePatient.phone || "--" })
                    ] }),
                    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                      /* @__PURE__ */ jsx("span", { style: { opacity: 0.6 }, children: "CPF:" }),
                      /* @__PURE__ */ jsx("span", { children: activePatient.cpf || "--" })
                    ] }),
                    /* @__PURE__ */ jsxs("div", { style: { marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                      /* @__PURE__ */ jsx("span", { style: { opacity: 0.6 }, children: "Especialista:" }),
                      /* @__PURE__ */ jsx("span", { style: { color: colors.accent, fontWeight: 700 }, children: specialist ? specialist.name : "Não definido" })
                    ] })
                  ] })
                ] });
              })(),
              /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: "24px", border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 15px 35px rgba(0,0,0,0.02)", display: "flex", flexDirection: "column", height: "100%", flex: 1, overflow: "hidden" }, children: [
                /* @__PURE__ */ jsxs("h4", { style: { fontSize: "1.1rem", fontWeight: 600, color: colors.primary, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }, children: [
                  /* @__PURE__ */ jsx(Users, { size: 20, color: colors.accent }),
                  " Próximos da Fila"
                ] }),
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", paddingRight: 8, flex: 1 }, children: [
                  patientsList.filter((p) => p.id !== selectedPatientId).map((patient) => {
                    const todayApp = appointmentsList.find(
                      (a) => a.patient_id === patient.id && ["confirmado", "em_atendimento", "aguardando"].includes(a.status)
                    );
                    const specialist = todayApp ? specialistsList.find((s) => s.id === todayApp.doctor_id) : null;
                    return /* @__PURE__ */ jsxs(
                      motion.div,
                      {
                        whileHover: { scale: 1.02 },
                        whileTap: { scale: 0.98 },
                        onClick: () => {
                          setSelectedPatientId(patient.id);
                          setAnamnese("");
                        },
                        style: {
                          padding: "16px",
                          borderRadius: 3,
                          border: "2px solid transparent",
                          background: "#f8fafc",
                          cursor: "pointer",
                          transition: "all 0.2s",
                          position: "relative"
                        },
                        children: [
                          /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }, children: [
                            /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, color: colors.primary, fontSize: "1.05rem" }, children: patient.name }),
                            todayApp && /* @__PURE__ */ jsx("div", { style: { width: 10, height: 10, borderRadius: "50%", background: colors.success, boxShadow: `0 0 8px ${colors.success}` }, title: "Agendado para hoje" })
                          ] }),
                          /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", color: colors.textMuted, fontWeight: 500, display: "flex", justifyContent: "space-between" }, children: /* @__PURE__ */ jsxs("span", { children: [
                            patient.insurance || "Particular",
                            " • CPF: ",
                            patient.cpf || "---"
                          ] }) }),
                          specialist && /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.8rem", color: colors.accent, fontWeight: 600, marginTop: 4 }, children: [
                            "Especialista: ",
                            specialist.name
                          ] })
                        ]
                      },
                      patient.id
                    );
                  }),
                  patientsList.length <= 1 && /* @__PURE__ */ jsx("div", { style: { textAlign: "center", padding: "40px 20px", fontSize: "0.85rem", color: colors.textMuted }, children: "Nenhum outro cliente na fila." })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 24 }, children: (() => {
              const activePatient = patientsList.find((p) => p.id === selectedPatientId);
              if (!activePatient) {
                return /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: "100px 60px", textAlign: "center", border: "1px dashed rgba(0,0,0,0.1)", flex: 1 }, children: [
                  /* @__PURE__ */ jsx("div", { style: { width: 80, height: 80, borderRadius: "50%", background: `${colors.accent}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }, children: /* @__PURE__ */ jsx(Users, { size: 40, color: colors.accent }) }),
                  /* @__PURE__ */ jsx("h3", { style: { fontSize: "1.5rem", fontWeight: 800, color: colors.primary, marginBottom: 12 }, children: "Selecione um cliente na fila" }),
                  /* @__PURE__ */ jsx("p", { style: { color: colors.textMuted }, children: "O médico pode clicar em qualquer cliente na lista à esquerda para ver a ficha e iniciar o atendimento." })
                ] });
              }
              return /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: 32, border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 15px 35px rgba(0,0,0,0.02)", flex: 1, display: "flex", flexDirection: "column" }, children: [
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }, children: [
                  /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 4 }, children: [
                    /* @__PURE__ */ jsxs("h3", { style: { fontSize: "1.3rem", fontWeight: 600, color: colors.primary, display: "flex", alignItems: "center", gap: 10 }, children: [
                      /* @__PURE__ */ jsx(FileText, { size: 22, color: colors.accent }),
                      " Evolução Clínica"
                    ] }),
                    (() => {
                      const todayApp = appointmentsList.find((a) => a.patient_id === activePatient.id && ["confirmado", "em_atendimento", "aguardando"].includes(a.status));
                      const specialist = todayApp ? specialistsList.find((s) => s.id === todayApp.doctor_id) : null;
                      return specialist ? /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.9rem", color: colors.textMuted, fontWeight: 600, marginLeft: 32 }, children: [
                        "Responsável: ",
                        /* @__PURE__ */ jsx("span", { style: { color: colors.accent }, children: specialist.name })
                      ] }) : null;
                    })()
                  ] }),
                  /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 12 }, children: [
                    /* @__PURE__ */ jsxs("button", { onClick: () => setShowPrescriptionModal(true), style: { background: colors.success, color: "#fff", border: "none", padding: "10px 20px", borderRadius: 3, fontWeight: 600, fontSize: "1rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }, children: [
                      /* @__PURE__ */ jsx(Plus, { size: 20 }),
                      " Receita"
                    ] }),
                    /* @__PURE__ */ jsxs("button", { onClick: () => setShowSignatureModal(true), style: { background: colors.primary, color: "#fff", border: "none", padding: "10px 24px", borderRadius: 3, fontWeight: 600, fontSize: "1rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }, children: [
                      /* @__PURE__ */ jsx(Check, { size: 20 }),
                      " Assinar e Salvar"
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ jsx(
                  "textarea",
                  {
                    placeholder: "Descreva o atendimento, queixas do cliente e conduta médica...",
                    style: { flex: 1, minHeight: "400px", width: "100%", border: "1px solid rgba(0,0,0,0.05)", borderRadius: 3, padding: 24, outline: "none", resize: "none", background: "#f8fafc", fontSize: "1.1rem", color: colors.text, fontFamily: "inherit", lineHeight: 1.6 },
                    value: anamnese,
                    onChange: (e) => setAnamnese(e.target.value)
                  }
                )
              ] });
            })() })
          ] })
        ] }, "emr"),
        activeTab === "whatsapp" && /* @__PURE__ */ jsx(motion.div, { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -20 }, style: { height: isMobile ? "calc(100vh - 240px)" : "calc(100vh - 200px)", display: "flex", justifyContent: "center", paddingBottom: 20 }, children: /* @__PURE__ */ jsx("div", { style: { width: "100%", maxWidth: 960, background: "#fff", borderRadius: 3, border: isMobile ? "4px solid #1e293b" : "12px solid #1e293b", boxShadow: "0 30px 60px -12px rgba(0,0,0,0.3)", display: "flex", overflow: "hidden", position: "relative" }, children: /* @__PURE__ */ jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", background: "#e5ddd5", position: "relative" }, children: [
          /* @__PURE__ */ jsx("div", { style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.4, backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: "repeat", pointerEvents: "none", zIndex: 1 } }),
          /* @__PURE__ */ jsxs("div", { style: { padding: isMobile ? "10px 12px" : "14px 24px", background: "#f0f2f5", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(0,0,0,0.1)", position: "relative", zIndex: 10 }, children: [
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: isMobile ? 8 : 14 }, children: [
              isMobile && activeChat && /* @__PURE__ */ jsx("button", { onClick: () => {
                setActiveChat(null);
                setSelectedPatientId(null);
              }, "aria-label": "Voltar para a lista", style: { background: "transparent", border: "none", color: "#54656f", cursor: "pointer", padding: 4, fontSize: "1.4rem", lineHeight: 1 }, children: "←" }),
              /* @__PURE__ */ jsx("div", { style: { width: 45, height: 45, borderRadius: "50%", background: "#dfe5e7", color: "#54656f", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: "1.1rem" }, children: activeChat?.name.charAt(0) || /* @__PURE__ */ jsx(MessageSquare, { size: 20 }) }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, color: "#111", fontSize: "1.05rem" }, children: activeChat?.name || "Selecione um Cliente" }),
                /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.8rem", color: colors.success, fontWeight: 600 }, children: [
                  "visto por último hoje às ",
                  (/* @__PURE__ */ new Date()).getHours(),
                  ":",
                  (/* @__PURE__ */ new Date()).getMinutes()
                ] })
              ] })
            ] }),
            activeChat && /* @__PURE__ */ jsxs("button", { style: { background: "#fff", color: colors.danger, border: `1px solid ${colors.danger}40`, padding: "10px 16px", borderRadius: 3, fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 10px rgba(255, 82, 82, 0.1)" }, children: [
              /* @__PURE__ */ jsx(UserCog, { size: 18 }),
              " Humano Atender"
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { style: { flex: 1, padding: isMobile ? "16px 12px" : "20px 40px", display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", position: "relative", zIndex: 5 }, children: !activeChat ? /* @__PURE__ */ jsxs("div", { style: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20, textAlign: "center" }, children: [
            /* @__PURE__ */ jsx("div", { style: { background: "#fff", padding: 40, borderRadius: "50%", boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }, children: /* @__PURE__ */ jsx(MessageSquare, { size: 100, color: colors.primary, opacity: 0.1 }) }),
            /* @__PURE__ */ jsx("h2", { style: { color: "#41525d", fontWeight: 300, fontSize: "2rem" }, children: "Solara Connect WhatsApp" }),
            /* @__PURE__ */ jsx("p", { style: { color: "#667781", fontSize: "0.9rem", maxWidth: 400 }, children: "Mantenha seu celular conectado. Envie e receba mensagens sem precisar abrir o aparelho." })
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("div", { style: { alignSelf: "center", background: "#fff", padding: "6px 12px", borderRadius: 3, fontSize: "0.75rem", color: "#54656f", boxShadow: "0 1px 1px rgba(0,0,0,0.1)", marginBottom: 20, fontWeight: 600, textTransform: "uppercase" }, children: "Hoje" }),
            messages.map((m, idx) => {
              const isMe = m.sender_type !== "patient";
              return /* @__PURE__ */ jsxs("div", { style: {
                alignSelf: isMe ? "flex-end" : "flex-start",
                background: isMe ? "#dcf8c6" : "#fff",
                color: "#111",
                padding: "6px 10px 14px 10px",
                borderRadius: 3,
                maxWidth: isMobile ? "85%" : "65%",
                boxShadow: "0 1px 1.5px rgba(0,0,0,0.15)",
                fontSize: "0.95rem",
                fontWeight: 400,
                lineHeight: 1.4,
                position: "relative",
                marginBottom: 4
              }, children: [
                m.content,
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end", marginTop: -4, position: "absolute", bottom: 4, right: 8, fontSize: "0.65rem", color: "rgba(0,0,0,0.45)" }, children: [
                  new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
                  isMe && /* @__PURE__ */ jsx(CheckCheck, { size: 14, color: "#34b7f1" })
                ] })
              ] }, idx);
            })
          ] }) }),
          /* @__PURE__ */ jsxs(
            "form",
            {
              onSubmit: (e) => {
                e.preventDefault();
                if (isListening && voiceTarget === "whatsapp") setIsListening(false);
                handleSendMessage();
              },
              style: { padding: "10px 16px", background: "#f0f2f5", display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 10 },
              children: [
                /* @__PURE__ */ jsxs("div", { style: { flex: 1, background: "#fff", borderRadius: 3, padding: "4px 12px", display: "flex", alignItems: "center", boxShadow: "0 1px 1px rgba(0,0,0,0.05)", border: voiceError ? "2px solid #ef4444" : isListening && voiceTarget === "whatsapp" ? `2px solid ${colors.success}` : "none" }, children: [
                  /* @__PURE__ */ jsxs(
                    "button",
                    {
                      type: "button",
                      onClick: toggleVoiceWA,
                      title: "Ditar Mensagem",
                      disabled: !activeChat,
                      style: { background: "transparent", color: voiceError && voiceTarget === "whatsapp" ? "#ef4444" : isListening && voiceTarget === "whatsapp" ? colors.success : "#8696a0", border: "none", padding: "8px", cursor: activeChat ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.3s", position: "relative" },
                      children: [
                        /* @__PURE__ */ jsx(Mic, { size: 22, style: { animation: isListening && voiceTarget === "whatsapp" ? "pulse 1.5s infinite" : "none" } }),
                        isListening && voiceTarget === "whatsapp" && /* @__PURE__ */ jsx("div", { style: { position: "absolute", bottom: 5, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 2, alignItems: "flex-end", height: 8 }, children: [1, 2, 3, 4, 5].map((i) => /* @__PURE__ */ jsx("div", { style: { width: 2, background: colors.success, height: `${Math.min(8, 2 + voiceVolume / 12 * i)}px`, transition: "height 0.1s" } }, i)) })
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "input",
                    {
                      type: "text",
                      placeholder: voiceError && voiceTarget === "whatsapp" ? voiceError : isListening && voiceTarget === "whatsapp" ? "Ouvindo... Dite a mensagem" : "Mensagem",
                      disabled: !activeChat,
                      style: { flex: 1, border: "none", outline: "none", background: "transparent", fontSize: "1rem", padding: "9px 10px", color: "#3b4a54" },
                      value: newMessage,
                      onChange: (e) => {
                        setNewMessage(e.target.value);
                        if (voiceError) setVoiceError(null);
                      }
                    }
                  )
                ] }),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "submit",
                    disabled: !activeChat || !newMessage.trim(),
                    style: { width: 45, height: 45, borderRadius: 3, background: activeChat && newMessage.trim() ? colors.success : "#cbd5e1", color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: activeChat && newMessage.trim() ? "pointer" : "default", boxShadow: "0 4px 10px rgba(0,0,0,0.1)", transition: "background 0.3s" },
                    children: /* @__PURE__ */ jsx(Send, { size: 24 })
                  }
                )
              ]
            }
          )
        ] }) }) }, "whatsapp"),
        activeTab === "journey" && /* @__PURE__ */ jsx(motion.div, { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 }, style: { display: "flex", flexDirection: "column", gap: 32 }, children: /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }, children: [
          /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: "32px", border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 15px 35px rgba(0,0,0,0.02)" }, children: [
            /* @__PURE__ */ jsxs("h3", { style: { fontSize: "1.4rem", fontWeight: 600, color: colors.primary, marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }, children: [
              /* @__PURE__ */ jsx(Zap, { size: 20, color: colors.accent }),
              " Motores de Automação"
            ] }),
            /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 20 }, children: automations.map((auto) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: auto.active ? `${colors.success}10` : "#f8fafc", borderRadius: 3, border: `1px solid ${auto.active ? colors.success + "30" : "rgba(0,0,0,0.05)"}` }, children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, fontSize: "1.1rem", color: auto.active ? colors.primary : colors.textMuted }, children: auto.title }),
                /* @__PURE__ */ jsx("div", { style: { fontSize: "0.95rem", fontWeight: 500, color: colors.textMuted, marginTop: 4 }, children: auto.desc })
              ] }),
              /* @__PURE__ */ jsx(
                "div",
                {
                  onClick: () => setAutomations((prev) => prev.map((a) => a.id === auto.id ? { ...a, active: !a.active } : a)),
                  style: { width: 44, height: 24, borderRadius: 3, background: auto.active ? colors.success : "#e2e8f0", position: "relative", cursor: "pointer", transition: "all 0.3s" },
                  children: /* @__PURE__ */ jsx("div", { style: { position: "absolute", top: 2, left: auto.active ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 2px 5px rgba(0,0,0,0.2)", transition: "all 0.3s" } })
                }
              )
            ] }, auto.id)) })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { background: "#130f40", borderRadius: 3, padding: "32px", color: "#fff", boxShadow: "0 20px 40px rgba(19,15,64,0.3)", position: "relative", overflow: "hidden" }, children: [
            /* @__PURE__ */ jsx("div", { style: { position: "absolute", top: 0, right: 0, width: 200, height: 200, background: "transparent" } }),
            /* @__PURE__ */ jsxs("h3", { style: { fontSize: "1.4rem", fontWeight: 600, marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }, children: [
              /* @__PURE__ */ jsx(Zap, { size: 20, color: colors.accent }),
              " Log do Cérebro Ativo"
            ] }),
            /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 16, position: "relative", zIndex: 2 }, children: [
              { time: "14:02", text: "NPS enviado para Julia Rocha", status: "success" },
              { time: "13:45", text: "Lembrete enviado para Marcos Braz", status: "success" },
              { time: "13:30", text: "Confirmação pendente: Ana Beatriz", status: "warn" },
              { time: "13:10", text: "Follow-up enviado: Carlos Oliveira", status: "success" }
            ].map((log, i) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "flex-start", gap: 16 }, children: [
              /* @__PURE__ */ jsx("div", { style: { color: "rgba(255,255,255,0.4)", fontSize: "0.8rem", fontWeight: 600, marginTop: 2 }, children: log.time }),
              /* @__PURE__ */ jsx("div", { style: { flex: 1, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.05)" }, children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                /* @__PURE__ */ jsx("div", { style: { width: 8, height: 8, borderRadius: "50%", background: log.status === "success" ? colors.success : colors.warn, boxShadow: `0 0 10px ${log.status === "success" ? colors.success : colors.warn}` } }),
                /* @__PURE__ */ jsx("span", { style: { fontSize: "1rem", fontWeight: 500, color: "rgba(255,255,255,0.9)" }, children: log.text })
              ] }) })
            ] }, i)) })
          ] })
        ] }) }, "journey"),
        activeTab === "specialists" && /* @__PURE__ */ jsx(motion.div, { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 }, style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }, children: specialistsList.length === 0 ? /* @__PURE__ */ jsx("div", { style: { gridColumn: "span 3", textAlign: "center", padding: "40px", color: colors.textMuted }, children: "Nenhum especialista cadastrado." }) : specialistsList.map((doc, i) => /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: "32px", border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 15px 35px rgba(0,0,0,0.02)", position: "relative", overflow: "hidden" }, children: [
          /* @__PURE__ */ jsx("div", { style: { position: "absolute", top: 0, left: 0, right: 0, height: 6, background: doc.active ? colors.success : colors.textMuted } }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }, children: [
            /* @__PURE__ */ jsx("div", { style: { width: 60, height: 60, borderRadius: 3, background: colors.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", fontWeight: 700, boxShadow: `0 10px 20px ${colors.primary}30` }, children: doc.name.charAt(0) }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("div", { style: { fontWeight: 700, fontSize: "1.1rem", color: colors.primary }, children: doc.name }),
              /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", fontWeight: 600, color: colors.accent }, children: doc.specialty })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", background: "#f8fafc", padding: "16px", borderRadius: 3 }, children: [
            /* @__PURE__ */ jsxs("div", { style: { textAlign: "center" }, children: [
              /* @__PURE__ */ jsx("div", { style: { fontSize: "1.2rem", fontWeight: 700, color: colors.primary }, children: doc.rating || 5 }),
              /* @__PURE__ */ jsx("div", { style: { fontSize: "0.7rem", fontWeight: 600, color: colors.textMuted, textTransform: "uppercase" }, children: "Rating" })
            ] }),
            /* @__PURE__ */ jsx("div", { style: { width: 1, background: "rgba(0,0,0,0.05)" } }),
            /* @__PURE__ */ jsxs("div", { style: { textAlign: "center" }, children: [
              /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", fontWeight: 700, color: doc.active ? colors.success : colors.danger }, children: doc.active ? "Ativo" : "Inativo" }),
              /* @__PURE__ */ jsx("div", { style: { fontSize: "0.7rem", fontWeight: 600, color: colors.textMuted, textTransform: "uppercase" }, children: "Status" })
            ] })
          ] })
        ] }, i)) }, "specialists"),
        activeTab === "contacts" && /* @__PURE__ */ jsx(motion.div, { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 }, style: { display: "flex", flexDirection: "column", gap: 32 }, children: /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: "40px", border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 20px 50px rgba(0,0,0,0.03)" }, children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }, children: [
            /* @__PURE__ */ jsx("h2", { style: { fontSize: "2rem", fontWeight: 600, color: colors.primary }, children: "Central de Clientes" }),
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 16 }, children: [
              /* @__PURE__ */ jsxs("div", { style: { position: "relative", width: 400 }, children: [
                /* @__PURE__ */ jsx(Search, { size: 20, color: colors.textMuted, style: { position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" } }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    placeholder: "Buscar por nome, CPF ou telefone...",
                    style: { width: "100%", padding: "16px 16px 16px 48px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", fontSize: "1rem", background: "#f8fafc" }
                  }
                )
              ] }),
              /* @__PURE__ */ jsxs("button", { onClick: () => setShowModal(true), style: { background: colors.primary, color: "#fff", border: "none", padding: "16px 32px", borderRadius: 3, fontWeight: 600, fontSize: "1.1rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }, children: [
                /* @__PURE__ */ jsx(Plus, { size: 20 }),
                " Novo Cliente"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { style: { overflowX: "auto" }, children: /* @__PURE__ */ jsxs("table", { style: { width: "100%", borderCollapse: "separate", borderSpacing: "0 12px" }, children: [
            /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("th", { style: { textAlign: "left", padding: "16px 24px", fontSize: "20px", fontWeight: 600, color: colors.textMuted }, children: "Nome do Cliente" }),
              /* @__PURE__ */ jsx("th", { style: { textAlign: "left", padding: "16px 24px", fontSize: "20px", fontWeight: 600, color: colors.textMuted }, children: "CPF" }),
              /* @__PURE__ */ jsx("th", { style: { textAlign: "left", padding: "16px 24px", fontSize: "20px", fontWeight: 600, color: colors.textMuted }, children: "WhatsApp" }),
              /* @__PURE__ */ jsx("th", { style: { textAlign: "left", padding: "16px 24px", fontSize: "20px", fontWeight: 600, color: colors.textMuted }, children: "Status" }),
              /* @__PURE__ */ jsx("th", { style: { textAlign: "center", padding: "16px 24px", fontSize: "20px", fontWeight: 600, color: colors.textMuted }, children: "Ações" })
            ] }) }),
            /* @__PURE__ */ jsx("tbody", { children: patientsList.map((p) => /* @__PURE__ */ jsxs("tr", { style: { background: "#f8fafc", borderRadius: 3, transition: "all 0.2s" }, children: [
              /* @__PURE__ */ jsx("td", { style: { padding: "24px", borderRadius: 3 }, children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 16 }, children: [
                /* @__PURE__ */ jsx("div", { style: { width: 44, height: 44, borderRadius: 3, background: colors.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: "1.2rem" }, children: p.name.charAt(0) }),
                /* @__PURE__ */ jsx("div", { style: { fontSize: "1.1rem", fontWeight: 600, color: colors.primary }, children: p.name })
              ] }) }),
              /* @__PURE__ */ jsx("td", { style: { padding: "24px", fontSize: "1.1rem", color: colors.textMuted, fontWeight: 500 }, children: p.cpf || "---.---.----00" }),
              /* @__PURE__ */ jsx("td", { style: { padding: "24px", fontSize: "1.1rem", color: colors.textMuted, fontWeight: 500 }, children: p.phone }),
              /* @__PURE__ */ jsx("td", { style: { padding: "24px" }, children: /* @__PURE__ */ jsx("span", { style: { background: colors.success + "20", color: colors.success, padding: "8px 16px", borderRadius: 3, fontSize: "0.9rem", fontWeight: 600 }, children: "Ativo" }) }),
              /* @__PURE__ */ jsx("td", { style: { padding: "24px", borderRadius: 3, textAlign: "center" }, children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 12, justifyContent: "center" }, children: [
                /* @__PURE__ */ jsx("button", { onClick: () => {
                  setSelectedPatientId(p.id);
                  setActiveTab("emr");
                }, style: { background: "#fff", border: "1px solid #e2e8f0", padding: "10px", borderRadius: 3, cursor: "pointer", color: colors.primary }, title: "Ver Prontuário", children: /* @__PURE__ */ jsx(FileText, { size: 20 }) }),
                /* @__PURE__ */ jsx("button", { onClick: () => {
                  setActiveChat(p);
                  setActiveTab("whatsapp");
                }, style: { background: "#fff", border: "1px solid #e2e8f0", padding: "10px", borderRadius: 3, cursor: "pointer", color: colors.success }, title: "Enviar Mensagem", children: /* @__PURE__ */ jsx(MessageSquare, { size: 20 }) })
              ] }) })
            ] }, p.id)) })
          ] }) })
        ] }) }, "contacts"),
        activeTab === "reports" && /* @__PURE__ */ jsxs(motion.div, { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 }, style: { display: "flex", flexDirection: "column", gap: 32 }, children: [
          /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }, children: [
            { label: "Faturamento Mensal", value: "R$ 84.500", trend: "+12%", color: colors.success },
            { label: "Taxa de Absenteísmo", value: "4.2%", trend: "-2.1%", color: colors.accent },
            { label: "NPS (Satisfação)", value: "9.8", trend: "+0.5", color: colors.warn },
            { label: "Perdas Financeiras", value: "R$ 1.200", trend: "-R$ 400", color: colors.danger }
          ].map((stat, i) => /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: "24px", border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 10px 30px rgba(0,0,0,0.02)" }, children: [
            /* @__PURE__ */ jsx("div", { style: { fontSize: "20px", fontWeight: 600, color: colors.textMuted, marginBottom: 12 }, children: stat.label }),
            /* @__PURE__ */ jsx("div", { style: { fontSize: "2.2rem", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: stat.value }),
            /* @__PURE__ */ jsxs("div", { style: { fontSize: "0.95rem", fontWeight: 600, color: stat.color }, children: [
              stat.trend,
              " em relação ao mês passado"
            ] })
          ] }, i)) }),
          /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "2fr 1fr", gap: 32 }, children: [
            /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: "32px", border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 10px 30px rgba(0,0,0,0.02)" }, children: [
              /* @__PURE__ */ jsx("h3", { style: { fontSize: "1.5rem", fontWeight: 600, color: colors.primary, marginBottom: 32 }, children: "Receita Diária (Semana)" }),
              /* @__PURE__ */ jsx("div", { style: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", height: "200px", padding: "0 20px" }, children: [40, 70, 45, 90, 65, 80, 50].map((h, i) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }, children: [
                /* @__PURE__ */ jsx(motion.div, { initial: { height: 0 }, animate: { height: `${h}%` }, transition: { duration: 1, delay: i * 0.1 }, style: { width: 40, background: colors.accent, borderRadius: 3, opacity: 0.8 } }),
                /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", fontWeight: 500, color: colors.textMuted }, children: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][i] })
              ] }, i)) })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: "32px", border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 10px 30px rgba(0,0,0,0.02)" }, children: [
              /* @__PURE__ */ jsx("h3", { style: { fontSize: "1.5rem", fontWeight: 600, color: colors.primary, marginBottom: 32, textAlign: "center" }, children: "Distribuição de Planos" }),
              /* @__PURE__ */ jsx("div", { style: { display: "flex", justifyContent: "center", marginBottom: 24 }, children: /* @__PURE__ */ jsxs("div", { style: { position: "relative", width: 160, height: 160 }, children: [
                /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 100 100", children: [
                  /* @__PURE__ */ jsx("circle", { cx: "50", cy: "50", r: "40", fill: "none", stroke: colors.success, strokeWidth: "20", strokeDasharray: "180 251", transform: "rotate(-90 50 50)" }),
                  /* @__PURE__ */ jsx("circle", { cx: "50", cy: "50", r: "40", fill: "none", stroke: colors.accent, strokeWidth: "20", strokeDasharray: "50 251", transform: "rotate(90 50 50)" }),
                  /* @__PURE__ */ jsx("circle", { cx: "50", cy: "50", r: "40", fill: "none", stroke: colors.warn, strokeWidth: "20", strokeDasharray: "21 251", transform: "rotate(140 50 50)" })
                ] }),
                /* @__PURE__ */ jsxs("div", { style: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }, children: [
                  /* @__PURE__ */ jsx("div", { style: { fontSize: "1.5rem", fontWeight: 700, color: colors.primary }, children: "342" }),
                  /* @__PURE__ */ jsx("div", { style: { fontSize: "0.75rem", fontWeight: 500, color: colors.textMuted }, children: "Clientes" })
                ] })
              ] }) }),
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "1.1rem", fontWeight: 600, color: colors.primary }, children: [
                  /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                    /* @__PURE__ */ jsx("div", { style: { width: 10, height: 10, borderRadius: "50%", background: colors.success } }),
                    " Particular"
                  ] }),
                  " ",
                  /* @__PURE__ */ jsx("span", { children: "72%" })
                ] }),
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "1.1rem", fontWeight: 600, color: colors.primary }, children: [
                  /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                    /* @__PURE__ */ jsx("div", { style: { width: 10, height: 10, borderRadius: "50%", background: colors.accent } }),
                    " Convênio SulAmérica"
                  ] }),
                  " ",
                  /* @__PURE__ */ jsx("span", { children: "20%" })
                ] }),
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "1.1rem", fontWeight: 600, color: colors.primary }, children: [
                  /* @__PURE__ */ jsxs("span", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
                    /* @__PURE__ */ jsx("div", { style: { width: 10, height: 10, borderRadius: "50%", background: colors.warn } }),
                    " Outros"
                  ] }),
                  " ",
                  /* @__PURE__ */ jsx("span", { children: "8%" })
                ] })
              ] })
            ] })
          ] })
        ] }, "reports"),
        activeTab === "settings" && /* @__PURE__ */ jsxs(motion.div, { initial: { opacity: 0, scale: 0.95 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1.05 }, style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }, children: [
          /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: 32, border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 15px 40px rgba(0,0,0,0.03)" }, children: [
            /* @__PURE__ */ jsxs("h3", { style: { fontSize: "1.5rem", fontWeight: 600, color: colors.primary, marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }, children: [
              /* @__PURE__ */ jsx(Settings, { size: 24, color: colors.accent }),
              " Perfil da Clínica"
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 20 }, children: [
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "Nome da Unidade" }),
                /* @__PURE__ */ jsx("input", { defaultValue: "Solara Connect - Matriz", style: { width: "100%", padding: "12px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none" } })
              ] }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "E-mail de Notificações" }),
                /* @__PURE__ */ jsx("input", { defaultValue: "contato@solaraestetica.online", style: { width: "100%", padding: "12px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none" } })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }, children: [
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "Telefone Comercial" }),
                  /* @__PURE__ */ jsx("input", { defaultValue: "(11) 99999-0000", style: { width: "100%", padding: "12px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none" } })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "CNPJ" }),
                  /* @__PURE__ */ jsx("input", { defaultValue: "00.000.000/0001-00", style: { width: "100%", padding: "12px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none" } })
                ] })
              ] }),
              /* @__PURE__ */ jsx("button", { style: { marginTop: 12, background: colors.primary, color: "#fff", border: "none", padding: "14px", borderRadius: 3, fontWeight: 600, fontSize: "1.1rem", cursor: "pointer" }, children: "Salvar Alterações" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 32 }, children: [
            /* @__PURE__ */ jsxs("div", { style: { background: colors.primary, borderRadius: 3, padding: 32, color: "#fff" }, children: [
              /* @__PURE__ */ jsxs("h3", { style: { fontSize: "1.4rem", fontWeight: 600, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }, children: [
                /* @__PURE__ */ jsx(Zap, { size: 20, color: colors.accent }),
                " Cérebro IA (Solara)"
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 20 }, children: [
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, fontSize: "1.1rem" }, children: "Automação de WhatsApp" }),
                    /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", opacity: 0.8 }, children: "IA responde agendamentos sozinha" })
                  ] }),
                  /* @__PURE__ */ jsx("div", { style: { width: 44, height: 24, background: colors.success, borderRadius: 3, position: "relative", cursor: "pointer" }, children: /* @__PURE__ */ jsx("div", { style: { width: 18, height: 18, background: "#fff", borderRadius: "50%", position: "absolute", right: 3, top: 3 } }) })
                ] }),
                /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                  /* @__PURE__ */ jsxs("div", { children: [
                    /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, fontSize: "1.1rem" }, children: "Análise de Churn" }),
                    /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", opacity: 0.8 }, children: "Detectar clientes em risco" })
                  ] }),
                  /* @__PURE__ */ jsx("div", { style: { width: 44, height: 24, background: colors.success, borderRadius: 3, position: "relative", cursor: "pointer" }, children: /* @__PURE__ */ jsx("div", { style: { width: 18, height: 18, background: "#fff", borderRadius: "50%", position: "absolute", right: 3, top: 3 } }) })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: 32, border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 15px 40px rgba(0,0,0,0.03)" }, children: [
              /* @__PURE__ */ jsxs("h3", { style: { fontSize: "1.5rem", fontWeight: 600, color: colors.primary, marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }, children: [
                /* @__PURE__ */ jsx(MessageSquare, { size: 24, color: colors.success }),
                " Conexão WhatsApp"
              ] }),
              /* @__PURE__ */ jsx("p", { style: { fontSize: "0.9rem", color: colors.textMuted, marginBottom: 24 }, children: "Conecte seu WhatsApp para habilitar as automações e o chat em tempo real." }),
              /* @__PURE__ */ jsx("div", { style: { background: "#f8fafc", padding: 24, borderRadius: 3, border: "1px solid #e2e8f0", textAlign: "center" }, children: whatsappStatus === "connected" ? /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }, children: [
                /* @__PURE__ */ jsx("div", { style: { width: 64, height: 64, borderRadius: "50%", background: `${colors.success}15`, display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ jsx(CheckCheck, { size: 32, color: colors.success }) }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("div", { style: { fontWeight: 700, fontSize: "1.2rem", color: colors.primary }, children: "WhatsApp Conectado" }),
                  /* @__PURE__ */ jsx("div", { style: { fontSize: "0.85rem", color: colors.success, fontWeight: 600 }, children: "Pronto para enviar mensagens" })
                ] }),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: handleDisconnectWhatsApp,
                    disabled: isSyncingWA,
                    style: { background: "transparent", border: `1px solid ${colors.danger}`, color: colors.danger, padding: "10px 20px", borderRadius: 3, fontWeight: 600, cursor: "pointer" },
                    children: "Desconectar Conta"
                  }
                )
              ] }) : /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: 20, alignItems: "center" }, children: qrCode ? /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }, children: [
                /* @__PURE__ */ jsx("div", { style: { background: "#fff", padding: 16, borderRadius: 3, boxShadow: "0 10px 20px rgba(0,0,0,0.05)" }, children: /* @__PURE__ */ jsx("img", { src: qrCode, alt: "WhatsApp QR Code", style: { width: 200, height: 200 } }) }),
                /* @__PURE__ */ jsxs("p", { style: { fontSize: "0.85rem", color: colors.textMuted, maxWidth: 250 }, children: [
                  "Abra o WhatsApp ",
                  ">",
                  " Configurações ",
                  ">",
                  " Aparelhos Conectados e escaneie o código."
                ] }),
                /* @__PURE__ */ jsx("button", { onClick: checkWhatsAppStatus, style: { background: colors.primary, color: "#fff", border: "none", padding: "10px 20px", borderRadius: 3, fontWeight: 600, cursor: "pointer" }, children: "Já escaneei" })
              ] }) : /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }, children: [
                /* @__PURE__ */ jsx("div", { style: { width: 64, height: 64, borderRadius: "50%", background: `${colors.textMuted}15`, display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ jsx(Zap, { size: 32, color: colors.textMuted }) }),
                /* @__PURE__ */ jsx("div", { style: { fontWeight: 700, fontSize: "1.1rem", color: colors.primary }, children: "Aguardando Conexão" }),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    onClick: handleConnectWhatsApp,
                    disabled: isSyncingWA,
                    style: { background: colors.success, color: "#fff", border: "none", padding: "12px 24px", borderRadius: 3, fontWeight: 700, cursor: "pointer", boxShadow: `0 8px 16px ${colors.success}30` },
                    children: isSyncingWA ? "Gerando QR Code..." : "Conectar Agora"
                  }
                )
              ] }) }) })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { background: "#fff", borderRadius: 3, padding: 32, border: "1px solid rgba(0,0,0,0.03)", boxShadow: "0 15px 40px rgba(0,0,0,0.03)" }, children: [
              /* @__PURE__ */ jsx("h3", { style: { fontSize: "1.1rem", fontWeight: 800, color: colors.primary, marginBottom: 16 }, children: "Personalização" }),
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 12 }, children: [
                ["#130f40", "#7ed6df", "#33d9b2", "#ffda79"].map((c) => /* @__PURE__ */ jsx("div", { style: { width: 32, height: 32, borderRadius: "50%", backgroundColor: c, border: "2px solid #fff", boxShadow: "0 4px 10px rgba(0,0,0,0.1)", cursor: "pointer" } }, c)),
                /* @__PURE__ */ jsx("div", { style: { width: 32, height: 32, borderRadius: "50%", border: "2px dashed #ccc", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }, children: "+" })
              ] })
            ] })
          ] })
        ] }, "settings")
      ] }) })
    ] }),
    /* @__PURE__ */ jsx(AnimatePresence, { children: showModal && /* @__PURE__ */ jsx("div", { style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(19, 15, 64, 0.6)", backdropFilter: "blur(10px)", zIndex: 1e3, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }, children: /* @__PURE__ */ jsxs(motion.div, { initial: { scale: 0.9, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.9, opacity: 0 }, style: { background: "#fff", width: "100%", maxWidth: "500px", borderRadius: 3, padding: "40px", position: "relative", boxShadow: "0 30px 60px -12px rgba(0,0,0,0.3)" }, children: [
      /* @__PURE__ */ jsx("button", { onClick: () => setShowModal(false), style: { position: "absolute", top: 24, right: 24, background: "#f1f5f9", border: "none", borderRadius: "50%", padding: 10, cursor: "pointer" }, children: /* @__PURE__ */ jsx(X, { size: 20, color: colors.primary }) }),
      /* @__PURE__ */ jsx("h2", { style: { fontSize: "1.8rem", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "Novo Agendamento" }),
      /* @__PURE__ */ jsx("p", { style: { color: colors.textMuted, marginBottom: 32, fontSize: "1.1rem" }, children: "Preencha os dados do cliente e confirme o consentimento LGPD." }),
      /* @__PURE__ */ jsxs("form", { onSubmit: handleSaveAppointment, style: { display: "flex", flexDirection: "column", gap: 20 }, children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "Nome Completo" }),
          /* @__PURE__ */ jsx("input", { type: "text", required: true, value: newPatient.name, onChange: (e) => setNewPatient({ ...newPatient, name: e.target.value }), placeholder: "Ex: João Silva", style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", fontSize: "1.1rem" } })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }, children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "WhatsApp / Telefone" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                value: newPatient.phone,
                onChange: (e) => {
                  let v = e.target.value.replace(/\D/g, "");
                  if (v.length <= 11) {
                    v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
                    v = v.replace(/(\d{5})(\d)/, "$1-$2");
                  }
                  setNewPatient({ ...newPatient, phone: v });
                },
                placeholder: "(00) 00000-0000",
                style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", fontSize: "1.1rem" }
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "CPF" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                value: newPatient.cpf,
                onChange: (e) => {
                  let v = e.target.value.replace(/\D/g, "");
                  v = v.replace(/(\d{3})(\d)/, "$1.$2");
                  v = v.replace(/(\d{3})(\d)/, "$1.$2");
                  v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
                  setNewPatient({ ...newPatient, cpf: v.substring(0, 14) });
                },
                placeholder: "000.000.000-00",
                style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", fontSize: "1.1rem" }
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }, children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "Idade" }),
            /* @__PURE__ */ jsx("input", { type: "number", value: newPatient.age, onChange: (e) => setNewPatient({ ...newPatient, age: e.target.value }), placeholder: "Ex: 30", style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", fontSize: "1.15rem" } })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "Data" }),
            /* @__PURE__ */ jsx("input", { type: "date", required: true, value: newAppointment.date, onChange: (e) => setNewAppointment({ ...newAppointment, date: e.target.value }), style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", fontSize: "1.15rem" } })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }, children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "Horário" }),
            /* @__PURE__ */ jsx("input", { type: "time", required: true, value: newAppointment.time, onChange: (e) => setNewAppointment({ ...newAppointment, time: e.target.value }), style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", fontSize: "1.15rem" } })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "Especialista" }),
            /* @__PURE__ */ jsxs("select", { value: newAppointment.doctor_id, onChange: (e) => setNewAppointment({ ...newAppointment, doctor_id: e.target.value }), style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", background: "#fff", fontSize: "1.15rem" }, children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Selecione..." }),
              specialistsList.map((s) => /* @__PURE__ */ jsx("option", { value: s.id, children: s.name }, s.id))
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }, children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "Plano / Convênio" }),
            /* @__PURE__ */ jsxs("select", { value: newPatient.insurance, onChange: (e) => setNewPatient({ ...newPatient, insurance: e.target.value }), style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", background: "#fff", fontSize: "1.15rem" }, children: [
              /* @__PURE__ */ jsx("option", { value: "Particular", children: "Particular" }),
              /* @__PURE__ */ jsx("option", { value: "SulAmérica", children: "SulAmérica" }),
              /* @__PURE__ */ jsx("option", { value: "Bradesco Saúde", children: "Bradesco Saúde" }),
              /* @__PURE__ */ jsx("option", { value: "Unimed", children: "Unimed" }),
              /* @__PURE__ */ jsx("option", { value: "Amil", children: "Amil" }),
              /* @__PURE__ */ jsx("option", { value: "Outros", children: "Outros" })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", {}),
          " "
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 12, alignItems: "flex-start", background: "#f8fafc", padding: "16px", borderRadius: 3, border: "1px solid #e2e8f0" }, children: [
          /* @__PURE__ */ jsx("input", { type: "checkbox", required: true, checked: newPatient.lgpd_consent, onChange: (e) => setNewPatient({ ...newPatient, lgpd_consent: e.target.checked }), style: { marginTop: 4, cursor: "pointer" }, id: "lgpd" }),
          /* @__PURE__ */ jsxs("label", { htmlFor: "lgpd", style: { fontSize: "0.8rem", color: colors.textMuted, cursor: "pointer", lineHeight: "1.4" }, children: [
            /* @__PURE__ */ jsx("strong", { children: "Termo de Consentimento LGPD:" }),
            " O cliente autoriza a coleta e tratamento de seus dados pessoais para fins de atendimento clínico e comunicações via WhatsApp conforme a Lei 13.709/18."
          ] })
        ] }),
        /* @__PURE__ */ jsx("button", { type: "submit", disabled: isLoading, style: { marginTop: 12, background: colors.primary, opacity: isLoading ? 0.7 : 1, color: "#fff", border: "none", padding: "16px", borderRadius: 3, fontWeight: 700, fontSize: "1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }, children: isLoading ? "Salvando..." : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Check, { size: 20 }),
          " Salvar Agendamento"
        ] }) })
      ] })
    ] }) }) }),
    /* @__PURE__ */ jsx(AnimatePresence, { children: showSpecialistModal && /* @__PURE__ */ jsx("div", { style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(19, 15, 64, 0.6)", backdropFilter: "blur(10px)", zIndex: 1e3, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }, children: /* @__PURE__ */ jsxs(motion.div, { initial: { scale: 0.9, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.9, opacity: 0 }, style: { background: "#fff", width: "100%", maxWidth: "500px", borderRadius: 3, padding: "40px", position: "relative", boxShadow: "0 30px 60px -12px rgba(0,0,0,0.3)" }, children: [
      /* @__PURE__ */ jsx("button", { onClick: () => setShowSpecialistModal(false), style: { position: "absolute", top: 24, right: 24, background: "#f1f5f9", border: "none", borderRadius: "50%", padding: 10, cursor: "pointer" }, children: /* @__PURE__ */ jsx(X, { size: 20, color: colors.primary }) }),
      /* @__PURE__ */ jsx("h2", { style: { fontSize: "1.8rem", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "Novo Especialista" }),
      /* @__PURE__ */ jsx("p", { style: { color: colors.textMuted, marginBottom: 32, fontSize: "1.1rem" }, children: "Adicione um novo médico à sua clínica." }),
      /* @__PURE__ */ jsxs("form", { onSubmit: handleSaveSpecialist, style: { display: "flex", flexDirection: "column", gap: 20 }, children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "Nome Completo" }),
          /* @__PURE__ */ jsx("input", { type: "text", required: true, value: newSpecialist.name, onChange: (e) => setNewSpecialist({ ...newSpecialist, name: e.target.value }), placeholder: "Ex: Dr. Paulo Silva", style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", fontSize: "1.15rem" } })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }, children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "Especialidade" }),
            /* @__PURE__ */ jsx("input", { type: "text", required: true, value: newSpecialist.specialty, onChange: (e) => setNewSpecialist({ ...newSpecialist, specialty: e.target.value }), placeholder: "Ex: Ortodontia", style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", fontSize: "1.15rem" } })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "CRM (Opcional)" }),
            /* @__PURE__ */ jsx("input", { type: "text", value: newSpecialist.crm, onChange: (e) => setNewSpecialist({ ...newSpecialist, crm: e.target.value }), placeholder: "Ex: 12345-SP", style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", fontSize: "1.15rem" } })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }, children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "E-mail (Opcional)" }),
            /* @__PURE__ */ jsx("input", { type: "email", value: newSpecialist.email, onChange: (e) => setNewSpecialist({ ...newSpecialist, email: e.target.value }), placeholder: "Ex: doutor@clinica.com", style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", fontSize: "1.15rem" } })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "20px", fontWeight: 600, color: colors.primary, marginBottom: 8 }, children: "WhatsApp / Emergência" }),
            /* @__PURE__ */ jsx("input", { type: "text", value: newSpecialist.phone, onChange: (e) => setNewSpecialist({ ...newSpecialist, phone: e.target.value }), placeholder: "(00) 00000-0000", style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", fontSize: "1.15rem" } })
          ] })
        ] }),
        /* @__PURE__ */ jsx("button", { type: "submit", disabled: isLoading, style: { marginTop: 12, background: colors.success, opacity: isLoading ? 0.7 : 1, color: "#fff", border: "none", padding: "16px", borderRadius: 3, fontWeight: 700, fontSize: "1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }, children: isLoading ? "Salvando..." : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Plus, { size: 20 }),
          " Salvar Especialista"
        ] }) })
      ] })
    ] }) }) }),
    /* @__PURE__ */ jsx(AnimatePresence, { children: showPrescriptionModal && /* @__PURE__ */ jsx("div", { style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(19, 15, 64, 0.6)", backdropFilter: "blur(10px)", zIndex: 1e3, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }, children: /* @__PURE__ */ jsxs(motion.div, { initial: { scale: 0.9, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.9, opacity: 0 }, style: { background: "#fff", width: "100%", maxWidth: "600px", borderRadius: 3, padding: "40px", position: "relative", boxShadow: "0 30px 60px -12px rgba(0,0,0,0.3)" }, children: [
      /* @__PURE__ */ jsx("button", { onClick: () => setShowPrescriptionModal(false), style: { position: "absolute", top: 24, right: 24, background: "#f1f5f9", border: "none", borderRadius: "50%", padding: 10, cursor: "pointer" }, children: /* @__PURE__ */ jsx(X, { size: 20, color: colors.primary }) }),
      /* @__PURE__ */ jsx("h2", { style: { fontSize: "1.8rem", fontWeight: 800, color: colors.primary, marginBottom: 8 }, children: "Nova Prescrição" }),
      /* @__PURE__ */ jsx("p", { style: { color: colors.textMuted, marginBottom: 32 }, children: "Emita receitas médicas de forma rápida e segura." }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 20 }, children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "0.9rem", fontWeight: 700, color: colors.primary, marginBottom: 8 }, children: "Medicamento" }),
          /* @__PURE__ */ jsx("input", { type: "text", placeholder: "Busque por princípio ativo ou nome comercial", style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none" } })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }, children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "0.9rem", fontWeight: 700, color: colors.primary, marginBottom: 8 }, children: "Posologia" }),
            /* @__PURE__ */ jsx("input", { type: "text", placeholder: "Ex: 1 comprimido a cada 8h", style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none" } })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("label", { style: { display: "block", fontSize: "0.9rem", fontWeight: 700, color: colors.primary, marginBottom: 8 }, children: "Duração" }),
            /* @__PURE__ */ jsx("input", { type: "text", placeholder: "Ex: 7 dias", style: { width: "100%", padding: "14px 16px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none" } })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("button", { onClick: () => {
          alert("Receita salva com sucesso!");
          setShowPrescriptionModal(false);
        }, style: { marginTop: 12, background: colors.success, color: "#fff", border: "none", padding: "16px", borderRadius: 3, fontWeight: 700, fontSize: "1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }, children: [
          /* @__PURE__ */ jsx(Plus, { size: 20 }),
          " Adicionar Medicamento e Salvar"
        ] })
      ] })
    ] }) }) }),
    /* @__PURE__ */ jsx(AnimatePresence, { children: showRecordModal && /* @__PURE__ */ jsx("div", { style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(19, 15, 64, 0.6)", backdropFilter: "blur(10px)", zIndex: 1e3, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }, children: /* @__PURE__ */ jsxs(motion.div, { initial: { scale: 0.9, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.9, opacity: 0 }, style: { background: "#fff", width: "100%", maxWidth: "500px", borderRadius: 3, padding: "40px", position: "relative", boxShadow: "0 30px 60px -12px rgba(0,0,0,0.3)" }, children: [
      /* @__PURE__ */ jsx("button", { onClick: () => setShowRecordModal(false), style: { position: "absolute", top: 24, right: 24, background: "#f1f5f9", border: "none", borderRadius: "50%", padding: 10, cursor: "pointer" }, children: /* @__PURE__ */ jsx(X, { size: 20, color: colors.primary }) }),
      /* @__PURE__ */ jsx("h2", { style: { fontSize: "1.8rem", fontWeight: 800, color: colors.primary, marginBottom: 8 }, children: "Selecionar Cliente" }),
      /* @__PURE__ */ jsx("p", { style: { color: colors.textMuted, marginBottom: 24 }, children: "Escolha o cliente para iniciar a evolução clínica." }),
      /* @__PURE__ */ jsxs("div", { style: { position: "relative", marginBottom: 20 }, children: [
        /* @__PURE__ */ jsx(Search, { size: 18, color: colors.textMuted, style: { position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" } }),
        /* @__PURE__ */ jsx(
          "input",
          {
            placeholder: "Buscar por nome ou CPF...",
            value: patientSearch,
            onChange: (e) => setPatientSearch(e.target.value),
            style: { width: "100%", padding: "14px 16px 14px 48px", borderRadius: 3, border: "1px solid #e2e8f0", outline: "none", background: "#f8fafc" }
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { style: { maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }, children: [
        patientsList.filter((p) => p.name.toLowerCase().includes(patientSearch.toLowerCase())).map((patient) => /* @__PURE__ */ jsxs(
          "div",
          {
            onClick: () => {
              setSelectedPatientId(patient.id);
              setShowRecordModal(false);
              setPatientSearch("");
            },
            style: { padding: "16px", borderRadius: 3, border: "1px solid #f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "all 0.2s" },
            onMouseEnter: (e) => e.currentTarget.style.background = "#f8fafc",
            onMouseLeave: (e) => e.currentTarget.style.background = "transparent",
            children: [
              /* @__PURE__ */ jsx("div", { style: { width: 40, height: 40, borderRadius: "50%", background: colors.accent + "20", color: colors.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }, children: patient.name.charAt(0) }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("div", { style: { fontWeight: 700, color: colors.primary }, children: patient.name }),
                /* @__PURE__ */ jsx("div", { style: { fontSize: "0.8rem", color: colors.textMuted }, children: patient.insurance || "Particular" })
              ] })
            ]
          },
          patient.id
        )),
        patientsList.length === 0 && /* @__PURE__ */ jsx("div", { style: { textAlign: "center", padding: "20px", color: colors.textMuted }, children: "Nenhum cliente cadastrado." })
      ] })
    ] }) }) }),
    /* @__PURE__ */ jsx(AnimatePresence, { children: showSignatureModal && /* @__PURE__ */ jsx("div", { style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(19, 15, 64, 0.6)", backdropFilter: "blur(10px)", zIndex: 1e3, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }, children: /* @__PURE__ */ jsxs(motion.div, { initial: { scale: 0.9, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.9, opacity: 0 }, style: { background: "#fff", width: "100%", maxWidth: "400px", borderRadius: 3, padding: "40px", position: "relative", boxShadow: "0 30px 60px -12px rgba(0,0,0,0.3)", textAlign: "center" }, children: [
      /* @__PURE__ */ jsx("button", { onClick: () => setShowSignatureModal(false), style: { position: "absolute", top: 24, right: 24, background: "#f1f5f9", border: "none", borderRadius: "50%", padding: 10, cursor: "pointer" }, children: /* @__PURE__ */ jsx(X, { size: 20, color: colors.primary }) }),
      /* @__PURE__ */ jsx("div", { style: { width: 64, height: 64, borderRadius: "50%", background: `${colors.primary}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }, children: /* @__PURE__ */ jsx(Check, { size: 32, color: colors.primary }) }),
      /* @__PURE__ */ jsx("h2", { style: { fontSize: "1.8rem", fontWeight: 600, color: colors.primary, marginBottom: 12 }, children: "Assinar Prontuário" }),
      /* @__PURE__ */ jsx("p", { style: { color: colors.textMuted, marginBottom: 32, fontSize: "1.1rem", lineHeight: 1.5 }, children: "Ao assinar digitalmente, este prontuário será fechado de acordo com as normas do CFM e LGPD." }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleSaveMedicalRecord,
          disabled: isLoading,
          style: { width: "100%", background: colors.primary, opacity: isLoading ? 0.7 : 1, color: "#fff", border: "none", padding: "16px", borderRadius: 3, fontWeight: 600, fontSize: "1.1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 },
          children: isLoading ? "Salvando..." : "Confirmar Assinatura"
        }
      )
    ] }) }) }),
    /* @__PURE__ */ jsxs("div", { style: { position: "fixed", bottom: isMobile ? 16 : 32, right: isMobile ? 16 : 32, zIndex: 2e3, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 16 }, children: [
      /* @__PURE__ */ jsx(AnimatePresence, { children: !showSolara && /* @__PURE__ */ jsxs(
        motion.button,
        {
          initial: { scale: 0 },
          animate: { scale: 1 },
          exit: { scale: 0 },
          whileHover: { scale: 1.1, boxShadow: `0 12px 30px ${colors.accent}60` },
          whileTap: { scale: 0.9 },
          onClick: () => setShowSolara(true),
          style: {
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: colors.primary,
            color: "#fff",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 8px 24px ${colors.primary}50`,
            position: "relative"
          },
          children: [
            /* @__PURE__ */ jsx(Zap, { size: 26, color: colors.accent }),
            /* @__PURE__ */ jsx("div", { style: { position: "absolute", top: -2, right: -2, width: 14, height: 14, borderRadius: "50%", background: colors.success, border: "2px solid #fff", boxShadow: `0 0 8px ${colors.success}` } })
          ]
        }
      ) }),
      /* @__PURE__ */ jsx(AnimatePresence, { children: showSolara && /* @__PURE__ */ jsxs(motion.div, { initial: { opacity: 0, y: 20, scale: 0.9 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 20, scale: 0.9 }, style: { width: isMobile ? "calc(100vw - 32px)" : 420, height: isMobile ? "min(610px, calc(100vh - 110px))" : 610, background: "#fff", borderRadius: 3, boxShadow: "0 25px 60px -12px rgba(19, 15, 64, 0.4)", border: "1px solid rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", overflow: "hidden" }, children: [
        /* @__PURE__ */ jsxs("div", { style: { background: colors.primary, padding: "24px", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12 }, children: [
            /* @__PURE__ */ jsx("div", { style: { width: 40, height: 40, background: colors.accent, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ jsx(Zap, { size: 24, color: colors.primary }) }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, fontSize: "1.2rem" }, children: "Solara AI" }),
              /* @__PURE__ */ jsx("div", { style: { fontSize: "0.9rem", color: colors.success, fontWeight: 600 }, children: "Online e Atenta" })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8 }, children: [
            /* @__PURE__ */ jsx("button", { onClick: () => setSolaraMessages([{ role: "assistant", content: SOLARA_WELCOME_MESSAGE }]), title: "Limpar Conversa", style: { background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 3, padding: 8, cursor: "pointer", color: "#fff" }, children: /* @__PURE__ */ jsx(Trash2, { size: 16 }) }),
            /* @__PURE__ */ jsx("button", { onClick: () => setShowSolara(false), title: "Fechar", style: { background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 3, padding: 8, cursor: "pointer", color: "#fff" }, children: /* @__PURE__ */ jsx(X, { size: 16 }) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { ref: solaraChatRef, style: { flex: 1, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, background: "#f8fafc" }, children: [
          solaraMessages.map((m, i) => /* @__PURE__ */ jsx("div", { style: { alignSelf: m.role === "assistant" ? "flex-start" : "flex-end", background: m.role === "assistant" ? "#fff" : colors.primary, color: m.role === "assistant" ? colors.primary : "#fff", padding: "12px 16px", borderRadius: 3, fontSize: "15px", fontWeight: 400, maxWidth: "85%", boxShadow: "0 4px 10px rgba(0,0,0,0.02)", border: m.role === "assistant" ? "1px solid rgba(0,0,0,0.05)" : "none" }, children: m.content }, i)),
          isSolaraSending && /* @__PURE__ */ jsx("div", { style: { alignSelf: "flex-start", background: "#fff", color: colors.textMuted, padding: "12px 16px", borderRadius: 3, fontSize: "15px", fontWeight: 400, maxWidth: "85%", boxShadow: "0 4px 10px rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.05)" }, children: "Solara está organizando a melhor resposta..." })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { padding: 16, borderTop: "1px solid rgba(0,0,0,0.05)", background: "#fff", display: "flex", gap: 10 }, children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              value: solaraInput,
              onChange: (e) => {
                setSolaraInput(e.target.value);
                if (voiceError) setVoiceError(null);
              },
              onKeyDown: (e) => e.key === "Enter" && handleVoiceSend(),
              placeholder: voiceError && voiceTarget === "solara" ? voiceError : isListening && voiceTarget === "solara" ? "Ouvindo... Fale agora" : isSolaraSending ? "Solara está respondendo..." : "Digite sua dúvida ou diga 'Solara'",
              disabled: isSolaraSending,
              style: { flex: 1, padding: "12px 16px", borderRadius: 3, border: voiceError && voiceTarget === "solara" ? "2px solid #ef4444" : isListening && voiceTarget === "solara" ? `2px solid ${colors.accent}` : "1px solid #e2e8f0", outline: "none", fontSize: "15px", transition: "all 0.3s" }
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              onClick: toggleVoice,
              title: "Comando de Voz",
              disabled: isSolaraSending,
              style: { background: isListening ? colors.accent : colors.bg, color: isListening ? colors.primary : colors.textMuted, border: "none", borderRadius: 3, padding: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.3s", position: "relative" },
              children: [
                /* @__PURE__ */ jsx(Mic, { size: 20, style: { animation: isListening ? "pulse 1.5s infinite" : "none" } }),
                isListening && voiceTarget === "solara" && /* @__PURE__ */ jsx("div", { style: { position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 2, alignItems: "flex-end", height: 10 }, children: [1, 2, 3, 4, 5].map((i) => /* @__PURE__ */ jsx("div", { style: { width: 2, background: colors.primary, height: `${Math.min(10, 2 + voiceVolume / 10 * i)}px`, transition: "height 0.1s" } }, i)) })
              ]
            }
          ),
          /* @__PURE__ */ jsx("button", { onClick: () => handleVoiceSend(), disabled: isSolaraSending, style: { background: colors.primary, opacity: isSolaraSending ? 0.7 : 1, color: "#fff", border: "none", borderRadius: 3, padding: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }, children: /* @__PURE__ */ jsx(Send, { size: 20 }) })
        ] })
      ] }) })
    ] })
  ] });
};
export {
  Dashboard as default
};
