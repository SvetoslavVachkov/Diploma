const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    include: ['server/src/**/*.test.js'],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    mockReset: true
  }
});
