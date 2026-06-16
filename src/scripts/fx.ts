/* ============================================================
   TEATRE MUNTANER · capa de efectos visuales (JS, vanilla)
   ------------------------------------------------------------
   Mejora progresiva: si esto no corre, la web funciona igual.
   Solo actúa cuando <html> tiene la clase `tm-fx-on` (la pone el
   bootstrap de BaseLayout según la constante FX_ENABLED o ?fx=1).
   Sin dependencias de red ni librerías nuevas.
   ============================================================ */
const root = document.documentElement;
if (root.classList.contains('tm-fx-on')) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // Telón de intro: poner en false para quitar SOLO el telón (el resto sigue).
  const CURTAIN = true;
  let curtainWillPlay = false;

  // ---------- 6. Grano de película (global) ----------
  const grain = document.createElement('div');
  grain.className = 'tm-fx-grain';
  grain.setAttribute('aria-hidden', 'true');
  document.body.appendChild(grain);

  // ---------- 1. Hero: capas (mesh / foco / halo) + seguimiento ----------
  const hero = document.querySelector<HTMLElement>('.hero');
  if (hero) {
    for (const cls of ['tm-fx-mesh', 'tm-fx-spot', 'tm-fx-halo']) {
      const layer = document.createElement('div');
      layer.className = cls;
      layer.setAttribute('aria-hidden', 'true');
      hero.appendChild(layer);
    }
    // El foco sigue al cursor solo en escritorio; en táctil queda centrado.
    if (fine && !reduce) {
      let raf = 0;
      hero.addEventListener('pointermove', (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          const r = hero.getBoundingClientRect();
          hero.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
          hero.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
          raf = 0;
        });
      }, { passive: true });
    }
  }

  // ---------- Telón de intro (solo en la home, una vez por sesión) ----------
  // Decorativo y con pointer-events:none → no condiciona que se vea el hero
  // (el título tiene su propio failsafe). Se salta con reduced-motion.
  if (CURTAIN && hero && !reduce) {
    try { curtainWillPlay = !sessionStorage.getItem('tm-fx-curtain'); } catch (e) { curtainWillPlay = true; }
  }
  if (curtainWillPlay) {
    try { sessionStorage.setItem('tm-fx-curtain', '1'); } catch (e) { /* sesión privada */ }
    const curtain = document.createElement('div');
    curtain.className = 'tm-fx-curtain';
    curtain.setAttribute('aria-hidden', 'true');
    curtain.innerHTML =
      '<div class="tm-fx-cenefa-oro"></div><div class="tm-fx-cenefa"></div>' +
      '<div class="tm-fx-panel izq"></div><div class="tm-fx-panel der"></div>';
    document.body.appendChild(curtain);
    const folds = (panel: Element | null, n: number) => {
      if (!panel) return;
      const w = 100 / n;
      for (let k = 0; k < n; k++) {
        const f = document.createElement('div');
        f.className = 'tm-fx-fold';
        f.style.left = `${k * w - 0.6}%`;
        f.style.width = `${w + 1.4}%`;
        f.style.animationDelay = `${k * 0.18}s`;
        panel.appendChild(f);
      }
    };
    folds(curtain.querySelector('.izq'), 9);
    folds(curtain.querySelector('.der'), 9);
    requestAnimationFrame(() => setTimeout(() => curtain.classList.add('is-open'), 300));
    const removeCurtain = () => { if (curtain.parentNode) curtain.remove(); };
    setTimeout(removeCurtain, 2800);   // tras abrirse
    setTimeout(removeCurtain, 5000);   // failsafe absoluto: nunca se queda
  }

  // ---------- 2. Tipografía cinética del titular ----------
  const title = document.querySelector<HTMLElement>('.hero__title');
  if (title) {
    // Astro añade atributos scoped al <br> (data-astro-cid-…), así que el
    // patrón admite cualquier atributo: <br>, <br/>, <br data-…>.
    const lines = title.innerHTML.split(/<br\b[^>]*>/i);
    // Texto de cada línea, ya sin etiquetas, para reconstruir el aria-label.
    const lineTexts = lines.map((h) => {
      const t = document.createElement('div');
      t.innerHTML = h;
      return (t.textContent || '').trim();
    });
    // El texto real sigue siendo legible por lectores de pantalla (con espacio
    // entre líneas, que el <br> no aporta).
    title.setAttribute('aria-label', lineTexts.filter(Boolean).join(' '));
    title.innerHTML = '';
    let i = 0;
    for (const lineText of lineTexts) {
      const lineEl = document.createElement('span');
      lineEl.className = 'tm-fx-line';
      for (const ch of lineText) {
        const s = document.createElement('span');
        s.className = 'tm-fx-char';
        s.setAttribute('aria-hidden', 'true');
        s.style.setProperty('--i', String(i++));
        if (ch === ' ') s.innerHTML = '&nbsp;';
        else s.textContent = ch;
        lineEl.appendChild(s);
      }
      title.appendChild(lineEl);
    }
    if (reduce) {
      title.classList.add('is-lit');
    } else if (curtainWillPlay) {
      // Si hay telón, el título se revela justo cuando el telón se abre.
      setTimeout(() => title.classList.add('is-lit'), 2300);
      setTimeout(() => title.classList.add('is-lit'), 3500); // failsafe
    } else {
      const lit = () => requestAnimationFrame(() => title.classList.add('is-lit'));
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((ents) => {
          for (const en of ents) if (en.isIntersecting) { lit(); io.disconnect(); }
        }, { threshold: 0.1 });
        io.observe(title);
        setTimeout(() => title.classList.add('is-lit'), 1500); // failsafe
      } else {
        lit();
      }
    }
  }

  // ---------- 3. Botones magnéticos (CTAs del hero) ----------
  if (fine && !reduce) {
    document.querySelectorAll<HTMLElement>('.hero__cta .btn').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        btn.style.transform = `translate(${dx * 0.3}px, ${dy * 0.4}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });
  }

  // ---------- 4. Rótulo de neón sobre la marquesina ----------
  const marquee = document.querySelector('.marquee');
  if (marquee && marquee.parentNode) {
    const neon = document.createElement('div');
    neon.className = 'tm-fx-neon';
    neon.setAttribute('aria-hidden', 'true');
    neon.innerHTML = '<span class="tm-fx-neon__txt">★ La casa de la comedia ★</span>';
    marquee.parentNode.insertBefore(neon, marquee);
  }

  // ---------- 5. Cartelera: stagger del reveal + tilt + failsafe ----------
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.show-card'));
  cards.forEach((card, idx) => card.style.setProperty('--i', String(idx % 8)));
  // Failsafe: si el observer no dispara, mostrarlas igualmente a los 3 s.
  setTimeout(() => cards.forEach((c) => c.classList.add('is-visible')), 3000);
  if (fine && !reduce) {
    cards.forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.classList.add('tm-fx-tilting');
        card.style.transform = `perspective(800px) rotateY(${px * 12}deg) rotateX(${-py * 12}deg) translateZ(6px)`;
      });
      card.addEventListener('pointerleave', () => {
        card.classList.remove('tm-fx-tilting');
        card.style.transform = '';
      });
    });
  }
}
