const translations = {
  bn: {
    appName: "স্পেন্ডলি প্রো",
    ksaNetBalance: "সৌদি নিট ব্যালেন্স (SAR)",
    cash: "নগদ রিয়াল",
    saudiBanks: "সৌদি ব্যাংকসমূহ",
    pureIncome: "প্রকৃত ইনকাম",
    pureExpense: "প্রকৃত খরচ",
    todaysTransactions: "আজকের লেনদেন",
    recordsHistory: "রেকর্ড হিস্ট্রি",
    pdfReport: "পিডিএফ রিপোর্ট",
    searchPlaceholder: "শিরোনাম বা ক্যাটাগরি খুঁজুন...",
    allAccounts: "সকল অ্যাকাউন্ট / ব্যাংক",
    newestFirst: "সর্বশেষ আগে",
    oldestFirst: "পুরাতন আগে",
    highestAmount: "সর্বোচ্চ পরিমাণ",
    fromDate: "শুরুর তারিখ",
    toDate: "শেষের তারিখ",
    dailyProfitExpense: "দৈনিক প্রফিট ও খরচ ট্র্যাকার",
    netIncomeToday: "আজকের নিট ইনকাম",
    pureExpenseToday: "আজকের প্রকৃত খরচ",
    remittanceArbitrage: "রেমিট্যান্স ট্রেডিং প্রফিট",
    sentRemittance: "পাঠানো রেমিট্যান্স",
    returnedSar: "ফেরত আনা রিয়াল",
    netTradingProfit: "নিট ট্রেডিং লাভ",
    loanGoalTitle: "মাসিক লোন পরিশোধ লক্ষ্য",
    loanGoalSub: "মিডল্যান্ড ব্যাংকে জমাকৃত টাকা",
    receivablesPayables: "পাওনা ও দেনার হিসাব",
    totalPendingSar: "মোট পাওনা রিয়াল",
    equivalentBdt: "সমতুল্য টাকা",
    expenseDistribution: "চলতি মাসের খরচ বণ্টন",
    monthlyBudgets: "চলতি মাসের বাজেট",
    bdWealthTitle: "বাংলাদেশে মোট সম্পদ (BDT)",
    customRateLabel: "কাস্টম এক্সচেঞ্জ রেট (১ SAR = ? BDT):",
    sarEquivValue: "সমতুল্য রিয়াল মান:",
    bdAccountsTitle: "বাংলাদেশের ব্যাংক ও ওয়ালেট",
    bdLocalExpenseBtn: "বাংলাদেশে স্থানীয় খরচ রেকর্ড",
    outwardBtn: "আউটওয়ার্ড ট্রান্সফার (BD ➔ KSA)",
    bankStatementTitle: "ব্যাংক স্টেটমেন্ট",
    totalIn: "মোট ইন (জমা)",
    totalOut: "মোট আউট (খরচ)",
    netChange: "নিট পরিবর্তন",
    closeBtn: "বন্ধ করুন",
    saveBtn: "সংরক্ষণ করুন",
    filterBtn: "ফিল্টার করুন",
    newEntry: "নতুন এন্ট্রি",
    editRecord: "এন্ট্রি সম্পাদনা",
    availableBal: "অবশিষ্ট ব্যালেন্স:",
    amount: "পরিমাণ",
    account: "অ্যাঙ্কউন্ট",
    type: "ধরণ",
    category: "ক্যাটাগরি",
    date: "তারিখ",
    time: "সময়",
    noData: "কোন তথ্য পাওয়া যায়নি।"
  },
  en: {
    appName: "Spendly Pro",
    ksaNetBalance: "KSA Net Balance (SAR)",
    cash: "Cash SAR",
    saudiBanks: "Saudi Banks",
    pureIncome: "Pure Income",
    pureExpense: "Pure Expense",
    todaysTransactions: "Today's Transactions",
    recordsHistory: "Records History",
    pdfReport: "PDF Report",
    searchPlaceholder: "Search title or category...",
    allAccounts: "All Accounts / Banks",
    newestFirst: "Newest First",
    oldestFirst: "Oldest First",
    highestAmount: "Highest Amount",
    fromDate: "From Date",
    toDate: "To Date",
    dailyProfitExpense: "Daily Profit & Expense Tracker",
    netIncomeToday: "Today's Net Income",
    pureExpenseToday: "Today's Pure Expense",
    remittanceArbitrage: "Remittance Trading Profit",
    sentRemittance: "Sent Remittance",
    returnedSar: "Returned SAR",
    netTradingProfit: "Net Trading Profit",
    loanGoalTitle: "Monthly Loan Repayment Goal",
    loanGoalSub: "Tracked via Midland Bank",
    receivablesPayables: "Receivables & Payables",
    totalPendingSar: "Total Pending SAR",
    equivalentBdt: "Equivalent BDT",
    expenseDistribution: "Monthly Expense Distribution",
    monthlyBudgets: "Monthly Budgets",
    bdWealthTitle: "Total BD Wealth (BDT)",
    customRateLabel: "Custom Rate (1 SAR = ? BDT):",
    sarEquivValue: "SAR Equivalent Value:",
    bdAccountsTitle: "BD Bank & Wallet Accounts",
    bdLocalExpenseBtn: "Record Local BD Expense",
    outwardBtn: "Outward Transfer (BD ➔ KSA)",
    bankStatementTitle: "Bank Statement",
    totalIn: "Total IN (Credits)",
    totalOut: "Total OUT (Debits)",
    netChange: "Net Change",
    closeBtn: "Close",
    saveBtn: "Save",
    filterBtn: "Filter",
    newEntry: "New Entry",
    editRecord: "Edit Record",
    availableBal: "Available Balance:",
    amount: "Amount",
    account: "Account",
    type: "Type",
    category: "Category",
    date: "Date",
    time: "Time",
    noData: "No records found."
  }
};

let currentLang = localStorage.getItem('spendly_language') || 'bn';

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('spendly_language', lang);
  applyTranslations();
  if (typeof window.applyFiltersAndRender === 'function') window.applyFiltersAndRender();
  if (typeof window.loadTransactions === 'function') window.loadTransactions();
}

function toggleLanguage() {
  setLanguage(currentLang === 'bn' ? 'en' : 'bn');
}

function applyTranslations() {
  const langData = translations[currentLang];
  
  const langLabel = document.getElementById('lang-label');
  if (langLabel) langLabel.innerText = currentLang === 'bn' ? 'বাংলা' : 'English';

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (langData[key]) {
      if (el.tagName === 'INPUT' && el.placeholder) {
        el.placeholder = langData[key];
      } else {
        el.innerText = langData[key];
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', applyTranslations);
