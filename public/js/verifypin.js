document.getElementById('verifyPinButton').addEventListener('click', async () => {
  const pinInputEl = document.getElementById('pinInput');
  const pinErrorEl = document.getElementById('pinError');
  const msgDiv = document.getElementById('messages'); // Update message area
  pinErrorEl.textContent = '';
  msgDiv.textContent = '';

  const pinVal = pinInputEl.value.trim();
  if (!pinVal) {
    pinErrorEl.textContent = 'Please enter your PIN.';
    return;
  }

  try {
    const sessionResp = await fetch('/api/session');
    if (!sessionResp.ok) throw new Error('Failed to get session');

    const sessionData = await sessionResp.json();
    if (!sessionData.username) {
      pinErrorEl.textContent = 'Session expired. Please log in again.';
      setTimeout(() => window.location.href = '/login.html', 1500);
      return;
    }

    const verifyResp = await fetch('/api/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: sessionData.username, pin: pinVal })
    });

    if (verifyResp.ok) {document.getElementById('verifyPinButton').addEventListener('click', async () => {
  const pinInputEl = document.getElementById('pinInput');
  const pinErrorEl = document.getElementById('pinError');
  const msgDiv = document.getElementById('messages');
  pinErrorEl.textContent = '';
  msgDiv.textContent = '';

  const pinVal = pinInputEl.value.trim();
  if (!pinVal) {
    pinErrorEl.textContent = 'Please enter your PIN.';
    return;
  }

  try {
    const sessionResp = await fetch('/api/session');
    if (!sessionResp.ok) throw new Error('Failed to get session');

    const sessionData = await sessionResp.json();
    if (!sessionData.username) {
      pinErrorEl.textContent = 'Session expired. Please log in again.';
      setTimeout(() => window.location.href = '/login.html', 1500);
      return;
    }

    const verifyResp = await fetch('/api/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: sessionData.username, pin: pinVal })
    });

    if (verifyResp.ok) {
      // Personalized welcome message
      msgDiv.textContent = `Identity confirmed. Welcome, ${sessionData.username}! Redirecting to chat...`;
      pinErrorEl.textContent = '';
      pinInputEl.value = '';
      document.getElementById('pinModal').classList.remove('active');
      setTimeout(() => {
        window.location.href = '/chat.html';
      }, 3000);
    } else {
      const errorData = await verifyResp.json();
      pinErrorEl.textContent = errorData.error || 'Invalid PIN. Please try again.';
      pinInputEl.value = '';
      pinInputEl.focus();
    }
  } catch (err) {
    console.error('Error in PIN verification:', err);
    pinErrorEl.textContent = 'Server error. Please try again later.';
  }
});

      pinErrorEl.textContent = '';
      pinInputEl.value = '';
      document.getElementById('pinModal').classList.remove('active');
      // Show personalized welcome message
      msgDiv.textContent = `Identity confirmed. Welcome, ${sessionData.username}! Redirecting to chat...`;
      setTimeout(() => {
        window.location.href = '/chat.html';
      }, 3000);
    } else {
      const errorData = await verifyResp.json();
      pinErrorEl.textContent = errorData.error || 'Invalid PIN. Please try again.';
      pinInputEl.value = '';
      pinInputEl.focus();
    }
  } catch (err) {
    console.error('Error in PIN verification:', err);
    pinErrorEl.textContent = 'Server error. Please try again later.';
  }
});
