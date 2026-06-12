(() => {
  'use strict';

  const config = window.ADN66_ROUE_CONFIG;
  const storageKeys = {
    prize: 'adn66_roue_prize_v5',
    pending: 'adn66_roue_pending_v5',
    locked: 'adn66_wheel_locked_v1'
  };

  const wheel = document.getElementById('wheel');
  const spinButton = document.getElementById('spinButton');
  const statusText = document.getElementById('statusText');
  const lockedPanel = document.getElementById('lockedPanel');
  const lockedInfo = document.getElementById('lockedInfo');
  const showSavedPrize = document.getElementById('showSavedPrize');

  const resultOverlay = document.getElementById('resultOverlay');
  const resultTitle = document.getElementById('resultTitle');
  const rewardImage = document.getElementById('rewardImage');
  const rewardDetail = document.getElementById('rewardDetail');
  const rewardCode = document.getElementById('rewardCode');
  const closeResult = document.getElementById('closeResult');
  const claimReward = document.getElementById('claimReward');
  const orderLink = document.getElementById('orderLink');

  let isSpinning = false;
  let currentRotation = 0;
  let selectedReward = null;
  let selectedPreview = null;

  if (orderLink) orderLink.href = config.orderUrl;


  // Sons légers générés par le navigateur : pas de fichier audio à ajouter.
  // Le son démarre uniquement après le clic utilisateur, donc compatible mobile/Chrome.
  let audioCtx = null;
  let spinSoundTimer = null;
  let spinOsc = null;
  let spinGain = null;

  function getAudioCtx() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!audioCtx) audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      return audioCtx;
    } catch (_) {
      return null;
    }
  }

  function startSpinSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    stopSpinSound();
    try {
      spinOsc = ctx.createOscillator();
      spinGain = ctx.createGain();
      spinOsc.type = 'triangle';
      spinOsc.frequency.value = 420;
      spinGain.gain.value = 0.0001;
      spinOsc.connect(spinGain);
      spinGain.connect(ctx.destination);
      spinOsc.start();
      spinGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.04);
      let step = 0;
      spinSoundTimer = window.setInterval(() => {
        if (!spinOsc || !spinGain) return;
        step += 1;
        const slowdown = Math.min(1, step / 42);
        const freq = 680 - slowdown * 330 + Math.sin(step * 0.8) * 55;
        spinOsc.frequency.setTargetAtTime(Math.max(260, freq), ctx.currentTime, 0.018);
        spinGain.gain.setTargetAtTime(0.035 + Math.sin(step) * 0.012, ctx.currentTime, 0.025);
      }, 95);
    } catch (_) {}
  }

  function stopSpinSound() {
    if (spinSoundTimer) {
      clearInterval(spinSoundTimer);
      spinSoundTimer = null;
    }
    try {
      if (spinGain && audioCtx) spinGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.055);
      if (spinOsc) {
        const osc = spinOsc;
        window.setTimeout(() => { try { osc.stop(); osc.disconnect(); } catch (_) {} }, 170);
      }
      if (spinGain) {
        const g = spinGain;
        window.setTimeout(() => { try { g.disconnect(); } catch (_) {} }, 220);
      }
    } catch (_) {}
    spinOsc = null;
    spinGain = null;
  }

  function playGainSound(kind = 'win') {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const notes = kind === 'reroll' ? [520, 660] : [523, 659, 784, 1046];
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const start = ctx.currentTime + index * 0.105;
        osc.start(start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(kind === 'reroll' ? 0.045 : 0.07, start + 0.035);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
        osc.stop(start + 0.28);
      });
    } catch (_) {}
  }

  function saveLocalWheelLock(reward, preview) {
    if (!reward || reward.type === 'spin_again' || reward.id === 'WHEEL_REROLL') return null;
    const payload = saveFinalPrize(reward, preview);
    localStorage.setItem(storageKeys.locked, JSON.stringify({
      locked: true,
      id: reward.id,
      label: reward.label,
      lockedAt: now(),
      expiresAt: payload.expiresAt
    }));
    return payload;
  }

  function now() { return Date.now(); }
  function daysToMs(days) { return days * 24 * 60 * 60 * 1000; }
  function safeParse(value) { try { return JSON.parse(value); } catch (_) { return null; } }
  function normalizeAngle(angle) { return ((angle % 360) + 360) % 360; }

  function getSavedPrize() {
    const saved = safeParse(localStorage.getItem(storageKeys.prize));
    if (!saved || !saved.expiresAt || now() > saved.expiresAt) {
      localStorage.removeItem(storageKeys.prize);
      localStorage.removeItem(storageKeys.locked);
      return null;
    }
    return saved;
  }

  function formatRemaining(expiresAt) {
    const diff = Math.max(0, expiresAt - now());
    const days = Math.ceil(diff / daysToMs(1));
    return days > 1 ? `${days} jours restants` : 'Dernier jour de validité';
  }

  function applyLockedState() {
    const saved = getSavedPrize();
    if (!saved) {
      spinButton.disabled = false;
      lockedPanel.classList.add('hidden');
      statusText.textContent = 'Tournez la roue puis récupérez le gain sur votre carte fidélité';
      return;
    }
    spinButton.disabled = true;
    lockedPanel.classList.remove('hidden');
    lockedInfo.textContent = `${saved.label} — ${formatRemaining(saved.expiresAt)}`;
    statusText.textContent = 'Roue déjà jouée sur ce téléphone : votre vrai gain est bloqué localement';
  }

  function getRewardById(id) {
    return config.rewards.find(reward => reward.id === id) || config.rewards[0];
  }

  async function callWheelPreview() {
    if (!config.cloudflarePreviewUrl) throw new Error('missing_cloudflare_preview_url');
    const response = await fetch(config.cloudflarePreviewUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'chance_pwa',
        user_agent: navigator.userAgent,
        created_at: new Date().toISOString()
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.error || 'worker_error');
      err.data = data;
      err.status = response.status;
      throw err;
    }
    return data;
  }

  function spinToReward(reward) {
    const fullTurns = 6 + Math.floor(Math.random() * 3);
    const randomOffset = (Math.random() * 8) - 4;
    const targetAngle = 360 - reward.wheelCenterDeg + randomOffset;
    currentRotation += fullTurns * 360 + normalizeAngle(targetAngle - normalizeAngle(currentRotation));
    wheel.classList.remove('spinning');
    void wheel.offsetWidth;
    wheel.classList.add('spinning');
    wheel.style.setProperty('--wheel-rotation', `${currentRotation}deg`);
  }

  function saveFinalPrize(reward, preview) {
    const payload = {
      id: reward.id,
      label: reward.label,
      code: reward.code,
      detail: reward.detail,
      image: reward.image,
      wonAt: now(),
      expiresAt: now() + daysToMs(config.lockDays),
      preview: preview || null
    };
    localStorage.setItem(storageKeys.prize, JSON.stringify(payload));
    return payload;
  }

  function showResult(reward, savedPayload = null, preview = null) {
    selectedReward = reward || savedPayload;
    selectedPreview = preview || savedPayload?.preview || null;
    resultTitle.textContent = selectedReward.label;
    rewardImage.src = selectedReward.image;
    rewardImage.alt = selectedReward.label;
    rewardDetail.textContent = savedPayload?.detail || selectedReward.detail || '';
    if (selectedReward.type === 'spin_again' || selectedReward.id === 'WHEEL_REROLL') {
      rewardCode.textContent = 'RELANCE';
      if (claimReward) claimReward.textContent = 'Relancer la roue';
    } else {
      rewardCode.textContent = 'À RÉCUPÉRER';
      if (claimReward) claimReward.textContent = 'Récupérer mon gain';
    }
    if (claimReward) claimReward.classList.toggle('claim-cta', !(selectedReward.type === 'spin_again' || selectedReward.id === 'WHEEL_REROLL'));
    resultOverlay.classList.remove('hidden');
  }

  async function startSpin() {
    if (isSpinning) return;
    if (getSavedPrize()) {
      applyLockedState();
      return;
    }

    isSpinning = true;
    spinButton.disabled = true;
    statusText.textContent = 'Préparation du gain sécurisé...';
    startSpinSound();

    let preview;
    try {
      preview = await callWheelPreview();
    } catch (err) {
      stopSpinSound();
      isSpinning = false;
      spinButton.disabled = false;
      statusText.textContent = 'Impossible de contacter le Worker pour le moment';
      return;
    }

    const reward = getRewardById(preview.reward_id);
    selectedPreview = preview;
    statusText.textContent = 'La roue tourne...';
    spinToReward(reward);

    window.setTimeout(() => {
      stopSpinSound();
      isSpinning = false;

      if (preview.final === false || reward.type === 'spin_again') {
        playGainSound('reroll');
        spinButton.disabled = false;
        statusText.textContent = 'Relance gagnée : vous pouvez retourner la roue.';
        showResult(reward, null, preview);
        return;
      }

      localStorage.setItem(storageKeys.pending, JSON.stringify({
        token: preview.token,
        reward_id: preview.reward_id,
        reward_label: preview.reward_label,
        created_at: Date.now()
      }));
      saveLocalWheelLock(reward, preview);
      playGainSound('win');
      statusText.textContent = 'Gain obtenu : récupérez-le avec votre carte fidélité';
      showResult(reward, null, preview);
      applyLockedState();
    }, 5000);
  }

  function openLoyaltyCardForClaim() {
    if (!selectedReward) return;

    if (selectedReward.type === 'spin_again' || selectedReward.id === 'WHEEL_REROLL') {
      resultOverlay.classList.add('hidden');
      startSpin();
      return;
    }

    saveLocalWheelLock(selectedReward, selectedPreview);

    const token = selectedPreview?.token;
    if (!token) {
      statusText.textContent = 'Token de gain introuvable. Retournez la roue.';
      resultOverlay.classList.add('hidden');
      return;
    }

    const url = new URL(config.loyaltyCardUrl || 'https://www.aperos.net/fidel/client.html');
    url.searchParams.set('wheel_token', token);
    url.searchParams.set('wheel_reward', selectedPreview.reward_id || selectedReward.id);
    url.searchParams.set('wheel_label', selectedPreview.reward_label || selectedReward.label);
    window.location.href = url.toString();
  }

  spinButton.addEventListener('click', startSpin);
  if (claimReward) claimReward.addEventListener('click', openLoyaltyCardForClaim);
  closeResult.addEventListener('click', () => resultOverlay.classList.add('hidden'));
  resultOverlay.addEventListener('click', event => {
    if (event.target === resultOverlay) resultOverlay.classList.add('hidden');
  });
  showSavedPrize.addEventListener('click', () => {
    const saved = getSavedPrize();
    if (saved) showResult(null, saved, saved.preview);
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  applyLockedState();
})();
