// Helper Function
const getEl = (id) => document.getElementById(id);

// --- ১. সাইনআপ (SIGNUP) ---
const signupForm = getEl('signup-form') || getEl('register-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = getEl('fullname')?.value || '';
    const email = getEl('email')?.value || '';
    const password = getEl('password')?.value || '';
    const currency = getEl('currency')?.value || 'SAR ﷼';

    const submitBtn = signupForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.innerText = "Processing...";
      submitBtn.disabled = true;
    }

    try {
      const { data, error } = await window.sbClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, currency } }
      });

      if (error) {
        alert("সাইনআপ এরর: " + error.message);
        if (submitBtn) {
          submitBtn.innerText = "Sign Up";
          submitBtn.disabled = false;
        }
      } else {
        window.userRegEmail = email;
        if (getEl('signup-step') && getEl('otp-step')) {
          getEl('signup-step').classList.add('hidden');
          getEl('otp-step').classList.remove('hidden');
        }
      }
    } catch (err) {
      alert("সমস্যা হয়েছে: " + err.message);
      if (submitBtn) {
        submitBtn.innerText = "Sign Up";
        submitBtn.disabled = false;
      }
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

    try {
      const { data, error } = await window.sbClient.auth.verifyOtp({
        email,
        token,
        type: 'signup'
      });

      if (error) {
        alert("ভুল OTP: " + error.message);
      } else {
        const user = data.user;
        if (user) {
          await window.sbClient.from('profiles').insert([{
            id: user.id,
            full_name: user.user_metadata.full_name,
            currency: user.user_metadata.currency
          }]);
        }
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

    const email = getEl('login-email')?.value;
    const password = getEl('login-password')?.value;

    try {
      const { error } = await window.sbClient.auth.signInWithPassword({ email, password });

      if (error) {
        alert("লগইন ভুল হয়েছে: " + error.message);
      } else {
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

    const email = getEl('reset-email')?.value;
    const redirectUrl = window.location.origin + window.location.pathname.replace('forgot-password.html', 'update-password.html');

    try {
      const { error } = await window.sbClient.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        alert("ইমেইল পাঠানো যায়নি: " + error.message);
      } else {
        alert("আপনার ইমেইলে লিঙ্ক পাঠানো হয়েছে! দয়া করে Inbox এবং Spam ফোল্ডার চেক করুন।");
      }
    } catch (err) {
      alert("সমস্যা হয়েছে: " + err.message);
    }
  });
}
