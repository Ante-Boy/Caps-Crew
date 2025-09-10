document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const registerResultModal = document.getElementById('registerResultModal');
  const modalInstance = new bootstrap.Modal(registerResultModal);
  const registerModalIcon = document.getElementById('registerModalIcon');
  const registerModalText = document.getElementById('registerModalText');
  const modalCloseBtn = document.getElementById('modalCloseBtn');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const username = form.username.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;

    if (!username || !email || !password || !confirmPassword) {
      showModal('❌', 'Please fill out all fields.');
      return;
    }

    if (password !== confirmPassword) {
      showModal('❌', 'Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      showModal('❌', 'Password must be at least 6 characters.');
      return;
    }

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const result = await response.json();

      if (response.ok) {
        showModal('✅', 'Registration successful! Your account is pending admin approval.<br>Redirecting to login...', true);
      } else {
        showModal('❌', result.message || 'Registration failed.');
      }
    } catch (err) {
      showModal('❌', 'Network error. Please try again.');
      console.error('Registration error:', err);
    }
  });

  function showModal(icon, text, redirectToLogin = false) {
    registerModalIcon.innerHTML = icon;
    registerModalText.innerHTML = text;
    modalInstance.show();

    if (redirectToLogin) {
      modalCloseBtn.onclick = () => { window.location.href = 'login.html'; };
      setTimeout(() => { window.location.href = 'login.html'; }, 3000);
    } else {
      modalCloseBtn.onclick = () => { modalInstance.hide(); };
    }
  }
});
