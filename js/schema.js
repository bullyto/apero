/**
Animatopia – Schéma complet (résumé fonctionnel)
================================================
1) Écran Accueil / Connexion
- Choix genre: Féminin / Masculin
- Choix personnage gratuit (liste)
- Pseudo obligatoire
- Infos perso (email/âge/optionnel) + consentement
- Connexion Google possible (stub pour l’instant)
- Accès Boutique depuis l’accueil
- Bouton "Entrer en jeu"

2) Boutique
- Système de crédits
- Achat de crédits (redirection externe -> stub)
- Achat d’objets / montures / familiers via crédits
- Les objets ont une utilité (jetpack, scaphandre, etc.)
- Les familiers sont cosmétiques
- Les montures changent locomotion (sol/eau/air/surface)
- Inventaires séparés: objets / montures / familiers

3) Jeu (Multi-room / multi-map)
- 3 maps de base au départ, extensible (100+)
- Chaque map = room indépendante
- Chat par room:
  - couleur différente par joueur
  - pas d’historique à l’arrivée
  - max 30 messages, FIFO
- Mécaniques:
  - sélection monture active (1 à la fois)
  - familier actif (cosmétique)
  - objet utilitaire actif (hotbar)
- Modération:
  - teleport joueur vers une map (modo)
  - mute 5-15 min
  - prison 10-40 min

4) Maisons (rooms privées temporaires)
- Achat en boutique
- Le joueur peut poser une maison sur une map
- Maison = room privée (12 joueurs)
- Décor intérieur partiellement modifiable
- Durée max 1h
- Si propriétaire hors de la maison > 30s:
  - maison disparaît
  - expulsion des joueurs
  - téléport des joueurs sur la map où la maison était posée

Ce starter GitHub est une base front-end prête.
Le “vrai” temps réel (positions + chat multi-utilisateurs) se branche ensuite via WebSocket/Server.
*/
export const SCHEMA_VERSION = "v1";
