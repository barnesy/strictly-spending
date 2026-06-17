import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDateRange } from './utils';

describe('CopilotQueryResult utils', () => {
  describe('formatCurrency', () => {
    it('formats positive numbers correctly', () => {
      expect(formatCurrency(1234.5)).toBe('$1,234.50');
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('formats negative numbers correctly', () => {
      expect(formatCurrency(-1234.5)).toBe('$-1,234.50');
    });
  });

  describe('formatDateRange', () => {
    it('returns default string when no start or end string provided', () => {
      expect(formatDateRange('', '', 'query_data')).toBe('All-Time History');
      expect(formatDateRange('', '', 'subscription_alerts')).toBe('All-Time Subscription Monitoring');
    });

    it('formats date ranges correctly', () => {
      expect(formatDateRange('2023-01-01', '2023-12-31', 'query_data')).toBe('Jan 1, 2023 - Dec 31, 2023');
    });

    it('falls back to string concatenation if date parsing fails', () => {
      expect(formatDateRange('invalid', 'date', 'query_data')).toBe('invalid to date');
    });
  });
});
