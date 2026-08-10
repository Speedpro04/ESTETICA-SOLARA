-- =============================================================================
-- 10 — CADASTRO DE CLÍNICA
-- =============================================================================
-- O app cria a conta no Supabase Auth e depois chama esta função para montar a
-- clínica. São dois passos porque o Auth vive noutro schema — e é justamente aí
-- que mora o modo de falha: se o segundo passo não existir ou falhar, sobra uma
-- conta que loga e cai num painel sem clínica nenhuma. Parece bug de dados, mas
-- é cadastro pela metade.
--
-- SECURITY DEFINER porque, no instante do cadastro, o usuário ainda não é membro
-- de clínica alguma — o RLS o impediria de criar a primeira.
--
-- Idempotente: chamar de novo para o mesmo auth_id devolve a clínica que já
-- existe, em vez de criar a segunda. Cobre o retry depois de erro de rede, que é
-- exatamente quando o cadastro duplicado costuma nascer.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.register_clinic(
    p_auth_id UUID,
    p_clinic_name TEXT,
    p_email TEXT,
    p_plan_slug TEXT DEFAULT 'solara-mensal',
    p_phone TEXT DEFAULT NULL,
    p_user_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clinic_id UUID;
    v_plan_id UUID;
    v_trial_days INTEGER;
    v_slug TEXT;
    v_base TEXT;
    v_sufixo INTEGER := 0;
BEGIN
    IF p_auth_id IS NULL OR COALESCE(trim(p_clinic_name), '') = '' THEN
        RAISE EXCEPTION 'Informe o nome da clínica.' USING ERRCODE = 'check_violation';
    END IF;

    -- Já cadastrado? Devolve o que existe. Ver comentário de idempotência acima.
    SELECT u.clinic_id INTO v_clinic_id
      FROM public.users u WHERE u.auth_id = p_auth_id LIMIT 1;
    IF v_clinic_id IS NOT NULL THEN
        RETURN jsonb_build_object('clinic_id', v_clinic_id, 'ja_existia', true);
    END IF;

    SELECT p.id, p.trial_days INTO v_plan_id, v_trial_days
      FROM public.plans p WHERE p.slug = p_plan_slug AND p.active LIMIT 1;

    IF v_plan_id IS NULL THEN
        SELECT p.id, p.trial_days INTO v_plan_id, v_trial_days
          FROM public.plans p WHERE p.active ORDER BY p.display_order LIMIT 1;
    END IF;

    -- Slug legível a partir do nome, com sufixo numérico em caso de colisão.
    -- unaccent não está instalado por padrão, então a normalização é manual.
    v_base := lower(trim(p_clinic_name));
    v_base := translate(v_base, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
    v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
    v_base := trim(both '-' from v_base);
    IF v_base = '' THEN v_base := 'clinica'; END IF;
    v_base := left(v_base, 40);

    v_slug := v_base;
    WHILE EXISTS (SELECT 1 FROM public.clinics c WHERE c.slug = v_slug) LOOP
        v_sufixo := v_sufixo + 1;
        v_slug := v_base || '-' || v_sufixo;
    END LOOP;

    INSERT INTO public.clinics (name, slug, email, phone, plan_id, owner_auth_id)
    VALUES (trim(p_clinic_name), v_slug, p_email, p_phone, v_plan_id, p_auth_id)
    RETURNING id INTO v_clinic_id;

    INSERT INTO public.users (clinic_id, auth_id, email, name, role)
    VALUES (v_clinic_id, p_auth_id, p_email,
            COALESCE(NULLIF(trim(p_user_name), ''), split_part(p_email, '@', 1)), 'owner');

    -- Briefing nasce junto, vazio. Sem a linha, a primeira gravação do formulário
    -- não teria o que atualizar.
    INSERT INTO public.clinic_briefing (clinic_id) VALUES (v_clinic_id);

    INSERT INTO public.subscriptions (clinic_id, plan_id, status, trial_ends_at, current_period_end)
    VALUES (v_clinic_id, v_plan_id,
            CASE WHEN COALESCE(v_trial_days, 0) > 0 THEN 'trialing' ELSE 'pending' END,
            CASE WHEN COALESCE(v_trial_days, 0) > 0
                 THEN NOW() + make_interval(days => v_trial_days) END,
            CASE WHEN COALESCE(v_trial_days, 0) > 0
                 THEN NOW() + make_interval(days => v_trial_days) END);

    -- O dono recebe os alertas de handoff por padrão. Sem destinatário, um lead
    -- escalado fica esperando sem ninguém ser avisado.
    INSERT INTO public.handoff_recipients (clinic_id, user_id, canal)
    SELECT v_clinic_id, u.id, 'painel'
      FROM public.users u WHERE u.auth_id = p_auth_id;

    RETURN jsonb_build_object('clinic_id', v_clinic_id, 'slug', v_slug, 'ja_existia', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_clinic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, anon;


-- Conserta conta criada no Auth cujo cadastro parou no meio: a pessoa loga e
-- cai num painel vazio. Chamada manualmente pelo suporte, não pelo app.
CREATE OR REPLACE FUNCTION public.reparar_cadastro(p_email TEXT, p_clinic_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_auth_id UUID;
BEGIN
    SELECT id INTO v_auth_id FROM auth.users WHERE email = lower(trim(p_email)) LIMIT 1;
    IF v_auth_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Nenhuma conta com esse e-mail.');
    END IF;
    RETURN public.register_clinic(v_auth_id, p_clinic_name, p_email);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reparar_cadastro(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
