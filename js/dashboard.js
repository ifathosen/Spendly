let currentUser = null;
let allTransactions = [];
let chartInstance = null;
let categoryBudgets = { Food: 0, Rent: 0, Shopping: 0, Bills: 0, General: 0 };
let pendingDeleteId = null;
let activeBankForStatement = null;

const KSA_ACCOUNTS = ['Cash', 'Al Rajhi', 'SNB', 'Barq', 'Neo', 'Enjaz'];
const BD_ACCOUNTS = ['IBBL', 'MTB', 'Midland', 'BRAC', 'EBL', 'Pubali', 'bKash'];
const MONTHLY_LOAN_GOAL_BDT = 35000;

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

    const savedCustomRate = localStorage.getItem('spendly_bd_custom_rate');
    if (savedCustomRate && document.getElementById('bd-custom-rate-input')) {
      document.getElementById('bd-custom-rate-input').value = savedCustomRate;
    }

    loadSavedBudgets();
    await loadTransactions();

    const savedTab = localStorage.getItem('spendly_active_tab') || 'dashboard';
    window.switchTab(savedTab);
  } catch (err) {
    console.error("Init Error:", err);
  }
});

function isCurrentCalendarMonth(dateString) {
  if (!dateString) return false;
  const tDate = new Date(dateString);
  const now = new Date();
  return tDate.getFullYear() === now.getFullYear() && tDate.getMonth() === now.getMonth();
}

function isToday(dateString) {
  if (!dateString) return false;
  const tDate = new Date(dateString);
  const now = new Date();
  return tDate.getFullYear() === now.getFullYear() &&
         tDate.getMonth() === now.getMonth() &&
         tDate.getDate() === now.getDate();
}

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
  renderLoanGoalProgress(allTransactions);
  renderPendingReceivablesList(allTransactions);
  renderArbitrageAndDailyMetrics(allTransactions);
  updateMetricsAndAccounts(allTransactions);
}

// STRICT BALANCE & METRICS CALCULATION
function updateMetricsAndAccounts(transactions) {
  let ksaPureIncome = 0;
  let ksaPureExpense = 0;
  
  const accBalances = {
    'Cash': 0, 'Al Rajhi': 0, 'SNB': 0, 'Barq': 0, 'Neo': 0, 'Enjaz': 0,
    'IBBL': 0, 'MTB': 0, 'Midland': 0, 'BRAC': 0, 'EBL': 0, 'Pubali': 0, 'bKash': 0
  };

  transactions.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    const fee = parseFloat(t.remit_fee) || 0;
    const convertedAmt = parseFloat(t.converted_amount) || 0;
    const incentive = parseFloat(t.incentive_amount) || 0;
    const type = t.type;
    const dueStatus = t.due_status || 'INSTANT';

    if (type === 'Income') {
      const acc = t.payment_method || 'Cash';
      if (accBalances.hasOwnProperty(acc)) accBalances[acc] += amt;
      if (KSA_ACCOUNTS.includes(acc)) ksaPureIncome += amt;

    } else if (type === 'Expense' || type === 'Loan Payment') {
      const acc = t.payment_method || 'Cash';
      if (accBalances.hasOwnProperty(acc)) accBalances[acc] -= amt;
      if (KSA_ACCOUNTS.includes(acc)) ksaPureExpense += amt;

    } else if (type === 'Internal Transfer') {
      const fromAcc = t.from_account || t.payment_method;
      const toAcc = t.to_account;
      if (accBalances.hasOwnProperty(fromAcc)) accBalances[fromAcc] -= (amt + fee);
      if (accBalances.hasOwnProperty(toAcc)) accBalances[toAcc] += amt;
      if (KSA_ACCOUNTS.includes(fromAcc)) ksaPureExpense += fee;

    } else if (type === 'International Transfer') {
      const senderAcc = t.from_account;
      const receiverAcc = t.to_account;

      if (accBalances.hasOwnProperty(senderAcc)) accBalances[senderAcc] -= (amt + fee);
      if (KSA_ACCOUNTS.includes(senderAcc)) ksaPureExpense += fee;

      const totalBdtGained = convertedAmt + incentive;
      if (accBalances.hasOwnProperty(receiverAcc)) accBalances[receiverAcc] += totalBdtGained;

    } else if (type === 'Outward Expense') {
      const bdFromAcc = t.from_account;
      const ksaToAcc = t.to_account;

      if (accBalances.hasOwnProperty(bdFromAcc)) accBalances[bdFromAcc] -= (amt + fee);

      if (dueStatus !== 'DUE') {
        if (accBalances.hasOwnProperty(ksaToAcc)) accBalances[ksaToAcc] += convertedAmt;
      }
    }
  });

  const cashTotal = accBalances['Cash'];
  let saudiBankTotal = 0;
  KSA_ACCOUNTS.forEach(acc => { if(acc !== 'Cash') saudiBankTotal += accBalances[acc]; });
  const ksaGrandTotal = cashTotal + saudiBankTotal;

  let bdTotalWealthBDT = 0;
  BD_ACCOUNTS.forEach(acc => { bdTotalWealthBDT += accBalances[acc]; });

  window.currentAccBalances = accBalances;
  window.bdTotalWealthBDT = bdTotalWealthBDT;

  if (document.getElementById('total-balance')) document.getElementById('total-balance').innerText = `SAR ${ksaGrandTotal.toFixed(2)}`;
  if (document.getElementById('dash-cash-total')) document.getElementById('dash-cash-total').innerText = `SAR ${cashTotal.toFixed(2)}`;
  if (document.getElementById('dash-bank-total')) document.getElementById('dash-bank-total').innerText = `SAR ${saudiBankTotal.toFixed(2)}`;
  if (document.getElementById('total-income')) document.getElementById('total-income').innerText = `+SAR ${ksaPureIncome.toFixed(2)}`;
  if (document.getElementById('total-expense')) document.getElementById('total-expense').innerText = `-SAR ${ksaPureExpense.toFixed(2)}`;

  const bankGrid = document.getElementById('bank-accounts-grid');
  if (bankGrid) {
    bankGrid.innerHTML = KSA_ACCOUNTS.filter(b => b !== 'Cash').map(b => `
      <div onclick="openBankStatementModal('${b}')" class="p-2.5 bg-slate-950/60 border border-slate-800 hover:border-indigo-500 rounded-xl cursor-pointer transition">
        <div class="flex justify-between items-center">
          <span class="text-[10px] text-slate-400 font-bold block">${b}</span>
          <i class="fa-solid fa-list-ul text-[9px] text-indigo-400"></i>
        </div>
        <span class="text-xs font-bold text-white">SAR ${accBalances[b].toFixed(2)}</span>
      </div>
    `).join('');
  }

  if (document.getElementById('total-bd-wealth')) document.getElementById('total-bd-wealth').innerText = `BDT ${bdTotalWealthBDT.toFixed(2)}`;
  updateBdWealthSarEquivalent();

  const bdBanksGrid = document.getElementById('bd-bank-accounts-grid');
  if (bdBanksGrid) {
    bdBanksGrid.innerHTML = BD_ACCOUNTS.map(b => `
      <div onclick="openBankStatementModal('${b}')" class="p-2.5 bg-slate-950/60 border border-slate-800 hover:border-emerald-500 rounded-xl cursor-pointer transition">
        <div class="flex justify-between items-center">
          <span class="text-[10px] text-emerald-400 font-bold block">${b}</span>
          <i class="fa-solid fa-list-ul text-[9px] text-emerald-400"></i>
        </div>
        <span class="text-xs font-bold text-white">BDT ${accBalances[b].toFixed(2)}</span>
      </div>
    `).join('');
  }
}

