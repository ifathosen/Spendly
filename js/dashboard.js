const supabase = window.sbClient;

let currentUser = null;
let userCurrency = 'SAR ﷼';

window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = session.user;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (profile) {
    document.getElementById('user-display-name').innerText = profile.full_name;
    userCurrency = profile.currency || 'SAR ﷼';
  }

  document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
  loadTransactions();
});

const logoutBtn = document.getElementById('logout-btn');
if(logoutBtn) {
  logoutBtn.onclick = async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  };
}

const addTxForm = document.getElementById('add-transaction-form');
if(addTxForm) {
  addTxForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('tx-title').value;
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const type = document.getElementById('tx-type').value;
    const category = document.getElementById('tx-category').value;
    const date = document.getElementById('tx-date').value;

    const { error } = await supabase.from('expenses').insert([{
      user_id: currentUser.id,
      title,
      amount,
      type,
      category,
      date
    }]);

    if (error) {
      alert(error.message);
    } else {
      addTxForm.reset();
      document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
      loadTransactions();
    }
  });
}

async function loadTransactions() {
  const listContainer = document.getElementById('transaction-list');
  
  const { data: transactions, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('date', { ascending: false });

  if (error || !transactions) {
    listContainer.innerHTML = `<p class="text-red-400 text-center">Failed to load data.</p>`;
    return;
  }

  if (transactions.length === 0) {
    listContainer.innerHTML = `<p class="text-slate-500 text-center py-6" data-i18n="noTx">No transactions added yet.</p>`;
    updateStats(0, 0);
    applyTranslations();
    return;
  }

  let totalIncome = 0;
  let totalExpense = 0;
  listContainer.innerHTML = '';

  transactions.forEach(item => {
    if (item.type === 'income') totalIncome += Number(item.amount);
    else totalExpense += Number(item.amount);

    const isIncome = item.type === 'income';
    const row = document.createElement('div');
    row.className = 'glass-card p-4 flex justify-between items-center bg-slate-900/40 hover:bg-slate-900/80 transition';
    
    row.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg ${isIncome ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'} flex items-center justify-center">
          <i class="fa-solid ${isIncome ? 'fa-arrow-down' : 'fa-arrow-up'}"></i>
        </div>
        <div>
          <h4 class="font-semibold text-sm">${item.title}</h4>
          <span class="text-xs text-slate-400">${item.category} • ${item.date}</span>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <span class="font-bold ${isIncome ? 'text-emerald-400' : 'text-rose-400'}">
          ${isIncome ? '+' : '-'} ${item.amount} ${userCurrency}
        </span>
        <button onclick="deleteTx('${item.id}')" class="text-slate-500 hover:text-rose-400 text-xs transition">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
    listContainer.appendChild(row);
  });

  updateStats(totalIncome, totalExpense);
}

function updateStats(income, expense) {
  document.getElementById('stat-income').innerText = `+${income.toFixed(2)} ${userCurrency}`;
  document.getElementById('stat-expense').innerText = `-${expense.toFixed(2)} ${userCurrency}`;
  document.getElementById('stat-balance').innerText = `${(income - expense).toFixed(2)} ${userCurrency}`;
}

async function deleteTx(id) {
  if (confirm("Delete this transaction?")) {
    await supabase.from('expenses').delete().eq('id', id);
    loadTransactions();
  }
}
