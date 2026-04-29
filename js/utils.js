// ===== GLOBAIS =====
let currentPage = 'dashboard';
let currentMonth = new Date().toISOString().slice(0, 7);
let pendingCSVData = null;
const cardColors = ['#5B6EF5','#8B5CF6','#10D98A','#F0456A','#F5A623','#3B82F6','#EC4899','#14B8A6'];

// ===== NAVEGAÇÃO =====
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('[data-page="' + page + '"]')?.classList.add('active');
  const titles = { dashboard: 'Dashboard', faturas: 'Faturas', parcelas: 'Parcelas', cartoes: 'Cartões', receitas: 'Receitas', gastos: 'Gastos' };
  document.getElementById('page-title').textContent = titles[page] || page;
  const fn = window['load' + page.charAt(0).toUpperCase() + page.slice(1)];
  if (fn) fn();
}

function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
}

// ===== MODAIS =====
function openModal(id) { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }
function openImportModal() { openModal('modal-import'); }

// Novo cartão (wrapper)
function openModalCartao() { openCartaoModal(null); }

// Add modal (receita/gasto via prompts simples)
async function addReceita() {
  const valor = prompt('Valor da receita:');
  if (!valor || isNaN(parseFloat(valor))) return;
  const tipo = prompt('Tipo (salário, pix, transferencia, outros):') || 'outros';
  await client.from('receitas').insert({ user_id: user.id, tipo, valor: parseFloat(valor), mes: currentMonth });
  showToast('Receita adicionada', 'success');
  if (typeof loadDashboard === 'function') loadDashboard();
}

async function addGasto() {
  const desc = prompt('Descrição do gasto:');
  if (!desc) return;
  const valor = prompt('Valor:');
  if (!valor || isNaN(parseFloat(valor))) return;
  await client.from('gastos').insert({ user_id: user.id, descricao: desc, valor: parseFloat(valor), categoria: 'Outros', mes: currentMonth });
  showToast('Gasto adicionado', 'success');
  if (typeof loadDashboard === 'function') loadDashboard();
}

async function addFatura() {
  const nome = prompt('Nome da fatura:');
  if (!nome) return;
  const valor = prompt('Valor:');
  if (!valor || isNaN(parseFloat(valor))) return;
  const venc = prompt('Dia de vencimento (1-31):') || '10';
  await client.from('faturas').insert({ user_id: user.id, nome, valor: parseFloat(valor), vencimento: parseInt(venc), tipo: 'cartao' });
  showToast('Fatura adicionada', 'success');
  if (typeof loadFaturas === 'function') loadFaturas();
}

function onMonthChange() {
  currentMonth = document.getElementById('month-select')?.value || currentMonth;
  const fn = window['load' + currentPage.charAt(0).toUpperCase() + currentPage.slice(1)];
  if (fn) fn();
}

// ===== TOAST =====
function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'info');
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ===== USER INFO =====
async function loadUserInfo() {
  const { data } = await client.auth.getUser();
  if (data?.user) {
    user = data.user;
    const nameEl = document.getElementById('user-name');
    if (nameEl) nameEl.textContent = data.user.user_metadata?.nome || data.user.email;
    const emailEl = document.getElementById('user-email');
    if (emailEl) emailEl.textContent = data.user.email;
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.textContent = (data.user.user_metadata?.nome || data.user.email).charAt(0).toUpperCase();
  }
}

// ===== MONTH SELECTOR =====
function initMonthSelector() {
  const sel = document.getElementById('month-select');
  if (!sel) return;
  const now = new Date();
  sel.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (val === currentMonth) opt.selected = true;
    sel.appendChild(opt);
  }
}