// BANK STATEMENT POPUP MODAL
window.openBankStatementModal = function(bankName) {
  activeBankForStatement = bankName;
  document.getElementById('stmt-modal-bank-name').innerText = `${bankName} Statement`;
  
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  document.getElementById('stmt-from-date').value = firstDay;
  document.getElementById('stmt-to-date').value = today;

  window.renderBankStatementDetails();
  document.getElementById('bank-statement-modal').classList.remove('hidden');
};

window.closeBankStatementModal = function() {
  document.getElementById('bank-statement-modal').classList.add('hidden');
};

window.renderBankStatementDetails = function() {
  if (!activeBankForStatement) return;

  const fromDate = document.getElementById('stmt-from-date').value;
  const toDate = document.getElementById('stmt-to-date').value;

  const isBdBank = BD_ACCOUNTS.includes(activeBankForStatement);
  const curr = isBdBank ? 'BDT' : 'SAR';

  let bankTrans = allTransactions.filter(t => 
    t.payment_method === activeBankForStatement || 
    t.from_account === activeBankForStatement || 
    t.to_account === activeBankForStatement
  );

  if (fromDate) bankTrans = bankTrans.filter(t => (t.created_at ? t.created_at.split('T')[0] : '') >= fromDate);
  if (toDate) bankTrans = bankTrans.filter(t => (t.created_at ? t.created_at.split('T')[0] : '') <= toDate);

  let totalIn = 0;
  let totalOut = 0;

  const listContainer = document.getElementById('stmt-modal-list');

  if (!bankTrans.length) {
    listContainer.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">নির্ধারিত সময়ে কোনো তথ্য নেই।</p>`;
    document.getElementById('stmt-total-in').innerText = `${curr} 0.00`;
    document.getElementById('stmt-total-out').innerText = `${curr} 0.00`;
    return;
  }

  const itemsHtml = bankTrans.map(t => {
    const amt = parseFloat(t.amount) || 0;
    const fee = parseFloat(t.remit_fee) || 0;
    const converted = parseFloat(t.converted_amount) || 0;
    const incentive = parseFloat(t.incentive_amount) || 0;
    let isIn = false;
    let effectAmt = amt;

    if (t.type === 'Income' && t.payment_method === activeBankForStatement) {
      isIn = true;
    } else if (t.type === 'Internal Transfer' && t.to_account === activeBankForStatement) {
      isIn = true;
    } else if (t.type === 'International Transfer' && t.to_account === activeBankForStatement) {
      isIn = true;
      effectAmt = converted + incentive;
    } else if (t.type === 'Outward Expense' && t.to_account === activeBankForStatement) {
      isIn = true;
      effectAmt = converted;
    } else {
      isIn = false;
      if (t.type === 'Internal Transfer' && t.from_account === activeBankForStatement) effectAmt = amt + fee;
      if (t.type === 'International Transfer' && t.from_account === activeBankForStatement) effectAmt = amt + fee;
      if (t.type === 'Outward Expense' && t.from_account === activeBankForStatement) effectAmt = amt + fee;
    }

    if (isIn) totalIn += effectAmt;
    else totalOut += effectAmt;

    const dateStr = t.created_at ? new Date(t.created_at).toLocaleDateString() : '';

    return `
      <div class="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
        <div>
          <span class="font-bold text-white block">${t.type} (${t.category || 'General'})</span>
          <span class="text-[10px] text-slate-400">${dateStr}</span>
        </div>
        <span class="font-black ${isIn ? 'text-emerald-400' : 'text-rose-400'}">
          ${isIn ? '+' : '-'}${curr} ${effectAmt.toFixed(2)}
        </span>
      </div>
    `;
  }).join('');

  document.getElementById('stmt-total-in').innerText = `${curr} ${totalIn.toFixed(2)}`;
  document.getElementById('stmt-total-out').innerText = `${curr} ${totalOut.toFixed(2)}`;
  listContainer.innerHTML = itemsHtml;
};

// RENDER ARBITRAGE & DAILY METRICS IN ANALYTICS TAB
function renderArbitrageAndDailyMetrics(transactions) {
  let totalSarSent = 0;
  let totalBdtReceivedFromRemittance = 0;
  
  let totalBdtSpentForOutward = 0;
  let totalSarReturnedToKsa = 0;

  let todayIncomeSAR = 0;
  let todayIncomeBDT = 0;
  
  let todayExpenseSAR = 0;
  let todayExpenseBDT = 0;

  const currentRate = parseFloat(document.getElementById('bd-custom-rate-input')?.value) || parseFloat(localStorage.getItem('spendly_bd_custom_rate')) || 32.6868;

  transactions.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    const fee = parseFloat(t.remit_fee) || 0;
    const converted = parseFloat(t.converted_amount) || 0;
    const incentive = parseFloat(t.incentive_amount) || 0;
    const acc = t.from_account || t.payment_method || 'Cash';

    if (t.type === 'International Transfer') {
      totalSarSent += amt;
      totalBdtReceivedFromRemittance += (converted + incentive);
    } else if (t.type === 'Outward Expense') {
      totalBdtSpentForOutward += amt;
      totalSarReturnedToKsa += converted;
    }

    if (isToday(t.created_at)) {
      if (t.type === 'Income') {
        if (KSA_ACCOUNTS.includes(acc)) {
          todayIncomeSAR += amt;
        } else if (BD_ACCOUNTS.includes(acc)) {
          todayIncomeBDT += amt;
        }
      } else if (t.type === 'Expense' || t.type === 'Loan Payment') {
        if (KSA_ACCOUNTS.includes(acc)) {
          todayExpenseSAR += amt;
        } else if (BD_ACCOUNTS.includes(acc)) {
          todayExpenseBDT += amt;
        }
      }

      if (fee > 0) {
        if (KSA_ACCOUNTS.includes(acc)) {
          todayExpenseSAR += fee;
        } else if (BD_ACCOUNTS.includes(acc)) {
          todayExpenseBDT += fee;
        }
      }
    }
  });

  const netProfitBDT = totalBdtReceivedFromRemittance - totalBdtSpentForOutward;
  const netProfitSAR = currentRate > 0 ? (netProfitBDT / currentRate) : 0;

  if (document.getElementById('arbitrage-sent-sar')) document.getElementById('arbitrage-sent-sar').innerText = `SAR ${totalSarSent.toFixed(2)}`;
  if (document.getElementById('arbitrage-rec-bdt')) document.getElementById('arbitrage-rec-bdt').innerText = `(BDT ${totalBdtReceivedFromRemittance.toFixed(2)})`;
  if (document.getElementById('arbitrage-returned-sar')) document.getElementById('arbitrage-returned-sar').innerText = `SAR ${totalSarReturnedToKsa.toFixed(2)}`;
  if (document.getElementById('arbitrage-spent-bdt')) document.getElementById('arbitrage-spent-bdt').innerText = `(BDT ${totalBdtSpentForOutward.toFixed(2)})`;

  if (document.getElementById('arbitrage-profit-bdt')) document.getElementById('arbitrage-profit-bdt').innerText = `BDT ${netProfitBDT.toFixed(2)}`;
  if (document.getElementById('arbitrage-profit-sar')) document.getElementById('arbitrage-profit-sar').innerText = `SAR ${netProfitSAR.toFixed(2)}`;

  if (document.getElementById('daily-pure-income-sar-text')) document.getElementById('daily-pure-income-sar-text').innerText = `SAR ${todayIncomeSAR.toFixed(2)}`;
  if (document.getElementById('daily-pure-income-bdt-text')) document.getElementById('daily-pure-income-bdt-text').innerText = `BDT ${todayIncomeBDT.toFixed(2)}`;
  
  const totalIncomeEquivalentSAR = todayIncomeSAR + (currentRate > 0 ? (todayIncomeBDT / currentRate) : 0);
  if (document.getElementById('daily-pure-income-equiv-text')) document.getElementById('daily-pure-income-equiv-text').innerText = `Equiv: SAR ${totalIncomeEquivalentSAR.toFixed(2)}`;

  if (document.getElementById('daily-pure-expense-sar-text')) document.getElementById('daily-pure-expense-sar-text').innerText = `SAR ${todayExpenseSAR.toFixed(2)}`;
  if (document.getElementById('daily-pure-expense-bdt-text')) document.getElementById('daily-pure-expense-bdt-text').innerText = `BDT ${todayExpenseBDT.toFixed(2)}`;

  const totalExpenseEquivalentSAR = todayExpenseSAR + (currentRate > 0 ? (todayExpenseBDT / currentRate) : 0);
  if (document.getElementById('daily-pure-expense-equiv-text')) document.getElementById('daily-pure-expense-equiv-text').innerText = `Equiv: SAR ${totalExpenseEquivalentSAR.toFixed(2)}`;
}

