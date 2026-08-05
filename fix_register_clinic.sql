CREATE OR REPLACE FUNCTION public.register_clinic(
    p_auth_id UUID,
    p_clinic_name TEXT,
    p_email TEXT,
    p_plan_slug TEXT,
    p_phone TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan_id UUID;
    v_clinic_id UUID;
    v_user_id UUID;
    v_slug TEXT;
BEGIN
    SELECT id INTO v_plan_id FROM plans WHERE slug = p_plan_slug AND active = true;
    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'Plano nao encontrado';
    END IF;

    -- Garantir que o nome da clínica não seja nulo e gerar o slug corretamente
    v_slug := lower(regexp_replace(coalesce(p_clinic_name, 'clinica'), '[^a-zA-Z0-9]+', '-', 'g'));
    IF v_slug IS NULL OR v_slug = '' THEN
        v_slug := 'clinica';
    END IF;
    v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 8);

    -- Insere a clínica passando também o telefone
    INSERT INTO clinics (name, slug, email, phone, plan_id, owner_auth_id, active)
    VALUES (coalesce(p_clinic_name, 'Clínica sem nome'), v_slug, p_email, p_phone, v_plan_id, p_auth_id, true)
    RETURNING id INTO v_clinic_id;

    -- Insere o usuário passando o telefone
    INSERT INTO users (clinic_id, auth_id, email, name, role, phone)
    VALUES (v_clinic_id, p_auth_id, p_email, coalesce(p_clinic_name, 'Dono'), 'owner', p_phone)
    RETURNING id INTO v_user_id;

    -- Insere a assinatura pendente
    INSERT INTO subscriptions (clinic_id, plan_id, status)
    VALUES (v_clinic_id, v_plan_id, 'pending');

    RETURN json_build_object(
        'clinic_id', v_clinic_id,
        'user_id', v_user_id,
        'plan_id', v_plan_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_clinic TO anon;
GRANT EXECUTE ON FUNCTION public.register_clinic TO authenticated;
