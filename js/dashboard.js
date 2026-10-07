// Helper Function
const getEl = (id) => document.getElementById(id);

let currentUser = null;
let userCurrency = 'SAR';

// পেজ লোড হওয়ার সাথে সাথেই ডাটা ফেচ শুরু হবে
document.addEventListener('DOMContentLoaded', async () => {
  if (!dbClient) {
    alert("Supabase connection failed!");
    return;
  }

  // ১. ইউজার সেশন চেক
  const { data: { user }, error: userError } = await dbClient.auth.getUser();

  if (userError || !user) {
    window.location.href = 'index.html';
    return;
  }

  currentUser = user;

  // ২. প্রোফাইল ও কারেন্সি লোড
  await loadUserProfile();

  // ৩. লেনদেনের ডাটা লোড
  await loadTransactions();
});

// প্রোফাইল তথ্য লোড করা
async function loadUserProfile() {
  try {
    const { data, error } = await dbClient
      .from('profiles')
      .select('full_name, currency')
      .eq('id', currentUser.id)
      .single();

    if (data) {
      if (data.currency) userCurrency = data.currency;
      const userNameEl = getEl('user-name') || getEl('profile-name');
      if (userNameEl) userNameEl.innerText = data.full_name || currentUser.email;
    }
  } catch (err) {
    console.log('Profile load error:', err);
  }
}

// লেনদেনের ডাটা লোড ও গণনা করা
async function loadTransactions() {
  const recentListEl = getEl('recent-transactions') || getEl('transaction-list');
  
  try {
    const { data: transactions, error } = await dbClient
      .from('transactions')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      if (recentListEl) recentListEl.innerHTML = '<p class="text-center py-4 text-red-400">Failed to load transactions.</p>';
      return;
    }

    let totalIncome = 0;
    let totalExpense = 0;

    if (recentListEl) recentListEl.innerHTML = '';

    if (!transactions || transactions.length === 0) {
      if (recentListEl) recentListEl.innerHTML = '<p class="text-center py-4 opacity-50">No transactions recorded yet.</p>';
    } else {
      transactions.forEach(t => {
        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'Income' || t.type === 'income') {
          totalIncome += amt;
        } else {
          totalExpense += amt;
        }

        if (recentListEl) {
          const item = document.createElement('div');
          item.className = 'flex justify-between items-center p-3 my-2 bg-gray-800 rounded border border-gray-700';
          item.innerHTML = `
            <div>
              <p class="font-bold text-white">${t.title}</p>
              <span class="text-xs text-gray-400">${t.category || 'General'}</span>
            </div>
            <div class="${t.type === 'Income' || t.type === 'income' ? 'text-green-400' : 'text-red-400'} font-bold">
              ${t.type === 'Income' || t.type === 'income' ? '+' : '-'}${userCurrency} ${amt.toFixed(2)}
            </div>
          `;
          recentListEl.appendChild(item);
        }
      });
    }

    // কার্ড ব্যালেন্স আপডেট
    const balance = totalIncome - totalExpense;
    if (getEl('total-balance')) getEl('total-balance').innerText = `${userCurrency} ${balance.toFixed(2)}`;
    if (getEl('total-income')) getEl('total-income').innerText = `+${userCurrency} ${totalIncome.toFixed(2)}`;
    if (getEl('total-expense')) getEl('total-expense').innerText = `-${userCurrency} ${totalExpense.toFixed(2)}`;

  } catch (err) {
    console.error(err);
    if (recentListEl) recentListEl.innerHTML = '<p class="text-center py-4 text-red-400">Error loading data.</p>';
  }
}

// ৪. নতুন ট্রানজেকশন সেভ করা (স্মার্ট ইনপুট সিলেক্টর সহ)
const transForm = getEl('transaction-form') || document.querySelector('form');
if (transForm) {
  transForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const inputs = transForm.querySelectorAll('input');
    const selects = transForm.querySelectorAll('select');

    // ID বা ইনপুট পজিশন থেকে ফিল্ড সনাক্তকরণ
    const titleEl = getEl('title') || getEl('trans-title') || getEl('transaction-title') || inputs[0];
    const amountEl = getEl('amount') || getEl('trans-amount') || getEl('transaction-amount') || inputs[1];
    const typeEl = getEl('type') || getEl('trans-type') || selects[0];
    const categoryEl = getEl('category') || getEl('trans-category') || selects[1];

    const title = titleEl ? titleEl.value.trim() : '';
    const amount = amountEl ? parseFloat(amountEl.value) : 0;
    const type = typeEl ? typeEl.value : 'Expense';
    const category = categoryEl ? categoryEl.value : 'General';

    if (!title || !amount || isNaN(amount)) {
      alert('Please fill in both Title and Amount properly.');
      return;
    }

    const saveBtn = transForm.querySelector('button[type="submit"]');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerText = 'Saving...';
    }

    try {
      const { error } = await dbClient
        .from('transactions')
        .insert([{
          user_id: currentUser.id,
          title,
          amount,
          type,
          category
        }]);

      if (error) {
        alert('Failed to save transaction: ' + error.message);
      } else {
        transForm.reset();
        await loadTransactions();
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Save Transaction';
      }
    }
  });
}

// ৫. লগআউট
const logoutBtn = getEl('logout-btn') || document.querySelector('button[onclick*="logout"]');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await dbClient.auth.signOut();
    window.location.href = 'index.html';
  });
}
