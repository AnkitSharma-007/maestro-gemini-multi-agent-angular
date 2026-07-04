// Stylelint config — Design System guardrail.
//
// Enforcement runs at ERROR severity, so any design-token drift (raw color /
// spacing / radius / type literals) or standard-scss regression fails
// `npm run lint:styles`.
module.exports = {
  extends: ['stylelint-config-standard-scss'],
  plugins: ['stylelint-declaration-strict-value'],
  ignoreFiles: ['dist/**', '.angular/**', 'coverage/**', 'node_modules/**'],

  // Locked (Phase 8): design-token rules + standard-scss hygiene are enforced as errors.
  defaultSeverity: 'error',

  rules: {
    // === Design-token enforcement (the migration worklist) =====================
    // Require a token/var/function — not a raw literal — for these properties.
    // Flipped to error per phase: font-size/line-height (Phase 2), border-radius (Phase 3),
    // color (Phase 5). Spacing (padding/margin/gap, incl. longhands) enforced from Phase 3
    // on the pure 4px scale (§3.1/§10.1); the plugin validates each token in a shorthand.
    'scale-unlimited/declaration-strict-value': [
      [
        '/color$/',
        'fill',
        'stroke',
        'font-size',
        'line-height',
        'border-radius',
        '/^padding/',
        '/^margin/',
        '/gap$/',
      ],
      {
        ignoreValues: [
          'transparent',
          'inherit',
          'currentColor',
          'unset',
          'initial',
          'none',
          'auto',
          'normal',
          '0',
          // Sub-scale hairline: intentional 1px insets on inline code / dense chips
          // that have no 4px-scale equivalent (see §10.1 note).
          '1px',
        ],
        severity: 'error',
      },
    ],

    // === Intentional in this codebase — silenced to keep the baseline signal high ===
    // Vendor prefixes are deliberate (backdrop-filter, background-clip, scrollbars, font-smoothing).
    'property-no-vendor-prefix': null,
    'value-no-vendor-prefix': null,
    'selector-no-vendor-prefix': null,
    'media-feature-name-no-vendor-prefix': null,
    'at-rule-no-vendor-prefix': null,

    // Legacy color notation is used throughout (rgba(), 0.42 alphas) — not part of this migration.
    'color-function-notation': null,
    'color-function-alias-notation': null,
    'alpha-value-notation': null,

    // Angular view-piercing selector is legitimate; don't flag it as an unknown pseudo-element.
    'selector-pseudo-element-no-unknown': [true, { ignorePseudoElements: ['ng-deep'] }],

    // Established naming that we are not renaming (camelCase keyframes, existing classes/custom props).
    'keyframes-name-pattern': null,
    'selector-class-pattern': null,
    'custom-property-pattern': null,

    // Formatting is owned by Prettier; range-notation is stylistic.
    'media-feature-range-notation': null,
    'declaration-empty-line-before': null,
    'custom-property-empty-line-before': null,
    'comment-empty-line-before': null,
    'rule-empty-line-before': null,
    'at-rule-empty-line-before': null,
    'scss/double-slash-comment-empty-line-before': null,

    // Specificity ordering fires broadly in scoped component styles; revisit later if useful.
    'no-descending-specificity': null,
  },
};
