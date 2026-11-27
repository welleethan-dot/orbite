# Orbite — mémoire du projet

Ce fichier est la référence du projet. Il est lu automatiquement par Claude au début de chaque session
sur ce dépôt. **Consigne du propriétaire : le tenir à jour à chaque changement** (nouvelle fonction, réglage
modifié, décision prise, idée notée, version publiée), dans le même commit que le changement lui-même.

---

## 1. Le projet en bref

- **Orbite** : jeu d'arcade mobile à une touche. Une sonde tourne autour d'une planète ; un toucher la fait
  passer d'une orbite à l'autre pour éviter les astéroïdes et ramasser des éclats.
- **Mode actuel** : partie infinie, score = nombre de tours. Classement en ligne, profil, boutique de skins.
- **Public actuel** : un petit groupe de testeurs. Pas encore de diffusion publique.
- **Propriétaire** : le compte GitHub `welleethan-dot`. Toutes les décisions passent par lui.

## 2. Adresses et accès

| Quoi | Adresse | Remarque |
|---|---|---|
| Application (testeurs) | https://welleethan-dot.github.io/orbite/ | Version publiée. Installable sur l'écran d'accueil. |
| Adresse de test | https://welleethan-dot.github.io/orbite/beta/ | Version en cours. Sauvegarde séparée, outils de test actifs, **scores envoyés au vrai classement**. |
| Lien Claude | https://claude.ai/artifact/GUnGRoLMjJWHkSFiFF8LvE | Copie pour regarder sur ordinateur. Le classement n'y fonctionne pas (connexions bloquées). |
| Dépôt | https://github.com/welleethan-dot/orbite | Public. GitHub Pages publie la branche `main`. |
| Serveur (Supabase) | https://gnltdkmweifqfceapwws.supabase.co | Région Europe. Tableau de bord : supabase.com/dashboard/project/gnltdkmweifqfceapwws |

**Clés Supabase**
- La **clé publique** (`sb_publishable_…`) est dans `js/08-online.js` (`SUPA_KEY`). Elle est faite pour être visible.
- La **clé secrète / service_role** et le **mot de passe de la base** ne doivent **jamais** être demandés,
  écrits dans le code ou collés dans une conversation.
- Les changements de base se font en donnant un script SQL au propriétaire, qui le colle dans une **nouvelle feuille**
  de l'éditeur SQL (New query) puis Run. Script 2.3 (profil public) appliqué le 27/11/2026.

## 3. Architecture technique

| Fichier | Rôle |
|---|---|
| `index.html` | Les écrans (HTML) et le chargement des fichiers ci-dessous. Aucune dépendance externe. |
| `css/style.css` | Tout le style. |
| `js/01-core.js` … `js/11-game.js` | Le code, découpé par thème : bases et sauvegarde, sons, monde (astéroïdes, éclats, paliers), interface, skins et boutique, didacticiel, nouveautés et correction 2.1.1, classement en ligne, profil et partage, réglages et mode de test, boucle du jeu. **Chargés dans l'ordre du numéro et partageant les mêmes variables** (pas de modules) : un fichier peut utiliser ce qu'un fichier précédent déclare au chargement, et n'importe quoi au moment de jouer. |
| `tools/build.py` | Fabrique les variantes (voir ci-dessous). |
| `tests/run.js` | Tests automatiques (voir § 6). |
| `sw.js` | Mode hors ligne. `CACHE` est réglé automatiquement par `tools/build.py` (`orbite-VERSION`). Ne met en cache que la page de l'application (jamais `/beta/`). Ne met jamais `version.json` en cache. Les fichiers css/js portent `?v=VERSION` : une nouvelle version ne mélange jamais anciens et nouveaux fichiers. |
| `version.json` | Version en ligne. Sert au bandeau « Nouvelle version disponible ». |
| `manifest.webmanifest`, `icons/` | Installation comme application. |
| `supabase/schema.sql` | Script complet de la base, relançable sans risque. **Tout changement de base passe par ce fichier.** |
| `beta/index.html` | Copie de test **fabriquée** par `tools/build.py` (ne pas la modifier à la main). |
| `build/claude.html` | Copie pour le lien Claude, **fabriquée** par `tools/build.py` (non versionnée). |

