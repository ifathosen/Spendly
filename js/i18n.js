const translations = {
  en: {
    brandName: "Spendly",
    navFeatures: "Features",
    navPricing: "Pricing",
    navAbout: "About",
    signIn: "Sign In",
    signUp: "Sign Up",
    heroTitle: "Smart Expense Tracking Made Simple",
    heroSubtitle: "Take complete control of your personal finances with real-time balance tracking, detailed category analytics, and seamless data sync.",
    getStarted: "Get Started Free",
    learnMore: "Learn More",
    statUsers: "Active Users",
    statSaved: "Money Saved",
    statRating: "User Rating",
    menuDashboard: "Dashboard",
    menuTransactions: "Transactions",
    menuQuickAdd: "Quick Add",
    menuAnalytics: "Analytics",
    menuProfile: "Profile",
    totalBalance: "Total Balance",
    totalIncome: "Total Income",
    totalExpense: "Total Expense",
    netFunds: "Net available funds",
    earnedPeriod: "Total earned this period",
    spentPeriod: "Total spent this period",
    recentTransactions: "Recent Transactions",
    manageRecords: "Manage and view your financial records",
    searchPlaceholder: "Search transactions...",
    addTransaction: "Add Transaction",
    editTransaction: "Edit Transaction",
    saveTransaction: "Save Transaction",
    updateTransaction: "Update Transaction",
    titleLabel: "Title",
    amountLabel: "Amount",
    typeLabel: "Type",
    categoryLabel: "Category",
    income: "Income",
    expense: "Expense",
    logout: "Logout",
    noData: "No transactions recorded yet.",
    cancel: "Cancel",
    confirmDelete: "Are you sure you want to delete this transaction?"
  },
  bn: {
    brandName: "স্পেন্ডলি",
    navFeatures: "ফিচারসমূহ",
    navPricing: "মূল্যতালিকা",
    navAbout: "আমাদের সম্পর্কে",
    signIn: "লগইন",
    signUp: "সাইনআপ",
    heroTitle: "সহজ ও স্মার্ট উপায়ে নিজের খরচের হিসাব রাখুন",
    heroSubtitle: "রিয়েল-টাইম ব্যালেন্স ট্র্যাকিং, ক্যাটাগরিভিত্তিক বিশ্লেষণ এবং নিরাপদ ডাটা সিঙ্ক সহ আপনার আর্থিক খরচের ওপর পূর্ণ নিয়ন্ত্রণ নিন।",
    getStarted: "বিনামূল্যে শুরু করুন",
    learnMore: "আরও জানুন",
    statUsers: "সক্রিয় ব্যবহারকারী",
    statSaved: "সঞ্চয়কৃত অর্থ",
    statRating: "ইউজার রেটিং",
    menuDashboard: "ড্যাশবোর্ড",
    menuTransactions: "ট্রানজেকশন",
    menuQuickAdd: "যোগ করুন",
    menuAnalytics: "অ্যানালিটিক্স",
    menuProfile: "প্রোফাইল",
    totalBalance: "মোট ব্যালেন্স",
    totalIncome: "মোট আয়",
    totalExpense: "মোট ব্যয়",
    netFunds: "অবশিষ্ট তহবিল",
    earnedPeriod: "মোট অর্জিত আয়",
    spentPeriod: "মোট খরচকৃত অর্থ",
    recentTransactions: "সাম্প্রতিক লেনদেন",
    manageRecords: "আপনার আর্থিক হিসাবগুলো দেখুন ও নিয়ন্ত্রণ করুন",
    searchPlaceholder: "লেনদেন খুঁজুন...",
    addTransaction: "নতুন লেনদেন যোগ করুন",
    editTransaction: "লেনদেন এডিট করুন",
    saveTransaction: "সংরক্ষণ করুন",
    updateTransaction: "আপডেট করুন",
    titleLabel: "বিবরণ/টাইটেল",
    amountLabel: "পরিমাণ",
    typeLabel: "ধরন",
    categoryLabel: "ক্যাটাগরি",
    income: "আয় (Income)",
    expense: "ব্যয় (Expense)",
    logout: "লগআউট",
    noData: "এখনো কোনো লেনদেন রেকর্ড করা হয়নি।",
    cancel: "বাতিল",
    confirmDelete: "আপনি কি নিশ্চিতভাবে এই লেনদেনটি মুছে ফেলতে চান?"
  }
};

let currentLang = localStorage.getItem('spendly_lang') || 'en';

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('spendly_lang', lang);
  applyTranslations();
}

function applyTranslations() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[currentLang] && translations[currentLang][key]) {
      if (el.tagName === 'INPUT' && el.getAttribute('placeholder')) {
        el.placeholder = translations[currentLang][key];
      } else {
        el.innerText = translations[currentLang][key];
      }
    }
  });

  const langBtn = document.getElementById('lang-toggle-text');
  if (langBtn) {
    langBtn.innerText = currentLang === 'en' ? 'বাংলা' : 'English';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
});
