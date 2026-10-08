let currentUser = null;
let allTransactions = [];
let chartInstance = null;
let categoryBudgets = { Food: 0, Rent: 0, Shopping: 0 };

const KSA_ACCOUNTS = ['Cash', 'Al Rajhi', 'SNB', 'Barq', 'Neo', 'Enjaz'];
const BD_ACCOUNTS = ['IBBL', 'MTB', 'Midland', 'BRAC', 'EBL', 'Pubali'];

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

    loadSavedBudgets();
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

  renderTodayDashboardList(allTransactions);
  window.applyFiltersAndRender();
  renderAnalyticsChart(allTransactions);
  renderBudgets(allTransactions);
  updateMetricsAndAccounts(allTransactions);

  if (document.getElementById('trans-count-badge')) document.getElementById('trans-count-badge').innerText = `${allTransactions.length} Items`;
}

// FULL MULTI-CURRENCY & LIVE BALANCE CALCULATOR
function updateMetricsAndAccounts(transactions) {
  let ksaIncome = 0;
  let ksaExpense = 0;
  
  const accBalances = {
    // Saudi SAR Accounts
    'Cash': 0, 'Al Rajhi': 0, 'SNB': 0, 'Barq': 0, 'Neo': 0, 'Enjaz': 0,
    // BD BDT Accounts
    'IBBL': 0, 'MTB': 0, 'Midland': 0, 'BRAC': 0, 'EBL': 0, 'Pubali': 0
  };

  transactions.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    const fee = parseFloat(t.remit_fee) || 0;
    const convertedAmt = parseFloat(t.converted_amount) || 0;
    const incentive = parseFloat(t.incentive_amount) || 0;
    const type = t.type;

    if (type === 'Income') {
      const acc = t.payment_method || 'Cash';
      if (accBalances.hasOwnProperty(acc)) accBalances[acc] += amt;
      if (KSA_ACCOUNTS.includes(acc)) ksaIncome += amt;

    } else if (type === 'Expense') {
      const acc = t.payment_method || 'Cash';
      if (accBalances.hasOwnProperty(acc)) accBalances[acc] -= amt;
      if (KSA_ACCOUNTS.includes(acc)) ksaExpense += amt;

    } else if (type === 'Internal Transfer') {
      const fromAcc = t.from_account || t.payment_method;
      const toAcc = t.to_account;
      if (accBalances.hasOwnProperty(fromAcc)) accBalances[fromAcc] -= amt;
      if (accBalances.hasOwnProperty(toAcc)) accBalances[toAcc] += amt;

    } else if (type === 'International Transfer') {
      // KSA -> BD Remittance
      const senderAcc = t.from_account;
      const receiverAcc = t.to_account;

      // KSA Account loses amount + fee (in SAR)
      if (accBalances.hasOwnProperty(senderAcc)) accBalances[senderAcc] -= (amt + fee);
      if (KSA_ACCOUNTS.includes(senderAcc)) ksaExpense += (amt + fee);

      // BD Account gains converted_amount + incentive (in BDT)
      const totalBdtGained = convertedAmt + incentive;
      if (accBalances.hasOwnProperty(receiverAcc)) accBalances[receiverAcc] += totalBdtGained;

    } else if (type === 'Outward Expense') {
      // BD -> KSA Transfer
      const bdFromAcc = t.from_account;
      const ksaToAcc = t.to_account;

      // BD Account loses BDT amount
      if (accBalances.hasOwnProperty(bdFromAcc)) accBalances[bdFromAcc] -= amt;
      
      // KSA Account gains converted SAR amount
      if (accBalances.hasOwnProperty(ksaToAcc)) accBalances[ksaToAcc] += convertedAmt;
    }
  });

  // Calculate Saudi Totals
  const cashTotal = accBalances['Cash'];
  let saudiBankTotal = 0;
  KSA_ACCOUNTS.forEach(acc => { if(acc !== 'Cash') saudiBankTotal += accBalances[acc]; });
  const ksaGrandTotal = cashTotal + saudiBankTotal;

  // Calculate BD Totals
  let bdTotalWealthBDT = 0;
  BD_ACCOUNTS.forEach(acc => { bdTotalWealthBDT += accBalances[acc]; });
  const bdWealthSAR = bdTotalWealthBDT > 0 ? (bdTotalWealthBDT / 32.50) : 0;

  // Render KSA Hub Dashboard
  if (document.getElementById('total-balance')) document.getElementById('total-balance').innerText = `SAR ${ksaGrandTotal.toFixed(2)}`;
  if (document.getElementById('dash-cash-total')) document.getElementById('dash-cash-total').innerText = `SAR ${cashTotal.toFixed(2)}`;
  if (document.getElementById('dash-bank-total')) document.getElementById('dash-bank-total').innerText = `SAR ${saudiBankTotal.toFixed(2)}`;
  if (document.getElementById('total-income')) document.getElementById('total-income').innerText = `+SAR ${ksaIncome.toFixed(2)}`;
  if (document.getElementById('total-expense')) document.getElementById('total-expense').innerText = `-SAR ${ksaExpense.toFixed(2)}`;

  // Render KSA Bank Grid
  const bankGrid = document.getElementById('bank-accounts-grid');
  if (bankGrid) {
    bankGrid.innerHTML = KSA_ACCOUNTS.filter(b => b !== 'Cash').map(b => `
      <div class="p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl">
        <span class="text-[10px] text-slate-400 font-bold block">${b}</span>
        <span class="text-xs font-bold text-white">SAR ${accBalances[b].toFixed(2)}</span>
      </div>
    `).join('');
  }

  // Render BD Wealth Tab
  if (document.getElementById('total-bd-wealth')) document.getElementById('total-bd-wealth').innerText = `BDT ${bdTotalWealthBDT.toFixed(2)}`;
  if (document.getElementById('bd-wealth-sar-equivalent')) document.getElementById('bd-wealth-sar-equivalent').innerText = `≈ SAR ${bdWealthSAR.toFixed(2)}`;

  const bdBanksGrid = document.getElementById('bd-bank-accounts-grid');
  if (bdBanksGrid) {
    bdBanksGrid.innerHTML = BD_ACCOUNTS.map(b => `
      <div class="p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl">
        <span class="text-[10px] text-emerald-400 font-bold block">${b}</span>
        <span class="text-xs font-bold text-white">BDT ${accBalances[b].toFixed(2)}</span>
      </div>
    `).join('');
  }

  // Store globally for Live Balance Preview in Modal
  window.currentAccBalances = accBalances;
}

