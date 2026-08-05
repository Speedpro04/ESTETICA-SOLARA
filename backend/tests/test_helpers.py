"""Testes dos helpers puros do backend (sem rede/banco).

Rodar: cd backend && python -m pytest tests/ -v
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.api.evolution import (  # noqa: E402
    _split_into_bubbles,
    _normalize_phone,
    _match_confirmation_intent,
    _is_group,
)
from app.services.ai_service import (  # noqa: E402
    _strip_reintroduction,
    _usable_first_name,
)
from app.services.appointment_service import resolve_start_time  # noqa: E402


class TestSplitIntoBubbles:
    def test_single_paragraph_one_bubble(self):
        assert _split_into_bubbles("Oi, tudo bem?") == ["Oi, tudo bem?"]

    def test_blank_line_splits_bubbles(self):
        result = _split_into_bubbles("Primeira ideia.\n\nSegunda ideia.")
        assert result == ["Primeira ideia.", "Segunda ideia."]

    def test_excess_bubbles_merged_into_last(self):
        text = "\n\n".join(f"Balão {i}" for i in range(1, 7))
        result = _split_into_bubbles(text)
        assert len(result) == 4
        assert "Balão 6" in result[-1]

    def test_empty_text(self):
        assert _split_into_bubbles("") == []


class TestNormalizePhone:
    def test_strips_jid_suffix(self):
        assert _normalize_phone("5511999998888@s.whatsapp.net") == "5511999998888"

    def test_strips_device_part(self):
        assert _normalize_phone("5511999998888:12@s.whatsapp.net") == "5511999998888"

    def test_none(self):
        assert _normalize_phone(None) is None


class TestIsGroup:
    def test_group_jid(self):
        assert _is_group("123456-789@g.us") is True

    def test_individual_jid(self):
        assert _is_group("5511999998888@s.whatsapp.net") is False


class TestConfirmationIntent:
    def test_yes_variants(self):
        for msg in ["Sim", "sim!", "  CONFIRMO ", "Confirmado", "pode confirmar", "Sim 👍"]:
            assert _match_confirmation_intent(msg) == "yes", msg

    def test_no_variants(self):
        for msg in ["Não", "nao", "não vou conseguir", "Cancelar", "quero cancelar"]:
            assert _match_confirmation_intent(msg) == "no", msg

    def test_normal_message_is_none(self):
        for msg in ["Quero marcar uma consulta", "sim, mas antes tenho uma dúvida", "ok"]:
            assert _match_confirmation_intent(msg) is None, msg


class TestStripReintroduction:
    def test_removes_greeting_and_intro(self):
        reply = "Oi! Eu sou a Solara, da Clínica Vida. Seu horário está confirmado."
        result = _strip_reintroduction(reply)
        assert "sou a Solara" not in result
        assert "confirmado" in result

    def test_keeps_normal_reply(self):
        reply = "Seu horário está confirmado para amanhã às 9h."
        assert _strip_reintroduction(reply) == reply

    def test_never_returns_empty(self):
        reply = "Oi! Eu sou a Solara, da Clínica Vida."
        assert _strip_reintroduction(reply).strip() != ""


class TestResolveStartTime:
    def test_period_morning_default(self):
        dt = resolve_start_time("2026-07-01", period="manha")
        assert dt is not None and (dt.hour, dt.minute) == (9, 0)

    def test_period_afternoon(self):
        dt = resolve_start_time("2026-07-01", period="tarde")
        assert dt is not None and dt.hour == 14

    def test_explicit_time_wins(self):
        dt = resolve_start_time("2026-07-01", period="tarde", time_str="16:30")
        assert dt is not None and (dt.hour, dt.minute) == (16, 30)

    def test_invalid_date(self):
        assert resolve_start_time("amanhã") is None

    def test_timezone_sao_paulo(self):
        dt = resolve_start_time("2026-07-01", period="manha")
        assert str(dt.tzinfo) == "America/Sao_Paulo"


class TestUsableFirstName:
    def test_regular_name(self):
        assert _usable_first_name("maria souza") == "Maria"

    def test_skips_title(self):
        assert _usable_first_name("Dr. João Pereira") == "João"

    def test_placeholder_rejected(self):
        assert _usable_first_name("Paciente 5511999998888") is None

    def test_none(self):
        assert _usable_first_name(None) is None
