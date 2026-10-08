let currentUser = null;
let userCurrency = 'SAR ﷼';
let allTransactions = [];
let chartInstance = null;

const ACCOUNTS = ['Cash', 'Al Rajhi', 'SNB', 'Barq', 'Neo', 'Enjaz'];

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();

  try {
    if (typeof dbClient !== 'undefined' && dbClient && navigator.onLine) {
      const { data: { user } } = await dbClient.auth.getUser();
      if (user) {
        currentUser = user;
        localStorage.setItem('spendly_last_user', JSON.stringify(user));
      }
    }

    if (!currentUser) {
      const savedUser = localStorage.getItem('spendly_last_user');
      if (savedUser) currentUser = JSON.parse(savedUser);
    }

    if (!currentUser) {
      currentUser = { id: 'local_user', email: 'user@spendly.local' };
    }

    await loadTransactions();
    const savedTab = localStorage.getItem('spendly_active_tab') || 'dashboard';
    window.switchTab(savedTab);
  } catch (err) {
    console.error("Init Error:", err);
  }
});

async function loadTransactions() {
  let cloudData = [];
  try {
    if (navigator.onLine && typeof dbClient !== 'undefined' && dbClient && currentUser && currentUser.id !== 'local_user') {
      const { data, error } = await dbClient.from('transactions').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
      if (!error && data) {
        cloudData = data;
        localStorage.setItem(`spendly_cached_trans_${currentUser.id}`, JSON.stringify(data));
      }
    }
  } catch (e) {
    console.error(e);
  }

  if (cloudData.length === 0) {
    const cached = localStorage.getItem(`spendly_cached_trans_${currentUser ? currentUser.id : 'local_user'}`);
    allTransactions = cached ? JSON.parse(cached) : [];
  } else {
    allTransactions = cloudData;
  }

  renderDashboardList(allTransactions);
  window.applyFiltersAndRender();
  renderAnalyticsChart(allTransactions);
  updateMetricsAndAccounts(allTransactions);

  if (document.getElementById('trans-count-badge')) document.getElementById('trans-count-badge').innerText = `${allTransactions.length} Items`;
}

// Calculate Individual & Category Balances
function updateMetricsAndAccounts(transactions) {
  let totalIncome = 0;
  let totalExpense = 0;
  
  const accBalances = {
    Cash: 0,
    'Al Rajhi': 0,
    SNB: 0,
    Barq: 0,
    Neo: 0,
    Enjaz: 0
  };

  transactions.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    const acc = t.payment_method || 'Cash';
    
    if (t.type === 'Income') {
      totalIncome += amt;
      if (accBalances.hasOwnProperty(acc)) accBalances[acc] += amt;
    } else {
      totalExpense += amt;
      if (accBalances.hasOwnProperty(acc)) accBalances[acc] -= amt;
    }
  });

  const cashTotal = accBalances['Cash'];
  const bankTotal = accBalances['Al Rajhi'] + accBalances['SNB'] + accBalances['Barq'] + accBalances['Neo'] + accBalances['Enjaz'];
  const grandTotal = cashTotal + bankTotal;

  // Render on Dashboard
  if (document.getElementById('total-balance')) document.getElementById('total-balance').innerText = `${userCurrency} ${grandTotal.toFixed(2)}`;
  if (document.getElementById('dash-cash-total')) document.getElementById('dash-cash-total').innerText = `${userCurrency} ${cashTotal.toFixed(2)}`;
  if (document.getElementById('dash-bank-total')) document.getElementById('dash-bank-total').innerText = `${userCurrency} ${bankTotal.toFixed(2)}`;
  if (document.getElementById('total-income')) document.getElementById('total-income').innerText = `+${userCurrency} ${totalIncome.toFixed(2)}`;
  if (document.getElementById('total-expense')) document.getElementById('total-expense').innerText = `-${userCurrency} ${totalExpense.toFixed(2)}`;

  // Render Bank Grid
  const bankGrid = document.getElementById('bank-accounts-grid');
  if (bankGrid) {
    const bankList = ['Al Rajhi', 'SNB', 'Barq', 'Neo', 'Enjaz'];
    bankGrid.innerHTML = bankList.map(b => `
      <div class="p-2.5 bg-slate-950 border border-slate-800/80 rounded-xl">
        <span class="text-[10px] text-slate-400 font-bold block">${b}</span>
        <span class="text-xs font-bold text-white">${userCurrency} ${accBalances[b].toFixed(2)}</span>
      </div>
    `).join('');
  }

  // Store globally for modal preview
  window.currentAccBalances = accBalances;
}

window.updateModalBalancePreview = function() {
  const selectedAcc = document.getElementById('modal-trans-payment').value;
  const bal = window.currentAccBalances ? (window.currentAccBalances[selectedAcc] || 0) : 0;
  const previewEl = document.getElementById('modal-selected-acc-bal');
  if (previewEl) {
    previewEl.innerText = `${userCurrency} ${bal.toFixed(2)}`;
    previewEl.className = bal >= 0 ? "font-bold text-emerald-400" : "font-bold text-rose-400";
  }
};

window.handleTypeChange = function(selectEl) {
  const customContainer = document.getElementById('custom-type-container');
  if (selectEl.value === 'CUSTOM') {
    customContainer.classList.remove('hidden');
  } else {
    customContainer.classList.add('hidden');
  }
};

function renderDashboardList(transactions) {
  const container = document.getElementById('dashboard-recent-list');
  if (!container) return;
  const recent = transactions.slice(0, 10);
  if (!recent.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">No transactions recorded yet.</p>`;
    return;
  }
  container.innerHTML = recent.map(t => createItemHTML(t)).join('');
}

