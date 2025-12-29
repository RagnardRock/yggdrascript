module.exports = function parse(sourceCode) {
    const lines = sourceCode.split('\n').filter(l => l.trim().length > 0);

    const root = {
        kind: "Root",
        script: { state: [], functions: [], services: [], imports: [], lifecycle: null },
        children: [],
        properties: []
    };

    let stack = [{ node: root, indent: -1 }];
    let currentFunction = null;

    let inServerBlock = false;
    let serverIndent = -1;

    // Helper : Nettoie les commentaires en respectant les chaînes de caractères
    function removeComment(str) {
        if (!str) return "";
        let inQuote = false;
        let quoteType = null;
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === '"' || char === "'") {
                if (!inQuote) {
                    inQuote = true;
                    quoteType = char;
                } else if (char === quoteType) {
                    inQuote = false;
                    quoteType = null;
                }
            }
            // Si on trouve un # hors des guillemets, c'est un commentaire -> on coupe
            if (char === '#' && !inQuote) {
                return str.substring(0, i).trim();
            }
        }
        return str.trim();
    }

    lines.forEach((line) => {
        const indent = line.search(/\S/);
        const content = line.trim();

        // 1. GESTION DU CORPS DE FONCTION
        if (currentFunction && indent > currentFunction.indent) {
            currentFunction.body.push(line);
            return;
        } else {
            currentFunction = null;
        }
        if (content.startsWith('#')) return;

        // Gestion fin de bloc Server
        if (inServerBlock && indent <= serverIndent) {
            inServerBlock = false;
        }

        // 2. GESTION HIERARCHIE UI
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
            stack.pop();
        }
        const activeNode = stack[stack.length - 1].node;

        // 3. ANALYSE DU CONTENU
        if (content.startsWith('state ')) {
            // Regex améliorée : supporte "state type name = val" ET "state name = val"
            let match = content.match(/state\s+(\w+)\s+(\w+)\s*=\s*(.*)/); // Typed
            let type = match ? match[1] : 'any';
            let name = match ? match[2] : null;
            let value = match ? match[3] : null;

            if (!match) {
                // Untyped: state name = val
                match = content.match(/state\s+(\w+)\s*=\s*(.*)/);
                if (match) {
                    name = match[1];
                    value = match[2];
                }
            }

            if (name && value) {
                const stateObj = {
                    type: type,
                    name: name,
                    value: removeComment(value)
                };

                if (inServerBlock && root.server) {
                    root.server.state = root.server.state || [];
                    root.server.state.push(stateObj);
                } else {
                    root.script.state.push(stateObj);
                }
            }

        } else if (content.startsWith('fn ')) {
            const match = content.match(/fn\s+(\w+)\((.*)\)/);
            if (match) {
                const funcNode = {
                    name: match[1],
                    args: match[2] ? removeComment(match[2]) : "",
                    indent: indent,
                    body: []
                };
                root.script.functions.push(funcNode);
                currentFunction = funcNode;
            }

        } else if (content.startsWith('server ')) {
            // NOUVEAU: Bloc Server
            const match = content.match(/server\s+(\w+)\s*:\s*(.*)/);
            if (match) {
                root.server = {
                    name: match[1],
                    portOrBaseUrl: removeComment(match[2]),
                    routes: []
                };
                inServerBlock = true;
                serverIndent = indent;
            }

        } else if (inServerBlock && /^(get|post|put|delete)\s+/.test(content)) {
            // NOUVEAU: Route API dans le bloc Server
            const parts = content.split(/\s+/);
            const method = parts[0];
            const name = parts[1];
            const path = parts[2]; // ex: /users/:id

            // Extraction des Smart Params (?param)
            const args = [];
            for (let i = 3; i < parts.length; i++) {
                if (parts[i].startsWith('?')) args.push(parts[i]);
            }

            const routeNode = {
                type: 'route',
                method: method,
                name: name,
                path: path,
                args: args,
                indent: indent,
                body: []
            };
            root.server.routes.push(routeNode);
            currentFunction = routeNode;

        } else if (content.startsWith('.')) {
            // ---> PROPRIÉTÉ UI
            const firstColonIndex = content.indexOf(':');
            let keyPart, valPart;

            if (firstColonIndex === -1) {
                keyPart = content;
                valPart = null;
            } else {
                keyPart = content.substring(0, firstColonIndex);
                valPart = content.substring(firstColonIndex + 1);
            }

            const key = keyPart.substring(1).trim();

            // FIX v0.9.2 : Utilisation du nouveau nettoyeur intelligent
            const rawValue = removeComment(valPart);

            // Détection dynamique
            const hasCode = /["']\s*\+|\+\s*["']/.test(rawValue) || rawValue.includes(' ? ') || rawValue.includes('`');
            const isDynamic = hasCode || (!rawValue.startsWith('"') && !rawValue.startsWith("'") && isNaN(Number(rawValue)) && rawValue !== "true" && rawValue !== "false");

            let value = rawValue;
            if (!isDynamic && (value.startsWith('"') || value.startsWith("'"))) {
                value = value.slice(1, -1); // Enlève les guillemets pour le statique
            }

            if (key === 'tag') {
                if (activeNode.meta) activeNode.meta.explicitTag = value;
            } else {
                if (activeNode.properties) {
                    activeNode.properties.push({ key, value, isDynamic });
                }
            }

        } else if (content.startsWith('&')) {
            const selector = content.substring(1).trim();
            const pseudoNode = { kind: "PseudoClass", selector: selector, properties: [], children: [] };
            activeNode.children.push(pseudoNode);
            stack.push({ node: pseudoNode, indent: indent });

        } else if (content.startsWith('if ') || content === 'else' || content.startsWith('loop ')) {
            let kind = 'Condition';
            let type = '';
            let value = null;
            let loopData = null;

            if (content.startsWith('loop ')) {
                kind = 'Loop';
                const match = content.match(/loop\s+(.+)\s+in\s+(.+)/);
                if (match) {
                    loopData = {
                        iterator: match[1].trim(),
                        collection: removeComment(match[2]) // Nettoyage collection
                    };
                }
            } else {
                type = content.startsWith('if ') ? 'if' : 'else';
                value = type === 'if' ? removeComment(content.substring(3)) : null; // Nettoyage condition
            }

            const logicNode = {
                kind: kind,
                type: type,
                value: kind === 'Loop' ? loopData : value,
                children: [],
                properties: []
            };
            activeNode.children.push(logicNode);
            stack.push({ node: logicNode, indent: indent });

        } else if (content.startsWith('service ')) {
            const match = content.match(/service\s+(\w+)\s*:\s*(.*)/);
            if (match) {
                const serviceNode = {
                    kind: 'Service',
                    name: match[1],
                    baseUrl: removeComment(match[2]).replace(/["']/g, ""),
                    indent: indent,
                    body: []
                };
                root.script.services = root.script.services || [];
                root.script.services.push(serviceNode);
                currentFunction = serviceNode;
                currentFunction.isService = true;
            }

        } else if (content.startsWith('use ')) {
            const match = content.match(/use\s+([\w\.\/\-]+)\s+as\s+(\w+)/);
            if (match) {
                root.script.imports = root.script.imports || [];
                root.script.imports.push({ source: match[1], alias: match[2] });
            }

        } else if (content.startsWith('onMount')) {
            const mountNode = {
                name: 'onMount',
                args: '',
                indent: indent,
                body: []
            };
            root.script.lifecycle = mountNode;
            currentFunction = mountNode;

        } else if (/^[A-Z]/.test(content)) {
            const newNode = {
                kind: "UIElement",
                elementType: content,
                meta: { explicitTag: null, autoIndex: 0 },
                properties: [],
                children: []
            };
            activeNode.children.push(newNode);
            stack.push({ node: newNode, indent: indent });
        }
    });

    return root;
};