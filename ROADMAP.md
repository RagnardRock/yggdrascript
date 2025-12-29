# Roadmap YggdraScript 🌳

Ce document recense les évolutions futures du langage et du compilateur pour transformer YggdraScript en un framework Fullstack "Code Less" robuste.

## 1. Nouveaux Mots-Clés (Syntaxe) 🍬

### Modèles & Données
Définition déclarative des schémas de données, agnostique de la base (SQL/NoSQL).
```ygg
model User
    name: string
    email: string (unique)
    age: int (default: 18)
    posts: relation<Post>
```

### Base de Données
Connexion simplifiée et génération de CRUD automatique.
```ygg
server MyApi : 4444
    db "sqlite://dev.db"
    use ./models.ygg
    crud User /users # Génère GET/POST/PUT/DELETE
```

### Temps Réel (Sockets)
Gestion événementielle native.
```ygg
socket ChatNamespace /chat
    on message(text)
        broadcast("new_msg", text)
```

### Sécurité & Validation
```ygg
guard AdminOnly
    return error(403) if !user.isAdmin

get /secrets [AdminOnly]
    # ...

post /auth ?email
    check email is email
```

### Tâches Planifiées
```ygg
job CleanLogs (every: "1h")
    # ...
```

---

## 2. Architecture & Ecosysteme 🏗️

### Store Global (State Management)
Partage d'état entre pages/composants sans complexité (alternative à Pinia/Redux).
*   **Fichier `store.ygg`** :
    ```ygg
    store Auth
        state user = null
        fn login(u) user = u
    ```
*   **Usage** : Accessible partout via `Auth.user`.

### Gestion des Environnements (Config)
Support natif des variables d'environnement.
*   Objet global `Config` ou fichier `config.ygg`.
*   Ex: `server Api : Config.PORT`

### Composants Natifs Étendus
Enrichir la bibliothèque standard (StdLib) :
*   `Router` / `Page` : Pour la navigation multi-pages.
*   `Form` : Gestion automatique des soumissions.
*   `List` : Affichage optimisé de collections.

### Internationalisation (i18n) 🌍
Intégration fluide de la traduction.

**Piste A : Dictionnaire Centralisé**
Un fichier `locales.ygg` :
```ygg
locale en
    welcome: "Welcome"
locale fr
    welcome: "Bienvenue"
```
Usage : `Text.content: i18n.welcome`

**Piste B : Inline (pour prototypage)**
```ygg
Text
    .content: "Welcome" | "Bienvenue" # Syntax sucre ?
```

---

## 3. Outillage & DX 🛠️

*   **Typage Fort** : Inférence de types entre Back (Models) et Front pour l'autocomplétion.
*   **Hot Reload Avancé** : Optimisation du watcher (ne pas redémarrer le serveur pour un changement de texte).
*   **Extension VSCode** : Coloration syntaxique et snippets (déjà en cours).
