let currentUser = null;
let userCurrency = 'SAR ﷼';
let allTransactions = [];
let chartInstance = null;
let categoryBudgets = { Food: 0, Rent: 0, Shopping: 0, Bills: 0 };
let savingsGoals = [];
let debtRecords = [];

document.addEventListener('DOMContentLoaded', async () => {
  checkPinLock();
  bindEvents();

  window.addEventListener('online', syncOfflineQueue);

  try {
    if (typeof dbClient !== 'undefined' && dbClient) {
      if (navigator.onLine) {
        const { data: { user } } = await dbClient.auth.getUser();
        if (user) {
          currentUser = user;
          localStorage.setItem('spendly_last_user', JSON.stringify(user));
        }
      }
    }
    
    if (!currentUser) {
      const savedUser = localStorage.getItem('spendly_last_user');
      if (savedUser) currentUser = JSON.parse(savedUser);
    }

    if (!currentUser) {
      currentUser = { id: 'local_user', email: 'user@spendly.local' };
    }

    loadSavedBudgets();
    loadGoalsAndDebts();
    await loadUserProfile();
    await loadTransactions();

    const savedTab = localStorage.getItem('spendly_active_tab') || 'dashboard';
    window.switchTab(savedTab);
  } catch (err) {
    console.error("Init Error:", err);
  }
});

function checkPinLock() {
  const pin = localStorage.getItem('spendly_app_pin');
  if (pin) document.getElementById('pin-screen')?.classList.remove('hidden');
}

window.verifyPin = function() {
  const enteredPin = document.getElementById('pin-input').value;
  if (enteredPin === localStorage.getItem('spendly_app_pin')) {
    document.getElementById('pin-screen').classList.add('hidden');
  } else {
    alert("Incorrect PIN Code!");
  }
};

window.togglePinLockSetting = function() {
  const savedPin = localStorage.getItem('spendly_app_pin');
  if (savedPin) {
    if (confirm("Remove Security PIN?")) {
      localStorage.removeItem('spendly_app_pin');
      alert("PIN removed.");
    }
  } else {
    const newPin = prompt("Enter 4-Digit Security PIN:");
    if (newPin && newPin.length === 4) {
      localStorage.setItem('spendly_app_pin', newPin);
      alert("PIN Enabled!");
    } else {
      alert("Enter exactly 4 digits.");
    }
  }
};

async function loadUserProfile() {
  try {
    if (navigator.onLine && typeof dbClient !== 'undefined' && dbClient && currentUser && currentUser.id !== 'local_user') {
      const { data } = await dbClient.from('profiles').select('full_name, currency').eq('id', currentUser.id).maybeSingle();
      if (data && data.currency) userCurrency = data.currency;
      if (data) localStorage.setItem(`spendly_profile_${currentUser.id}`, JSON.stringify(data));
    }
  } catch (e) {
    console.error(e);
  }

  const name = (currentUser && currentUser.email) ? currentUser.email.split('@')[0] : 'User';
  if (document.getElementById('user-avatar')) document.getElementById('user-avatar').innerText = name.charAt(0).toUpperCase();
  if (document.getElementById('profile-name-val')) document.getElementById('profile-name-val').innerText = name;
  if (document.getElementById('profile-email-val')) document.getElementById('profile-email-val').innerText = currentUser?.email || '';
  if (document.getElementById('currency-select')) document.getElementById('currency-select').value = userCurrency;
}

async function loadTransactions() {
  if (navigator.onLine) await syncOfflineQueue();

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
  renderBudgets(allTransactions);
  renderSavingsGoals();
  renderDebtLoan();
  updateMetrics(allTransactions);

  if (document.getElementById('trans-count-badge')) document.getElementById('trans-count-badge').innerText = `${allTransactions.length} Items`;
  if (document.getElementById('profile-trans-count')) document.getElementById('profile-trans-count').innerText = allTransactions.length;
}

