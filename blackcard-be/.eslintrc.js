module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es6: true,
  },
  rules: {
    // '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': 'warn',
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true }],
    // 'indent': ['error', 2, { 'SwitchCase': 1 }],
    'comma-dangle': ['error', 'always-multiline'],
  },
};
