let currentUser = null;
let allTransactions = [];
let activeBankForStatement = null;

const KSA_ACCOUNTS = ['Cash', 'Al Rajhi', 'SNB', 'Barq', 'Neo', 'Enjaz'];
const BD_ACCOUNTS = ['IBBL', 'MTB', 'Midland', 'BRAC', 'EBL', 'Pubali', 'bKash'];
const MONTHLY_LOAN_GOAL_BDT = 35000;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const savedCustomRate = localStorage.getItem('spendly_bd_custom_rate');
    if (savedCustomRate && document.getElementById('bd-custom-rate-input')) {
      document.getElementById('bd-custom-rate-input').value = savedCustomRate;
    }

    await loadTransactions();
  } catch (err) {
    console.error("Init Error:", err);
  }
});

async function loadTransactions() {
  let cloudData = [];
  try {
    if (navigator.onLine && typeof dbClient !== 'undefined' && dbClient) {
      const { data, error } = await dbClient.from('transactions').select('*').order('created_at', { ascending: false });
      if (!error && data) cloudData = data;
    }
  } catch (e) {
    console.error(e);
  }

  allTransactions = cloudData.length ? cloudData : [];

  updateMetricsAndAccounts(allTransactions);
  renderLoanGoalProgress(allTransactions);
  window.applyFiltersAndRender();
}

// 1. BANK STATEMENT MODAL LOGIC (EVERY BANK FILTER)
window.openBankStatementModal = function(bankName) {
  activeBankForStatement = bankName;
  document.getElementById('stmt-modal-bank-name').innerText = `${bankName} Statement`;
  
  // Set default dates (start of month to today)
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  document.getElementById('stmt-from-date').value = firstDay;
  document.getElementById('stmt-to-date').value = today;

  renderBankStatementDetails();
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

  // Filter transactions for this specific bank
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

    // Check IN or OUT
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

// 2. MIDLAND BANK LOAN GOAL PROGRESS TRACKER
function renderLoanGoalProgress(transactions) {
  const now = new Date();
  
  // Filter current month transactions credited to Midland Bank
  let totalMidlandCreditsBDT = 0;

  transactions.forEach(t => {
    if (!t.created_at) return;
    const tDate = new Date(t.created_at);
    if (tDate.getFullYear() !== now.getFullYear() || tDate.getMonth() !== now.getMonth()) return;

    const amt = parseFloat(t.amount) || 0;
    const converted = parseFloat(t.converted_amount) || 0;
    const incentive = parseFloat(t.incentive_amount) || 0;

    // Check if money entered Midland Bank
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

// 3. RENDER KSA & BD ACCOUNTS WITH CLICKABLE STATEMENT TRIGGER
function updateMetricsAndAccounts(transactions) {
  const accBalances = {
    'Cash': 0, 'Al Rajhi': 0, 'SNB': 0, 'Barq': 0, 'Neo': 0, 'Enjaz': 0,
    'IBBL': 0, 'MTB': 0, 'Midland': 0, 'BRAC': 0, 'EBL': 0, 'Pubali': 0, 'bKash': 0
  };

  transactions.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    const fee = parseFloat(t.remit_fee) || 0;
    const convertedAmt = parseFloat(t.converted_amount) || 0;
    const incentive = parseFloat(t.incentive_amount) || 0;

    if (t.type === 'Income') {
      if (accBalances.hasOwnProperty(t.payment_method)) accBalances[t.payment_method] += amt;
    } else if (t.type === 'Expense' || t.type === 'Loan Payment') {
      if (accBalances.hasOwnProperty(t.payment_method)) accBalances[t.payment_method] -= amt;
    } else if (t.type === 'Internal Transfer') {
      if (accBalances.hasOwnProperty(t.from_account)) accBalances[t.from_account] -= (amt + fee);
      if (accBalances.hasOwnProperty(t.to_account)) accBalances[t.to_account] += amt;
    } else if (t.type === 'International Transfer') {
      if (accBalances.hasOwnProperty(t.from_account)) accBalances[t.from_account] -= (amt + fee);
      if (accBalances.hasOwnProperty(t.to_account)) accBalances[t.to_account] += (convertedAmt + incentive);
    } else if (t.type === 'Outward Expense') {
      if (accBalances.hasOwnProperty(t.from_account)) accBalances[t.from_account] -= (amt + fee);
      if (t.due_status !== 'DUE' && accBalances.hasOwnProperty(t.to_account)) accBalances[t.to_account] += convertedAmt;
    }
  });

  // Render Clickable KSA Bank Accounts Grid
  const ksaGrid = document.getElementById('bank-accounts-grid');
  if (ksaGrid) {
    ksaGrid.innerHTML = KSA_ACCOUNTS.filter(b => b !== 'Cash').map(b => `
      <div onclick="openBankStatementModal('${b}')" class="p-2.5 bg-slate-950 border border-slate-800 hover:border-indigo-500 rounded-xl cursor-pointer transition">
        <div class="flex justify-between items-center">
          <span class="text-[10px] text-indigo-400 font-bold">${b}</span>
          <i class="fa-solid fa-list-ul text-[9px] text-slate-500"></i>
        </div>
        <span class="text-xs font-bold text-white block mt-0.5">SAR ${accBalances[b].toFixed(2)}</span>
      </div>
    `).join('');
  }

  // Render Clickable BD Bank Accounts Grid
  const bdGrid = document.getElementById('bd-bank-accounts-grid');
  if (bdGrid) {
    bdGrid.innerHTML = BD_ACCOUNTS.map(b => `
      <div onclick="openBankStatementModal('${b}')" class="p-2.5 bg-slate-950 border border-slate-800 hover:border-emerald-500 rounded-xl cursor-pointer transition">
        <div class="flex justify-between items-center">
          <span class="text-[10px] text-emerald-400 font-bold">${b}</span>
          <i class="fa-solid fa-list-ul text-[9px] text-slate-500"></i>
        </div>
        <span class="text-xs font-bold text-white block mt-0.5">BDT ${accBalances[b].toFixed(2)}</span>
      </div>
    `).join('');
  }
}