// BREAKDOWN MODALS
window.openIncomeBreakdownModal = function() {
  const todayIncomes = allTransactions.filter(t => isToday(t.created_at) && t.type === 'Income');
  
  document.getElementById('breakdown-modal-title').innerText = "আজকের ইনকাম ব্রেকডাউন";
  document.getElementById('breakdown-modal-subtitle').innerText = `আলাদা কারেন্সিতে প্রাপ্ত ইনকাম তালিকা`;

  const container = document.getElementById('breakdown-modal-list');
  if (!todayIncomes.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">আজকে কোনো ইনকাম এন্ট্রি করা হয়নি।</p>`;
  } else {
    container.innerHTML = todayIncomes.map(t => {
      const acc = t.payment_method || 'Cash';
      const isBdAcc = BD_ACCOUNTS.includes(acc);
      const curr = isBdAcc ? 'BDT' : 'SAR';
      const flag = isBdAcc ? '🇧🇩' : '🇸🇦';
      const amt = parseFloat(t.amount) || 0;

      return `
        <div class="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
          <div>
            <span class="font-bold text-white block">${t.category || 'General'} (${acc})</span>
            <span class="text-[10px] text-slate-400">${new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <span class="font-black text-emerald-400">+${flag} ${curr} ${amt.toFixed(2)}</span>
        </div>
      `;
    }).join('');
  }

  document.getElementById('breakdown-detail-modal').classList.remove('hidden');
};

window.openExpenseBreakdownModal = function() {
  const todayExpenses = allTransactions.filter(t => isToday(t.created_at) && (t.type === 'Expense' || t.type === 'Loan Payment' || (t.remit_fee && parseFloat(t.remit_fee) > 0)));

  document.getElementById('breakdown-modal-title').innerText = "আজকের খরচ ব্রেকডাউন";
  document.getElementById('breakdown-modal-subtitle').innerText = `আলাদা কারেন্সিতে আসল খরচের তালিকা`;

  const container = document.getElementById('breakdown-modal-list');
  if (!todayExpenses.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">আজকে কোনো খরচের এন্ট্রি নেই।</p>`;
  } else {
    container.innerHTML = todayExpenses.map(t => {
      const amt = parseFloat(t.amount) || 0;
      const fee = parseFloat(t.remit_fee) || 0;
      const acc = t.from_account || t.payment_method || 'Cash';
      const isBdAcc = BD_ACCOUNTS.includes(acc);
      const curr = isBdAcc ? 'BDT' : 'SAR';
      const flag = isBdAcc ? '🇧🇩' : '🇸🇦';

      let title = `${t.category || 'Expense'} (${acc})`;
      let valText = `${flag} ${curr} ${amt.toFixed(2)}`;

      if (t.type === 'Loan Payment') title = `Loan Paid: (${acc})`;
      if (t.type === 'International Transfer' || t.type === 'Internal Transfer' || t.type === 'Outward Expense') {
        title = `${t.type} Fee (${acc})`;
        valText = `${flag} ${curr} ${fee.toFixed(2)} (Fee)`;
      }

      return `
        <div class="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
          <div>
            <span class="font-bold text-white block">${title}</span>
            <span class="text-[10px] text-slate-400">${new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <span class="font-black text-rose-400">-${valText}</span>
        </div>
      `;
    }).join('');
  }

  document.getElementById('breakdown-detail-modal').classList.remove('hidden');
};

window.openArbitrageBreakdownModal = function() {
  const remitTrans = allTransactions.filter(t => t.type === 'International Transfer' || t.type === 'Outward Expense');

  document.getElementById('breakdown-modal-title').innerText = "ট্রেডিং প্রফিট ব্রেকডাউন";
  document.getElementById('breakdown-modal-subtitle').innerText = `Net Trading Gain: BDT ${(document.getElementById('arbitrage-profit-bdt')?.innerText || '0.00')} (${(document.getElementById('arbitrage-profit-sar')?.innerText || 'SAR 0.00')})`;

  const container = document.getElementById('breakdown-modal-list');
  if (!remitTrans.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">কোনো রেমিট্যান্স বা আউটওয়ার্ড লেনদেন পাওয়া যায়নি।</p>`;
  } else {
    container.innerHTML = remitTrans.map(t => {
      const isRemit = t.type === 'International Transfer';
      const sarAmt = parseFloat(t.amount) || 0;
      const converted = parseFloat(t.converted_amount) || 0;
      const incentive = parseFloat(t.incentive_amount) || 0;
      const dateStr = t.created_at ? new Date(t.created_at).toLocaleDateString() : '';
      const ref = t.ref_no ? ` [Ref: ${t.ref_no}]` : '';

      if (isRemit) {
        const totalBdtGained = converted + incentive;
        return `
          <div class="p-2.5 bg-slate-950 border border-emerald-500/30 rounded-xl text-xs space-y-1">
            <div class="flex justify-between items-center">
              <span class="font-bold text-emerald-400"><i class="fa-solid fa-paper-plane mr-1"></i> Remittance Sent${ref}</span>
              <span class="text-[10px] text-slate-400">${dateStr}</span>
            </div>
            <div class="flex justify-between items-center text-[11px] text-slate-300">
              <span>SAR ${sarAmt.toFixed(2)} @ Rate: ${(parseFloat(t.exchange_rate)||0).toFixed(4)}</span>
              <span class="font-bold text-white">+BDT ${totalBdtGained.toFixed(2)}</span>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="p-2.5 bg-slate-950 border border-rose-500/30 rounded-xl text-xs space-y-1">
            <div class="flex justify-between items-center">
              <span class="font-bold text-rose-400"><i class="fa-solid fa-plane-arrival mr-1"></i> Outward Return${ref}</span>
              <span class="text-[10px] text-slate-400">${dateStr}</span>
            </div>
            <div class="flex justify-between items-center text-[11px] text-slate-300">
              <span>SAR ${converted.toFixed(2)} Back</span>
              <span class="font-bold text-white">-BDT ${sarAmt.toFixed(2)}</span>
            </div>
          </div>
        `;
      }
    }).join('');
  }

  document.getElementById('breakdown-detail-modal').classList.remove('hidden');
};

