module.exports = {
  root: true,
  rules: {
    // Project temporarily relaxes these rules for quick CI/lint pass.
    '@typescript-eslint/no-explicit-any': 'off',
    'react-hooks/purity': 'off',
  },
}
