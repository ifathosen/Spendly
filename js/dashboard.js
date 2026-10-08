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

  // Listen for Internet Restoration to Auto-Sync
  window.addEventListener('online', syncOfflineQueue);

  if (!dbClient) {
    alert("Database connection failed.");
    return;
  }

  try {
    if (navigator.onLine) {
      const { data: { user }, error } = await dbClient.auth.getUser();
      if (user) {
        currentUser = user;
        localStorage.setItem('spendly_last_user', JSON.stringify(user));
      }
    } else {
      // Offline fallback user session
      const savedUser = localStorage.getItem('spendly_last_user');
      if (savedUser) currentUser = JSON.parse(savedUser);
    }

    if (!currentUser) {
      window.location.href = 'index.html';
      return;
    }

    loadSavedBudgets();
    loadGoalsAndDebts();
    await loadUserProfile();
    await loadTransactions();

    const savedTab = localStorage.getItem('spendly_active_tab') || 'dashboard';
    window.switchTab(savedTab);
  } catch (err) {
    console.error("Initialization Error:", err);
  }
});

// Security PIN Check
function checkPinLock() {
  const pin = localStorage.getItem('spendly_app_pin');
  if (pin) {
    document.getElementById('pin-screen')?.classList.remove('hidden');
  }
}

window.verifyPin = function() {
  const enteredPin = document.getElementById('pin-input').value;
  const savedPin = localStorage.getItem('spendly_app_pin');
  if (enteredPin === savedPin) {
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
      alert("PIN Lock Enabled!");
    } else {
      alert("Invalid PIN. Enter exactly 4 digits.");
    }
  }
};

async function loadUserProfile() {
  try {
    if (navigator.onLine && dbClient && currentUser) {
      const { data } = await dbClient
        .from('profiles')
        .select('full_name, currency')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (data && data.currency) userCurrency = data.currency;
      if (data) localStorage.setItem(`spendly_profile_${currentUser.id}`, JSON.stringify(data));
    } else {
      const cachedProf = localStorage.getItem(`spendly_profile_${currentUser ? currentUser.id : ''}`);
      if (cachedProf) {
        const p = JSON.parse(cachedProf);
        if (p.currency) userCurrency = p.currency;
      }
    }

    const name = (currentUser && currentUser.user_metadata && currentUser.user_metadata.full_name) 
      ? currentUser.user_metadata.full_name 
      : (currentUser && currentUser.email ? currentUser.email.split('@')[0] : 'User');

    document.getElementById('user-avatar').innerText = name.charAt(0).toUpperCase();
    document.getElementById('profile-name-val').innerText = name;
    document.getElementById('profile-email-val').innerText = currentUser ? currentUser.email : '';
    document.getElementById('currency-select').value = userCurrency;
  } catch (err) {
    console.error(err);
  }
}

async function loadTransactions() {
  if (navigator.onLine) {
    await syncOfflineQueue();
  }

  try {
    if (navigator.onLine && dbClient && currentUser) {
      const { data, error } = await dbClient
        .from('transactions')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        allTransactions = data;
        localStorage.setItem(`spendly_cached_trans_${currentUser.id}`, JSON.stringify(data));
      }
    } else {
      throw new Error("Offline mode");
    }
  } catch (err) {
    const cached = localStorage.getItem(`spendly_cached_trans_${currentUser ? currentUser.id : ''}`);
    if (cached) {
      allTransactions = JSON.parse(cached);
    }
  }

  renderDashboardList(allTransactions);
  window.applyFiltersAndRender();
  renderAnalyticsChart(allTransactions);
  renderBudgets(allTransactions);
  renderSavingsGoals();
  renderDebtLoan();
  updateMetrics(allTransactions);

  document.getElementById('trans-count-badge').innerText = `${allTransactions.length} Items`;
  document.getElementById('profile-trans-count').innerText = allTransactions.length;
}

// Auto Sync Offline Queue when back Online
async function syncOfflineQueue() {
  if (!navigator.onLine || !dbClient || !currentUser) return;
  const key = `spendly_offline_queue_${currentUser.id}`;
  const queue = JSON.parse(localStorage.getItem(key) || '[]');
  if (queue.length === 0) return;

  for (const item of queue) {
    try {
      if (item.action === 'insert') {
        const { id, ...payload } = item.payload; // Remove temp offline id
        await dbClient.from('transactions').insert([payload]);
      } else if (item.action === 'update') {
        await dbClient.from('transactions').update(item.payload).eq('id', item.id);
      } else if (item.action === 'delete') {
        await dbClient.from('transactions').delete().eq('id', item.id);
      }
    } catch (err) {
      console.error("Queue Sync Error:", err);
    }
  }

  localStorage.removeItem(key);
  await loadTransactions();
  alert("🟢 Internet connected! Offline transactions synced to cloud.");
}

