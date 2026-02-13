# Animatopia — Starter GitHub (ZIP prêt)

Ce ZIP est une base **front-end** (statique) prête pour GitHub Pages.
Il implémente :
- Accueil / onboarding (choix perso F/M, pseudo, infos, option Google stub)
- Boutique (crédits + achats objets/montures/familiers en stub)
- Jeu (3 maps de base, chat par room, 30 messages max, couleur par joueur, hotbar)
- PWA (manifest + service worker)

⚠️ Important : le **vrai multi-joueurs** (chat temps réel entre joueurs, positions live, modération serveur, maisons instanciées) nécessite un backend (WebSocket + DB). Ici, tout est local pour te donner une base propre et scalable.

## Structure
- `index.html` : Accueil / Profil
- `shop.html` : Boutique
- `game.html` : Jeu (placeholder)
- `/data/*.json` : tes données (maps, montures, objets, familiers, persos)
- `/js/*` : logique UI / inventaires / chat / rooms
- `/js/schema.js` : schéma complet (règles du jeu)
- `manifest.webmanifest` + `sw.js` : PWA

## Où ajouter tes contenus
- Montures : `data/mounts.json`
- Objets : `data/items.json`
- Familiers : `data/pets.json`
- Maps : `data/maps.json`
- Personnages : `data/characters.json`

Ensuite, tu adaptes la logique réelle dans :
- `js/game/engine.js` (moteur map)
- `js/game_page.js` (loadout, room switching, HUD)

## Maisons / rooms privées (future)
Dans ton cahier des charges :
- maison = room privée (12 joueurs)
- durée max 1h
- disparaît si propriétaire absent > 30s -> expulsion + téléport vers map d’origine

👉 À implémenter côté serveur (instances) + un écran UI "Maison".

Bon dev 🔥
