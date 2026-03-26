/**
 * Development-only logger. All debug output is stripped in production.
 */
const isDev = process.env.NODE_ENV !== 'production';

export const devLog = isDev
  ? (...args: unknown[]) => console.log(...args)
  : () => {};

export const devWarn = isDev
  ? (...args: unknown[]) => console.warn(...args)
  : () => {};