window.closeBreakdownModal = function() {
  document.getElementById('breakdown-detail-modal').classList.add('hidden');
};

// RECEIVABLES & PAYABLES LIST
function renderPendingReceivablesList(transactions) {
  const container = document.getElementById('debts-list-container');
  const sarTextEl = document.getElementById('total-pending-sar-text');
  const bdtTextEl = document.getElementById('total-pending-bdt-text');

  const pendingOutward = transactions.filter(t => t.type === 'Outward Expense' && t.due_status === 'DUE');

  let totalPendingSAR = 0;
  let totalPendingBDT = 0;

  pendingOutward.forEach(t => {
    totalPendingSAR += parseFloat(t.converted_amount) || 0;
    totalPendingBDT += parseFloat(t.amount) || 0;
  });

  if (sarTextEl) sarTextEl.innerText = `SAR ${totalPendingSAR.toFixed(2)}`;
  if (bdtTextEl) bdtTextEl.innerText = `BDT ${totalPendingBDT.toFixed(2)}`;

  if (!container) return;

  if (!pendingOutward.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-2 text-center">No pending credit or receivables.</p>`;
    return;
  }

  container.innerHTML = pendingOutward.map(t => {
    const friendName = t.debtor_name || 'Friend';
    const bdtAmt = parseFloat(t.amount) || 0;
    const sarAmt = parseFloat(t.converted_amount) || 0;

    return `
      <div class="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-bold text-white flex items-center gap-1.5 cursor-pointer hover:underline" onclick="openDebtorDetailModal('${t.id}')">
              <span class="text-indigo-300 font-black">${friendName}</span>
              <i class="fa-solid fa-circle-info text-[10px] text-indigo-400"></i>
              <span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold">বাকি</span>
            </div>
            <span class="text-[10px] text-slate-400 block mt-0.5">মূল ধার: BDT ${bdtAmt.toFixed(2)}</span>
          </div>
          <span class="font-bold text-emerald-400 text-sm">SAR ${sarAmt.toFixed(2)}</span>
        </div>

        <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-900">
          <button onclick="openDebtorHistoryModal('${friendName}')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-lg text-[10px] font-bold border border-indigo-500/30 flex items-center gap-1">
            <i class="fa-solid fa-clock-rotate-left"></i> History
          </button>
          <button onclick="openCollectModal('${t.id}', '${sarAmt}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold shadow">
            Collect SAR
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.openDebtorDetailModal = function(transId) {
  const t = allTransactions.find(item => item.id == transId);
  if (!t) return;

  const bdtAmt = parseFloat(t.amount) || 0;
  const sarAmt = parseFloat(t.converted_amount) || 0;
  const rate = parseFloat(t.exchange_rate) || 0;
  const formattedDate = t.created_at ? new Date(t.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A';

  document.getElementById('debtor-modal-name').innerText = t.debtor_name || 'Friend';
  document.getElementById('debtor-modal-phone').innerText = t.debtor_phone || 'নম্বর দেওয়া নেই';
  document.getElementById('debtor-modal-bdt').innerText = `BDT ${bdtAmt.toFixed(2)}`;
  document.getElementById('debtor-modal-sar').innerText = `SAR ${sarAmt.toFixed(2)}`;
  document.getElementById('debtor-modal-rate').innerText = `${rate.toFixed(4)}`;
  document.getElementById('debtor-modal-date').innerText = formattedDate;

  const collectBtn = document.getElementById('debtor-modal-collect-btn');
  collectBtn.onclick = () => {
    closeDebtorDetailModal();
    openCollectModal(t.id, sarAmt);
  };

  document.getElementById('debtor-detail-modal').classList.remove('hidden');
};

window.closeDebtorDetailModal = function() {
  document.getElementById('debtor-detail-modal').classList.add('hidden');
};

// PARTIAL COLLECT & HISTORY MODAL LOGIC
window.openCollectModal = function(transId, pendingSar) {
  const t = allTransactions.find(item => item.id == transId);
  if (!t) return;

  const pendingAmount = parseFloat(pendingSar) || parseFloat(t.converted_amount) || 0;

  document.getElementById('collect-trans-id').value = transId;
  document.getElementById('collect-total-pending-sar').value = pendingAmount;
  document.getElementById('collect-amount-input').value = pendingAmount.toFixed(2);

  document.getElementById('collect-total-pending-text').innerText = `SAR ${pendingAmount.toFixed(2)}`;
  document.getElementById('collect-modal-subtitle').innerText = `${t.debtor_name || 'পাওনাদার'} এর নিকট থেকে রিয়াল গ্রহণ:`;

  window.updateCollectRemainingPreview();
  document.getElementById('collect-modal').classList.remove('hidden');
};

window.closeCollectModal = function() {
  document.getElementById('collect-modal').classList.add('hidden');
};

window.updateCollectRemainingPreview = function() {
  const totalPending = parseFloat(document.getElementById('collect-total-pending-sar').value) || 0;
  const inputCollect = parseFloat(document.getElementById('collect-amount-input').value) || 0;
  const remaining = Math.max(0, totalPending - inputCollect);

  const previewEl = document.getElementById('collect-remaining-preview-text');
  if (previewEl) {
    previewEl.innerText = `SAR ${remaining.toFixed(2)}`;
    previewEl.className = remaining > 0 ? "font-bold text-amber-400" : "font-bold text-emerald-400";
  }
};

window.openDebtorHistoryModal = function(debtorName) {
  if (!debtorName) return;
  
  const historyTrans = allTransactions.filter(t => 
    t.debtor_name && t.debtor_name.toLowerCase() === debtorName.toLowerCase()
  ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  document.getElementById('debtor-history-name').innerText = `${debtorName} - লেনদেন ইতিহাস`;
  const listContainer = document.getElementById('debtor-history-list');

  if (!listContainer) return;

  if (!historyTrans.length) {
    listContainer.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">কোনো লেনদেনের ইতিহাস পাওয়া যায়নি।</p>`;
  } else {
    listContainer.innerHTML = historyTrans.map(t => {
      const isCollection = t.due_status === 'COLLECTED';
      const amtSar = parseFloat(t.converted_amount) || 0;
      const amtBdt = parseFloat(t.amount) || 0;
      const dateStr = t.created_at ? new Date(t.created_at).toLocaleString('bn-BD', { dateStyle: 'medium', timeStyle: 'short' }) : 'তারিখ নেই';

      if (isCollection) {
        return `
          <div class="p-2.5 bg-slate-950 border border-emerald-500/40 rounded-xl text-xs space-y-1">
            <div class="flex justify-between items-center font-bold text-emerald-400">
              <span><i class="fa-solid fa-circle-check mr-1"></i> টাকা আদায় (Collected)</span>
              <span class="text-white">+SAR ${amtSar.toFixed(2)}</span>
            </div>
            <div class="flex justify-between items-center text-[10px] text-slate-400">
              <span>জমা ব্যাংক: ${t.to_account || 'Cash'}</span>
              <span>${dateStr}</span>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="p-2.5 bg-slate-950 border border-amber-500/40 rounded-xl text-xs space-y-1">
            <div class="flex justify-between items-center font-bold text-amber-400">
              <span><i class="fa-solid fa-hand-holding-dollar mr-1"></i> ধার প্রদান (Outward Given)</span>
              <span class="text-rose-400">-BDT ${amtBdt.toFixed(2)} (SAR ${amtSar.toFixed(2)})</span>
            </div>
            <div class="flex justify-between items-center text-[10px] text-slate-400">
              <span>উৎস: ${t.from_account || 'IBBL'}</span>
              <span>${dateStr}</span>
            </div>
          </div>
        `;
      }
    }).join('');
  }

  document.getElementById('debtor-history-modal').classList.remove('hidden');
};

window.closeDebtorHistoryModal = function() {
  document.getElementById('debtor-history-modal').classList.add('hidden');
};

// AUTO REF NO LOGIC
function generateRemitRefNo() {
  const remitCount = allTransactions.filter(t => t.type === 'International Transfer').length;
  return `REM-${1001 + remitCount}`;
}

function populateActiveRemitRefDropdown() {
  const refSelect = document.getElementById('outward-remit-ref-select');
  if (!refSelect) return;

  const remitTrans = allTransactions.filter(t => t.type === 'International Transfer');
  const activeBatches = [];

  remitTrans.forEach(rt => {
    const refNo = rt.ref_no || `REM-${rt.id}`;
    const sentSar = parseFloat(rt.amount) || 0;

    const returnedTrans = allTransactions.filter(t => t.type === 'Outward Expense' && t.ref_no === refNo);
    let totalReturnedSar = 0;
    returnedTrans.forEach(ret => {
      totalReturnedSar += parseFloat(ret.converted_amount) || 0;
    });

    const availSar = sentSar - totalReturnedSar;
    if (availSar > 0.01) {
      activeBatches.push({ refNo, availSar, rate: rt.exchange_rate });
    }
  });

  if (!activeBatches.length) {
    refSelect.innerHTML = `<option value="">❌ কোনো অ্যাক্টিভ রেফারেন্স নেই</option>`;
  } else {
    refSelect.innerHTML = `<option value="">-- রেফারেন্স নির্বাচন করুন --</option>` + 
      activeBatches.map(b => `<option value="${b.refNo}" data-avail="${b.availSar}">#${b.refNo} (অবশিষ্ট: ${b.availSar.toFixed(2)} SAR)</option>`).join('');
  }
}

window.onSelectRemitRefForReturn = function(refNo) {
  const refSelect = document.getElementById('outward-remit-ref-select');
  const selectedOption = refSelect.options[refSelect.selectedIndex];
  const availSar = parseFloat(selectedOption?.getAttribute('data-avail')) || 0;

  if (availSar > 0) {
    console.log(`Selected Ref: ${refNo}, Available SAR: ${availSar}`);
  }
};

// MIDLAND BANK LOAN GOAL PROGRESS TRACKER
function renderLoanGoalProgress(transactions) {
  const now = new Date();
  let totalMidlandCreditsBDT = 0;

  transactions.forEach(t => {
    if (!t.created_at) return;
    const tDate = new Date(t.created_at);
    if (tDate.getFullYear() !== now.getFullYear() || tDate.getMonth() !== now.getMonth()) return;

    const amt = parseFloat(t.amount) || 0;
    const converted = parseFloat(t.converted_amount) || 0;
    const incentive = parseFloat(t.incentive_amount) || 0;

    if (t.type === 'Income' && t.payment_method === 'Midland') {
      totalMidlandCreditsBDT += amt;
    } else if (t.type === 'Internal Transfer' && t.to_account === 'Midland') {
      totalMidlandCreditsBDT += amt;
    } else if (t.type === 'International Transfer' && t.to_account === 'Midland') {
      totalMidlandCreditsBDT += (converted + incentive);
    }
  });

  const percent = Math.min(((totalMidlandCreditsBDT / MONTHLY_LOAN_GOAL_BDT) * 100), 100).toFixed(1);

  const paidEl = document.getElementById('loan-paid-amount');
  const barEl = document.getElementById('loan-goal-progress-bar');
  const statusEl = document.getElementById('loan-goal-status-text');

  if (paidEl) paidEl.innerText = `BDT ${totalMidlandCreditsBDT.toFixed(2)}`;
  if (barEl) barEl.style.width = `${percent}%`;
  if (statusEl) statusEl.innerText = `${percent}% Saved in Midland Bank this month`;
}

window.updateBdWealthSarEquivalent = function() {
  const customRateInput = document.getElementById('bd-custom-rate-input');
  const displayEl = document.getElementById('bd-wealth-sar-equivalent');
  if (!customRateInput || !displayEl) return;

  const rate = parseFloat(customRateInput.value) || 0;
  localStorage.setItem('spendly_bd_custom_rate', rate);

  if (rate > 0 && window.bdTotalWealthBDT) {
    const sarEquivalent = window.bdTotalWealthBDT / rate;
    displayEl.innerText = `SAR ${sarEquivalent.toFixed(2)}`;
  } else {
    displayEl.innerText = `SAR 0.00`;
  }
  
  renderArbitrageAndDailyMetrics(allTransactions);
};

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
    document.getElementById('remit-ref-no').value = generateRemitRefNo();
  } else if (typeVal === 'Outward Expense') {
    outwardContainer.classList.remove('hidden');
    catContainer.classList.add('hidden');
    populateActiveRemitRefDropdown();
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

  const todayTrans = transactions.filter(t => isToday(t.created_at));

  if (!todayTrans.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-3 text-center">No transactions recorded today.</p>`;
    return;
  }
  container.innerHTML = todayTrans.map(t => createItemHTML(t)).join('');
}