async function syncOfflineQueue() {
  if (!navigator.onLine || typeof dbClient === 'undefined' || !dbClient || !currentUser || currentUser.id === 'local_user') return;
  const key = `spendly_offline_queue_${currentUser.id}`;
  const queue = JSON.parse(localStorage.getItem(key) || '[]');
  if (queue.length === 0) return;

  for (const item of queue) {
    try {
      if (item.action === 'insert') {
        const { id, ...payload } = item.payload;
        await dbClient.from('transactions').insert([{ ...payload, user_id: currentUser.id }]);
      } else if (item.action === 'delete') {
        await dbClient.from('transactions').delete().eq('id', item.id);
      }
    } catch (e) {
      console.error("Sync error:", e);
    }
  }
  localStorage.removeItem(key);
}

function addToOfflineQueue(action, payload, id = null) {
  const userId = currentUser ? currentUser.id : 'local_user';
  const key = `spendly_offline_queue_${userId}`;
  const queue = JSON.parse(localStorage.getItem(key) || '[]');

  if (action === 'insert') {
    const tempId = 'temp_' + Date.now();
    const newRecord = { ...payload, id: tempId };
    allTransactions.unshift(newRecord);
    queue.push({ action, payload: newRecord });
  } else if (action === 'delete') {
    allTransactions = allTransactions.filter(t => t.id != id);
    queue.push({ action, id });
  }

  localStorage.setItem(key, JSON.stringify(queue));
  localStorage.setItem(`spendly_cached_trans_${userId}`, JSON.stringify(allTransactions));
}

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
  const sortBy = document.getElementById('sort-by-select')?.value || 'newest';

  if (searchQ) {
    filtered = filtered.filter(t => (t.title && t.title.toLowerCase().includes(searchQ)) || (t.category && t.category.toLowerCase().includes(searchQ)));
  }
  if (fromDate) filtered = filtered.filter(t => (t.created_at ? t.created_at.split('T')[0] : '') >= fromDate);
  if (toDate) filtered = filtered.filter(t => (t.created_at ? t.created_at.split('T')[0] : '') <= toDate);

  if (sortBy === 'newest') filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  else if (sortBy === 'oldest') filtered.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  else if (sortBy === 'high-amount') filtered.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
  else if (sortBy === 'low-amount') filtered.sort((a, b) => (parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0));

  if (!filtered.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">No matching transactions found.</p>`;
    return;
  }
  container.innerHTML = filtered.map(t => createItemHTML(t)).join('');
};

function createItemHTML(t) {
  const isIncome = t.type === 'Income';
  const amt = parseFloat(t.amount) || 0;
  const formattedDate = t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  
  return `
    <div class="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg ${isIncome ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'} flex items-center justify-center font-bold text-xs">
          <i class="fa-solid ${isIncome ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white">${t.title}</h4>
          <span class="text-[10px] text-slate-500">${t.category || 'General'} • ${formattedDate}</span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs font-bold ${isIncome ? 'text-emerald-400' : 'text-rose-400'}">
          ${isIncome ? '+' : '-'}${userCurrency} ${amt.toFixed(2)}
        </span>
        <button onclick="deleteTransaction('${t.id}')" class="text-slate-500 hover:text-rose-400 text-xs"><i class="fa-solid fa-trash"></i></button>
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
    const amt = parseFloat(t.amount) || 0;
    const cat = t.category || 'General';
    catTotals[cat] = (catTotals[cat] || 0) + amt;
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

function renderBudgets(transactions) {
  const container = document.getElementById('budget-tracker-list');
  if (!container) return;
  const expenses = transactions.filter(t => t.type === 'Expense');
  const spentByCat = {};
  expenses.forEach(t => {
    spentByCat[t.category || 'General'] = (spentByCat[t.category || 'General'] || 0) + (parseFloat(t.amount) || 0);
  });
  const activeBudgets = Object.keys(categoryBudgets).filter(c => categoryBudgets[c] > 0);
  if (!activeBudgets.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-2 text-center">No budget set yet.</p>`;
    return;
  }
  container.innerHTML = activeBudgets.map(cat => {
    const limit = categoryBudgets[cat];
    const spent = spentByCat[cat] || 0;
    const percent = Math.min(((spent / limit) * 100), 100).toFixed(1);
    return `
      <div class="space-y-1">
        <div class="flex justify-between text-xs">
          <span class="font-semibold text-white">${cat} Budget</span>
          <span class="text-slate-300">${userCurrency} ${spent.toFixed(2)} / ${limit.toFixed(2)}</span>
        </div>
        <div class="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div class="h-full bg-indigo-500" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderSavingsGoals() {
  const container = document.getElementById('savings-goals-list');
  if (!container) return;
  if (!savingsGoals.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-1 text-center">No savings goals.</p>`;
    return;
  }
  container.innerHTML = savingsGoals.map(g => {
    const percent = Math.min(((g.saved / g.target) * 100), 100).toFixed(1);
    return `<div class="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs"><div class="flex justify-between font-semibold"><span class="text-white">${g.title}</span><span class="text-emerald-400">${userCurrency} ${g.saved}/${g.target}</span></div></div>`;
  }).join('');
}

