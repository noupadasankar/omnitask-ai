module.exports = {
  root: true,
  extends: ['./packages/config/eslint-base.js'],
  overrides: [
    {
      files: ['apps/frontend/**/*'],
      extends: ['./packages/config/eslint-next.js'],
    },
  ],
};
