# Atout Flair — Rapports de détection

Application de terrain (téléphone / tablette) pour les rapports de détection canine de
punaises de lit : saisie du rapport, photos annotées, signature du locataire et envoi du
PDF au mandataire, **sur place, en une seule opération**.

Elle remplace la chaîne actuelle Excel → PDF → photos par mail → Paint → fusion → mail,
qui prenait une douzaine d'heures entre l'intervention et l'envoi.

## Ce qu'elle fait

- **Trois types de rapport** : détection (appartement / maison), immeuble, hôtel.
  La mise en page PDF reprend les modèles Excel existants, logo compris.
- **Carnet de mandants** : régies et gérances enregistrées, saisies une seule fois. Dès la
  deuxième lettre du nom, le carnet propose les fiches qui correspondent — un tap remplit
  adresse, NPA, courriel et téléphone. Le mandant y entre tout seul au moment de l'envoi,
  quand ses coordonnées sont complètes. Un bouton « Copier » les met dans le presse-papiers
  au format postal, prêtes pour une facture.
- **Le moins de saisie possible sur place** : date et heure du jour déjà posées, deux cases
  pour reprendre du mandant son adresse et son nom quand il est aussi l'occupant, le
  constat le plus fréquent déjà écrit dans les remarques, et des puces de texte à une
  touche qui restent affichées et s'ajoutent les unes aux autres — constats pour le champ
  « Informations » d'une ligne, recommandations pour les remarques. Rien à taper quand rien
  n'est trouvé.
- **Photos rattachées à la pièce** : la photo prise depuis une ligne porte déjà le nom de
  la pièce ; annotation au doigt (cercle, flèche, texte) en cyan, comme sous Paint. Date et
  heure de **prise de vue** apposées en bas à droite — on photographie sur place et on
  termine le rapport le soir.
- **Rien ne se perd** : le rapport en cours s'enregistre tout seul dans l'appareil, se
  reprend d'un geste depuis la pastille en tête de l'accueil, qui n'apparaît que s'il y a de
  quoi reprendre, et la base locale est déclarée persistante auprès du
  navigateur pour qu'il ne la vide pas en manquant de place. Un fichier de sauvegarde
  exportable (carnet de contacts → « Sauvegarde ») rassemble rapports, contacts et
  signature : c'est la seule façon de retrouver son travail sur un téléphone neuf.
- **Signature tactile** sur les trois types de rapport, avec le **nom du signataire** en
  champ libre — sur place, c'est souvent la concierge, un voisin ou un employé qui ouvre la
  porte, et le rapport doit porter le nom de celui qui a réellement signé. Signature du
  technicien reprise d'office :
  enregistrée une fois sur l'appareil, elle remplit la case « Le technicien » de chaque
  nouveau rapport. Le nom et la signature restent modifiables dans le rapport, sans
  toucher au réglage — le cas du collègue envoyé faire une détection.
- **Pièces réordonnables au doigt** : on attrape une carte par son badge numéroté et on la
  fait glisser où l'on veut — la liste défile toute seule quand on approche d'un bord, un
  espace en pointillé montre la place visée. L'ordre à l'écran est celui du PDF.
- **On sait toujours où en est un envoi** : une icône « Envois » dans l'en-tête, avec le
  nombre en attente (ambre) ou en échec (rouge), et un écran à trois rubriques — À corriger,
  En attente, Envoyés. Un refus du serveur de mail y est affiché **en toutes lettres**
  (mot de passe, expéditeur, destinataire, quota), avec un bouton pour réessayer une fois
  la cause corrigée.

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

## Tests

```bash
npm test
```

Le PDF est ce que le client reçoit : une régression y est invisible depuis
l'écran et ne se découvre que chez le destinataire. Les tests le lisent donc
vraiment — pas en le comparant à une image, mais en décompressant ses flux de
contenu et en mesurant les ordres de dessin : quel texte, à quelle place, dans
quelle taille, de quelle couleur, quelle image à quelle dimension.

Ils tournent sous Node, sans navigateur : `test/aide/navigateur.js` fournit des
doublures de `localStorage`, d'IndexedDB, de `navigator.storage` et du `fetch`
du logo — uniquement ce que l'app appelle réellement.

