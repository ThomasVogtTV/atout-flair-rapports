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
- **Le moins de saisie possible sur place** : date et heure du jour déjà posées, deux cases
  pour reprendre du mandant son adresse et son nom quand il est aussi l'occupant, et le
  constat le plus fréquent déjà écrit dans les remarques. Rien à taper quand rien n'est
  trouvé.
- **Photos rattachées à la pièce** : la photo prise depuis une ligne porte déjà le nom de
  la pièce ; annotation au doigt (cercle, flèche, texte) en cyan, comme sous Paint.
- **Signature tactile** du locataire, et signature du technicien reprise d'office :
  enregistrée une fois sur l'appareil, elle remplit la case « Le technicien » de chaque
  nouveau rapport. Le nom et la signature restent modifiables dans le rapport, sans
  toucher au réglage — le cas du collègue envoyé faire une détection.
- **Pièces réordonnables au doigt** : on attrape une carte par son badge numéroté et on la
  fait glisser où l'on veut — la liste défile toute seule quand on approche d'un bord, un
  espace en pointillé montre la place visée. L'ordre à l'écran est celui du PDF.
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
   | `APP_CODE` | code d'accès de votre choix, demandé une fois par appareil |
   | `MAIL_FROM` | `Atout Flair <info@atout-flair.ch>` *(optionnel, valeur par défaut)* |
   | `MAIL_REPLY_TO` | `info@atout-flair.ch` *(optionnel, valeur par défaut)* |
   | `MAIL_BCC` | copie d'archivage *(optionnel)* |

Tant que ces variables ne sont pas renseignées, `/api/send` répond 503 : l'app bascule
alors toute seule sur la file d'attente, et le bouton « Partager / Enregistrer » reste
disponible pour envoyer le PDF depuis l'application mail du téléphone.

`APP_CODE` n'est pas un confort mais une nécessité : le site est public, et sans ce code
l'adresse suffirait à n'importe qui pour envoyer des mails depuis `info@atout-flair.ch`.
Il ne protège que l'envoi, pas l'ouverture de l'app : celle-ci s'ouvre directement sur
l'accueil, sans rien demander. Le code n'est demandé qu'au premier envoi refusé par le
serveur, une seule fois par appareil, et il n'apparaît nulle part dans le code envoyé au
navigateur. Pour le changer, modifier la variable dans Vercel : les appareils le
redemanderont au premier envoi refusé.

### Limite de taille

Une fonction Vercel refuse une requête de plus de 4,5 Mo. L'app vise donc 3 Mo de PDF :
au-delà, elle ré-encode les photos automatiquement (deux paliers), et si le rapport reste
trop lourd elle bascule sur « Partager » plutôt que d'échouer. Voir `PDF_MAX` dans
`src/send.js`.

## Installer l'app sur le téléphone / la tablette

Ouvrir l'adresse du site, puis :

- **Android (Chrome)** : menu ⋮ → « Installer l'application ».
- **iPhone / iPad (Safari)** : Partager → « Sur l'écran d'accueil ».

L'icône se comporte ensuite comme une application : plein écran, démarrage hors ligne.

Une app installée n'est presque jamais fermée : reprise depuis l'arrière-plan, elle
continuerait de faire tourner le code du jour où elle a été ouverte. Elle se recharge donc
d'elle-même dès qu'une nouvelle version prend la main — mais depuis l'accueil seulement,
jamais au milieu d'un rapport (voir `src/main.js`). Pour forcer la mise à jour tout de
suite : fermer complètement l'app (la balayer hors des applications récentes) et la
rouvrir.

## Structure

