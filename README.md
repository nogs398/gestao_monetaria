# 💰 Finance AI — Setup Completo

## 🚀 Como configurar

### 1. Supabase

1. Acesse https://supabase.com e crie um novo projeto
2. Vá em **SQL Editor** e rode o arquivo `SUPABASE_SQL.sql` completo
3. Vá em **Settings > API** e copie:
   - **Project URL**
   - **anon public key**

### 2. Configurar as chaves

Abra `js/supabase.js` e substitua:
```js
const SUPABASE_URL = "COLE_SUA_URL_AQUI";
const SUPABASE_KEY = "COLE_SUA_ANON_KEY_AQUI";
```

### 3. Deploy no Vercel

```bash
npm install -g vercel
cd finance-ai
vercel
vercel --prod
```

---

## 📂 Estrutura de arquivos

```
finance-ai/
├── login.html          — Página de login/registro
├── dashboard.html      — App principal
├── css/
│   └── style.css       — Design system completo
├── js/
│   ├── supabase.js     — Config do Supabase (edite suas keys aqui)
│   ├── utils.js        — Funções utilitárias
│   └── dashboard.js    — Toda a lógica do app
└── SUPABASE_SQL.sql    — SQL para rodar no Supabase
```

---

## ✨ Funcionalidades

- ✅ Login / Cadastro com Supabase Auth
- ✅ **Dashboard** com KPIs do mês selecionado
- ✅ **Importar CSV do Nubank** (drag & drop)
  - Detecta parcelas automaticamente (ex: Parcela 3/12)
  - Categoriza gastos automaticamente (Alimentação, Saúde, etc.)
- ✅ **Cartões múltiplos** — cadastre e gerencie vários cartões
- ✅ **Parcelas futuras** — projeção mês a mês até o fim dos parcelamentos
- ✅ **Seletor de mês** — navegue entre meses
- ✅ **Receitas** por mês
- ✅ **Gastos manuais** por mês
- ✅ **Gráfico de categorias** (rosca)
- ✅ **Gráfico mensal** (barras — receitas vs despesas)
- ✅ **Editar categoria** de cada item
- ✅ **Busca** na tela de faturas
- ✅ **RLS** habilitado (dados 100% privados por usuário)
- ✅ Design dark mode premium
- ✅ Responsivo (mobile/tablet/desktop)

---

## 🗄️ Tabelas Supabase

| Tabela | Descrição |
|--------|-----------|
| `profiles` | Dados do usuário |
| `cartoes` | Cartões de crédito cadastrados |
| `faturas_itens` | Lançamentos importados do CSV |
| `receitas` | Entradas/salário por mês |
| `gastos` | Gastos manuais sem cartão |

---

## 📋 Formato CSV suportado

O app suporta o formato padrão de exportação do Nubank:

```
date,title,amount
2026-04-27,Ifd*Ifood Club,7.95
2026-04-24,Amazon - Parcela 3/12,36.65
```

Pagamentos (valores negativos) são ignorados automaticamente.