function getFilteredTransactions() {
  let filtered = [...allTransactions];
  const searchQ = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  const selectedAccount = document.getElementById('account-filter')?.value || 'ALL_ACCOUNTS';
  const sortBy = document.getElementById('sort-by-select')?.value || 'newest';
  const fromDate = document.getElementById('filter-from-date')?.value;
  const toDate = document.getElementById('filter-to-date')?.value;

  if (searchQ) {
    filtered = filtered.filter(t => 
      (t.category && t.category.toLowerCase().includes(searchQ)) || 
      (t.payment_method && t.payment_method.toLowerCase().includes(searchQ)) || 
      (t.type && t.type.toLowerCase().includes(searchQ)) ||
      (t.debtor_name && t.debtor_name.toLowerCase().includes(searchQ)) ||
      (t.ref_no && t.ref_no.toLowerCase().includes(searchQ))
    );
  }

  if (selectedAccount !== 'ALL_ACCOUNTS') {
    filtered = filtered.filter(t => 
      t.payment_method === selectedAccount || 
      t.from_account === selectedAccount || 
      t.to_account === selectedAccount
    );
  }

  if (fromDate) filtered = filtered.filter(t => (t.created_at ? t.created_at.split('T')[0] : '') >= fromDate);
  if (toDate) filtered = filtered.filter(t => (t.created_at ? t.created_at.split('T')[0] : '') <= toDate);

  if (sortBy === 'newest') filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  else if (sortBy === 'oldest') filtered.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  else if (sortBy === 'highest') filtered.sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0));

  return filtered;
}