| Fichier | Rôle |
| --- | --- |
| `src/main.js` | Démarrage, service worker, rechargement automatique des mises à jour |
| `src/templates.js` | Définition des trois types de rapport (colonnes, champs, pièces) |
| `src/state.js` | Modèle de données, persistance, carnet d'adresses, nom de fichier |
| `src/db.js` | Wrapper IndexedDB (rapports, contacts, file d'envoi, réglages) |
| `src/app.js` | Chef d'orchestre : état de l'écran, rendu, interactions, démarrage |
| `src/views/` | Le HTML de chaque écran : `home.js`, `contacts.js`, `editor.js` |
| `src/ui/` | Briques communes : `dom.js` (toast, chargement), `icons.js`, `theme.js`, `dialogs.js`, `chips.js`, `dragsort.js` (glissement des cartes) |
| `src/send.js` | Aperçu PDF, dialogue d'envoi, partage vers la messagerie |
| `src/contact-dialog.js` | Formulaire d'ajout/modification d'un contact |
| `src/photo.js` | Capture, compression, éditeur d'annotations |
| `src/signature.js` | Pad de signature |
| `src/pdf.js` | Génération du PDF (mise en page Atout Flair) |
| `src/mailer.js` | Envoi et file d'attente hors ligne |
| `src/style.css` | Toute la mise en forme, jetons de couleur en tête de fichier |
| `api/send.js` | Fonction serveur d'envoi du mail |
| `public/sw.js` | Service worker (fonctionnement hors ligne) |

Ajouter un quatrième type de rapport se fait dans `src/templates.js` : l'interface et le
PDF s'y adaptent.

Les coordonnées imprimées en pied de page (raison sociale, adresse, téléphone, site) et la
ville des signatures sont en haut de `src/pdf.js` (`SOCIETE`, `VILLE`, `FOOTER_LINE1`,
`FOOTER_LINE2`). Le constat pré-rempli dans « Remarques et recommandations » est
`DEFAULT_REMARQUES` dans `src/state.js` : il disparaît de lui-même si une pièce est
déclarée contaminée, pour qu'un rapport ne puisse pas contredire son propre tableau.

Les couleurs ne sont pas réparties de la même façon à l'écran et sur le papier, et c'est
voulu.

Sur le **PDF**, le rouge est la marque de la maison : numéro de rapport, tirets des
intitulés de rubrique, liserets à gauche des bandeaux — et c'est aussi lui qui signale la
contamination (bandeau de verdict, croix « OUI »). Le vert dit l'absence de punaises. Le
cyan ne tient que les deux longs filets, sous le logo et au pied de page.

Dans l'**app**, trois teintes disent un état et ne servent jamais à autre chose : rouge
pour « contaminée », vert pour « rien trouvé », ambre pour « indéterminé » et pour un envoi
en attente de réseau. Ce sont des repères de la même taille — badge, liseret de carte,
bouton, compteur — où une couleur décorative prêterait à confusion.

Le décor de l'app est donc une famille à part, trois voisines sur la roue : **encre**
(la marque : bandeau du haut, volets de l'accueil, mise au point des champs, badge d'une
pièce pas encore statuée, type « Détection »), **ardoise** (lieu d'intervention, type
« Immeuble ») et **prune** (photos, type « Hôtel »). Elles se lisent comme un ensemble sans
jamais se prendre pour un signal.

Les teintes sont dans `--accent`, `--blue` et `--plum` (`src/style.css`), `ACCENT` et
`RED` (`src/pdf.js`), `MARK` (`src/photo.js`). Le cyan du PDF est volontairement assombri
pour tenir la photocopie ; celui des annotations sur photo est franc, pour ressortir sur un
matelas clair comme sur un sommier sombre — et il ne suit pas l'habillage de l'app, puisque
c'est dans le PDF qu'il finit.

Pour retoucher un écran, ouvrir le fichier de `src/views/` qui porte son nom ; `app.js`
ne contient plus que l'enchaînement des écrans et les réactions aux gestes de l'utilisateur.

## À compléter

- Identifiants SMTP de `info@atout-flair.ch`.
- Le logo utilisé (`public/logo.jpg`) est extrait des PDF existants ; le remplacer par
  le fichier d'origine en haute définition dès qu'il est disponible.
- Le nom d'expéditeur des mails est resté « Atout Flair » alors que le PDF signe
  « Atout-Flair Sàrl ». Rien à changer dans le code : il suffit de définir `MAIL_FROM`
  sur `Atout-Flair Sàrl <info@atout-flair.ch>` dans Vercel.
