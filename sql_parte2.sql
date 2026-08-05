-- ============================================
-- SOLARA MEDICAL — PARTE 2: RLS POLICIES
-- Rode DEPOIS da Parte 1
-- ============================================

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON plans FOR SELECT USING (true);

ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinics_owner_all" ON clinics FOR ALL USING (owner_auth_id = auth.uid());
CREATE POLICY "clinics_insert_authenticated" ON clinics FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_self_insert" ON users FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "users_same_clinic" ON users FOR SELECT USING (
    clinic_id IN (SELECT u.clinic_id FROM users u WHERE u.auth_id = auth.uid())
);

ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patients_clinic_access" ON patients FOR ALL USING (
    clinic_id IN (SELECT u.clinic_id FROM users u WHERE u.auth_id = auth.uid())
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointments_clinic_access" ON appointments FOR ALL USING (
    clinic_id IN (SELECT u.clinic_id FROM users u WHERE u.auth_id = auth.uid())
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_insert_auth" ON subscriptions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "subscriptions_clinic_owner" ON subscriptions FOR ALL USING (
    clinic_id IN (SELECT c.id FROM clinics c WHERE c.owner_auth_id = auth.uid())
);

ALTER TABLE onboarding_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tokens_insert_auth" ON onboarding_tokens FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "tokens_read_own" ON onboarding_tokens FOR SELECT USING (
    email = (SELECT au.email FROM auth.users au WHERE au.id = auth.uid())
);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_logs_insert_auth" ON email_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "email_logs_clinic_owner" ON email_logs FOR ALL USING (
    clinic_id IN (SELECT c.id FROM clinics c WHERE c.owner_auth_id = auth.uid())
);
