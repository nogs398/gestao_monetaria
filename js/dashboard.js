// =============================================
// js/dashboard.js — Lógica principal
// =============================================

let currentUser = null;
let currentMes = getCurrentMesRef();
let allCartoes = [];
let allFaturas = [];
let allReceitas = [];
let allGastos = [];
let chartCat = null;
let chartMensal = null;
let selectedColor = CARD_COLORS[0];
let csvParsed = [];

// =============================================
// INIT
// =============================================
async function init() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return window.location.href = 'login.html';
  currentUser = user;

  // Load profile
  const { data: profile } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const nome = profile?.nome || user.email.split('@')[0];
  document.getElementById('user-name').textContent = nome;
  document.getElementById('user-email').textContent = user.email;
  document.getElementById('user-avatar').textContent = nome[0].toUpperCase();

  // Month selector
  populateMonthSelect('month-select', currentMes);

  // Load data
  await loadAll();
  renderPage('dashboard');
}

async function logout() {
  await client.auth.signOut();
  window.location.href = 'login.html';
}

// =============================================
// DATA LOADING
// =============================================
async function loadAll() {
  await Promise.all([
    loadCartoes(),
    loadFaturas(),
    loadReceitas(),
    loadGastos()
  ]);
}

async function loadCartoes() {
  const { data, error } = await client.from('cartoes').select('*').eq('user_id', currentUser.id).order('created_at');
  if (error) { console.warn('Tabela cartoes:', error.message); allCartoes = []; return; }
  allCartoes = data || [];
}

async function loadFaturas() {
  const { data, error } = await client.from('faturas_itens').select('*').eq('user_id', currentUser.id).order('data', { ascending: false });
  if (error) { console.warn('Tabela faturas_itens:', error.message); allFaturas = []; return; }
  allFaturas = data || [];
}

async function loadReceitas() {
  const { data, error } = await client.from('receitas').select('*').eq('user_id', currentUser.id).order('data', { ascending: false });
  if (error) { console.warn('Tabela receitas:', error.message); allReceitas = []; return; }
  allReceitas = data || [];
}

async function loadGastos() {
  const { data, error } = await client.from('gastos').select('*').eq('user_id', currentUser.id).order('data', { ascending: false });
  if (error) { console.warn('Tabela gastos:', error.message); allGastos = []; return; }
  allGastos = data || [];
}

// =============================================
// NAVIGATION
// =============================================
const PAGE_CONFIG = {
  dashboard: { title: 'Dashboard', subtitle: 'Visão geral das suas finanças', action: null },
  faturas:   { title: 'Faturas', subtitle: 'Lançamentos importados do CSV', action: '⬆️ Importar CSV' },
  parcelas:  { title: 'Parcelas futuras', subtitle: 'Projeção dos seus parcelamentos', action: null },
  cartoes:   { title: 'Cartões', subtitle: 'Gerencie seus cartões de crédito', action: '+ Novo cartão' },
  receitas:  { title: 'Receitas', subtitle: 'Entradas e salários', action: null },
  gastos:    { title: 'Gastos manuais', subtitle: 'Despesas sem cartão', action: null },
  planejamento: { title: 'Planejamento', subtitle: 'Divisão de salário e adiantamento por período', action: null },
};

function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  renderPage(page);
}

function renderPage(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');

  const cfg = PAGE_CONFIG[page];
  document.getElementById('page-title').textContent = cfg.title;
  document.getElementById('page-subtitle').textContent = cfg.subtitle;

  const actionBtn = document.getElementById('topbar-action-btn');
  if (cfg.action) {
    actionBtn.style.display = 'inline-flex';
    actionBtn.textContent = cfg.action;
    actionBtn.onclick = page === 'cartoes' ? openModalCartao : openImportModal;
  } else {
    actionBtn.style.display = 'none';
  }

  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'faturas':   renderFaturas(); break;
    case 'parcelas':  renderParcelas(); break;
    case 'cartoes':   renderCartoes(); break;
    case 'receitas':  renderReceitas(); break;
    case 'gastos':    renderGastos(); break;
    case 'planejamento':  renderPlanejamento(); break;
  }
}

function onMonthChange() {
  currentMes = document.getElementById('month-select').value;
  const active = document.querySelector('.nav-item.active')?.dataset?.page || 'dashboard';
  renderPage(active);
}

// =============================================
// FUNÇÃO CENTRAL: projeta quais itens caem em um mês
// =============================================
function getFaturasDoMes(mes) {
  const result = [];
  allFaturas.forEach(item => {
    const baseRef = item.mes_referencia;
    if (!baseRef) return;
    if (item.parcela_total <= 1) {
      if (baseRef === mes) result.push({ ...item });
    } else {
      const diffMeses = monthDiff(baseRef, mes);
      const parcelaNoMes = item.parcela_atual + diffMeses;
      if (parcelaNoMes >= 1 && parcelaNoMes <= item.parcela_total) {
        result.push({ ...item, parcela_atual: parcelaNoMes, _projetado: diffMeses !== 0 });
      }
    }
  });
  const seen = new Map();

  result.forEach(item => {
    const key = [
      normDesc(item.descricao),
      Number(item.valor).toFixed(2),
      item.parcela_total,
      item.cartao_id || 'sem-cartao'
    ].join('_');

    const existing = seen.get(key);

    if (!existing || item.id > existing.id) {
      seen.set(key, item);
    }
  });

  return Array.from(seen.values());
}

function monthDiff(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function normDesc(desc) {
  return (desc || '').replace(/\s*-?\s*[Pp]arcela\s+\d+\/\d+/g, '').trim().toLowerCase();
}

// =============================================
// DASHBOARD
// =============================================
function renderDashboard() {
  const faturasMes = getFaturasDoMes(currentMes);
  const receitasMes = allReceitas.filter(r => getMesRefFromReceita(r) === currentMes);
  const gastosMes = allGastos.filter(g => getMesRefFromGasto(g) === currentMes);

  const totalFaturas = faturasMes.reduce((s, f) => s + Number(f.valor), 0);
  const totalReceitas = receitasMes.reduce((s, r) => s + Number(r.valor), 0);
  const totalGastos = gastosMes.reduce((s, g) => s + Number(g.valor), 0);
  const saldo = totalReceitas - totalFaturas - totalGastos;

  document.getElementById('kpi-saldo').textContent = fmtBRL(saldo);
  document.getElementById('kpi-saldo').className = `card-value ${saldo >= 0 ? 'green' : 'red'}`;
  document.getElementById('kpi-receitas').textContent = fmtBRL(totalReceitas);
  document.getElementById('kpi-faturas').textContent = fmtBRL(totalFaturas);
  document.getElementById('kpi-gastos').textContent = fmtBRL(totalGastos);

  const deltaEl = document.getElementById('kpi-saldo-delta');
  if (saldo !== 0) {
    const pct = totalReceitas > 0 ? Math.abs(saldo / totalReceitas * 100).toFixed(0) : 0;
    deltaEl.className = `card-delta ${saldo >= 0 ? 'up' : 'down'}`;
    deltaEl.innerHTML = `${saldo >= 0 ? '▲' : '▼'} ${pct}% do salário`;
  } else {
    deltaEl.innerHTML = '';
  }

  renderChartCat(faturasMes, gastosMes);
  renderChartMensal();
  renderTopGastos(faturasMes, gastosMes);
}

function renderTopGastos(faturasMes, gastosMes) {
  const tbody = document.getElementById('top-gastos-list');
  const combined = [
    ...faturasMes.map(f => ({ ...f, _origem: 'fatura' })),
    ...gastosMes.map(g => ({ ...g, _origem: 'gasto', cartao_id: null }))
  ].sort((a, b) => Number(b.valor) - Number(a.valor)).slice(0, 10);

  if (!combined.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><span class="empty-icon">📭</span><p>Nenhum gasto no mês</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = combined.map(item => {
    const cartao = allCartoes.find(c => c.id === item.cartao_id);
    const parcela = item.parcela_total > 1 ? `<span class="badge badge-parcela">${item.parcela_atual}/${item.parcela_total}</span>` : '';
    return `<tr>
      <td>${fmtDate(item.data)}</td>
      <td>${item.descricao} ${parcela}</td>
      <td><span class="badge badge-categoria">${item.categoria || 'Outros'}</span></td>
      <td>${cartao ? `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:8px;height:8px;border-radius:50%;background:${cartao.cor}"></span>${cartao.nome}</span>` : '—'}</td>
      <td style="text-align:right;color:var(--red);font-weight:600">${fmtBRL(item.valor)}</td>
    </tr>`;
  }).join('');
}

function renderChartCat(faturasMes, gastosMes) {
  const all = [...faturasMes, ...gastosMes];
  const cats = {};
  all.forEach(item => {
    const cat = item.categoria || 'Outros';
    cats[cat] = (cats[cat] || 0) + Number(item.valor);
  });

  const labels = Object.keys(cats);
  const values = Object.values(cats);
  const colors = labels.map(l => CATEGORY_COLORS[l] || '#6B7599');

  if (chartCat) chartCat.destroy();
  const ctx = document.getElementById('chart-cat');
  chartCat = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#111521' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#6B7599', font: { size: 12 }, padding: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${fmtBRL(ctx.raw)}` } }
      },
      cutout: '65%'
    }
  });
}

