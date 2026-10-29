import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../apps/web', import.meta.url));

export default {
  root: webRoot,
  test: {
    include: ['../../tests/q1/1[0-4]-*.vitest.ts'],
    environment: 'jsdom',
  },
};
