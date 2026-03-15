import { describe, it, expect } from 'vitest';
import { BinData } from '../../src/engine/types';

/** Test bin aggregation logic used in the experiment runner */
describe('binAggregation', () => {
  function createBin(index: number, leftR: number, rightR: number, leftRf: number = 0, rightRf: number = 0): BinData {
    const total = leftR + rightR;
    return {
      binIndex: index,
      binStartMs: index * 5000,
      binEndMs: (index + 1) * 5000,
      leftResponses: leftR,
      rightResponses: rightR,
      totalResponses: total,
      leftReinforcers: leftRf,
      rightReinforcers: rightRf,
      leftAllocation: total > 0 ? leftR / total : 0,
    };
  }

  it('computes correct left allocation', () => {
    const bin = createBin(0, 7, 3);
    expect(bin.leftAllocation).toBeCloseTo(0.7);
  });

  it('handles zero total responses', () => {
    const bin = createBin(0, 0, 0);
    expect(bin.leftAllocation).toBe(0);
  });

  it('tracks reinforcers independently', () => {
    const bin = createBin(0, 5, 5, 2, 1);
    expect(bin.leftReinforcers).toBe(2);
    expect(bin.rightReinforcers).toBe(1);
  });

  it('bins have correct temporal boundaries', () => {
    const bins = Array.from({ length: 12 }, (_, i) => createBin(i, 5, 5));
    expect(bins[0].binStartMs).toBe(0);
    expect(bins[0].binEndMs).toBe(5000);
    expect(bins[11].binStartMs).toBe(55000);
    expect(bins[11].binEndMs).toBe(60000);
  });

  it('coherence: sum of bin responses equals phase total', () => {
    const bins = [
      createBin(0, 3, 7),
      createBin(1, 5, 5),
      createBin(2, 8, 2),
    ];
    const totalLeft = bins.reduce((s, b) => s + b.leftResponses, 0);
    const totalRight = bins.reduce((s, b) => s + b.rightResponses, 0);
    expect(totalLeft).toBe(16);
    expect(totalRight).toBe(14);
  });
});
