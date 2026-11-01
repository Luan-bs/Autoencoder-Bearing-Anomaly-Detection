/* ==========================================================================
   NASA IMS Bearings — Interactive Educational Platform (app.js)
   Powers 4 manipulable physics, DSP, PHM, and Neural Autoencoder simulators
   ========================================================================== */

(function () {
  'use strict';

  const TELEMETRY = window.IMS_TELEMETRY || null;

  // ── 0. Theme Toggle, Scroll Progress & Glossary Modal ─────────────────────
  const htmlEl = document.documentElement;
  const btnTheme = document.getElementById('btnTheme');
  const btnGlossary = document.getElementById('btnGlossary');
  const btnCloseGlossary = document.getElementById('btnCloseGlossary');
  const glossaryModal = document.getElementById('glossaryModal');
  const scrollProgress = document.getElementById('scrollProgress');
  const navAnchors = document.querySelectorAll('#navLinks a');

  function getThemeColors() {
    const isLight = htmlEl.getAttribute('data-theme') === 'light';
    return {
      isLight,
      bg: isLight ? '#f8fafc' : '#090d16',
      card: isLight ? '#ffffff' : '#111827',
      grid: isLight ? '#e2e8f0' : '#1e293b',
      text: isLight ? '#0f172a' : '#f1f5f9',
      muted: isLight ? '#64748b' : '#94a3b8',
      cyan: isLight ? '#0284c7' : '#38bdf8',
      blue: isLight ? '#2563eb' : '#3b82f6',
      amber: isLight ? '#d97706' : '#f59e0b',
      red: isLight ? '#dc2626' : '#ef4444',
      green: isLight ? '#059669' : '#10b981',
      purple: isLight ? '#7c3aed' : '#a855f7'
    };
  }

  btnTheme.addEventListener('click', () => {
    const current = htmlEl.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    htmlEl.setAttribute('data-theme', next);
    btnTheme.textContent = next === 'light' ? '🌙 Modo Escuro' : '☀️ Modo Claro';
    drawFftLab();
    drawRealChannels();
    drawPhmTimeline();
    drawAeSimulator();
  });

  btnGlossary.addEventListener('click', () => glossaryModal.classList.add('open'));
  btnCloseGlossary.addEventListener('click', () => glossaryModal.classList.remove('open'));
  glossaryModal.addEventListener('click', (e) => {
    if (e.target === glossaryModal) glossaryModal.classList.remove('open');
  });

  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    scrollProgress.style.width = `${Math.min(100, Math.max(0, pct))}%`;

    const sections = ['data', 'features', 'phm', 'autoencoders'];
    let currentSec = 'data';
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= 160) {
        currentSec = id;
      }
    }
    navAnchors.forEach((a) => {
      a.classList.toggle('active', a.getAttribute('href') === `#${currentSec}`);
    });
  });

  // Render KaTeX formulas once loaded
  window.addEventListener('DOMContentLoaded', () => {
    if (window.renderMathInElement) {
      window.renderMathInElement(document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ]
      });
    }
  });

  // =========================================================================
  // SIMULATOR 1: Bearing ZA-2115 Kinematics & Impact Oscilloscope (60 FPS)
  // =========================================================================
  const bearingCanvas = document.getElementById('bearingCanvas');
  const bCtx = bearingCanvas.getContext('2d');
  const sliderRpm = document.getElementById('sliderRpm');
  const sliderCrack = document.getElementById('sliderCrack');
  const sliderSlowMo = document.getElementById('sliderSlowMo');

  const bState = {
    rpm: 2000,
    crackPct: 45,
    slowMo: 120,
    faultMode: 'bpfo', // 'healthy' | 'bpfo' | 'bpfi' | 'bsf'
    shaftAngle: 0,
    cageAngle: 0,
    rollerSpinAngle: 0,
    flashIntensity: 0,
    oscBuffer: new Array(220).fill(0),
    simTime: 0
  };

  function updateBearingReadouts() {
    const fr = bState.rpm / 60.0;
    const Nb = 16;
    const d_D = 8.41 / 71.50; // ~0.1176 / cos(theta) -> empirical 0.1135 for ZA-2115
    const bpfo = (Nb / 2) * fr * (1 - 0.1135);
    const bpfi = (Nb / 2) * fr * (1 + 0.1135);
    const bsf2x = Nb * fr * 0.4176;

    document.getElementById('valRpm').textContent = `${bState.rpm} RPM`;
    const sevLabel =
      bState.crackPct === 0
        ? '0% (Saudável)'
        : bState.crackPct < 35
        ? `${bState.crackPct}% (Microtrinca)`
        : bState.crackPct < 75
        ? `${bState.crackPct}% (Degradação)`
        : `${bState.crackPct}% (Severa)`;
    document.getElementById('valCrack').textContent = sevLabel;
    document.getElementById('valSlowMo').textContent = `${bState.slowMo}× mais lento`;

    document.getElementById('readFr').textContent = `${fr.toFixed(2)} Hz`;
    document.getElementById('readBpfo').textContent = `${bpfo.toFixed(1)} Hz`;
    document.getElementById('readBpfi').textContent = `${bpfi.toFixed(1)} Hz`;
    document.getElementById('readBsf').textContent = `${bsf2x.toFixed(1)} Hz`;

    let activeFreq = bpfo;
    if (bState.faultMode === 'bpfi') activeFreq = bpfi;
    if (bState.faultMode === 'bsf') activeFreq = bsf2x;
    const dtMs = bState.crackPct > 0 && bState.faultMode !== 'healthy' ? (1000 / activeFreq).toFixed(2) + ' ms' : 'Sem choques';
    document.getElementById('readShockDt').textContent = dtMs;

    const dot = document.getElementById('bearingStatusDot');
    const badge = document.getElementById('bearingModeBadge');
    dot.className = 'status-dot';
    if (bState.crackPct === 0 || bState.faultMode === 'healthy') {
      badge.textContent = 'Regime Saudável';
    } else if (bState.crackPct < 55) {
      dot.classList.add('warn');
      badge.textContent = `Impactos ${bState.faultMode.toUpperCase()} (${activeFreq.toFixed(1)} Hz)`;
    } else {
      dot.classList.add('danger');
      badge.textContent = `Alarme Severo ${bState.faultMode.toUpperCase()} (${activeFreq.toFixed(1)} Hz)`;
    }
  }

  sliderRpm.addEventListener('input', (e) => {
    bState.rpm = Number(e.target.value);
    updateBearingReadouts();
  });
  sliderCrack.addEventListener('input', (e) => {
    bState.crackPct = Number(e.target.value);
    if (bState.crackPct > 0 && bState.faultMode === 'healthy') {
      bState.faultMode = 'bpfo';
      syncFaultPills();
    }
    updateBearingReadouts();
  });
  sliderSlowMo.addEventListener('input', (e) => {
    bState.slowMo = Number(e.target.value);
    updateBearingReadouts();
  });

  function syncFaultPills() {
    document.querySelectorAll('#faultModePills .pill-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.fault === bState.faultMode);
    });
  }

  document.querySelectorAll('#faultModePills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      bState.faultMode = btn.dataset.fault;
      if (bState.faultMode === 'healthy') {
        bState.crackPct = 0;
        sliderCrack.value = 0;
      } else if (bState.crackPct === 0) {
        bState.crackPct = 50;
        sliderCrack.value = 50;
      }
      syncFaultPills();
      updateBearingReadouts();
    });
  });

  function animateBearing() {
    const c = getThemeColors();
    const W = bearingCanvas.width;
    const H = bearingCanvas.height;
    bCtx.clearRect(0, 0, W, H);

    const dt = 1 / 60;
    const fr = bState.rpm / 60.0;
    const omegaShaft = (2 * Math.PI * fr) / bState.slowMo;
    const omegaCage = omegaShaft * (1 - 0.1135) * 0.5;
    const omegaRoller = omegaShaft * 4.18;

    const prevCage = bState.cageAngle;
    bState.shaftAngle = (bState.shaftAngle + omegaShaft * dt) % (2 * Math.PI);
    bState.cageAngle = (bState.cageAngle + omegaCage * dt) % (2 * Math.PI);
    bState.rollerSpinAngle = (bState.rollerSpinAngle + omegaRoller * dt) % (2 * Math.PI);
    bState.simTime += dt;

    // Bearing geometry on left side of canvas
    const cx = 175;
    const cy = 200;
    const rOuterRing = 132;
    const rOuterTrack = 108;
    const rInnerTrack = 74;
    const rShaft = 46;
    const rRoller = (rOuterTrack - rInnerTrack) / 2 - 1;
    const rPitch = (rOuterTrack + rInnerTrack) / 2;
    const Nb = 16;

    // Defect angular position on outer race (top = -PI/2, right under accelerometer!)
    const outerDefectAngle = -Math.PI / 2;
    const innerDefectAngle = bState.shaftAngle - Math.PI / 2;

    // Detect if any roller just crossed the defect
    let shockTriggered = false;
    if (bState.crackPct > 0 && bState.faultMode !== 'healthy') {
      for (let i = 0; i < Nb; i++) {
        const baseA = (i * 2 * Math.PI) / Nb;
        const aPrev = (prevCage + baseA) % (2 * Math.PI);
        const aNow = (bState.cageAngle + baseA) % (2 * Math.PI);

        if (bState.faultMode === 'bpfo') {
          const target = (outerDefectAngle + 2 * Math.PI) % (2 * Math.PI);
          if (Math.abs(aNow - target) < omegaCage * dt * 1.35) {
            shockTriggered = true;
          }
        } else if (bState.faultMode === 'bpfi') {
          const relPrev = (prevCage - bState.shaftAngle + baseA + 4 * Math.PI) % (2 * Math.PI);
          if (relPrev < omegaShaft * dt * 1.1) {
            shockTriggered = true;
          }
        } else if (bState.faultMode === 'bsf' && i === 0) {
          if (Math.sin(bState.rollerSpinAngle * 2) > 0.96) {
            shockTriggered = true;
          }
        }
      }
    }

    if (shockTriggered) {
      bState.flashIntensity = 1.0;
    } else {
      bState.flashIntensity *= 0.84;
    }

    // Push sample into oscilloscope buffer
    const baseWave =
      0.06 * Math.sin(bState.simTime * 28) +
      0.04 * Math.cos(bState.simTime * 63) +
      (Math.random() - 0.5) * 0.05;
    const shockAmp =
      bState.flashIntensity *
      (bState.crackPct / 100) *
      1.35 *
      Math.sin(bState.simTime * 190);
    bState.oscBuffer.push(baseWave + shockAmp);
    if (bState.oscBuffer.length > 260) bState.oscBuffer.shift();

    // 1. Draw Radial Load Arrow (6,000 lbs)
    bCtx.save();
    bCtx.fillStyle = c.muted;
    bCtx.font = '600 11px Inter, sans-serif';
    bCtx.fillText('Carga Radial: 6.000 lbs', 18, 26);

    // 2. Draw Outer Race (Static Housing)
    bCtx.beginPath();
    bCtx.arc(cx, cy, rOuterRing, 0, 2 * Math.PI);
    bCtx.arc(cx, cy, rOuterTrack, 0, 2 * Math.PI, true);
    bCtx.fillStyle = c.isLight ? '#cbd5e1' : '#1e293b';
    bCtx.fill();
    bCtx.lineWidth = 2;
    bCtx.strokeStyle = bState.flashIntensity > 0.3 ? c.red : c.cyan;
    bCtx.stroke();

    // Draw Outer Race Crack Notch at top (-PI/2) if BPFO mode
    if (bState.crackPct > 0 && bState.faultMode === 'bpfo') {
      const notchDepth = 4 + (bState.crackPct / 100) * 12;
      bCtx.beginPath();
      bCtx.arc(cx, cy, rOuterTrack + notchDepth, outerDefectAngle - 0.09, outerDefectAngle + 0.09);
      bCtx.lineTo(cx + rOuterTrack * Math.cos(outerDefectAngle + 0.09), cy + rOuterTrack * Math.sin(outerDefectAngle + 0.09));
      bCtx.closePath();
      bCtx.fillStyle = c.red;
      bCtx.fill();

      // Shock wave rings when ball hits outer race crack
      if (bState.flashIntensity > 0.15) {
        const sx = cx + rOuterTrack * Math.cos(outerDefectAngle);
        const sy = cy + rOuterTrack * Math.sin(outerDefectAngle);
        for (let r = 1; r <= 3; r++) {
          bCtx.beginPath();
          bCtx.arc(sx, sy, r * 14 * (1.1 - bState.flashIntensity * 0.5), 0, 2 * Math.PI);
          bCtx.strokeStyle = `rgba(239, 68, 68, ${bState.flashIntensity * (1 - r * 0.25)})`;
          bCtx.lineWidth = 2;
          bCtx.stroke();
        }
      }
    }

    // 3. Draw Inner Race & Rotating Shaft
    bCtx.beginPath();
    bCtx.arc(cx, cy, rInnerTrack, 0, 2 * Math.PI);
    bCtx.arc(cx, cy, rShaft, 0, 2 * Math.PI, true);
    bCtx.fillStyle = c.isLight ? '#94a3b8' : '#334155';
    bCtx.fill();
    bCtx.strokeStyle = c.muted;
    bCtx.lineWidth = 1.5;
    bCtx.stroke();

    // Inner Race Crack if BPFI mode
    if (bState.crackPct > 0 && bState.faultMode === 'bpfi') {
      const ix = cx + rInnerTrack * Math.cos(innerDefectAngle);
      const iy = cy + rInnerTrack * Math.sin(innerDefectAngle);
      bCtx.beginPath();
      bCtx.arc(ix, iy, 6 + (bState.crackPct / 100) * 5, 0, 2 * Math.PI);
      bCtx.fillStyle = c.amber;
      bCtx.fill();
    }

    // Rotating Shaft Center & Spokes
    bCtx.beginPath();
    bCtx.arc(cx, cy, rShaft, 0, 2 * Math.PI);
    bCtx.fillStyle = c.bg;
    bCtx.fill();
    for (let k = 0; k < 4; k++) {
      const ang = bState.shaftAngle + (k * Math.PI) / 2;
      bCtx.beginPath();
      bCtx.moveTo(cx, cy);
      bCtx.lineTo(cx + rShaft * Math.cos(ang), cy + rShaft * Math.sin(ang));
      bCtx.strokeStyle = c.cyan;
      bCtx.lineWidth = 2;
      bCtx.stroke();
    }

    // 4. Draw 16 Rolling Elements (ZA-2115)
    for (let i = 0; i < Nb; i++) {
      const ang = bState.cageAngle + (i * 2 * Math.PI) / Nb;
      const rx = cx + rPitch * Math.cos(ang);
      const ry = cy + rPitch * Math.sin(ang);

      bCtx.beginPath();
      bCtx.arc(rx, ry, rRoller, 0, 2 * Math.PI);
      const isFaultyRoller = bState.faultMode === 'bsf' && i === 0 && bState.crackPct > 0;
      bCtx.fillStyle = isFaultyRoller ? c.purple : c.isLight ? '#475569' : '#e2e8f0';
      bCtx.fill();
      bCtx.strokeStyle = c.bg;
      bCtx.lineWidth = 1.5;
      bCtx.stroke();

      if (isFaultyRoller) {
        const dx = rx + (rRoller - 2) * Math.cos(bState.rollerSpinAngle);
        const dy = ry + (rRoller - 2) * Math.sin(bState.rollerSpinAngle);
        bCtx.beginPath();
        bCtx.arc(dx, dy, 3.5, 0, 2 * Math.PI);
        bCtx.fillStyle = c.red;
        bCtx.fill();
      }
    }

    // 5. Draw PCB 353B33 Accelerometer mounted on top of Outer Housing
    const accW = 46;
    const accH = 24;
    const accX = cx - accW / 2;
    const accY = cy - rOuterRing - accH - 2;
    bCtx.fillStyle = bState.flashIntensity > 0.25 ? c.red : c.cyan;
    bCtx.fillRect(accX, accY, accW, accH);
    bCtx.fillStyle = '#090d16';
    bCtx.font = '700 9px JetBrains Mono, monospace';
    bCtx.textAlign = 'center';
    bCtx.fillText('SENSOR', cx, accY + 11);
    bCtx.fillText('20 kHz', cx, accY + 20);
    bCtx.textAlign = 'left';

    // Labels for Bearing Anatomy
    bCtx.fillStyle = c.muted;
    bCtx.font = '500 11px Inter, sans-serif';
    bCtx.fillText('Pista Externa (Fixa = 0 RPM)', 22, H - 16);
    bCtx.fillText(`N_b = 16 rolos · Eixo = ${bState.rpm} RPM`, 190, H - 16);

    // 6. Right Panel: Real-time Accelerometer Oscilloscope Trace
    const oscX = 345;
    const oscY = 38;
    const oscW = W - oscX - 18;
    const oscH = 310;

    bCtx.fillStyle = c.card;
    bCtx.fillRect(oscX, oscY, oscW, oscH);
    bCtx.strokeStyle = c.grid;
    bCtx.lineWidth = 1;
    bCtx.strokeRect(oscX, oscY, oscW, oscH);

    // Grid lines
    const midY = oscY + oscH / 2;
    bCtx.beginPath();
    bCtx.moveTo(oscX, midY);
    bCtx.lineTo(oscX + oscW, midY);
    bCtx.strokeStyle = c.grid;
    bCtx.stroke();

    bCtx.fillStyle = c.text;
    bCtx.font = '700 12px Inter, sans-serif';
    bCtx.fillText('Sinal Instantâneo do Acelerômetro — a(t) [g]', oscX + 12, oscY + 22);

    bCtx.fillStyle = c.muted;
    bCtx.font = '500 11px JetBrains Mono, monospace';
    bCtx.fillText(
      bState.crackPct > 0 && bState.faultMode !== 'healthy'
        ? 'Trem de Pulsos de Impacto Periódicos'
        : 'Vibração Estacionária Gaussiana (Saudável)',
      oscX + 12,
      oscY + 40
    );

    // Plot waveform
    bCtx.beginPath();
    const len = bState.oscBuffer.length;
    for (let i = 0; i < len; i++) {
      const px = oscX + 10 + (i / (len - 1)) * (oscW - 20);
      const py = midY - bState.oscBuffer[i] * (oscH * 0.36);
      if (i === 0) bCtx.moveTo(px, py);
      else bCtx.lineTo(px, py);
    }
    bCtx.strokeStyle = bState.crackPct > 40 ? c.amber : c.cyan;
    bCtx.lineWidth = 1.8;
    bCtx.stroke();

    bCtx.restore();
    requestAnimationFrame(animateBearing);
  }

  updateBearingReadouts();
  requestAnimationFrame(animateBearing);

  // =========================================================================
  // SIMULATOR 2: Feature Engine — Signal + FFT Spectrum + B1..B4 Explorer
  // =========================================================================
  const fftCanvas = document.getElementById('fftCanvas');
  const fCtx = fftCanvas.getContext('2d');
  const channelsCanvas = document.getElementById('channelsCanvas');
  const chCtx = channelsCanvas.getContext('2d');

  const sliderSimPulse = document.getElementById('sliderSimPulse');
  const sliderSimRes = document.getElementById('sliderSimRes');
  const sliderSimHarm = document.getElementById('sliderSimHarm');

  const fState = {
    pulse: 0,
    resHigh: 15,
    harmB3: 0,
    channelMetric: 'rms', // 'rms' | 'kurtosis' | 'bpfo'
    channelScale: 'raw'   // 'raw' | 'zscore'
  };

  function drawFftLab() {
    const c = getThemeColors();
    const W = fftCanvas.width;
    const H = fftCanvas.height;
    fCtx.clearRect(0, 0, W, H);

    const p = fState.pulse / 100;
    const r = fState.resHigh / 100;
    const h = fState.harmB3 / 100;

    document.getElementById('valSimPulse').textContent = `${fState.pulse}%`;
    document.getElementById('valSimRes').textContent = `${fState.resHigh}%`;
    document.getElementById('valSimHarm').textContent = `${fState.harmB3}%`;

    // Synthesize 300 time-domain samples and compute realistic physical features
    const N = 300;
    const samples = new Float64Array(N);
    let sumSq = 0;
    let maxAbs = 0;
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (let i = 0; i < N; i++) {
      const t = i / N;
      // Base rotation + background noise
      let x = 0.065 * Math.sin(2 * Math.PI * 4 * t) + 0.035 * Math.cos(2 * Math.PI * 11 * t);
      // 7th harmonic (231.4 Hz stationary effect in Bearing 3)
      x += h * 0.095 * Math.sin(2 * Math.PI * 18 * t);
      // High-freq structural resonance (2000-5000 Hz)
      x += r * 0.08 * Math.sin(2 * Math.PI * 65 * t) * (1 + 0.5 * Math.sin(2 * Math.PI * 9 * t));
      // Periodic BPFO shock impulses (kurtosis & crest factor booster)
      const phase = (i % 25) / 25;
      if (phase < 0.16 && p > 0) {
        const decay = Math.exp(-phase * 22);
        x += p * 0.62 * decay * Math.sin(2 * Math.PI * 75 * t);
      }
      // Deterministic pseudo-noise
      x += 0.025 * Math.sin(i * 12.9898) * Math.cos(i * 78.233);

      samples[i] = x;
      sumSq += x * x;
      const absX = Math.abs(x);
      if (absX > maxAbs) maxAbs = absX;
      if (x < minVal) minVal = x;
      if (x > maxVal) maxVal = x;
    }

    const rms = Math.sqrt(sumSq / N);
    let sum4 = 0;
    for (let i = 0; i < N; i++) {
      sum4 += Math.pow(samples[i], 4);
    }
    const kurt = Math.max(2.9, (sum4 / N) / Math.pow(sumSq / N, 2));
    const cf = maxAbs / (rms + 1e-6);
    const eBpfo = 7.8 + p * 38.0 + h * 68.0;
    const eHigh = 520 + r * 950 + p * 680;

    document.getElementById('featRms').textContent = `${rms.toFixed(3)} g`;
    document.getElementById('featKurt').textContent = kurt.toFixed(2);
    document.getElementById('featCf').textContent = cf.toFixed(2);
    document.getElementById('featEbpfo').textContent = `${eBpfo.toFixed(1)}k`;
    document.getElementById('featEhigh').textContent = `${Math.round(eHigh)}k`;

    // Top subplot: Time-Domain Signal
    const padX = 48;
    const topY = 26;
    const topH = 125;
    const plotW = W - padX - 20;

    fCtx.fillStyle = c.card;
    fCtx.fillRect(padX, topY, plotW, topH);
    fCtx.strokeStyle = c.grid;
    fCtx.strokeRect(padX, topY, plotW, topH);

    fCtx.fillStyle = c.text;
    fCtx.font = '700 11.5px Inter, sans-serif';
    fCtx.fillText('1. Domínio do Tempo — Snapshot de Vibração x(t) [20.480 pts @ 20 kHz]', padX + 10, topY + 18);

    const midTopY = topY + topH / 2 + 6;
    fCtx.beginPath();
    for (let i = 0; i < N; i++) {
      const px = padX + (i / (N - 1)) * plotW;
      const py = midTopY - Math.max(-0.55, Math.min(0.55, samples[i])) * (topH * 0.78);
      if (i === 0) fCtx.moveTo(px, py);
      else fCtx.lineTo(px, py);
    }
    fCtx.strokeStyle = p > 0.35 ? c.amber : c.cyan;
    fCtx.lineWidth = 1.5;
    fCtx.stroke();

    // Bottom subplot: Frequency-Domain FFT & The 6 Canonical Bands
    const botY = 178;
    const botH = 155;
    fCtx.fillStyle = c.card;
    fCtx.fillRect(padX, botY, plotW, botH);
    fCtx.strokeStyle = c.grid;
    fCtx.strokeRect(padX, botY, plotW, botH);

    // Highlight canonical FFT bands (0 to 5000 Hz)
    const bands = [
      { name: 'low (0-500Hz)', f0: 0, f1: 500, color: 'rgba(56, 189, 248, 0.08)' },
      { name: 'BPFO (216-256Hz)', f0: 190, f1: 310, color: 'rgba(239, 68, 68, 0.22)' },
      { name: 'mid (500-2kHz)', f0: 500, f1: 2000, color: 'rgba(16, 185, 129, 0.07)' },
      { name: 'high (2k-5kHz · Ressonância)', f0: 2000, f1: 5000, color: 'rgba(245, 158, 11, 0.12)' }
    ];

    bands.forEach((b) => {
      const x0 = padX + (b.f0 / 5000) * plotW;
      const bw = ((b.f1 - b.f0) / 5000) * plotW;
      fCtx.fillStyle = b.color;
      fCtx.fillRect(x0, botY, bw, botH);
    });

    fCtx.fillStyle = c.text;
    fCtx.font = '700 11.5px Inter, sans-serif';
    fCtx.fillText('2. Domínio da Frequência — Espectro FFT |X(f)|² e Integração por Bandas (0 a 5.000 Hz)', padX + 10, botY + 18);

    // Draw synthetic spectrum curve across 0..5000 Hz
    const nBins = 220;
    fCtx.beginPath();
    for (let k = 0; k < nBins; k++) {
      const freq = (k / (nBins - 1)) * 5000;
      let mag = 0.06 + 0.04 * Math.exp(-freq / 1200);

      // Shaft harmonics in low band
      if (Math.abs(freq - 100) < 45) mag += 0.18;
      // 7th harmonic (231.4 Hz) vs BPFO (236.4 Hz)
      if (Math.abs(freq - 231) < 35) mag += h * 0.72;
      if (Math.abs(freq - 236) < 35) mag += p * 0.65;
      // BPFO 2x and 3x harmonics
      if (Math.abs(freq - 472) < 35) mag += p * 0.38;
      if (Math.abs(freq - 709) < 35) mag += p * 0.25;
      // Mid band activity
      if (freq > 900 && freq < 1600) mag += (0.08 + p * 0.15) * Math.exp(-Math.pow((freq - 1250) / 280, 2));
      // High frequency structural resonance (2000 - 4500 Hz)
      if (freq > 2100 && freq < 4400) {
        const env = Math.exp(-Math.pow((freq - 3200) / 750, 2));
        mag += (r * 0.68 + p * 0.48) * env * (0.65 + 0.35 * Math.sin(k * 1.7));
      }

      const px = padX + (k / (nBins - 1)) * plotW;
      const py = botY + botH - 18 - Math.min(0.95, mag) * (botH - 42);
      if (k === 0) fCtx.moveTo(px, py);
      else fCtx.lineTo(px, py);
    }
    fCtx.strokeStyle = c.cyan;
    fCtx.lineWidth = 2;
    fCtx.stroke();

    // Frequency axis labels
    fCtx.fillStyle = c.muted;
    fCtx.font = '600 10px JetBrains Mono, monospace';
    [0, 236, 500, 2000, 3200, 5000].forEach((f) => {
      const lx = padX + (f / 5000) * plotW;
      fCtx.fillText(f === 236 ? '236Hz (BPFO)' : `${f}Hz`, lx - 14, botY + botH - 4);
    });
  }

  [sliderSimPulse, sliderSimRes, sliderSimHarm].forEach((s) => {
    s.addEventListener('input', () => {
      fState.pulse = Number(sliderSimPulse.value);
      fState.resHigh = Number(sliderSimRes.value);
      fState.harmB3 = Number(sliderSimHarm.value);
      drawFftLab();
    });
  });

  document.querySelectorAll('#fftPresetPills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#fftPresetPills .pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const preset = btn.dataset.preset;
      if (preset === 'b1_healthy') {
        sliderSimPulse.value = 0;
        sliderSimRes.value = 15;
        sliderSimHarm.value = 0;
      } else if (preset === 'b3_paradox') {
        sliderSimPulse.value = 0;
        sliderSimRes.value = 25;
        sliderSimHarm.value = 85;
      } else if (preset === 'b1_incipient') {
        sliderSimPulse.value = 25;
        sliderSimRes.value = 75;
        sliderSimHarm.value = 0;
      } else if (preset === 'b1_severe') {
        sliderSimPulse.value = 95;
        sliderSimRes.value = 95;
        sliderSimHarm.value = 0;
      }
      fState.pulse = Number(sliderSimPulse.value);
      fState.resHigh = Number(sliderSimRes.value);
      fState.harmB3 = Number(sliderSimHarm.value);
      drawFftLab();
    });
  });

  // Tab switcher between Synthetic FFT Lab and Real B1..B4 Comparison
  const tabSimSignal = document.getElementById('tabSimSignal');
  const tabRealChannels = document.getElementById('tabRealChannels');
  const panelSimSignal = document.getElementById('panelSimSignal');
  const panelRealChannels = document.getElementById('panelRealChannels');

  tabSimSignal.addEventListener('click', () => {
    tabSimSignal.classList.add('active');
    tabRealChannels.classList.remove('active');
    panelSimSignal.style.display = 'block';
    panelRealChannels.style.display = 'none';
    drawFftLab();
  });

  tabRealChannels.addEventListener('click', () => {
    tabRealChannels.classList.add('active');
    tabSimSignal.classList.remove('active');
    panelSimSignal.style.display = 'none';
    panelRealChannels.style.display = 'block';
    drawRealChannels();
  });

  function drawRealChannels() {
    if (!TELEMETRY) return;
    const c = getThemeColors();
    const W = channelsCanvas.width;
    const H = channelsCanvas.height;
    chCtx.clearRect(0, 0, W, H);

    const padX = 56;
    const padY = 34;
    const plotW = W - padX - 24;
    const plotH = H - padY - 38;

    chCtx.fillStyle = c.card;
    chCtx.fillRect(padX, padY, plotW, plotH);
    chCtx.strokeStyle = c.grid;
    chCtx.strokeRect(padX, padY, plotW, plotH);

    const tl = TELEMETRY.timeline;
    const N = 982; // exclude motor shutdown 982..983 for clean scale
    const mKey = fState.channelMetric; // 'rms', 'kurtosis', 'bpfo'
    const isZ = fState.channelScale === 'zscore';

    const series = [
      { name: 'B1 (Falha Pista Externa)', arr: tl[`b1_${mKey}`], color: c.cyan, width: 2.2 },
      { name: 'B2 (Controle Saudável)', arr: tl[`b2_${mKey}`], color: c.green, width: 1.3 },
      { name: 'B3 (Controle · Paradoxo 7º Harm.)', arr: tl[`b3_${mKey}`], color: c.amber, width: 1.8 },
      { name: 'B4 (Controle Saudável)', arr: tl[`b4_${mKey}`], color: c.purple, width: 1.3 }
    ].map((s) => {
      const slice = s.arr.slice(0, N);
      if (!isZ) return { ...s, data: slice };
      // Fit mean & std on healthy train 0..400
      const trainSlice = slice.slice(0, 401);
      const mean = trainSlice.reduce((a, b) => a + b, 0) / trainSlice.length;
      const std = Math.sqrt(trainSlice.reduce((a, b) => a + (b - mean) ** 2, 0) / trainSlice.length) + 1e-9;
      return { ...s, data: slice.map((v) => (v - mean) / std) };
    });

    // Compute robust y range
    let yMin = Infinity;
    let yMax = -Infinity;
    series.forEach((s) => {
      for (let i = 0; i < 920; i++) {
        if (s.data[i] < yMin) yMin = s.data[i];
        if (s.data[i] > yMax) yMax = s.data[i];
      }
    });
    yMax = Math.max(yMax * 1.15, isZ ? 12 : yMax);

    // Draw train boundary (idx=400) and test boundary (idx=531)
    const xTrain = padX + (400 / N) * plotW;
    const xTest = padX + (531 / N) * plotW;
    chCtx.strokeStyle = c.green;
    chCtx.setLineDash([4, 4]);
    chCtx.beginPath();
    chCtx.moveTo(xTrain, padY);
    chCtx.lineTo(xTrain, padY + plotH);
    chCtx.stroke();

    chCtx.strokeStyle = c.red;
    chCtx.beginPath();
    chCtx.moveTo(xTest, padY);
    chCtx.lineTo(xTest, padY + plotH);
    chCtx.stroke();
    chCtx.setLineDash([]);

    // Plot each channel (subsampled every 3 points for crisp rendering)
    series.forEach((s) => {
      chCtx.beginPath();
      for (let i = 0; i < N; i += 3) {
        const px = padX + (i / (N - 1)) * plotW;
        const clamped = Math.min(yMax, Math.max(yMin, s.data[i]));
        const py = padY + plotH - ((clamped - yMin) / (yMax - yMin + 1e-9)) * (plotH - 16);
        if (i === 0) chCtx.moveTo(px, py);
        else chCtx.lineTo(px, py);
      }
      chCtx.strokeStyle = s.color;
      chCtx.lineWidth = s.width;
      chCtx.stroke();
    });

    // Legend
    chCtx.font = '600 11px Inter, sans-serif';
    series.forEach((s, idx) => {
      const lx = padX + 12 + idx * 150;
      chCtx.fillStyle = s.color;
      chCtx.fillRect(lx, 12, 12, 12);
      chCtx.fillStyle = c.text;
      chCtx.fillText(s.name.split(' (')[0], lx + 16, 22);
    });

    chCtx.fillStyle = c.muted;
    chCtx.font = '600 10px JetBrains Mono, monospace';
    chCtx.fillText('Treino [0..400]', padX + 8, padY + 16);
    chCtx.fillText('Início Degradação [531+]', xTest + 6, padY + 16);
    chCtx.fillText('Arquivo 0', padX, H - 10);
    chCtx.fillText('Arquivo 981 (163,8h)', padX + plotW - 115, H - 10);
  }

  document.querySelectorAll('#channelMetricPills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#channelMetricPills .pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      fState.channelMetric = btn.dataset.cmetric;
      drawRealChannels();
    });
  });

  document.querySelectorAll('#channelScalePills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#channelScalePills .pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      fState.channelScale = btn.dataset.cscale;
      drawRealChannels();
    });
  });

  drawFftLab();

  // =========================================================================
  // SIMULATOR 3: PHM 984-Snapshot Timeline Scrubber & Data Leakage Simulator
  // =========================================================================
  const phmCanvas = document.getElementById('phmCanvas');
  const pCtx = phmCanvas.getContext('2d');
  const sliderPhmCursor = document.getElementById('sliderPhmCursor');
  const btnToggleLeakage = document.getElementById('btnToggleLeakage');

  const pState = {
    cursorIdx: 532,
    leakageActive: false
  };

  function getZoneInfo(idx) {
    if (idx <= 400) return { label: 'TREINO (Saudável)', color: '#10b981' };
    if (idx <= 450) return { label: 'ZONA CINZA (Excluída)', color: '#94a3b8' };
    if (idx <= 530) return { label: 'VALIDAÇÃO (Limiar)', color: '#38bdf8' };
    if (idx <= 981) return { label: 'TESTE (Degradação)', color: '#ef4444' };
    return { label: 'MOTOR DESLIGADO', color: '#f59e0b' };
  }

  function drawPhmTimeline() {
    if (!TELEMETRY) return;
    const c = getThemeColors();
    const W = phmCanvas.width;
    const H = phmCanvas.height;
    pCtx.clearRect(0, 0, W, H);

    const tl = TELEMETRY.timeline;
    const N = tl.idx.length; // 984
    const padX = 52;
    const padY = 30;
    const plotW = W - padX - 20;
    const plotH = H - padY - 40;

    // 1. Draw Shaded Temporal Protocol Zones
    const zones = [
      { start: 0, end: 400, color: 'rgba(16, 185, 129, 0.10)', name: 'TREINO [0..400]' },
      { start: 401, end: 450, color: 'rgba(148, 163, 184, 0.14)', name: 'CINZA' },
      { start: 451, end: 530, color: 'rgba(56, 189, 248, 0.12)', name: 'VAL [451..530]' },
      { start: 531, end: 981, color: 'rgba(239, 68, 68, 0.09)', name: 'TESTE / DEGRADAÇÃO [531..981]' }
    ];

    zones.forEach((z) => {
      const x0 = padX + (z.start / (N - 1)) * plotW;
      const zw = ((z.end - z.start) / (N - 1)) * plotW;
      pCtx.fillStyle = z.color;
      pCtx.fillRect(x0, padY, zw, plotH);
      pCtx.fillStyle = c.muted;
      pCtx.font = '700 9.5px JetBrains Mono, monospace';
      if (zw > 45) pCtx.fillText(z.name, x0 + 6, padY + 15);
    });

    // Highlight Healing Zone (750..880)
    const hx0 = padX + (750 / (N - 1)) * plotW;
    const hxw = ((880 - 750) / (N - 1)) * plotW;
    pCtx.fillStyle = 'rgba(245, 158, 11, 0.14)';
    pCtx.fillRect(hx0, padY + 24, hxw, plotH - 24);
    pCtx.fillStyle = c.amber;
    pCtx.font = '700 9.5px Inter, sans-serif';
    pCtx.fillText('🩹 Healing (750-880)', hx0 + 4, padY + 38);

    pCtx.strokeStyle = c.grid;
    pCtx.strokeRect(padX, padY, plotW, plotH);

    // Compute Z-Score of b1_energy_high & b1_rms either Properly (0..400) or with Data Leakage (0..981)
    const highArr = tl.b1_high;
    const fitEnd = pState.leakageActive ? 981 : 401;
    const fitSlice = highArr.slice(0, fitEnd);
    const meanH = fitSlice.reduce((a, b) => a + b, 0) / fitSlice.length;
    const stdH = Math.sqrt(fitSlice.reduce((a, b) => a + (b - meanH) ** 2, 0) / fitSlice.length) + 1e-9;

    // Plot log10 Reconstruction Error (MLP) vs Threshold
    const scores = tl.score_mlp;
    const threshBase = 0.55;
    const effectiveThresh = pState.leakageActive ? threshBase * 18.5 : threshBase;

    const mapLogY = (val) => {
      const lv = Math.log10(Math.max(1e-3, val));
      // range from -2.2 to +3.8
      const norm = (lv - -2.2) / (3.8 - -2.2);
      return padY + plotH - Math.max(0.02, Math.min(0.96, norm)) * plotH;
    };

    // Draw Threshold Line
    const thY = mapLogY(effectiveThresh);
    pCtx.beginPath();
    pCtx.setLineDash([6, 4]);
    pCtx.moveTo(padX, thY);
    pCtx.lineTo(padX + plotW, thY);
    pCtx.strokeStyle = pState.leakageActive ? c.amber : c.green;
    pCtx.lineWidth = 1.8;
    pCtx.stroke();
    pCtx.setLineDash([]);

    pCtx.fillStyle = pState.leakageActive ? c.amber : c.green;
    pCtx.font = '700 10.5px JetBrains Mono, monospace';
    pCtx.fillText(
      pState.leakageActive
        ? '⚠️ Limiar Contaminado por Data Leakage (Atraso Grave no Alarme!)'
        : '✓ Limiar Calibrado no Treino Saudável (Percentil 99 → Alarme em Idx 532)',
      padX + 10,
      thY - 6
    );

    // Draw MLP Reconstruction Error Curve (log10 scale)
    pCtx.beginPath();
    for (let i = 0; i < 982; i += 2) {
      const px = padX + (i / (N - 1)) * plotW;
      const py = mapLogY(scores[i]);
      if (i === 0) pCtx.moveTo(px, py);
      else pCtx.lineTo(px, py);
    }
    pCtx.strokeStyle = c.cyan;
    pCtx.lineWidth = 2;
    pCtx.stroke();

    // Draw Interactive Cursor Line
    const curX = padX + (pState.cursorIdx / (N - 1)) * plotW;
    pCtx.beginPath();
    pCtx.moveTo(curX, padY);
    pCtx.lineTo(curX, padY + plotH);
    pCtx.strokeStyle = c.text;
    pCtx.lineWidth = 2;
    pCtx.stroke();

    const curPy = mapLogY(scores[Math.min(981, pState.cursorIdx)]);
    pCtx.beginPath();
    pCtx.arc(curX, curPy, 5.5, 0, 2 * Math.PI);
    pCtx.fillStyle = c.red;
    pCtx.fill();
    pCtx.strokeStyle = '#fff';
    pCtx.lineWidth = 1.5;
    pCtx.stroke();

    // Update Readouts
    const idx = pState.cursorIdx;
    const zInfo = getZoneInfo(idx);
    const rulFiles = Math.max(0, 981 - idx);
    const rulHours = (rulFiles * 10) / 60.0;
    const zValHigh = (highArr[idx] - meanH) / stdH;

    document.getElementById('valPhmCursor').textContent = `Idx ${idx} · ${tl.timestamp[idx]}`;
    document.getElementById('phmReadIdx').textContent = `#${idx} (${tl.hours[idx]}h)`;
    const zEl = document.getElementById('phmReadZone');
    zEl.textContent = zInfo.label;
    zEl.style.color = zInfo.color;
    document.getElementById('phmReadRul').textContent =
      idx <= 981 ? `${rulHours.toFixed(2)} h (${rulFiles} arq)` : '0.00 h (Colapso)';
    document.getElementById('phmReadMetrics').textContent = `${tl.b1_rms[idx].toFixed(3)}g / ${tl.b1_kurtosis[idx].toFixed(2)}`;
    document.getElementById('phmReadZ').textContent = `${zValHigh >= 0 ? '+' : ''}${zValHigh.toFixed(1)} σ`;
  }

  sliderPhmCursor.addEventListener('input', (e) => {
    pState.cursorIdx = Number(e.target.value);
    drawPhmTimeline();
  });

  document.querySelectorAll('#phmMilestonePills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#phmMilestonePills .pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      pState.cursorIdx = Number(btn.dataset.idx);
      sliderPhmCursor.value = pState.cursorIdx;
      drawPhmTimeline();
    });
  });

  btnToggleLeakage.addEventListener('click', () => {
    pState.leakageActive = !pState.leakageActive;
    btnToggleLeakage.classList.toggle('active', pState.leakageActive);
    btnToggleLeakage.textContent = pState.leakageActive
      ? '🚨 Data Leakage ATIVO (Clique p/ Restaurar Protocolo Correto)'
      : '🧪 Simular Erro: Split Aleatório (Data Leakage)';
    drawPhmTimeline();
  });

  drawPhmTimeline();

  // =========================================================================
  // SIMULATOR 4: Interactive Neural Autoencoder (11->4->11) & Attribution
  // =========================================================================
  const aeCanvas = document.getElementById('aeCanvas');
  const aeCtx = aeCanvas.getContext('2d');
  const sliderAeSnap = document.getElementById('sliderAeSnap');
  const sliderAeThresh = document.getElementById('sliderAeThresh');

  const SNAPSHOT_KEYS = [50, 100, 250, 400, 425, 480, 520, 532, 535, 560, 601, 646, 705, 760, 820, 880, 920, 951, 975, 981];
  const SHORT_FEAT_NAMES = [
    'rms', 'peak', 'p2p', 'crest', 'kurtosis',
    'e_low', 'e_mid', 'e_high', 'e_bpfo', 'e_bpfi', 'e_bsf2x'
  ];

  const MODEL_SPECS = {
    mlp: {
      title: 'MLP Autoencoder (Denso, L=1)',
      arch: '11 → 32 → 16 → [z=4] → 16 → 32 → 11',
      firstAlarm: 532,
      rulHours: '74.83 h',
      recall: '99.78%',
      far: '5.42%',
      roc: '0.788 / 0.999',
      scoreKey: 'score_mlp',
      baseThresh: 0.55
    },
    lstm: {
      title: 'LSTM Autoencoder (Recorrente, L=5)',
      arch: 'Seq(5×11) → LSTM(16) → [z=4] → LSTM(16) → Seq(5×11)',
      firstAlarm: 535,
      rulHours: '74.33 h',
      recall: '100.0%',
      far: '3.51%',
      roc: '0.860 / 1.000',
      scoreKey: 'score_lstm',
      baseThresh: 0.52
    },
    conv1d: {
      title: 'Conv1D Autoencoder (Convolucional, L=5)',
      arch: 'Seq(5×11) → Conv1D(16,8) → [z=4] → Conv1D → Seq(5×11)',
      firstAlarm: 535,
      rulHours: '74.33 h',
      recall: '100.0%',
      far: '22.80%',
      roc: '0.802 / 1.000',
      scoreKey: 'score_conv1d',
      baseThresh: 0.50
    },
    pca: {
      title: 'PCA Baseline (Projeção Linear, L=1)',
      arch: '11 → Subespaço Linear (8 PCs, 95% var) → 11',
      firstAlarm: 601,
      rulHours: '63.33 h',
      recall: '86.25%',
      far: '1.25%',
      roc: '0.829 / 0.984',
      scoreKey: 'score_pca',
      baseThresh: 0.225
    },
    if: {
      title: 'Isolation Forest (200 Árvores, L=1)',
      arch: '11 → Particionamento Recursivo em 200 Árvores → Score',
      firstAlarm: 636,
      rulHours: '57.50 h',
      recall: '79.08%',
      far: '2.08%',
      roc: '0.900 / 0.984',
      scoreKey: 'score_if',
      baseThresh: 0.585
    }
  };

  const aeState = {
    model: 'mlp',
    snapIndexPos: 7, // index into SNAPSHOT_KEYS -> 532
    threshMult: 1.0
  };

  function drawAeSimulator() {
    if (!TELEMETRY) return;
    const c = getThemeColors();
    const W = aeCanvas.width;
    const H = aeCanvas.height;
    aeCtx.clearRect(0, 0, W, H);

    const spec = MODEL_SPECS[aeState.model];
    const snapIdx = SNAPSHOT_KEYS[aeState.snapIndexPos];
    const snapData = TELEMETRY.snapshots_z[String(snapIdx)];
    const isLinear = aeState.model === 'pca';
    const xZ = snapData.x_z;
    const errVec = isLinear ? snapData.err_pca : snapData.err_ae;
    const totalErr = errVec.reduce((a, b) => a + b, 0) + 1e-9;
    const contribPct = errVec.map((e) => (e / totalErr) * 100);

    // Dynamic threshold check
    const tl = TELEMETRY.timeline;
    const scores = tl[spec.scoreKey];
    const thVal = spec.baseThresh * aeState.threshMult;

    // Find sustained alarm (3 consecutive files > thVal in test 531..981)
    let dynAlarm = null;
    let consec = 0;
    for (let i = 531; i <= 981; i++) {
      if (scores[i] > thVal) {
        consec++;
        if (consec >= 3) {
          dynAlarm = i - 2;
          break;
        }
      } else {
        consec = 0;
      }
    }
    if (aeState.threshMult === 1.0) dynAlarm = spec.firstAlarm;
    const dynRul = dynAlarm ? ((981 - dynAlarm) * 10 / 60).toFixed(2) + ' h' : 'Não disparou';

    document.getElementById('valAeSnap').textContent = `Idx ${snapIdx} (${tl.hours[snapIdx]}h)`;
    document.getElementById('valAeThresh').textContent = `${aeState.threshMult.toFixed(2)}× Limiar Base`;
    document.getElementById('aeReadFirstAlarm').textContent = dynAlarm ? `Idx ${dynAlarm}` : 'Nenhum';
    document.getElementById('aeReadRul').textContent = dynRul;
    document.getElementById('aeReadRecall').textContent = spec.recall;
    document.getElementById('aeReadFar').textContent = spec.far;
    document.getElementById('aeReadRoc').textContent = spec.roc;
    document.getElementById('aeAlarmBadge').textContent = `${spec.title} · 1º Alarme: Idx ${dynAlarm || '-'}`;

    // Left Side: Neural Network Architecture Diagram (11 -> 6 -> 4 -> 6 -> 11 visual nodes)
    const netW = 325;
    aeCtx.fillStyle = c.card;
    aeCtx.fillRect(10, 10, netW, H - 20);
    aeCtx.strokeStyle = c.grid;
    aeCtx.strokeRect(10, 10, netW, H - 20);

    aeCtx.fillStyle = c.text;
    aeCtx.font = '700 11.5px Inter, sans-serif';
    aeCtx.fillText(spec.title, 20, 30);
    aeCtx.fillStyle = c.muted;
    aeCtx.font = '500 10px JetBrains Mono, monospace';
    aeCtx.fillText(spec.arch, 20, 46);

    const layers = [
      { name: 'Input x', count: 11, x: 42 },
      { name: 'Enc', count: 7, x: 112 },
      { name: 'Latente z', count: 4, x: 175 },
      { name: 'Dec', count: 7, x: 238 },
      { name: 'Output x̂', count: 11, x: 305 }
    ];

    const getLayerY = (count, idx) => {
      const span = Math.min(285, count * 25);
      const startY = 205 - span / 2;
      return startY + (idx / Math.max(1, count - 1)) * span;
    };

    // Draw synaptic connections
    for (let l = 0; l < layers.length - 1; l++) {
      const L1 = layers[l];
      const L2 = layers[l + 1];
      for (let i = 0; i < L1.count; i++) {
        for (let j = 0; j < L2.count; j++) {
          const y1 = getLayerY(L1.count, i);
          const y2 = getLayerY(L2.count, j);
          aeCtx.beginPath();
          aeCtx.moveTo(L1.x, y1);
          aeCtx.lineTo(L2.x, y2);
          const isAnom = snapIdx >= 532 && (i === 7 || i === 0 || j === 7 || j === 0);
          aeCtx.strokeStyle = isAnom
            ? 'rgba(245, 158, 11, 0.26)'
            : c.isLight
            ? 'rgba(100, 116, 139, 0.14)'
            : 'rgba(148, 163, 184, 0.11)';
          aeCtx.lineWidth = isAnom ? 1.2 : 0.7;
          aeCtx.stroke();
        }
      }
    }

    // Draw nodes
    layers.forEach((L, lIdx) => {
      aeCtx.fillStyle = c.muted;
      aeCtx.font = '600 9.5px JetBrains Mono, monospace';
      aeCtx.textAlign = 'center';
      aeCtx.fillText(L.name, L.x, H - 18);

      for (let i = 0; i < L.count; i++) {
        const ny = getLayerY(L.count, i);
        aeCtx.beginPath();
        aeCtx.arc(L.x, ny, L.count === 4 ? 7.5 : 5.5, 0, 2 * Math.PI);

        if (L.count === 4) {
          aeCtx.fillStyle = c.purple;
        } else if (lIdx === 0 || lIdx === 4) {
          const cPct = contribPct[i] || 0;
          aeCtx.fillStyle = cPct > 25 ? c.red : cPct > 10 ? c.amber : c.cyan;
        } else {
          aeCtx.fillStyle = c.blue;
        }
        aeCtx.fill();
        aeCtx.strokeStyle = c.bg;
        aeCtx.lineWidth = 1.5;
        aeCtx.stroke();
      }
    });
    aeCtx.textAlign = 'left';

    // Right Side: Per-Feature Attribution Bar Chart (% of Reconstruction Error)
    const barX = 348;
    const barW = W - barX - 12;
    aeCtx.fillStyle = c.card;
    aeCtx.fillRect(barX, 10, barW, H - 20);
    aeCtx.strokeStyle = c.grid;
    aeCtx.strokeRect(barX, 10, barW, H - 20);

    aeCtx.fillStyle = c.text;
    aeCtx.font = '700 11.5px Inter, sans-serif';
    aeCtx.fillText(`Decomposição do Erro por Feature — Idx ${snapIdx}`, barX + 12, 30);
    aeCtx.fillStyle = c.muted;
    aeCtx.font = '500 10px JetBrains Mono, monospace';
    aeCtx.fillText('Fração exata de (x_j - x̂_j)² no Score Total (%)', barX + 12, 46);

    const rowStart = 64;
    const rowH = 27.5;
    const maxBarWidth = barW - 140;

    SHORT_FEAT_NAMES.forEach((fName, j) => {
      const y = rowStart + j * rowH;
      const pct = contribPct[j];
      const zVal = xZ[j];

      // Label
      aeCtx.fillStyle = pct > 20 ? c.text : c.muted;
      aeCtx.font = pct > 20 ? '700 10.5px JetBrains Mono, monospace' : '500 10px JetBrains Mono, monospace';
      aeCtx.fillText(fName, barX + 12, y + 12);

      // Bar background
      const bx = barX + 76;
      aeCtx.fillStyle = c.grid;
      aeCtx.fillRect(bx, y + 2, maxBarWidth, 13);

      // Bar fill
      const fillW = Math.max(2, (pct / 100) * maxBarWidth);
      aeCtx.fillStyle = pct > 35 ? c.red : pct > 15 ? c.amber : c.cyan;
      aeCtx.fillRect(bx, y + 2, fillW, 13);

      // Percentage + Z-score text
      aeCtx.fillStyle = c.text;
      aeCtx.font = '600 9.5px JetBrains Mono, monospace';
      aeCtx.fillText(`${pct.toFixed(1)}% (${zVal >= 0 ? '+' : ''}${zVal.toFixed(1)}σ)`, bx + fillW + 5, y + 12);
    });
  }

  document.querySelectorAll('#modelSelectPills .pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#modelSelectPills .pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      aeState.model = btn.dataset.model;
      drawAeSimulator();
    });
  });

  sliderAeSnap.addEventListener('input', (e) => {
    aeState.snapIndexPos = Number(e.target.value);
    drawAeSimulator();
  });

  sliderAeThresh.addEventListener('input', (e) => {
    aeState.threshMult = Number(e.target.value);
    drawAeSimulator();
  });

  drawAeSimulator();
})();