function renderDebtLoan() {
  const container = document.getElementById('debt-loan-list');
  if (!container) return;
  if (!debtRecords.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-1 text-center">No debt records.</p>`;
    return;
  }
  container.innerHTML = debtRecords.map(d => `<div class="flex justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs"><div><span class="font-bold text-white">${d.person}</span></div><span class="font-bold text-white">${userCurrency} ${d.amount}</span></div>`).join('');
}

function loadGoalsAndDebts() {
  const uId = currentUser ? currentUser.id : 'local_user';
  savingsGoals = JSON.parse(localStorage.getItem(`spendly_goals_${uId}`) || '[]');
  debtRecords = JSON.parse(localStorage.getItem(`spendly_debts_${uId}`) || '[]');
}

function loadSavedBudgets() {
  const uId = currentUser ? currentUser.id : 'local_user';
  const saved = localStorage.getItem(`spendly_budgets_${uId}`);
  if (saved) categoryBudgets = JSON.parse(saved);
}

function updateMetrics(transactions) {
  let income = 0, expense = 0;
  transactions.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type === 'Income') income += amt;
    else expense += amt;
  });
  const balance = income - expense;
  if (document.getElementById('total-balance')) document.getElementById('total-balance').innerText = `${userCurrency} ${balance.toFixed(2)}`;
  if (document.getElementById('total-income')) document.getElementById('total-income').innerText = `+${userCurrency} ${income.toFixed(2)}`;
  if (document.getElementById('total-expense')) document.getElementById('total-expense').innerText = `-${userCurrency} ${expense.toFixed(2)}`;
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
  document.getElementById('modal-trans-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('trans-modal').classList.remove('hidden');
};
window.closeTransactionModal = () => document.getElementById('trans-modal').classList.add('hidden');
window.openBudgetModal = () => document.getElementById('budget-modal').classList.remove('hidden');
window.closeBudgetModal = () => document.getElementById('budget-modal').classList.add('hidden');
window.openGoalModal = () => document.getElementById('goal-modal').classList.remove('hidden');
window.closeGoalModal = () => document.getElementById('goal-modal').classList.add('hidden');
window.openDebtModal = () => document.getElementById('debt-modal').classList.remove('hidden');
window.closeDebtModal = () => document.getElementById('debt-modal').classList.add('hidden');

