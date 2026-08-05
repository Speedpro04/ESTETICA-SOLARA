import { useState, useEffect } from 'react';
import { Download, Search, RefreshCw, BarChart2 } from 'lucide-react';
import { supabase } from './lib/supabase';

interface PartnersAnalyticsProps {
  clinicId?: string;
}

interface PartnerGroup {
  id: string;
  name: string;
  category: string;
  whatsapp: number;
  website: number;
  total: number;
}

export default function PartnersAnalytics({ clinicId: _clinicId }: PartnersAnalyticsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [analyticsData, setAnalyticsData] = useState<PartnerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = async (showRefresher = false) => {
    if (showRefresher) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('solara_partners_clicks')
        .select('*');

      if (error) {
        // Se a tabela não existe ainda no Supabase, criamos uma estrutura vazia amigável
        console.warn('Tabela de cliques de parceiros não encontrada ou vazia:', error.message);
        setAnalyticsData([]);
        return;
      }

      // Agrupar e somar os cliques dinamicamente no frontend
      const groups: { [key: string]: PartnerGroup } = {};

      data?.forEach((click: any) => {
        const key = click.partner_id;
        if (!groups[key]) {
          groups[key] = {
            id: key,
            name: click.partner_name,
            category: click.category_title,
            whatsapp: 0,
            website: 0,
            total: 0
          };
        }

        if (click.click_type === 'whatsapp') {
          groups[key].whatsapp += 1;
        } else if (click.click_type === 'website') {
          groups[key].website += 1;
        }
        groups[key].total += 1;
      });

      // Ordenar do parceiro com mais cliques para o com menos
      const sortedData = Object.values(groups).sort((a, b) => b.total - a.total);
      setAnalyticsData(sortedData);
    } catch (err) {
      console.error('Erro geral ao carregar dados de analíticos:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const filteredData = analyticsData
    .filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ marginTop: 40, fontFamily: "'Outfit', sans-serif" }}>
      {/* Estilos para Impressão PDF */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-report, #printable-report * {
            visibility: visible;
          }
          #printable-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div id="printable-report" style={{ background: '#fff', borderRadius: 3, padding: '32px', border: '1px solid rgba(0,0,0,0.03)', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <BarChart2 size={24} color="#130f40" />
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#130f40', margin: 0 }}>Performance de Parceiros</h3>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>Relatório de cliques e engajamento real do Marketplace B2B Solara Connect.</p>
          </div>
          
          <div style={{ display: 'flex', gap: 8 }} className="no-print">
            <button
              onClick={() => fetchAnalytics(true)}
              disabled={loading || refreshing}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
                padding: '12px',
                borderRadius: 3,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title="Atualizar dados"
            >
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
            
            <button 
              onClick={handlePrint}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8, 
                background: 'linear-gradient(135deg, #130f40 0%, #2c3e50 100%)', 
                color: '#fff', 
                border: 'none', 
                padding: '12px 24px', 
                borderRadius: 3, 
                fontWeight: 600, 
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(19,15,64,0.2)',
                transition: 'all 0.2s'
              }}
            >
              <Download size={18} /> Exportar PDF
            </button>
          </div>
        </div>

        <div className="no-print" style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: 16, top: 14 }} />
            <input 
              type="text" 
              placeholder="Buscar por fornecedor ou categoria..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '12px 16px 12px 42px', borderRadius: 3, border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.95rem' }}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: '64px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={36} className="animate-spin" style={{ margin: '0 auto 16px auto', animation: 'spin 1s linear infinite', color: '#130f40' }} />
              <p style={{ fontWeight: 600 }}>Carregando dados reais do Supabase...</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                  <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>Fornecedor</th>
                  <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>Categoria</th>
                  <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.9rem', textAlign: 'center' }}>Cliques WhatsApp</th>
                  <th style={{ padding: '16px', color: '#64748b', fontWeight: 600, fontSize: '0.9rem', textAlign: 'center' }}>Cliques Site</th>
                  <th style={{ padding: '16px', color: '#130f40', fontWeight: 700, fontSize: '0.9rem', textAlign: 'center' }}>Total Interações</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: index % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ padding: '16px', fontWeight: 600, color: '#130f40' }}>{item.name}</td>
                    <td style={{ padding: '16px', color: '#64748b', fontSize: '0.9rem' }}>{item.category}</td>
                    <td style={{ padding: '16px', textAlign: 'center', color: '#25D366', fontWeight: 600 }}>{item.whatsapp}</td>
                    <td style={{ padding: '16px', textAlign: 'center', color: '#3b82f6', fontWeight: 600 }}>{item.website}</td>
                    <td style={{ padding: '16px', textAlign: 'center', color: '#130f40', fontWeight: 800 }}>{item.total}</td>
                  </tr>
                ))}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>
                      <span style={{ fontSize: '2rem', display: 'block', marginBottom: '8px' }}>📈</span>
                      Nenhum clique registrado no banco de dados ainda. 
                      <br />Os novos cliques manuais aparecerão aqui instantaneamente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Resumo Rodapé para PDF */}
        <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.85rem' }}>
          <div>Relatório gerado automaticamente por <strong>Solara Connect Analytics</strong>.</div>
          <div>Total de Parceiros com Atividade: <strong>{filteredData.length}</strong></div>
        </div>

      </div>
      
      {/* CSS Spin Keyframe */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
