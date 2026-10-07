const getClient = () => window.dbClient || window.supabaseClient || window.supabase;

let currentUser = null;
let userCurrency = 'SAR';
let allTransactions = [];

document.addEventListener('DOMContentLoaded', async () => {
  const client = getClient();
  if (!client) {
    console.error("Supabase client missing!");
    return;
  }

  const { data: { user }, error } = await client.auth.getUser();
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
  const client = getClient();
  try {
    const { data } = await client
      .from('profiles')
      .select('full_name, currency')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (data && data.currency) {
      userCurrency = data.currency;
    }

    const userNameEl = document.getElementById('user-name');
    const userAvatarEl = document.getElementById('user-avatar');

    const displayName = (data && data.full_name) ? data.full_name : (currentUser.email ? currentUser.email.split('@')[0] : 'User');

    if (userNameEl) userNameEl.innerText = displayName;
    if (userAvatarEl && displayName) {
      userAvatarEl.innerText = displayName.charAt(0).toUpperCase();
    }
  } catch (err) {
    console.error('Error loading profile:', err);
  }
}

async function loadTransactions() {
  const client = getClient();
  const listEl = document.getElementById('transactions-list');

  try {
    const { data, error } = await client
      .from('transactions')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      if (listEl) {
        listEl.innerHTML = `<div class="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-center text-sm">Failed to load transactions.</div>`;
      }
      return;
    }

    allTransactions = data || [];
    renderTransactions(allTransactions);
    updateMetrics(allTransactions);

  } catch (err) {
    console.error('Error fetching transactions:', err);
    if (listEl) {
      listEl.innerHTML = `<div class="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-center text-sm">Error connecting to database.</div>`;
    }
  }
}

const categoryIcons = {
  'Food': 'fa-utensils',
  'Salary': 'fa-money-bill-wave',
  'Shopping': 'fa-bag-shopping',
  'Bills': 'fa-file-invoice-dollar',
  'Entertainment': 'fa-film',
  'Investment': 'fa-chart-line',
  'Transport': 'fa-car',
  'General': 'fa-receipt'
};

