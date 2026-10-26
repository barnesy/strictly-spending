import { describe, it, expect } from 'vitest';
import { computeSparklinePaths } from '../Sparkline';

describe('computeSparklinePaths', () => {
  it('handles empty data gracefully', () => {
    const res = computeSparklinePaths([]);
    expect(res.pts).toEqual([]);
    expect(res.linePath).toBe('');
    expect(res.areaPath).toBe('');
    expect(res.lastPt).toBeNull();
  });

  it('computes correct SVG path points for multi-month data', () => {
    const data = [
      { month: '2026-06', label: 'Jun 26', amount: 100 },
      { month: '2026-07', label: 'Jul 26', amount: 200 },
      { month: '2026-08', label: 'Aug 26', amount: 300 },
    ];
    const { pts, linePath, areaPath, lastPt, maxVal } = computeSparklinePaths(data, 60, 20, 0, 0);

    expect(maxVal).toBe(300);
    expect(pts).toHaveLength(3);

    // First point at x=0
    expect(pts[0].x).toBe(0);
    // Last point at x=60
    expect(pts[2].x).toBe(60);
    expect(lastPt).not.toBeNull();
    expect(lastPt?.x).toBe(60);

    // Line path should start with M and have L commands
    expect(linePath).toContain('M ');
    expect(linePath).toContain('L ');

    // Area path should close with Z
    expect(areaPath.endsWith('Z')).toBe(true);
  });

  it('handles flat/zero values without division by zero', () => {
    const data = [
      { month: '2026-06', label: 'Jun 26', amount: 0 },
      { month: '2026-07', label: 'Jul 26', amount: 0 },
    ];
    const { pts, maxVal } = computeSparklinePaths(data, 60, 20);
    expect(maxVal).toBe(1); // falls back to minimum 1 to avoid div by zero
    expect(pts).toHaveLength(2);
  });
});