| Fichier | Rôle |
| --- | --- |
| `test/pdf.test.js` | Le document remis au client : pages, pièces, verdict, tableau, annexe photo, typographie |
| `test/state.test.js` | Le modèle : numérotation, suppression en cascade, cycle de vie, sauvegarde, recherche |
| `test/aide/navigateur.js` | Les doublures de navigateur |
| `test/aide/pdf-lecture.js` | Lecture d'un PDF : textes placés, aplats, filets, images |
| `test/aide/rapports.js` | Rapports de référence, construits comme l'app les construit |

```bash
npm run test:mutations
```

Une suite verte ne prouve rien tant qu'on ne l'a pas vue rougir. Ce script casse
l'app un défaut à la fois — chacun étant un défaut qu'on a réellement eu — et
vérifie que la suite le voit. Il doit annoncer **16/16**. Un `TROU` signale un
défaut qui passerait inaperçu : c'est un test à écrire.

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
   | `MAIL_FROM` | `Atout-Flair Sàrl <info@atout-flair.ch>` — nom d'expéditeur, aligné sur la signature du PDF |
   | `MAIL_REPLY_TO` | `info@atout-flair.ch` *(optionnel, valeur par défaut)* |
   | `MAIL_BCC` | copie d'archivage *(optionnel)* |
   | `MAIL_OFF` | `1` coupe l'envoi automatique — voir ci-dessous |

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

**Laisser `APP_CODE` en variable ordinaire, jamais en « Sensitive ».** Une variable
sensible chez Vercel s'écrit mais ne se relit plus — ni dans le tableau de bord, ni en
ligne de commande. `SMTP_PASS` peut se le permettre : il se regénère chez Infomaniak.
`APP_CODE` n'existe nulle part ailleurs que dans cette case, et un code oublié est un
code perdu : plus aucun téléphone ne peut envoyer, l'app annonce « Code d'accès refusé »
à des techniciens qui n'ont rien fait de mal, et il ne reste qu'à en choisir un nouveau
et à le ressaisir sur chaque appareil. C'est arrivé le 22 août 2026.

### Envoi coupé volontairement

`MAIL_OFF=1` fait répondre 503 à `/api/send` avant même de regarder les identifiants.
L'app annonce alors « Envoi automatique pas encore activé » et passe le PDF à la
messagerie du téléphone — le comportement prévu quand la boîte n'est pas branchée.

C'est ce qui est en place depuis le 22 août 2026 : Infomaniak refuse le mot de passe
de `info@atout-flair.ch` (`535 5.7.0 Invalid login or password`), et le mot de passe de
la boîte est introuvable. Sans cet interrupteur, chaque rapport partirait dans un refus,
resterait en brouillon avec un motif obscur, et le technicien recommencerait pour rien.
Retirer `MAIL_OFF` dans Vercel remet l'envoi en service, une fois `SMTP_PASS` corrigé.

Attention : `SMTP_USER` attend l'adresse complète, et le mot de passe demandé est celui
**de la boîte mail**, pas celui du compte Infomaniak. Les confondre donne exactement ce
`535`.

### Pas de moteur de recherche

L'app est un outil interne : elle se transmet par lien, et n'a rien à faire dans les
résultats de recherche. `public/robots.txt`, la balise `robots` de `index.html` et
l'en-tête `X-Robots-Tag` de `vercel.json` le disent trois fois, pour les trois chemins
par lesquels un robot peut arriver.

Ce n'est pas un mot de passe : l'adresse reste ouverte à qui la connaît, et un lien se
transfère. Le contenu, lui, ne quitte jamais l'appareil — rapports, carnet et signature
vivent dans le téléphone de chacun, il n'y a pas de compte ni de base commune à voir.

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
| `src/views/` | Le HTML de chaque écran : `home.js`, `contacts.js`, `editor.js`, `envois.js` |
| `src/ui/` | Briques communes : `dom.js` (toast, chargement), `icons.js`, `theme.js`, `dialogs.js`, `chips.js`, `dragsort.js` (glissement des cartes) |
| `src/send.js` | Aperçu PDF, dialogue d'envoi, partage vers la messagerie |
| `src/contact-dialog.js` | Formulaire d'ajout/modification d'un contact |
| `src/photo.js` | Capture, compression, éditeur d'annotations |
| `src/signature.js` | Pad de signature |
| `src/pdf.js` | Génération du PDF (mise en page Atout Flair) |
| `src/mailer.js` | Envoi, file d'attente, et motif de chaque refus |
| `src/style.css` | Toute la mise en forme, jetons de couleur en tête de fichier |
| `api/send.js` | Fonction serveur d'envoi du mail |
| `public/sw.js` | Service worker (fonctionnement hors ligne) |
| `test/` | Tests et harnais de lecture du PDF (voir « Tests » plus haut) |

