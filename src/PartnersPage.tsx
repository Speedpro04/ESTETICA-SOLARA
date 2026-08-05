import { useState, useMemo, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Globe, ShieldCheck, Crown, Search, MapPin, Sparkles, Filter,
  Stethoscope, ScanLine, Shirt, Recycle, Package, HeartPulse,
  Video, Armchair, Microscope, Banknote, LayoutGrid
} from 'lucide-react';
import { supabase } from './lib/supabase';

interface Partner {
  id: string;
  name: string;
  specialty: string;
  site: string;
  region: 'nacional' | 'vale';
  location: string;
  category_id?: string;
  isEmptySlot?: boolean;
}


const generateEmptySlot = (id: string, categoryTitle: string, region: 'nacional' | 'vale' = 'nacional'): Partner => ({
  id,
  name: 'Espaço Exclusivo',
  specialty: `Torne-se um fornecedor de ${categoryTitle.toLowerCase()} homologado e impulsione suas vendas no Solara Connect.`,
  site: '',
  region,
  location: region === 'vale' ? 'Vale do Paraíba' : 'Brasil',
  isEmptySlot: true
});

// Normaliza URLs para garantir que SEMPRE abram (corrige duplicação de https://)
const normalizeUrl = (site?: string): string => {
  if (!site || site.trim() === '' || site.trim() === '#') return '';
  const s = site.trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

// Iniciais do fornecedor para o monograma (quando não há logo)
const getInitials = (name: string): string =>
  name
    .replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

// Cor de destaque por categoria — dá identidade visual a cada bloco de cards
const CATEGORY_ACCENT: Record<string, string> = {
  'equip-odonto': '#0ea5e9',
  'diag-imagem': '#8b5cf6',
  'uniformes': '#ec4899',
  'residuos': '#10b981',
  'regional-vale': '#f59e0b',
  'fisioterapia': '#ef4444',
  'insumos-odonto': '#3b82f6',
  'endoscopia': '#14b8a6',
  'equip-estetica': '#d946ef',
  'mobiliario': '#f97316',
  'laboratorio': '#06b6d4',
  'seguros': '#22c55e',
  'financiamentos': '#eab308',
};
const accentFor = (id?: string): string => (id && CATEGORY_ACCENT[id]) || '#130f40';

const categoriesList: { id: string; title: string; Icon: LucideIcon }[] = [
  { id: 'equip-odonto', title: 'Equipamentos Odontológicos', Icon: Stethoscope },
  { id: 'diag-imagem', title: 'Diagnóstico por Imagem', Icon: ScanLine },
  { id: 'uniformes', title: 'Uniformes e Descartáveis', Icon: Shirt },
  { id: 'residuos', title: 'Gestão e Coleta de Resíduos', Icon: Recycle },
  { id: 'regional-vale', title: 'Regional Vale do Paraíba', Icon: MapPin },
  { id: 'fisioterapia', title: 'Fisioterapia e Reabilitação', Icon: HeartPulse },
  { id: 'endoscopia', title: 'Endoscopia e Torres de Vídeo', Icon: Video },
  { id: 'insumos-odonto', title: 'Materiais e Insumos', Icon: Package },
  { id: 'equip-estetica', title: 'Estética e Emagrecimento', Icon: Sparkles },
  { id: 'mobiliario', title: 'Mobiliário Clínico', Icon: Armchair },
  { id: 'laboratorio', title: 'Análises e Laboratório', Icon: Microscope },
  { id: 'seguros', title: 'Seguros para Clínicas', Icon: ShieldCheck },
  { id: 'financiamentos', title: 'Financiamento de Equipamentos', Icon: Banknote }
];
// Fornecedores homologados — todos com sites verificados (curl) em mai/2026.
const staticPartners: Partner[] = [
  // Materiais e Insumos
  { id: '1', name: 'Dental Cremer', specialty: 'Um dos maiores centros de distribuição odontológica da América Latina.', site: 'https://dentalcremer.com.br', region: 'nacional', location: 'Blumenau, SC', category_id: 'insumos-odonto' },
  { id: '2', name: 'Dental Speed', specialty: 'E-commerce nacional com entrega rápida de insumos e materiais clínicos.', site: 'https://dentalspeed.com', region: 'nacional', location: 'Belo Horizonte, MG', category_id: 'insumos-odonto' },
  { id: '3', name: 'Surya Dental', specialty: 'Distribuidora tradicional com clube de vantagens para dentistas.', site: 'https://suryadental.com.br', region: 'nacional', location: 'Bauru, SP', category_id: 'insumos-odonto' },
  { id: '4', name: 'Dental Prime', specialty: 'Loja completa de produtos odontológicos com preços competitivos.', site: 'https://dentalprime.com.br', region: 'nacional', location: 'Goiânia, GO', category_id: 'insumos-odonto' },
  { id: '5', name: 'Odontomega', specialty: 'Distribuidora de materiais e equipamentos para consultórios.', site: 'https://odontomega.com.br', region: 'nacional', location: 'Ribeirão Preto, SP', category_id: 'insumos-odonto' },
  { id: '6', name: 'Dental SP', specialty: 'Suprimentos e descartáveis odontológicos com forte atuação paulista.', site: 'https://dentalsp.com.br', region: 'nacional', location: 'São Paulo, SP', category_id: 'insumos-odonto' },

  // Equipamentos Odontológicos
  { id: '7', name: 'Gnatus', specialty: 'Fabricante nacional de consultórios completos e equipamentos de ponta.', site: 'https://gnatus.com.br', region: 'nacional', location: 'Ribeirão Preto, SP', category_id: 'equip-odonto' },
  { id: '8', name: 'Olsen', specialty: 'Cadeiras e equipamentos premium com foco em durabilidade.', site: 'https://olsen.odo.br', region: 'nacional', location: 'Palhoça, SC', category_id: 'equip-odonto' },
  { id: '9', name: 'Dabi Atlante', specialty: 'Marca histórica do grupo Alliage, líder em conjuntos clínicos avançados.', site: 'https://dabiatlante.com.br', region: 'nacional', location: 'Ribeirão Preto, SP', category_id: 'equip-odonto' },
  { id: '10', name: 'Saevo', specialty: 'Equipamentos com excelente custo-benefício e ótima ergonomia.', site: 'https://saevo.com.br', region: 'nacional', location: 'Ribeirão Preto, SP', category_id: 'equip-odonto' },
  { id: '11', name: 'KaVo', specialty: 'Multinacional referência em equipamentos e peças de alta performance.', site: 'https://kavo.com', region: 'nacional', location: 'Joinville, SC', category_id: 'equip-odonto' },
  { id: '12', name: 'Woson', specialty: 'Soluções clínicas com foco em biossegurança e automação.', site: 'https://woson.com.br', region: 'nacional', location: 'Brasil', category_id: 'equip-odonto' },

  // Diagnóstico por Imagem
  { id: '13', name: 'GE HealthCare', specialty: 'Gigante global em ultrassom e equipamentos pesados de diagnóstico.', site: 'https://gehealthcare.com.br', region: 'nacional', location: 'Brasil', category_id: 'diag-imagem' },
  { id: '14', name: 'Siemens Healthineers', specialty: 'Sistemas de imagem médica de altíssima fidelidade.', site: 'https://siemens-healthineers.com', region: 'nacional', location: 'Brasil', category_id: 'diag-imagem' },
  { id: '15', name: 'Mindray', specialty: 'Excelente custo-benefício em ultrassom clínico fixo e portátil.', site: 'https://mindray.com', region: 'nacional', location: 'Brasil', category_id: 'diag-imagem' },
  { id: '16', name: 'Vatech', specialty: 'Líder em radiologia odontológica digital e Raio-X panorâmico.', site: 'https://vatechbrasil.com.br', region: 'nacional', location: 'Brasil', category_id: 'diag-imagem' },
  { id: '17', name: 'PreXion', specialty: 'Tomógrafos e Raio-X compactos de alta resolução.', site: 'https://prexion.com', region: 'nacional', location: 'Brasil', category_id: 'diag-imagem' },
  { id: '18', name: 'Fujifilm Healthcare', specialty: 'Tecnologia em imagem digital, ultrassom e radiologia.', site: 'https://fujifilm.com', region: 'nacional', location: 'Brasil', category_id: 'diag-imagem' },

  // Uniformes e Descartáveis
  { id: '19', name: 'Cremer', specialty: 'Fornecedora histórica de gazes, algodão e descartáveis cirúrgicos.', site: 'https://cremer.com.br', region: 'nacional', location: 'Blumenau, SC', category_id: 'uniformes' },
  { id: '20', name: 'Cirúrgica Fernandes', specialty: 'Uma das maiores distribuidoras de correlatos e descartáveis do país.', site: 'https://cfernandes.com.br', region: 'nacional', location: 'São Paulo, SP', category_id: 'uniformes' },
  { id: '21', name: 'MA Hospitalar', specialty: 'Do insumo básico ao EPI, com amplo portfólio hospitalar.', site: 'https://mahospitalar.com.br', region: 'nacional', location: 'Brasil', category_id: 'uniformes' },
  { id: '22', name: 'Dufarma', specialty: 'Logística ágil para descartáveis e suprimentos de alto giro.', site: 'https://dufarma.com.br', region: 'nacional', location: 'Minas Gerais', category_id: 'uniformes' },
  { id: '23', name: 'Dra. Cherie', specialty: 'Jalecos e uniformes premium de alta costura para a área da saúde.', site: 'https://dracherie.com.br', region: 'nacional', location: 'São Paulo, SP', category_id: 'uniformes' },

  // Gestão e Coleta de Resíduos
  { id: '24', name: 'Corpus Saneamento', specialty: 'Referência na América Latina em gestão de resíduos de saúde.', site: 'https://corpus.com.br', region: 'nacional', location: 'Brasil', category_id: 'residuos' },
  { id: '25', name: 'Mig Lix', specialty: 'Transporte, incineração e destinação segura de resíduos.', site: 'https://miglix.com.br', region: 'nacional', location: 'São Paulo, SP', category_id: 'residuos' },
  { id: '26', name: 'Loga', specialty: 'Gestão de resíduos de saúde em grandes áreas urbanas.', site: 'https://loga.com.br', region: 'nacional', location: 'São Paulo, SP', category_id: 'residuos' },
  { id: '27', name: 'EcoUrbis', specialty: 'Coleta, tratamento e destinação final homologada de resíduos.', site: 'https://ecourbis.com.br', region: 'nacional', location: 'São Paulo, SP', category_id: 'residuos' },
  { id: '28', name: 'Sustentare Saneamento', specialty: 'Infraestrutura para coleta e tratamento de resíduos infectantes.', site: 'https://sustentaresaneamento.com.br', region: 'nacional', location: 'Brasil', category_id: 'residuos' },

  // Fisioterapia e Reabilitação
  { id: '29', name: 'Ibramed', specialty: 'Referência nacional em ultrassom terapêutico, laser e eletroterapia.', site: 'https://ibramed.com.br', region: 'nacional', location: 'Amparo, SP', category_id: 'fisioterapia' },
  { id: '30', name: 'KLD', specialty: 'Equipamentos de eletroterapia, ondas de choque e laser de alta potência.', site: 'https://kld.com.br', region: 'nacional', location: 'Amparo, SP', category_id: 'fisioterapia' },
  { id: '31', name: 'Bioset', specialty: 'Aparelhos de eletroterapia, fototerapia e estética avançada.', site: 'https://bioset.com.br', region: 'nacional', location: 'Rio Claro, SP', category_id: 'fisioterapia' },
  { id: '32', name: 'HTM Eletrônica', specialty: 'Fabricante de equipamentos para fisioterapia, estética e reabilitação.', site: 'https://htm.com.br', region: 'nacional', location: 'Amparo, SP', category_id: 'fisioterapia' },
  { id: '33', name: 'MedicalSan', specialty: 'Equipamentos para fisioterapia, dermatologia e fisioestética.', site: 'https://medicalsan.com.br', region: 'nacional', location: 'São Paulo, SP', category_id: 'fisioterapia' },
  { id: '34', name: 'Fisiofocus', specialty: 'Loja especializada em equipamentos e acessórios de fisioterapia.', site: 'https://fisiofocus.com.br', region: 'nacional', location: 'Brasil', category_id: 'fisioterapia' },

  // Endoscopia e Torres de Vídeo
  { id: '35', name: 'Olympus Medical', specialty: 'Líder mundial em endoscopia e torres de vídeo de alta definição.', site: 'https://medical.olympusamerica.com', region: 'nacional', location: 'Brasil', category_id: 'endoscopia' },
  { id: '36', name: 'Karl Storz', specialty: 'Referência global em endoscópios e sistemas de imagem cirúrgica.', site: 'https://karlstorz.com', region: 'nacional', location: 'Brasil', category_id: 'endoscopia' },
  { id: '37', name: 'Pentax Medical', specialty: 'Endoscópios e processadoras de imagem de alta performance.', site: 'https://pentaxmedical.com', region: 'nacional', location: 'Brasil', category_id: 'endoscopia' },
  { id: '38', name: 'Fujifilm Endoscopia', specialty: 'Torres e endoscópios com tecnologia de imagem avançada.', site: 'https://fujifilm.com', region: 'nacional', location: 'Brasil', category_id: 'endoscopia' },
  { id: '39', name: 'Medstar', specialty: 'Importação e assistência de equipamentos de endoscopia e vídeo.', site: 'https://medstar.com.br', region: 'nacional', location: 'Brasil', category_id: 'endoscopia' },

  // Estética e Emagrecimento
  { id: '40', name: 'Ibramed Estética', specialty: 'Equipamentos de estética corporal e facial de alta tecnologia.', site: 'https://ibramed.com.br', region: 'nacional', location: 'Amparo, SP', category_id: 'equip-estetica' },
  { id: '41', name: 'Tonederm', specialty: 'Fabricante premium de tecnologias para estética e dermatologia.', site: 'https://tonederm.com.br', region: 'nacional', location: 'Caxias do Sul, RS', category_id: 'equip-estetica' },
  { id: '42', name: 'HTM Estética', specialty: 'Equipamentos para estética, emagrecimento e tratamentos corporais.', site: 'https://htm.com.br', region: 'nacional', location: 'Amparo, SP', category_id: 'equip-estetica' },
  { id: '43', name: 'MedicalSan Estética', specialty: 'Linha completa para fisioestética e procedimentos faciais.', site: 'https://medicalsan.com.br', region: 'nacional', location: 'São Paulo, SP', category_id: 'equip-estetica' },
  { id: '44', name: 'Smart GR', specialty: 'Tecnologia em equipamentos de estética avançada e emagrecimento.', site: 'https://smartgr.com.br', region: 'nacional', location: 'Brasil', category_id: 'equip-estetica' },
  { id: '45', name: 'KLD Estética', specialty: 'Aparelhos de estética com foco em resultado e segurança.', site: 'https://kld.com.br', region: 'nacional', location: 'Amparo, SP', category_id: 'equip-estetica' },

  // Mobiliário Clínico
  { id: '46', name: 'Olidef', specialty: 'Fabricante de mesas cirúrgicas, focos e mobiliário hospitalar.', site: 'https://olidef.com.br', region: 'nacional', location: 'Ribeirão Preto, SP', category_id: 'mobiliario' },
  { id: '47', name: 'Macom', specialty: 'Macas, camas e mobiliário hospitalar de alta resistência.', site: 'https://macom.com.br', region: 'nacional', location: 'São Paulo, SP', category_id: 'mobiliario' },
  { id: '48', name: 'Arktus', specialty: 'Mobiliário e equipamentos médico-hospitalares.', site: 'https://arktus.com.br', region: 'nacional', location: 'Mafra, SC', category_id: 'mobiliario' },
  { id: '49', name: 'Fabbri', specialty: 'Mobiliário clínico e hospitalar com acabamento premium.', site: 'https://fabbri.com.br', region: 'nacional', location: 'Brasil', category_id: 'mobiliario' },
  { id: '50', name: 'Barrfab', specialty: 'Macas, divãs e mobiliário para clínicas e consultórios.', site: 'https://barrfab.com.br', region: 'nacional', location: 'Brasil', category_id: 'mobiliario' },
  { id: '51', name: 'Marcatto', specialty: 'Mobiliário hospitalar e cadeiras para a área da saúde.', site: 'https://marcatto.com.br', region: 'nacional', location: 'Brasil', category_id: 'mobiliario' },

  // Análises e Laboratório
  { id: '52', name: 'Labtest', specialty: 'Líder nacional em reagentes e equipamentos para análises clínicas.', site: 'https://labtest.com.br', region: 'nacional', location: 'Lagoa Santa, MG', category_id: 'laboratorio' },
  { id: '53', name: 'Wama Diagnóstica', specialty: 'Reagentes, testes rápidos e equipamentos laboratoriais.', site: 'https://wamadiagnostica.com.br', region: 'nacional', location: 'São Carlos, SP', category_id: 'laboratorio' },
  { id: '54', name: 'Bioclin / Quibasa', specialty: 'Soluções completas para laboratórios de análises clínicas.', site: 'https://bioclin.com.br', region: 'nacional', location: 'Belo Horizonte, MG', category_id: 'laboratorio' },
  { id: '55', name: 'Gold Analisa', specialty: 'Reagentes e kits diagnósticos para laboratórios.', site: 'https://goldanalisa.com.br', region: 'nacional', location: 'Belo Horizonte, MG', category_id: 'laboratorio' },

  // Seguros para Clínicas
  { id: '56', name: 'Porto Seguro', specialty: 'Seguros empresariais e de responsabilidade civil para clínicas.', site: 'https://portoseguro.com.br', region: 'nacional', location: 'Brasil', category_id: 'seguros' },
  { id: '57', name: 'Bradesco Seguros', specialty: 'Coberturas empresariais, patrimoniais e de saúde.', site: 'https://bradescoseguros.com.br', region: 'nacional', location: 'Brasil', category_id: 'seguros' },
  { id: '58', name: 'SulAmérica', specialty: 'Seguros de saúde e proteção para profissionais e clínicas.', site: 'https://sulamerica.com.br', region: 'nacional', location: 'Brasil', category_id: 'seguros' },
  { id: '59', name: 'Mapfre', specialty: 'Seguros patrimoniais e de responsabilidade civil profissional.', site: 'https://www.mapfre.com.br', region: 'nacional', location: 'Brasil', category_id: 'seguros' },
  { id: '60', name: 'Omint', specialty: 'Saúde e seguros premium para empresas e profissionais.', site: 'https://omint.com.br', region: 'nacional', location: 'Brasil', category_id: 'seguros' },

  // Financiamento de Equipamentos
  { id: '61', name: 'BNDES', specialty: 'Linhas de crédito e Finame para aquisição de equipamentos.', site: 'https://bndes.gov.br', region: 'nacional', location: 'Brasil', category_id: 'financiamentos' },
  { id: '62', name: 'Sicoob', specialty: 'Cooperativa de crédito com financiamento para a saúde.', site: 'https://sicoob.com.br', region: 'nacional', location: 'Brasil', category_id: 'financiamentos' },
  { id: '63', name: 'Sicredi', specialty: 'Crédito cooperativo e financiamento de equipamentos médicos.', site: 'https://sicredi.com.br', region: 'nacional', location: 'Brasil', category_id: 'financiamentos' },
  { id: '64', name: 'Banco do Brasil', specialty: 'Linhas de crédito empresarial e financiamento Finame.', site: 'https://bb.com.br', region: 'nacional', location: 'Brasil', category_id: 'financiamentos' },

  // Regional Vale do Paraíba
  { id: '65', name: 'Grupo Suprimed', specialty: 'Distribuidor master de ultrassom e equipamentos médicos no Vale.', site: 'https://suprimed.com.br', region: 'vale', location: 'São José dos Campos, SP', category_id: 'regional-vale' },
  { id: '66', name: 'D. Gonçalves', specialty: 'Engenharia clínica e equipamentos de imagem no Vale do Paraíba.', site: 'https://dgoncalves.com.br', region: 'vale', location: 'São José dos Campos, SP', category_id: 'regional-vale' },
  { id: '67', name: 'Cirúrgica São José', specialty: 'Materiais cirúrgicos, descartáveis e equipamentos para a região.', site: 'https://cirurgicasaojose.com.br', region: 'vale', location: 'São José dos Campos, SP', category_id: 'regional-vale' },
  { id: '68', name: 'Dental Vale', specialty: 'Distribuidora de insumos odontológicos para todo o Vale.', site: 'https://dentalvale.com.br', region: 'vale', location: 'São José dos Campos, SP', category_id: 'regional-vale' },
  { id: '69', name: 'Cirúrgica União', specialty: 'Distribuição de materiais hospitalares e correlatos médicos.', site: 'https://cirurgicauniao.com.br', region: 'vale', location: 'Vale do Paraíba, SP', category_id: 'regional-vale' },
  { id: '70', name: 'Ortovale', specialty: 'Produtos ortopédicos e equipamentos para saúde na região.', site: 'https://ortovale.com.br', region: 'vale', location: 'São José dos Campos, SP', category_id: 'regional-vale' }
];

interface PartnersPageProps {
  clinicId?: string;
}

export default function PartnersPage({ clinicId }: PartnersPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategoryTab, setActiveCategoryTab] = useState('all');
  const [regionFilter, setRegionFilter] = useState<'all' | 'nacional' | 'vale'>('all');
  const [partnersList, setPartnersList] = useState<Partner[]>(staticPartners);

  useEffect(() => {
    const fetchPartners = async () => {
      try {
        const { data, error } = await supabase
          .from('solara_partners')
          .select('*');
        if (error) {
          console.warn('Erro ao carregar parceiros do banco (tabela pode estar vazia):', error.message);
          return;
        }
        setPartnersList([...staticPartners, ...(data || [])]);
      } catch (err) {
        console.error('Erro ao ler parceiros do Supabase:', err);
      }
    };

    fetchPartners();
  }, []);

  const partnersData = useMemo(() => {
    return categoriesList.map(cat => {
      const catPartners = partnersList.filter(p => p.category_id === cat.id);
      // Garantir que a soma de parceiros reais + slot vazio dê no máximo 6 cards
      const combined = [
        ...catPartners,
        generateEmptySlot(`${cat.id}-empty`, cat.title, cat.id === 'regional-vale' ? 'vale' : 'nacional')
      ].slice(0, 6);
      return {
        ...cat,
        partners: combined
      };
    });
  }, [partnersList]);

  // Rastreamento assíncrono e não-bloqueante de cliques manuais no Supabase
  const trackPartnerClick = async (partner: Partner, clickType: 'website' | 'whatsapp', categoryTitle: string) => {
    try {
      const { error } = await supabase
        .from('solara_partners_clicks')
        .insert([{
          partner_id: partner.id,
          partner_name: partner.name,
          category_title: categoryTitle,
          click_type: clickType,
          clinic_id: clinicId || null
        }]);
      if (error) {
        console.warn('Erro silencioso ao registrar clique no Supabase:', error.message);
      }
    } catch (err) {
      console.warn('Erro ao processar registro de clique:', err);
    }
  };

  // Abre o site do parceiro com URL normalizada (garante que sempre abra) + rastreio
  const openSite = (partner: Partner, categoryTitle: string) => {
    const url = normalizeUrl(partner.site);
    if (!url) return;
    trackPartnerClick(partner, 'website', categoryTitle);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const filteredData = useMemo(() => {
    return partnersData
      .map((cat) => {
        // Filtrar parceiros em cada categoria
        const filteredPartners = cat.partners.filter((partner) => {
          // Filtro por Região
          if (regionFilter !== 'all' && partner.region !== regionFilter) {
            return false;
          }

          // Filtro por Busca (Nome, Especialidade ou Cidade/Localização)
          if (searchTerm.trim() !== '') {
            const query = searchTerm.toLowerCase();
            const nameMatch = partner.name.toLowerCase().includes(query);
            const specMatch = partner.specialty.toLowerCase().includes(query);
            const locMatch = partner.location.toLowerCase().includes(query);
            const catMatch = cat.title.toLowerCase().includes(query);

            return nameMatch || specMatch || locMatch || catMatch;
          }

          return true;
        });

        return {
          ...cat,
          partners: filteredPartners,
        };
      })
      // Filtrar categorias vazias e aplicar aba selecionada
      .filter((cat) => {
        if (activeCategoryTab !== 'all' && cat.id !== activeCategoryTab) {
          return false;
        }
        return cat.partners.length > 0;
      });
  }, [searchTerm, activeCategoryTab, regionFilter, partnersData]);

  const totalPartnersCount = useMemo(() => {
    return filteredData.reduce((acc, cat) => acc + cat.partners.filter(p => !p.isEmptySlot).length, 0);
  }, [filteredData]);

  // Função para simular o clique e contato de WhatsApp de parcerias do Solara Connect
  const handleBecomePartner = (catName: string) => {
    const text = encodeURIComponent(`Olá Solara Connect! Tenho interesse em homologar minha empresa como parceira oficial de "${catName}" no portal de parcerias premium.`);
    window.open(`https://wa.me/5512997184000?text=${text}`, '_blank');
  };

  return (
    <div style={{ 
      paddingTop: '24px', 
      paddingBottom: '80px', 
      fontFamily: "'Outfit', 'Inter', sans-serif",
      color: '#1e293b'
    }}>
      {/* Cabeçalho Premium com Efeito de Vidro */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap',
        gap: '24px',
        marginBottom: '40px',
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.4) 100%)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(226, 232, 240, 0.8)',
        borderRadius: 3,
        padding: '32px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #130f40 0%, #2c3e50 100%)',
            padding: '16px',
            borderRadius: 3,
            boxShadow: '0 10px 25px rgba(19, 15, 64, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Crown size={36} color="#7ed6df" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '2.2rem', fontWeight: 700, margin: 0, color: '#130f40', letterSpacing: '-1px' }}>
                Partnership Premium
              </h2>
              <span style={{ 
                background: 'linear-gradient(90deg, #f97316 0%, #ea580c 100%)', 
                color: '#fff', 
                fontSize: '0.75rem', 
                fontWeight: 600, 
                padding: '4px 10px', 
                borderRadius: 3,
                boxShadow: '0 4px 12px rgba(249, 115, 22, 0.2)',
                letterSpacing: '0.5px'
              }}>
                EXCLUSIVO
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: '1.1rem', marginTop: '6px', margin: 0, fontWeight: 400 }}>
              O maior hub homologado de suprimentos, equipamentos de ponta e resíduos para sua clínica médica ou odontológica.
            </p>
          </div>
        </div>
      </div>

      {/* Controles de Busca e Filtros Dinâmicos (Painel Premium) */}
      <div style={{
        background: '#ffffff',
        border: '1px solid rgba(226, 232, 240, 0.8)',
        borderRadius: 3,
        padding: '24px',
        boxShadow: '0 15px 35px rgba(0, 0, 0, 0.02)',
        marginBottom: '40px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Linha 1: Input de Busca e Botões de Região */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {/* Caixa de Busca Inteligente */}
          <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
            <Search size={20} color="#94a3b8" style={{ position: 'absolute', left: '16px', top: '15px' }} />
            <input 
              type="text" 
              placeholder="Buscar por marca, cidade (Taubaté, SJC...), especialidade..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '14px 16px 14px 48px', 
                borderRadius: 3, 
                border: '1.5px solid #e2e8f0', 
                outline: 'none', 
                fontSize: '1rem',
                fontFamily: 'inherit',
                transition: 'all 0.2s',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.01)'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#130f40';
                e.target.style.boxShadow = '0 0 0 4px rgba(19, 15, 64, 0.05)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e2e8f0';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Filtro de Abrangência Regional vs Nacional */}
          <div style={{ 
            display: 'flex', 
            background: '#f1f5f9', 
            padding: '4px', 
            borderRadius: 3, 
            border: '1px solid #e2e8f0' 
          }}>
            <button 
              onClick={() => setRegionFilter('all')}
              style={{
                padding: '10px 18px',
                border: 'none',
                borderRadius: 3,
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
                background: regionFilter === 'all' ? '#130f40' : 'transparent',
                color: regionFilter === 'all' ? '#fff' : '#475569',
                transition: 'all 0.2s'
              }}
            >
              Todos ({partnersData.reduce((acc, cat) => acc + cat.partners.length, 0)})
            </button>
            <button 
              onClick={() => setRegionFilter('nacional')}
              style={{
                padding: '10px 18px',
                border: 'none',
                borderRadius: 3,
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
                background: regionFilter === 'nacional' ? '#130f40' : 'transparent',
                color: regionFilter === 'nacional' ? '#fff' : '#475569',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Globe size={15} /> Nacionais
            </button>
            <button 
              onClick={() => setRegionFilter('vale')}
              style={{
                padding: '10px 18px',
                border: 'none',
                borderRadius: 3,
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: 'pointer',
                background: regionFilter === 'vale' ? '#130f40' : 'transparent',
                color: regionFilter === 'vale' ? '#fff' : '#475569',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <MapPin size={15} /> Vale do Paraíba
            </button>
          </div>
        </div>

        {/* Linha 2: Pílulas de Categoria Dinâmicas */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Filter size={16} color="#64748b" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Filtro por Categoria
            </span>
          </div>
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            flexWrap: 'wrap',
            paddingBottom: '8px'
          }}>
            <button
              onClick={() => setActiveCategoryTab('all')}
              style={{
                padding: '8px 16px',
                borderRadius: 3,
                border: '1px solid #e2e8f0',
                fontSize: '0.85rem',
                fontWeight: 500,
                cursor: 'pointer',
                background: activeCategoryTab === 'all' ? 'linear-gradient(135deg, #130f40 0%, #2c3e50 100%)' : '#fff',
                color: activeCategoryTab === 'all' ? '#fff' : '#475569',
                boxShadow: activeCategoryTab === 'all' ? '0 4px 10px rgba(19, 15, 64, 0.15)' : 'none',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <LayoutGrid size={15} /> Ver Todas
            </button>
            {partnersData.map((cat) => {
              // Contar itens que atendem ao filtro
              const count = cat.partners.filter(p => regionFilter === 'all' || p.region === regionFilter).length;
              if (count === 0) return null;

              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategoryTab(cat.id)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 3,
                    border: '1px solid #e2e8f0',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    background: activeCategoryTab === cat.id ? 'linear-gradient(135deg, #130f40 0%, #2c3e50 100%)' : '#fff',
                    color: activeCategoryTab === cat.id ? '#fff' : '#475569',
                    boxShadow: activeCategoryTab === cat.id ? '0 4px 10px rgba(19, 15, 64, 0.15)' : 'none',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <cat.Icon size={15} />
                  <span>{cat.title}</span>
                  <span style={{ 
                    fontSize: '0.7rem', 
                    padding: '2px 6px', 
                    borderRadius: 3, 
                    background: activeCategoryTab === cat.id ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                    color: activeCategoryTab === cat.id ? '#fff' : '#64748b'
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Contador de Resultados */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', padding: '0 8px' }}>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem', fontWeight: 500 }}>
          Mostrando <strong style={{ color: '#130f40' }}>{totalPartnersCount}</strong> parceiros homologados.
        </p>
        {(searchTerm || activeCategoryTab !== 'all' || regionFilter !== 'all') && (
          <button 
            onClick={() => {
              setSearchTerm('');
              setActiveCategoryTab('all');
              setRegionFilter('all');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Limpar Filtros
          </button>
        )}
      </div>

      {/* Listagem de Categorias e Seus Cards correspondentes */}
      {filteredData.map((category) => (
        <div key={category.id} style={{ marginBottom: '56px' }}>
          {/* Cabeçalho da Categoria com Estilo Elevado */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: 3,
                  background: `${accentFor(category.id)}14`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <category.Icon size={24} color={accentFor(category.id)} />
                </div>
                <h3 style={{ fontSize: '1.6rem', fontWeight: 400, color: '#130f40', margin: 0, letterSpacing: '-0.5px' }}>
                  {category.title}
                </h3>
              </div>
              <span style={{ 
                fontSize: '0.8rem', 
                color: '#64748b', 
                fontWeight: 500,
                background: '#f8fafc',
                padding: '4px 12px',
                borderRadius: 3,
                border: '1px solid #e2e8f0'
              }}>
                {category.partners.filter(p => !p.isEmptySlot).length} Homologados
              </span>
            </div>
            {/* Linha Divisória em Degradê Avançado */}
            <div style={{ width: '100%', height: '3px', background: 'linear-gradient(90deg, #7ed6df 0%, #130f40 50%, rgba(126,214,223,0.05) 100%)', borderRadius: 3}} />
          </div>

          {/* Grid de Cards (3 colunas proporcionais preenchendo 100% do espaço) */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '24px',
            width: '100%'
          }}>
            {category.partners.map((partner) => {
              const accent = accentFor(partner.category_id || category.id);

              // ---- Card de "Espaço Exclusivo" (slot para anunciar) ----
              if (partner.isEmptySlot) {
                return (
                  <div
                    key={partner.id}
                    onClick={() => handleBecomePartner(category.title)}
                    style={{
                      background: 'rgba(248, 250, 252, 0.5)',
                      border: '2px dashed rgba(126,214,223,0.6)',
                      borderRadius: 3,
                      padding: '24px 20px',
                      minHeight: '212px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.25s ease',
                      boxSizing: 'border-box'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(126,214,223,0.06)';
                      e.currentTarget.style.borderColor = 'rgba(126,214,223,0.95)';
                      e.currentTarget.style.transform = 'translateY(-3px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(248, 250, 252, 0.5)';
                      e.currentTarget.style.borderColor = 'rgba(126,214,223,0.6)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{
                      width: '56px', height: '56px', borderRadius: '50%',
                      background: 'rgba(126,214,223,0.14)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Sparkles size={26} color="#f97316" />
                    </div>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#475569', letterSpacing: '-0.3px' }}>
                      Espaço Exclusivo
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center', lineHeight: 1.45, maxWidth: '210px' }}>
                      Anuncie sua empresa de {category.title.toLowerCase()} e alcance clínicas em todo o Brasil.
                    </p>
                    <span style={{
                      marginTop: '4px', fontSize: '0.85rem', fontWeight: 700, color: '#130f40',
                      display: 'inline-flex', alignItems: 'center', gap: '6px'
                    }}>
                      <Sparkles size={14} color="#f97316" /> Anuncie Aqui
                    </span>
                  </div>
                );
              }

              // ---- Card de fornecedor homologado ----
              return (
                <div
                  key={partner.id}
                  onClick={() => openSite(partner, category.title)}
                  title={`Acessar o site de ${partner.name}`}
                  style={{
                    position: 'relative',
                    background: '#ffffff',
                    border: '1px solid #e8edf3',
                    borderRadius: 3,
                    padding: '24px 20px 20px',
                    minHeight: '212px',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    boxShadow: '0 4px 14px rgba(15,23,42,0.04)',
                    boxSizing: 'border-box',
                    transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1), box-shadow 0.25s, border-color 0.25s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = `0 18px 34px ${accent}26`;
                    e.currentTarget.style.borderColor = accent;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(15,23,42,0.04)';
                    e.currentTarget.style.borderColor = '#e8edf3';
                  }}
                >
                  {/* Faixa de cor no topo do card */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
                    background: `linear-gradient(90deg, ${accent} 0%, ${accent}55 100%)`
                  }} />

                  {/* Topo: monograma + selo HOMOLOGADO */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{
                      width: '54px', height: '54px', borderRadius: 3,
                      background: `linear-gradient(135deg, ${accent} 0%, #130f40 135%)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.5px',
                      boxShadow: `0 6px 16px ${accent}40`, flexShrink: 0
                    }}>
                      {getInitials(partner.name)}
                    </div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      background: '#ecfdf5', color: '#059669',
                      fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.4px',
                      padding: '5px 9px', borderRadius: 3, textTransform: 'uppercase'
                    }}>
                      <ShieldCheck size={12} /> Homologado
                    </span>
                  </div>

                  {/* Nome do fornecedor */}
                  <h4 style={{
                    margin: '0 0 5px', fontSize: '1.35rem', fontWeight: 700,
                    color: '#130f40', letterSpacing: '-0.5px', lineHeight: 1.15
                  }}>
                    {partner.name}
                  </h4>

                  {/* Localização */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#94a3b8', fontSize: '0.78rem', marginBottom: '10px' }}>
                    <MapPin size={13} /> {partner.location}
                  </div>

                  {/* Especialidade (até 2 linhas) */}
                  <p style={{
                    margin: '0 0 16px', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}>
                    {partner.specialty}
                  </p>

                  {/* Botão Acessar Site (ancorado no rodapé) */}
                  <button
                    onClick={(e) => { e.stopPropagation(); openSite(partner, category.title); }}
                    style={{
                      marginTop: 'auto', width: '100%', height: '42px', border: 'none', borderRadius: 3,
                      background: `linear-gradient(90deg, ${accent} 0%, #130f40 170%)`,
                      color: '#fff', fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      boxShadow: `0 6px 16px ${accent}33`, transition: 'filter 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; }}
                    title={`Acessar o site de ${partner.name}`}
                  >
                    <Globe size={15} /> Acessar Site
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filteredData.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '64px 32px',
          background: '#ffffff',
          borderRadius: 3,
          border: '1px solid #e2e8f0',
          boxShadow: '0 10px 25px rgba(0,0,0,0.01)'
        }}>
          <span style={{ fontSize: '3rem' }}>🔍</span>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#130f40', marginTop: '16px', marginBottom: '8px' }}>
            Nenhum parceiro homologado encontrado
          </h3>
          <p style={{ color: '#64748b', fontSize: '1rem', maxWidth: '460px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
            Não encontramos parceiros que correspondam a "{searchTerm}" para a região ou categoria selecionada. Tente usar outros termos de busca.
          </p>
          <button
            onClick={() => {
              setSearchTerm('');
              setActiveCategoryTab('all');
              setRegionFilter('all');
            }}
            style={{
              padding: '10px 24px',
              background: 'linear-gradient(135deg, #130f40 0%, #2c3e50 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 3,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.9rem',
              boxShadow: '0 4px 12px rgba(19, 15, 64, 0.15)'
            }}
          >
            Limpar Filtros e Ver Todos
          </button>
        </div>
      )}
    </div>
  );
}

