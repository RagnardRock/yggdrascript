#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const parse = require('../src/compiler/parser');
const generate = require('../src/compiler/generator');
const { spawn } = require('child_process');
const readline = require('readline');

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
    console.log("Usage: ygg [init|build|dev] <args>");
    process.exit(1);
}

// --- UTILS ---
function ask(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(question, ans => {
        rl.close();
        resolve(ans);
    }));
}

// --- BOOTSTRAP ---
(async () => {

    if (command === 'init') {
        const projectName = args[1];
        if (!projectName) {
            console.error("❌ Usage: ygg init <mon-projet>");
            process.exit(1);
        }

        const targetPath = path.resolve(process.cwd(), projectName);
        if (fs.existsSync(targetPath)) {
            console.error(`❌ Le dossier '${projectName}' existe déjà.`);
            process.exit(1);
        }

        console.log(`🚀 Initialisation de '${projectName}'...`);

        const typeAns = await ask("Quel type de projet ? (front/back/both) [both]: ");
        const type = typeAns.trim().toLowerCase() || 'both';

        fs.mkdirSync(targetPath);

        // --- CLIENT SETUP ---
        if (type === 'front' || type === 'both') {
            const clientPath = path.join(targetPath, 'client');
            fs.mkdirSync(clientPath);
            fs.mkdirSync(path.join(clientPath, 'src'));

            // package.json (Client)
            const pkg = {
                name: `${projectName}-client`,
                version: "0.0.0",
                scripts: { "dev": "vite", "build": "vite build", "preview": "vite preview" },
                dependencies: { "vue": "^3.2.45" },
                devDependencies: { "@vitejs/plugin-vue": "^4.0.0", "vite": "^4.1.0" }
            };
            fs.writeFileSync(path.join(clientPath, 'package.json'), JSON.stringify(pkg, null, 2));

            // index.html
            const html = `<!DOCTYPE html><html lang="en"><head><script type="module" src="/src/main.js"></script></head><body><div id="app"></div></body></html>`;
            fs.writeFileSync(path.join(clientPath, 'index.html'), html);

            // src/main.js
            fs.writeFileSync(path.join(clientPath, 'src/main.js'), `import { createApp } from 'vue';\nimport App from './App.vue';\ncreateApp(App).mount('#app');`);

            // src/App.ygg
            fs.writeFileSync(path.join(clientPath, 'src/App.ygg'), `state string msg = "Hello Yggdra !"\n\nVBox\n    Title\n        .content: msg`);

            // Vite Config (Minimal)
            fs.writeFileSync(path.join(clientPath, 'vite.config.js'), `import { defineConfig } from 'vite'; import vue from '@vitejs/plugin-vue'; export default defineConfig({ plugins: [vue()], root: './', server: { port: 5173 } });`);
        }

        // --- SERVER SETUP ---
        if (type === 'back' || type === 'both') {
            const serverPath = path.join(targetPath, 'server');
            fs.mkdirSync(serverPath);

            const pkg = {
                name: `${projectName}-server`,
                version: "0.0.0",
                scripts: { "start": "node api.js" },
                dependencies: { "express": "^4.18.2", "cors": "^2.8.5" }
            };
            fs.writeFileSync(path.join(serverPath, 'package.json'), JSON.stringify(pkg, null, 2));

            // api.ygg
            const apiContent = `server MyApi : 3000\n  get ping /ping\n    return "pong"`;
            fs.writeFileSync(path.join(serverPath, 'api.ygg'), apiContent);
        }

        console.log("\n✅ Projet prêt !");
        console.log(`cd ${projectName}`);
        console.log(`npm install (dans client/ et server/)`);
    }

    else if (command === 'build') {
        const cwd = process.cwd();
        console.log("📦 Compilation...");

        if (fs.existsSync(path.join(cwd, 'client/src'))) {
            compileAll(path.join(cwd, 'client/src'));
        }
        if (fs.existsSync(path.join(cwd, 'server'))) {
            compileAll(path.join(cwd, 'server'));
        }
    }

    else if (command === 'dev') {
        const cwd = process.cwd();
        console.log("🚀 Démarrage Dev Mode...");

        // 1. Compile ALL First
        if (fs.existsSync(path.join(cwd, 'client/src'))) compileAll(path.join(cwd, 'client/src'));
        if (fs.existsSync(path.join(cwd, 'server'))) compileAll(path.join(cwd, 'server'));

        // 2. Start Vite (Client)
        if (fs.existsSync(path.join(cwd, 'client'))) {
            console.log("🌐 Starting Vite...");
            spawn('npm', ['run', 'dev'], { cwd: path.join(cwd, 'client'), stdio: 'inherit', shell: true });
        }

        // 3. Start Node (Server) + Watcher
        let serverProcess = null;

        const startServer = () => {
            if (serverProcess) {
                try {
                    // Force Kill (Windows specific fix for EADDRINUSE)
                    if (process.platform === 'win32') {
                        spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t']);
                    } else {
                        serverProcess.kill('SIGKILL');
                    }
                } catch (e) { /* ignore */ }
            }

            // Wait a bit for port release
            setTimeout(() => {
                // Find generated .js file (assuming api.js from api.ygg)
                const files = fs.readdirSync(path.join(cwd, 'server')).filter(f => f.endsWith('.js'));
                const entry = files.find(f => f !== 'package.json' && f !== 'node_modules'); // Naive
                if (entry) {
                    console.log(`⚙️  Starting Server (${entry})...`);
                    serverProcess = spawn('node', [entry], { cwd: path.join(cwd, 'server'), stdio: 'inherit', shell: true });
                }
            }, 500); // 500ms delay
        };

        if (fs.existsSync(path.join(cwd, 'server'))) {
            startServer();
            // Watch Server
            fs.watch(path.join(cwd, 'server'), { recursive: true }, (evt, file) => {
                if (file && file.endsWith('.ygg')) {
                    console.log(`⚡ [Backend] ${file} changed. Recompiling...`);
                    compileFile(path.join(cwd, 'server', file));
                    startServer(); // Restart Node
                }
            });
        }

        // Watch Client
        if (fs.existsSync(path.join(cwd, 'client/src'))) {
            fs.watch(path.join(cwd, 'client/src'), { recursive: true }, (evt, file) => {
                if (file && file.endsWith('.ygg')) {
                    console.log(`⚡ [Frontend] ${file} changed...`);
                    compileFile(path.join(cwd, 'client/src', file));
                }
            });
        }
    }

})();

// --- COMPILER HELPERS ---

function compileFile(filePath) {
    try {
        const source = fs.readFileSync(filePath, 'utf8');
        const ast = parse(source);
        const code = generate(ast, filePath);

        // Détection auto extension
        let ext = '.vue';
        if (ast.server) ext = '.js';

        const dest = filePath.replace('.ygg', ext);
        fs.writeFileSync(dest, code);
        console.log(`✅ ${path.basename(filePath)} -> ${path.basename(dest)}`);
    } catch (e) {
        console.error(`💥 Erreur ${path.basename(filePath)}:`, e.message);
    }
}

function compileAll(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(f => {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) compileAll(full);
        else if (f.endsWith('.ygg')) compileFile(full);
    });
}