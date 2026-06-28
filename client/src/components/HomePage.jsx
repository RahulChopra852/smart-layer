import { useEffect, useRef, useState, useCallback } from 'react';

const TAB_CONFIG = [
  { id: 'cro', label: 'CRO', icon: 'M3 3h18v18H3z M9 9h6v6H9z', desc: 'Conversion funnel', color: '#6366F1' },
  { id: 'ga-app', label: 'GA App', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', desc: 'App analytics', color: '#10B981' },
  { id: 'ga-web', label: 'GA Web', icon: 'M3 12h4l3-9 4 18 3-9h4', desc: 'Web analytics', color: '#3B82F6' },
  { id: 'vitals', label: 'Web Vitals', icon: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z', desc: 'Core web vitals', color: '#F59E0B' },
  { id: 'products', label: 'Products', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', desc: 'Product insights', color: '#EC4899' },
  { id: 'meta', label: 'Meta Ads', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a2 2 0 110 4 2 2 0 010-4zm0 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z', desc: 'Campaign reports', color: '#8B5CF6' },
  { id: 'anomalies', label: 'Anomalies', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-1.333-2.694-1.333-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z', desc: 'Unexplained movements', color: '#EF4444' },
  { id: 'abtests', label: 'AB Tests', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', desc: 'Experiment results', color: '#14B8A6' },
  { id: 'vwo', label: 'VWO', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', desc: 'VWO campaigns', color: '#F97316' },
];

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playHoverSound() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } catch {}
}

function playClickSound() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.05);
    osc.frequency.exponentialRampToValueAtTime(1600, ctx.currentTime + 0.15);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(600, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
    osc2.stop(ctx.currentTime + 0.25);
  } catch {}
}

function playAmbientPulse() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 0.5);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 2);
  } catch {}
}

function SpaceCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animId;
    let w, h;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const stars = [];
    for (let i = 0; i < 300; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.8 + 0.2,
        baseAlpha: Math.random() * 0.7 + 0.3,
        twinkleSpeed: Math.random() * 2 + 0.5,
        twinkleOffset: Math.random() * Math.PI * 2,
        // color tint: white, blue-white, warm-white
        color: [
          [255, 255, 255],
          [200, 220, 255],
          [255, 240, 220],
          [180, 200, 255],
          [255, 210, 200],
        ][Math.floor(Math.random() * 5)],
        // depth layer: 0=far, 1=mid, 2=near — affects drift speed
        depth: Math.random(),
      });
    }

    // Shooting stars
    const shootingStars = [];
    function spawnShootingStar() {
      shootingStars.push({
        x: Math.random() * w * 0.8,
        y: Math.random() * h * 0.4,
        len: Math.random() * 80 + 40,
        speed: Math.random() * 8 + 6,
        angle: (Math.random() * 0.3 + 0.2) * Math.PI, // angled downward-right
        alpha: 1,
        decay: Math.random() * 0.015 + 0.008,
      });
    }

    // Nebula blobs (static, rendered once to offscreen canvas for perf)
    const nebulaCanvas = document.createElement('canvas');
    nebulaCanvas.width = w;
    nebulaCanvas.height = h;
    const nCtx = nebulaCanvas.getContext('2d');

    const nebulae = [
      { x: w * 0.2, y: h * 0.3, rx: 250, ry: 180, color: [80, 40, 140], alpha: 0.04 },
      { x: w * 0.75, y: h * 0.6, rx: 300, ry: 200, color: [30, 60, 140], alpha: 0.035 },
      { x: w * 0.5, y: h * 0.15, rx: 200, ry: 120, color: [140, 40, 80], alpha: 0.025 },
      { x: w * 0.85, y: h * 0.2, rx: 160, ry: 140, color: [40, 100, 130], alpha: 0.03 },
    ];
    for (const n of nebulae) {
      const grad = nCtx.createRadialGradient(n.x, n.y, 0, n.x, n.y, Math.max(n.rx, n.ry));
      grad.addColorStop(0, `rgba(${n.color.join(',')}, ${n.alpha})`);
      grad.addColorStop(0.5, `rgba(${n.color.join(',')}, ${n.alpha * 0.4})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      nCtx.fillStyle = grad;
      nCtx.beginPath();
      nCtx.ellipse(n.x, n.y, n.rx, n.ry, 0, 0, Math.PI * 2);
      nCtx.fill();
    }

    let lastShootingTime = 0;

    function draw(t) {
      ctx.clearRect(0, 0, w, h);

      // Nebula layer
      ctx.drawImage(nebulaCanvas, 0, 0);

      // Stars
      for (const s of stars) {
        const twinkle = Math.sin(t * 0.001 * s.twinkleSpeed + s.twinkleOffset);
        const alpha = s.baseAlpha * (0.6 + 0.4 * twinkle);

        // Slow parallax drift
        s.x += s.depth * 0.02;
        if (s.x > w + 5) s.x = -5;

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.color[0]}, ${s.color[1]}, ${s.color[2]}, ${alpha})`;
        ctx.fill();

        // Bright stars get a cross-shaped glow
        if (s.r > 1.3 && alpha > 0.6) {
          const glowAlpha = alpha * 0.25;
          const glowLen = s.r * 4;
          ctx.strokeStyle = `rgba(${s.color[0]}, ${s.color[1]}, ${s.color[2]}, ${glowAlpha})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(s.x - glowLen, s.y);
          ctx.lineTo(s.x + glowLen, s.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(s.x, s.y - glowLen);
          ctx.lineTo(s.x, s.y + glowLen);
          ctx.stroke();
        }
      }

      // Spawn shooting stars frequently
      if (t - lastShootingTime > 600 + Math.random() * 1200) {
        spawnShootingStar();
        if (Math.random() > 0.5) spawnShootingStar();
        lastShootingTime = t;
      }

      // Draw shooting stars
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const ss = shootingStars[i];
        const dx = Math.cos(ss.angle) * ss.speed;
        const dy = Math.sin(ss.angle) * ss.speed;
        ss.x += dx;
        ss.y += dy;
        ss.alpha -= ss.decay;

        if (ss.alpha <= 0) {
          shootingStars.splice(i, 1);
          continue;
        }

        const tailX = ss.x - Math.cos(ss.angle) * ss.len;
        const tailY = ss.y - Math.sin(ss.angle) * ss.len;

        const grad = ctx.createLinearGradient(tailX, tailY, ss.x, ss.y);
        grad.addColorStop(0, `rgba(255, 255, 255, 0)`);
        grad.addColorStop(0.7, `rgba(200, 220, 255, ${ss.alpha * 0.4})`);
        grad.addColorStop(1, `rgba(255, 255, 255, ${ss.alpha})`);

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(ss.x, ss.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Bright head
        ctx.beginPath();
        ctx.arc(ss.x, ss.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${ss.alpha})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

function RotatingMoon() {
  const canvasRef = useRef(null);
  const textureRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const size = 450;
    canvas.width = size;
    canvas.height = size;
    const cx = size / 2, cy = size / 2, radius = size / 2 - 8;

    // Generate a procedural moon texture on an offscreen canvas
    const texW = 1024, texH = 512;
    const texCanvas = document.createElement('canvas');
    texCanvas.width = texW;
    texCanvas.height = texH;
    const tCtx = texCanvas.getContext('2d');

    // Base gray surface
    const baseGrad = tCtx.createLinearGradient(0, 0, texW, texH);
    baseGrad.addColorStop(0, '#B0AAA0');
    baseGrad.addColorStop(0.5, '#A8A298');
    baseGrad.addColorStop(1, '#9A9488');
    tCtx.fillStyle = baseGrad;
    tCtx.fillRect(0, 0, texW, texH);

    // Maria (dark seas)
    const maria = [
      { x: 320, y: 180, rx: 120, ry: 80, color: '#706860' },
      { x: 520, y: 220, rx: 90, ry: 70, color: '#686058' },
      { x: 200, y: 280, rx: 100, ry: 60, color: '#787068' },
      { x: 700, y: 160, rx: 80, ry: 90, color: '#6E6660' },
      { x: 450, y: 350, rx: 110, ry: 50, color: '#747068' },
      { x: 150, y: 140, rx: 70, ry: 55, color: '#726A62' },
      { x: 600, y: 330, rx: 60, ry: 45, color: '#6C6458' },
      { x: 850, y: 250, rx: 95, ry: 65, color: '#706860' },
    ];
    for (const m of maria) {
      const g = tCtx.createRadialGradient(m.x, m.y, 0, m.x, m.y, Math.max(m.rx, m.ry));
      g.addColorStop(0, m.color);
      g.addColorStop(0.7, m.color + '88');
      g.addColorStop(1, 'transparent');
      tCtx.fillStyle = g;
      tCtx.beginPath();
      tCtx.ellipse(m.x, m.y, m.rx, m.ry, 0, 0, Math.PI * 2);
      tCtx.fill();
    }

    // Craters with rims
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * texW;
      const y = Math.random() * texH;
      const r = Math.random() * 15 + 2;
      const brightness = Math.random() * 30 - 15;
      // Dark interior
      const cg = tCtx.createRadialGradient(x + r * 0.2, y + r * 0.2, 0, x, y, r);
      cg.addColorStop(0, `rgba(${80 + brightness}, ${75 + brightness}, ${68 + brightness}, 0.6)`);
      cg.addColorStop(0.7, `rgba(${90 + brightness}, ${85 + brightness}, ${78 + brightness}, 0.3)`);
      cg.addColorStop(1, 'transparent');
      tCtx.fillStyle = cg;
      tCtx.beginPath();
      tCtx.arc(x, y, r, 0, Math.PI * 2);
      tCtx.fill();
      // Bright rim on upper-left
      if (r > 5) {
        tCtx.beginPath();
        tCtx.arc(x, y, r, Math.PI * 0.8, Math.PI * 1.8);
        tCtx.strokeStyle = `rgba(200, 195, 185, ${0.15 + Math.random() * 0.15})`;
        tCtx.lineWidth = r * 0.15;
        tCtx.stroke();
      }
    }

    // Ray systems (bright streaks from large craters)
    for (let i = 0; i < 8; i++) {
      const ox = Math.random() * texW;
      const oy = Math.random() * texH;
      const rayCount = Math.floor(Math.random() * 6) + 4;
      for (let r = 0; r < rayCount; r++) {
        const angle = (r / rayCount) * Math.PI * 2 + Math.random() * 0.5;
        const len = Math.random() * 60 + 20;
        tCtx.beginPath();
        tCtx.moveTo(ox, oy);
        tCtx.lineTo(ox + Math.cos(angle) * len, oy + Math.sin(angle) * len);
        tCtx.strokeStyle = `rgba(190, 185, 175, ${0.08 + Math.random() * 0.06})`;
        tCtx.lineWidth = Math.random() * 2 + 0.5;
        tCtx.stroke();
      }
    }

    // Noise texture for surface roughness
    const imgData = tCtx.getImageData(0, 0, texW, texH);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 12;
      imgData.data[i] += noise;
      imgData.data[i + 1] += noise;
      imgData.data[i + 2] += noise;
    }
    tCtx.putImageData(imgData, 0, 0);
    textureRef.current = texCanvas;

    // Pre-compute sphere lookup table (which pixel maps to which lat/lon)
    const sphereMap = [];
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const dx = (px - cx) / radius;
        const dy = (py - cy) / radius;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > 1) { sphereMap.push(null); continue; }
        const dz = Math.sqrt(1 - dist2);
        const lat = Math.asin(dy);
        const lonBase = Math.atan2(dx, dz);
        const light = Math.max(0, dz * 0.5 + dx * 0.3 - dy * 0.2 + 0.45);
        const limbDark = 1 - dist2 * 0.25;
        const v = Math.floor((lat / Math.PI + 0.5) * texH) % texH;
        sphereMap.push({ lonBase, v, light: light * limbDark });
      }
    }

    const tData = tCtx.getImageData(0, 0, texW, texH).data;
    let animId, frameCount = 0;

    function draw(t) {
      frameCount++;
      if (frameCount % 3 !== 0 && frameCount > 1) { animId = requestAnimationFrame(draw); return; }

      const rotation = t * 0.00008;
      const imgOut = ctx.createImageData(size, size);
      const out = imgOut.data;

      for (let i = 0; i < sphereMap.length; i++) {
        const s = sphereMap[i];
        if (!s) continue;
        let u = Math.floor(((s.lonBase + rotation) / Math.PI + 1) / 2 * texW) % texW;
        if (u < 0) u += texW;
        const ti = (s.v * texW + u) * 4;
        const idx = i * 4;
        out[idx] = Math.min(255, (tData[ti] || 160) * s.light);
        out[idx + 1] = Math.min(255, (tData[ti + 1] || 155) * s.light);
        out[idx + 2] = Math.min(255, (tData[ti + 2] || 148) * s.light);
        out[idx + 3] = 255;
      }

      ctx.putImageData(imgOut, 0, 0);

      const atmo = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.12);
      atmo.addColorStop(0, 'rgba(200, 210, 240, 0)');
      atmo.addColorStop(0.5, 'rgba(180, 195, 230, 0.08)');
      atmo.addColorStop(1, 'rgba(140, 160, 210, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.12, 0, Math.PI * 2);
      ctx.fillStyle = atmo;
      ctx.fill();

      animId = requestAnimationFrame(draw);
    }
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute pointer-events-none"
      style={{
        width: 450, height: 450,
        filter: 'drop-shadow(0 0 50px rgba(180, 190, 220, 0.3))',
      }}
    />
  );
}

function FloatingCard({ tab, index, total, onNavigate, mousePos }) {
  const cardRef = useRef(null);
  const [hovered, setHovered] = useState(false);

  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  const radiusX = Math.min(window.innerWidth * 0.32, 380);
  const radiusY = Math.min(window.innerHeight * 0.25, 220);
  const baseX = 50 + Math.cos(angle) * (radiusX / window.innerWidth) * 100;
  const baseY = 52 + Math.sin(angle) * (radiusY / window.innerHeight) * 100;

  const floatY = Math.sin(Date.now() / 1000 + index * 0.7) * 8;
  const floatX = Math.cos(Date.now() / 1300 + index * 0.5) * 4;

  useEffect(() => {
    let animId;
    const animate = () => {
      if (cardRef.current) {
        const t = Date.now() / 1000;
        const fy = Math.sin(t + index * 0.7) * 8;
        const fx = Math.cos(t / 1.3 + index * 0.5) * 4;
        cardRef.current.style.transform = `translate(${fx}px, ${fy}px) scale(${hovered ? 1.12 : 1})`;
      }
      animId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animId);
  }, [index, hovered]);

  return (
    <div
      ref={cardRef}
      className="absolute cursor-pointer group"
      style={{
        left: `${baseX}%`,
        top: `${baseY}%`,
        transform: `translate(${floatX}px, ${floatY}px)`,
        marginLeft: '-70px',
        marginTop: '-50px',
        zIndex: hovered ? 20 : 10,
      }}
      onMouseEnter={() => { setHovered(true); playHoverSound(); }}
      onMouseLeave={() => setHovered(false)}
      onClick={() => { playClickSound(); onNavigate(tab.id); }}
    >
      <div
        className="relative w-[140px] h-[110px] rounded-xl border backdrop-blur-xl transition-all duration-300 flex flex-col items-center justify-center gap-2 overflow-hidden"
        style={{
          borderColor: hovered ? `${tab.color}90` : 'rgba(255, 255, 255, 0.12)',
          background: hovered
            ? `linear-gradient(135deg, ${tab.color}22, rgba(255,255,255,0.08), rgba(255,255,255,0.04))`
            : 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
          boxShadow: hovered
            ? `0 8px 32px ${tab.color}30, 0 0 80px ${tab.color}10, inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(255,255,255,0.05)`
            : '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(255,255,255,0.03)',
        }}
      >
        {/* Glow ring on hover */}
        <div
          className="absolute inset-0 rounded-xl transition-opacity duration-500"
          style={{
            opacity: hovered ? 1 : 0,
            background: `radial-gradient(circle at 50% 50%, ${tab.color}20, transparent 70%)`,
          }}
        />

        {/* Scan line effect */}
        <div
          className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none"
          style={{ opacity: hovered ? 0.3 : 0.1 }}
        >
          <div className="absolute w-full h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[scanline_3s_linear_infinite]"
            style={{ top: `${((Date.now() / 30 + index * 40) % 100)}%` }} />
        </div>

        <svg className="w-6 h-6 transition-all duration-300 relative z-10" viewBox="0 0 24 24" fill="none"
          stroke={hovered ? tab.color : '#94A3B8'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d={tab.icon} />
        </svg>

        <span className="text-xs font-semibold tracking-wide relative z-10 transition-colors duration-300"
          style={{ color: hovered ? tab.color : '#CBD5E1' }}>
          {tab.label}
        </span>

        <span className="text-[10px] font-medium tracking-wider uppercase relative z-10 transition-colors duration-300 text-center leading-tight px-2"
          style={{ color: hovered ? `${tab.color}` : 'rgba(226,232,240,0.7)' }}>
          {tab.desc}
        </span>

        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t border-l rounded-tl-xl transition-colors duration-300"
          style={{ borderColor: hovered ? tab.color : 'rgba(99,102,241,0.3)' }} />
        <div className="absolute top-0 right-0 w-3 h-3 border-t border-r rounded-tr-xl transition-colors duration-300"
          style={{ borderColor: hovered ? tab.color : 'rgba(99,102,241,0.3)' }} />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l rounded-bl-xl transition-colors duration-300"
          style={{ borderColor: hovered ? tab.color : 'rgba(99,102,241,0.3)' }} />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r rounded-br-xl transition-colors duration-300"
          style={{ borderColor: hovered ? tab.color : 'rgba(99,102,241,0.3)' }} />
      </div>
    </div>
  );
}

export default function HomePage({ onNavigate }) {
  const [mounted, setMounted] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [pulseCount, setPulseCount] = useState(0);

  useEffect(() => {
    setMounted(true);
    const t1 = setTimeout(() => setShowSubtitle(true), 600);
    const t2 = setTimeout(() => setShowCards(true), 1000);
    const t3 = setTimeout(() => playAmbientPulse(), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulseCount(c => c + 1);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleMouseMove = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      onMouseMove={handleMouseMove}
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #0C1222 0%, #060A14 50%, #020408 100%)' }}
    >
      <SpaceCanvas />

      {/* Radial glow following mouse — like a flashlight in space */}
      <div
        className="fixed pointer-events-none z-[1] w-[500px] h-[500px] rounded-full transition-all duration-1000 ease-out"
        style={{
          left: mousePos.x - 250,
          top: mousePos.y - 250,
          background: 'radial-gradient(circle, rgba(140,160,255,0.04) 0%, rgba(80,60,180,0.02) 40%, transparent 70%)',
        }}
      />

      {/* Center hub */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
        {/* Moon behind everything */}
        <div className={`absolute transition-all duration-[2000ms] ease-out ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
          style={{ marginTop: '-20px' }}>
          <RotatingMoon />
        </div>

        {/* Logo area — on top of moon */}
        <div className={`relative transition-all duration-1000 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="relative">
            <h1 className="relative text-6xl font-black tracking-tight text-white drop-shadow-[0_0_30px_rgba(129,140,248,0.5)]">
              <span className="bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
                GNC
              </span>
              <span className="text-white ml-3 font-light drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">Smart Layer</span>
            </h1>
          </div>

          <div className={`flex items-center justify-center gap-3 mt-5 transition-all duration-700 delay-300 ${showSubtitle ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="h-[1px] w-16 bg-gradient-to-r from-transparent to-indigo-400/70" />
            <p className="text-lg text-white tracking-[0.25em] uppercase font-semibold drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
              Intelligence Dashboard
            </p>
            <div className="h-[1px] w-16 bg-gradient-to-l from-transparent to-indigo-400/70" />
          </div>

          {/* Status indicator */}
          <div className={`flex items-center justify-center gap-2 mt-6 transition-all duration-700 delay-500 ${showSubtitle ? 'opacity-100' : 'opacity-0'}`}>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-positive shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            </span>
            <span className="text-xs text-positive tracking-wider uppercase font-medium">Systems Online</span>
          </div>
        </div>
      </div>

      {/* Floating tab cards */}
      <div className={`absolute inset-0 z-10 transition-all duration-1000 ${showCards ? 'opacity-100' : 'opacity-0 scale-90'}`}>
        {TAB_CONFIG.map((tab, i) => (
          <FloatingCard
            key={tab.id}
            tab={tab}
            index={i}
            total={TAB_CONFIG.length}
            onNavigate={onNavigate}
            mousePos={mousePos}
          />
        ))}
      </div>

      {/* Bottom bar */}
      <div className={`absolute bottom-6 left-0 right-0 flex justify-center z-10 transition-all duration-700 delay-700 ${showCards ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="flex items-center gap-6 px-6 py-3 rounded-full border border-white/10 backdrop-blur-xl bg-white/[0.06]" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
            <span className="text-[10px] text-slate-500 tracking-wider uppercase">9 Modules Active</span>
          </div>
          <div className="w-[1px] h-3 bg-white/10" />
          <span className="text-[10px] text-slate-500 tracking-wider uppercase">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <div className="w-[1px] h-3 bg-white/10" />
          <span className="text-[10px] text-slate-500 tracking-wider uppercase">guardian.in</span>
        </div>
      </div>
    </div>
  );
}
