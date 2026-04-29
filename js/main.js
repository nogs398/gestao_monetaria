let user;
let mainChart;

async function init() {
  const { data } = await client.auth.getUser();
  user = data?.user;
  if (!user) { window.location.href = 'login.html'; return; }
  loadDashboard();
}

async function logout() {
  await client.auth.signOut();
  window.location.href = 'login.html';
}

async function addReceita() {
  const tipo = document.getElementById('tipoReceita').value;
  const valor = parseFloat(document.getElementById('valorReceita').value);
  if (!valor) return alert('Informe o valor');
  await client.from('receitas').insert({ user_id: user.id, tipo, valor });
  document.getElementById('valorReceita').value = '';
  loadDashboard();
}

async function addGasto() {
  const descricao = document.getElementById('descricao').value;
  const categoria = document.getElementById('categoria').value;
  const valor = parseFloat(document.getElementById('valorGasto').value);
  const data = document.getElementById('dataGasto').value;
  if (!valor) return alert('Informe o valor');
  await client.from('gastos').insert({ user_id: user.id, descricao, categoria, valor, data });
  document.getElementById('descricao').value = '';
  document.getElementById('valorGasto').value = '';
  loadDashboard();
}

async function addFatura() {
  const nome = document.getElementById('fatNome').value;
  const valor = parseFloat(document.getElementById('fatValor').value);
  const vencimento = document.getElementById('fatVenc').value;
  const fechamento = document.getElementById('fatFech').value;
  if (!nome || !valor) return alert('Informe nome e valor');
  await client.from('faturas').insert({ user_id: user.id, nome, valor, vencimento, fechamento, tipo: 'cartao' });
  loadDashboard();
}

async function importCSV() {
  const file = document.getElementById('csvFile').files[0];
  if (!file) return alert('Selecione um CSV');
  const text = await file.text();
  const linhas = text.split('\n');
  for (let i = 1; i < linhas.length; i++) {
    const cols = linhas[i].split(',');
    if (cols.length < 3) continue;
    const descricao = cols[1];
    const valor = Math.abs(parseFloat(cols[2]));
    const data = cols[0];
    await client.from('gastos').insert({ user_id: user.id, descricao, valor, data, categoria: 'Importado' });
  }
  alert('CSV importado');
  loadDashboard();
}

async function loadDashboard() {
  const receitas = await client.from('receitas').select('*').eq('user_id', user.id);
  const gastos = await client.from('gastos').select('*').eq('user_id', user.id);
  const faturas = await client.from('faturas').select('*').eq('user_id', user.id).eq('pago', false);

  const totalReceitas = receitas.data.reduce((s, r) => s + Number(r.valor), 0);
  const totalGastos = gastos.data.reduce((s, g) => s + Number(g.valor), 0);
  const totalFaturas = faturas.data.reduce((s, f) => s + Number(f.valor), 0);
  const saldo = totalReceitas - totalGastos - totalFaturas;

  document.getElementById('saldo').innerHTML = 'R$ ' + saldo.toFixed(2).replace('.', ',');
  document.getElementById('gastosTotal').innerHTML = 'R$ ' + totalGastos.toFixed(2).replace('.', ',');
  document.getElementById('faturasTotal').innerHTML = 'R$ ' + totalFaturas.toFixed(2).replace('.', ',');
  criarGrafico(gastos.data);
}

function criarGrafico(gastos) {
  const categorias = {};
  gastos.forEach(g => {
    if (!categorias[g.categoria]) categorias[g.categoria] = 0;
    categorias[g.categoria] += Number(g.valor);
  });
  if (mainChart) mainChart.destroy();
  mainChart = new Chart(document.getElementById('grafico'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(categorias),
      datasets: [{ data: Object.values(categorias), backgroundColor: ['#5B6EF5','#8B5CF6','#10D98A','#F0456A','#F5A623','#3B82F6','#EC4899','#14B8A6'] }]
    }
  });
}

function analisarFinancas() {
  const saldoText = document.getElementById('saldo').innerText;
  const valor = parseFloat(saldoText.replace('R$', '').replace(',', '.'));
  const resposta = document.getElementById('iaResposta');
  if (valor < 0) {
    resposta.className = 'alert danger';
    resposta.innerHTML = 'Seu orçamento está negativo. Evite novas compras.';
  } else if (valor < 1000) {
    resposta.className = 'alert';
    resposta.innerHTML = 'Você ainda possui saldo, mas deve evitar parcelamentos.';
  } else {
    resposta.className = 'alert success';
    resposta.innerHTML = 'Sua situação financeira está saudável. Você pode realizar compras com cautela.';
  }
}

init();
