// Supabase চেক
if (typeof supabase === 'undefined') {
  alert("Supabase SDK ঠিকভাবে লোড হয়নি! HTML ফাইলে Supabase CDN লিঙ্ক চেক করুন।");
}

// Helper Function
const getEl = (id) => document.getElementById(id);

// --- ১. সাইনআপ (SIGNUP) ---
const signupForm = getEl('signup-form') || getEl('register-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    alert("সাইনআপ প্রসেস শুরু হচ্ছে..."); // সঙ্গে সঙ্গে ক্লিক ফিডব্যাক দেবে

    const fullName = getEl('fullname')?.value || '';
    const email = getEl('email')?.value || '';
    const password = getEl('password')?.value || '';
    const currency = getEl('currency')?.value || 'BDT';

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, currency } }
      });

      if (error) {
        alert("সাইনআপ এরর: " + error.message);
      } else {
        alert("সাইনআপ কোড পাঠানো হয়েছে! এবার OTP দিন।");
        window.userRegEmail = email;
        
        // OTP Step দেখানো
        if (getEl('signup-step') && getEl('otp-step')) {
          getEl('signup-step').classList.add('hidden');
          getEl('otp-step').classList.remove('hidden');
        }
      }
    } catch (err) {
      alert("সমস্যা হয়েছে: " + err.message);
    }
  });
}

// --- ২. ওটিপি ভেরিফিকেশন (OTP VERIFICATION) ---
const otpForm = getEl('otp-form');
if (otpForm) {
  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = getEl('otp-code')?.value;
    const email = window.userRegEmail || getEl('email')?.value;

    alert("OTP ভেরিফাই করা হচ্ছে...");

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup'
      });

      if (error) {
        alert("ভুল OTP: " + error.message);
      } else {
        alert("ভেরিফিকেশন সফল! ড্যাশবোর্ডে নিয়ে যাওয়া হচ্ছে...");
        window.location.href = 'dashboard.html';
      }
    } catch (err) {
      alert("সমস্যা হয়েছে: " + err.message);
    }
  });
}

// --- ৩. লগইন (LOGIN) ---
const loginForm = getEl('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    alert("লগইন করা হচ্ছে...");

    const email = getEl('login-email')?.value;
    const password = getEl('login-password')?.value;

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        alert("লগইন ভুল হয়েছে: " + error.message);
      } else {
        alert("লগইন সফল!");
        window.location.href = 'dashboard.html';
      }
    } catch (err) {
      alert("সমস্যা হয়েছে: " + err.message);
    }
  });
}

// --- ৪. ফরগেট পাসওয়ার্ড (FORGOT PASSWORD) ---
const forgotForm = getEl('forgot-form');
if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    alert("পাসওয়ার্ড রিসেট ইমেইল পাঠানো হচ্ছে...");

    const email = getEl('reset-email')?.value;
    const redirectUrl = window.location.origin + window.location.pathname.replace('forgot-password.html', 'update-password.html');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        alert("ইমেইল পাঠানো যায়নি: " + error.message);
      } else {
        alert("আপনার ইমেইলে লিঙ্ক পাঠানো হয়েছে! দয়া করে ইমেলের Inbox এবং Spam ফোল্ডার চেক করুন।");
      }
    } catch (err) {
      alert("সমস্যা হয়েছে: " + err.message);
    }
  });
}
