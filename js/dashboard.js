// Variáveis globais
let user;
let chartCat, chartMensal;

// ===== INICIALIZAÇÃO =====
async function init() {
  const { data } = await client.auth.getUser();
  user = data?.user;
  if (!user) { window.location.href = 'login.html'; return; }
  
  loadUserInfo();
  initMonthSelector();
  initColorSwatches();
  loadDashboard();
}

// ===== LOGOUT =====
async function logout() {
  await client.auth.signOut();
  window.location.href = 'login.html';
}

// ===== DASHBOARD =====
async function loadDashboard() {
  const receitas = await client.from('receitas').select('*').eq('user_id', user.id).eq('mes', currentMonth);
  const gastos = await client.from('gastos').select('*').eq('user_id', user.id).eq('mes', currentMonth);
  const faturas = await client.from('faturas').select('*').eq('user_id', user.id).eq('pago', false);
  
  const totalReceitas = receitas.data.reduce((s, r) => s + Number(r.valor), 0);
  const totalGastos = gastos.data.reduce((s, g) => s + Number(g.valor), 0);
  const totalFaturas = faturas.data.reduce((s, f) => s + Number(f.valor), 0);
  const saldo = totalReceitas - totalGastos;
  
  document.getElementById('kpi-saldo').textContent = 'R$ ' + saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  document.getElementById('kpi-receitas').textContent = 'R$ ' + totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  document.getElementById('kpi-faturas').textContent = 'R$ ' + totalFaturas.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  document.getElementById('kpi-gastos').textContent = 'R$ ' + totalGastos.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  
  // Gráfico categorias
  const cats = {};
  gastos.data.forEach(g => { cats[g.categoria] = (cats[g.categoria] || 0) + Number(g.valor); });
  
  if (chartCat) chartCat.destroy();
  chartCat = new Chart(document.getElementById('chart-cat'), {
    type: 'doughnut',
    data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: ['#5B6EF5','#8B5CF6','#10D98A','#F0456A','#F5A623','#3B82F6','#EC4899','#14B8A6'] }] }
  });
  
  // Gráfico mensal (últimos 6 meses)
  const meses = [];
  const receitasMes = [];
  const gastosMes = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const mes = d.toISOString().slice(0, 7);
    meses.push(d.toLocaleDateString('pt-BR', { month: 'short' }));
    const r = await client.from('receitas').select('valor').eq('user_id', user.id).eq('mes', mes);
    const g = await client.from('gastos').select('valor').eq('user_id', user.id).eq('mes', mes);
    receitasMes.push(r.data.reduce((s, x) => s + Number(x.valor), 0));
    gastosMes.push(g.data.reduce((s, x) => s + Number(x.valor), 0));
  }
  
  if (chartMensal) chartMensal.destroy();
  chartMensal = new Chart(document.getElementById('chart-mensal'), {
    type: 'bar',
    data: {
      labels: meses,
      datasets: [
        { label: 'Receitas', data: receitasMes, backgroundColor: '#10D98A' },
        { label: 'Gastos', data: gastosMes, backgroundColor: '#F0456A' }
      ]
    },
    options: { responsive: true, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' } }, y: { grid: { color: 'rgba(255,255,255,0.05)' } } } }
  });
  
  // Top gastos
  const topGastos = [...gastos.data].sort((a, b) => Number(b.valor) - Number(a.valor)).slice(0, 5);
  document.getElementById('top-gastos-list').innerHTML = topGastos.length ? topGastos.map(g => 
    '<div class=top-gasto-item><span>' + g.descricao + '</span><span class=red>R$ ' + Number(g.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</span></div>'
  ).join('') : '<div style=color:var(--muted);padding:16px;text-align:center;>Nenhum gasto registrado</div>';
}

// ===== FATURAS =====
async function loadFaturas() {
  const faturas = await client.from('faturas').select('*').eq('user_id', user.id);
  const cartoes = await client.from('cartoes').select('*').eq('user_id', user.id);
  
  document.getElementById('faturas-list').innerHTML = faturas.data.length ? faturas.data.map(f => {
    const cartao = cartoes.data.find(c => c.id === f.cartao_id);
    return '<div class=fatura-card style="border-left:4px solid ' + (cartao?.cor || '#5B6EF5') + '">' +
      '<div class=fatura-nome>' + f.nome + '</div>' +
      '<div class=fatura-info><span>Vencimento: ' + f.vencimento + '</span><span>Fechamento: ' + f.fechamento + '</span></div>' +
      '<div class=fatura-valor>R$ ' + Number(f.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div>' +
      '<div class=fatura-actions><button class=btn btn-sm onclick="toggleFaturaPago(\'' + f.id + '\',' + f.pago + ')">' + (f.pago ? 'Marcar pendente' : 'Marcar pago') + '</button></div>' +
    '</div>';
  }).join('') : '<div style=color:var(--muted);padding:32px;text-align:center;>Nenhuma fatura registrada</div>';
  
  // Cartões
  document.getElementById('cartoes-list').innerHTML = cartoes.data.length ? cartoes.data.map(c => 
    '<div class=cartao-mini style="border-top:4px solid ' + c.cor + '">' +
      '<div style=font-weight:600;>' + c.nome + '</div>' +
      '<div style=font-size:12px;color:var(--muted);>' + c.bandeira + '</div>' +
      '<div style=margin-top:8px;font-weight:500;>Limite: R$ ' + c.limite.toLocaleString('pt-BR') + '</div>' +
      '<div style=display:flex;gap:8px;margin-top:12px;>' +
        '<button class=btn btn-sm onclick="openCartaoModal(' + JSON.stringify(c).replace(/"/g, '&quot;') + ')">Editar</button>' +
        '<button class=btn btn-ghost btn-sm onclick="deleteCartao(\'' + c.id + '\')">Excluir</button>' +
      '</div>' +
    '</div>'
  ).join('') : '<div style=color:var(--muted);padding:32px;text-align:center;>Nenhum cartao cadastrado</div>';
}

async function toggleFaturaPago(id, pago) {
  await client.from('faturas').update({ pago: !pago }).eq('id', id);
  loadFaturas();
}

async function deleteCartao(id) {
  await client.from('cartoes').delete().eq('id', id);
  showToast('Cartao removido', 'success');
  loadFaturas();
}

// ===== PARCELAS =====
async function loadParcelas() {
  const gastos = await client.from('gastos').select('*').eq('user_id', user.id).ilike('descricao', '%/%');
  document.getElementById('parcelas-list').innerHTML = gastos.data.length ? gastos.data.map(g => 
    '<div class=parcela-item><div><strong>' + g.descricao + '</strong><br><small>' + g.data + '</small></div><div class=red>R$ ' + Number(g.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div></div>'
  ).join('') : '<div style=color:var(--muted);padding:32px;text-align:center;>Nenhuma parcela futura registrada</div>';
}

// ===== CARTÕES =====
async function loadCartoes() {
  const cartoes = await client.from('cartoes').select('*').eq('user_id', user.id);
  document.getElementById('cartoes-page-list').innerHTML = cartoes.data.length ? cartoes.data.map(c => 
    '<div class=cartao-item style="border-left:6px solid ' + c.cor + '">' +
      '<div class=cartao-header><strong>' + c.nome + '</strong><span class=badge>' + c.bandeira + '</span></div>' +
      '<div class=cartao-body><span>Vencimento: ' + c.vencimento + '</span><span>Fechamento: ' + c.fechamento + '</span></div>' +
      '<div class=cartao-footer><span class=green>Limite: R$ ' + Number(c.limite).toLocaleString('pt-BR') + '</span>' +
        '<div><button class=btn btn-sm onclick="openCartaoModal(' + JSON.stringify(c).replace(/"/g, '&quot;') + ')">Editar</button></div></div>' +
    '</div>'
  ).join('') : '<div style=color:var(--muted);padding:32px;text-align:center;>Nenhum cartao cadastrado. Use o botao acima para adicionar.</div>';
}

// ===== RECEITAS =====
async function loadReceitas() {
  const receitas = await client.from('receitas').select('*').eq('user_id', user.id).eq('mes', currentMonth);
  document.getElementById('receitas-list').innerHTML = receitas.data.length ? receitas.data.map(r => 
    '<div class=item-row><div><strong>' + r.tipo + '</strong><br><small>' + currentMonth + '</small></div>' +
      '<div class=green>R$ ' + Number(r.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div>' +
      '<button class=btn btn-ghost btn-sm onclick="deleteItem(\'' + r.id + '\',\'receitas\')">×</button></div>'
  ).join('') : '<div style=color:var(--muted);padding:32px;text-align:center;>Nenhuma receita registrada</div>';
  
  // KPI
  const total = receitas.data.reduce((s, r) => s + Number(r.valor), 0);
  document.getElementById('kpi-receitas-total').textContent = 'R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

// ===== GASTOS =====
async function loadGastos() {
  const gastos = await client.from('gastos').select('*').eq('user_id', user.id).eq('mes', currentMonth);
  const sorted = [...gastos.data].sort((a, b) => new Date(b.data) - new Date(a.data));
  
  document.getElementById('gastos-list').innerHTML = sorted.length ? sorted.map(g => 
    '<div class=item-row>' +
      '<div><strong>' + g.descricao + '</strong><br><small>' + g.categoria + ' • ' + g.data + '</small></div>' +
      '<div class=red>-R$ ' + Number(g.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div>' +
      '<div style=display:flex;gap:4px;>' +
        '<button class=btn btn-ghost btn-sm onclick="openCategoriaModal(' + JSON.stringify(g).replace(/"/g, '&quot;') + ')">Cat</button>' +
        '<button class=btn btn-ghost btn-sm onclick="deleteItem(\'' + g.id + '\',\'gastos\')">×</button>' +
      '</div>' +
    '</div>'
  ).join('') : '<div style=color:var(--muted);padding:32px;text-align:center;>Nenhum gasto registrado</div>';
  
  // KPI
  const total = gastos.data.reduce((s, g) => s + Number(g.valor), 0);
  document.getElementById('kpi-gastos-total').textContent = 'R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

// Delete genérico
async function deleteItem(id, tipo) {
  await client.from(tipo).delete().eq('id', id);
  showToast('Item removido', 'success');
  if (tipo === 'receitas') loadReceitas();
  else if (tipo === 'gastos') loadGastos();
}

// Inicializa
init();
