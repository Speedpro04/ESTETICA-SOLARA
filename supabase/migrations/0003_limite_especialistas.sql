-- =============================================================================
-- Limite de 3 especialistas no plano
-- =============================================================================
-- Decisão comercial: o plano único passa a incluir 3 especialistas em vez de
-- ilimitados. Quem precisa do quarto contrata adicional.
--
-- A trava vive no banco, não no navegador. O painel já tinha uma checagem em
-- JavaScript (Dashboard.tsx), mas qualquer pessoa com o console aberto — ou uma
-- chamada direta ao PostgREST — passava por cima dela. Aqui não passa.
--
-- Conta apenas usuários ATIVOS com papel 'doctor'. Dono e recepção não entram:
-- limitar quem atende telefone empurraria a clínica para senha compartilhada, e
-- aí a trilha de auditoria que a landing promete perde o sentido.
-- =============================================================================

UPDATE plans
   SET max_specialists = 3
 WHERE slug IN ('solara-mensal', 'solara-anual');

CREATE OR REPLACE FUNCTION public.check_specialist_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limite INTEGER;
    v_atuais INTEGER;
BEGIN
    -- Só especialista ativo consome vaga.
    IF NEW.role <> 'doctor' OR NEW.active IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    SELECT p.max_specialists INTO v_limite
      FROM clinics c
      JOIN plans p ON p.id = c.plan_id
     WHERE c.id = NEW.clinic_id;

    -- NULL = sem teto (mantém a porta aberta para um plano futuro ilimitado).
    IF v_limite IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO v_atuais
      FROM users
     WHERE clinic_id = NEW.clinic_id
       AND role = 'doctor'
       AND active IS TRUE
       AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF v_atuais >= v_limite THEN
        RAISE EXCEPTION
            'Seu plano inclui % especialistas e todos estão em uso. Para adicionar mais, fale com a Solara.', v_limite
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_specialist_limit ON users;
CREATE TRIGGER trg_users_specialist_limit
    BEFORE INSERT OR UPDATE OF role, active ON users
    FOR EACH ROW
    EXECUTE FUNCTION public.check_specialist_limit();