// LIVE BALANCE PREVIEW IN MODAL FOR ANY SELECTED ACCOUNT
window.updateModalBalancePreview = function() {
  const typeVal = document.getElementById('modal-trans-type').value;
  let selectedAcc = 'Cash';

  if (typeVal === 'Internal Transfer') {
    selectedAcc = document.getElementById('modal-transfer-from').value;
  } else if (typeVal === 'International Transfer') {
    selectedAcc = document.getElementById('remit-sender-acc').value;
  } else if (typeVal === 'Outward Expense') {
    selectedAcc = document.getElementById('outward-from-acc').value;
  } else {
    selectedAcc = document.getElementById('modal-trans-payment').value;
  }

  const bal = window.currentAccBalances ? (window.currentAccBalances[selectedAcc] || 0) : 0;
  const isBdAcc = BD_ACCOUNTS.includes(selectedAcc);
  const currCode = isBdAcc ? 'BDT' : 'SAR';

  // Update Currency Symbol Label next to Amount
  const currLabel = document.getElementById('modal-currency-label');
  if (currLabel) currLabel.innerText = currCode;

  const previewEl = document.getElementById('modal-selected-acc-bal');
  if (previewEl) {
    previewEl.innerText = `${currCode} ${bal.toFixed(2)}`;
    previewEl.className = bal >= 0 ? "font-bold text-emerald-400" : "font-bold text-rose-400";
  }
};

window.handleTypeChange = function(selectEl) {
  const typeVal = selectEl.value;
  const customContainer = document.getElementById('custom-type-container');
  const transferAccContainer = document.getElementById('transfer-acc-container');
  const standardAccContainer = document.getElementById('standard-acc-container');
  const remitContainer = document.getElementById('remit-fields-container');
  const outwardContainer = document.getElementById('outward-fields-container');
  const catContainer = document.getElementById('category-container');

  // Reset Visibility
  customContainer.classList.add('hidden');
  transferAccContainer.classList.add('hidden');
  standardAccContainer.classList.add('hidden');
  remitContainer.classList.add('hidden');
  outwardContainer.classList.add('hidden');
  catContainer.classList.remove('hidden');

  if (typeVal === 'CUSTOM') {
    customContainer.classList.remove('hidden');
    standardAccContainer.classList.remove('hidden');
  } else if (typeVal === 'Internal Transfer') {
    transferAccContainer.classList.remove('hidden');
    catContainer.classList.add('hidden');
    populateInternalTransferOptions();
  } else if (typeVal === 'International Transfer') {
    remitContainer.classList.remove('hidden');
    catContainer.classList.add('hidden');
  } else if (typeVal === 'Outward Expense') {
    outwardContainer.classList.remove('hidden');
    catContainer.classList.add('hidden');
  } else {
    standardAccContainer.classList.remove('hidden');
  }

  window.updateModalBalancePreview();
};

