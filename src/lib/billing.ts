/**
 * Cobrança: leva a clínica ao Stripe e traz de volta.
 *
 * O navegador nunca envia preço, valor ou clinic_id. Manda só o slug do plano;
 * o backend descobre a clínica pelo JWT e o preço em plans.stripe_price_id.
 * Preço decidido no cliente é preço que o cliente pode mudar.
 */
import { getAuthHeaders } from './auth';

const API_URL = import.meta.env.VITE_API_URL;

async function chamar(caminho: string, corpo?: unknown): Promise<string> {
  if (!API_URL) {
    throw new Error('VITE_API_URL não configurada — o checkout precisa do backend.');
  }

  const headers = await getAuthHeaders();
  if (!headers.Authorization) {
    throw new Error('Sessão expirada. Entre de novo para continuar.');
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL.replace(/\/$/, '')}${caminho}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
  } catch {
    // Backend fora do ar, DNS, CORS. Sem esta mensagem o usuário vê só
    // "Failed to fetch" e conclui que o cartão foi recusado.
    throw new Error('Não foi possível falar com o servidor. Tente de novo em instantes.');
  }

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    throw new Error(dados?.detail || 'Não foi possível abrir o pagamento.');
  }
  if (!dados?.url) {
    throw new Error('O servidor não devolveu o endereço do pagamento.');
  }
  return dados.url as string;
}

/** Devolve a URL da sessão de checkout do Stripe para o plano escolhido. */
export function criarCheckout(planSlug: string): Promise<string> {
  return chamar('/api/stripe/checkout', { plan_slug: planSlug });
}

/** Portal do Stripe: trocar cartão, ver faturas, cancelar. */
export function abrirPortalDeCobranca(): Promise<string> {
  return chamar('/api/stripe/portal');
}