// ===== COLOR SWATCHES =====
function initColorSwatches() {
  const container = document.getElementById('color-swatches');
  if (!container) return;
  container.innerHTML = '';
  cardColors.forEach((color, i) => {
    const s = document.createElement('div');
    s.className = 'color-swatch' + (i === 0 ? ' active' : '');
    s.style.background = color;
    s.dataset.color = color;
    s.onclick = () => { document.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active')); s.classList.add('active'); };
    container.appendChild(s);
  });
}

// ===== CARTÕES =====
async function saveCartao() {
  const id = document.getElementById('cartao-edit-id')?.value;
  const nome = document.getElementById('cartao-nome')?.value;
  const bandeira = document.getElementById('cartao-bandeira')?.value;
  const limite = parseFloat(document.getElementById('cartao-limite')?.value) || 0;
  const venc = parseInt(document.getElementById('cartao-venc')?.value) || 1;
  const fech = parseInt(document.getElementById('cartao-fech')?.value) || 1;
  const cor = document.querySelector('.color-swatch.active')?.dataset.color || cardColors[0];
  if (!nome) return showToast('Informe o nome do cartão', 'error');
  const payload = { user_id: user.id, nome, bandeira, limite, vencimento: venc, fechamento: fech, cor };
  try {
    if (id) { await client.from('cartoes').update(payload).eq('id', id); }
    else { await client.from('cartoes').insert(payload); }
    closeModal('modal-cartao');
    showToast(id ? 'Cartão atualizado' : 'Cartão adicionado', 'success');
    if (typeof loadCartoes === 'function') loadCartoes();
  } catch(e) { console.error(e); showToast('Erro ao salvar cartão', 'error'); }
}

function openCartaoModal(cartao) {
  document.getElementById('cartao-edit-id').value = cartao?.id || '';
  document.getElementById('cartao-nome').value = cartao?.nome || '';
  document.getElementById('cartao-bandeira').value = cartao?.bandeira || 'Visa';
  document.getElementById('cartao-limite').value = cartao?.limite || '';
  document.getElementById('cartao-venc').value = cartao?.vencimento || 10;
  document.getElementById('cartao-fech').value = cartao?.fechamento || 3;
  openModal('modal-cartao');
}

// ===== CATEGORIA =====
function openCategoriaModal(gasto) {
  document.getElementById('cat-item-id').value = gasto.id || '';
  document.getElementById('cat-select').value = gasto.categoria || 'Outros';
  openModal('modal-categoria');
}

async function saveCategoria() {
  const id = document.getElementById('cat-item-id')?.value;
  const cat = document.getElementById('cat-select')?.value;
  if (!id) return;
  try {
    await client.from('gastos').update({ categoria: cat }).eq('id', id);
    closeModal('modal-categoria');
    showToast('Categoria atualizada', 'success');
    if (typeof loadGastos === 'function') loadGastos();
  } catch(e) { console.error(e); }
}

// ===== CSV IMPORT (Nubank) =====
const categoryKeywords = {
  'Alimentação': ['ifood', 'ifd*', 'restaurant', 'pizza', 'lanches', 'supermercado', 'mercado', 'bar', 'lanche', 'bem estar', 'açaí', 'spoleto', 'araujo', 'bh', 'bonzao'],
  'Transporte': ['uber', '99', '99pop', 'gasolina', 'posto', 'combustível', 'estacionamento', 'metrô', 'ônibus', 'petrobras', 'shell', 'real sete'],
  'Saúde': ['farmácia', 'drogaria', 'médico', 'dentista', 'hospital', 'clínica', 'laboratório', 'plano', 'vidas', 'dental'],
  'Educação': ['curso', 'escola', 'faculdade', 'universidade', 'livro', 'amazon', 'inglês', 'idioma'],
  'Lazer': ['spotify', 'netflix', 'playstation', 'steam', 'apple', 'amazon prime', 'youtube', 'cinema', 'jogo'],
  'Moradia': ['aluguel', 'condomínio', 'luz', 'água', 'internet', 'iptu'],
  'Assinaturas': ['wellhub', 'nubank+', 'nubank', 'celular', 'telefone', 'plano', 'amazon canais', 'jim.com'],
  'Compras': ['lojas americanas', 'magazine', 'shopee', 'mercado livre', 'aliexpress', 'lojas americanas']
};

function categorizeFromTitle(title) {
  const lower = (title || '').toLowerCase();
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return cat;
    }
  }
  return 'Outros';
}

function onFileSelect(input) {
  const file = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.split('\n');
    const data = [];
    
    // Detectar header
    const firstLine = (lines[0] || '').toLowerCase();
    const startIdx = (firstLine.includes('date') || firstLine.includes('title') || firstLine.includes('amount')) ? 1 : 0;
    
    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Parse CSV simples
      const parts = line.split(',');
      if (parts.length >= 3) {
        const date = parts[0]?.trim() || '';
        const title = parts[1]?.trim() || '';
        const rawAmount = parts[2]?.trim() || '0';
        const amount = parseFloat(rawAmount.replace(/[R$\s]/g, '').replace(',', '.')) || 0;
        
        if (Math.abs(amount) > 0) {
          const isReceita = amount < 0;
          const parcela = title.match(/parcela\s*(\d+)\/(\d+)/i) || title.match(/(\d+)\/(\d+)$/);
          
          data.push({
            date, title,
            amount: Math.abs(amount),
            isReceita,
            categoria: categorizeFromTitle(title),
            parcela: parcela ? parcela[1] : null,
            totalParcelas: parcela ? parcela[2] : null
          });
        }
      }
    }
    
    pendingCSVData = data;
    
    // Preview
    const countEl = document.getElementById('csv-count');
    const previewEl = document.getElementById('csv-preview');
    const listEl = document.getElementById('csv-preview-list');
    const btnEl = document.getElementById('btn-import');
    
    if (countEl) countEl.textContent = data.length;
    if (previewEl) previewEl.style.display = data.length ? 'block' : 'none';
    if (listEl) {
      listEl.innerHTML = data.slice(0, 20).map(d => 
        '<tr style="color:' + (d.isReceita ? 'var(--green)' : 'var(--red)') + '">' +
        '<td>' + d.date + '</td>' +
        '<td>' + d.title + '</td>' +
        '<td>' + (d.isReceita ? '+' : '-') + 'R$ ' + d.amount.toFixed(2) + '</td>' +
        '<td>' + (d.parcela || '-') + '</td></tr>'
      ).join('');
    }
    if (btnEl) btnEl.disabled = false;
  };
  reader.readAsText(file);
}

async function importCSV() {
  if (!pendingCSVData?.length) return;
  const mes = document.getElementById('import-mes')?.value || currentMonth;
  let countGastos = 0, countReceitas = 0;
  
  for (const item of pendingCSVData) {
    try {
      if (item.isReceita) {
        await client.from('receitas').insert({ user_id: user.id, tipo: 'Transferência/Pix', valor: item.amount, data: item.date, mes });
        countReceitas++;
      } else {
        await client.from('gastos').insert({ user_id: user.id, descricao: item.title, valor: item.amount, data: item.date, categoria: item.categoria, mes });
        countGastos++;
      }
    } catch(e) { console.error('Import error:', e); }
  }
  
  closeModal('modal-import');
  showToast(countGastos + ' gastos e ' + countReceitas + ' receitas importados', 'success');
  pendingCSVData = null;
  
  // Recarregar página atual
  const fn = window['load' + currentPage.charAt(0).toUpperCase() + currentPage.slice(1)];
  if (fn) fn();
}

// ===== DRAG AND DROP =====
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('upload-zone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag');
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        const input = document.getElementById('csv-file');
        if (input) { input.files = e.dataTransfer.files; onFileSelect(input); }
      }
    });
  }
});