function populateInternalTransferOptions() {
  const fromSel = document.getElementById('modal-transfer-from');
  const toSel = document.getElementById('modal-transfer-to');
  const allAccs = [...KSA_ACCOUNTS, ...BD_ACCOUNTS];

  fromSel.innerHTML = allAccs.map(a => `<option value="${a}">${a}</option>`).join('');
  toSel.innerHTML = allAccs.map(a => `<option value="${a}">${a}</option>`).join('');
  toSel.value = 'Al Rajhi';
}

function renderTodayDashboardList(transactions) {
  const container = document.getElementById('dashboard-recent-list');
  if (!container) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const todayTrans = transactions.filter(t => t.created_at && t.created_at.split('T')[0] === todayStr);

  if (!todayTrans.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-3 text-center">No transactions recorded today.</p>`;
    return;
  }
  container.innerHTML = todayTrans.map(t => createItemHTML(t)).join('');
}

window.applyFiltersAndRender = function() {
  const container = document.getElementById('all-transactions-list');
  if (!container) return;

  let filtered = [...allTransactions];
  const searchQ = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  const fromDate = document.getElementById('filter-from-date')?.value;
  const toDate = document.getElementById('filter-to-date')?.value;

  if (searchQ) filtered = filtered.filter(t => (t.category && t.category.toLowerCase().includes(searchQ)) || (t.payment_method && t.payment_method.toLowerCase().includes(searchQ)) || (t.type && t.type.toLowerCase().includes(searchQ)));
  if (fromDate) filtered = filtered.filter(t => (t.created_at ? t.created_at.split('T')[0] : '') >= fromDate);
  if (toDate) filtered = filtered.filter(t => (t.created_at ? t.created_at.split('T')[0] : '') <= toDate);

  if (!filtered.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">No matching records found.</p>`;
    return;
  }
  container.innerHTML = filtered.map(t => createItemHTML(t)).join('');
};

