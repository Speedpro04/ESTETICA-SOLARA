import { useState, useEffect, lazy, Suspense } from 'react';
import LandingPage from './LandingPage';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';
// Telas pós-autenticação carregadas sob demanda (reduz o bundle inicial).
const Dashboard = lazy(() => import('./Dashboard'));
const CheckoutPage = lazy(() => import('./CheckoutPage'));
import { logoutUser, getCurrentSession, getAccessInfo } from './lib/auth';
import { colors } from './brand/tokens';
import { supabase } from './lib/supabase';
import './index.css';

type ViewState = 'landing' | 'login' | 'register' | 'checkout' | 'dashboard';

interface SelectedPlan {
  name: string;
  price: string;
  slug: string;
  priceId: string;
}

function LazyFallback({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', backgroundColor: colors.inkDeep, fontFamily: "'Outfit', sans-serif"
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48, border: '3px solid rgba(224, 201, 166, 0.2)',
          borderTop: `3px solid ${colors.goldLight}`, borderRadius: '50%',
          animation: 'spin 1s linear infinite', margin: '0 auto 20px'
        }} />
        <p style={{ color: colors.goldLight, fontWeight: 600, fontSize: '1rem' }}>{label}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

function App() {
  // Começa na landing, não numa tela de carregamento. Duas razões: é ela que o
  // SSG grava no HTML (tela de "Carregando..." pré-renderizada não serve para
  // nada em busca), e visitante anônimo — a maioria absoluta de quem chega pela
  // busca — não espera checagem de sessão para ver a página.
  // Quem já tem sessão vê a landing por um instante antes de cair no painel.
  const [view, setView] = useState<ViewState>('landing');
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan>({
    name: 'Solara Estética — Anual',
    price: '397',
    slug: 'solara-anual',
    priceId: import.meta.env.VITE_STRIPE_PRICE_ANUAL || ''
  });
  const [clinicId, setClinicId] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [billingError, setBillingError] = useState('');
  const devPassEnabled = import.meta.env.VITE_ENABLE_DEV_PASS === 'true';
  const devPassClinicId = import.meta.env.VITE_DEV_PASS_CLINIC_ID || 'dev-clinic-maintenance';
  const devPassCode = import.meta.env.VITE_DEV_PASS_CODE || '';

  // Restaurar sessão ao carregar a página
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const checkoutSuccess = queryParams.get('checkout') === 'success';

    const restoreSession = async () => {
      try {
        const session = await getCurrentSession();
        if (session?.user) {
          const { data: userProfile } = await supabase
            .from('users')
            .select('clinic_id')
            .eq('auth_id', session.user.id)
            .single();

          if (userProfile?.clinic_id) {
            setClinicId(userProfile.clinic_id);
            setUserEmail(session.user.email || '');
            const acesso = await getAccessInfo(userProfile.clinic_id);
            if (!acesso.allowed) {
              setBillingError('Seu teste de 10 dias terminou. Assine para voltar a usar o painel.');
              setView('landing');
              return;
            }
            if (checkoutSuccess) {
              window.history.replaceState({}, document.title, "/");
            }
            
            setView('dashboard');
            return;
          }
        }
      } catch (err) {
        console.warn('Nenhuma sessão ativa:', err);
      }
      
      if (checkoutSuccess) {
        // Se pagou mas não achou a sessão (raro), tenta login ou mostra landing
        window.history.replaceState({}, document.title, "/");
      }
      setView('landing');
    };

    restoreSession();

    // Escutar mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setClinicId('');
        setUserEmail('');
        setView('landing');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleDevPass = () => {
    if (!devPassEnabled) return;
    const informedCode = window.prompt('Informe o código de manutenção');
    if (!informedCode || informedCode !== devPassCode) {
      alert('Código de manutenção inválido.');
      return;
    }
    setClinicId(devPassClinicId);
    setUserEmail('maintenance@solara.local');
    setView('dashboard');
  };

  const handleNavigateToRegister = (name: string, price: string, slug: string, priceId: string) => {
    setSelectedPlan({ name, price, slug, priceId });
    setView('register');
  };

  // Cadastro entrega o painel na hora: o teste de 10 dias sem cartão que a
  // landing vende começa aqui. O register_clinic já criou a assinatura como
  // 'trialing' com prazo. O checkout continua existindo, para quando a clínica
  // decidir assinar (ou quando o teste vencer).
  const handleRegisterSuccess = (newClinicId: string, email: string) => {
    setClinicId(newClinicId);
    setUserEmail(email);
    setBillingError('');
    setView('dashboard');
  };

  const handleLoginSuccess = async (loggedClinicId: string) => {
    const acesso = await getAccessInfo(loggedClinicId);
    if (!acesso.allowed) {
      setBillingError('Seu teste de 10 dias terminou. Assine para voltar a usar o painel.');
      setView('landing');
      return;
    }
    setClinicId(loggedClinicId);
    setBillingError('');
    setView('dashboard');
  };

  const handlePaymentSuccess = () => {
    setView('dashboard');
  };

  const handleLogout = async () => {
    await logoutUser();
    setClinicId('');
    setUserEmail('');
    setView('landing');
  };

  return (
    <div className="App">

      {/* ======= LANDING PAGE ======= */}
      {view === 'landing' && (
        <LandingPage
          onNavigateToLogin={() => setView('login')}
          onNavigateToRegister={handleNavigateToRegister}
        />
      )}
      {billingError && view === 'landing' && (
        <div style={{ position: 'fixed', bottom: 20, left: 20, right: 20, background: '#fff3cd', color: '#856404', border: '1px solid #ffeeba', padding: '12px 16px', borderRadius: 3, zIndex: 1000 }}>
          {billingError}
        </div>
      )}

      {/* ======= LOGIN ======= */}
      {view === 'login' && (
        <LoginPage 
          onBack={() => setView('landing')} 
          onLogin={handleLoginSuccess}
          onNavigateToRegister={() => setView('register')}
          onDevPass={handleDevPass}
        />
      )}

      {/* ======= CADASTRO ======= */}
      {view === 'register' && (
        <RegisterPage 
          onBack={() => setView('landing')} 
          onNavigateToLogin={() => setView('login')}
          onRegisterSuccess={handleRegisterSuccess}
          selectedPlanSlug={selectedPlan.slug}
        />
      )}

      {/* ======= CHECKOUT ======= */}
      {view === 'checkout' && (
        <Suspense fallback={<LazyFallback label="Abrindo checkout..." />}>
          <CheckoutPage
            planName={selectedPlan.name}
            planPrice={selectedPlan.price}
            priceId={selectedPlan.priceId}
            clinicId={clinicId}
            userEmail={userEmail}
            onBack={() => setView('register')}
            onPaymentSuccess={handlePaymentSuccess}
            onDevPass={handlePaymentSuccess}
          />
        </Suspense>
      )}

      {/* ======= DASHBOARD ======= */}
      {view === 'dashboard' && (
        <Suspense fallback={<LazyFallback label="Carregando seu painel..." />}>
          <Dashboard onLogout={handleLogout} clinicId={clinicId} />
        </Suspense>
      )}
    </div>
  );
}

export default App;
