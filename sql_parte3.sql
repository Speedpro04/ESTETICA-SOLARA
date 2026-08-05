-- ============================================
-- PARTE 3: Funcao de registro segura
-- Rode DEPOIS das partes 1 e 2
-- ============================================

CREATE OR REPLACE FUNCTION public.register_clinic(
    p_auth_id UUID,
    p_clinic_name TEXT,
    p_email TEXT,
    p_plan_slug TEXT
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

    v_slug := lower(regexp_replace(p_clinic_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8);

    INSERT INTO clinics (name, slug, email, plan_id, owner_auth_id, active)
    VALUES (p_clinic_name, v_slug, p_email, v_plan_id, p_auth_id, true)
    RETURNING id INTO v_clinic_id;

    INSERT INTO users (clinic_id, auth_id, email, name, role)
    VALUES (v_clinic_id, p_auth_id, p_email, p_clinic_name, 'owner')
    RETURNING id INTO v_user_id;

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
