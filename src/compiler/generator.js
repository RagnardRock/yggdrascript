const grammar = require('./grammar');

module.exports = function generate(astRoot) {
    let cssMap = {};
    let typeCounters = {};

    // --- 1. GÉNÉRATION DU SCRIPT (LOGIQUE) ---
    let scriptContent = "";
    const stateNames = astRoot.script.state.map(s => s.name);

    // A. Génération des États 
    if (astRoot.script.state.length > 0) {
        scriptContent += astRoot.script.state.map(s => {
            return `const ${s.name} = ref(${s.value});`;
        }).join('\n') + "\n\n";
    }

    // --- SERVICES API ---
    if (astRoot.script.services && astRoot.script.services.length > 0) {
        const imports = astRoot.script.imports || [];
        
        scriptContent += astRoot.script.services.map(srv => {
            const importDef = imports.find(i => i.source === srv.name);
            const varName = importDef ? importDef.alias : srv.name;

            const methods = srv.body.map(line => {
                let cleanLine = line.trim();
                // Suppression commentaires dans service
                cleanLine = cleanLine.replace(/(^|\s+)#.*/, '').trim();
                if (cleanLine.startsWith('.') || !cleanLine) return ""; 

                const parts = cleanLine.split(/\s+/);
                const method = parts[0].toLowerCase();
                const name = parts[1];                 
                let rawPath = parts[2];                

                const pathVars = [];
                const pathRegex = /:(\w+)/g;
                let match;
                while ((match = pathRegex.exec(rawPath)) !== null) {
                    pathVars.push(match[1]);
                }
                const jsPath = rawPath.replace(/:(\w+)/g, '${$1}');

                const smartParams = [];
                for (let i = 3; i < parts.length; i++) {
                    if (parts[i].startsWith('?')) {
                        smartParams.push(parts[i].substring(1));
                    }
                }

                let funcArgs = [...pathVars, ...smartParams];
                const isMutation = ['post', 'put', 'patch'].includes(method);
                if (isMutation && smartParams.length === 0) {
                    funcArgs.push('data');
                }

                let queryString = "";
                if (method === 'get' && smartParams.length > 0) {
                    const separator = jsPath.includes('?') ? '&' : '?';
                    const params = smartParams.map(p => `${p}=\${${p}}`).join('&');
                    queryString = `${separator}${params}`;
                }

                let fetchOptions = "";
                if (method !== 'get') {
                    let bodyContent = "null";
                    if (smartParams.length > 0) {
                        bodyContent = `JSON.stringify({ ${smartParams.join(', ')} })`;
                    } else if (isMutation) {
                        bodyContent = `JSON.stringify(data)`;
                    }

                    fetchOptions = `, {
      method: '${method.toUpperCase()}',
      headers: { 'Content-Type': 'application/json' }${bodyContent !== "null" ? `,\n      body: ${bodyContent}` : ''}
    }`;
                }

                return `  async ${name}(${funcArgs.join(', ')}) {
    const res = await fetch("${srv.baseUrl}" + \`${jsPath}${queryString}\`${fetchOptions});
    return await res.json();
  }`;
            }).filter(line => line.length > 0).join(',\n');

            return `const ${varName} = {\n${methods}\n};`;
        }).join('\n\n') + "\n\n";
    }

    // --- LIFECYCLE (onMount) ---
    if (astRoot.script.lifecycle) {
        let mountBody = astRoot.script.lifecycle.body.map(line => {
            let content = line.trim();
            content = content.replace(/(^|\s+)#.*/, ''); // Clean comments

            stateNames.forEach(stateVar => {
                if (!content) return;
                const regex = new RegExp(`\\b${stateVar}\\b(?!\\.value)`, 'g');
                content = content.replace(regex, `${stateVar}.value`);
            });

            // Pas de magie async sur push/pop
            const isArrayMethod = /\.(push|pop|splice|shift|unshift|map|filter|reduce|forEach|find|indexOf)\(/.test(content);
            if (/\w+\.\w+\(/.test(content) && !isArrayMethod) {
                 if (content.includes('=')) {
                    content = content.replace('=', '= await ');
                } else {
                    content = 'await ' + content;
                }
            }
            return "  " + content;
        }).join('\n');

        scriptContent += `\nonMounted(async () => {\n${mountBody}\n});`;
    }

    // B. Génération des Fonctions
    if (astRoot.script.functions.length > 0) {
        scriptContent += astRoot.script.functions.map(f => {
            let jsLines = [];
            let blockStack = []; 
            let isAsync = false;

            f.body.forEach(line => {
                const currentIndent = line.search(/\S/);
                let content = line.trim();

                // Fermeture blocs
                while (blockStack.length > 0 && currentIndent <= blockStack[blockStack.length - 1]) {
                    blockStack.pop();
                    jsLines.push("  ".repeat(blockStack.length + 1) + "}"); 
                }

                content = content.replace(/(^|\s+)#.*/, ''); // Clean comments
                if (!content) return;

                stateNames.forEach(stateVar => {
                    const regex = new RegExp(`\\b${stateVar}\\b(?!\\.value)`, 'g');
                    content = content.replace(regex, `${stateVar}.value`);
                });

                // ASYNC / AWAIT & EXCLUSION ARRAY METHODS
                const isArrayMethod = /\.(push|pop|splice|shift|unshift|map|filter|reduce|forEach|find|indexOf)\(/.test(content);
                
                if (/\w+\.\w+\(/.test(content) && !isArrayMethod) {
                    isAsync = true;
                    if (content.includes('=')) {
                        content = content.replace('=', '= await ');
                    } else {
                        content = 'await ' + content;
                    }
                }

                const assignmentMatch = content.match(/^(\w+)\s*=/);
                if (assignmentMatch) {
                    const varName = assignmentMatch[1];
                    if (!varName.includes('.value')) {
                        content = 'let ' + content;
                    }
                }

                if (/^if\s+/.test(content) && !/^if\s*\(/.test(content)) {
                    content = content.replace(/if\s+(.*)/, 'if ($1) {');
                    blockStack.push(currentIndent);
                }
                
                jsLines.push("  ".repeat(blockStack.length + 1) + content);
            });

            while (blockStack.length > 0) {
                blockStack.pop();
                jsLines.push("  ".repeat(blockStack.length + 1) + "}");
            }

            const prefix = isAsync ? 'async function' : 'function';
            return `${prefix} ${f.name}(${f.args || ''}) {\n${jsLines.join('\n')}\n}`;
        }).join('\n\n');
    }

    // --- 2. GÉNÉRATION DU TEMPLATE (UI) ---
    function getNextIndex(type) {
        if (!typeCounters[type]) typeCounters[type] = 0;
        return typeCounters[type]++;
    }

    function addCssRule(className, rule) {
        if (!cssMap[className]) cssMap[className] = [];
        cssMap[className].push(rule);
    }

    function renderNode(node, level = 1) {
        if (node.kind === 'PseudoClass') return "";

        if (node.kind === 'Condition') {
            const indent = "  ".repeat(level);
            const childrenHtml = node.children.map(child => renderNode(child, level + 1)).join('\n');
            if (node.type === 'if') return `${indent}<template v-if="${node.value}">\n${childrenHtml}\n${indent}</template>`;
            else if (node.type === 'else') return `${indent}<template v-else>\n${childrenHtml}\n${indent}</template>`;
        }
        if (node.kind === 'Loop') {
            const indent = "  ".repeat(level);
            let keyVal = null;
            if (node.properties) {
                const keyProp = node.properties.find(p => p.key === 'key');
                if (keyProp) keyVal = keyProp.value;
            }
            const { iterator, collection } = node.value;
            let vForExpr = "", keyExpr = "";
            if (keyVal) {
                vForExpr = `(${iterator}) in ${collection}`;
                keyExpr = keyVal;
            } else {
                if (iterator.includes(',')) {
                    const idx = iterator.split(',')[1].trim();
                    vForExpr = `(${iterator}) in ${collection}`;
                    keyExpr = idx;
                } else {
                    vForExpr = `(${iterator}, _i) in ${collection}`;
                    keyExpr = "_i";
                }
            }
            const childrenHtml = node.children.map(child => renderNode(child, level + 1)).join('\n');
            return `${indent}<template v-for="${vForExpr}" :key="${keyExpr}">\n${childrenHtml}\n${indent}</template>`;
        }

        const htmlTag = grammar.tagMap[node.elementType] || node.elementType;
        const index = getNextIndex(node.elementType);
        const suffix = node.meta.explicitTag ? node.meta.explicitTag : index;
        const className = `Cmp__${node.elementType}--${suffix}`;

        if (grammar.defaults && grammar.defaults[node.elementType]) {
            Object.entries(grammar.defaults[node.elementType]).forEach(([key, val]) => {
                addCssRule(className, `${key}: ${val};`);
            });
        }

        let propsString = `class="${className}"`;
        let innerContent = "";
        let dynamicStyles = [];

        node.properties.forEach(p => {
            if (p.key === 'content' || p.key === 'text') {
                innerContent = p.isDynamic ? `{{ ${p.value} }}` : p.value;
                return;
            }
            if (p.key === 'tag') return;

            if (p.key.startsWith('on') && p.key.length > 2) {
                const eventName = p.key.substring(2).toLowerCase();
                propsString += ` @${eventName}="${p.value}"`;
                return;
            }
            if (node.elementType === 'Input' && p.key === 'value' && p.isDynamic) {
                propsString += ` v-model="${p.value}"`;
                return;
            }

            if (grammar.cssProperties.includes(p.key)) {
                const { key, value } = grammar.formatCssValue(p.key, p.value);
                if (p.isDynamic) {
                    // FIX: on remplace les " par ' pour éviter de casser le :style="{ 'prop': ... }"
                    const safeValue = p.value.replace(/"/g, "'");
                    dynamicStyles.push(`'${key}': ${safeValue}`);
                } else {
                    addCssRule(className, `${key}: ${value};`);
                }
            } else {
                if (p.isDynamic) {
                    const safeValue = p.value.replace(/"/g, "'");
                    propsString += ` :${p.key}="${safeValue}"`;
                } else {
                    propsString += ` ${p.key}="${p.value}"`;
                }
            }
        });

        if (dynamicStyles.length > 0) {
            propsString += ` :style="{ ${dynamicStyles.join(', ')} }"`;
        }

        let childrenHtml = "";
        const indent = "  ".repeat(level);
        if (node.children.length > 0) {
            const uiChildren = node.children.filter(c => c.kind !== 'PseudoClass');
            const pseudoChildren = node.children.filter(c => c.kind === 'PseudoClass');
            pseudoChildren.forEach(child => {
                const pseudoSelector = `${className}${child.selector}`;
                child.properties.forEach(p => {
                    if (grammar.cssProperties.includes(p.key)) {
                        const { key, value } = grammar.formatCssValue(p.key, p.value);
                        addCssRule(pseudoSelector, `${key}: ${value};`);
                    }
                });
            });
            if (uiChildren.length > 0) {
                childrenHtml = "\n" + uiChildren.map(child => renderNode(child, level + 1)).join('\n') + "\n" + indent;
            }
        }

        if (node.elementType === 'Input') return `${indent}<${htmlTag} ${propsString} />`;
        return `${indent}<${htmlTag} ${propsString}>${innerContent}${childrenHtml}</${htmlTag}>`;
    }

    const htmlBody = astRoot.children.map(child => renderNode(child, 1)).join('\n');
    const cssBody = Object.keys(cssMap).map(cls => `.${cls} {\n  ${cssMap[cls].join('\n  ')}\n}`).join('\n\n');

    return `<script setup>
// Généré par YggdraScript
import { ref, onMounted } from 'vue';

${scriptContent}
</script>

<template>
${htmlBody}
</template>

<style scoped>
${cssBody}
</style>`;
};