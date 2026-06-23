import { db } from './db/drizzle';
import * as schema from './db/schema';
import { mineRuleSuggestions } from './ruleMiner';

export const testBridge = {
  db,
  schema,
  mineRuleSuggestions,
};

declare global {
  interface Window {
    __TEST_API__: typeof testBridge;
  }
}

if (typeof window !== 'undefined') {
  window.__TEST_API__ = testBridge;
}
