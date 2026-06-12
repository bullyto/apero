/*
  Configuration de la roue ADN66.
  La décision finale du gain est faite côté Cloudflare Worker.
  Probabilités serveur : Livraison 35 %, Tampon 40 %, Rejouer 25 %.
*/
window.ADN66_ROUE_CONFIG = {
  orderUrl: 'https://aperos.net/',
  playStoreUrl: 'https://play.google.com/store/search?q=Ap%C3%A9ro%20de%20Nuit%2066&c=apps',

  // Worker fidélité ADN66 avec routes /wheel/spin et /wheel/me
  cloudflareSpinUrl: 'https://carte-de-fideliter.apero-nuit-du-66.workers.dev/wheel/spin',
  cloudflareWheelMeUrl: 'https://carte-de-fideliter.apero-nuit-du-66.workers.dev/wheel/me',

  installRequired: true,
  allowAndroidAppSource: true,
  lockDays: 90,

  rewards: [
    {
      id: 'WHEEL_DELIVERY_7D',
      label: 'Livraison offerte pendant 1 semaine',
      wheelLabel: 'Livraison offerte 1 semaine',
      type: 'reward',
      code: 'LIVRAISON7',
      detail: 'Gain validé sur votre carte fidélité. Si une livraison offerte est déjà active, 7 jours sont ajoutés.',
      image: 'assets/rewards/livraison-offerte-1-semaine.png',
      weight: 35,
      wheelCenterDeg: 0
    },
    {
      id: 'WHEEL_STAMP',
      label: '1 tampon sur la carte de fidélité',
      wheelLabel: '1 tampon fidélité',
      type: 'reward',
      code: 'TAMPON1',
      detail: 'Gain validé sur votre carte fidélité. Un tampon est ajouté automatiquement.',
      image: 'assets/rewards/1-tampon-fidelite.png',
      weight: 40,
      wheelCenterDeg: 51.428571
    },
    {
      id: 'WHEEL_REROLL',
      label: 'Retourner la roue',
      wheelLabel: 'Retourner la roue',
      type: 'spin_again',
      code: 'RELANCE',
      detail: 'Relance gagnée. Cette relance ne bloque pas votre vrai gain roue.',
      image: 'assets/rewards/retourner-la-roue.png',
      weight: 25,
      wheelCenterDeg: 102.857142
    }
  ]
};