function renderChartMensal() {
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(addMonths(currentMes, -i));

  const receitas = months.map(m => allReceitas.filter(r => getMesRefFromReceita(r) === m).reduce((s, r) => s + Number(r.valor), 0));
  const despesas = months.map(m => {
    const fat = getFaturasDoMes(m).reduce((s, f) => s + Number(f.valor), 0);
    const gst = allGastos.filter(g => getMesRefFromGasto(g) === m).reduce((s, g) => s + Number(g.valor), 0);
    return fat + gst;
  });

  if (chartMensal) chartMensal.destroy();
  const ctx = document.getElementById('chart-mensal');
  chartMensal = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => getMesLabel(m).split(' ')[0]),
      datasets: [
        { label: 'Receitas', data: receitas, backgroundColor: 'rgba(16,217,138,0.7)', borderRadius: 6 },
        { label: 'Despesas', data: despesas, backgroundColor: 'rgba(240,69,106,0.7)', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#6B7599', font: { size: 12 } } }, tooltip: { callbacks: { label: ctx => ` ${fmtBRL(ctx.raw)}` } } },
      scales: {
        x: { ticks: { color: '#6B7599' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#6B7599', callback: v => `R$${(v/1000).toFixed(0)}k` }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

// =============================================
// FATURAS
// =============================================
function renderFaturas() {
  document.getElementById('faturas-mes-label').textContent = getMesLabel(currentMes);
  const faturasMes = getFaturasDoMes(currentMes);

  const resumoEl = document.getElementById('cartoes-resumo');
  if (allCartoes.length) {
    resumoEl.innerHTML = allCartoes.map(c => {
      const total = faturasMes.filter(f => f.cartao_id === c.id).reduce((s, f) => s + Number(f.valor), 0);
      const pct = c.limite > 0 ? Math.min((total / c.limite) * 100, 100) : 0;
      return `<div class="card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${c.cor};flex-shrink:0"></span>
          <span style="font-size:13px;font-weight:600;">${c.nome}</span>
          <span style="font-size:11px;color:var(--muted);margin-left:auto">${c.bandeira}</span>
        </div>
        <div class="card-value red" style="font-size:22px;">${fmtBRL(total)}</div>
        ${c.limite > 0 ? `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">Limite: ${fmtBRL(c.limite)} · ${pct.toFixed(0)}% usado</div>` : ''}
      </div>`;
    }).join('');
  } else {
    resumoEl.innerHTML = '';
  }

  renderFaturasList();
}

function renderFaturasList() {
  const busca = (document.getElementById('busca-fatura')?.value || '').toLowerCase();
  const faturasMes = getFaturasDoMes(currentMes);
  const filtered = busca ? faturasMes.filter(f => f.descricao.toLowerCase().includes(busca)) : faturasMes;

  const tbody = document.getElementById('faturas-list');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">📭</span><p>Nenhum item encontrado. Importe um CSV para começar.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const cartao = allCartoes.find(c => c.id === item.cartao_id);
    const parcela = item.parcela_total > 1
      ? `<span class="badge badge-parcela">${item.parcela_atual}/${item.parcela_total}</span>`
      : '<span class="badge badge-categoria">À vista</span>';
    return `<tr>
      <td>${fmtDate(item.data)}</td>
      <td>${item.descricao}</td>
      <td>${cartao ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:13px;"><span style="width:8px;height:8px;border-radius:50%;background:${cartao.cor}"></span>${cartao.nome}</span>` : '—'}</td>
      <td>
        <span class="badge badge-categoria" style="cursor:pointer;" onclick="openCatModal(${item.id}, '${item.categoria || 'Outros'}')">
          ${item.categoria || 'Outros'} ✏️
        </span>
      </td>
      <td>${parcela}</td>
      <td style="text-align:right;color:var(--red);font-weight:600;">${fmtBRL(item.valor)}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteFaturaItem(${item.id})">✕</button>
      </td>
    </tr>`;
  }).join('');
}

async function deleteFaturaItem(id) {
  if (!confirm('Remover este item?')) return;
  await client.from('faturas_itens').delete().eq('id', id);
  allFaturas = allFaturas.filter(f => f.id !== id);
  renderFaturas();
  showToast('Item removido');
}

// =============================================
// PARCELAS FUTURAS
// =============================================
function renderParcelas() {
  const parcelados = allFaturas.filter(f => f.parcela_total > 1);
  if (!parcelados.length) {
    document.getElementById('timeline-container').innerHTML =
      '<div class="empty-state"><span class="empty-icon">📅</span><p>Nenhuma parcela encontrada. Importe um CSV com parcelamentos.</p></div>';
    return;
  }

  const mesesSet = new Set();
  parcelados.forEach(item => {
    for (let p = item.parcela_atual; p <= item.parcela_total; p++) {
      const diff = p - item.parcela_atual;
      const mesRef = addMonths(item.mes_referencia, diff);
      if (mesRef >= currentMes) mesesSet.add(mesRef);
    }
  });

  if (!mesesSet.size) {
    document.getElementById('timeline-container').innerHTML =
      '<div class="empty-state"><span class="empty-icon">✅</span><p>Nenhuma parcela futura encontrada. Tudo pago!</p></div>';
    return;
  }

  const sortedMonths = Array.from(mesesSet).sort();
  let totalFuturo = 0;

  const cardsHtml = sortedMonths.map(mes => {
    const itensMes = getFaturasDoMes(mes).filter(f => f.parcela_total > 1);
    if (!itensMes.length) return '';
    const total = itensMes.reduce((s, i) => s + Number(i.valor), 0);
    totalFuturo += total;
    const isCurrent = mes === currentMes;

    return `<div class="card" style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="font-size:15px;color:${isCurrent ? 'var(--accent)' : 'var(--text)'}">
          ${getMesLabel(mes)}
          ${isCurrent ? '<span style="font-size:11px;background:rgba(91,110,245,0.2);color:var(--accent);padding:2px 8px;border-radius:20px;margin-left:8px;">mês atual</span>' : ''}
        </h3>
        <span style="font-size:15px;font-weight:700;color:var(--red)">${fmtBRL(total)}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${itensMes.map(item => {
          const cartao = allCartoes.find(c => c.id === item.cartao_id);
          const nomeClean = item.descricao.replace(/\s*-?\s*[Pp]arcela\s+\d+\/\d+/g, '').trim();
          return `<div class="timeline-item">
            <span class="timeline-item-name">${nomeClean}</span>
            <span class="timeline-item-parcela">${item.parcela_atual}/${item.parcela_total}</span>
            ${cartao ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);margin-right:8px;"><span style="width:6px;height:6px;border-radius:50%;background:${cartao.cor}"></span>${cartao.nome}</span>` : ''}
            <span class="timeline-item-valor">${fmtBRL(item.valor)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  const resumo = `<div class="card" style="margin-bottom:20px;background:linear-gradient(135deg,rgba(91,110,245,0.12),rgba(139,92,246,0.08));border-color:rgba(91,110,245,0.25);">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Total em parcelas futuras</div>
        <div style="font-family:'Syne',sans-serif;font-size:28px;font-weight:700;color:var(--red);">${fmtBRL(totalFuturo)}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;color:var(--muted);font-weight:600;margin-bottom:4px;">Meses com parcelas</div>
        <div style="font-size:24px;font-weight:700;">${sortedMonths.length}</div>
      </div>
    </div>
  </div>`;

  document.getElementById('timeline-container').innerHTML = resumo + cardsHtml;
}

// =============================================
// CARTÕES
// =============================================
function renderCartoes() {
  const list = document.getElementById('cartoes-list');
  const cartoesHTML = allCartoes.map(c => `
    <div class="credit-card" style="background:linear-gradient(135deg, ${c.cor}, ${c.cor}99);" onclick="openModalCartao(${c.id})">
      <div>
        <div class="card-brand">${c.bandeira}</div>
        <div class="card-nome">${c.nome}</div>
      </div>
      <div class="card-footer">
        <div>
          <div class="card-label">Vencimento</div>
          <div class="card-info-value">Dia ${c.vencimento}</div>
        </div>
        <div>
          <div class="card-label">Fechamento</div>
          <div class="card-info-value">Dia ${c.fechamento}</div>
        </div>
        ${c.limite > 0 ? `<div>
          <div class="card-label">Limite</div>
          <div class="card-info-value">${fmtBRL(c.limite)}</div>
        </div>` : ''}
      </div>
    </div>`).join('');

  list.innerHTML = cartoesHTML + `
    <button class="card-add-btn" onclick="openModalCartao()">
      <span style="font-size:28px;">+</span>
      <span style="font-size:14px;font-weight:600;">Adicionar cartão</span>
    </button>`;
}

function openModalCartao(cartaoId) {
  selectedColor = CARD_COLORS[0];
  const swatches = document.getElementById('color-swatches');
  swatches.innerHTML = CARD_COLORS.map(c => `
    <div class="color-swatch ${c === selectedColor ? 'selected' : ''}"
      style="background:${c}" onclick="selectColor('${c}')"></div>`).join('');

  document.getElementById('cartao-edit-id').value = cartaoId || '';
  if (cartaoId) {
    const c = allCartoes.find(x => x.id === cartaoId);
    if (!c) return;
    document.getElementById('cartao-modal-title').textContent = '✏️ Editar cartão';
    document.getElementById('cartao-nome').value = c.nome;
    document.getElementById('cartao-bandeira').value = c.bandeira;
    document.getElementById('cartao-limite').value = c.limite;
    document.getElementById('cartao-venc').value = c.vencimento;
    document.getElementById('cartao-fech').value = c.fechamento;
    selectedColor = c.cor;
    swatches.querySelectorAll('.color-swatch').forEach(el => {
      el.classList.toggle('selected', el.style.background === c.cor || el.style.background === `rgb(${hexToRgb(c.cor)})`);
    });
  } else {
    document.getElementById('cartao-modal-title').textContent = '💳 Novo cartão';
    document.getElementById('cartao-nome').value = '';
    document.getElementById('cartao-bandeira').value = 'Visa';
    document.getElementById('cartao-limite').value = '';
    document.getElementById('cartao-venc').value = '10';
    document.getElementById('cartao-fech').value = '3';
  }
  openModal('modal-cartao');
}

function selectColor(color) {
  selectedColor = color;
  document.querySelectorAll('.color-swatch').forEach(el => {
    el.classList.toggle('selected', el.style.background === color || el.style.background === `rgb(${hexToRgb(color)})`);
  });
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r}, ${g}, ${b}`;
}

async function saveCartao() {
  const id = document.getElementById('cartao-edit-id').value;
  const data = {
    user_id: currentUser.id,
    nome: document.getElementById('cartao-nome').value,
    bandeira: document.getElementById('cartao-bandeira').value,
    limite: parseFloat(document.getElementById('cartao-limite').value) || 0,
    vencimento: parseInt(document.getElementById('cartao-venc').value) || 10,
    fechamento: parseInt(document.getElementById('cartao-fech').value) || 3,
    cor: selectedColor
  };
  if (!data.nome) return showToast('Nome é obrigatório', 'error');

  if (id) {
    await client.from('cartoes').update(data).eq('id', parseInt(id));
    showToast('Cartão atualizado!');
  } else {
    await client.from('cartoes').insert(data);
    showToast('Cartão adicionado!');
  }
  closeModal('modal-cartao');
  await loadCartoes();
  renderCartoes();
  populateImportCartaoSelect();
}

// =============================================
// RECEITAS
// =============================================
function getMesRefFromReceita(r) {
  if (r.mes_referencia) return r.mes_referencia;
  if (r.data) return r.data.substring(0, 7);
  if (r.created_at) return r.created_at.substring(0, 7);
  return currentMes;
}

function renderReceitas() {
  const receitasMes = allReceitas.filter(r => getMesRefFromReceita(r) === currentMes);
  const total = receitasMes.reduce((s, r) => s + Number(r.valor), 0);
  document.getElementById('receitas-mes-label').textContent = getMesLabel(currentMes);
  document.getElementById('total-receitas-page').textContent = fmtBRL(total);

  const [y, m] = currentMes.split('-');
  const today = new Date();
  const isCurrentMonth = currentMes === getCurrentMesRef();
  document.getElementById('rec-data').value = isCurrentMonth
    ? today.toISOString().split('T')[0]
    : `${y}-${m}-01`;

  const tbody = document.getElementById('receitas-list');
  if (!receitasMes.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><span class="empty-icon">💵</span><p>Nenhuma receita em ${getMesLabel(currentMes)}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = receitasMes.map(r => `
    <tr>
      <td>${r.descricao}</td>
      <td>${fmtDate(r.data)}</td>
      <td style="text-align:right;color:var(--green);font-weight:600;">${fmtBRL(r.valor)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteReceita(${r.id})">✕</button></td>
    </tr>`).join('');
}

async function addReceita() {
  const desc = document.getElementById('rec-desc').value;
  const valor = parseFloat(document.getElementById('rec-valor').value);
  const data = document.getElementById('rec-data').value;
  if (!desc || !valor || !data) return showToast('Preencha todos os campos', 'error');

  const { error } = await client.from('receitas').insert({
    user_id: currentUser.id,
    descricao: desc,
    valor,
    data,
    mes_referencia: currentMes
  });

  if (error) return showToast('Erro ao salvar: ' + error.message, 'error');

  document.getElementById('rec-desc').value = '';
  document.getElementById('rec-valor').value = '';
  showToast('Receita adicionada!');
  await loadReceitas();
  renderReceitas();
}

async function deleteReceita(id) {
  await client.from('receitas').delete().eq('id', id);
  allReceitas = allReceitas.filter(r => r.id !== id);
  renderReceitas();
  showToast('Receita removida');
}

// =============================================
// GASTOS MANUAIS
// =============================================
function getMesRefFromGasto(g) {
  if (g.mes_referencia) return g.mes_referencia;
  if (g.data) return g.data.substring(0, 7);
  if (g.created_at) return g.created_at.substring(0, 7);
  return currentMes;
}

function renderGastos() {
  const gastosMes = allGastos.filter(g => getMesRefFromGasto(g) === currentMes);
  const total = gastosMes.reduce((s, g) => s + Number(g.valor), 0);
  document.getElementById('gastos-mes-label').textContent = getMesLabel(currentMes);
  document.getElementById('total-gastos-page').textContent = fmtBRL(total);

  const [y, m] = currentMes.split('-');
  const isCurrentMonth = currentMes === getCurrentMesRef();
  document.getElementById('gst-data').value = isCurrentMonth
    ? new Date().toISOString().split('T')[0]
    : `${y}-${m}-01`;

  const tbody = document.getElementById('gastos-list');
  if (!gastosMes.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><span class="empty-icon">🛍️</span><p>Nenhum gasto em ${getMesLabel(currentMes)}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = gastosMes.map(g => `
    <tr>
      <td>${g.descricao}</td>
      <td><span class="badge badge-categoria">${g.categoria}</span></td>
      <td>${fmtDate(g.data)}</td>
      <td style="text-align:right;color:var(--red);font-weight:600;">${fmtBRL(g.valor)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteGasto(${g.id})">✕</button></td>
    </tr>`).join('');
}

async function addGasto() {
  const desc = document.getElementById('gst-desc').value;
  const cat = document.getElementById('gst-cat').value;
  const valor = parseFloat(document.getElementById('gst-valor').value);
  const data = document.getElementById('gst-data').value;
  if (!desc || !valor || !data) return showToast('Preencha todos os campos', 'error');

  const { error } = await client.from('gastos').insert({
    user_id: currentUser.id,
    descricao: desc,
    categoria: cat,
    valor,
    data,
    mes_referencia: currentMes
  });

  if (error) return showToast('Erro ao salvar: ' + error.message, 'error');

  document.getElementById('gst-desc').value = '';
  document.getElementById('gst-valor').value = '';
  showToast('Gasto adicionado!');
  await loadGastos();
  renderGastos();
}

async function deleteGasto(id) {
  await client.from('gastos').delete().eq('id', id);
  allGastos = allGastos.filter(g => g.id !== id);
  renderGastos();
  showToast('Gasto removido');
}

// =============================================
// MODAL CATEGORIA
// =============================================
function openCatModal(itemId, catAtual) {
  document.getElementById('cat-item-id').value = itemId;
  document.getElementById('cat-select').value = catAtual;
  openModal('modal-categoria');
}

async function saveCategoria() {
  const id = parseInt(document.getElementById('cat-item-id').value);
  const cat = document.getElementById('cat-select').value;
  await client.from('faturas_itens').update({ categoria: cat }).eq('id', id);
  const item = allFaturas.find(f => f.id === id);
  if (item) item.categoria = cat;
  closeModal('modal-categoria');
  showToast('Categoria atualizada!');
  renderFaturas();
}

// =============================================
// IMPORT — CSV + PDF
// =============================================
function openImportModal() {
  csvParsed = [];
  document.getElementById('csv-file').value = '';
  document.getElementById('upload-label').textContent = 'Arraste o arquivo aqui ou clique para selecionar';
  document.getElementById('csv-preview').style.display = 'none';
  document.getElementById('btn-import').disabled = true;
  populateMonthSelect('import-mes', currentMes);
  populateImportCartaoSelect();
  updateToggleVisual();
  openModal('modal-import');
}

function updateToggleVisual() {
  const cb = document.getElementById('toggle-substituir');
  const track = document.getElementById('toggle-track');
  const thumb = document.getElementById('toggle-thumb');
  if (!cb || !track || !thumb) return;
  track.style.background = cb.checked ? 'var(--accent)' : '#374151';
  thumb.style.left = cb.checked ? '19px' : '3px';
}

document.addEventListener('change', e => {
  if (e.target.id === 'toggle-substituir') updateToggleVisual();
});

function populateImportCartaoSelect() {
  const sel = document.getElementById('import-cartao');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Selecione um cartão —</option>';
  allCartoes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.nome} (${c.bandeira})`;
    sel.appendChild(opt);
  });
}

function onFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('upload-label').textContent = `📄 ${file.name}`;
  if (file.name.toLowerCase().endsWith('.pdf')) {
    parsePDF(file);
  } else {
    const reader = new FileReader();
    reader.onload = e => parseCSV(e.target.result);
    reader.readAsText(file, 'UTF-8');
  }
}

// ---- CSV Parser (Nubank) ----
function parseCSV(text) {
  const lines = text.trim().split('\n');
  csvParsed = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g)?.map(c => c.replace(/^"|"$/g, '').trim()) || line.split(',').map(c => c.trim());
    if (cols.length < 3) continue;
    const [date, title, amount] = cols;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) continue;
    csvParsed.push({
      date,
      title,
      amount: val,
      parcela: parseParcela(title),
      categoria: detectCategoria(title)
    });
  }

  showBadge('CSV · Nubank');
  renderPreview();
}

// ---- PDF Parser (Itaú e outros) ----
async function parsePDF(file) {
  document.getElementById('upload-label').textContent = '⏳ Lendo PDF...';
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      fullText += content.items.map(i => i.str).join(' ') + '\n';
    }

    csvParsed = parseItauPDF(fullText);

    if (!csvParsed.length) {
      showToast('Nenhum lançamento encontrado no PDF. Verifique se é uma fatura do Itaú.', 'error');
      document.getElementById('upload-label').textContent = 'Arraste o arquivo aqui ou clique para selecionar';
      return;
    }

    showBadge('PDF · Itaú');
    renderPreview();
    document.getElementById('upload-label').textContent = `📄 ${file.name}`;
  } catch (err) {
    console.error(err);
    showToast('Erro ao ler o PDF: ' + err.message, 'error');
    document.getElementById('upload-label').textContent = 'Arraste o arquivo aqui ou clique para selecionar';
  }
}


function parseItauPDF(text) {
  const items = [];
  const mesRef = document.getElementById('import-mes').value;
  const [refYear, refMonth] = mesRef.split('-').map(Number);

  const cleanText = (text || '')
    .replace(/\*\*/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  const normalizeText = (s) => (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const norm = normalizeText(cleanText);

  // 1) Começar obrigatoriamente na seção de lançamentos atuais
  const startMarkers = [
    'lancamentos: compras e saques',
    'lancamentos compras e saques'
  ];

  let startIdx = -1;

  for (const marker of startMarkers) {
    const idx = norm.indexOf(marker);
    if (idx !== -1) {
      startIdx = idx;
      break;
    }
  }

  // Fallback: começa no primeiro lançamento após o cabeçalho DATA ESTABELECIMENTO
  if (startIdx === -1) {
    const headerIdx = norm.indexOf('data estabelecimento valor em r');
    if (headerIdx !== -1) {
      const afterHeader = cleanText.substring(headerIdx);
      const firstTransaction = afterHeader.match(/\d{2}\/\d{2}\s+[A-Za-z0-9]/);
      if (firstTransaction) {
        startIdx = headerIdx + firstTransaction.index;
      }
    }
  }

  if (startIdx === -1) {
    showToast('Não achei a seção de lançamentos atuais do Itaú.', 'error');
    console.warn('Texto Itaú extraído:', cleanText);
    return [];
  }

  // 2) Cortar ANTES dos totais e ANTES da seção "próximas faturas"
  // Isso evita importar parcelas futuras como se fossem da fatura atual.
  const endMarkers = [
    'lancamentos no cartao',
    'total dos lancamentos atuais',
    'compras parceladas - proximas faturas',
    'compras parceladas proximas faturas',
    'proxima fatura',
    'demais faturas',
    'total para proximas faturas',
    'limites de credito',
    'encargos cobrados nesta fatura'
  ];

  let endIdx = cleanText.length;

  for (const marker of endMarkers) {
    const idx = norm.indexOf(marker, startIdx + 1);
    if (idx !== -1 && idx < endIdx) {
      endIdx = idx;
    }
  }

  let section = cleanText.substring(startIdx, endIdx);

  // Remove cabeçalhos/sujeiras que o PDF pode jogar no meio
  section = section
    .replace(/GUILHERME\s+N\s+FERREIRA/gi, ' ')
    .replace(/DATA\s+ESTABELECIMENTO\s+VALOR\s+EM\s+R\$?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Captura lançamentos tipo:
  // 02/01 Shopee*SHOPEE* 04/12 333,25
  // 26/04 JUROS DE MORA 0,59
  const lineRegex = /(\d{2})\/(\d{2})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})(?=\s+\d{2}\/\d{2}\s+|$)/g;

  const seen = new Set();
  let match;

  while ((match = lineRegex.exec(section)) !== null) {
    const day = match[1];
    const month = match[2];

    let desc = match[3]
      .replace(/\s+/g, ' ')
      .trim();

    const val = parseFloat(
      match[4]
        .replace(/\./g, '')
        .replace(',', '.')
    );

    if (isNaN(val) || val <= 0) continue;
    if (!desc) continue;

    const descNorm = normalizeText(desc);

    // Segurança extra: se por algum motivo vier texto de futuras, ignora
    if (
      /compras parceladas|proximas faturas|proxima fatura|demais faturas|total para proximas faturas/i
        .test(descNorm)
    ) {
      continue;
    }

    // Ignora pagamentos e resumos
    if (
      /pagamento|pagamentos efetuados|total dos pagamentos|saldo|limite|fatura anterior|data estabelecimento|valor em r/i
        .test(descNorm)
    ) {
      continue;
    }

    // Se você NÃO quiser importar encargos/juros/multa, descomenta esse bloco:
    /*
    if (/encargos|juros|multa|iof|rotativo|refinanciament|financiamento|moratorio/i.test(descNorm)) {
      continue;
    }
    */

    let year = refYear;
    const mon = parseInt(month, 10);

    // Ex: fatura referência maio pode ter compras de dezembro/janeiro
    if (mon > refMonth + 1) {
      year = refYear - 1;
    }

    const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const parcela = parseParcela(desc);
    const categoria = detectCategoria(desc);

    const key = [
      date,
      descNorm,
      val.toFixed(2),
      parcela.atual,
      parcela.total
    ].join('|');

    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      date,
      title: desc,
      amount: val,
      parcela,
      categoria
    });
  }

  console.log('ITAU SECTION USADA:', section);
  console.log('ITAU ITENS:', items);
  console.log('ITAU TOTAL:', items.reduce((s, i) => s + i.amount, 0));

  return items;
}

function showBadge(label) {
  const badge = document.getElementById('import-source-badge');
  if (badge) { badge.textContent = label; badge.style.display = 'inline-flex'; }
}

function renderPreview() {
  document.getElementById('csv-count').textContent = csvParsed.length;
  document.getElementById('csv-preview').style.display = 'block';
  document.getElementById('btn-import').disabled = csvParsed.length === 0;

  const tbody = document.getElementById('csv-preview-list');
  tbody.innerHTML = csvParsed.slice(0, 8).map(item => `
    <tr>
      <td>${item.date}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.title}</td>
      <td style="color:var(--red)">${fmtBRL(item.amount)}</td>
      <td>${item.parcela.total > 1 ? `<span class="badge badge-parcela">${item.parcela.atual}/${item.parcela.total}</span>` : '—'}</td>
    </tr>`).join('');
  if (csvParsed.length > 8) {
    tbody.innerHTML += `<tr><td colspan="4" style="text-align:center;color:var(--muted);font-size:12px;">+ ${csvParsed.length - 8} itens...</td></tr>`;
  }
}

async function importFatura() {
  if (!csvParsed.length) return showToast('Nenhum dado para importar', 'error');
  const cartaoId = document.getElementById('import-cartao').value || null;
  const mesRef = document.getElementById('import-mes').value;
  const substituir = document.getElementById('toggle-substituir').checked;

  const btn = document.getElementById('btn-import');
  btn.innerHTML = '<span class="spinner"></span> Importando...';
  btn.disabled = true;

  if (substituir) {
    let query = client.from('faturas_itens')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('mes_referencia', mesRef);
    if (cartaoId) query = query.eq('cartao_id', parseInt(cartaoId));
    const { error: delError } = await query;
    if (delError) console.warn('Erro ao limpar mês anterior:', delError.message);
  }

  const rows = csvParsed.map(item => ({
    user_id: currentUser.id,
    cartao_id: cartaoId ? parseInt(cartaoId) : null,
    descricao: item.title,
    valor: item.amount,
    data: item.date,
    parcela_atual: item.parcela.atual,
    parcela_total: item.parcela.total,
    categoria: item.categoria,
    mes_referencia: mesRef
  }));

  const { error } = await client.from('faturas_itens').insert(rows);
  btn.innerHTML = 'Importar fatura';
  btn.disabled = false;

  if (error) return showToast('Erro ao importar: ' + error.message, 'error');

  showToast(`✅ ${rows.length} itens importados!`);
  closeModal('modal-import');
  await loadFaturas();
  renderPage('faturas');
}

// =============================================
// DRAG & DROP (fatura CSV/PDF)
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  setupDrop('upload-zone', 'csv-file', 'upload-label', (file) => {
    if (file.name.toLowerCase().endsWith('.pdf')) parsePDF(file);
    else { const r = new FileReader(); r.onload = e => parseCSV(e.target.result); r.readAsText(file,'UTF-8'); }
  });
  setupDrop('upload-zone-extrato', 'extrato-file', 'extrato-upload-label', (file) => {
    onExtratoFile(file);
  });
});

function setupDrop(zoneId, inputId, labelId, handler) {
  const zone = document.getElementById(zoneId);
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.pdf')) {
      document.getElementById(labelId).textContent = `📄 ${file.name}`;
      handler(file);
    }
  });
}

