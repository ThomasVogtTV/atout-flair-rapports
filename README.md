# Atout Flair — Rapports de détection

Application de terrain (téléphone / tablette) pour les rapports de détection canine de
punaises de lit : saisie du rapport, photos annotées, signature du locataire et envoi du
PDF au mandataire, **sur place, en une seule opération**.

Elle remplace la chaîne actuelle Excel → PDF → photos par mail → Paint → fusion → mail,
qui prenait une douzaine d'heures entre l'intervention et l'envoi.

## Ce qu'elle fait

- **Trois types de rapport** : détection (appartement / maison), immeuble, hôtel.
  La mise en page PDF reprend les modèles Excel existants, logo compris.
- **Carnet de mandants** : régies et gérances enregistrées, saisies une seule fois.
- **Photos rattachées à la pièce** : la photo prise depuis une ligne porte déjà le nom de
  la pièce ; annotation au doigt (cercle, flèche, texte) en rouge, comme sous Paint.
- **Signature tactile** du locataire.
- **Un seul PDF** : rapport + photos annotées + rapports individuels des appartements
  contaminés (immeuble).
- **Hors ligne** : l'app démarre et fonctionne sans réseau (cave, sous-sol, hôtel sans
  wifi). Un envoi lancé sans réseau est mis en file et part automatiquement au retour
  de la connexion.

## Développement

```bash
npm install
npm run dev
```

Puis `npm run build` pour la version de production (dossier `dist/`).

## Mise en ligne (Vercel)

Le projet est un site statique + une fonction serveur (`api/send.js`).

1. Créer le projet sur Vercel, framework « Vite ».
2. Définir les variables d'environnement (Settings → Environment Variables) :

   | Variable | Valeur |
   | --- | --- |
   | `SMTP_HOST` | serveur SMTP du domaine atout-flair.ch |
   | `SMTP_PORT` | `587` (STARTTLS) ou `465` (SSL) |
   | `SMTP_USER` | `info@atout-flair.ch` |
   | `SMTP_PASS` | mot de passe de la boîte |
   | `MAIL_FROM` | `Atout Flair <info@atout-flair.ch>` *(optionnel, valeur par défaut)* |
   | `MAIL_REPLY_TO` | `info@atout-flair.ch` *(optionnel, valeur par défaut)* |
   | `MAIL_BCC` | copie d'archivage *(optionnel)* |

Tant que `SMTP_*` n'est pas renseigné, `/api/send` répond 503 : l'app bascule alors
toute seule sur la file d'attente, et le bouton « Partager / Enregistrer » reste
disponible pour envoyer le PDF depuis l'application mail du téléphone.

## Installer l'app sur le téléphone / la tablette

Ouvrir l'adresse du site, puis :

- **Android (Chrome)** : menu ⋮ → « Installer l'application ».
- **iPhone / iPad (Safari)** : Partager → « Sur l'écran d'accueil ».

L'icône se comporte ensuite comme une application : plein écran, démarrage hors ligne.

## Structure

| Fichier | Rôle |
| --- | --- |
| `src/templates.js` | Définition des trois types de rapport (colonnes, champs, pièces) |
| `src/state.js` | Modèle de données, persistance, carnet d'adresses, nom de fichier |
| `src/db.js` | Wrapper IndexedDB (rapports, contacts, file d'envoi) |
| `src/app.js` | Écrans et interactions |
| `src/photo.js` | Capture, compression, éditeur d'annotations |
| `src/signature.js` | Pad de signature |
| `src/pdf.js` | Génération du PDF (mise en page Atout Flair) |
| `src/mailer.js` | Envoi et file d'attente hors ligne |
| `api/send.js` | Fonction serveur d'envoi du mail |
| `public/sw.js` | Service worker (fonctionnement hors ligne) |

Ajouter un quatrième type de rapport se fait dans `src/templates.js` : l'interface et le
PDF s'y adaptent.

## À compléter

- Identifiants SMTP de `info@atout-flair.ch`.
- Le logo utilisé (`public/logo.jpg`) est extrait des PDF existants ; le remplacer par
  le fichier d'origine en haute définition dès qu'il est disponible.
