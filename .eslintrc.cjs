module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'vite.config.ts', '*.config.js'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', 'react-hooks'],
  rules: {
    ...require('eslint-plugin-react-hooks').configs.recommended.rules,
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Underscore-prefixed = intentionally unused (e.g. signature params on pure stubs
    // that later phases will fill in). Standard TS convention.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    // An <svg fill="none"> is drawn with strokes, so it MUST declare a stroke color
    // (usually stroke="currentColor"). Without one, stroke-based glyphs paint
    // invisibly — only the box shows. This bug bit the score lozenge and every
    // shared status icon; the guard makes it un-mergeable. (Harmless on fill-only
    // svgs: a stroke with no stroke-drawn children simply does nothing.)
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "JSXOpeningElement[name.name='svg']:has(JSXAttribute[name.name='fill'][value.value='none']):not(:has(JSXAttribute[name.name='stroke']))",
        message:
          'An <svg fill="none"> must also set a stroke color (e.g. stroke="currentColor"), or stroke-based glyphs render invisibly.',
      },
    ],
  },
}