// =============================================
// IMPORTAR EXTRATO (gastos + receitas)
// =============================================
let extratoParsed = { gastos: [], receitas: [] };
let extratoTabAtiva = 'gastos';

function openImportExtratoModal() {
  extratoParsed = { gastos: [], receitas: [] };
  document.getElementById('extrato-file').value = '';
  document.getElementById('extrato-upload-label').textContent = 'Arraste o extrato aqui ou clique para selecionar';
  document.getElementById('extrato-preview').style.display = 'none';
  document.getElementById('btn-import-extrato').disabled = true;
  populateMonthSelect('extrato-mes', currentMes);
  openModal('modal-extrato');
}

function onExtratoSelect(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('extrato-upload-label').textContent = `📄 ${file.name}`;
  onExtratoFile(file);
}

async function onExtratoFile(file) {
  document.getElementById('extrato-upload-label').textContent = '⏳ Lendo arquivo...';
  try {
    if (file.name.toLowerCase().endsWith('.pdf')) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      let text = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const ct = await page.getTextContent();
        text += ct.items.map(i => i.str).join(' ') + '\n';
      }
      extratoParsed = parseExtratoText(text, 'pdf');
    } else {
      const text = await file.text();
      extratoParsed = parseExtratoCSV(text);
    }
    document.getElementById('extrato-upload-label').textContent = `📄 ${file.name}`;
    renderExtratoPrev();
  } catch(err) {
    showToast('Erro ao ler arquivo: ' + err.message, 'error');
    document.getElementById('extrato-upload-label').textContent = 'Arraste o extrato aqui ou clique para selecionar';
  }
}

