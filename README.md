# 🌳 YggdraScript (YGS) - Documentation Technique v0.9

## 1. Philosophie
YggdraScript est un langage unifié conçu pour accélérer le développement d'applications web connectées. Il fusionne la définition des services API, la logique métier et l'interface utilisateur dans un flux unique et lisible.

* **Version actuelle :** v0.9
* **Extension :** `.ygg`
* **Approche :** "Code Less, Do More" (Gestion automatique de l'asynchrone, des imports et du binding).
* **Sortie :** Single File Component Vue 3 (`.vue`) + Script Setup.

---

## 2. Structure d'un Fichier
Un fichier `.ygg` suit une structure logique stricte en 3 temps :
1.  **Contrat (Services)** : Définition des APIs externes.
2.  **Logique (Script)** : État, Imports, Fonctions.
3.  **Interface (Template)** : Arborescence UI.

---

## 3. La Couche Service (API) `Nouveau`
Yggdra permet de déclarer des clients API complets en quelques lignes. Le compilateur génère automatiquement les méthodes `fetch`, gère les Headers JSON et les Query Strings.

### A. Déclaration
Syntaxe : `service [Nom] : [BaseURL]`

    service TodoApi : https://dummyjson.com

### B. Routes & Smart Params
On définit les routes avec un verbe HTTP (`get`, `post`, `put`, `delete`), un nom de fonction, et un chemin.

**Les Arguments "Smart" (`?`) :**
Tout paramètre précédé de `?` devient un argument de la fonction générée.
* **GET** : Transformé en Query String (`url?param=value`).
* **POST/PUT** : Transformé en propriété du Body JSON (`{ param: value }`).

    service TodoApi : https://dummyjson.com
        # 1. Path Param (:id) -> Argument URL
        get   getOne    /todos/:id
        
        # 2. Smart Query (?q) -> Argument Query String
        get   search    /todos/search ?q
        
        # 3. Smart Body (?todo, ?userId) -> Argument JSON Body
        post  add       /todos/add ?todo ?userId
        
        # 4. Mixte (URL + Body)
        put   update    /todos/:id ?completed

### C. Import et Usage
Pour utiliser un service, il faut l'importer dans la logique.
Syntaxe : `use [Service] as [Alias]`

    use TodoApi as api

    fn demo()
        # Appel transparent (génère await api.search("text"))
        res = api.search("text")

---

## 4. La Logique Métier

### A. Le State
Déclaration des variables réactives.
Syntaxe : `state [type] [nom] = [valeur]`

    state array tasks = []
    state string inputValue = ""
    state bool isLoading = false

### B. Lifecycle `Nouveau`
Le bloc `onMount` est exécuté au chargement du composant.

    onMount
        loadData()

### C. Fonctions "Magiques"
L'indentation définit le corps.
* **Async/Await Auto** : Si vous appelez une fonction de service (ex: `api.get()`), le compilateur ajoute `await` automatiquement.
* **Variables Locales** : Si vous assignez une variable qui n'est pas un `state`, le compilateur ajoute `let` ou `const` automatiquement.

    fn loadData()
        isLoading = true
        # Magie : devient 'const data = await api.getAll()'
        data = api.getAll() 
        tasks = data.todos
        isLoading = false

---

## 5. L'Interface Utilisateur (UI)

### A. Éléments
`VBox` (Vertical), `HBox` (Horizontal), `Text`, `Button`, `Input`, `Title`, `Image`.

### B. Propriétés & Binding
* **Valeur Statique** : `.color: "red"`
* **Valeur Dynamique** : `.content: task.title`
* **Two-Way Binding (Inputs)** `Nouveau` :
    Pour lier un `Input` à une variable d'état, utilisez `.value`. Le compilateur génère un `v-model`.

    Input
        .value: inputValue  # Génère v-model="inputValue"

### C. Style & Commentaires
Les propriétés CSS (`.padding`, `.bg`, `.border`...) sont supportées.
* **Note importante :** Les commentaires (`#`) sont supportés en fin de ligne, sauf à l'intérieur des chaînes de caractères complexes (ternaires).

    Text
        .color: isActive ? "#fff" : "#000" # Fonctionne correctement en v0.9
        
### D. Pseudo-classes
Pour cibler un état (comme le survol), utilisez le préfixe & imbriqué dans l'élément.

Button
    .bg: "blue"
    &:hover
        .bg: "darkblue"

### E. Événements
Syntaxe `.on[Event]`.

    Button
        .onClick: handleAdd
        .onKeyup: search

---

## 6. Structures de Contrôle

### A. Conditionnelles (If / Else)
Génère des `<template v-if="...">`.

    if isLoading
        Text.content: "Chargement..."
    else
        VBox.content: "Prêt"

### B. Boucles (Loop)
Génère des `<template v-for="...">`.

    # 1. Simple
    loop item in items
        Text.content: item

    # 2. Avec Index
    loop item, i in items
        Text.content: i + " - " + item.name

    # 3. Avec Clé (Recommandé)
    loop task in tasks
        .key: task.id
        Text.content: task.title

---

## 7. Exemple Complet (v0.9)

    # --- 1. LE CONTRAT D'INTERFACE (SERVICE) ---
# On se connecte à l'API de test DummyJSON
service TodoApi : https://dummyjson.com
    # Récupère la liste (limité à 5 pour l'exemple)
    get     getAll      /todos?limit=5
    
    # Recherche intelligente (?q génère l'argument q)
    get     search      /todos/search ?q
    
    # Création (POST) : ?todo, ?completed, ?userId vont dans le Body JSON
    post    add         /todos/add ?todo ?completed ?userId
    
    # Modification (PUT) : Mix entre URL (:id) et Body (?completed)
    put     update      /todos/:id ?completed


# --- 2. LA LOGIQUE MÉTIER ---
use TodoApi as api

state array tasks = []
state string inputValue = ""
state bool isLoading = false

# Fonction de chargement initiale
fn loadData()
    isLoading = true
    # Le compilateur gère l'attente (await) automatiquement
    data = api.getAll() 
    tasks = data.todos
    isLoading = false

# Ajout d'une tâche (POST)
fn handleAdd()
    if inputValue
        isLoading = true
        # Syntaxe Smart Body : on passe les arguments dans l'ordre défini plus haut
        # add(todo, completed, userId)
        newItem = api.add(inputValue, false, 5)
        
        # On l'ajoute visuellement (car dummyjson ne sauvegarde pas vraiment)
        tasks.push(newItem) 
        inputValue = ""
        isLoading = false

# Modification d'état (PUT)
fn toggleTask(index)
    task = tasks[index]
    # Syntaxe Mixte : update(id, completed)
    api.update(task.id, !task.completed)
    
    # Mise à jour locale
    task.completed = !task.completed

# Démarrage automatique
onMount
    loadData()


# --- 3. L'INTERFACE VISUELLE ---
VBox
    .fontFamily: "Segoe UI, sans-serif"
    .maxWidth: "500px"
    .margin: "40px auto"
    .padding: 30
    .bg: "white"
    .radius: 12
    .shadow: "0 10px 25px rgba(0,0,0,0.1)"
    .gap: 20

    # En-tête
    HBox
        .justify: "space-between"
        .align: "center"
        
        Title
            .content: "Yggdra v0.9"
            .color: "#2c3e50"
        
        if isLoading
            Text
                .content: "Chargement..."
                .size: 12
                .color: "#bdc3c7"

    # Zone de Saisie
    HBox
        .gap: 10
        .height: "40px"

        Input
            .value: inputValue       # v0.8 Two-Way Binding
            .placeholder: "Nouvelle tâche..."
            .flex: 1
            .padding: "0 15px"
            .radius: 8
            .border: "2px solid #eee"
            .outline: "none"
            
            &:focus
                .border: "2px solid #3498db"

        Button
            .text: "Ajouter"
            .onClick: handleAdd
            .bg: "#3498db"
            .color: "white"
            .border: "none"
            .padding: "0 20px"
            .radius: 8
            .cursor: "pointer"
            .weight: "bold"
            
            &:hover
                .bg: "#2980b9"

    # Liste des tâches
    VBox
        .gap: 10
        
        loop task, i in tasks
            .key: task.id
            
            HBox
                .padding: 15
                .bg: task.completed ? "#f8f9fa" : "white"
                .border: "1px solid #f1f1f1"
                .radius: 8
                .align: "center"
                .cursor: "pointer"
                .onClick: toggleTask(i)
                .transition: "all 0.2s"
                
                &:hover
                    .transform: "scale(1.02)"
                    .shadow: "0 2px 8px rgba(0,0,0,0.05)"

                # Checkbox customisée
                VBox
                    .width: 20
                    .height: 20
                    .radius: 6
                    .border: task.completed ? "none" : "2px solid #ddd"
                    .bg: task.completed ? "#2ecc71" : "transparent"
                    .justify: "center"
                    .align: "center"
                    .marginRight: 15
                    
                    if task.completed
                        Text
                            .content: "✓"
                            .color: "white"
                            .size: 12
                            .weight: "bold"

                # Texte de la tâche
                Text
                    .content: task.todo
                    .color: task.completed ? "#aaa" : "#333"
                    .decoration: task.completed ? "line-through" : "none"