function renderTransactions(transactions) {
  const listEl = document.getElementById('transactions-list');
  if (!listEl) return;

  if (!transactions || transactions.length === 0) {
    listEl.innerHTML = `
      <div class="text-center py-12 px-4 bg-slate-950/50 border border-slate-800/80 rounded-xl">
        <div class="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto mb-3 text-slate-500">
          <i class="fa-solid fa-box-open text-xl"></i>
        </div>
        <p class="text-sm font-semibold text-slate-300">No transactions recorded</p>
        <p class="text-xs text-slate-500 mt-1">Add a new transaction using the form to get started.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = transactions.map(t => {
    const amount = parseFloat(t.amount) || 0;
    const isIncome = (t.type && t.type.toLowerCase() === 'income');
    const iconClass = categoryIcons[t.category] || 'fa-receipt';
    const formattedDate = t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

    return `
      <div class="group flex items-center justify-between p-4 bg-slate-950/80 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 rounded-xl transition duration-200">
        <div class="flex items-center gap-3.5">
          <div class="w-10 h-10 rounded-xl ${isIncome ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'} flex items-center justify-center text-sm">
            <i class="fa-solid ${iconClass}"></i>
          </div>
          <div>
            <h4 class="text-sm font-bold text-white group-hover:text-indigo-300 transition">${escapeHtml(t.title)}</h4>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700">${t.category || 'General'}</span>
              <span class="text-[11px] text-slate-500">${formattedDate}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <div class="text-right">
            <span class="text-sm sm:text-base font-extrabold ${isIncome ? 'text-emerald-400' : 'text-rose-400'}">
              ${isIncome ? '+' : '-'}${userCurrency} ${amount.toFixed(2)}
            </span>
          </div>

          <div class="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
            <button onclick="editTransaction(${t.id})" title="Edit" class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-indigo-600/30 hover:text-indigo-400 text-slate-400 border border-slate-700 transition flex items-center justify-center text-xs">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button onclick="deleteTransaction(${t.id})" title="Delete" class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-rose-600/30 hover:text-rose-400 text-slate-400 border border-slate-700 transition flex items-center justify-center text-xs">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function updateMetrics(transactions) {
  let totalIncome = 0;
  let totalExpense = 0;

  transactions.forEach(t => {
    const amt = parseFloat(t.amount) || 0;
    if (t.type && t.type.toLowerCase() === 'income') {
      totalIncome += amt;
    } else {
      totalExpense += amt;
    }
  });

  const totalBalance = totalIncome - totalExpense;

  const balEl = document.getElementById('total-balance');
  const incEl = document.getElementById('total-income');
  const expEl = document.getElementById('total-expense');

  if (balEl) balEl.innerText = `${userCurrency} ${totalBalance.toFixed(2)}`;
  if (incEl) incEl.innerText = `+${userCurrency} ${totalIncome.toFixed(2)}`;
  if (expEl) expEl.innerText = `-${userCurrency} ${totalExpense.toFixed(2)}`;
}

function bindEvents() {
  const form = document.getElementById('transaction-form');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  const searchInput = document.getElementById('search-input');
  const logoutBtn = document.getElementById('logout-btn');

  if (form) form.addEventListener('submit', handleFormSubmit);
  if (cancelBtn) cancelBtn.addEventListener('click', resetForm);

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const filtered = allTransactions.filter(t => 
        t.title.toLowerCase().includes(query) || 
        (t.category && t.category.toLowerCase().includes(query))
      );
      renderTransactions(filtered);
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const client = getClient();
      await client.auth.signOut();
      window.location.href = 'index.html';
    });
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const client = getClient();
  const idEl = document.getElementById('trans-id');
  const titleEl = document.getElementById('trans-title');
  const amountEl = document.getElementById('trans-amount');
  const typeEl = document.getElementById('trans-type');
  const categoryEl = document.getElementById('trans-category');
  const submitBtn = document.getElementById('form-submit-btn');

  const editId = idEl.value;
  const title = titleEl.value.trim();
  const amount = parseFloat(amountEl.value);
  const type = typeEl.value;
  const category = categoryEl.value;

  if (!title || isNaN(amount) || amount <= 0) {
    alert('Please enter a valid title and positive amount.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;

  try {
    if (editId) {
      const { error } = await client
        .from('transactions')
        .update({ title, amount, type, category })
        .eq('id', editId)
        .eq('user_id', currentUser.id);

      if (error) throw error;
    } else {
      const { error } = await client
        .from('transactions')
        .insert([{
          user_id: currentUser.id,
          title,
          amount,
          type,
          category
        }]);

      if (error) throw error;
    }

    resetForm();
    await loadTransactions();

  } catch (err) {
    alert('Operation failed: ' + err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

window.editTransaction = function(id) {
  const transaction = allTransactions.find(t => t.id === id);
  if (!transaction) return;

  document.getElementById('trans-id').value = transaction.id;
  document.getElementById('trans-title').value = transaction.title;
  document.getElementById('trans-amount').value = transaction.amount;
  document.getElementById('trans-type').value = transaction.type;
  document.getElementById('trans-category').value = transaction.category || 'General';

  document.getElementById('form-title').innerHTML = `<i class="fa-solid fa-pen-to-square text-indigo-400"></i> Edit Transaction`;
  document.getElementById('form-subtitle').innerText = 'Modify transaction details';
  document.getElementById('form-submit-btn').innerHTML = `<i class="fa-solid fa-check"></i> Update Transaction`;
  document.getElementById('cancel-edit-btn').classList.remove('hidden');

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function resetForm() {
  document.getElementById('transaction-form').reset();
  document.getElementById('trans-id').value = '';

  document.getElementById('form-title').innerHTML = `<i class="fa-solid fa-circle-plus text-indigo-400"></i> Add Transaction`;
  document.getElementById('form-subtitle').innerText = 'Record a new income or expense';
  document.getElementById('form-submit-btn').innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Transaction`;
  document.getElementById('cancel-edit-btn').classList.add('hidden');
}

window.deleteTransaction = async function(id) {
  if (!confirm('Are you sure you want to delete this transaction?')) return;

  const client = getClient();
  try {
    const { error } = await client
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUser.id);

    if (error) throw error;

    await loadTransactions();
  } catch (err) {
    alert('Failed to delete transaction: ' + err.message);
  }
};

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