function parseExtratoCSV(text) {
  const lines = text.trim().split('\n');
  const gastos = [], receitas = [];
  const header = lines[0].toLowerCase();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g)?.map(c => c.replace(/^"|"$/g,'').trim()) || line.split(',').map(c=>c.trim());
    if (cols.length < 3) continue;

    if (header.includes('date') && header.includes('title')) {
      const [date, title, amtStr] = cols;
      const val = parseFloat(amtStr);
      if (isNaN(val)) continue;
      if (val < 0) {
        receitas.push({ date, title, amount: Math.abs(val), categoria: detectCatReceita(title) });
      } else {
        gastos.push({ date, title, amount: val, categoria: detectCategoria(title) });
      }
    } else {
      const [date, title, amtStr, tipo] = cols;
      const val = Math.abs(parseFloat((amtStr||'').replace(',','.')));
      if (isNaN(val) || val === 0) continue;
      const isCredito = (tipo||'').toLowerCase().includes('créd') || (tipo||'').toLowerCase().includes('receb') || val < 0;
      if (isCredito) {
        receitas.push({ date, title, amount: val, categoria: detectCatReceita(title) });
      } else {
        gastos.push({ date, title, amount: val, categoria: detectCategoria(title) });
      }
    }
  }
  return { gastos, receitas };
}

