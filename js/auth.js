let userRegEmail = '';

const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('fullname').value;
    const email = document.getElementById('email').value;
    const currency = document.getElementById('currency').value;
    const password = document.getElementById('password').value;

    userRegEmail = email;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, currency } }
    });

    if (error) {
      alert(error.message);
    } else {
      document.getElementById('signup-step').classList.add('hidden');
      document.getElementById('otp-step').classList.remove('hidden');
    }
  });
}

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
      await supabase.from('profiles').insert([{
        id: user.id,
        full_name: user.user_metadata.full_name,
        currency: user.user_metadata.currency
      }]);

      window.location.href = 'dashboard.html';
    }
  });
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      alert(error.message);
    } else {
      window.location.href = 'dashboard.html';
    }
  });
}
