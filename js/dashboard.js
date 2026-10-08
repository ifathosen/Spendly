let currentUser = null;
let userCurrency = 'SAR ﷼';
let allTransactions = [];
let categoryBudgets = {
  Food: 0,
  Rent: 0,
  Shopping: 0,
  Bills: 0
};

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

  loadSavedBudgets();
  await loadUserProfile();
  await loadTransactions();
  bindEvents();

  // Active Tab persistence on page refresh
  const savedTab = localStorage.getItem('spendly_active_tab') || 'dashboard';
  switchTab(savedTab);
});

async function loadUserProfile() {
  try {
    const { data } = await dbClient
      .from('profiles')
      .select('full_name, currency')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (data && data.currency) userCurrency = data.currency;

    const name = (data && data.full_name) ? data.full_name : (currentUser.email ? currentUser.email.split('@')[0] : 'User');

    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('profile-name-val');
    const emailEl = document.getElementById('profile-email-val');
    const currSelect = document.getElementById('currency-select');

    if (avatarEl) avatarEl.innerText = name.charAt(0).toUpperCase();
    if (nameEl) nameEl.innerText = name;
    if (emailEl) emailEl.innerText = currentUser.email || '';
    if (currSelect) currSelect.value = userCurrency;
  } catch (err) {
    console.error("Profile Load Error:", err);
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
    applyFiltersAndRender();
    renderAnalytics(allTransactions);
    renderBudgets(allTransactions);
    updateMetrics(allTransactions);

    const badge = document.getElementById('trans-count-badge');
    const profileCount = document.getElementById('profile-trans-count');
    if (badge) badge.innerText = `${allTransactions.length} Items`;
    if (profileCount) profileCount.innerText = allTransactions.length;

  } catch (err) {
    console.error("Transactions Fetch Error:", err);
  }
}

// 1. Dashboard Tab - Last 10 Items
function renderDashboardList(transactions) {
  const container = document.getElementById('dashboard-recent-list');
  if (!container) return;

  const recent = transactions.slice(0, 10);
  if (recent.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">${translations[currentLang].noData}</p>`;
    return;
  }

  container.innerHTML = recent.map(t => createItemHTML(t)).join('');
}