function parseExtratoText(text, _tipo) {
  const gastos = [], receitas = [];
  const re = /(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+([\d]{1,3}(?:\.\d{3})*,\d{2})/g;
  const mesRef = document.getElementById('extrato-mes').value;
  const [refYear] = mesRef.split('-').map(Number);
  let match;
  while ((match = re.exec(text)) !== null) {
    const datePart = match[1];
    let desc = match[2].trim();
    const valStr = match[3].replace('.','').replace(',','.');
    const val = parseFloat(valStr);
    if (isNaN(val) || val <= 0) continue;
    if (/saldo|limite|total|fatura|vencimento|encargo|iof|juros|multa/i.test(desc)) continue;

    const parts = datePart.split('/');
    const day = parts[0], mon = parts[1];
    const year = parts[2] ? (parts[2].length === 2 ? '20'+parts[2] : parts[2]) : refYear;
    const date = `${year}-${mon}-${day}`;

    const ctx = text.substring(Math.max(0, match.index-30), match.index+match[0].length+30);
    const isCredito = /créd|crédito|recebid|pix rec|transfer.*rec|salário|salario|adiant/i.test(ctx+desc);

    if (isCredito) {
      receitas.push({ date, title: desc, amount: val, categoria: detectCatReceita(desc) });
    } else {
      gastos.push({ date, title: desc, amount: val, categoria: detectCategoria(desc) });
    }
  }
  return { gastos, receitas };
}

function detectCatReceita(desc) {
  const d = (desc||'').toLowerCase();
  if (/salário|salario|folha|pagamento emp/i.test(d)) return 'Salário';
  if (/adiant/i.test(d)) return 'Adiantamento';
  if (/freela|freelance|serviço|honorário/i.test(d)) return 'Freelance';
  if (/rendimento|invest|aplicação|resgate/i.test(d)) return 'Investimentos';
  if (/pix|transfer/i.test(d)) return 'Transferência';
  return 'Outros';
}

function renderExtratoPrev() {
  const { gastos, receitas } = extratoParsed;
  const totalG = gastos.reduce((s,g) => s+g.amount, 0);
  const totalR = receitas.reduce((s,r) => s+r.amount, 0);

  document.getElementById('extrato-total-gastos').textContent = fmtBRL(totalG);
  document.getElementById('extrato-count-gastos').textContent = `${gastos.length} itens`;
  document.getElementById('extrato-total-receitas').textContent = fmtBRL(totalR);
  document.getElementById('extrato-count-receitas').textContent = `${receitas.length} itens`;
  document.getElementById('extrato-preview').style.display = 'block';
  document.getElementById('btn-import-extrato').disabled = (gastos.length + receitas.length) === 0;

  switchExtratoTab('gastos');
}

function switchExtratoTab(tab) {
  extratoTabAtiva = tab;
  document.getElementById('etab-gastos').classList.toggle('active', tab==='gastos');
  document.getElementById('etab-receitas').classList.toggle('active', tab==='receitas');
  const items = extratoParsed[tab];
  const tbody = document.getElementById('extrato-preview-list');
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px;">Nenhum item detectado</td></tr>`;
    return;
  }
  tbody.innerHTML = items.slice(0, 10).map((item, idx) => `
    <tr>
      <td>${item.date}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.title}</td>
      <td><span class="badge badge-categoria">${item.categoria}</span></td>
      <td style="text-align:right;color:${tab==='gastos'?'var(--red)':'var(--green)'};font-weight:600;">${fmtBRL(item.amount)}</td>
      <td><button onclick="removeExtratoItem('${tab}',${idx})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;">✕</button></td>
    </tr>`).join('');
  if (items.length > 10) {
    tbody.innerHTML += `<tr><td colspan="5" style="text-align:center;color:var(--muted);font-size:12px;">+ ${items.length-10} itens</td></tr>`;
  }
}

