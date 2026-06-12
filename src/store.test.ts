import { describe, it, expect } from 'vitest';
import { resolveDateRange, type FiltersState } from './store';

describe('resolveDateRange - allTime scoping', () => {
  it('falls back to 2000-01-01 when boundaries are not set', () => {
    const dummyState: FiltersState = {
      preset: 'allTime',
      enabledAccountIds: [],
      disabledCategories: [],
      spendOnly: true,
      groupBy: 'category',
      recurrenceFilter: 'all',
      drill: null,
      searchQuery: '',
      demoMode: false,
      version: 1,
    };
    const range = resolveDateRange(dummyState);
    
    // Start date should be 2000-01-01 local time
    expect(range.start.getFullYear()).toBe(2000);
    expect(range.start.getMonth()).toBe(0); // January
    expect(range.start.getDate()).toBe(1);
    
    // End date should be today/now (current year)
    const now = new Date();
    expect(range.end.getFullYear()).toBe(now.getFullYear());
  });

  it('correctly scopes start and end dates when boundaries are present in state', () => {
    const dummyState: FiltersState = {
      preset: 'allTime',
      earliestTransactionDate: '2025-02-14',
      latestTransactionDate: '2026-05-23',
      enabledAccountIds: [],
      disabledCategories: [],
      spendOnly: true,
      groupBy: 'category',
      recurrenceFilter: 'all',
      drill: null,
      searchQuery: '',
      demoMode: false,
      version: 1,
    };
    const range = resolveDateRange(dummyState);
    
    // Start date should match 2025-02-14
    expect(range.start.getFullYear()).toBe(2025);
    expect(range.start.getMonth()).toBe(1); // February
    expect(range.start.getDate()).toBe(14);
    
    // End date should match 2026-05-23
    expect(range.end.getFullYear()).toBe(2026);
    expect(range.end.getMonth()).toBe(4); // May
    expect(range.end.getDate()).toBe(23);
  });
});
