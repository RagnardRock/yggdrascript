module.exports = function generateExpress(astRoot) {
    if (!astRoot.server) return "";

    const serverDef = astRoot.server;
    const port = serverDef.portOrBaseUrl || "3000";

    let code = `const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Generated Routes for ${serverDef.name}

// Server State
${(serverDef.state || []).map(s => `let ${s.name} = ${s.value};`).join('\n')}
`;

    serverDef.routes.forEach(route => {
        // 1. Paramètres (Smart Params)
        let paramExtraction = "";
        route.args.forEach(arg => {
            const paramName = arg.substring(1); // Enlève le ?
            const source = (route.method.toLowerCase() === 'get') ? 'req.query' : 'req.body';
            paramExtraction += `  const ${paramName} = ${source}.${paramName};\n`;
        });

        // 2. Gestion du Body et Syntax Hybride
        let bodyCode = "";

        // Helper pour parser les données indentées (YAML-like)
        function parseBlock(lines, baseIndent) {
            if (lines.length === 0) return "null";

            // Détection Array vs Object
            const firstLine = lines[0].trim();
            const isArray = firstLine.startsWith('-');

            if (isArray) {
                const items = [];
                let currentItemLines = [];

                lines.forEach((line, i) => {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('-')) {
                        if (currentItemLines.length > 0) {
                            items.push(parseItem(currentItemLines));
                        }
                        currentItemLines = [line.replace('-', ' ').trimEnd()]; // remove dash, keep indent logic (hacky but simple)
                        // Actually, better: passing the content after dash
                        // If line is "- name: foo", it becomes "  name: foo" effectively for object parsing?
                        // Or straight value: "- 'hello'" -> "'hello'"

                        // Let's handle simple cases first
                        let content = line.substring(line.indexOf('-') + 1).trim();
                        if (content) currentItemLines = [content];
                        else currentItemLines = []; // Block item
                    } else {
                        currentItemLines.push(line);
                    }
                });
                if (currentItemLines.length > 0) items.push(parseItem(currentItemLines));

                return `[${items.join(', ')}]`;

            } else {
                // Object
                const props = [];
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (!trimmed) return;
                    const colonIdx = trimmed.indexOf(':');
                    if (colonIdx !== -1) {
                        const key = trimmed.substring(0, colonIdx).trim();
                        const val = trimmed.substring(colonIdx + 1).trim();
                        // Recursive check or simple value? 
                        // For v0.1 let's assume simple values or simple inline objects
                        props.push(`${key}: ${val}`);
                    }
                });
                return `{ ${props.join(', ')} }`;
            }
        }

        function parseItem(lines) {
            // Simple scalar or nested object
            if (lines.length === 1 && !lines[0].includes(':')) return lines[0]; // "- 'string'"
            return parseBlock(lines); // Nested object
        }


        // Itération sur les lignes du body pour trouver le "return"
        for (let i = 0; i < route.body.length; i++) {
            const line = route.body[i];
            const trimmed = line.trim();

            if (trimmed.startsWith('return')) {
                const rest = trimmed.substring(6).trim();

                // Mode Bloc ? (rien après return ou juste un = ?)
                if (rest === '' || rest === '=') {
                    // On capture tout le reste du body comme bloc de données
                    // Attention: il faudrait vérifier l'indentation, mais on suppose que tout ce qui suit le return fait partie de la donnée
                    const remainingLines = route.body.slice(i + 1);

                    // Logique naïve de parsing YAML-style vers JSON String
                    // Pour ce prototype, on va faire un parser très simple :
                    // On construit un objet JS literal stringifié

                    const jsonString = parseBlock(remainingLines);
                    bodyCode += `  res.json(${jsonString});\n`;
                    break; // Fin de route après return

                } else {
                    // Mode Inline
                    bodyCode += `  res.json(${rest});\n`;
                }
            } else {
                // Code normal (console.log, logic...)
                bodyCode += `  ${trimmed}\n`;
            }
        }

        code += `
app.${route.method.toLowerCase()}('${route.path}', async (req, res) => {
${paramExtraction}
${bodyCode}
  // Auto-reply if no explicit return
  if (!res.headersSent) {
      res.json({ status: 'ok' });
  }
});
`;
    });

    code += `
app.listen(${port}, () => {
  console.log('Server ${serverDef.name} listening on port ${port}');
});
`;

    return code;
};