function bindEvents() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    if (typeof dbClient !== 'undefined' && dbClient) await dbClient.auth.signOut();
    localStorage.removeItem('spendly_active_tab');
    localStorage.removeItem('spendly_last_user');
    window.location.href = 'index.html';
  });

  document.getElementById('search-input')?.addEventListener('input', window.applyFiltersAndRender);
  document.getElementById('filter-from-date')?.addEventListener('change', window.applyFiltersAndRender);
  document.getElementById('filter-to-date')?.addEventListener('change', window.applyFiltersAndRender);
  document.getElementById('sort-by-select')?.addEventListener('change', window.applyFiltersAndRender);

  document.getElementById('modal-trans-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('modal-trans-title').value;
    const amount = parseFloat(document.getElementById('modal-trans-amount').value);
    const customDate = document.getElementById('modal-trans-date').value;
    const type = document.getElementById('modal-trans-type').value;
    const category = document.getElementById('modal-trans-category').value;

    const payload = {
      user_id: currentUser ? currentUser.id : 'local_user',
      title,
      amount,
      type,
      category,
      created_at: customDate ? new Date(customDate).toISOString() : new Date().toISOString()
    };

    let isSaved = false;
    if (navigator.onLine && typeof dbClient !== 'undefined' && dbClient && currentUser && currentUser.id !== 'local_user') {
      try {
        const { error } = await dbClient.from('transactions').insert([payload]);
        if (!error) isSaved = true;
      } catch (err) {
        console.error(err);
      }
    }

    if (!isSaved) {
      addToOfflineQueue('insert', payload);
    }

    window.closeTransactionModal();
    await loadTransactions();
  });

  document.getElementById('goal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const uId = currentUser ? currentUser.id : 'local_user';
    savingsGoals.push({
      title: document.getElementById('goal-title').value,
      target: parseFloat(document.getElementById('goal-target').value),
      saved: parseFloat(document.getElementById('goal-saved').value)
    });
    localStorage.setItem(`spendly_goals_${uId}`, JSON.stringify(savingsGoals));
    window.closeGoalModal();
    renderSavingsGoals();
  });

  document.getElementById('debt-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const uId = currentUser ? currentUser.id : 'local_user';
    debtRecords.push({
      person: document.getElementById('debt-person').value,
      amount: parseFloat(document.getElementById('debt-amount').value),
      type: document.getElementById('debt-type').value
    });
    localStorage.setItem(`spendly_debts_${uId}`, JSON.stringify(debtRecords));
    window.closeDebtModal();
    renderDebtLoan();
  });

  document.getElementById('budget-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const uId = currentUser ? currentUser.id : 'local_user';
    categoryBudgets.Food = parseFloat(document.getElementById('budget-food').value) || 0;
    categoryBudgets.Rent = parseFloat(document.getElementById('budget-rent').value) || 0;
    categoryBudgets.Shopping = parseFloat(document.getElementById('budget-shopping').value) || 0;
    categoryBudgets.Bills = parseFloat(document.getElementById('budget-bills').value) || 0;
    localStorage.setItem(`spendly_budgets_${uId}`, JSON.stringify(categoryBudgets));
    window.closeBudgetModal();
    renderBudgets(allTransactions);
  });
}

window.deleteTransaction = async function(id) {
  if (!confirm("Are you sure?")) return;
  let deleted = false;
  if (navigator.onLine && typeof dbClient !== 'undefined' && dbClient && currentUser && currentUser.id !== 'local_user') {
    try {
      if (!String(id).startsWith('temp_')) {
        const { error } = await dbClient.from('transactions').delete().eq('id', id);
        if (!error) deleted = true;
      }
    } catch (e) {
      console.error(e);
    }
  }
  if (!deleted) addToOfflineQueue('delete', null, id);
  await loadTransactions();
};

window.exportTransactionsCSV = function() {
  if (!allTransactions.length) return alert("No data!");
  let csv = 'Title,Amount,Type,Category,Date\n';
  allTransactions.forEach(t => {
    csv += `"${t.title}","${t.amount}","${t.type}","${t.category}","${t.created_at ? t.created_at.split('T')[0] : ''}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Spendly_Report.csv`;
  a.click();
};

window.exportMonthlyPDF = function() {
  html2pdf().from(document.getElementById('pdf-report-area')).save(`Spendly_Report.pdf`);
};