function addToOfflineQueue(action, payload, id = null) {
  if (!currentUser) return;
  const key = `spendly_offline_queue_${currentUser.id}`;
  const queue = JSON.parse(localStorage.getItem(key) || '[]');

  if (action === 'insert') {
    const tempId = 'temp_' + Date.now();
    const newRecord = { ...payload, id: tempId };
    allTransactions.unshift(newRecord);
    queue.push({ action, payload: newRecord });
  } else if (action === 'update') {
    const idx = allTransactions.findIndex(t => t.id == id);
    if (idx !== -1) allTransactions[idx] = { ...allTransactions[idx], ...payload };
    queue.push({ action, payload, id });
  } else if (action === 'delete') {
    allTransactions = allTransactions.filter(t => t.id != id);
    queue.push({ action, id });
  }

  localStorage.setItem(key, JSON.stringify(queue));
  localStorage.setItem(`spendly_cached_trans_${currentUser.id}`, JSON.stringify(allTransactions));
}

function renderDashboardList(transactions) {
  const container = document.getElementById('dashboard-recent-list');
  if (!container) return;

  const recent = transactions.slice(0, 10);
  if (recent.length === 0) {
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

  if (filtered.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">No matching transactions found.</p>`;
    return;
  }

  container.innerHTML = filtered.map(t => createItemHTML(t)).join('');
};

function createItemHTML(t) {
  const isIncome = t.type === 'Income';
  const amt = parseFloat(t.amount) || 0;
  const formattedDate = t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const payMethod = t.payment_method ? ` • ${t.payment_method}` : '';

  return `
    <div class="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg ${isIncome ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'} flex items-center justify-center font-bold text-xs">
          <i class="fa-solid ${isIncome ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white">${t.title}</h4>
          <span class="text-[10px] text-slate-500">${t.category || 'General'}${payMethod} • ${formattedDate}</span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs font-bold ${isIncome ? 'text-emerald-400' : 'text-rose-400'}">
          ${isIncome ? '+' : '-'}${userCurrency} ${amt.toFixed(2)}
        </span>
        <button onclick="editTransaction('${t.id}')" class="text-slate-500 hover:text-indigo-400 text-xs"><i class="fa-solid fa-pen"></i></button>
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

  const labels = Object.keys(catTotals);
  const data = Object.values(catTotals);

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels.length ? labels : ['No Data'],
      datasets: [{
        data: data.length ? data : [1],
        backgroundColor: ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#64748b']
      }]
    },
    options: {
      plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 } } } }
    }
  });
}

function renderBudgets(transactions) {
  const container = document.getElementById('budget-tracker-list');
  if (!container) return;

  const expenses = transactions.filter(t => t.type === 'Expense');
  const spentByCat = {};

  expenses.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    const cat = t.category || 'General';
    spentByCat[cat] = (spentByCat[cat] || 0) + amt;
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
    const isOver = spent > limit;

    return `
      <div class="space-y-1">
        <div class="flex justify-between text-xs">
          <span class="font-semibold text-white">${cat} Budget</span>
          <span class="font-bold ${isOver ? 'text-rose-400' : 'text-slate-300'}">${userCurrency} ${spent.toFixed(2)} / ${limit.toFixed(2)}</span>
        </div>
        <div class="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div class="h-full ${isOver ? 'bg-rose-500' : 'bg-indigo-500'}" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderSavingsGoals() {
  const container = document.getElementById('savings-goals-list');
  if (!container) return;

  if (!savingsGoals.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-1 text-center">No savings goals created.</p>`;
    return;
  }

  container.innerHTML = savingsGoals.map((g) => {
    const percent = Math.min(((g.saved / g.target) * 100), 100).toFixed(1);
    return `
      <div class="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
        <div class="flex justify-between text-xs font-semibold">
          <span class="text-white">${g.title}</span>
          <span class="text-emerald-400">${userCurrency} ${g.saved} / ${g.target} (${percent}%)</span>
        </div>
        <div class="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
          <div class="h-full bg-emerald-500 rounded-full" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderDebtLoan() {
  const container = document.getElementById('debt-loan-list');
  if (!container) return;

  if (!debtRecords.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-1 text-center">No debt or loan records.</p>`;
    return;
  }

  container.innerHTML = debtRecords.map((d) => {
    const isLent = d.type === 'Lent';
    return `
      <div class="flex justify-between items-center p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
        <div>
          <span class="font-bold text-white">${d.person}</span>
          <span class="text-[10px] block ${isLent ? 'text-emerald-400' : 'text-rose-400'}">${isLent ? 'Lent (পাবো)' : 'Borrowed (দেবো)'}</span>
        </div>
        <span class="font-bold text-white">${userCurrency} ${parseFloat(d.amount).toFixed(2)}</span>
      </div>
    `;
  }).join('');
}

function loadGoalsAndDebts() {
  if (!currentUser) return;
  savingsGoals = JSON.parse(localStorage.getItem(`spendly_goals_${currentUser.id}`) || '[]');
  debtRecords = JSON.parse(localStorage.getItem(`spendly_debts_${currentUser.id}`) || '[]');
}

function loadSavedBudgets() {
  if (!currentUser) return;
  const saved = localStorage.getItem(`spendly_budgets_${currentUser.id}`);
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
  document.getElementById('total-balance').innerText = `${userCurrency} ${balance.toFixed(2)}`;
  document.getElementById('total-income').innerText = `+${userCurrency} ${income.toFixed(2)}`;
  document.getElementById('total-expense').innerText = `-${userCurrency} ${expense.toFixed(2)}`;
}

window.switchTab = function(tabName) {
  localStorage.setItem('spendly_active_tab', tabName);
  document.querySelectorAll('.tab-page').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(el => el.className = "nav-btn flex flex-col items-center gap-1 text-slate-400 hover:text-white font-semibold text-[10px]");

  const activeTab = document.getElementById(`tab-${tabName}`);
  if (activeTab) activeTab.classList.remove('hidden');

  const activeNav = document.getElementById(`nav-${tabName}`);
  if (activeNav) activeNav.className = "nav-btn flex flex-col items-center gap-1 text-indigo-400 font-semibold text-[10px]";

  if (tabName === 'transactions') window.applyFiltersAndRender();
  if (tabName === 'analytics') {
    renderAnalyticsChart(allTransactions);
    renderBudgets(allTransactions);
  }
};

// Modal Control Functions
window.openTransactionModal = () => {
  document.getElementById('modal-trans-form').reset();
  document.getElementById('modal-trans-id').value = '';
  document.getElementById('modal-trans-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('trans-modal').classList.remove('hidden');
};
window.closeTransactionModal = () => document.getElementById('trans-modal').classList.add('hidden');

window.openBudgetModal = () => {
  document.getElementById('budget-food').value = categoryBudgets.Food || '';
  document.getElementById('budget-rent').value = categoryBudgets.Rent || '';
  document.getElementById('budget-shopping').value = categoryBudgets.Shopping || '';
  document.getElementById('budget-bills').value = categoryBudgets.Bills || '';
  document.getElementById('budget-modal').classList.remove('hidden');
};
window.closeBudgetModal = () => document.getElementById('budget-modal').classList.add('hidden');

window.openGoalModal = () => document.getElementById('goal-modal').classList.remove('hidden');
window.closeGoalModal = () => document.getElementById('goal-modal').classList.add('hidden');

window.openDebtModal = () => document.getElementById('debt-modal').classList.remove('hidden');
window.closeDebtModal = () => document.getElementById('debt-modal').classList.add('hidden');

function bindEvents() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    if (dbClient) await dbClient.auth.signOut();
    localStorage.removeItem('spendly_active_tab');
    localStorage.removeItem('spendly_last_user');
    window.location.href = 'index.html';
  });

  document.getElementById('search-input')?.addEventListener('input', window.applyFiltersAndRender);
  document.getElementById('filter-from-date')?.addEventListener('change', window.applyFiltersAndRender);
  document.getElementById('filter-to-date')?.addEventListener('change', window.applyFiltersAndRender);
  document.getElementById('sort-by-select')?.addEventListener('change', window.applyFiltersAndRender);

  document.getElementById('currency-select')?.addEventListener('change', async (e) => {
    userCurrency = e.target.value;
    if (navigator.onLine && dbClient && currentUser) {
      await dbClient.from('profiles').update({ currency: userCurrency }).eq('id', currentUser.id);
    }
    await loadTransactions();
  });

  document.getElementById('modal-trans-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('modal-trans-id').value;
    const title = document.getElementById('modal-trans-title').value;
    const amount = parseFloat(document.getElementById('modal-trans-amount').value);
    const customDate = document.getElementById('modal-trans-date').value;
    const type = document.getElementById('modal-trans-type').value;
    const payment = document.getElementById('modal-trans-payment').value;
    const category = document.getElementById('modal-trans-category').value;

    const recordDate = customDate ? new Date(customDate).toISOString() : new Date().toISOString();
    const payload = { user_id: currentUser ? currentUser.id : 'offline', title, amount, type, category, payment_method: payment, created_at: recordDate };

    if (navigator.onLine && dbClient && currentUser) {
      try {
        if (id) {
          await dbClient.from('transactions').update({ title, amount, type, category, payment_method: payment, created_at: recordDate }).eq('id', id);
        } else {
          await dbClient.from('transactions').insert([payload]);
        }
      } catch (err) {
        addToOfflineQueue(id ? 'update' : 'insert', payload, id);
      }
    } else {
      addToOfflineQueue(id ? 'update' : 'insert', payload, id);
    }

    window.closeTransactionModal();
    await loadTransactions();
  });

  document.getElementById('goal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    savingsGoals.push({
      title: document.getElementById('goal-title').value,
      target: parseFloat(document.getElementById('goal-target').value),
      saved: parseFloat(document.getElementById('goal-saved').value)
    });
    localStorage.setItem(`spendly_goals_${currentUser.id}`, JSON.stringify(savingsGoals));
    window.closeGoalModal();
    renderSavingsGoals();
  });

  document.getElementById('debt-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    debtRecords.push({
      person: document.getElementById('debt-person').value,
      amount: parseFloat(document.getElementById('debt-amount').value),
      type: document.getElementById('debt-type').value
    });
    localStorage.setItem(`spendly_debts_${currentUser.id}`, JSON.stringify(debtRecords));
    window.closeDebtModal();
    renderDebtLoan();
  });

  document.getElementById('budget-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    categoryBudgets.Food = parseFloat(document.getElementById('budget-food').value) || 0;
    categoryBudgets.Rent = parseFloat(document.getElementById('budget-rent').value) || 0;
    categoryBudgets.Shopping = parseFloat(document.getElementById('budget-shopping').value) || 0;
    categoryBudgets.Bills = parseFloat(document.getElementById('budget-bills').value) || 0;

    localStorage.setItem(`spendly_budgets_${currentUser.id}`, JSON.stringify(categoryBudgets));
    window.closeBudgetModal();
    renderBudgets(allTransactions);
  });
}