**Variantes fabriquées par `python3 tools/build.py`** (depuis la racine ; version lue dans `version.json`)
- **Application** : `STORE_PREFIX = 'orbite.'`, mode hors ligne, outils de test désactivés.
- **`/beta/`** (un seul fichier, css et js intégrés) : `STORE_PREFIX = 'orbite-beta.'` (sauvegarde séparée → `TEST_TOOLS` actif), sans manifeste
  ni service worker, eyebrow « Version de test · X.Y », `noindex`, chemins d'icônes en `../icons/`.
- **Lien Claude** (un seul fichier) : sans service worker ; `rpc()` lève immédiatement une erreur `reseau`, et les messages
  réseau sont remplacés par « Le classement en ligne fonctionne uniquement dans l'application ».

**Sauvegarde sur l'appareil (localStorage, préfixe ci-dessus)**
- Scellées, groupe 1 (`v2.seal`) : `v2.best`, `v2.games`, `v2.laps`, `v2.gems`, `v2.wallet`, `v2.owned`, `v2.near`.
- Scellées, groupe 2 (`v2.seal2`) : `v2.stats` (bestChain, bestNearRun, bestGemsRun, bestTime, timeTotal, hops, bestDate, since).
- Non scellées : `v2.skin`, `v2.pid` (identifiant secret du joueur), `v2.pseudo`, `v2.pending` (parties à envoyer),
  `settings`, `muted`, `seenVersion`, `tutoDone`, `boardSort`, `boardPeriod`, `test`, `v2.skinsSent` (skins déjà envoyés, 2.3).
- **Ne jamais ajouter une clé à un groupe de sceau existant** : ça invaliderait le sceau et effacerait la
  progression de tout le monde. Créer un nouveau groupe (`v2.seal3`…).

