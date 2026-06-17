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

  // ---------- 6. Grano de película (global) ----------
  const grain = document.createElement('div');
  grain.className = 'tm-fx-grain';
  grain.setAttribute('aria-hidden', 'true');
  document.body.appendChild(grain);

  // ---------- 1. Hero: escena oscura + foco "linterna" (SOLO escritorio) ----------
  // En móvil/táctil no hay ratón, así que NO se aplica: el hero se queda con su
  // foto normal (sin oscurecer). La clase tm-fx-hero activa el oscurecido en CSS.
  const hero = document.querySelector<HTMLElement>('.hero');
  if (hero && fine) {
    hero.classList.add('tm-fx-hero');
    // Orden = z-index: mesh(1) y relleno(1) detrás, foco(2), haz(3).
    for (const cls of ['tm-fx-mesh', 'tm-fx-fill', 'tm-fx-spot', 'tm-fx-halo']) {
      const layer = document.createElement('div');
      layer.className = cls;
      layer.setAttribute('aria-hidden', 'true');
      hero.appendChild(layer);
    }
    // Posición del foco: en píxeles (para el canvas de motas) y en % (para CSS).
    let mx = -9999, my = -9999;
    let raf = 0;
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      mx = e.clientX - r.left; my = e.clientY - r.top;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        hero.style.setProperty('--mx', `${(mx / r.width) * 100}%`);
        hero.style.setProperty('--my', `${(my / r.height) * 100}%`);
        raf = 0;
      });
    }, { passive: true });

    // ---------- 1. Motas de polvo en el haz (canvas de partículas aleatorias) ----------
    // Posición, tamaño y parpadeo al azar; solo se dibujan dentro del foco.
    if (!reduce) {
      const canvas = document.createElement('canvas');
      canvas.className = 'tm-fx-dust';
      canvas.setAttribute('aria-hidden', 'true');
      hero.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let W = 0, H = 0;
        const resize = () => {
          const r = hero.getBoundingClientRect();
          W = r.width; H = r.height;
          canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
          canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        addEventListener('resize', resize, { passive: true });

        const P = Array.from({ length: 105 }, () => ({
          x: Math.random(), y: Math.random(),
          r: 0.8 + Math.random() * 2.4,
          vy: 4 + Math.random() * 11,
          vx: (Math.random() - 0.5) * 7,
          ph: Math.random() * Math.PI * 2,
          tw: 0.5 + Math.random() * 1.6,
          a: 0.55 + Math.random() * 0.45,
        }));
        const R = 165; // radio visible del haz (px)
        let onScreen = true;
        new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; }).observe(hero);
        let last = 0;
        const frame = (t: number) => {
          requestAnimationFrame(frame);
          if (!onScreen) { last = t; return; }
          const dt = last ? Math.min((t - last) / 1000, 0.05) : 0; last = t;
          ctx.clearRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'lighter';
          for (const p of P) {
            p.y -= (p.vy * dt) / H; p.x += (p.vx * dt) / W;
            if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
            if (p.x < -0.02) p.x = 1.02; else if (p.x > 1.02) p.x = -0.02;
            const px = p.x * W, py = p.y * H;
            const d = Math.hypot(px - mx, py - my);
            if (d > R) continue;
            const tw = 0.7 + 0.3 * Math.sin((t / 1000) * p.tw + p.ph);
            ctx.globalAlpha = Math.max(0, p.a * (1 - d / R) * tw);
            ctx.beginPath();
            ctx.arc(px, py, p.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgb(255, 240, 210)';
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        };
        requestAnimationFrame(frame);
      }
    }
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
