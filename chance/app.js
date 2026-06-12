(() => {
  'use strict';

  const config = window.ADN66_ROUE_CONFIG;
  const storageKeys = {
    prize: 'adn66_roue_prize_v4',
    phone: 'adn66_roue_phone_v4'
  };

  const wheel = document.getElementById('wheel');
  const spinButton = document.getElementById('spinButton');
  const statusText = document.getElementById('statusText');
  const lockedPanel = document.getElementById('lockedPanel');
  const lockedInfo = document.getElementById('lockedInfo');
  const showSavedPrize = document.getElementById('showSavedPrize');

  const installOverlay = document.getElementById('installOverlay');
  const playStoreLink = document.getElementById('playStoreLink');
  const installPwaButton = document.getElementById('installPwaButton');
  const alreadyInstalledButton = document.getElementById('alreadyInstalledButton');
  const installHelp = document.getElementById('installHelp');

  const phoneOverlay = document.getElementById('phoneOverlay');
  const phoneInput = document.getElementById('phoneInput');
  const phoneContinue = document.getElementById('phoneContinue');
  const phoneStatus = document.getElementById('phoneStatus');

  const resultOverlay = document.getElementById('resultOverlay');
  const resultTitle = document.getElementById('resultTitle');
  const rewardImage = document.getElementById('rewardImage');
  const rewardDetail = document.getElementById('rewardDetail');
  const rewardCode = document.getElementById('rewardCode');
  const closeResult = document.getElementById('closeResult');
  const copyCode = document.getElementById('copyCode');
  const orderLink = document.getElementById('orderLink');

  let isSpinning = false;
  let currentRotation = 0;
  let selectedReward = null;
  let selectedServerResult = null;
  let deferredInstallPrompt = null;

  playStoreLink.href = config.playStoreUrl;
  orderLink.href = config.orderUrl;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installPwaButton.disabled = false;
  });

  function now() {
    return Date.now();
  }

  function daysToMs(days) {
    return days * 24 * 60 * 60 * 1000;
  }

  function safeParse(value) {
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function normalizePhone(phone) {
    let s = String(phone || '').trim();
    s = s.replace(/\D+/g, '');
    if (s.startsWith('0033')) s = s.slice(4);
    if (s.startsWith('33')) s = s.slice(2);
    if (s.length === 9 && (s[0] === '6' || s[0] === '7')) s = '0' + s;
    return s;
  }

  function isValidPhone(phone) {
    return /^0[67][0-9]{8}$/.test(normalizePhone(phone));
  }

  function isRunningAsInstalledApp() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = window.navigator.standalone === true;
    const androidSource = config.allowAndroidAppSource && new URLSearchParams(window.location.search).get('source') === 'android_app';
    return standalone || iosStandalone || androidSource;
  }

  function showInstallGate() {
    installOverlay.classList.remove('hidden');
    statusText.textContent = 'Application requise pour lancer la roue';
  }

  function refreshInstallState() {
    if (isRunningAsInstalledApp()) {
      installOverlay.classList.add('hidden');
      statusText.textContent = 'Application détectée : vous pouvez jouer';
      return true;
    }

    installHelp.textContent = 'L’application n’est pas encore détectée. Ouvrez la roue depuis l’icône installée sur votre téléphone.';
    return false;
  }

  async function installPwa() {
    if (!deferredInstallPrompt) {
      installHelp.textContent = 'Ouvrez le menu du navigateur puis appuyez sur “Installer l’application”.';
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installHelp.textContent = 'Installation demandée. Ouvrez ensuite la roue depuis l’icône installée.';
  }

  function getSavedPrize() {
    const saved = safeParse(localStorage.getItem(storageKeys.prize));
    if (!saved || !saved.expiresAt || now() > saved.expiresAt) {
      localStorage.removeItem(storageKeys.prize);
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
      statusText.textContent = isRunningAsInstalledApp() ? '100% gagnant' : 'Installez l’application pour jouer';
      return;
    }

    spinButton.disabled = true;
    lockedPanel.classList.remove('hidden');
    lockedInfo.textContent = `${saved.label} — ${formatRemaining(saved.expiresAt)}`;
    statusText.textContent = 'Gain roue déjà enregistré';
  }

  function getRewardById(id) {
    return config.rewards.find(reward => reward.id === id) || config.rewards[0];
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

  function normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
  }

  function saveFinalPrize(reward, serverResult) {
    const payload = {
      id: reward.id,
      label: reward.label,
      code: reward.code,
      detail: buildRewardDetail(reward, serverResult),
      image: reward.image,
      wonAt: now(),
      expiresAt: now() + daysToMs(config.lockDays),
      cloudflareStatus: 'claimed',
      server: serverResult || null
    };
    localStorage.setItem(storageKeys.prize, JSON.stringify(payload));
    return payload;
  }

  function buildRewardDetail(reward, serverResult) {
    if (!serverResult) return reward.detail || '';

    if (serverResult.reward_id === 'WHEEL_DELIVERY_7D') {
      const benefit = serverResult.result || serverResult.benefit || {};
      if (benefit.extended && benefit.expires_at) {
        return `Livraison offerte ajoutée à votre carte fidélité. 7 jours ont été ajoutés. Valable jusqu’au ${formatDate(benefit.expires_at)}.`;
      }
      if (benefit.expires_at) {
        return `Livraison offerte activée sur votre carte fidélité jusqu’au ${formatDate(benefit.expires_at)}.`;
      }
    }

    if (serverResult.reward_id === 'WHEEL_STAMP') {
      const state = serverResult.result || {};
      if (state.points !== undefined && state.goal !== undefined) {
        return `Un tampon a été ajouté sur votre carte fidélité. Nouveau total : ${state.points}/${state.goal}.`;
      }
    }

    if (serverResult.reward_id === 'WHEEL_REROLL') {
      return 'Relance gagnée. Vous pouvez retourner la roue sans bloquer votre vrai gain.';
    }

    return reward.detail || '';
  }

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
    } catch (_) {
      return iso;
    }
  }

  function showResult(reward, savedPayload = null, serverResult = null) {
    selectedReward = reward || savedPayload;
    selectedServerResult = serverResult || savedPayload?.server || null;

    resultTitle.textContent = selectedReward.label;
    rewardImage.src = selectedReward.image;
    rewardImage.alt = selectedReward.label;
    rewardDetail.textContent = savedPayload?.detail || buildRewardDetail(selectedReward, selectedServerResult);

    if (selectedReward.type === 'spin_again' || selectedReward.id === 'WHEEL_REROLL') {
      rewardCode.textContent = 'RELANCE';
    } else {
      rewardCode.textContent = 'VALIDÉ';
    }

    resultOverlay.classList.remove('hidden');
  }

  function showPhoneGate(message = '') {
    const savedPhone = localStorage.getItem(storageKeys.phone) || '';
    if (savedPhone) phoneInput.value = savedPhone;
    phoneStatus.textContent = message;
    phoneContinue.disabled = false;
    phoneOverlay.classList.remove('hidden');
  }

  async function callWheelSpin(phone) {
    if (!config.cloudflareSpinUrl) throw new Error('missing_cloudflare_spin_url');

    const response = await fetch(config.cloudflareSpinUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        source: 'chance_pwa',
        app_mode: isRunningAsInstalledApp() ? 'installed' : 'browser',
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

  async function continueWithPhone() {
    const phone = normalizePhone(phoneInput.value);
    if (!isValidPhone(phone)) {
      phoneStatus.textContent = 'Indiquez un numéro mobile valide lié à votre carte fidélité.';
      return;
    }

    localStorage.setItem(storageKeys.phone, phone);
    phoneOverlay.classList.add('hidden');
    await startSpinWithServer(phone);
  }

  async function startSpinWithServer(phone) {
    if (isSpinning) return;

    isSpinning = true;
    spinButton.disabled = true;
    statusText.textContent = 'Vérification de votre carte fidélité...';

    let serverResult;
    try {
      serverResult = await callWheelSpin(phone);
    } catch (err) {
      isSpinning = false;
      spinButton.disabled = false;

      const data = err?.data || {};
      if (data.error === 'client_not_found') {
        showPhoneGate('Carte fidélité introuvable avec ce numéro. Vérifiez le téléphone ou créez votre carte fidélité.');
        statusText.textContent = 'Carte fidélité introuvable';
        return;
      }

      if (data.error === 'already_wheel_claimed' && data.claim) {
        const reward = getRewardById(data.claim.reward_id);
        const payload = saveFinalPrize(reward, {
          ok: false,
          already: true,
          reward_id: data.claim.reward_id,
          reward_label: data.claim.reward_label,
          claim: data.claim
        });
        payload.detail = `Une récompense roue est déjà enregistrée sur cette carte : ${data.claim.reward_label}.`;
        localStorage.setItem(storageKeys.prize, JSON.stringify(payload));
        showResult(reward, payload, payload.server);
        applyLockedState();
        return;
      }

      statusText.textContent = 'Impossible de contacter le Worker pour le moment';
      return;
    }

    const reward = getRewardById(serverResult.reward_id);
    statusText.textContent = 'La roue tourne...';
    spinToReward(reward);

    window.setTimeout(() => {
      isSpinning = false;

      if (serverResult.final === false || reward.type === 'spin_again') {
        spinButton.disabled = false;
        statusText.textContent = 'Relance gagnée : vous pouvez retourner la roue.';
        showResult(reward, null, serverResult);
        return;
      }

      const saved = saveFinalPrize(reward, serverResult);
      statusText.textContent = 'Récompense validée sur votre carte fidélité';
      showResult(reward, saved, serverResult);
      applyLockedState();
    }, 5000);
  }

  function startSpin() {
    if (isSpinning) return;

    if (config.installRequired && !isRunningAsInstalledApp()) {
      showInstallGate();
      return;
    }

    if (getSavedPrize()) {
      applyLockedState();
      return;
    }

    const phone = normalizePhone(localStorage.getItem(storageKeys.phone) || '');
    if (!isValidPhone(phone)) {
      showPhoneGate();
      return;
    }

    startSpinWithServer(phone);
  }

  spinButton.addEventListener('click', startSpin);
  phoneContinue.addEventListener('click', continueWithPhone);
  installPwaButton.addEventListener('click', installPwa);
  alreadyInstalledButton.addEventListener('click', refreshInstallState);
  closeResult.addEventListener('click', () => resultOverlay.classList.add('hidden'));

  phoneOverlay.addEventListener('click', event => {
    if (event.target === phoneOverlay) phoneOverlay.classList.add('hidden');
  });

  resultOverlay.addEventListener('click', event => {
    if (event.target === resultOverlay) resultOverlay.classList.add('hidden');
  });

  copyCode.addEventListener('click', async () => {
    const text = selectedReward ? `${selectedReward.label} — ${rewardCode.textContent.trim()}` : rewardCode.textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      copyCode.textContent = 'Statut copié ✅';
    } catch (_) {
      copyCode.textContent = rewardCode.textContent.trim();
    }
    window.setTimeout(() => { copyCode.textContent = 'Copier le statut'; }, 1800);
  });

  showSavedPrize.addEventListener('click', () => {
    const saved = getSavedPrize();
    if (saved) showResult(null, saved, saved.server);
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  if (config.installRequired && !isRunningAsInstalledApp()) {
    spinButton.disabled = false;
    statusText.textContent = 'Installez l’application pour jouer';
  }

  applyLockedState();
})();
