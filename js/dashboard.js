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
  // Bind all UI event listeners immediately
  bindEvents();

  if (!dbClient) {
    alert("Database connection failed. Please reload.");
    return;
  }

  try {
    const { data: { user }, error } = await dbClient.auth.getUser();
    if (error || !user) {
      window.location.href = 'index.html';
      return;
    }

    currentUser = user;

    loadSavedBudgets();
    await loadUserProfile();
    await loadTransactions();

    // Active Tab persistence on page refresh
    const savedTab = localStorage.getItem('spendly_active_tab') || 'dashboard';
    window.switchTab(savedTab);
  } catch (err) {
    console.error("Initialization Error:", err);
  }
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
    window.applyFiltersAndRender();
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
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">No transactions recorded yet.</p>`;
    return;
  }

  container.innerHTML = recent.map(t => createItemHTML(t)).join('');
}

// 2. Transactions Tab Filtering & Sorting
window.applyFiltersAndRender = function() {
  const container = document.getElementById('all-transactions-list');
  if (!container) return;

  let filtered = [...allTransactions];

  const searchQ = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  const fromDate = document.getElementById('filter-from-date')?.value;
  const toDate = document.getElementById('filter-to-date')?.value;
  const sortBy = document.getElementById('sort-by-select')?.value || 'newest';

  if (searchQ) {
    filtered = filtered.filter(t => 
      (t.title && t.title.toLowerCase().includes(searchQ)) || 
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

  // Sorting Logic
  if (sortBy === 'newest') {
    filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  } else if (sortBy === 'oldest') {
    filtered.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  } else if (sortBy === 'high-amount') {
    filtered.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));
  } else if (sortBy === 'low-amount') {
    filtered.sort((a, b) => (parseFloat(a.amount) || 0) - (parseFloat(b.amount) || 0));
  }

  if (filtered.length === 0) {
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
  let income = 
