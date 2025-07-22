module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
  },
  overrides: [
    {
      files: [
        '**/__tests__/**/*.js',
        '**/__mocks__/**/*.js'
      ],
      env: {
        jest: true,
      },
    },
  ],
};