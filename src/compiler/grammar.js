module.exports = {
    // Mapping YggdraScript -> Balises HTML
    tagMap: {
        'VBox': 'div',
        'HBox': 'div',
        'Text': 'span',
        'Button': 'button',
        'Input': 'input',
        'Image': 'img',
        'Title': 'h1'
    },

    defaults: {
        'VBox': {
            'display': 'flex',
            'flex-direction': 'column'

        },
        'HBox': {
            'display': 'flex',
            'flex-direction': 'row',
            'align-items': 'center'
        },
        'Grid': { 'display': 'grid', 'gap': '10px' }
    },

    // Liste des propriétés Yggdra qui doivent finir dans le bloc <style>
    cssProperties: [
        // Box Model
        'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
        'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
        'width', 'height', 'maxWidth', 'minWidth', 'maxHeight', 'minHeight',
        'gap',

        // Apparence
        'color', 'background', 'backgroundColor', 'bg',
        'opacity',
        'border', 'borderRadius', 'radius',
        'shadow', 'boxShadow',
        'cursor', 'outline',
        'textDecoration', 'decoration',
        'fontStyle', 'style',

        // Texte
        'size', 'fontSize', 'weight', 'fontWeight', 'textAlign', 'lineHeight','fontFamily',

        // Flexbox & Layout
        'display', 'flex', 'flexDirection', 'align', 'alignItems', 'justify', 'justifyContent',
        'position', 'top', 'left', 'right', 'bottom', 'zIndex',
        'overflow', 'overflowY', 'overflowX',

        // Animation & Transformation
        'transition', 'transform', 'animation'
    ],

    // Helper : Transforme camelCase en kebab-case
    toKebabCase: (str) => str.replace(/[A-Z]/g, m => "-" + m.toLowerCase()),

    // Helper : Formate une clé et une valeur pour le CSS
    formatCssValue: (key, value) => {
        // 1. Dictionnaire d'ALIAS
        const aliases = {
            'size': 'font-size',
            'shadow': 'box-shadow',
            'justify': 'justify-content',
            'align': 'align-items',
            'radius': 'border-radius',
            'weight': 'font-weight',
            'bg': 'background',
            'decoration': 'text-decoration',
            'style': 'font-style'
        };

        let cssKey = aliases[key] || key;
        cssKey = module.exports.toKebabCase(cssKey);

        // 2. Gestion des unités (px)
        // On n'ajoute PAS 'px' pour ces propriétés
        const noUnitProps = [
            'opacity', 'z-index', 'font-weight', 'line-height', 'flex',
            'order', 'flex-grow', 'flex-shrink'
        ];

        let cssVal = value;
        // Si c'est un nombre pur et qu'il nécessite une unité
        if (!isNaN(value) && value !== "" && value !== true && !noUnitProps.includes(cssKey)) {
            cssVal = value + "px";
        }

        return { key: cssKey, value: cssVal };
    }
};