**Serveur (Supabase)**
- Tables `players`, `scores`, `pseudo_changes` : **aucun accès direct** depuis le jeu (RLS activé, droits retirés).
- Le jeu n'appelle que 6 fonctions : `set_pseudo`, `submit_score`, `get_leaderboard`, `player_info`, et depuis la 2.3
  `set_skins` (skins débloqués + skin équipé, envoyés quand ils changent ; seuls les skins connus sont gardés, 1 envoi / 2 s)
  et `player_profile(pseudo)` (profil public : record et sa date, rang de tous les temps, meilleure série, éclats en une
  partie, parties classées, date d'arrivée, skins). Colonnes `players.skin`, `skins` (null = jamais envoyés), `skins_at`.
  Le profil public ne compte que les parties envoyées au classement (d'où « Parties classées »).
- `submit_score` vérifie : 1 envoi / 3 s, 400 / jour / joueur, tours cohérents avec la durée (bornes calculées
  sur les vitesses normale et difficile), éclats ≤ 3 × (tours / 5) + 3, série ≤ 3 × tours + 3.
- Pseudo : 3 à 16 caractères, filtre de grossièretés, unique (sans tenir compte des majuscules et accents),
  3 changements par mois (remise à zéro le 1er, heure de Paris), ancien pseudo réservé 30 jours et affiché
  « anciennement … » pendant 30 jours.

## 4. Réglages du jeu (valeurs actuelles)

**Vitesse et difficulté**
- Vitesse : `omegaAt(t)`. Normale : 1,5 → 3,25 rad/s en ~45 s. Difficile : 1,75 → 3,6 rad/s en ~40 s.
- **Partie difficile secrète** : 1 partie sur 5, jamais annoncée ni marquée dans le classement.
- Orbites : la sonde va **55 %** plus vite sur l'orbite extérieure (`lanes = [outer/1.55, outer]`).
- Astéroïdes : visent l'orbite du joueur à 60 % → 80 % (tour 40), 90 % puis 100 % s'il reste trop longtemps
  sur une orbite. Un passage reste toujours libre sur l'autre orbite.

**Paliers** (titre en haut + orbites et bords colorés ; rythme d'éclairs propre à chacun)
| Palier | Couleur | Effet |
|---|---|---|
| 30 tours : Pluie d'astéroïdes | Rouge `#FF4D6D` | Astéroïdes plus fréquents et plus proches (jusqu'au tour 60) |
| 40 tours : Astéroïdes rapides | Turquoise `#19E6D2` | Certains foncent vers la sonde (plus nombreux jusqu'au tour 70) |
| 50 tours puis tous les 8 : Inversion | Violet `#B46BFF` | 1,6 s d'alerte sans astéroïde, puis changement de sens |
| 100 tours : bonus | Or `#FFD66B` | « 100 tours · +10 ◆ » (2.4) |
| 200 tours : Inversions folles | Magenta `#FF5BD8` | Inversion tous les 3 à 6 tours au hasard (`chaosGap`), alerte 0,9 s (`CHAOS_WARN`) ; +25 ◆ (2.4) |
| Nouveau record | Or `#FFD66B` | — |

- **Répit (2.4)** : aux tours 30, 40 et 200, les astéroïdes à l'écran disparaissent et rien n'arrive pendant 2 s
  (`CALM_TIME`, `calmSky`) le temps de lire le titre. Réglages des paliers dans `js/04-ui.js` (section « stages »).
- **Bonus de palier (2.4)** : `PALIER_BONUS = {100: 10, 200: 25}`, gardés dans `S.bonus`, ajoutés au porte-monnaie et aux
  éclats gagnés en fin de partie, **jamais** aux éclats de la partie envoyés au serveur (sinon `submit_score` refuserait
  le score : éclats ≤ 3 × tours/5 + 3). L'écran de fin affiche éclats + bonus.
- 3ᵉ anneau au tour 100 : étudié, **mis de côté** par le propriétaire (27/11/2026). Commandes envisagées : aller-retour
  (recommandé), côté de l'écran, boucle.

**Éclats et économie**
- 1 cristal tous les 5 tours. Rares (valent 3) : 2 sur 4 en partie normale, 3 sur 4 en partie difficile.
- ≈ 14 éclats par partie de 50 tours (20 au maximum).
- Prix fixés à « N parties de 50 tours » : Comète 140, Glacier 280, Nébuleuse 700, Aurore 1 400,
  Trou noir 14 000. **Mezen** : skin bonus (portrait pixel), débloqué à **92 390 tours cumulés**.
- Le joueur ne voit **jamais** l'équivalence en parties dans la boutique.

**Dessin (performances, depuis 2.2.2)**
- Aucun `shadowBlur` ni dégradé recalculé à chaque image dans la partie : halos, fond et planète sont peints une fois
  dans de petites images (`glowSprite`, `haloSprite`, `blitBackground` ; cache `glowCache`) puis copiés (`blit`).
- Halo d'astéroïde = halo rond partagé (copié sans rotation, au pixel près) + léger dégradé dans le remplissage
  (lueur intérieure). Visuellement identique à l'ancien flou (comparé image par image).
- `shadowBlur` compte en pixels d'écran, pas en unités de page : en tenir compte (÷ DPR) pour les marges.
- Mesure : scène de 8 astéroïdes, Pixel 7 simulé, processeur ralenti ×6 : 19 → 28 images/s (30 astéroïdes, ×4 : 16 → 30).
  Test « dessin allégé » : 0 flou et 0 dégradé recalculés en 30 images.

**Seconde chance (2.3)** : après une collision, écran « Seconde chance » pendant 6 s (`REVIVE_WAIT`) : reprendre au même
tour pour **100 éclats** du porte-monnaie (`REVIVE_COST`), **une fois par partie**, proposée seulement si le joueur a les
100 éclats. À la reprise : ciel vidé d'astéroïdes, sonde qui clignote et ne peut pas être touchée pendant 2 s (`REVIVE_SHIELD`).
La partie n'est comptée (stats, classement) qu'après le refus ou la fin du temps. Le score repris compte normalement au classement.

**Navigation (2.3)** : flèche retour en haut à gauche de chaque écran de menu (`BACK_OF` dans `js/04-ui.js`) ; elle fait
exactement comme le bouton « Retour… » du bas de l'écran (gardé). Un seul bouton `#backBtn` posé sur la page (pas dans
les écrans : leur fond flouté `backdrop-filter` ferait défiler un élément `fixed` avec le contenu), affiché tant qu'un écran de `BACK_OF` est visible.

**Profil des joueurs (2.3)** : toucher une ligne du classement ouvre « Profil du joueur » (écran `player`, `openPlayer`
dans `js/08-online.js`) : skin équipé animé, pseudo (et « anciennement »), record + date, rang de tous les temps, meilleure
série, éclats en une partie, parties classées, collection de skins, date d'arrivée. Retour : au classement.
Les skins déclarés par le jeu ne sont pas vérifiables côté serveur (affichage seulement).

**Frôlement** : esquive à moins de **0,12 s** de l'impact (`NEAR_TIME`) ou passage très serré (`NEAR_GAP`).
Pas de texte en jeu, sauf le multiplicateur à partir de « x2 ». Série = frôlements à moins de 2,5 s d'écart.

## 5. Sécurité et anti-triche

- Le jeu tourne sur l'appareil du joueur : **rien de ce qui s'y passe n'est fiable à 100 %**. La vraie
  protection est côté serveur.
- Côté jeu : sauvegarde scellée (modification à la main → remise à zéro du groupe concerné), copie privée de
  `Math.hypot` pour les collisions, pseudos toujours affichés en texte (`textContent`, jamais `innerHTML`).
- **Mode de test caché** (5 touchers sur le titre) : **uniquement sur `/beta/`** depuis la 2.1.1.
- **Correction 2.1.1** : un joueur dont « porte-monnaie + skins achetés > éclats gagnés en jeu », ou qui a
  Mezen sans 92 390 tours, perd ses skins (Sonde conservée) et garde la moitié de ses éclats gagnés ;
  message « Pris la main dans le sac », bouton « COMPRIS CHEF ».
- **Limites connues** : un tricheur déterminé peut envoyer au serveur un faux score vraisemblable sans jouer
  (→ vérification par rejeu, à faire). Aucune limite sur la création de joueurs.

## 6. Méthode de travail (à respecter)

1. Le propriétaire décrit ce qu'il veut. Claude **propose** (options + recommandation) quand c'est un choix,
   et **construit** directement quand la demande est claire.
2. Travail sur une branche `version-X.Y`.
3. `python3 tools/build.py && node tests/run.js` : **toute la série doit passer** avant de montrer quoi que ce soit
   (ajouter un test pour chaque nouvelle fonction). `node tests/run.js classement profil` ne lance que ces tests.
   Les tests simulent Supabase : ils n'écrivent jamais dans le vrai classement.
4. **Mise à jour simultanée** de `/beta/` (via `main`) **et** du lien Claude pour que le propriétaire teste.
5. **Le propriétaire relit tous les textes visibles** (nouveautés, messages, boutons) avant publication.
6. Après son « OK » : fusion dans `main` → GitHub Pages publie → vérification du site en ligne.
7. À chaque version : ajouter l'entrée dans `CHANGELOG` (dans `js/07-news.js`), mettre à jour `version.json`,
   relancer `tools/build.py` (cache et numéros de fichiers suivent), mettre la date du jour de publication.
8. Ne rien publier sur `main` (donc sur le site) sans accord explicite.

**Commits** : en français, avec les lignes d'attribution Claude demandées par la session.

**Conventions de texte**
- Jeu en français. Le jeu vouvoie ; les Réglages tutoient (« Envoie-moi un message… ») — **accepté pour les
  testeurs, à harmoniser avant le public**.
- Les nouveautés sont écrites du point de vue du joueur, sans jargon. Ne jamais y révéler la partie difficile
  secrète, le mode de test ou la détection de triche.

## 7. Historique des versions

| Version | Date | Contenu principal |
|---|---|---|
| 1.0 | 16/11/2026 | Première version installable |
| 1.1 | 16/11/2026 | Plein écran mobile, record en tours, difficulté relevée |
| 1.2 – 1.4 | 19/11/2026 | Boutique de skins, éclats tous les 5 tours, prix ×1,4, Mezen |
| 1.5 – 1.7 | 22/11/2026 | Correctifs mobile, son au retour d'arrière-plan, code couleur des annonces |
| 1.8 | 22/11/2026 | Numéro de version, nouveautés, bandeau de mise à jour |
| 1.9 | 23/11/2026 | Paliers en couleur + titre, didacticiel, « Comment jouer », frôlements |
| 2.0 | 25/11/2026 | Classement en ligne (Supabase), pseudo, anti-triche, statistiques détaillées |
| 2.1 | 25/11/2026 | Profil, partage des parties et des skins |
| 2.1.1 | 25/11/2026 | Mode de test retiré de l'application, correction des tricheurs |
| 2.2 | 26/11/2026 | Réglages (son, vibrations, effets réduits, chrono…), accueil épuré |
| 2.2.1 | 26/11/2026 | Technique : jeu découpé en fichiers, script de fabrication, tests automatiques |
| 2.2.2 | 27/11/2026 | Dessin allégé : halos, fond et planète peints une fois puis copiés (≈ +50 % d'images/s sur téléphone lent simulé) |
| 2.3 | 27/11/2026 | Seconde chance (100 ◆, une fois par partie), flèche retour en haut à gauche des écrans, profil des joueurs depuis le classement |
| 2.4 | 27/11/2026 | Répit avant les paliers 30/40, bonus aux tours 100 (+10 ◆) et 200 (+25 ◆), inversions folles dès 200 |

## 8. Décisions prises (et pourquoi)

- **Supabase** plutôt que Firebase ou Neon : base + API + règles d'accès sans serveur à gérer, protections
  gratuites, aucun poids ajouté au jeu, données exportables (PostgreSQL standard).
- **Application web installable** (GitHub Pages) pour les tests ; application native (Capacitor) seulement
  pour l'App Store.
- **Musique** : pas encore. Préférence pour une musique **générée par le code** (quelques Ko, sans droits).
- **Temps de jeu** : enregistré mais **pas affiché** au joueur.
- **Vibrations iPhone** : impossibles en application web (Apple). Astuce iOS 18 mise de côté.
- **Dépôt GitHub public** jusqu'au lancement officiel (GitHub Pages n'est gratuit qu'en public). Au lancement :
  passer en privé avec GitHub Pro, ou changer d'hébergeur en même temps que le nom de domaine.
- **Poids** : le jeu doit rester léger. Signaler toute demande qui ajoute un poids notable (fichiers audio, images).

## 9. Feuille de route

**Priorités validées (dans l'ordre)**
1. ~~Ce document~~ ✅ · ~~script de fabrication, tests automatiques, découpage en fichiers~~ ✅ (2.2.1)
2. ~~Alléger le dessin des halos lumineux~~ ✅ (2.2.2)
3. ~~Double authentification GitHub et Supabase~~ ✅ (faite par le propriétaire le 27/11/2026)
4. Statistiques anonymes des joueurs pour le propriétaire + page **Confidentialité** dans les Réglages
5. Code de transfert de progression, puis sauvegarde en ligne
6. Musique générée par le code (réglage Musique séparé du Son)
7. Décider du modèle économique avant les stores

**Idées notées**
- Mode **Entraînement** (partir du tour 29, 39 ou 49, sans récompense)
- **3ᵉ anneau** à partir du tour 100 (voir § 4, mis de côté)
- **Skin secret** débloqué par une série de frôlements (seuil à définir : x5 difficile, x10 exploit)
- **Défis du jour**, série de jours consécutifs, badges dans le Profil
- Récompense du top 3 de la semaine, défi d'un ami par lien, fantôme du record, skins saisonniers,
  skin réservé aux testeurs
- Amélioration de la partie skins de la boutique et du Profil
- **Niveaux** façon jeu de rythme (fixes, %, essais, univers et musique par niveau) — après la base
- Vérification des scores par rejeu côté serveur
- Adresse e-mail de contact définitive, nom de domaine, forfait Supabase payant au lancement

## 10. Points de vigilance

- **Supabase gratuit** se met en pause après ~7 jours sans activité → « Restore project » dans le tableau de bord.
- **Progression uniquement sur l'appareil** : perdue en changeant de téléphone ou en vidant le navigateur.
  Sur iPhone, jouer dans Safari **sans installer** expose à un effacement par iOS.
- Les scores de `/beta/` comptent dans le vrai classement.
- Jamais vérifié sur un vrai appareil par Claude : menu de partage, vibrations Android, son après
  arrière-plan sur iPhone, bandeau de mise à jour.
- Anciennes branches GitHub non supprimables par Claude (à effacer dans l'onglet Branches si souhaité).