function removeExtratoItem(tab, idx) {
  extratoParsed[tab].splice(idx, 1);
  renderExtratoPrev();
}

async function importExtrato() {
  const mesRef = document.getElementById('extrato-mes').value;
  const { gastos, receitas } = extratoParsed;
  const btn = document.getElementById('btn-import-extrato');
  btn.innerHTML = '<span class="spinner"></span> Salvando...';
  btn.disabled = true;

  let ok = 0, erros = 0;

  if (gastos.length) {
    const rows = gastos.map(g => ({
      user_id: currentUser.id,
      descricao: g.title,
      categoria: g.categoria,
      valor: g.amount,
      data: g.date,
      mes_referencia: mesRef
    }));
    const { error } = await client.from('gastos').insert(rows);
    if (error) { erros++; console.error(error); } else ok += rows.length;
  }

  if (receitas.length) {
    const rows = receitas.map(r => ({
      user_id: currentUser.id,
      descricao: r.title,
      valor: r.amount,
      data: r.date,
      mes_referencia: mesRef
    }));
    const { error } = await client.from('receitas').insert(rows);
    if (error) { erros++; console.error(error); } else ok += rows.length;
  }

  btn.innerHTML = 'Salvar extrato';
  btn.disabled = false;

  if (erros) return showToast('Erro ao salvar alguns itens', 'error');
  showToast(`✅ ${ok} itens importados!`);
  closeModal('modal-extrato');
  await Promise.all([loadGastos(), loadReceitas()]);
  renderGastos();
}

// =============================================
// PLANEJAMENTO DE PAGAMENTO
// =============================================
const PLANNER_KEY = 'financeai_planner';

function loadPlannerConfig() {
  try { return JSON.parse(localStorage.getItem(PLANNER_KEY)) || {}; } catch { return {}; }
}
function savePlannerConfig(cfg) {
  localStorage.setItem(PLANNER_KEY, JSON.stringify(cfg));
}