function createItemHTML(t) {
  const type = t.type;
  const amt = parseFloat(t.amount) || 0;
  const isBd = BD_ACCOUNTS.includes(t.payment_method) || BD_ACCOUNTS.includes(t.to_account);
  const curr = isBd ? 'BDT' : 'SAR';
  
  let formattedTime = '';
  if (t.created_at) {
    const d = new Date(t.created_at);
    formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' • ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  let title = `${t.category || 'General'} (${t.payment_method || 'Cash'})`;
  let badgeColor = 'bg-rose-500/10 text-rose-400';
  let icon = 'fa-arrow-up';
  let sign = '-';

  if (type === 'Income') {
    badgeColor = 'bg-emerald-500/10 text-emerald-400';
    icon = 'fa-arrow-down';
    sign = '+';
  } else if (type === 'Internal Transfer') {
    title = `Transfer: ${t.from_account} ➔ ${t.to_account}`;
    badgeColor = 'bg-indigo-500/10 text-indigo-400';
    icon = 'fa-right-left';
    sign = '';
  } else if (type === 'International Transfer') {
    title = `Remittance: ${t.from_account} ➔ ${t.to_account}`;
    badgeColor = 'bg-emerald-500/10 text-emerald-400';
    icon = 'fa-paper-plane';
    sign = '';
  } else if (type === 'Outward Expense') {
    title = `Outward: ${t.from_account} ➔ ${t.to_account}`;
    badgeColor = 'bg-rose-500/10 text-rose-400';
    icon = 'fa-plane-arrival';
    sign = '';
  }

  return `
    <div class="flex items-center justify-between p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg ${badgeColor} flex items-center justify-center font-bold text-xs">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white">${title}</h4>
          <span class="text-[10px] text-slate-500">${formattedTime}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-white">
          ${sign}${curr} ${amt.toFixed(2)}
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
    container.innerHTML = `<p class="text-xs text-slate-500 py-2 text-center">No budget set.</p>`;
    return;
  }
  container.innerHTML = activeBudgets.map(cat => {
    const limit = categoryBudgets[cat];
    const spent = spentByCat[cat] || 0;
    const percent = Math.min(((spent / limit) * 100), 100).toFixed(1);
    return `
      <div class="space-y-1">
        <div class="flex justify-between text-xs">
          <span class="font-semibold text-white">${cat} Limit</span>
          <span class="text-slate-300">SAR ${spent.toFixed(2)} / ${limit.toFixed(2)}</span>
        </div>
        <div class="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
          <div class="h-full bg-indigo-500" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

function loadSavedBudgets() {
  const uId = currentUser ? currentUser.id : 'local_user';
  const saved = localStorage.getItem(`spendly_budgets_${uId}`);
  if (saved) categoryBudgets = JSON.parse(saved);
}

window.switchTab = function(tabName) {
  localStorage.setItem('spendly_active_tab', tabName);
  document.querySelectorAll('.tab-page').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(el => el.className = "nav-btn flex flex-col items-center gap-1 text-slate-400 font-semibold text-[10px]");
  
  const activeTab = document.getElementById(`tab-${tabName}`);
  if (activeTab) activeTab.classList.remove('hidden');

  const activeNav = document.getElementById(`nav-${tabName}`);
  if (activeNav) activeNav.className = "nav-btn flex flex-col items-center gap-1 text-indigo-400 font-semibold text-[10px]";
};

window.openTransactionModal = (presetType = null) => {
  document.getElementById('modal-trans-form').reset();
  document.getElementById('modal-trans-id').value = '';
  document.getElementById('modal-title-text').innerText = 'New Entry';
  
  const now = new Date();
  document.getElementById('modal-trans-date').value = now.toISOString().split('T')[0];
  document.getElementById('modal-trans-time').value = now.toTimeString().split(' ')[0].substring(0, 5);
  
  const typeSelect = document.getElementById('modal-trans-type');

  if (presetType === 'BD_LOCAL_EXPENSE') {
    typeSelect.value = 'Expense';
    document.getElementById('modal-trans-payment').value = 'IBBL';
  } else if (presetType === 'OUTWARD_EXPENSE') {
    typeSelect.value = 'Outward Expense';
  }

  window.handleTypeChange(typeSelect);
  document.getElementById('trans-modal').classList.remove('hidden');
};

window.closeTransactionModal = () => document.getElementById('trans-modal').classList.add('hidden');
window.openBudgetModal = () => document.getElementById('budget-modal').classList.remove('hidden');
window.closeBudgetModal = () => document.getElementById('budget-modal').classList.add('hidden');

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

    let paymentVal = document.getElementById('modal-trans-payment').value;
    let fromAcc = null;
    let toAcc = null;
    let fee = 0;
    let exchangeRate = 0;
    let convertedAmt = 0;
    let incentiveAmt = 0;

    if (typeVal === 'Internal Transfer') {
      fromAcc = document.getElementById('modal-transfer-from').value;
      toAcc = document.getElementById('modal-transfer-to').value;
      paymentVal = fromAcc;

    } else if (typeVal === 'International Transfer') {
      fromAcc = document.getElementById('remit-sender-acc').value;
      toAcc = document.getElementById('remit-receiver-acc').value;
      fee = parseFloat(document.getElementById('remit-fee').value) || 0;
      exchangeRate = parseFloat(document.getElementById('remit-exchange-rate').value) || 32.50;
      
      convertedAmt = amount * exchangeRate;
      const addIncentive = document.getElementById('remit-incentive-toggle').checked;
      if (addIncentive) incentiveAmt = convertedAmt * 0.025; // 2.5% incentive
      
      paymentVal = fromAcc;

    } else if (typeVal === 'Outward Expense') {
      fromAcc = document.getElementById('outward-from-acc').value;
      toAcc = document.getElementById('outward-to-acc').value;
      exchangeRate = parseFloat(document.getElementById('outward-exchange-rate').value) || 32.50;
      
      convertedAmt = exchangeRate > 0 ? (amount / exchangeRate) : 0;
      paymentVal = fromAcc;
    }

    const categoryVal = document.getElementById('modal-trans-category').value;
    const fullDateTime = new Date(`${dateVal}T${timeVal}:00`).toISOString();

    const payload = {
      user_id: currentUser ? currentUser.id : 'local_user',
      title: typeVal,
      amount,
      type: typeVal,
      category: categoryVal,
      payment_method: paymentVal,
      from_account: fromAcc,
      to_account: toAcc,
      remit_fee: fee,
      exchange_rate: exchangeRate,
      converted_amount: convertedAmt,
      incentive_amount: incentiveAmt,
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

  document.getElementById('budget-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const uId = currentUser ? currentUser.id : 'local_user';
    categoryBudgets.Food = parseFloat(document.getElementById('budget-food').value) || 0;
    categoryBudgets.Rent = parseFloat(document.getElementById('budget-rent').value) || 0;
    categoryBudgets.Shopping = parseFloat(document.getElementById('budget-shopping').value) || 0;
    
    localStorage.setItem(`spendly_budgets_${uId}`, JSON.stringify(categoryBudgets));
    window.closeBudgetModal();
    renderBudgets(allTransactions);
  });
}

window.deleteTransaction = async function(id) {
  if (!confirm("Delete this record?")) return;
  if (navigator.onLine && typeof dbClient !== 'undefined' && dbClient && currentUser && currentUser.id !== 'local_user') {
    try {
      await dbClient.from('transactions').delete().eq('id', id);
    } catch (e) {
      console.error(e);
    }
  }
  await loadTransactions();
};
