import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ArrowLeft, Building2, UserPlus, AlertCircle, Phone } from 'lucide-react';
import Logo from './Logo';
import { registerClinic } from './lib/auth';
import { authColors } from './brand/tokens';

interface RegisterPageProps {
  onRegisterSuccess: (clinicId: string, email: string) => void;
  onBack: () => void;
  onNavigateToLogin: () => void;
  selectedPlanSlug?: string;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ onRegisterSuccess, onBack, onNavigateToLogin, selectedPlanSlug = 'avancado' }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [focusState, setFocusState] = useState({ name: false, email: false, pass: false, phone: false });
  const [formData, setFormData] = useState({ clinicName: '', email: '', password: '', phone: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const colors = authColors;

  const setFocus = (field: string, value: boolean) => {
    setFocusState(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.clinicName.trim()) { setError('Informe o nome da clínica'); return; }
    if (!formData.email.trim()) { setError('Informe o e-mail'); return; }
    if (formData.password.length < 6) { setError('A senha deve ter no mínimo 6 caracteres'); return; }

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
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: colors.bgRight, fontFamily: "'Outfit', sans-serif", overflow: 'hidden' }}>
      
      {/* LEFT PANEL */}
      <div style={{ width: '35%', minWidth: '400px', backgroundColor: colors.bgLeft, padding: '40px 60px', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.02)', boxShadow: '10px 0 30px rgba(0,0,0,0.5)', zIndex: 10 }}>
        
        <button onClick={onBack} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', marginBottom: 'auto' }}>
          <ArrowLeft size={16} /> Voltar
        </button>

        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '340px', margin: '0 auto' }}>
          <div style={{ marginBottom: 24, marginTop: 16, display: 'flex', justifyContent: 'center', transform: 'scale(1.15)' }}>
            <Logo size={48} variant="light" />
          </div>
          
          <p style={{ textAlign: 'center', fontSize: '0.85rem', color: colors.textMuted, marginBottom: 32, lineHeight: 1.6 }}>
            Crie a conta da sua clínica agora e transforme o atendimento aos seus clientes.
          </p>

          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ width: '100%', background: `${colors.danger}20`, border: `1px solid ${colors.danger}50`, borderRadius: 3, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem', color: colors.danger }}>
              <AlertCircle size={18} /> {error}
            </motion.div>
          )}

          <form style={{ width: '100%' }} onSubmit={handleSubmit}>
            {/* Nome da Clínica */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: colors.cyan, marginBottom: 8, fontWeight: 600 }}>Nome da Clínica</label>
              <div style={{ position: 'relative' }}>
                <Building2 size={18} color={focusState.name ? colors.cyan : colors.textMuted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', transition: 'color 0.3s' }} />
                <input type="text" placeholder="Sua Clínica" value={formData.clinicName} onChange={(e) => setFormData(p => ({ ...p, clinicName: e.target.value }))} onFocus={() => setFocus('name', true)} onBlur={() => setFocus('name', false)} style={{ width: '100%', backgroundColor: colors.inputBg, border: `1px solid ${focusState.name ? colors.cyan : colors.cyanDark}`, borderRadius: 3, padding: '14px 14px 14px 44px', color: '#ffffff', fontSize: '0.95rem', outline: 'none', transition: 'all 0.3s', boxShadow: focusState.name ? `0 0 0 3px ${colors.cyan}20` : 'none' }} />
              </div>
            </div>

            {/* WhatsApp / Telefone */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: colors.cyan, marginBottom: 8, fontWeight: 600 }}>WhatsApp / Telefone</label>
              <div style={{ position: 'relative' }}>
                <Phone size={18} color={focusState.phone ? colors.cyan : colors.textMuted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', transition: 'color 0.3s' }} />
                <input type="text" placeholder="(00) 00000-0000" value={formData.phone} onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))} onFocus={() => setFocus('phone', true)} onBlur={() => setFocus('phone', false)} style={{ width: '100%', backgroundColor: colors.inputBg, border: `1px solid ${focusState.phone ? colors.cyan : colors.cyanDark}`, borderRadius: 3, padding: '14px 14px 14px 44px', color: '#ffffff', fontSize: '0.95rem', outline: 'none', transition: 'all 0.3s', boxShadow: focusState.phone ? `0 0 0 3px ${colors.cyan}20` : 'none' }} />
              </div>
            </div>

            {/* Email */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: colors.cyan, marginBottom: 8, fontWeight: 600 }}>E-mail</label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} color={focusState.email ? colors.cyan : colors.textMuted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', transition: 'color 0.3s' }} />
                <input type="email" placeholder="contato@clinica.com" value={formData.email} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} onFocus={() => setFocus('email', true)} onBlur={() => setFocus('email', false)} style={{ width: '100%', backgroundColor: colors.inputBg, border: `1px solid ${focusState.email ? colors.cyan : colors.cyanDark}`, borderRadius: 3, padding: '14px 14px 14px 44px', color: '#ffffff', fontSize: '0.95rem', outline: 'none', transition: 'all 0.3s', boxShadow: focusState.email ? `0 0 0 3px ${colors.cyan}20` : 'none' }} />
              </div>
            </div>

            {/* Senha */}
            <div style={{ marginBottom: 32 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: colors.cyan, marginBottom: 8, fontWeight: 600 }}>Senha</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color={focusState.pass ? colors.cyan : colors.textMuted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', transition: 'color 0.3s' }} />
                <input type={showPassword ? 'text' : 'password'} placeholder="Mínimo 6 caracteres" value={formData.password} onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))} onFocus={() => setFocus('pass', true)} onBlur={() => setFocus('pass', false)} style={{ width: '100%', backgroundColor: colors.inputBg, border: `1px solid ${focusState.pass ? colors.cyan : colors.cyanDark}`, borderRadius: 3, padding: '14px 44px', color: '#ffffff', fontSize: '1rem', outline: 'none', letterSpacing: showPassword ? 'normal' : '3px', transition: 'all 0.3s', boxShadow: focusState.pass ? `0 0 0 3px ${colors.cyan}20` : 'none' }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {showPassword ? <EyeOff size={18} color={colors.textMuted} /> : <Eye size={18} color={colors.textMuted} />}
                </button>
              </div>
            </div>

            <motion.button disabled={isLoading} whileHover={!isLoading ? { scale: 1.02, boxShadow: `0 10px 25px ${colors.cyan}50` } : {}} whileTap={!isLoading ? { scale: 0.98 } : {}} type="submit" style={{ width: '100%', background: isLoading ? colors.inputBg : `linear-gradient(to right, ${colors.cyan}, #00a8ff)`, border: isLoading ? `1px solid ${colors.cyan}` : 'none', padding: '16px', borderRadius: 3, color: isLoading ? colors.cyan : '#ffffff', fontWeight: 700, fontSize: '1.05rem', cursor: isLoading ? 'wait' : 'pointer', marginBottom: 32, boxShadow: isLoading ? 'none' : `0 8px 20px ${colors.cyan}40`, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
              {isLoading ? (
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                  <Building2 size={20} />
                </motion.div>
              ) : 'Criar Conta e Prosseguir'}
            </motion.button>

            <div style={{ textAlign: 'center', fontSize: '0.9rem', color: colors.textMuted }}>
              Já possui conta? <button type="button" onClick={onNavigateToLogin} style={{ background: 'none', border: 'none', color: colors.cyan, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Fazer Login</button>
            </div>
          </form>
        </motion.div>
        
        <div style={{ marginTop: 'auto' }}></div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ width: '65%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: '800px', height: '800px', background: `radial-gradient(circle, ${colors.cyan}15 0%, rgba(0,0,0,0) 60%)`, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 0 }}></div>
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8, ease: "easeOut" }} style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 180, height: 180, background: 'rgba(126, 214, 223, 0.08)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 40, boxShadow: `0 0 60px ${colors.cyan}20, inset 0 0 30px ${colors.cyan}10`, border: `1px solid ${colors.cyan}30`, backdropFilter: 'blur(10px)' }}>
            <UserPlus size={90} color={colors.cyan} strokeWidth={1.5} style={{ filter: `drop-shadow(0 0 15px ${colors.cyan})` }} />
          </div>
          <h2 style={{ fontSize: '3rem', color: colors.cyan, marginBottom: 20, fontWeight: 800, letterSpacing: '-0.02em', textShadow: `0 0 30px ${colors.cyan}40` }}>Junte-se à Revolução</h2>
          <p style={{ textAlign: 'center', color: '#a0a0a0', maxWidth: 450, fontSize: '1.2rem', lineHeight: 1.6, fontWeight: 400 }}>Centenas de clínicas já automatizaram suas recepções com a tecnologia Solara.</p>
        </motion.div>
      </div>
    </div>
  );
};

export default RegisterPage;
