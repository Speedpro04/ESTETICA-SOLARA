/**
 * Casca do painel operacional: barra da marca + as duas áreas de trabalho.
 *
 * Só duas abas, de propósito. "Atendimento" é o que se olha todo dia;
 * "Briefing" é o que se preenche uma vez e se revisa de vez em quando. Menu com
 * oito itens em software que a clínica usa entre um paciente e outro só aumenta
 * a chance de ninguém achar o que precisa.
 */
import { useEffect, useState } from 'react';
import { colors, fonts, radius, texto } from './brand/tokens';
import Briefing from './Briefing';
import Painel from './Painel';
import { supabase } from './lib/supabase';

type Aba = 'atendimento' | 'briefing';

interface Props {
  clinicId: string;
  onLogout: () => void;
}

export default function Operacional({ clinicId, onLogout }: Props) {
  const [aba, setAba] = useState<Aba>('atendimento');
  const [userId, setUserId] = useState<string | null>(null);
  const [nomeClinica, setNomeClinica] = useState<string>('');

  // O painel registra QUEM assumiu um atendimento, e isso é users.id — não o id
  // do Supabase Auth. São chaves diferentes; trocar uma pela outra grava um
  // responsável que não existe na equipe.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: sessao } = await supabase.auth.getSession();
      const authId = sessao?.session?.user?.id;
      if (!authId) return;

      const [{ data: usuario }, { data: clinica }] = await Promise.all([
        supabase.from('users').select('id').eq('auth_id', authId).maybeSingle(),
        supabase.from('clinics').select('name').eq('id', clinicId).maybeSingle(),
      ]);

      if (!vivo) return;
      if (usuario?.id) setUserId(usuario.id);
      if (clinica?.name) setNomeClinica(clinica.name);
    })();
    return () => {
      vivo = false;
    };
  }, [clinicId]);

  return (
    <div style={{ minHeight: '100vh', background: colors.surface, fontFamily: fonts.body }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
          padding: '14px 28px',
          background: colors.ink,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontFamily: fonts.display, fontSize: texto.secao, color: colors.goldLight }}>
            Solara
          </span>
          {nomeClinica && (
            <span style={{ fontSize: texto.corpo, color: 'rgba(255,255,255,0.62)' }}>{nomeClinica}</span>
          )}
        </div>

        <nav style={{ display: 'flex', gap: 4 }}>
          {(
            [
              { chave: 'atendimento', rotulo: 'Atendimento' },
              { chave: 'briefing', rotulo: 'Briefing' },
            ] as const
          ).map((item) => {
            const ativa = aba === item.chave;
            return (
              <button
                key={item.chave}
                type="button"
                onClick={() => setAba(item.chave)}
                style={{
                  padding: '7px 16px',
                  fontFamily: fonts.body,
                  fontSize: texto.corpo,
                  fontWeight: ativa ? 600 : 500,
                  color: ativa ? colors.ink : 'rgba(255,255,255,0.78)',
                  background: ativa ? colors.goldLight : 'transparent',
                  border: 'none',
                  borderRadius: radius.base,
                  cursor: 'pointer',
                }}
              >
                {item.rotulo}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={onLogout}
          style={{
            padding: '7px 14px',
            fontFamily: fonts.body,
            fontSize: texto.apoio,
            color: 'rgba(255,255,255,0.78)',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.22)',
            borderRadius: radius.base,
            cursor: 'pointer',
          }}
        >
          Sair
        </button>
      </header>

      <main style={{ padding: '28px 28px 0' }}>
        {aba === 'atendimento' ? (
          <Painel clinicId={clinicId} userId={userId} aoAbrirBriefing={() => setAba('briefing')} />
        ) : (
          <div style={{ maxWidth: 1180, margin: '0 auto' }}>
            <Briefing clinicId={clinicId} />
          </div>
        )}
      </main>
    </div>
  );
}
