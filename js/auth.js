document.addEventListener('DOMContentLoaded', async () => {
  if (dbClient) {
    const { data: { session } } = await dbClient.auth.getSession();
    if (session) {
      window.location.href = 'dashboard.html';
    }
  }
});

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { data, error } = await dbClient.auth.signInWithPassword({ email, password });
    if (error) {
      alert('Login Failed: ' + error.message);
    } else {
      window.location.href = 'dashboard.html';
    }
  });
}

const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    const { data, error } = await dbClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });

    if (error) {
      alert('Signup Failed: ' + error.message);
    } else {
      if (data.user) {
        await dbClient.from('profiles').insert([{
          id: data.user.id,
          full_name: fullName,
          currency: 'SAR ﷼'
        }]);
      }
      window.location.href = 'dashboard.html';
    }
  });
}
