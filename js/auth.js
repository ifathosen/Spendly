let userRegEmail = '';

// Signup Logic
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('fullname').value;
    const email = document.getElementById('email').value;
    const currency = document.getElementById('currency').value;
    const password = document.getElementById('password').value;

    userRegEmail = email;
    const submitBtn = signupForm.querySelector('button[type="submit"]');
    submitBtn.innerText = "Processing...";
    submitBtn.disabled = true;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { 
        data: { full_name: fullName, currency } 
      }
    });

    if (error) {
      alert("Error: " + error.message);
      submitBtn.innerText = "Sign Up";
      submitBtn.disabled = false;
    } else {
      document.getElementById('signup-step').classList.add('hidden');
      document.getElementById('otp-step').classList.remove('hidden');
    }
  });
}

// OTP Logic
const otpForm = document.getElementById('otp-form');
if (otpForm) {
  otpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('otp-code').value;

    const { data, error } = await supabase.auth.verifyOtp({
      email: userRegEmail,
      token,
      type: 'signup'
    });

    if (error) {
      alert("Verification Failed: " + error.message);
    } else {
      const user = data.user;
      if (user) {
        await supabase.from('profiles').insert([{
          id: user.id,
          full_name: user.user_metadata.full_name,
          currency: user.user_metadata.currency
        }]);
      }
      window.location.href = 'dashboard.html';
    }
  });
}

// Login Logic
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      alert("Login Error: " + error.message);
    } else {
      window.location.href = 'dashboard.html';
    }
  });
}

// Forgot Password Logic
const forgotForm = document.getElementById('forgot-form');
if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reset-email').value;
    const msg = document.getElementById('reset-msg');
    msg.innerText = "Sending email...";
    msg.style.color = "blue";

    const redirectUrl = window.location.origin + window.location.pathname.replace('forgot-password.html', 'update-password.html');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });

    if (error) {
      msg.innerText = "Error: " + error.message;
      msg.style.color = "red";
    } else {
      msg.innerText = "Check your email inbox/spam folder for the reset link!";
      msg.style.color = "green";
    }
  });
}

// Update Password Logic
const updatePassForm = document.getElementById('update-pass-form');
if (updatePassForm) {
  updatePassForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('new-password').value;
    const msg = document.getElementById('update-msg');
    msg.innerText = "Updating...";
    msg.style.color = "blue";

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      msg.innerText = "Error: " + error.message;
      msg.style.color = "red";
    } else {
      msg.innerText = "Password updated! Redirecting to login...";
      msg.style.color = "green";
      setTimeout(() => { window.location.href = 'login.html'; }, 2500);
    }
  });
}
