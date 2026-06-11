// =============================================
// CASMA PACKAGING — Main JS
// =============================================

document.addEventListener('DOMContentLoaded', () => {

  // --- Mobile Nav ---
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  const mobileClose = document.getElementById('mobileClose');
  const mobileOverlay = document.getElementById('mobileOverlay');

  function openNav() {
    mobileNav.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeNav() {
    mobileNav.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (hamburger) hamburger.addEventListener('click', openNav);
  if (mobileClose) mobileClose.addEventListener('click', closeNav);
  if (mobileOverlay) mobileOverlay.addEventListener('click', closeNav);

  // --- Active nav link ---
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .mobile-drawer a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // --- Contact form ---
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', e => {
      e.preventDefault();
      const btn = contactForm.querySelector('button[type="submit"]');
      const orig = btn.textContent;
      btn.textContent = 'Sending...';
      btn.disabled = true;

      // Formspree submission
      const data = new FormData(contactForm);
      fetch(contactForm.action, {
        method: 'POST',
        body: data,
        headers: { 'Accept': 'application/json' }
      })
      .then(r => {
        if (r.ok) {
          showToast('Message sent! We\'ll be in touch shortly.', 'success');
          contactForm.reset();
        } else {
          showToast('Something went wrong. Please call or email us directly.', 'error');
        }
      })
      .catch(() => showToast('Something went wrong. Please call or email us directly.', 'error'))
      .finally(() => {
        btn.textContent = orig;
        btn.disabled = false;
      });
    });
  }

  // --- Toast notification ---
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; bottom: 2rem; right: 2rem; z-index: 9999;
      background: ${type === 'success' ? '#3a5a3e' : '#c0392b'};
      color: white; padding: 1rem 1.5rem; border-radius: 6px;
      font-family: Inter, sans-serif; font-size: 0.9rem;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      animation: fadeUp 0.3s ease;
      max-width: 340px;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    const style = document.createElement('style');
    style.textContent = '@keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }';
    document.head.appendChild(style);

    setTimeout(() => toast.remove(), 5000);
  }

  // --- Scroll reveal ---
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.category-card, .product-card, .why-card, .timeline-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
  });

});
