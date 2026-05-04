// =============================================
// js/utils.js — Funções utilitárias
// =============================================

const MESES_LABELS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

const CARD_COLORS = [
  '#5B6EF5','#8B5CF6','#EC4899','#F0456A','#F5A623',
  '#10D98A','#06B6D4','#1D4ED8','#7C3AED','#374151'
];

const CATEGORY_COLORS = {
  'Alimentação': '#F5A623',
  'Moradia': '#5B6EF5',
  'Transporte': '#06B6D4',
  'Saúde': '#10D98A',
  'Educação': '#8B5CF6',
  'Lazer': '#EC4899',
  'Assinaturas': '#F0456A',
  'Compras': '#FB923C',
  'Investimentos': '#22D3EE',
  'Outros': '#6B7599',
  'Importado': '#9CA3AF'
};

function fmtBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function getMesLabel(mesRef) {
  if (!mesRef) return '';
  const [y, m] = mesRef.split('-');
  return `${MESES_LABELS[parseInt(m) - 1]} ${y}`;
}

function getCurrentMesRef() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function addMonths(mesRef, n) {
  const [y, m] = mesRef.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${type === 'success' ? '✅' : '❌'} ${msg}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
// Parse parcelas from description:
// Nubank: "Produto - Parcela 3/12"
// Itaú:   "Shopee*SHOPEE* 04/12"
function parseParcela(desc) {
  const text = (desc || '').toUpperCase();

  const patterns = [
    /PARCELA\s*(\d{1,2})\s*\/\s*(\d{1,2})/i,
    /PARC\.?\s*(\d{1,2})\s*\/\s*(\d{1,2})/i,
    /PARCELA\s*(\d{1,2})\s*DE\s*(\d{1,2})/i,
    /PARC\.?\s*(\d{1,2})\s*DE\s*(\d{1,2})/i,

    // Padrão Itaú: "04/12", "01/10", "05/12"
    /(?:^|\s)(\d{1,2})\s*\/\s*(\d{1,2})(?:\s|$)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) continue;

    const atual = parseInt(match[1], 10);
    const total = parseInt(match[2], 10);

    if (
      Number.isInteger(atual) &&
      Number.isInteger(total) &&
      atual >= 1 &&
      total > 1 &&
      atual <= total &&
      total <= 48
    ) {
      return {
        atual,
        total
      };
    }
  }

  return {
    atual: 1,
    total: 1
  };
}
function populateMonthSelect(selectId, value) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '';
  const now = getCurrentMesRef();
  // Show last 6 months + next 3
  for (let i = -6; i <= 3; i++) {
    const ref = addMonths(now, i);
    const opt = document.createElement('option');
    opt.value = ref;
    opt.textContent = getMesLabel(ref);
    if (ref === (value || now)) opt.selected = true;
    sel.appendChild(opt);
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
