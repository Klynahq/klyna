(() => {
  const form = document.getElementById('contact-form');
  const success = document.getElementById('form-success');
  const errorBox = document.getElementById('form-error');
  const submitButton = document.getElementById('submit-btn');
  const ticketId = document.getElementById('ticket-id');
  const messageInput = document.getElementById('message');
  const characterCount = document.getElementById('char-count');
  if (!form || !success || !errorBox || !submitButton || !ticketId || !messageInput || !characterCount) return;

  messageInput.addEventListener('input', () => {
    characterCount.textContent = String(messageInput.value.length);
  });

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.classList.add('hidden');
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const subject = String(data.get('subject') || '');
    const message = String(data.get('message') || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Please enter a valid email address.');
      return;
    }
    if (message.length < 20 || message.length > 2000) {
      showError('Message must be between 20 and 2000 characters.');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Sending...';

    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, subject, message }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 429) {
          showError('Too many requests from your network. Please try again in an hour or email support@klyna.dev.');
          return;
        }
        throw new Error(result.error || 'Send failed.');
      }

      form.classList.add('hidden');
      success.classList.remove('hidden');
      ticketId.textContent = result.ticketId || 'pending';
    } catch {
      const body = encodeURIComponent(`Subject category: ${subject}\nFrom: ${email}\n\n${message}`);
      window.location.href = `mailto:support@klyna.dev?subject=${encodeURIComponent(`[${subject}] Klyna support`)}&body=${body}`;
      form.classList.add('hidden');
      success.classList.remove('hidden');
      ticketId.textContent = 'mailto-fallback';
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Send message';
    }
  });
})();
