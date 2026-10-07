const getEl = (id) => document.getElementById(id);

let currentUser = null;
let userCurrency = 'SAR';

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof dbClient === 'undefined' || !dbClient) {
    alert("Supabase connection failed!");
    return;
  }

  const { data: { user }, error: userError } = await dbClient.auth.getUser();

  if (userError || !user) {
    window.location.href = 'index.html';
    return;
  }

  currentUser = user;

  await loadUserProfile();
  await loadTransactions();
});

async function loadUserProfile() {
  try {
    const { data } = await dbClient
      .from('profiles')
      .select('full_name, currency')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (data && data.currency) {
      userCurrency = data.currency;
    }

    const userNameEl = getEl('user-name') || 
                       getEl('profile-name') || 
                       document.querySelector('span[class*="user"]') ||
                       document.querySelector('header span') ||
                       document.querySelector('.loading');

    if (userNameEl) {
      userNameEl.innerText = (data && data.full_name) ? data.full_name : currentUser.email.split('@')[0];
    }
  } catch (err) {
    console.error('Profile load error:', err);
  }
}

async function loadTransactions() {
  const recentListEl = getEl('recent-transactions') || 
                       getEl('transaction-list') || 
                       document.querySelector('.recent-transactions');
  
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
        const isIncome = (t.type && t.type.toLowerCase() === 'income');

        if (isIncome) {
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
            <div class="${isIncome ? 'text-green-400' : 'text-red-400'} font-bold">
              ${isIncome ? '+' : '-'}${userCurrency} ${amt.toFixed(2)}
            </div>
          `;
          recentListEl.appendChild(item);
        }
      });
    }

    const totalBalance = totalIncome - totalExpense;

    updateCardValues(totalBalance, totalIncome, totalExpense);

  } catch (err) {
    console.error(err);
    if (recentListEl) recentListEl.innerHTML = '<p class="text-center py-4 text-red-400">Error loading data.</p>';
  }
}

function updateCardValues(balance, income, expense) {
  let balEl = getEl('total-balance') || getEl('balance') || getEl('balance-amount');
  let incEl = getEl('total-income') || getEl('income') || getEl('income-amount');
  let expEl = getEl('total-expense') || getEl('expense') || getEl('expense-amount');

  if (!balEl || !incEl || !expEl) {
    const cards = document.querySelectorAll('div[class*="grid"] > div, .card');
    if (cards.length >= 3) {
      if (!balEl) balEl = cards[0].querySelector('h2, h3, p, span, div');
      if (!incEl) incEl = cards[1].querySelector('h2, h3, p, span, div');
      if (!expEl) expEl = cards[2].querySelector('h2, h3, p, span, div');
    }
  }

  if (balEl) balEl.innerText = `${userCurrency} ${balance.toFixed(2)}`;
  if (incEl) incEl.innerText = `+${userCurrency} ${income.toFixed(2)}`;
  if (expEl) expEl.innerText = `-${userCurrency} ${expense.toFixed(2)}`;
}

const transForm = getEl('transaction-form') || document.querySelector('form');

if (transForm) {
  transForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const titleEl = getEl('title') || 
                    getEl('trans-title') || 
                    transForm.querySelector('input[type="text"]');

    const amountEl = getEl('amount') || 
                     getEl('trans-amount') || 
                     transForm.querySelector('input[type="number"]');

    const typeEl = getEl('type') || 
                   getEl('trans-type') || 
                   transForm.querySelectorAll('select')[0];

    const categoryEl = getEl('category') || 
                       getEl('trans-category') || 
                       transForm.querySelectorAll('select')[1];

    const title = titleEl ? titleEl.value.trim() : '';
    const amount = amountEl ? parseFloat(amountEl.value) : 0;
    const type = typeEl ? typeEl.value : 'Expense';
    const category = categoryEl ? categoryEl.value : 'General';

    if (!title || !amount || isNaN(amount)) {
      alert('Please fill in Title and Amount fields properly.');
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

const logoutBtn = getEl('logout-btn') || document.querySelector('button[onclick*="logout"]');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await dbClient.auth.signOut();
    window.location.href = 'index.html';
  });
}