// 2. Transactions Tab Filtering & Sorting
function applyFiltersAndRender() {
  const container = document.getElementById('all-transactions-list');
  if (!container) return;

  let filtered = [...allTransactions];

  const searchQ = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  const fromDate = document.getElementById('filter-from-date')?.value;
  const toDate = document.getElementById('filter-to-date')?.value;
  const sortBy = document.getElementById('sort-by-select')?.value || 'newest';

  if (searchQ) {
    filtered = filtered.filter(t => 
      t.title.toLowerCase().includes(searchQ) || 
      (t.category && t.category.toLowerCase().includes(searchQ))
    );
  }

  if (fromDate) {
    filtered = filtered.filter(t => {
      const tDate = t.created_at ? t.created_at.split('T')[0] : '';
      return tDate >= fromDate;
    });
  }

  if (toDate) {
    filtered = filtered.filter(t => {
      const tDate = t.created_at ? t.created_at.split('T')[0] : '';
      return tDate <= toDate;
    });
  }

  // Sorting
  if (sortBy === 'newest') {
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (sortBy === 'oldest') {
    filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else if (sortBy === 'high-amount') {
    filtered.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
  } else if (sortBy === 'low-amount') {
    filtered.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
  }

  if (filtered.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">No matching transactions found.</p>`;
    return;
  }

  container.innerHTML = filtered.map(t => createItemHTML(t)).join('');
}

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
        <button onclick="editTransaction(${t.id})" class="text-slate-500 hover:text-indigo-400 text-xs">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button onclick="deleteTransaction(${t.id})" class="text-slate-500 hover:text-rose-400 text-xs">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

// 3. Analytics & Budget
function renderAnalytics(transactions) {
  const container = document.getElementById('analytics-category-list');
  if (!container) return;

  const expenses = transactions.filter(t => t.type === 'Expense');
  if (expenses.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-2 text-center">No expense data recorded.</p>`;
    return;
  }

  const categoryTotals = {};
  let totalExpenseAmount = 0;

  expenses.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    const cat = t.category || 'General';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
    totalExpenseAmount += amt;
  });

  container.innerHTML = Object.keys(categoryTotals).map(cat => {
    const catAmount = categoryTotals[cat];
    const percentage = totalExpenseAmount > 0 ? ((catAmount / totalExpenseAmount) * 100).toFixed(1) : 0;

    return `
      <div class="space-y-1">
        <div class="flex justify-between text-xs">
          <span class="font-semibold text-slate-300">${cat}</span>
          <span class="font-bold text-rose-400">${userCurrency} ${catAmount.toFixed(2)} (${percentage}%)</span>
        </div>
        <div class="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div class="h-full bg-indigo-500 rounded-full" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
  }).join('');
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

  const categories = Object.keys(categoryBudgets);
  const activeBudgets = categories.filter(c => categoryBudgets[c] > 0);

  if (activeBudgets.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-2 text-center">No budget set yet. Click "Set Budget" above to start tracking.</p>`;
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
          <span class="font-bold ${isOver ? 'text-rose-400' : 'text-slate-300'}">
            ${userCurrency} ${spent.toFixed(2)} / ${limit.toFixed(2)}
          </span>
        </div>
        <div class="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div class="h-full ${isOver ? 'bg-rose-500' : (percent > 80 ? 'bg-amber-500' : 'bg-emerald-500')} rounded-full" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function loadSavedBudgets() {
  if (!currentUser) return;
  const saved = localStorage.getItem(`spendly_budgets_${currentUser.id}`);
  if (saved) {
    categoryBudgets = JSON.parse(saved);
  }
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

  const balEl = document.getElementById('total-balance');
  const incEl = document.getElementById('total-income');
  const expEl = document.getElementById('total-expense');

  if (balEl) balEl.innerText = `${userCurrency} ${balance.toFixed(2)}`;
  if (incEl) incEl.innerText = `+${userCurrency} ${income.toFixed(2)}`;
  if (expEl) expEl.innerText = `-${userCurrency} ${expense.toFixed(2)}`;
}

// Tab Switcher with Persistence
function switchTab(tabName) {
  localStorage.setItem('spendly_active_tab', tabName);

  document.querySelectorAll('.tab-page').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(el => {
    el.className = "nav-btn flex flex-col items-center gap-1 text-slate-400 hover:text-white font-semibold text-[10px]";
  });

  const activeTab = document.getElementById(`tab-${tabName}`);
  if (activeTab) activeTab.classList.remove('hidden');

  const activeNav = document.getElementById(`nav-${tabName}`);
  if (activeNav) {
    activeNav.className = "nav-btn flex flex-col items-center gap-1 text-indigo-400 font-semibold text-[10px]";
  }

  if (tabName === 'transactions') applyFiltersAndRender();
  if (tabName === 'analytics') {
    renderAnalytics(allTransactions);
    renderBudgets(allTransactions);
  }
}

// Quick Add Modal Trigger (Auto Today Date)
function openTransactionModal() {
  document.getElementById('modal-trans-form').reset();
  document.getElementById('modal-trans-id').value = '';
  
  // Set default today date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('modal-trans-date').value = today;

  document.getElementById('trans-modal').classList.remove('hidden');
}

function closeTransactionModal() {
  document.getElementById('trans-modal').classList.add('hidden');
}

function openBudgetModal() {
  document.getElementById('budget-food').value = categoryBudgets.Food || '';
  document.getElementById('budget-rent').value = categoryBudgets.Rent || '';
  document.getElementById('budget-shopping').value = categoryBudgets.Shopping || '';
  document.getElementById('budget-bills').value = categoryBudgets.Bills || '';
  document.getElementById('budget-modal').classList.remove('hidden');
}

function closeBudgetModal() {
  document.getElementById('budget-modal').classList.add('hidden');
}

function bindEvents() {
  document.getElementById('logout-btn')?.addEventListener('click', logoutUser);

  // Filter Listeners
  document.getElementById('search-input')?.addEventListener('input', applyFiltersAndRender);
  document.getElementById('filter-from-date')?.addEventListener('change', applyFiltersAndRender);
  document.getElementById('filter-to-date')?.addEventListener('change', applyFiltersAndRender);
  document.getElementById('sort-by-select')?.addEventListener('change', applyFiltersAndRender);

  // Currency Selector Listener
  document.getElementById('currency-select')?.addEventListener('change', async (e) => {
    userCurrency = e.target.value;
    await dbClient.from('profiles').update({ currency: userCurrency }).eq('id', currentUser.id);
    await loadTransactions();
  });

  // Modal Submit (Quick Add)
  document.getElementById('modal-trans-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('modal-trans-id').value;
    const title = document.getElementById('modal-trans-title').value;
    const amount = parseFloat(document.getElementById('modal-trans-amount').value);
    const customDate = document.getElementById('modal-trans-date').value;
    const type = document.getElementById('modal-trans-type').value;
    const category = document.getElementById('modal-trans-category').value;

    const recordDate = customDate ? new Date(customDate).toISOString() : new Date().toISOString();

    if (id) {
      await dbClient.from('transactions').update({ title, amount, type, category, created_at: recordDate }).eq('id', id);
    } else {
      await dbClient.from('transactions').insert([{ user_id: currentUser.id, title, amount, type, category, created_at: recordDate }]);
    }

    closeTransactionModal();
    await loadTransactions();
  });

  // Budget Form Submit
  document.getElementById('budget-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    categoryBudgets.Food = parseFloat(document.getElementById('budget-food').value) || 0;
    categoryBudgets.Rent = parseFloat(document.getElementById('budget-rent').value) || 0;
    categoryBudgets.Shopping = parseFloat(document.getElementById('budget-shopping').value) || 0;
    categoryBudgets.Bills = parseFloat(document.getElementById('budget-bills').value) || 0;

    localStorage.setItem(`spendly_budgets_${currentUser.id}`, JSON.stringify(categoryBudgets));
    closeBudgetModal();
    renderBudgets(allTransactions);
  });

  // Support Form
  document.getElementById('support-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Thank you! Your message has been sent to support.');
    document.getElementById('support-msg').value = '';
  });
}

