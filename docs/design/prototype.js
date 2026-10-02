// Birthday Side Quests prototype interactions. No dependencies.
// CSP-safe: no inline styles in markup, only element.style.setProperty.
(() => {
  const params = new URLSearchParams(location.search);
  const root = document.documentElement;
  const accent = params.get('accent');
  if (accent === 'plum' || accent === 'terracotta') root.classList.add('accent-' + accent);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const live = document.getElementById('live');

  // ---- progress ring ----
  const progress = document.querySelector('.progress');
  const ringFill = document.querySelector('.ring__fill');
  const claimedEl = document.querySelector('.js-claimed');
  let claimed = Number(progress.dataset.claimed);
  const total = Number(progress.dataset.total);
  const setRing = () => {
    ringFill.style.setProperty('stroke-dashoffset', String(100 - (claimed / total) * 100));
    claimedEl.textContent = String(claimed);
    progress.setAttribute('aria-label', `${claimed} of ${total} quests claimed`);
    document.body.classList.toggle('is-lit', claimed > 0);
  };
  requestAnimationFrame(setRing);

  // ---- tabs ----
  const tabs = [...document.querySelectorAll('.tab')];
  const thumb = document.querySelector('.tabs__thumb');
  const select = (i, focus) => {
    tabs.forEach((t, j) => {
      t.setAttribute('aria-selected', String(i === j));
      t.tabIndex = i === j ? 0 : -1;
    });
    thumb.style.setProperty('transform', `translateX(${i * 100}%)`);
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') select((i + 1) % tabs.length, true);
      if (e.key === 'ArrowLeft') select((i - 1 + tabs.length) % tabs.length, true);
    });
  });

  // ---- entry choreography: header, then cards staggered 70ms ----
  const revealables = [
    ...document.querySelectorAll('.results__head, .tabs, .card, .mapwrap'),
  ];
  if (!reduced && !params.has('static')) {
    revealables.forEach((el) => el.classList.add('reveal'));
    revealables.forEach((el, i) => {
      el.style.setProperty('transition-delay', `${120 + i * 70}ms`);
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    });
  }

  // ---- celebration ----
  const confetti = document.querySelector('.confetti');
  const PALETTE = ['', 'strip--tint', '', 'strip--ink'];
  function burst(fromEl) {
    if (reduced) return [];
    const r = fromEl.getBoundingClientRect();
    const ox = r.left + r.width / 2;
    const oy = r.top + r.height / 2;
    const anims = [];
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('span');
      s.className = 'strip ' + PALETTE[i % PALETTE.length];
      confetti.appendChild(s);
      // deterministic fan: 12 strips spread over a 150deg arc, upward
      const angle = (-158 + (i / 11) * 136) * (Math.PI / 180);
      const dist = 70 + ((i * 37) % 64);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const spin = (i % 2 ? 1 : -1) * (160 + ((i * 53) % 200));
      const a = s.animate(
        [
          { transform: `translate(${ox}px, ${oy}px) rotate(0deg) scale(.6)`, opacity: 0, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
          { transform: `translate(${ox + dx * 0.7}px, ${oy + dy * 0.7}px) rotate(${spin * 0.4}deg) scale(1)`, opacity: 1, offset: 0.3, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
          { transform: `translate(${ox + dx}px, ${oy + dy + 40}px) rotate(${spin * 0.8}deg) scale(1)`, opacity: 1, offset: 0.7, easing: 'cubic-bezier(0.5, 0, 0.75, 0)' },
          { transform: `translate(${ox + dx * 1.1}px, ${oy + dy + 120}px) rotate(${spin}deg) scale(.9)`, opacity: 0 },
        ],
        { duration: 1300 + (i % 4) * 90, easing: 'linear', fill: 'forwards' }
      );
      a.finished.then(() => s.remove());
      anims.push(a);
    }
    return anims;
  }

  let toastEl;
  function toast(text) {
    toastEl?.remove();
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.innerHTML = '<span class="toast__mark" aria-hidden="true"><svg viewBox="0 0 40 40"><path class="t-flame" d="M20 5c2.4 2.8 3.3 4.7 3.3 6.3a3.3 3.3 0 0 1-6.6 0c0-1.6.9-3.5 3.3-6.3z"/><path class="t-line" d="M20 14.6v2.6"/><rect class="t-line" x="15.5" y="17.2" width="9" height="15" rx="2"/></svg></span>';
    toastEl.append(text);
    document.body.appendChild(toastEl);
    if (!reduced) {
      toastEl.animate(
        [{ transform: 'translate(-50%, 24px)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1 }],
        { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
      );
    }
    setTimeout(() => toastEl?.remove(), 3200);
  }

  document.querySelectorAll('.claim__input').forEach((input) => {
    input.addEventListener('change', () => {
      const card = input.closest('.card');
      const name = card.querySelector('h2').textContent;
      card.classList.toggle('is-claimed', input.checked);
      const pin = document.querySelector(`.pin--${card.dataset.pin}`);
      if (pin) {
        pin.classList.toggle('is-claimed', input.checked);
        const mono = pin.querySelector('.pin__mono');
        if (input.checked) { mono.dataset.mono = mono.textContent; mono.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>'; }
        else if (mono.dataset.mono) mono.textContent = mono.dataset.mono;
      }
      input.nextElementSibling.nextElementSibling.textContent = input.checked ? 'Claimed' : 'Mark claimed';
      claimed += input.checked ? 1 : -1;
      setRing();
      if (input.checked) {
        const box = input.nextElementSibling;
        burst(box);
        const mark = document.querySelector('.mark');
        mark.classList.remove('is-igniting'); void mark.getBoundingClientRect(); mark.classList.add('is-igniting');
        if (!reduced) {
          box.animate([{ transform: 'scale(.82)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
            { duration: 520, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
        }
        toast(`${name} claimed. ${claimed} of ${total} done, another candle lit.`);
        live.textContent = `${name} marked as claimed. ${claimed} of ${total} quests claimed.`;
      } else {
        live.textContent = `${name} unmarked. ${claimed} of ${total} quests claimed.`;
      }
    });
  });

  // ---- map pin <-> card link ----
  document.querySelectorAll('.pin--brand').forEach((pin, i) => {
    pin.addEventListener('click', () => {
      document.querySelectorAll('.pin--brand').forEach((p) => p.classList.toggle('is-active', p === pin));
      document.querySelectorAll('.card').forEach((c) => c.classList.toggle('is-active', c.dataset.pin === String(i + 1)));
    });
  });

  // ---- screenshot helper: ?state=done freezes the celebration mid-flight ----
  if (params.get('state') === 'done') {
    window.addEventListener('load', () => {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in'));
      const input = document.querySelector('.card .claim__input');
      input.closest('.card').scrollIntoView({ block: 'center', behavior: 'instant' });
      setTimeout(() => {
        input.checked = true;
        input.dispatchEvent(new Event('change'));
        setTimeout(() => {
          document.getAnimations().forEach((a) => {
            if (a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('strip')) {
              a.pause(); a.currentTime = 400;
            }
          });
          document.body.dataset.ready = '1';
        }, 60);
      }, 300);
    });
  }
})();
