# Crafty Controller

Suivez et pilotez depuis Gladys vos **serveurs Minecraft** gérés par
[Crafty Controller](https://craftycontrol.com) : si chacun tourne, combien de
joueurs y sont connectés et lesquels, son processeur et sa mémoire, sa
version. Gladys peut réagir quand un joueur arrive ou part, quand un serveur se
vide ou se remplit, s'arrête de façon inattendue ou redémarre — et démarrer,
arrêter, redémarrer ou sauvegarder un serveur depuis une scène ou le tableau
de bord.

L'intégration dialogue avec l'API REST de Crafty 4 sur votre réseau, avec un
jeton d'API. Rien à installer sur les serveurs. Elle n'est affiliée ni à
Crafty Controller ni à Mojang.

Sans Crafty, l'intégration [Serveurs de jeu (GameDig)](https://github.com/guim31/gladys-gamedig)
(`gladys-gamedig`) lit un serveur Minecraft (et 300 autres jeux) comme la
liste des serveurs du jeu, et
[Minecraft Server](https://github.com/guim31/gladys-minecraft) le lit par
RCON.

> **Testée contre un vrai Crafty Controller 4.11** (un serveur Paper 1.21.4,
> de vrais joueurs connectés, un plantage et un arrêt propre), mais pas encore
> dans un vrai Gladys : vos retours sont les bienvenus. Si quelque chose ne
> marche pas comme décrit, dites-le sur le
> [forum de Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-crafty/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Crafty Controller 4 (vérifié sur la 4.11), joignable depuis Gladys : par
  défaut `https://<adresse de Crafty>:8443`.
- Un **jeton d'API** de Crafty :
  1. dans Crafty, ouvrez **Panneau de configuration → Utilisateurs**,
     modifiez votre utilisateur (ou un utilisateur créé pour Gladys), puis
     l'onglet **Clés API** ;
  2. créez une clé : un nom (`gladys`), et **Accès complet** (ou, pour une clé
     limitée à certains droits : _Commandes_ pour démarrer, arrêter,
     redémarrer et sauvegarder, _Journaux_ pour distinguer un plantage d'un
     arrêt propre) ;
  3. cliquez sur **Obtenir un jeton** et copiez le long texte affiché.

Le jeton agit avec les droits de son utilisateur : un utilisateur qui ne voit
que certains serveurs donne un jeton qui ne voit qu'eux.

## Installation

1. Installez l'intégration : **Intégrations → Installer depuis GitHub**,
   adresse `https://github.com/guim31/gladys-crafty`.
2. Dans sa configuration :
   - **Adresse de Crafty** : l'adresse avec laquelle vous ouvrez Crafty, ex.
     `https://192.168.1.10:8443`. Une adresse IP seule reçoit `https://` et
     le port 8443.
   - **Jeton d'API** : le jeton copié plus haut.
   - **Accepter les certificats auto-signés** : coché par défaut, Crafty
     servant son HTTPS avec son propre certificat. Ne le décochez que si le
     vôtre est reconnu.
   - **Autoriser l'arrêt et le redémarrage** : désactivé par défaut. Arrêter
     ou redémarrer un serveur déconnecte ses joueurs : cochez-le pour les
     permettre depuis les scènes et le widget.
   - **Intervalle de rafraîchissement** : 30 secondes par défaut (Crafty
     mesure lui-même ses serveurs toutes les 30 secondes).
   - **Langue des noms** : des fonctionnalités (fixée à l'ajout d'un
     appareil) et des textes écrits par l'intégration.
3. Cliquez sur **Tester la connexion** : elle liste les serveurs que donne
   Crafty.
4. Dans **Découverte**, ajoutez comme appareils les serveurs voulus.

## L'appareil de chaque serveur

Un appareil par serveur de Crafty, nommé comme lui, conservé s'il est renommé :

| Fonctionnalité        | Valeur                                                         |
| --------------------- | -------------------------------------------------------------- |
| **En marche**         | 1 quand le serveur tourne dans Crafty, 0 quand il est arrêté   |
| **Joueurs connectés** | joueurs connectés (0 quand le serveur est arrêté)              |
| **Places**            | nombre maximal de joueurs, une fois donné par le serveur       |
| **Joueurs**           | qui joue, ex. `Alice, Bob` ; « Personne » ; « Serveur arrêté » |
| **Processeur**        | utilisation du processeur par le serveur, en %                 |
| **Mémoire**           | mémoire utilisée par le serveur, en Mo                         |
| **Version**           | ex. `Paper 1.21.4`, une fois donnée par le serveur             |

Les fonctionnalités des joueurs n'existent que pour les serveurs dont Crafty
compte les joueurs (Minecraft Java et Bedrock). Minecraft donne 12 noms au
plus : au-delà, le texte ajoute « et N autre(s) ».

## Tableau de bord

Le widget **Serveurs Crafty** affiche une tuile par serveur (joueurs
connectés / places, ou son état : arrêté, planté, en démarrage), une liste
avec l'état, la version et qui joue, et des boutons, chacun confirmé
d'abord :

- **Démarrer** pour un serveur arrêté ;
- **Redémarrer** et **Arrêter**, seulement s'ils sont autorisés dans la
  configuration ;
- **Sauvegarder** quand le widget affiche un seul serveur ;
- **Actualiser**.

Tous les serveurs par défaut (trois au plus), ou celui choisi dans les
réglages du widget : un seul serveur affiche aussi son processeur et sa
mémoire.

## Scènes

### Déclencheurs

- **Un joueur a rejoint le serveur Minecraft** — avec le nom quand Minecraft
  donne tous les noms. Filtres : serveur, nom du joueur.
- **Un joueur a quitté le serveur Minecraft** — avec les minutes jouées. Pas
  déclenché quand le serveur s'arrête.
- **Le serveur Minecraft est vide** — le dernier joueur est parti, le serveur
  tourne encore.
- **Le serveur Minecraft est plein** — toutes les places sont prises.
- **Un serveur s'est arrêté de façon inattendue** — un arrêt demandé ni par
  Gladys ni par Crafty : pas d'arrêt propre dans le journal du serveur (la
  clé a besoin du droit _Journaux_), ou la détection de plantage de Crafty.
- **Un serveur a redémarré** — de nouveau en marche après un redémarrage
  (depuis Gladys ou Crafty) ou un arrêt inattendu (variable « Après un arrêt
  inattendu »).

Un arrêt ou un démarrage vu dans Crafty, c'est aussi la fonctionnalité
**En marche** de l'appareil : une scène peut s'en servir directement
(« En marche » passe à 0).

### Actions

- **Démarrer un serveur Minecraft** — rien n'est envoyé s'il tourne déjà.
- **Arrêter un serveur Minecraft** et **Redémarrer un serveur Minecraft** —
  seulement si c'est autorisé dans la configuration, sinon la scène s'arrête
  sur une erreur.
- **Sauvegarder un serveur Minecraft** — lance la sauvegarde par défaut du
  serveur dans Crafty, avec ses réglages (une sauvegarde réglée pour arrêter
  le serveur l'arrête).
- **Lire un serveur Minecraft** — le lit maintenant ; son état (en marche,
  joueurs, processeur, mémoire, version) va aux étapes suivantes : un
  message, ou « Continuer seulement si » sur en marche.

Les quatre commandes donnent « Commande envoyée » (faux quand il n'y avait
rien à faire).

### Idées de scènes

- À 23 h les jours d'école, si le serveur des enfants tourne encore : un
  message, puis **Arrêter un serveur Minecraft**.
- **Le serveur Minecraft est vide** → **Sauvegarder un serveur Minecraft**.
- **Un serveur s'est arrêté de façon inattendue** → une notification, puis
  **Démarrer un serveur Minecraft**.
- **Un joueur a rejoint le serveur Minecraft** (joueur « Alice ») → « Alice
  est sur {{server}} ».

## Dépannage

- **« Crafty injoignable »** : vérifiez l'adresse et le port (8443 par
  défaut), et que Gladys atteint la machine de Crafty.
- **« Certificat refusé »** : cochez « Accepter les certificats auto-signés ».
- **« Cette adresse n'est pas l'API de Crafty »** : en général `http://` sur
  le port HTTPS : utilisez `https://`.
- **« Jeton d'API refusé par Crafty »** : la clé a été supprimée, ou le jeton
  copié en partie : créez un nouveau jeton avec **Obtenir un jeton**.
- **« Droit manquant pour ce jeton dans Crafty »** : donnez à la clé (ou à
  son utilisateur) le droit sur le serveur : _Commandes_ pour les actions.
- **« Crafty répond, mais ce jeton ne voit aucun serveur »** : l'utilisateur
  de la clé n'a aucun serveur, ou la clé n'a aucun droit dessus.
- **Aucun plantage détecté** : sans le droit _Journaux_, l'intégration ne
  peut pas distinguer un plantage d'un arrêt propre ; activez la détection
  de plantage dans Crafty, ou donnez le droit _Journaux_ à la clé.
- Journaux plus détaillés de l'intégration : `LOG_LEVEL=debug`.

## Limites

- Testée contre un vrai Crafty Controller 4.11, pas encore dans un vrai
  Gladys.
- Crafty mesure ses serveurs toutes les 30 secondes : un changement apparaît
  en 30 à 60 secondes, un joueur qui reste moins peut passer inaperçu.
- Minecraft donne 12 noms de joueurs au plus : au-delà, les arrivées et les
  départs n'ont pas de nom.
- Un redémarrage plus rapide que deux lectures n'est vu que par sa nouvelle
  heure de démarrage.
- Les autres serveurs de Crafty (Steam, Hytale) ont l'état en marche, le
  processeur, la mémoire et les commandes, sans joueurs.
- Un seul Crafty par intégration.
