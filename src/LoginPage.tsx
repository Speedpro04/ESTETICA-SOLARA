import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, LockKeyhole, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { LogoMarca } from './Logo';
import { loginUser } from './lib/auth';
import { supabase } from './lib/supabase';
import { authColors } from './brand/tokens';
import { useViewport } from './lib/useViewport';

interface LoginPageProps {
  onLogin: (clinicId: string) => Promise<void> | void;
  onBack: () => void;
  onNavigateToRegister: () => void;
  onDevPass: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onBack, onNavigateToRegister, onDevPass }) => {
  const { isMobile, isTablet } = useViewport();
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [passFocus, setPassFocus] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Estado para "Esqueci a senha"
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetFocus, setResetFocus] = useState(false);

  const colors = authColors;
  const devPassEnabled = true; // Forçado para manutenção e testes do cliente

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.email.trim()) { setError('Informe o e-mail'); return; }
    if (!formData.password) { setError('Informe a senha'); return; }

    setIsLoading(true);
    try {
      const user = await loginUser({ email: formData.email, password: formData.password });
      await onLogin(user.clinicId);
    } catch (err: any) {
      setError(err.message || 'E-mail ou senha incorretos.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) { setError('Informe o e-mail para recuperação'); return; }
    
    setResetLoading(true);
    setError('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin
      });
      if (resetError) throw resetError;
      setResetSent(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar e-mail de recuperação.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: colors.bgRight, fontFamily: "'Outfit', sans-serif", overflow: 'hidden' }}>
      
      {/* LEFT PANEL — no celular ocupa a tela inteira; o minWidth de 400px
          estourava a viewport de 375px e cortava o formulário. */}
      <div style={{ width: isTablet ? '100%' : '35%', minWidth: isTablet ? 0 : '400px', backgroundColor: colors.bgLeft, padding: isMobile ? '24px 20px' : '40px 60px', display: 'flex', flexDirection: 'column', borderRight: isTablet ? 'none' : '1px solid rgba(255,255,255,0.02)', zIndex: 10 }}>

        <button onClick={showResetForm ? () => { setShowResetForm(false); setResetSent(false); setError(''); } : onBack} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', marginBottom: 'auto' }}>
          <ArrowLeft size={16} /> {showResetForm ? 'Voltar ao Login' : 'Voltar'}
        </button>

        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '340px', margin: '0 auto' }}>
          <div style={{ marginBottom: 24, marginTop: 16, display: 'flex', justifyContent: 'center' }}>
            <LogoMarca width={isMobile ? 160 : 200} />
          </div>

          {/* ===== FORMULÁRIO DE RESET DE SENHA ===== */}
          {showResetForm ? (
            <>
              <p style={{ textAlign: 'center', fontSize: '0.85rem', color: colors.textMuted, marginBottom: 32, lineHeight: 1.6 }}>
                {resetSent 
                  ? 'Um link de recuperação foi enviado para o seu e-mail.' 
                  : 'Informe seu e-mail cadastrado e enviaremos um link para redefinir sua senha.'}
              </p>

              {resetSent ? (
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ textAlign: 'center', width: '100%' }}>
                  <div style={{ width: 64, height: 64, background: `${colors.success}20`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <CheckCircle2 size={32} color={colors.success} />
                  </div>
                  <p style={{ color: colors.success, fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>E-mail enviado!</p>
                  <p style={{ color: colors.textMuted, fontSize: '0.85rem', marginBottom: 32 }}>Verifique sua caixa de entrada e spam.</p>
                  <button onClick={() => { setShowResetForm(false); setResetSent(false); }} style={{ width: '100%', background: colors.cta, border: 'none', padding: '16px', borderRadius: 3, color: '#ffffff', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
                    Voltar ao Login
                  </button>
                </motion.div>
              ) : (
                <form style={{ width: '100%' }} onSubmit={handleResetPassword}>
                  {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ width: '100%', background: `${colors.danger}20`, border: `1px solid ${colors.danger}50`, borderRadius: 3, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem', color: colors.danger }}>
                      <AlertCircle size={18} /> {error}
                    </motion.div>
                  )}
                  <div style={{ marginBottom: 32 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: colors.cyan, marginBottom: 8, fontWeight: 600 }}>E-mail cadastrado</label>
                    <div style={{ position: 'relative' }}>
                      <Mail size={18} color={resetFocus ? colors.cyan : colors.textMuted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', transition: 'color 0.3s' }} />
                      <input type="email" placeholder="seu@email.com" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} onFocus={() => setResetFocus(true)} onBlur={() => setResetFocus(false)} style={{ width: '100%', backgroundColor: colors.inputBg, border: `1px solid ${resetFocus ? colors.cyan : colors.cyanDark}`, borderRadius: 3, padding: '14px 14px 14px 44px', color: '#ffffff', fontSize: '0.95rem', outline: 'none', transition: 'all 0.3s', boxShadow: resetFocus ? `0 0 0 3px ${colors.cyan}20` : 'none' }} />
                    </div>
                  </div>
                  <motion.button disabled={resetLoading} whileHover={!resetLoading ? { scale: 1.02 } : {}} type="submit" style={{ width: '100%', background: resetLoading ? colors.inputBg : colors.cta, border: resetLoading ? `1px solid ${colors.cyan}` : 'none', padding: '16px', borderRadius: 3, color: resetLoading ? colors.cyan : '#ffffff', fontWeight: 700, fontSize: '1.05rem', cursor: resetLoading ? 'wait' : 'pointer' }}>
                    {resetLoading ? 'Enviando...' : 'Enviar Link de Recuperação'}
                  </motion.button>
                </form>
              )}
            </>
          ) : (
            /* ===== FORMULÁRIO DE LOGIN ===== */
            <>
              <p style={{ textAlign: 'center', fontSize: '0.85rem', color: colors.textMuted, marginBottom: 40, lineHeight: 1.6 }}>
                Sistema seguro com criptografia de ponta a ponta. Seus dados protegidos com a mais alta tecnologia.
              </p>

              {error && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ width: '100%', background: `${colors.danger}20`, border: `1px solid ${colors.danger}50`, borderRadius: 3, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem', color: colors.danger }}>
                  <AlertCircle size={18} /> {error}
                </motion.div>
              )}

              <form style={{ width: '100%' }} onSubmit={handleSubmit}>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: colors.cyan, marginBottom: 8, fontWeight: 600 }}>E-mail</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={18} color={emailFocus ? colors.cyan : colors.textMuted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', transition: 'color 0.3s' }} />
                    <input type="email" placeholder="seu@email.com" value={formData.email} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} onFocus={() => setEmailFocus(true)} onBlur={() => setEmailFocus(false)} style={{ width: '100%', backgroundColor: colors.inputBg, border: `1px solid ${emailFocus ? colors.cyan : colors.cyanDark}`, borderRadius: 3, padding: '14px 14px 14px 44px', color: '#ffffff', fontSize: '0.95rem', outline: 'none', transition: 'all 0.3s', boxShadow: emailFocus ? `0 0 0 3px ${colors.cyan}20` : 'none' }} />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: colors.cyan, marginBottom: 8, fontWeight: 600 }}>Senha</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={18} color={passFocus ? colors.cyan : colors.textMuted} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', transition: 'color 0.3s' }} />
                    <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={formData.password} onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))} onFocus={() => setPassFocus(true)} onBlur={() => setPassFocus(false)} style={{ width: '100%', backgroundColor: colors.inputBg, border: `1px solid ${passFocus ? colors.cyan : colors.cyanDark}`, borderRadius: 3, padding: '14px 44px', color: '#ffffff', fontSize: '1rem', outline: 'none', letterSpacing: showPassword ? 'normal' : '3px', transition: 'all 0.3s', boxShadow: passFocus ? `0 0 0 3px ${colors.cyan}20` : 'none' }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      {showPassword ? <EyeOff size={18} color={colors.textMuted} /> : <Eye size={18} color={colors.textMuted} />}
                    </button>
                  </div>
                </div>

                <div style={{ textAlign: 'right', marginBottom: 32 }}>
                  <button type="button" onClick={() => { setShowResetForm(true); setError(''); }} style={{ background: 'none', border: 'none', color: colors.cyan, fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500, padding: 0 }}>
                    Esqueceu a senha?
                  </button>
                </div>

                <motion.button disabled={isLoading} whileHover={!isLoading ? { scale: 1.02 } : {}} whileTap={!isLoading ? { scale: 0.98 } : {}} type="submit" style={{ width: '100%', background: isLoading ? colors.inputBg : colors.cta, border: isLoading ? `1px solid ${colors.cyan}` : 'none', padding: '16px', borderRadius: 3, color: isLoading ? colors.cyan : '#ffffff', fontWeight: 700, fontSize: '1.05rem', cursor: isLoading ? 'wait' : 'pointer', marginBottom: 32, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                  {isLoading ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                      <LockKeyhole size={20} />
                    </motion.div>
                  ) : 'Entrar'}
                </motion.button>

                <div style={{ textAlign: 'center', fontSize: '0.9rem', color: colors.textMuted }}>
                  Não tem conta? <button type="button" onClick={onNavigateToRegister} style={{ background: 'none', border: 'none', color: colors.cyan, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Cadastrar</button>
                </div>

                {/* Dev Pass (Subtle) */}
                {devPassEnabled && (
                  <div style={{ marginTop: 20, textAlign: 'center' }}>
                    <button type="button" onClick={onDevPass} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem', cursor: 'pointer' }}>Passe Livre</button>
                  </div>
                )}
              </form>
            </>
          )}
        </motion.div>
        
        <div style={{ marginTop: 'auto' }}></div>
      </div>

      {/* RIGHT PANEL — painel decorativo. Sai de cena até 1024px: em tela
          estreita ele só empurraria o formulário para fora da dobra. */}
      {!isTablet && (
        <div style={{ width: '65%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', padding: '0 40px' }}>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8, ease: "easeOut" }} style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 180, height: 180, background: 'rgba(224, 201, 166, 0.06)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 40, border: `1px solid ${colors.cyan}30` }}>
              <LockKeyhole size={90} color={colors.cyan} strokeWidth={1.5} />
            </div>
            <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', color: colors.cyan, marginBottom: 20, fontWeight: 800, letterSpacing: '-0.02em', textAlign: 'center' }}>
              {showResetForm ? 'Recuperar Acesso' : 'Segurança Máxima'}
            </h2>
            <p style={{ textAlign: 'center', color: '#a0a0a0', maxWidth: 450, fontSize: '1.2rem', lineHeight: 1.6, fontWeight: 400 }}>
              {showResetForm
                ? 'Enviaremos um link seguro para o e-mail cadastrado na sua clínica.'
                : 'Seus dados protegidos com criptografia de última geração e autenticação segura.'}
            </p>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