window.applyFiltersAndRender = function() {
  const container = document.getElementById('all-transactions-list');
  if (!container) return;

  const filtered = getFilteredTransactions();

  if (!filtered.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">No matching records found.</p>`;
    return;
  }
  container.innerHTML = filtered.map(t => createItemHTML(t)).join('');
};

window.downloadPDFReport = function() {
  const fromDate = document.getElementById('filter-from-date')?.value || 'All';
  const toDate = document.getElementById('filter-to-date')?.value || 'All';
  const accFilter = document.getElementById('account-filter')?.value || 'All Accounts';

  const filtered = getFilteredTransactions();

  if (!filtered.length) {
    alert("No transactions available for export.");
    return;
  }

  let rowsHtml = filtered.map((t, idx) => {
    const isBd = BD_ACCOUNTS.includes(t.payment_method) || BD_ACCOUNTS.includes(t.to_account) || BD_ACCOUNTS.includes(t.from_account);
    const curr = isBd ? 'BDT' : 'SAR';
    const amt = parseFloat(t.amount) || 0;
    const fee = parseFloat(t.remit_fee) || 0;
    const d = t.created_at ? new Date(t.created_at).toLocaleDateString() : '';

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px;">
        <td style="padding: 6px;">${idx + 1}</td>
        <td style="padding: 6px;">${d}</td>
        <td style="padding: 6px;">${t.type} ${t.ref_no ? `(${t.ref_no})` : ''}</td>
        <td style="padding: 6px;">${t.from_account || t.payment_method || '-'} ➔ ${t.to_account || '-'}</td>
        <td style="padding: 6px; text-align: right; font-weight: bold;">${curr} ${amt.toFixed(2)}</td>
        <td style="padding: 6px; text-align: right;">${fee.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const reportElement = document.createElement('div');
  reportElement.style.padding = '15px';
  reportElement.style.fontFamily = 'sans-serif';
  reportElement.style.color = '#0f172a';
  reportElement.style.backgroundColor = '#ffffff';

  reportElement.innerHTML = `
    <div style="text-align: center; margin-bottom: 15px; border-bottom: 2px solid #6366f1; padding-bottom: 10px;">
      <h2 style="margin: 0; color: #4f46e5; font-size: 18px; font-weight: 800;">SPENDLY PRO - FINANCIAL REPORT</h2>
      <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">Period: ${fromDate} to ${toDate} | Filter Account: ${accFilter}</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
      <thead>
        <tr style="background-color: #f1f5f9; font-size: 10px; text-align: left; border-bottom: 2px solid #cbd5e1;">
          <th style="padding: 6px;">#</th>
          <th style="padding: 6px;">Date</th>
          <th style="padding: 6px;">Type</th>
          <th style="padding: 6px;">Accounts</th>
          <th style="padding: 6px; text-align: right;">Amount</th>
          <th style="padding: 6px; text-align: right;">Fee</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;

  const opt = {
    margin:       8,
    filename:     `Spendly_Report_${fromDate}_to_${toDate}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(reportElement).save();
};

function createItemHTML(t) {
  const type = t.type;
  const amt = parseFloat(t.amount) || 0;
  const convertedAmt = parseFloat(t.converted_amount) || 0;
  const incentive = parseFloat(t.incentive_amount) || 0;
  const fee = parseFloat(t.remit_fee) || 0;
  const dueStatus = t.due_status || 'INSTANT';
  
  const isBd = BD_ACCOUNTS.includes(t.payment_method) || BD_ACCOUNTS.includes(t.to_account) || BD_ACCOUNTS.includes(t.from_account);
  const curr = isBd ? 'BDT' : 'SAR';
  const flag = isBd ? '🇧🇩' : '🇸🇦';
  
  let formattedTime = '';
  if (t.created_at) {
    const d = new Date(t.created_at);
    formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' • ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  let title = `${t.category || 'General'} (${t.payment_method || 'Cash'})`;
  let displayValue = `${curr} ${amt.toFixed(2)}`;
  let badgeColor = 'bg-rose-500/10 text-rose-400';
  let icon = 'fa-arrow-up';
  let sign = '-';

  if (type === 'Income') {
    badgeColor = 'bg-emerald-500/10 text-emerald-400';
    icon = 'fa-arrow-down';
    sign = '+';
  } else if (type === 'Loan Payment') {
    title = `Loan Paid: (${t.payment_method || 'Cash'})`;
    badgeColor = 'bg-indigo-500/10 text-indigo-400';
    icon = 'fa-calendar-check';
    sign = '-';
  } else if (type === 'Internal Transfer') {
    title = `Transfer: ${t.from_account} ➔ ${t.to_account}`;
    badgeColor = 'bg-indigo-500/10 text-indigo-400';
    icon = 'fa-right-left';
    sign = '';
  } else if (type === 'International Transfer') {
    const refText = t.ref_no ? ` [#${t.ref_no}]` : '';
    title = `Remit: ${t.from_account} ➔ ${t.to_account}${refText}`;
    const totalBdtReceived = convertedAmt + incentive;
    displayValue = `SAR ${amt.toFixed(2)} ➔ BDT ${totalBdtReceived.toFixed(2)}`;
    badgeColor = 'bg-emerald-500/10 text-emerald-400';
    icon = 'fa-paper-plane';
    sign = '';
  } else if (type === 'Outward Expense') {
    const friendInfo = t.debtor_name ? ` (${t.debtor_name})` : '';
    const refText = t.ref_no ? ` [#${t.ref_no}]` : '';
    title = `Outward: ${t.from_account} ➔ ${t.to_account}${friendInfo}${refText}`;
    displayValue = `BDT ${amt.toFixed(2)} ➔ SAR ${convertedAmt.toFixed(2)}`;
    badgeColor = dueStatus === 'DUE' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400';
    icon = dueStatus === 'DUE' ? 'fa-hourglass-half' : 'fa-plane-arrival';
    sign = '';
  }

  return `
    <div class="flex items-center justify-between p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg ${badgeColor} flex items-center justify-center font-bold text-xs">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white flex items-center gap-1.5">
            <span>${title}</span>
            <span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">${flag} ${curr}</span>
            ${dueStatus === 'DUE' ? `<span class="text-[9px] px-1 rounded bg-amber-500/20 text-amber-400">বাকি</span>` : ''}
          </h4>
          <span class="text-[10px] text-slate-500">${formattedTime} ${fee > 0 ? `• Fee: ${fee.toFixed(2)}` : ''}</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold ${type === 'Income' ? 'text-emerald-400' : 'text-white'}">
          ${sign}${displayValue}
        </span>
        <button onclick="editTransaction('${t.id}')" class="text-slate-500 hover:text-indigo-400 text-xs p-1"><i class="fa-solid fa-pen"></i></button>
        <button onclick="openDeleteModal('${t.id}')" class="text-slate-500 hover:text-rose-400 text-xs p-1"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  `;
}

window.editTransaction = function(id) {
  const t = allTransactions.find(item => item.id == id);
  if (!t) return;

  document.getElementById('modal-trans-id').value = t.id;
  document.getElementById('modal-trans-amount').value = t.amount;
  document.getElementById('modal-trans-type').value = t.type || 'Expense';
  
  window.handleTypeChange(document.getElementById('modal-trans-type'));

  if (t.type === 'Internal Transfer') {
    document.getElementById('modal-transfer-from').value = t.from_account || t.payment_method || 'Cash';
    document.getElementById('modal-transfer-to').value = t.to_account || 'Al Rajhi';
    document.getElementById('internal-transfer-fee').value = t.remit_fee || 0;
  } else if (t.type === 'International Transfer') {
    document.getElementById('remit-sender-acc').value = t.from_account || 'Al Rajhi';
    document.getElementById('remit-receiver-acc').value = t.to_account || 'IBBL';
    document.getElementById('remit-fee').value = t.remit_fee || 0;
    document.getElementById('remit-exchange-rate').value = t.exchange_rate || 33.5000;
    document.getElementById('remit-ref-no').value = t.ref_no || generateRemitRefNo();
  } else if (t.type === 'Outward Expense') {
    document.getElementById('outward-from-acc').value = t.from_account || 'IBBL';
    document.getElementById('outward-to-acc').value = t.to_account || 'Cash';
    document.getElementById('outward-fee').value = t.remit_fee || 0;
    document.getElementById('outward-exchange-rate').value = t.exchange_rate || 33.0000;
    document.getElementById('outward-payment-status').value = t.due_status || 'INSTANT';
    document.getElementById('outward-remit-ref-select').value = t.ref_no || '';
    
    if (typeof window.toggleOutwardCreditFields === 'function') {
      window.toggleOutwardCreditFields(t.due_status || 'INSTANT');
    }
    
    document.getElementById('outward-person-name').value = t.debtor_name || '';
    document.getElementById('outward-person-phone').value = t.debtor_phone || '';
  } else {
    document.getElementById('modal-trans-payment').value = t.payment_method || 'Cash';
    document.getElementById('modal-trans-category').value = t.category || 'General';
  }

  if (t.created_at) {
    const d = new Date(t.created_at);
    document.getElementById('modal-trans-date').value = d.toISOString().split('T')[0];
    document.getElementById('modal-trans-time').value = d.toTimeString().split(' ')[0].substring(0, 5);
  }

  document.getElementById('modal-title-text').innerText = 'Edit Record';
  document.getElementById('trans-modal').classList.remove('hidden');
};

function renderAnalyticsChart(transactions) {
  const ctx = document.getElementById('expenseChart')?.getContext('2d');
  if (!ctx) return;
  
  const monthlyExpenses = transactions.filter(t => (t.type === 'Expense' || t.type === 'Loan Payment') && isCurrentCalendarMonth(t.created_at));
  
  const catTotals = {};
  monthlyExpenses.forEach(t => {
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

  const monthlyExpenses = transactions.filter(t => t.type === 'Expense' && isCurrentCalendarMonth(t.created_at));
  
  const spentByCat = {};
  monthlyExpenses.forEach(t => {
    spentByCat[t.category || 'General'] = (spentByCat[t.category || 'General'] || 0) + (parseFloat(t.amount) || 0);
  });

  const activeBudgets = Object.keys(categoryBudgets).filter(c => categoryBudgets[c] > 0);

  if (!activeBudgets.length) {
    container.innerHTML = `<p class="text-xs text-slate-500 py-2 text-center">No budget set for this calendar month.</p>`;
    return;
  }

  container.innerHTML = activeBudgets.map(cat => {
    const limit = categoryBudgets[cat];
    const spent = spentByCat[cat] || 0;
    const rawPercent = limit > 0 ? ((spent / limit) * 100).toFixed(1) : 0;
    const isOver = spent > limit;
    const barWidth = Math.min(rawPercent, 100);

    return `
      <div class="space-y-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
        <div class="flex justify-between items-center text-xs">
          <span class="font-bold text-white">${cat} Budget</span>
          <span class="font-bold ${isOver ? 'text-rose-400' : 'text-emerald-400'}">
            ${rawPercent}% ${isOver ? '⚠️' : ''}
          </span>
        </div>
        
        <div class="flex justify-between text-[11px] text-slate-400 pb-1">
          <span>Spent: SAR ${spent.toFixed(2)}</span>
          <span>Limit: SAR ${limit.toFixed(2)}</span>
        </div>

        <div class="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <div class="h-full ${isOver ? 'bg-rose-500 animate-pulse' : 'bg-indigo-500'} rounded-full transition-all duration-500" style="width: ${barWidth}%"></div>
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

window.openBudgetModal = () => {
  document.getElementById('budget-food').value = categoryBudgets.Food || '';
  document.getElementById('budget-rent').value = categoryBudgets.Rent || '';
  document.getElementById('budget-shopping').value = categoryBudgets.Shopping || '';
  document.getElementById('budget-modal').classList.remove('hidden');
};
window.closeBudgetModal = () => document.getElementById('budget-modal').classList.add('hidden');

window.openDeleteModal = function(id) {
  pendingDeleteId = id;
  document.getElementById('delete-confirm-modal').classList.remove('hidden');
};

window.closeDeleteModal = function() {
  pendingDeleteId = null;
  document.getElementById('delete-confirm-modal').classList.add('hidden');
};

function bindEvents() {
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    if (typeof dbClient !== 'undefined' && dbClient) await dbClient.auth.signOut();
    localStorage.removeItem('spendly_last_user');
    window.location.href = 'index.html';
  });

  document.getElementById('search-input')?.addEventListener('input', window.applyFiltersAndRender);

  document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const idToDelete = pendingDeleteId;
    window.closeDeleteModal();

    if (navigator.onLine && typeof dbClient !== 'undefined' && dbClient && currentUser && currentUser.id !== 'local_user') {
      try {
        await dbClient.from('transactions').delete().eq('id', idToDelete);
      } catch (e) {
        console.error(e);
      }
    }
    await loadTransactions();
  });

  document.getElementById('collect-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const transId = document.getElementById('collect-trans-id').value;
    const totalPendingSar = parseFloat(document.getElementById('collect-total-pending-sar').value) || 0;
    const collectAmountSar = parseFloat(document.getElementById('collect-amount-input').value) || 0;
    const targetAcc = document.getElementById('collect-target-acc').value;

    if (collectAmountSar <= 0) {
      alert("❌ অনুগ্রহ করে সঠিক আদায়কৃত পরিমাণ প্রদান করুন।");
      return;
    }

    if (collectAmountSar > totalPendingSar) {
      alert(`❌ আদায়কৃত পরিমাণ (SAR ${collectAmountSar}) মোট পাওনার (SAR ${totalPendingSar}) চেয়ে বেশি হতে পারবে না।`);
      return;
    }

    const originalTrans = allTransactions.find(t => t.id == transId);
    if (!originalTrans) return;

    const rate = parseFloat(originalTrans.exchange_rate) || 33.0;
    const remainingSar = totalPendingSar - collectAmountSar;

    if (remainingSar <= 0.001) {
      const payload = {
        to_account: targetAcc,
        due_status: 'COLLECTED'
      };

      if (navigator.onLine && typeof dbClient !== 'undefined' && dbClient && currentUser && currentUser.id !== 'local_user') {
        const res = await dbClient.from('transactions').update(payload).eq('id', transId);
        if (res && res.error) {
          alert("❌ Error: " + res.error.message);
          return;
        }
      }
    } else {
      const remainingBdt = remainingSar * rate;
      
      const updatePayload = {
        converted_amount: remainingSar,
        amount: remainingBdt,
        due_status: 'DUE'
      };

      const collectedBdt = collectAmountSar * rate;
      const insertPayload = {
        user_id: currentUser ? currentUser.id : 'local_user',
        title: 'Outward Expense',
        type: 'Outward Expense',
        category: originalTrans.category || 'Outward',
        amount: collectedBdt,
        converted_amount: collectAmountSar,
        exchange_rate: rate,
        from_account: originalTrans.from_account || 'IBBL',
        to_account: targetAcc,
        due_status: 'COLLECTED',
        debtor_name: originalTrans.debtor_name,
        debtor_phone: originalTrans.debtor_phone,
        ref_no: originalTrans.ref_no,
        remit_fee: 0,
        created_at: new Date().toISOString()
      };

      if (navigator.onLine && typeof dbClient !== 'undefined' && dbClient && currentUser && currentUser.id !== 'local_user') {
        await dbClient.from('transactions').update(updatePayload).eq('id', transId);
        await dbClient.from('transactions').insert([insertPayload]);
      }
    }

    window.closeCollectModal();
    await loadTransactions();
  });

  document.getElementById('modal-trans-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('modal-trans-id').value;
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
    let dueStatus = 'INSTANT';
    let debtorName = null;
    let debtorPhone = null;
    let refNoVal = null;

    let sourceAccount = paymentVal;
    let totalRequired = amount;

    if (typeVal === 'Internal Transfer') {
      fromAcc = document.getElementById('modal-transfer-from').value;
      toAcc = document.getElementById('modal-transfer-to').value;
      fee = parseFloat(document.getElementById('internal-transfer-fee').value) || 0;
      paymentVal = fromAcc;
      sourceAccount = fromAcc;
      totalRequired = amount + fee;

    } else if (typeVal === 'International Transfer') {
      fromAcc = document.getElementById('remit-sender-acc').value;
      toAcc = document.getElementById('remit-receiver-acc').value;
      fee = parseFloat(document.getElementById('remit-fee').value) || 0;
      exchangeRate = parseFloat(document.getElementById('remit-exchange-rate').value) || 33.5000;
      refNoVal = document.getElementById('remit-ref-no').value || generateRemitRefNo();
      
      convertedAmt = amount * exchangeRate;
      const addIncentive = document.getElementById('remit-incentive-toggle').checked;
      if (addIncentive) incentiveAmt = convertedAmt * 0.025;
      
      paymentVal = fromAcc;
      sourceAccount = fromAcc;
      totalRequired = amount + fee;

    } else if (typeVal === 'Outward Expense') {
      fromAcc = document.getElementById('outward-from-acc').value;
      toAcc = document.getElementById('outward-to-acc').value;
      fee = parseFloat(document.getElementById('outward-fee').value) || 0;
      exchangeRate = parseFloat(document.getElementById('outward-exchange-rate').value) || 33.0000;
      refNoVal = document.getElementById('outward-remit-ref-select').value || null;

      if (!refNoVal && allTransactions.some(t => t.type === 'International Transfer')) {
        alert("⚠️ অনুগ্রহ করে কোন রেফারেন্স থেকে রিয়াল ফেরত আনা হচ্ছে তা নির্বাচন করুন।");
        return;
      }
      
      convertedAmt = exchangeRate > 0 ? (amount / exchangeRate) : 0;
      paymentVal = fromAcc;
      sourceAccount = fromAcc;
      totalRequired = amount + fee;

      dueStatus = document.getElementById('outward-payment-status').value;
      if (dueStatus === 'DUE') {
        debtorName = document.getElementById('outward-person-name').value || 'Friend';
        debtorPhone = document.getElementById('outward-person-phone').value || '';
      }

    } else if (typeVal === 'Expense' || typeVal === 'Loan Payment') {
      sourceAccount = paymentVal;
      totalRequired = amount;
    }

    if (typeVal !== 'Income') {
      let availableBal = window.currentAccBalances ? (window.currentAccBalances[sourceAccount] || 0) : 0;

      if (id) {
        const oldRecord = allTransactions.find(t => t.id == id);
        if (oldRecord) {
          let oldSource = oldRecord.from_account || oldRecord.payment_method;
          let oldAmt = parseFloat(oldRecord.amount) || 0;
          let oldFee = parseFloat(oldRecord.remit_fee) || 0;
          if (oldSource === sourceAccount) {
            availableBal += (oldAmt + oldFee);
          }
        }
      }

      if (totalRequired > availableBal) {
        alert(`❌ Insufficient Balance in ${sourceAccount}!\n\nAvailable Balance: ${availableBal.toFixed(2)}\nRequired Amount (with fee): ${totalRequired.toFixed(2)}`);
        return;
      }
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
      due_status: dueStatus,
      debtor_name: debtorName,
      debtor_phone: debtorPhone,
      ref_no: refNoVal,
      created_at: fullDateTime
    };

    if (navigator.onLine && typeof dbClient !== 'undefined' && dbClient && currentUser && currentUser.id !== 'local_user') {
      let res;
      if (id) {
        res = await dbClient.from('transactions').update(payload).eq('id', id);
      } else {
        res = await dbClient.from('transactions').insert([payload]);
      }

      if (res && res.error) {
        console.error("Supabase Error:", res.error);
        alert(`❌ DB Error: ${res.error.message}`);
        return;
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
