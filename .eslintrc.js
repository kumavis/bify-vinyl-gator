module.exports = {
  'parserOptions': {
    'ecmaVersion': 8,
  },
  extends: [
    '@metamask/eslint-config',
    '@metamask/eslint-config/config/nodejs',
  ],
  'globals': {
    'globalThis': false,
  },
  'overrides': [{
    'files': 'src/runtime.js',
    env: {
      'browser': true,
      node: false,
    },
  },
  {
    'files': 'src/plugin.js',
    env: {
      'browser': false,
      node: true,
    },
  },
  {
    'files': 'example/*.js',
    'rules': {
      'node/no-unpublished-require': 0,
      'node/no-missing-require': 0,
    },
  },
  {
    'files': 'test/*.js',
    'rules': {
      'node/no-unpublished-require': 0,
      'node/no-missing-require': 0,
    },
  }],
}