async function logoutUser() {
  if (dbClient) {
    await dbClient.auth.signOut();
    localStorage.removeItem('spendly_active_tab');
    window.location.href = 'index.html';
  }
}

window.editTransaction = function(id) {
  const t = allTransactions.find(item => item.id === id);
  if (!t) return;

  document.getElementById('modal-trans-id').value = t.id;
  document.getElementById('modal-trans-title').value = t.title;
  document.getElementById('modal-trans-amount').value = t.amount;
  document.getElementById('modal-trans-type').value = t.type;
  document.getElementById('modal-trans-category').value = t.category || 'General';

  if (t.created_at) {
    document.getElementById('modal-trans-date').value = t.created_at.split('T')[0];
  }

  document.getElementById('trans-modal').classList.remove('hidden');
};

window.deleteTransaction = async function(id) {
  if (!confirm(translations[currentLang].confirmDelete)) return;
  await dbClient.from('transactions').delete().eq('id', id);
  await loadTransactions();
};

// CSV Export
function exportTransactionsCSV() {
  if (allTransactions.length === 0) {
    alert("No data available to export!");
    return;
  }

  let csv = 'ID,Title,Amount,Type,Category,Date\n';
  allTransactions.forEach(t => {
    const d = t.created_at ? t.created_at.split('T')[0] : '';
    csv += `"${t.id}","${t.title}","${t.amount}","${t.type}","${t.category}","${d}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', `Spendly_Transactions_${new Date().toISOString().split('T')[0]}.csv`);
  a.click();
}
