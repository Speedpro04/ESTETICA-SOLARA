import { supabase } from './supabase';

// =============================================
// TIPOS
// =============================================
export interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  min_specialists: number;
  max_specialists: number | null;
  features: string[];
  is_highlighted: boolean;
  active: boolean;
  display_order: number;
  stripe_price_id: string | null;
}

export interface RegisterData {
  clinicName: string;
  email: string;
  password: string;
  planSlug: string;
  phone: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface SessionUser {
  id: string;
  email: string;
  clinicId: string;
  clinicName: string;
  role: string;
  planName: string;
}

export type SubscriptionStatus = 'active' | 'trialing' | 'pending' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';

// =============================================
// PLANOS
// =============================================
export async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('active', true)
    .order('display_order', { ascending: true });

  if (error) throw new Error(`Erro ao carregar planos: ${error.message}`);
  return data || [];
}

// =============================================
// CADASTRO (Register)
// =============================================
export async function registerClinic(data: RegisterData): Promise<{ userId: string; clinicId: string; tempPassword: string }> {
  const tempPassword = data.password || generateTempPassword();

  // 1. Criar usuário no Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: tempPassword,
    options: {
      data: {
        clinic_name: data.clinicName,
        phone: data.phone,
        role: 'owner'
      }
    }
  });

  if (authError) {
    // Traduzir erros comuns do Supabase para português
    if (authError.message.includes('rate limit') || authError.message.includes('email rate')) {
      throw new Error('Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.');
    }
    if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
      throw new Error('Este e-mail já está cadastrado. Tente fazer login ou recupere sua senha.');
    }
    if (authError.message.includes('invalid email')) {
      throw new Error('O e-mail informado não é válido.');
    }
    if (authError.message.includes('weak password') || authError.message.includes('at least')) {
      throw new Error('A senha precisa ter pelo menos 6 caracteres.');
    }
    throw new Error(`Erro ao criar conta: ${authError.message}`);
  }
  if (!authData.user) throw new Error('Falha ao criar usuário');

  const authUserId = authData.user.id;

  // 2. Chamar função SQL segura (SECURITY DEFINER) que bypassa RLS
  const { data: result, error: rpcError } = await supabase.rpc('register_clinic', {
    p_auth_id: authUserId,
    p_clinic_name: data.clinicName,
    p_email: data.email,
    p_plan_slug: data.planSlug,
    p_phone: data.phone
  });

  if (rpcError) throw new Error(`Erro ao criar clínica: ${rpcError.message}`);

  return { userId: authUserId, clinicId: result.clinic_id, tempPassword };
}

// =============================================
// LOGIN
// =============================================
export async function loginUser(data: LoginData): Promise<SessionUser> {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password
  });

  if (authError) {
    if (authError.message.includes('Invalid login') || authError.message.includes('invalid_credentials')) {
      throw new Error('E-mail ou senha incorretos. Verifique e tente novamente.');
    }
    if (authError.message.includes('Email not confirmed')) {
      throw new Error('Confirme seu e-mail antes de fazer login. Verifique sua caixa de entrada.');
    }
    throw new Error(`Erro no login: ${authError.message}`);
  }
  if (!authData.user) throw new Error('Falha no login');

  // Buscar perfil do usuário
  const { data: userProfile, error: profileError } = await supabase
    .from('users')
    .select(`
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
    `)
    .eq('auth_id', authData.user.id)
    .single();

  if (profileError || !userProfile) {
    throw new Error('Perfil do usuário não encontrado. Contate o suporte.');
  }

  const clinic = userProfile.clinics as any;

  return {
    id: userProfile.id,
    email: userProfile.email,
    clinicId: clinic?.id || '',
    clinicName: clinic?.name || '',
    role: userProfile.role,
    planName: clinic?.plans?.name || ''
  };
}

// =============================================
// BILLING ACCESS
// =============================================
export interface AccessInfo {
  /** Libera o painel. */
  allowed: boolean;
  /** Verdadeiro enquanto o teste de 10 dias está valendo. */
  trial: boolean;
  /** Dias inteiros restantes de teste (0 quando não há teste em curso). */
  trialDaysLeft: number;
}

/**
 * Decide se a clínica entra no painel.
 *
 * 'trialing' vale só até `trial_ends_at`. Sem essa checagem o teste de 10 dias
 * seria vitalício — o banco não expira o registro sozinho.
 */
export async function getAccessInfo(clinicId: string): Promise<AccessInfo> {
  const negado: AccessInfo = { allowed: false, trial: false, trialDaysLeft: 0 };

  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, trial_ends_at, created_at')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return negado;

  const status = String(data.status || '').toLowerCase() as SubscriptionStatus;
  if (status === 'active') return { allowed: true, trial: false, trialDaysLeft: 0 };
  if (status !== 'trialing') return negado;

  // Trial sem data de fim é dado inconsistente: trata como expirado em vez de
  // liberar acesso indefinido.
  if (!data.trial_ends_at) return negado;

  const fim = new Date(data.trial_ends_at).getTime();
  const restanteMs = fim - Date.now();
  if (restanteMs <= 0) return negado;

  return {
    allowed: true,
    trial: true,
    trialDaysLeft: Math.ceil(restanteMs / (1000 * 60 * 60 * 24))
  };
}

/** Atalho para os pontos que só precisam do sim/não. */
export async function hasActiveSubscription(clinicId: string): Promise<boolean> {
  return (await getAccessInfo(clinicId)).allowed;
}

/**
 * Headers de autenticação para chamadas ao backend (FastAPI).
 * Os endpoints protegidos exigem o JWT do Supabase no Authorization.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// =============================================
// ATIVAR ASSINATURA (após pagamento)
// =============================================
export async function activateSubscription(clinicId: string, stripePaymentIntentId?: string): Promise<void> {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      stripe_payment_intent_id: stripePaymentIntentId || null,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString()
    })
    .eq('clinic_id', clinicId)
    .eq('status', 'pending');

  if (error) throw new Error(`Erro ao ativar assinatura: ${error.message}`);

  // Marcar onboarding como concluído
  await supabase
    .from('clinics')
    .update({ onboarding_completed: true })
    .eq('id', clinicId);
}

// =============================================
// REGISTRAR ENVIO DE E-MAIL
// =============================================
export async function logEmailSent(params: {
  clinicId: string;
  toEmail: string;
  subject: string;
  template: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await supabase.from('email_logs').insert({
    clinic_id: params.clinicId,
    to_email: params.toEmail,
    from_email: 'contato@solaraestetica.online',
    subject: params.subject,
    template: params.template,
    status: 'sent',
    metadata: params.metadata || {}
  });
}

// =============================================
// LOGOUT
// =============================================
export async function logoutUser(): Promise<void> {
  await supabase.auth.signOut();
}

// =============================================
// SESSÃO ATUAL
// =============================================
export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// =============================================
// HELPERS
// =============================================
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

