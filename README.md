<div align="center">

# 🟡 Orléans Transit — version web

### TER Artenay ⇄ Orléans · Bus & Tram TAO · en temps réel · format vertical

*Application web à installer sur l'écran d'accueil (iPhone et Android), dans l'esprit
de la signalétique du métro de New York (Unimark / Massimo Vignelli).*

</div>

---

## ✨ Ce que fait le site

| Onglet | Contenu |
|---|---|
| **ACCUEIL** | Grande horloge · prochain TER dans chaque sens · état du réseau TAO · passages de vos arrêts favoris |
| **TER** | Artenay → Orléans / Orléans → Artenay (bouton jaune ⇅ pour inverser) · retards, suppressions, perturbations · détail des arrêts |
| **TAO** | Recherche d'arrêt · tableau des passages · plan de chaque ligne · info trafic |
| **CARTE** | Fond CARTO sombre · tracés des lignes · filtres tram/bus · fiche d'arrêt au toucher |
| **RÉGLAGES** | Clés, proxy, diagnostic, installation sur l'écran d'accueil |

Les horaires TAO prévus sont recalculés **chaque nuit** automatiquement ; le temps réel les complète
(retard en rouge, à l'heure en vert, « théo. » = horaire prévu).

---

## 🚀 Mise en ligne (≈ 20 minutes, une seule fois, gratuit)

Trois étapes : **① le proxy Cloudflare**, **② le site sur GitHub**, **③ l'installation sur le téléphone**.

### ① Le proxy Cloudflare (recommandé)

Les navigateurs peuvent bloquer l'accès direct aux serveurs SNCF et TAO (protection « CORS »).
Le proxy règle ce problème, **cache votre clé SNCF** et **compresse** le temps réel TAO (moins de données mobiles).

1. Créez un compte gratuit sur **[dash.cloudflare.com](https://dash.cloudflare.com/sign-up)**.
2. Menu **Workers & Pages** → **Create** → **Create Worker** → nom `orleans-transit` → **Deploy**.
3. **Edit code** → effacez tout → collez le contenu de `worker/worker.js` → **Deploy**.
4. Retour au worker → **Settings → Variables and Secrets → Add** :
   - Type **Secret**, nom `SNCF_KEY`, valeur : votre clé API SNCF → **Deploy**.
   - *(facultatif)* Type **Text**, nom `ALLOWED_ORIGIN`, valeur : `https://VOTRE-NOM.github.io`.
5. Notez l'adresse du worker, du type `https://orleans-transit.VOTRE-NOM.workers.dev`.
   En l'ouvrant dans le navigateur, vous devez lire : **« Orléans Transit proxy : OK »**.

### ② Le site sur GitHub

1. Sur GitHub : **+** → **New repository** → nom `orleans-transit-web` → **Public** → **Create repository**.
   > Le dépôt doit être **public** pour GitHub Pages gratuit. Aucune clé secrète n'est dans les fichiers.
2. **uploading an existing file** → glissez le **contenu** du dossier `orleans_transit_web`
   (`web`, `tools`, `worker`, `README.md`) → **Commit changes**.
3. Le dossier `.github` est masqué et souvent oublié : **Add file → Create new file**,
   nom `.github/workflows/deploy.yml`, collez le contenu du fichier du même nom → **Commit changes**.
4. **Settings → Secrets and variables → Actions → New repository secret** :

   | Name | Valeur |
   |---|---|
   | `PROXY_URL` | l'adresse du worker (étape ①.5) |
   | `CARTO_API_KEY` | votre clé CARTO |

5. **Settings → Pages** → *Build and deployment* → Source : **GitHub Actions**.
6. Onglet **Actions** → **Publier le site** → **Run workflow**. Attendez la ✅ (≈ 2 min).
7. Le site est en ligne : **`https://VOTRE-NOM.github.io/orleans-transit-web/`**

### ③ Sur le téléphone

Ouvrez l'adresse du site, puis :

- **iPhone (Safari)** : bouton **Partager** ⬆️ → **Sur l'écran d'accueil**.
- **Android (Chrome)** : menu **⋮** → **Installer l'application** (ou *Ajouter à l'écran d'accueil*).

L'icône jaune « O » apparaît : l'application s'ouvre en plein écran, comme une vraie app.
**Aucune signature Apple, aucune expiration.**

---

## 🔄 Mises à jour

- **Horaires TAO** : automatiques, chaque nuit vers 3 h.
- **Code** : envoyez les fichiers modifiés sur GitHub, le site se republie tout seul en ~2 min.
- Sur le téléphone, fermez puis rouvrez l'app pour obtenir la nouvelle version.

> ⚠️ GitHub suspend les tâches automatiques d'un dépôt public **sans activité pendant 60 jours**
> (vous recevez un e-mail). Il suffit alors de cliquer sur **Enable workflow** dans l'onglet Actions.

---

## 🔑 Clés : qui voit quoi ?

| Clé | Où elle est | Visible publiquement ? |
|---|---|---|
| SNCF | Secret du worker Cloudflare | ❌ Non |
| CARTO | Insérée dans le site à la publication | ⚠️ Oui (normal pour un fond de carte ; quota gratuit large) |
| Adresse du proxy | Insérée dans le site | ⚠️ Oui → limitez-la avec `ALLOWED_ORIGIN` |

**Sans proxy** : collez votre clé SNCF dans **RÉGLAGES** (elle reste dans votre navigateur).
Si le diagnostic indique *« bloqué par le navigateur (CORS) »*, le proxy est nécessaire.

---

## 🛠️ Dépannage

| Symptôme | Solution |
|---|---|
| Page 404 | **Settings → Pages** : Source = *GitHub Actions*, puis relancez **Publier le site** |
| « Publier le site » absent de Actions | Le fichier `.github/workflows/deploy.yml` manque (étape ②.3) |
| TER : « Clé API SNCF manquante » | Ajoutez le secret `PROXY_URL` (et republiez) ou la clé dans RÉGLAGES |
| TER / TAO : « bloqué par le navigateur (CORS) » | Mettez en place le proxy (étape ①) |
| TER : « SNCF_KEY manquante dans le worker » | Ajoutez le secret `SNCF_KEY` dans Cloudflare |
| Filigrane CARTO sur la carte | Secret `CARTO_API_KEY` absent → ajoutez-le et republiez |
| TAO : « pas d'horaires pour aujourd'hui » | La publication nocturne n'a pas tourné : **Actions → Publier le site → Run workflow** |

**RÉGLAGES → Diagnostic → TESTER** affiche l'état exact de chaque source.

---

## ⚠️ Limites connues

- **Voie TER** : non fournie par l'API SNCF (`VOIE –`), à vérifier en gare.
- **Info trafic TAO** : déduite du temps réel (pas de flux d'alertes officiel).
- **Données mobiles** : le temps réel TAO est rechargé toutes les 45 s tant qu'un écran TAO est ouvert
  (≈ 2 Mo sans proxy, beaucoup moins avec).
- Pas de notifications.

---

## 🧱 Structure

```
orleans_transit_web/
├── .github/workflows/deploy.yml   Publication GitHub Pages + horaires chaque nuit
├── tools/build_data.py            GTFS TAO → fichiers JSON compacts (bibliothèque standard)
├── worker/worker.js               Proxy Cloudflare (SNCF + temps réel TAO)
└── web/
    ├── index.html                 Page unique
    ├── manifest.webmanifest       Installation sur l'écran d'accueil
    ├── sw.js                      Ouverture hors connexion
    ├── css/app.css                Style Vignelli, format vertical
    ├── icons/                     Icônes
    └── js/
        ├── main.js                Navigation, onglets, bouton jaune
        ├── views.js               Écrans
        ├── ui.js                  Puces de ligne, frises, feuilles du bas
        ├── sncf.js                TER (API SNCF / Navitia)
        ├── tao.js                 Réseau TAO (horaires + temps réel)
        ├── gtfsrt.js              Décodeur GTFS-Realtime
        ├── config.js              Adresses et réglages
        └── util.js
```

**Tester sur l'ordinateur** :
```bash
python3 tools/build_data.py web          # crée web/data
cd web && python3 -m http.server 8000    # puis http://localhost:8000
```

---

## 🙏 Crédits

- **TAO** : Orléans Métropole / Keolis Métropole Orléans — [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/), via [transport.data.gouv.fr](https://transport.data.gouv.fr)
- **TER** : [API SNCF](https://www.digital.sncf.com/startup/api), moteur [Navitia](https://doc.navitia.io)
- **Carte** : © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · © [CARTO](https://carto.com/attributions) · [Leaflet](https://leafletjs.com)
- **Police** : [Inter](https://rsms.me/inter/)

*Application personnelle, non affiliée à la SNCF, à TAO, à Keolis ni à la MTA.*
