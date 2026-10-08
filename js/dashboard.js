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

    const name = (data && data.full_name) ? data.full_name : (currentUser.email ? currentUser.email.split('@')[0] : 'User');

    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('profile-name-val');
    const emailEl = document.getElementById('profile-email-val');
    const currEl = document.getElementById('profile-currency-val');

    if (avatarEl) avatarEl.innerText = name.charAt(0).toUpperCase();
    if (nameEl) nameEl.innerText = name;
    if (emailEl) emailEl.innerText = currentUser.email || '';
    if (currEl) currEl.innerText = userCurrency;
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
    
    // All Tab Renderers
    renderDashboardList(allTransactions);
    renderFullList(allTransactions);
    renderAnalytics(allTransactions);
    updateMetrics(allTransactions);

    const badge = document.getElementById('trans-count-badge');
    const profileCount = document.getElementById('profile-trans-count');
    if (badge) badge.innerText = `${allTransactions.length} Items`;
    if (profileCount) profileCount.innerText = allTransactions.length;

  } catch (err) {
    console.error("Transactions Fetch Error:", err);
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
    <div class="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg ${isIncome ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'} flex items-center justify-center font-bold text-xs">
          <i class="fa-solid ${isIncome ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white">${t.title}</h4>
          <span class="text-[10px] text-slate-500">${t.category || 'General'}</span>
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

function renderAnalytics(transactions) {
  const container = document.getElementById('analytics-category-list');
  if (!container) return;

  const expenses = transactions.filter(t => t.type === 'Expense');
  
  if (expenses.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">No expense data available for analytics.</p>`;
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
      <div class="space-y-1.5">
        <div class="flex justify-between text-xs">
          <span class="font-semibold text-slate-300">${cat}</span>
          <span class="font-bold text-rose-400">${userCurrency} ${catAmount.toFixed(2)} (${percentage}%)</span>
        </div>
        <div class="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div class="h-full bg-indigo-500 rounded-full" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
  }).join('');
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

function switchTab(tabName) {
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

  // Refresh view on tab click
  if (tabName === 'transactions') renderFullList(allTransactions);
  if (tabName === 'analytics') renderAnalytics(allTransactions);
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
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutUser);
  }

  const modalForm = document.getElementById('modal-trans-form');
  if (modalForm) {
    modalForm.addEventListener('submit', async (e) => {
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
  }

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = allTransactions.filter(t => 
        t.title.toLowerCase().includes(q) || 
        (t.category && t.category.toLowerCase().includes(q))
      );
      renderFullList(filtered);
    });
  }
}

async function logoutUser() {
  if (dbClient) {
    await dbClient.auth.signOut();
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

  document.getElementById('trans-modal').classList.remove('hidden');
};

window.deleteTransaction = async function(id) {
  if (!confirm(translations[currentLang].confirmDelete)) return;
  await dbClient.from('transactions').delete().eq('id', id);
  await loadTransactions();
};