window.editTransaction = function(id) {
  const t = allTransactions.find(item => item.id == id);
  if (!t) return;

  document.getElementById('modal-trans-id').value = t.id;
  document.getElementById('modal-trans-title').value = t.title;
  document.getElementById('modal-trans-amount').value = t.amount;
  document.getElementById('modal-trans-type').value = t.type;
  document.getElementById('modal-trans-category').value = t.category || 'General';
  document.getElementById('modal-trans-payment').value = t.payment_method || 'Cash';
  if (t.created_at) document.getElementById('modal-trans-date').value = t.created_at.split('T')[0];

  document.getElementById('trans-modal').classList.remove('hidden');
};

window.deleteTransaction = async function(id) {
  if (!confirm("Are you sure you want to delete this item?")) return;
  if (navigator.onLine && dbClient && currentUser) {
    try {
      await dbClient.from('transactions').delete().eq('id', id);
    } catch (err) {
      addToOfflineQueue('delete', null, id);
    }
  } else {
    addToOfflineQueue('delete', null, id);
  }
  await loadTransactions();
};

window.exportTransactionsCSV = function() {
  if (!allTransactions.length) return alert("No data to export!");
  let csv = 'Title,Amount,Type,Category,Payment,Date\n';
  allTransactions.forEach(t => {
    csv += `"${t.title}","${t.amount}","${t.type}","${t.category}","${t.payment_method || 'Cash'}","${t.created_at ? t.created_at.split('T')[0] : ''}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Spendly_Report_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
};

window.exportMonthlyPDF = function() {
  const element = document.getElementById('pdf-report-area');
  const opt = {
    margin: 0.5,
    filename: `Spendly_Report_${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };
  html2pdf().set(opt).from(element).save();
};
