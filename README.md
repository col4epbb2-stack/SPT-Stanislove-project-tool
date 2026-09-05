# icp-front

Front React 19 + Vite + Tailwind 4 de l'outil ICP (dématérialisation des
classeurs Excel de pilotage de projets d'ingénierie/travaux industriels,
TotalEnergies EP Gabon). Pas de backend : le front parle directement à
Firestore avec le SDK client (`firebase/firestore`).

> Contexte métier, modules, historique des décisions : voir `CLAUDE.md`.
> Ce fichier ne couvre que le démarrage et la configuration.

## Prérequis

Trois outils à avoir avant de cloner le projet : **Git**, **Node.js 22**
(qui apporte npm) et, uniquement pour déployer, le **CLI Firebase**.

### 1. Git

- **macOS** : déjà présent si les outils en ligne de commande Xcode sont
  installés (`xcode-select --install` sinon). Avec Homebrew : `brew install git`.
- **Windows** : [git-scm.com/download/win](https://git-scm.com/download/win)
  (installe aussi Git Bash).
- **Linux (Debian/Ubuntu)** : `sudo apt install git`.

Vérifier : `git --version`.

### 2. Node.js 22 (via nvm — recommandé)

Ce projet a été développé avec **Node.js v22.17.0**. Plutôt que d'installer
Node directement, utiliser **nvm** (Node Version Manager) pour pouvoir
basculer de version selon les projets sans conflit :

**macOS / Linux** :

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# puis fermer/rouvrir le terminal, ou :
source ~/.nvm/nvm.sh

nvm install 22
nvm use 22
```

**Windows** : installer [nvm-windows](https://github.com/coreybutler/nvm-windows/releases)
(exécutable `.exe`), puis dans un terminal :

```
nvm install 22
nvm use 22
```

**Sans nvm**, un installeur officiel fonctionne aussi :
[nodejs.org](https://nodejs.org/) (choisir la version 22.x), ou
`brew install node@22` sur macOS.

Vérifier :

```bash
node -v   # v22.x
npm -v    # 10.x
```

### 3. CLI Firebase (uniquement pour déployer)

Pas nécessaire pour développer en local — seulement pour
`npm run deploy`/`deploy:rules`/`deploy:hosting` :

```bash
npm install -g firebase-tools
firebase --version   # vérifier l'installation

firebase login       # authentification, une seule fois par poste
```

Demander l'accès au projet Firebase concerné (`driver-6ae2b` ou `webicp`
selon la branche, voir plus bas) à un membre de l'équipe qui l'a déjà —
`firebase login` seul ne donne pas automatiquement les droits sur le
projet.

### 4. Éditeur (recommandé, pas obligatoire)

VS Code, avec les extensions ESLint et Tailwind CSS IntelliSense — le
projet n'impose aucun éditeur, mais c'est celui utilisé en développement.

## Installation du projet

```bash
git clone <url-du-dépôt>
cd app_icp_front
npm install
```

`npm install` télécharge toutes les dépendances listées dans
`package.json` (React, Vite, Tailwind, Firebase, etc.) dans `node_modules/` —
rien d'autre à installer manuellement.

## Configuration Firebase

Il n'y a pas de serveur : toute la config (clé API, domaine d'auth, projet)
passe par des variables d'environnement Vite (`VITE_FIREBASE_*`), lues dans
`src/lib/firebase.ts`.

**Deux instances Firebase distinctes, une par branche** :

| Branche | Fichier lu par `npm run dev` | Fichier lu par `npm run build`                        | Projet Firebase | Rôle                                                                                                                   |
| ------- | ---------------------------- | ----------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `main`  | `.env.local`                 | `.env.local` (build forcé en mode `development`)      | `driver-6ae2b`  | Pré-prod — projet **partagé** avec les apps "driver", contient les données réelles importées des classeurs             |
| `prod`  | `.env.local`                 | `.env.production` (mode `production`, défaut de Vite) | `webicp`        | Prod dédiée à cette appli — base Firestore volontairement vide, seuls les comptes créés depuis l'écran Agents y vivent |

- `.env.local` est ignoré par git (`*.local`) : à créer soi-même, jamais
  commité. C'est la config utilisée par `npm run dev` **sur les deux
  branches**.
- `.env.production` est suivi par git sur la branche `prod` (les clés
  publiques d'un projet Firebase web ne sont pas des secrets — elles sont
  protégées par `firestore.rules`, pas par leur confidentialité) : rien à
  configurer pour builder cette branche.
- Sur `main`, le script `build` force `vite build --mode development` pour
  ne jamais embarquer par erreur la config d'une autre instance — voir
  `CLAUDE.md` pour l'incident que ce garde-fou corrige.

### Créer `.env.local` (développement)

```bash
cp .env.local.example .env.local   # si le fichier exemple existe
# sinon, créer .env.local avec :
```

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=.............
VITE_FIREBASE_PROJECT_ID=..............
VITE_FIREBASE_STORAGE_BUCKET=...........
```

Les valeurs réelles sont dans la console Firebase du projet
(Paramètres du projet › Vos applications › SDK web) — à demander à un
membre de l'équipe qui a déjà accès, ou à récupérer dans un gestionnaire de
secrets si l'équipe en a un. Ce fichier n'est volontairement pas commité :
demandez-le plutôt que de le régénérer au hasard.

### Se connecter à l'application

Il n'y a pas d'inscription libre : un compte est un document
`utilisateurs/{uid}` dans Firestore (rôle `admin` ou `agent`), créé soit
depuis l'écran **Agents** de l'application par un admin déjà connecté, soit
directement dans la console Firebase (Authentication + document Firestore
correspondant) pour le tout premier compte.

### Ajouter une nouvelle configuration Firebase (nouveau projet / nouvel environnement)

À faire pour créer une instance de plus — par exemple une base de test
personnelle, sans toucher à `driver-6ae2b` (pré-prod, partagée avec les
apps "driver") ni à `webicp` (prod).

1. **Créer le projet Firebase**
   - [console.firebase.google.com](https://console.firebase.google.com/) →
     « Ajouter un projet ».
   - Activer **Authentication** → méthode de connexion **E-mail/Mot de
     passe**.
   - Activer **Firestore Database** → créer la base (mode production, une
     région proche des utilisateurs).

2. **Enregistrer une application web** dans ce projet (icône `</>` sur la
   page d'accueil du projet) pour obtenir la config SDK :
   `apiKey`, `authDomain`, `projectId`, `storageBucket`.

3. **Renseigner ces valeurs dans un fichier d'environnement local** — soit
   dans `.env.local` si c'est la seule instance utilisée sur ce poste, soit
   dans un fichier dédié (`.env.perso`, par exemple) à charger explicitement :

   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=<projet>.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=<projet>
   VITE_FIREBASE_STORAGE_BUCKET=<projet>.firebasestorage.app
   ```

   Pour builder avec un fichier autre que `.env.local`/`.env.production`,
   passer le mode Vite correspondant : Vite charge `.env.<mode>` (voir la
   [doc Vite sur les modes](https://vite.dev/guide/env-and-mode.html)), par
   exemple `vite build --mode perso` lira `.env.perso`.

4. **Déployer les règles de sécurité** sur ce nouveau projet — ne jamais
   réutiliser `.firebaserc` d'un autre projet sans le changer d'abord :

   ```bash
   firebase use --add        # associe un alias local à ce nouveau projet
   firebase deploy --only firestore:rules
   ```

   `firestore.rules` peut être déployé tel quel : les règles ne matchent
   que les collections ICP, jamais un `match /{document=**}` général —
   elles ne dépendent d'aucune donnée déjà présente dans le projet.

5. **Créer le premier compte admin**, la base étant vide : Authentication
   → « Ajouter un utilisateur » (e-mail + mot de passe), puis créer à la
   main le document Firestore correspondant dans la collection
   `utilisateurs` avec l'UID généré :

   ```
   utilisateurs/{uid}
     name:  "Prénom Nom"
     email: "..."
     role:  "admin"
   ```

   Une fois connecté avec ce compte, les comptes suivants se créent depuis
   l'écran **Agents** de l'application.

⚠️ Ne jamais modifier `.firebaserc`/déployer des règles sur `driver-6ae2b`
ou `webicp` sans confirmation explicite — ce sont des instances partagées
ou de prod, cf. `CLAUDE.md`.

## Lancer le projet en développement

```bash
npm run dev
```

Ouvre sur `http://localhost:5173` (ou `5174` si le port est occupé).

## Scripts disponibles

| Commande                 | Effet                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `npm run dev`            | Serveur de développement Vite (hot reload)                                             |
| `npm run build`          | `tsc -b` (vérification de types) puis `vite build` → `dist/`                           |
| `npm run preview`        | Sert le build de `dist/` en local, pour vérifier le résultat d'un `build`              |
| `npm run lint`           | ESLint sur tout le projet                                                              |
| `npm test`               | Vitest, exécution unique (`vitest run`)                                                |
| `npm run test:watch`     | Vitest en mode watch                                                                   |
| `npm run deploy:rules`   | `firebase deploy --only firestore:rules` — publie **tout** `firestore.rules` d'un coup |
| `npm run deploy:hosting` | `firebase deploy --only hosting` — publie le contenu de `dist/` déjà construit         |
| `npm run deploy`         | `build` puis `deploy:hosting` — le geste courant pour mettre en ligne                  |

## Déploiement

⚠️ Action sur une infrastructure de production (potentiellement partagée,
cf. `CLAUDE.md`) — à confirmer explicitement avant d'exécuter, jamais à
automatiser.

```bash
npm run deploy          # build + déploiement Hosting
npm run deploy:rules    # déploiement des règles Firestore seules
```

Avant tout déploiement, vérifier que `.firebaserc` (`"default"`) cible bien
le projet Firebase attendu pour la branche courante, et — en cas de doute —
que le bundle produit dans `dist/` embarque la bonne instance :

```bash
grep -rl "driver-6ae2b\|webicp" dist/assets/*.js
```

Le CLI Firebase doit être authentifié au préalable (`firebase login`) avec
un compte ayant accès au projet ciblé.

## Structure rapide

```
src/
  lib/            logique pure (moteurs de calcul, Firestore, formatage...)
  contexts/       état global React (Auth, Projects, Navette, Devises...)
  components/     composants par module (ui/ = briques partagées)
  pages/          un composant par écran de menu
  types/          modèles de données
firestore.rules   règles de sécurité Firestore (un seul fichier, déployé en bloc)
firebase.json     config Hosting + emplacement des règles
.firebaserc       projet Firebase ciblé par les commandes `firebase deploy`
```
