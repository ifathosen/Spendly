const getEl = (id) => document.getElementById(id);

// 1. SIGNUP
const signupForm = getEl('signup-form') || getEl('register-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!dbClient) {
      alert('Supabase connection failed. Please refresh the page.');
      return;
    }

    const fullName = getEl('fullname')?.value || '';
    const email = getEl('email')?.value || '';
    const password = getEl('password')?.value || '';
    const currency = getEl('currency')?.value || 'SAR ﷼';

    const submitBtn = signupForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.innerText = 'Processing...';
      submitBtn.disabled = true;
    }

    try {
      const { data, error } = await dbClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, currency } }
      });

      if (error) {
        alert('Signup Error: ' + error.message);
        if (submitBtn) {
          submitBtn.innerText = 'Sign Up';
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
      alert('Error: ' + err.message);
      if (submitBtn) {
        submitBtn.innerText = 'Sign Up';
        submitBtn.disabled = false;
      }
    }
  });
}

// 2. OTP VERIFICATION
const otpForm = getEl('otp-form');
if (otpForm) {
  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = getEl('otp-code')?.value;
    const email = window.userRegEmail || getEl('email')?.value;

    try {
      const { data, error } = await dbClient.auth.verifyOtp({
        email,
        token,
        type: 'signup'
      });

      if (error) {
        alert('OTP Verification Failed: ' + error.message);
      } else {
        const user = data.user;
        if (user) {
          await dbClient.from('profiles').insert([{
            id: user.id,
            full_name: user.user_metadata.full_name,
            currency: user.user_metadata.currency
          }]);
        }
        window.location.href = 'dashboard.html';
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}

// 3. LOGIN
const loginForm = getEl('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = getEl('login-email')?.value;
    const password = getEl('login-password')?.value;

    try {
      const { error } = await dbClient.auth.signInWithPassword({ email, password });

      if (error) {
        alert('Login Failed: ' + error.message);
      } else {
        window.location.href = 'dashboard.html';
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}

// 4. FORGOT PASSWORD
const forgotForm = getEl('forgot-form');
if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = getEl('reset-email')?.value;
    const redirectUrl = window.location.origin + window.location.pathname.replace('forgot-password.html', 'update-password.html');

    try {
      const { error } = await dbClient.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        alert('Reset Link Failed: ' + error.message);
      } else {
        alert('Password reset link sent! Check your email inbox or spam folder.');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });
}
