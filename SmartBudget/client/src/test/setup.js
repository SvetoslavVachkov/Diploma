import '@testing-library/jest-dom/vitest';

// Keep tests deterministic and avoid crashing on missing APIs.
Object.defineProperty(window, 'scrollTo', { value: () => {}, writable: true });

