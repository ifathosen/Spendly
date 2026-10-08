let currentUser = null;
let userCurrency = 'SAR ﷼';
let allTransactions = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!dbClient) {
    alert("Database connection failed. Please reload.");
    return;
  }

  const { data: { user }, error } = await dbClient.auth.getUser();
  if (error || !user) {
    window.location.href = 'index.html';
    return;
  }

  currentUser = user;

  await loadUserProfile();
  await loadTransactions();
  bindEvents();
});

async function loadUserProfile() {
  try {
    const { data } = await dbClient
      .from('profiles')
      .select('full_name, currency')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (data && data.currency) userCurrency = data.currency;

    const name = (data && data.full_name) ? data.full_name : currentUser.email.split('@')[0];

    document.getElementById('user-name').innerText = name;
    document.getElementById('user-avatar').innerText = name.charAt(0).toUpperCase();
    document.getElementById('profile-name-val').innerText = name;
    document.getElementById('profile-email-val').innerText = currentUser.email;
  } catch (err) {
    console.error(err);
  }
}

async function loadTransactions() {
  try {
    const { data, error } = await dbClient
      .from('transactions')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    allTransactions = data || [];
    renderDashboardList(allTransactions);
    renderFullList(allTransactions);
    updateMetrics(allTransactions);
  } catch (err) {
    console.error(err);
  }
}

function renderDashboardList(transactions) {
  const container = document.getElementById('dashboard-recent-list');
  if (!container) return;

  const recent = transactions.slice(0, 5);
  if (recent.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">${translations[currentLang].noData}</p>`;
    return;
  }

  container.innerHTML = recent.map(t => createItemHTML(t)).join('');
}

function renderFullList(transactions) {
  const container = document.getElementById('all-transactions-list');
  if (!container) return;

  if (transactions.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">${translations[currentLang].noData}</p>`;
    return;
  }

  container.innerHTML = transactions.map(t => createItemHTML(t)).join('');
}

function createItemHTML(t) {
  const isIncome = t.type === 'Income';
  const amt = parseFloat(t.amount) || 0;

  return `
    <div class="flex items-center justify-between p-4 bg-slate-950/80 border border-slate-800 rounded-xl">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg ${isIncome ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'} flex items-center justify-center font-bold text-xs">
          <i class="fa-solid ${isIncome ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
        </div>
        <div>
          <h4 class="text-sm font-bold text-white">${t.title}</h4>
          <span class="text-[11px] text-slate-500">${t.category || 'General'}</span>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <span class="text-sm font-bold ${isIncome ? 'text-emerald-400' : 'text-rose-400'}">
          ${isIncome ? '+' : '-'}${userCurrency} ${amt.toFixed(2)}
        </span>
        <button onclick="editTransaction(${t.id})" class="text-slate-400 hover:text-indigo-400 text-xs">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button onclick="deleteTransaction(${t.id})" class="text-slate-400 hover:text-rose-400 text-xs">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function updateMetrics(transactions) {
  let income = 0;
  let expense = 0;

  transactions.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'Income') income += amt;
    else expense += amt;
  });

  const balance = income - expense;

  document.getElementById('total-balance').innerText = `${userCurrency} ${balance.toFixed(2)}`;
  document.getElementById('total-income').innerText = `+${userCurrency} ${income.toFixed(2)}`;
  document.getElementById('total-expense').innerText = `-${userCurrency} ${expense.toFixed(2)}`;
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-page').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(el => {
    el.className = "nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm text-slate-400 hover:text-white hover:bg-slate-900 transition";
  });

  document.getElementById(`tab-content-${tabName}`).classList.remove('hidden');
  const activeNav = document.getElementById(`nav-${tabName}`);
  if (activeNav) {
    activeNav.className = "nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition bg-indigo-600 text-white shadow-lg shadow-indigo-600/20";
  }
}

function openTransactionModal() {
  document.getElementById('modal-trans-form').reset();
  document.getElementById('modal-trans-id').value = '';
  document.getElementById('trans-modal').classList.remove('hidden');
}

function closeTransactionModal() {
  document.getElementById('trans-modal').classList.add('hidden');
}

function bindEvents() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await dbClient.auth.signOut();
    window.location.href = 'index.html';
  });

  document.getElementById('modal-trans-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('modal-trans-id').value;
    const title = document.getElementById('modal-trans-title').value;
    const amount = parseFloat(document.getElementById('modal-trans-amount').value);
    const type = document.getElementById('modal-trans-type').value;
    const category = document.getElementById('modal-trans-category').value;

    if (id) {
      await dbClient.from('transactions').update({ title, amount, type, category }).eq('id', id);
    } else {
      await dbClient.from('transactions').insert([{ user_id: currentUser.id, title, amount, type, category }]);
    }

    closeTransactionModal();
    await loadTransactions();
  });

  document.getElementById('search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allTransactions.filter(t => t.title.toLowerCase().includes(q));
    renderFullList(filtered);
  });
}

window.editTransaction = function(id) {
  const t = allTransactions.find(item => item.id === id);
  if (!t) return;

  document.getElementById('modal-trans-id').value = t.id;
  document.getElementById('modal-trans-title').value = t.title;
  document.getElementById('modal-trans-amount').value = t.amount;
  document.getElementById('modal-trans-type').value = t.type;
  document.getElementById('modal-trans-category').value = t.category;

  document.getElementById('trans-modal').classList.remove('hidden');
};

window.deleteTransaction = async function(id) {
  if (!confirm(translations[currentLang].confirmDelete)) return;
  await dbClient.from('transactions').delete().eq('id', id);
  await loadTransactions();
};
