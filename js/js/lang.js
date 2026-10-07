const translations = {
  en: {
    brandName: "Spendly",
    tagline: "Smart Daily Expense Tracker",
    heroTitle: "Master Your Daily Spending Effortlessly",
    heroDesc: "Track income & expenses, monitor real-time balance with multi-currency support.",
    getStarted: "Get Started",
    signIn: "Sign In",
    signUp: "Sign Up",
    logout: "Logout",
    totalBalance: "Total Balance",
    totalIncome: "Total Income",
    totalExpense: "Total Expense",
    addTx: "Add Transaction",
    title: "Title / Description",
    amount: "Amount",
    type: "Type",
    category: "Category",
    date: "Date",
    save: "Save Transaction",
    recentTx: "Recent Transactions",
    noTx: "No transactions added yet.",
    income: "Income",
    expense: "Expense",
    currencyLabel: "Select Currency",
    fullName: "Full Name",
    email: "Email Address",
    password: "Password",
    verifyOtp: "Verify OTP",
    forgotPass: "Forgot Password?",
    resetPass: "Reset Password",
    sendResetLink: "Send Reset Link",
    updatePass: "Update Password"
  },
  bn: {
    brandName: "স্পেন্ডলি",
    tagline: "স্মার্ট দৈনিক হিসাব ট্র্যাকার",
    heroTitle: "আপনার দৈনিক খরচ নিয়ন্ত্রণ করুন সহজে ও নিরাপদে",
    heroDesc: "সহজে আয় ও খরচের হিসাব রাখুন, রিয়েল-টাইম ব্যালেন্স দেখুন পছন্দের কারেন্সিতে।",
    getStarted: "শুরু করুন",
    signIn: "লগইন",
    signUp: "সাইন আপ",
    logout: "লগআউট",
    totalBalance: "মোট ব্যালেন্স",
    totalIncome: "মোট আয়",
    totalExpense: "মোট খরচ",
    addTx: "নতুন লেনদেন যোগ করুন",
    title: "বিবরণ / শিরোনাম",
    amount: "পরিমাণ",
    type: "ধরন",
    category: "ক্যাটাগরি",
    date: "তারিখ",
    save: "সংরক্ষণ করুন",
    recentTx: "সাম্প্রতিক লেনদেন",
    noTx: "এখনো কোনো লেনদেন যোগ করা হয়নি।",
    income: "আয়",
    expense: "খরচ",
    currencyLabel: "কারেন্সি নির্বাচন করুন",
    fullName: "পুরো নাম",
    email: "ইমেইল ঠিকানা",
    password: "পাসওয়ার্ড",
    verifyOtp: "ওটিপি যাচাই করুন",
    forgotPass: "পাসওয়ার্ড ভুলে গেছেন?",
    resetPass: "পাসওয়ার্ড রিসেট",
    sendResetLink: "রিসেট লিংক পাঠান",
    updatePass: "পাসওয়ার্ড আপডেট করুন"
  }
};

function getCurrentLang() {
  return localStorage.getItem('spendly_lang') || 'en';
}

function setLanguage(lang) {
  localStorage.setItem('spendly_lang', lang);
  applyTranslations();
}

function applyTranslations() {
  const currentLang = getCurrentLang();
  const dict = translations[currentLang];

  document.querySelectorAll('[data-i18n]').forEach(elem => {
    const key = elem.getAttribute('data-i18n');
    if (dict[key]) {
      if (elem.tagName === 'INPUT' && elem.hasAttribute('placeholder')) {
        elem.placeholder = dict[key];
      } else {
        elem.innerText = dict[key];
      }
    }
  });

  const langBtn = document.getElementById('lang-toggle-btn');
  if (langBtn) {
    langBtn.innerText = currentLang === 'en' ? '🇧🇩 বাংলা' : '🇬🇧 English';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  const langBtn = document.getElementById('lang-toggle-btn');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      const newLang = getCurrentLang() === 'en' ? 'bn' : 'en';
      setLanguage(newLang);
    });
  }
});
