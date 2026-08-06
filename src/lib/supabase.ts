import { createClient } from '@supabase/supabase-js';

/**
 * Cliente do Supabase para o navegador.
 *
 * As credenciais vêm SÓ do ambiente. Antes havia URL e chave do projeto antigo
 * escritas aqui como padrão — o que, além de deixar credencial no repositório,
 * fazia o app falar silenciosamente com o banco errado sempre que o .env
 * faltasse. Falhar alto é melhor: erro de configuração aparece na hora, e não
 * como "sumiram meus dados".
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não configuradas. ' +
    'Copie os valores do projeto no Supabase para .env.local (desenvolvimento) ' +
    'ou .env.production (build).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
