let currentPage = 'dashboard';
let currentMonth = new Date().toISOString().slice(0, 7);

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('[data-page="' + page + '"]').classList.add('active');
  const titles = { dashboard: 'Dashboard', faturas: 'Faturas', parcelas: 'Parcelas', cartoes: 'Cartões', receitas: 'Receitas', gastos: 'Gastos' };
  document.getElementById('page-title').textContent = titles[page] || page;
  const fn = window['load' + page.charAt(0).toUpperCase() + page.slice(1)];
  if (fn) fn();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function openImportModal() { openModal('modal-import'); }

function onMonthChange() {
  currentMonth = document.getElementById('month-select').value;
  const fn = window['load' + currentPage.charAt(0).toUpperCase() + currentPage.slice(1)];
  if (fn) fn();
}

// Add modal (receita/gasto)
function openAddModal(tipo) {
  document.getElementById('form-tipo').value = tipo;
  document.getElementById('add-modal-title').textContent = tipo === 'receita' ? 'Nova receita' : 'Novo gasto';
  document.getElementById('add-modal-desc').style.display = tipo === 'receita' ? 'none' : 'block';
  document.getElementById('add-modal-cat').style.display = tipo === 'receita' ? 'none' : 'block';
  document.getElementById('add-modal-data').style.display = tipo === 'receita' ? 'none' : 'block';
  openModal('modal-add');
}

async function saveReceita() {
  const id = document.getElementById('add-edit-id').value;
  const valor = parseFloat(document.getElementById('add-valor').value);
  if (!valor) return showToast('Informe o valor', 'error');
  const payload = { user_id: user.id, tipo: document.getElementById('add-tipo').value, valor, mes: currentMonth };
  if (id) { await client.from('receitas').update(payload).eq('id', id); }
  else { await client.from('receitas').insert(payload); }
  closeModal('modal-add');
  showToast(id ? 'Receita atualizada' : 'Receita adicionada', 'success');
  loadReceitas();
}

async function saveGasto() {
  const id = document.getElementById('add-edit-id').value;
  const valor = parseFloat(document.getElementById('add-valor').value);
  const descricao = document.getElementById('add-desc').value;
  const categoria = document.getElementById('add-cat').value;
  const data = document.getElementById('add-data').value;
  if (!valor) return showToast('Informe o valor', 'error');
  const payload = { user_id: user.id, valor, descricao, categoria, data, mes: currentMonth };
  if (id) { await client.from('gastos').update(payload).eq('id', id); }
  else { await client.from('gastos').insert(payload); }
  closeModal('modal-add');
  showToast(id ? 'Gasto atualizado' : 'Gasto adicionado', 'success');
  loadGastos();
}

// Delete
function openDeleteModal(tipo, id) {
  document.getElementById('delete-id').value = id;
  document.getElementById('delete-type').value = tipo;
  openModal('modal-delete');
}

async function confirmDelete() {
  const id = document.getElementById('delete-id').value;
  const tipo = document.getElementById('delete-type').value;
  await client.from(tipo).delete().eq('id', id);
  closeModal('modal-delete');
  showToast('Item removido', 'success');
  const fn = window['load' + currentPage.charAt(0).toUpperCase() + currentPage.slice(1)];
  if (fn) fn();
}

// CSV Import
let pendingCSVData = null;

function onFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const lines = e.target.result.split('\n');
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length >= 3) {
        const date = cols[0]?.trim();
        const title = cols[1]?.trim() || '';
        const amount = Math.abs(parseFloat(cols[2]?.trim() || 0));
        const match = title.match(/(\d+)\/(\d+)$/);
        data.push({ date, title, amount, parcela: match ? match[1] : null, total: match ? match[2] : null });
      }
    }
    pendingCSVData = data;
    document.getElementById('csv-count').textContent = data.length;
    document.getElementById('csv-preview').style.display = 'block';
    document.getElementById('csv-preview-list').innerHTML = data.slice(0, 20).map(d => 
      '<tr><td>' + d.date + '</td><td>' + d.title + '</td><td>R$ ' + d.amount.toFixed(2) + '</td><td>' + (d.parcela || '-') + '</td></tr>').join('');
    document.getElementById('btn-import').disabled = false;
  };
  reader.readAsText(file);
}

