/**
 * @file Confetti.js
 * Dependency-free canvas confetti burst. No external libraries.
 */
const COLORS = ['#ff7a5c', '#4fc3f7', '#ffd93d', '#ff6fa5', '#6bcb77'];

/**
 * Fire a confetti burst that auto-removes itself when finished.
 * @param {HTMLElement} [container] defaults to document.body; canvas is
 *   always positioned fixed/full-viewport regardless of container size.
 * @param {{particleCount?: number, durationMs?: number}} [opts]
 */
export function burst(container = document.body, opts = {}) {
  const { particleCount = 140, durationMs = 2600 } = opts;

  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '400';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const target = container === document.body ? document.body : document.body;
  target.append(canvas);

  const w = window.innerWidth;
  const h = window.innerHeight;

  const particles = Array.from({ length: particleCount }, () => ({
    x: Math.random() * w,
    y: -20 - Math.random() * h * 0.4,
    size: 6 + Math.random() * 8,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    speedY: 2 + Math.random() * 3.5,
    speedX: -1.5 + Math.random() * 3,
    rotation: Math.random() * 360,
    rotationSpeed: -6 + Math.random() * 12,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
  }));

  const startTime = performance.now();
  let rafId = null;

  function frame(now) {
    const elapsed = now - startTime;
    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.x += p.speedX;
      p.y += p.speedY;
      p.rotation += p.rotationSpeed;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      const fadeStart = durationMs * 0.7;
      ctx.globalAlpha = elapsed > fadeStart ? Math.max(0, 1 - (elapsed - fadeStart) / (durationMs - fadeStart)) : 1;

      if (p.shape === 'rect') {
        ctx.beginPath();
        ctx.roundRect(-p.size / 2, -p.size / 4, p.size, p.size / 2, 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (elapsed < durationMs) {
      rafId = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(rafId);
      canvas.remove();
    }
  }

  rafId = requestAnimationFrame(frame);
}