Le PDF est écrit avec les polices standard, encodées en WinAnsi. `san()` dans
`src/pdf.js` y ramène ce qui n'y passe pas — « cœur » devient « coeur », « Szymańska »
devient « Szymanska » — au lieu de supprimer la lettre, ce qui faisait partir chez la régie
des rapports amputés sans que rien ne le signale.

Les phrases des puces de saisie rapide (`CONSTATS`, `RECOMMANDATIONS`) sont en tête de
`src/templates.js` : c'est là, et nulle part ailleurs, qu'on les corrige.

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

Le décor prend ce qu'il reste : l'arc **bleu → violet → magenta**, seule portion de la roue
que les états ne revendiquent pas. Le bleu est la marque de l'app (bandeau du haut, volets
de l'accueil, mise au point des champs, badge d'une pièce pas encore statuée, rubriques
« Pièces » et « Le technicien », type « Détection ») ; le violet va au lieu d'intervention
et au type « Immeuble » ; le magenta aux photos et au type « Hôtel ».

Les trois types portent leur couleur sur l'accueil, là où l'on choisit — donc là où elle
sert à reconnaître. Leurs pastilles y sont traitées en relief : dégradé, tache spéculaire,
biseau, lumière rasante du bas et ombre portée teintée, empilés en CSS (voir le bloc
`.type-icon, .type-chip-icon` dans `src/style.css`). L'hôtel y prend un rubis à liseret
champagne, qui ne sort pas de l'accueil : dans un rapport, ce bordeaux se prendrait pour le
rouge de la contamination — la rubrique Photos garde donc le magenta. Dans un rapport ouvert, les rubriques suivent leur propre ordre de
couleurs : y rappeler le type ne faisait qu'un doublon avec la rubrique voisine.

Les teintes sont dans `--accent`, `--violet` et `--magenta` (`src/style.css`), `ACCENT` et
`RED` (`src/pdf.js`), `MARK` (`src/photo.js`). Le cyan du PDF est volontairement assombri
pour tenir la photocopie ; celui des annotations sur photo est franc, pour ressortir sur un
matelas clair comme sur un sommier sombre — et il ne suit pas l'habillage de l'app, puisque
c'est dans le PDF qu'il finit.

L'accueil suit l'ordre des questions qu'on se pose en rouvrant l'app sur le terrain :
**je continue ?** (« En cours », présent seulement s'il y a un brouillon), **je commence ?**
(« Nouveau rapport »), **je cherche ?** (« Mes rapports », replié sur les trois derniers).
Il parle la même langue que l'écran de saisie — des rubriques à petite icône, intitulé en
capitales et filet jusqu'au bord — au lieu des volets repliables qu'il s'était inventés :
une seule grammaire pour toute l'app, et le flou d'arrière-plan porté par la feuille elle-
même plutôt que par chaque volet.

L'en-tête ne garde qu'un bouton, le carnet — une destination, pas un document. Le thème
a rejoint l'écran « Carnet et réglages », avec la sauvegarde : c'est un réglage, pas une
action de terrain. Il s'y choisit entre **Système**, **Clair** et **Sombre** ; l'ancien
bouton bascule ne connaissait que les deux derniers et, une fois touché, ne savait plus
rendre la main au réglage du téléphone.

Pour retoucher un écran, ouvrir le fichier de `src/views/` qui porte son nom ; `app.js`
ne contient plus que l'enchaînement des écrans et les réactions aux gestes de l'utilisateur.

## À compléter

- Le logo utilisé (`public/logo.jpg`) est extrait des PDF existants ; le remplacer par
  le fichier d'origine en haute définition dès qu'il est disponible.
- `MAIL_BCC` reste vide : aucune copie d'archivage n'est gardée côté boîte. La copie
  proposée dans le dialogue d'envoi est autre chose — elle part du téléphone, et le
  technicien peut la retirer.