window.applyFiltersAndRender = function() {
  const container = document.getElementById('all-transactions-list');
  if (!container) return;

  let filtered = [...allTransactions];
  const searchQ = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  const fromDate = document.getElementById('filter-from-date')?.value;
  const toDate = document.getElementById('filter-to-date')?.value;

  if (searchQ) filtered = filtered.filter(t => (t.category && t.category.toLowerCase().includes(searchQ)) || (t.payment_method && t.payment_method.toLowerCase().includes(searchQ)));
  if (fromDate) filtered = filtered.filter(t => (t.created_at ? t.created_at.split('T')[0] : '') >= fromDate);
  if (toDate) filtered = filtered.filter(t => (t.created_at ? t.created_at.split('T')[0] : '') <= toDate);

  if (!filtered.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">No matching records found.</p>`;
    return;
  }
  container.innerHTML = filtered.map(t => createItemHTML(t)).join('');
};

function createItemHTML(t) {
  const isIncome = t.type === 'Income';
  const amt = parseFloat(t.amount) || 0;
  
  let formattedTime = '';
  if (t.created_at) {
    const d = new Date(t.created_at);
    formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' • ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return `
    <div class="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg ${isIncome ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'} flex items-center justify-center font-bold text-xs">
          <i class="fa-solid ${isIncome ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white">${t.category || 'General'} <span class="text-[10px] font-normal text-indigo-400">(${t.payment_method || 'Cash'})</span></h4>
          <span class="text-[10px] text-slate-500">${formattedTime}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold ${isIncome ? 'text-emerald-400' : 'text-rose-400'}">
          ${isIncome ? '+' : '-'}${userCurrency} ${amt.toFixed(2)}
        </span>
        <button onclick="deleteTransaction('${t.id}')" class="text-slate-500 hover:text-rose-400 text-xs p-1"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `;
}

function renderAnalyticsChart(transactions) {
  const ctx = document.getElementById('expenseChart')?.getContext('2d');
  if (!ctx) return;
  const expenses = transactions.filter(t => t.type === 'Expense');
  const catTotals = {};
  expenses.forEach(t => {
    catTotals[t.category || 'General'] = (catTotals[t.category || 'General'] || 0) + (parseFloat(t.amount) || 0);
  });

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(catTotals).length ? Object.keys(catTotals) : ['No Data'],
      datasets: [{ data: Object.values(catTotals).length ? Object.values(catTotals) : [1], backgroundColor: ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6'] }]
    },
    options: { plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 } } } } }
  });
}

window.switchTab = function(tabName) {
  localStorage.setItem('spendly_active_tab', tabName);
  document.querySelectorAll('.tab-page').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(el => el.className = "nav-btn flex flex-col items-center gap-1 text-slate-400 hover:text-white font-semibold text-[10px]");
  document.getElementById(`tab-${tabName}`)?.classList.remove('hidden');
  document.getElementById(`nav-${tabName}`) && (document.getElementById(`nav-${tabName}`).className = "nav-btn flex flex-col items-center gap-1 text-indigo-400 font-semibold text-[10px]");
};

window.openTransactionModal = () => {
  document.getElementById('modal-trans-form').reset();
  document.getElementById('modal-trans-id').value = '';
  
  const now = new Date();
  document.getElementById('modal-trans-date').value = now.toISOString().split('T')[0];
  document.getElementById('modal-trans-time').value = now.toTimeString().split(' ')[0].substring(0, 5);
  
  document.getElementById('custom-type-container').classList.add('hidden');
  window.updateModalBalancePreview();
  document.getElementById('trans-modal').classList.remove('hidden');
};
window.closeTransactionModal = () => document.getElementById('trans-modal').classList.add('hidden');

function bindEvents() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    if (typeof dbClient !== 'undefined' && dbClient) await dbClient.auth.signOut();
    localStorage.removeItem('spendly_last_user');
    window.location.href = 'index.html';
  });

  document.getElementById('search-input')?.addEventListener('input', window.applyFiltersAndRender);

  document.getElementById('modal-trans-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('modal-trans-amount').value);
    const dateVal = document.getElementById('modal-trans-date').value;
    const timeVal = document.getElementById('modal-trans-time').value;
    
    let typeVal = document.getElementById('modal-trans-type').value;
    if (typeVal === 'CUSTOM') {
      typeVal = document.getElementById('custom-type-input').value || 'Expense';
    }

    const paymentVal = document.getElementById('modal-trans-payment').value;
    const categoryVal = document.getElementById('modal-trans-category').value;

    const fullDateTime = new Date(`${dateVal}T${timeVal}:00`).toISOString();

    const payload = {
      user_id: currentUser ? currentUser.id : 'local_user',
      title: categoryVal,
      amount,
      type: typeVal,
      category: categoryVal,
      payment_method: paymentVal,
      created_at: fullDateTime
    };

    if (navigator.onLine && typeof dbClient !== 'undefined' && dbClient && currentUser && currentUser.id !== 'local_user') {
      try {
        await dbClient.from('transactions').insert([payload]);
      } catch (err) {
        console.error(err);
      }
    }

    window.closeTransactionModal();
    await loadTransactions();
  });
}

window.deleteTransaction = async function(id) {
  if (!confirm("Delete record?")) return;
  if (navigator.onLine && typeof dbClient !== 'undefined' && dbClient && currentUser && currentUser.id !== 'local_user') {
    try {
      await dbClient.from('transactions').delete().eq('id', id);
    } catch (e) {
      console.error(e);
    }
  }
  await loadTransactions();
};