function renderPlanejamento() {
  const cfg = loadPlannerConfig();
  
  // Buscar totais de faturas
  const faturasMes = getFaturasDoMes(currentMes);
  const totalFatura = faturasMes.reduce((s,f) => s+Number(f.valor), 0);
  
  // Buscar totais de receitas
  const receitasMes = allReceitas.filter(r => getMesRefFromReceita(r) === currentMes);
  const totalReceitas = receitasMes.reduce((s,r) => s+Number(r.valor), 0);

  // Buscar totais de gastos manuais
  const gastosMes = allGastos.filter(g => getMesRefFromGasto(g) === currentMes);
  const totalGastosManuais = gastosMes.reduce((s,g) => s+Number(g.valor), 0);
  const totalDespesas = totalFatura + totalGastosManuais;

  // Config form values
  const salario     = cfg.salario     || 0;
  const diaSalario  = cfg.diaSalario  || 5;
  const adiantamento= cfg.adiantamento|| 0;
  const diaAdiant   = cfg.diaAdiant   || 20;
  const usaAdiant   = cfg.usaAdiant   !== false;

  // Cartões com vencimento
  const cartoesComVenc = allCartoes.map(c => ({
    ...c,
    totalMes: faturasMes.filter(f => f.cartao_id === c.id).reduce((s,f)=>s+Number(f.valor),0)
  })).filter(c => c.totalMes > 0);

  // Calcular divisão por período
  let periodos = [];
  if (usaAdiant && adiantamento > 0) {
    const comAdiant = cartoesComVenc.filter(c => {
      const venc = c.vencimento;
      return venc >= diaAdiant || venc <= diaSalario;
    });
    const comSalario = cartoesComVenc.filter(c => !comAdiant.includes(c));

    const totalAdiant = comAdiant.reduce((s,c)=>s+c.totalMes,0);
    const totalSalario = comSalario.reduce((s,c)=>s+c.totalMes,0);

    // Filtrar gastos manuais por período de data
    const gastosNoAdiantamento = gastosMes.filter(g => {
      const [ano, mes, diaStr] = g.data.split('-');
      const dia = parseInt(diaStr, 10);
      if (diaAdiant > diaSalario) {
        return dia >= diaAdiant || dia <= diaSalario;
      } else {
        return dia >= diaAdiant && dia <= diaSalario;
      }
    });
    const gastosNoSalario = gastosMes.filter(g => !gastosNoAdiantamento.includes(g));

    const totalGstAdiant = gastosNoAdiantamento.reduce((s, g) => s + Number(g.valor), 0);
    const totalGstSalario = gastosNoSalario.reduce((s, g) => s + Number(g.valor), 0);

    periodos = [
      {
        label: `Adiantamento (dia ${diaAdiant})`,
        valor: adiantamento,
        gasto: totalAdiant + totalGstAdiant,
        sobra: adiantamento - (totalAdiant + totalGstAdiant),
        cartoes: comAdiant,
        itensManuais: gastosNoAdiantamento,
        cor: '#5B6EF5',
        icone: '💳'
      },
      {
        label: `Salário (dia ${diaSalario})`,
        valor: salario - adiantamento,
        gasto: totalSalario + totalGstSalario,
        sobra: (salario - adiantamento) - (totalSalario + totalGstSalario),
        cartoes: comSalario,
        itensManuais: gastosNoSalario,
        cor: '#10D98A',
        icone: '💵'
      }
    ];
  } else {
    periodos = [{
      label: `Salário (dia ${diaSalario})`,
      valor: salario,
      gasto: totalDespesas,
      sobra: salario - totalDespesas,
      cartoes: cartoesComVenc,
      itensManuais: gastosMes,
      cor: '#10D98A',
      icone: '💵'
    }];
  }

  const container = document.getElementById('page-planejamento');
  container.innerHTML = `
    <!-- Config card -->
    <div class="card" style="margin-bottom:20px;">
      <div class="section-header" style="margin-bottom:16px;">
        <h3>⚙️ Configurar salário e pagamentos</h3>
        <span style="font-size:12px;color:var(--muted);">Salvo só no seu navegador — opcional</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;">
        <div class="form-group" style="margin:0">
          <label class="form-label">Salário bruto (R$)</label>
          <input type="number" id="pl-salario" class="form-input" value="${salario||''}" placeholder="Ex: 5000">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Dia do salário</label>
          <input type="number" id="pl-dia-salario" class="form-input" value="${diaSalario}" min="1" max="31">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Tem adiantamento?</label>
          <select id="pl-usa-adiant" class="form-input" onchange="toggleAdiantFields()">
            <option value="sim" ${usaAdiant?'selected':''}>Sim</option>
            <option value="nao" ${!usaAdiant?'selected':''}>Não</option>
          </select>
        </div>
        <div class="form-group" style="margin:0" id="pl-adiant-group" ${!usaAdiant?'style="display:none"':''}>
          <label class="form-label">Valor adiantamento (R$)</label>
          <input type="number" id="pl-adiantamento" class="form-input" value="${adiantamento||''}" placeholder="Ex: 2000">
        </div>
        <div class="form-group" style="margin:0" id="pl-dia-adiant-group" ${!usaAdiant?'style="display:none"':''}>
          <label class="form-label">Dia do adiantamento</label>
          <input type="number" id="pl-dia-adiant" class="form-input" value="${diaAdiant}" min="1" max="31">
        </div>
      </div>
      <button class="btn btn-primary" style="margin-top:16px;" onclick="salvarPlanejamento()">💾 Calcular divisão</button>
    </div>

    ${salario === 0 ? `
    <div class="empty-state" style="padding:40px">
      <span class="empty-icon">📊</span>
      <p>Preencha seu salário acima para ver a divisão de pagamentos</p>
    </div>` : `
    <!-- Resumo geral -->
    <div class="grid-3" style="margin-bottom:20px;">
      <div class="card">
        <div class="card-title">💵 Renda do mês</div>
        <div class="card-value green">${fmtBRL(salario)}</div>
      </div>
      <div class="card">
        <div class="card-title">🧾 Despesas totais</div>
        <div class="card-value red">${fmtBRL(totalDespesas)}</div>
      </div>
      <div class="card">
        <div class="card-title">✅ Sobra total</div>
        <div class="card-value ${salario-totalDespesas>=0?'green':'red'}">${fmtBRL(salario-totalDespesas)}</div>
      </div>
    </div>

    <!-- Períodos -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-bottom:20px;">
      ${periodos.map(p => `
      <div class="card" style="border-color:${p.cor}33;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <div style="width:36px;height:36px;border-radius:10px;background:${p.cor}22;display:flex;align-items:center;justify-content:center;font-size:18px;">${p.icone}</div>
          <div>
            <div style="font-weight:700;font-size:15px;">${p.label}</div>
            <div style="font-size:12px;color:var(--muted);">Disponível: ${fmtBRL(p.valor)}</div>
          </div>
        </div>

        ${p.cartoes.length ? `
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
          ${p.cartoes.map(c => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface2);border-radius:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:8px;height:8px;border-radius:50%;background:${c.cor};flex-shrink:0"></span>
              <span style="font-size:13px;">${c.nome}</span>
              <span style="font-size:11px;color:var(--muted);">vence dia ${c.vencimento}</span>
            </div>
            <span style="font-weight:600;color:var(--red);font-size:13px;">${fmtBRL(c.totalMes)}</span>
          </div>`).join('')}
        </div>` : `<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px;">Nenhuma fatura neste período</div>`}

        ${p.itensManuais && p.itensManuais.length ? `
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;margin-top:8px;">
          ${p.itensManuais.map(g => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(240,69,106,0.05);border-radius:8px;border:1px dashed rgba(240,69,106,0.2);">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:11px;">🛍️</span>
              <span style="font-size:13px;">${g.descricao}</span>
              <span style="font-size:11px;color:var(--muted);">dia ${g.data.split('-')[2]}</span>
            </div>
            <span style="font-weight:600;color:var(--red);font-size:13px;">${fmtBRL(g.valor)}</span>
          </div>`).join('')}
        </div>` : `<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px;margin-bottom:14px;">Nenhum gasto manual neste período</div>`}

        <div style="border-top:1px solid var(--border);padding-top:12px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;color:var(--muted);">Total do período</span>
          <span style="font-weight:700;color:var(--red);">${fmtBRL(p.gasto)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
          <span style="font-size:13px;color:var(--muted);">Sobra no período</span>
          <span style="font-weight:700;font-size:16px;color:${p.sobra>=0?'var(--green)':'var(--red)'};">${fmtBRL(p.sobra)}</span>
        </div>
        ${p.valor > 0 ? `
        <div class="progress-bar" style="margin-top:10px;">
          <div class="progress-fill" style="width:${Math.min(p.gasto/p.valor*100,100).toFixed(0)}%;background:${p.sobra>=0?'linear-gradient(90deg,var(--accent),var(--accent2))':'linear-gradient(90deg,var(--red),#FF6B8A)'}"></div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">${(p.gasto/p.valor*100).toFixed(0)}% da renda do período comprometido</div>` : ''}
      </div>`).join('')}
    </div>

    <!-- Dica -->
    ${gerarAnaliseIA(periodos, salario, totalDespesas)}
    `}
  `;
}

function gerarAnaliseIA(periodos, salario, totalDespesas) {
  // 1. Dica padrão de saúde financeira
  const pct = salario > 0 ? (totalDespesas / salario * 100) : 0;
  let dicaSaude = '', cor = '';

  if (pct === 0) return '';
  if (pct < 30) { dicaSaude = `Saúde Financeira: ${pct.toFixed(0)}% comprometido. Excelente! 🎉`; cor = 'var(--green)'; }
  else if (pct < 50) { dicaSaude = `Saúde Financeira: ${pct.toFixed(0)}% comprometido. Está sob controle.`; cor = 'var(--yellow)'; }
  else if (pct < 80) { dicaSaude = `⚠️ Saúde Financeira: ${pct.toFixed(0)}% comprometido. Atenção aos gastos!`; cor = 'var(--yellow)'; }
  else { dicaSaude = `🚨 Alerta: ${pct.toFixed(0)}% comprometido! Revise seus gastos urgente.`; cor = 'var(--red)'; }

  let htmlSaude = `<div style="padding:16px 20px; border-radius:var(--radius); border:1px solid ${cor}44; background:${cor}11; margin-bottom:20px; color:${cor}; font-weight:600;">${dicaSaude}</div>`;

  // 2. Inteligência Artificial de Fluxo de Caixa (Otimização)
  if (periodos.length < 2 || salario === 0) return htmlSaude;

  const [p1, p2] = periodos;
  const sobra1 = p1.sobra;
  const sobra2 = p2.sobra;

  // Se ambos estão lascados, não tem como fazer milagre
  if (sobra1 < 0 && sobra2 < 0) {
    return `<div style="padding:16px; border:1px solid var(--red); background:rgba(240,69,106,0.1); border-radius:8px; margin-bottom:20px;">
      🤖 <b>IA Financeira:</b> Ambos os períodos estão no vermelho. Não há como fazer balanceamento. Cancele gastos imediatamente.
    </div>` + htmlSaude;
  }

  // Define um desequilíbrio considerável (mais de 10% do salário total de diferença nas sobras)
  const diferenca = Math.abs(sobra1 - sobra2);
  const limiteDesequilibrio = salario * 0.10;

  if (sobra1 < 0 || sobra2 < 0 || diferenca > limiteDesequilibrio) {
    const periodoRico = sobra1 > sobra2 ? p1 : p2;
    const periodoPobre = sobra1 > sobra2 ? p2 : p1;
    const nomeRico = periodoRico.label.split(' ')[0];
    const nomePobre = periodoPobre.label.split(' ')[0];

    // Cenário A: O período pobre está negativo (conta não fecha)
    if (periodoPobre.sobra < 0 && periodoRico.sobra > 0) {
      const buraco = Math.abs(periodoPobre.sobra);
      const sugestao = Math.min(periodoRico.sobra, buraco); // Pega o que precisa ou o que dá
      
      let acao = `guardar <b>${fmtBRL(sugestao)}</b> do ${nomeRico} para cobrir o buraco do ${nomePobre}.`;
      
      // Procura um cartão no período pobre para sugerir antecipação
      if (periodoPobre.cartoes && periodoPobre.cartoes.length > 0) {
        const cartaoAlvo = periodoPobre.cartoes.sort((a,b) => b.totalMes - a.totalMes)[0];
        acao = `usar <b>${fmtBRL(sugestao)}</b> da sobra do seu ${nomeRico} e <b>pagar antecipado a fatura do cartão ${cartaoAlvo.nome}</b>.`;
      }

      return `<div style="padding:16px; border:1px solid #5B6EF5; background:rgba(91,110,245,0.1); border-radius:8px; margin-bottom:20px;">
        🤖 <b style="color:var(--accent)">Insight da IA: Desequilíbrio Crítico</b><br>
        <span style="font-size:13px; color:var(--text);">O seu ${nomePobre} não vai fechar a conta (faltam ${fmtBRL(buraco)}), mas o seu ${nomeRico} tem dinheiro sobrando.</span><br><br>
        💡 <b>Estratégia sugerida:</b> A IA recomenda que você não gaste a sobra! Em vez disso, vá no app do seu banco e gere um Pix para ${acao} Assim você não entra no vermelho em nenhum momento do mês.
      </div>` + htmlSaude;
    }
    
    // Cenário B: Ninguém tá negativo, mas um tá muito folgado e o outro tá muito apertado
    else if (diferenca > limiteDesequilibrio) {
      const valorIdealTransferencia = diferenca / 2;
      
      let acao = '';
      if (periodoPobre.cartoes && periodoPobre.cartoes.length > 0) {
        const cartaoAlvo = periodoPobre.cartoes[0];
        acao = `adiantar <b>${fmtBRL(valorIdealTransferencia)}</b> da fatura do ${cartaoAlvo.nome}`;
      } else {
        acao = `separar <b>${fmtBRL(valorIdealTransferencia)}</b> para os gastos diarios`;
      }

      return `<div style="padding:16px; border:1px solid #10D98A; background:rgba(16,217,138,0.1); border-radius:8px; margin-bottom:20px;">
        🤖 <b style="color:var(--green)">Insight da IA: Otimização de Caixa</b><br>
        <span style="font-size:13px; color:var(--text);">Você tem muito dinheiro sobrando no ${nomeRico} (${fmtBRL(periodoRico.sobra)}) e pouco no ${nomePobre} (${fmtBRL(periodoPobre.sobra)}). Isso pode te causar uma falsa sensação de riqueza no início e aperto depois.</span><br><br>
        💡 <b>Dica de Equilíbrio:</b> Sugiro ${acao} usando a sobra do ${nomeRico}. O ideal é que as duas quinzenas fiquem equilibradas psicologicamente.
      </div>` + htmlSaude;
    }
  }

  return htmlSaude;
}

function toggleAdiantFields() {
  const usa = document.getElementById('pl-usa-adiant').value === 'sim';
  document.getElementById('pl-adiant-group').style.display = usa ? '' : 'none';
  document.getElementById('pl-dia-adiant-group').style.display = usa ? '' : 'none';
}

function salvarPlanejamento() {
  const cfg = {
    salario:      parseFloat(document.getElementById('pl-salario').value) || 0,
    diaSalario:   parseInt(document.getElementById('pl-dia-salario').value) || 5,
    usaAdiant:    document.getElementById('pl-usa-adiant').value === 'sim',
    adiantamento: parseFloat(document.getElementById('pl-adiantamento')?.value) || 0,
    diaAdiant:    parseInt(document.getElementById('pl-dia-adiant')?.value) || 20,
  };
  savePlannerConfig(cfg);
  showToast('Planejamento salvo!');
  renderPlanejamento();
}

// =============================================
// START
// =============================================
init();