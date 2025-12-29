const generateVue = require('./generators/vue');
const generateExpress = require('./generators/express');

module.exports = function generate(astRoot, filePath) {
    // Si l'AST contient un bloc 'server', on génère du code Backend (Express)
    if (astRoot.server) {
        return generateExpress(astRoot);
    }

    // Sinon, on génère un composant Vue 3 (Comportement par défaut)
    return generateVue(astRoot, filePath);
};