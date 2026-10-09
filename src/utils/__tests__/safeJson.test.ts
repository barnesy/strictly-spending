import { describe, it, expect } from 'vitest';
import { safeParseChartOption } from '../safeJson';

describe('safeParseChartOption', () => {
  it('parses standard strict JSON', () => {
    const input = '{"title": {"text": "Monthly Spending"}, "series": [{"data": [10, 20]}]}';
    const result = safeParseChartOption(input);
    expect(result).not.toBeNull();
    expect(result?.title?.text).toBe('Monthly Spending');
    expect(result?.series[0]?.data).toEqual([10, 20]);
  });

  it('parses relaxed JS object with unquoted keys and single quotes', () => {
    const input = `{
      title: { text: 'Monthly Spending' },
      series: [{ name: 'Spend', data: [100, 200] }]
    }`;
    const result = safeParseChartOption(input);
    expect(result).not.toBeNull();
    expect(result?.title?.text).toBe('Monthly Spending');
    expect(result?.series[0]?.name).toBe('Spend');
    expect(result?.series[0]?.data).toEqual([100, 200]);
  });

  it('strips single-line and multi-line comments', () => {
    const input = `// Chart configuration
    {
      /* main title */
      title: { text: 'Grocery Spend' },
      series: [
        { data: [50, 60] } // values
      ]
    }`;
    const result = safeParseChartOption(input);
    expect(result).not.toBeNull();
    expect(result?.title?.text).toBe('Grocery Spend');
    expect(result?.series[0]?.data).toEqual([50, 60]);
  });

  it('handles trailing commas safely', () => {
    const input = `{
      title: { text: 'Test', },
      series: [{ data: [1, 2, 3,], },],
    }`;
    const result = safeParseChartOption(input);
    expect(result).not.toBeNull();
    expect(result?.title?.text).toBe('Test');
    expect(result?.series[0]?.data).toEqual([1, 2, 3]);
  });

  it('rejects malicious or executable code payloads safely without evaluating them', () => {
    const malicious = '(function() { window.__pwned = true; return { series: [] }; })()';
    const result = safeParseChartOption(malicious);
    expect(result).toBeNull();
    expect((window as any).__pwned).toBeUndefined();
  });

  it('returns null on invalid or empty inputs', () => {
    expect(safeParseChartOption('')).toBeNull();
    expect(safeParseChartOption('not an object')).toBeNull();
  });
});
