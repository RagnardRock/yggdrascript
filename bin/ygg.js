#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const parse = require('../src/compiler/parser');
const generate = require('../src/compiler/generator');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const command = args[0];
const targetFile = args[1];

if (!command) {
    console.log("Usage: ygg [build|dev] <fichier.ygg>");
    process.exit(1);
}

// --- ROUTEUR ---

if (command === 'init') {
    const projectName = args[1];

    if (!projectName) {
        console.error("❌ Erreur : Veuillez donner un nom au projet.");
        console.error("   Usage: ygg init <mon-projet>");
        process.exit(1);
    }

    const templatePath = path.join(__dirname, '../templates/default');
    const targetPath = path.resolve(process.cwd(), projectName);

    console.log(`🚀 Initialisation du projet '${projectName}'...`);

    if (fs.existsSync(targetPath)) {
        console.error(`❌ Erreur : Le dossier '${projectName}' existe déjà.`);
        process.exit(1);
    }

    // Création du dossier et copie du template
    try {
        copyRecursiveSync(templatePath, targetPath);

        // On crée aussi le dossier src vide pour l'utilisateur
        const srcPath = path.join(targetPath, 'src');
        if (!fs.existsSync(srcPath)) fs.mkdirSync(srcPath);

        // 1. Création du main.js (Le point d'entrée standard de Vue)
        const mainJsContent = `import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')
`;
        fs.writeFileSync(path.join(srcPath, 'main.js'), mainJsContent);

        // 2. Création d'un style CSS avec un reset de base
        const cssContent = `/* 🌳 Yggdra Global Reset */
:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: light dark;
  background-color: #ffffff;
  color: #213547;
}

/* Le plus important : Layout prévisible */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* Plein écran par défaut pour les apps */
html, body, #app {
  width: 100%;
  height: 100%;
  overflow: hidden; /* On laisse les VBox gérer le scroll si besoin */
}

/* Images fluides */
img, video, svg {
  display: block;
  max-width: 100%;
}

/* Boutons plus propres par défaut */
button {
  font-family: inherit;
  cursor: pointer;
}
`;
        fs.writeFileSync(path.join(srcPath, 'style.css'), cssContent);

        // On crée un petit fichier de base pour pas qu'il soit perdu
        const demoContent = `
state string msg = "Hello World"
VBox
    Title
        .content: msg
`;
        fs.writeFileSync(path.join(srcPath, 'App.ygg'), demoContent);
        
        // 3. Mise à jour du package.json avec le nom du projet
        const pkgPath = path.join(targetPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            pkg.name = projectName; // On applique le nom choisi par l'utilisateur
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
        }
        console.log("\n✅ Projet créé avec succès !");
        console.log(`\n👉 Pour commencer :`);
        console.log(`   cd ${projectName}`);
        console.log(`   npm install`);
        console.log(`   ygg dev src/App.ygg`);

    } catch (err) {
        console.error("💥 Erreur lors de la copie du template :", err);
    }
}
else if (command === 'build') {
    ensureFile(targetFile);
    compileFile(targetFile);
}
else if (command === 'dev') {
    ensureFile(targetFile);
    
    // 1. Compilation Initiale
    console.log(`🚀 Démarrage de l'environnement de développement...`);
    compileFile(targetFile);
    
    // 2. Lancement du Serveur Vite (en parallèle)
    // 'stdio: inherit' permet de voir les logs de Vite (couleurs, liens localhost) directement
    const vite = spawn('npm', ['run', 'dev'], { 
        stdio: 'inherit', 
        shell: true,
        cwd: process.cwd() // On s'assure d'être dans le dossier du projet
    });

    // 3. Lancement du Watcher Yggdra
    console.log(`\n🔭 Yggdra Watcher activé sur ${targetFile}...`);

    let isCompiling = false;
    fs.watch(targetFile, (eventType, filename) => {
        if (eventType === 'change' && !isCompiling) {
            isCompiling = true;
            setTimeout(() => {
                // On ne clear plus la console pour ne pas effacer les logs de Vite
                console.log(`⚡ [Yggdra] Modification détectée, recompilation...`);
                compileFile(targetFile);
                isCompiling = false;
            }, 100);
        }
    });

    // Gestion propre de la fermeture (Si on fait Ctrl+C, on tue Vite aussi)
    process.on('SIGINT', () => {
        vite.kill();
        process.exit();
    });
}
else {
    console.log(`❌ Commande inconnue : ${command}`);
}

// --- HELPERS ---

function ensureFile(file) {
    if (!file) {
        console.error("❌ Erreur : Aucun fichier spécifié.");
        process.exit(1);
    }
    if (!fs.existsSync(file)) {
        console.error(`❌ Erreur : Le fichier '${file}' n'existe pas.`);
        process.exit(1);
    }
}

function compileFile(filePath) {
    const fullPath = path.resolve(process.cwd(), filePath);
    const fileName = path.basename(fullPath);

    try {
        const t0 = performance.now(); // Pour mesurer la vitesse !

        const sourceCode = fs.readFileSync(fullPath, 'utf8');
        const ast = parse(sourceCode);
        const vueCode = generate(ast);

        const outputPath = fullPath.replace('.ygg', '.vue');
        fs.writeFileSync(outputPath, vueCode);

        const t1 = performance.now();
        console.log(`✅ Compilé ${fileName} -> ${path.basename(outputPath)} en ${(t1 - t0).toFixed(2)}ms`);

    } catch (err) {
        console.error(`\n💥 ERREUR DANS ${fileName} :`);
        console.error(`   ${err.message}`);
        // En mode dev, on ne quitte pas le processus, on attend la prochaine correction
        if (command !== 'dev') process.exit(1);
    }
}
function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();

    if (isDirectory) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest);
        fs.readdirSync(src).forEach((childItemName) => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}