async function importCSV() {
  if (!pendingCSVData || !pendingCSVData.length) return;
  const mes = document.getElementById('import-mes').value || currentMonth;
  for (const item of pendingCSVData) {
    await client.from('gastos').insert({ user_id: user.id, descricao: item.title, valor: item.amount, data: item.date, categoria: 'Importado', mes });
  }
  closeModal('modal-import');
  showToast(pendingCSVData.length + ' gastos importados', 'success');
  pendingCSVData = null;
  loadGastos();
}

// Cartões
const cardColors = ['#5B6EF5','#8B5CF6','#10D98A','#F0456A','#F5A623','#3B82F6','#EC4899','#14B8A6'];

function initColorSwatches() {
  const container = document.getElementById('color-swatches');
  if (!container) return;
  cardColors.forEach((color, i) => {
    const s = document.createElement('div');
    s.className = 'color-swatch' + (i === 0 ? ' active' : '');
    s.style.background = color;
    s.dataset.color = color;
    s.onclick = () => { document.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active')); s.classList.add('active'); };
    container.appendChild(s);
  });
}

async function saveCartao() {
  const id = document.getElementById('cartao-edit-id').value;
  const nome = document.getElementById('cartao-nome').value;
  const bandeira = document.getElementById('cartao-bandeira').value;
  const limite = parseFloat(document.getElementById('cartao-limite').value) || 0;
  const venc = parseInt(document.getElementById('cartao-venc').value) || 1;
  const fech = parseInt(document.getElementById('cartao-fech').value) || 1;
  const cor = document.querySelector('.color-swatch.active')?.dataset.color || cardColors[0];
  if (!nome) return showToast('Informe o nome do cartao', 'error');
  const payload = { user_id: user.id, nome, bandeira, limite, vencimento: venc, fechamento: fech, cor };
  if (id) { await client.from('cartoes').update(payload).eq('id', id); }
  else { await client.from('cartoes').insert(payload); }
  closeModal('modal-cartao');
  showToast(id ? 'Cartao atualizado' : 'Cartao adicionado', 'success');
  loadCartoes();
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

// Categoria
function openCategoriaModal(gasto) {
  document.getElementById('cat-item-id').value = gasto.id;
  document.getElementById('cat-select').value = gasto.categoria || 'Outros';
  openModal('modal-categoria');
}

async function saveCategoria() {
  const id = document.getElementById('cat-item-id').value;
  const cat = document.getElementById('cat-select').value;
  await client.from('gastos').update({ categoria: cat }).eq('id', id);
  closeModal('modal-categoria');
  showToast('Categoria atualizada', 'success');
  loadGastos();
}

// Toast
function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'info');
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// User info
async function loadUserInfo() {
  const { data } = await client.auth.getUser();
  if (data?.user) {
    user = data.user;
    document.getElementById('user-name').textContent = data.user.user_metadata?.nome || data.user.email;
    document.getElementById('user-email').textContent = data.user.email;
    document.getElementById('user-avatar').textContent = (data.user.user_metadata?.nome || data.user.email).charAt(0).toUpperCase();
  }
}

// Month selector
function initMonthSelector() {
  const sel = document.getElementById('month-select');
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    sel.innerHTML += '<option value="' + val + '"' + (val === currentMonth ? ' selected' : '') + '>' + label + '</option>';
  }
}

// Drag and drop CSV
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('upload-zone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file) { document.getElementById('csv-file').files = e.dataTransfer.files; onFileSelect(document.getElementById('csv-file')); }
    });
  }
});
