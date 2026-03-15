import { describe, it, expect } from 'vitest';
import { computeOLSSlope, computeSD, checkSteadyState } from '../../src/engine/steadyState';
import { BinData } from '../../src/engine/types';

function makeBins(allocations: number[], binSizeMs: number = 5000): BinData[] {
  return allocations.map((alloc, i) => ({
    binIndex: i,
    binStartMs: i * binSizeMs,
    binEndMs: (i + 1) * binSizeMs,
    leftResponses: Math.round(alloc * 10),
    rightResponses: Math.round((1 - alloc) * 10),
    totalResponses: 10,
    leftReinforcers: 0,
    rightReinforcers: 0,
    leftAllocation: alloc,
  }));
}

describe('steadyState', () => {
  describe('computeOLSSlope', () => {
    it('returns 0 for constant allocation', () => {
      const bins = makeBins(Array(12).fill(0.5));
      const slope = computeOLSSlope(bins);
      expect(Math.abs(slope)).toBeLessThan(0.0001);
    });

    it('returns positive slope for increasing allocation', () => {
      const allocs = Array.from({ length: 12 }, (_, i) => 0.3 + i * 0.02);
      const bins = makeBins(allocs);
      const slope = computeOLSSlope(bins);
      expect(slope).toBeGreaterThan(0);
    });

    it('returns negative slope for decreasing allocation', () => {
      const allocs = Array.from({ length: 12 }, (_, i) => 0.7 - i * 0.02);
      const bins = makeBins(allocs);
      const slope = computeOLSSlope(bins);
      expect(slope).toBeLessThan(0);
    });
  });

  describe('computeSD', () => {
    it('returns 0 for constant values', () => {
      const bins = makeBins(Array(12).fill(0.5));
      const sd = computeSD(bins);
      expect(sd).toBeLessThan(0.0001);
    });

    it('returns positive SD for variable values', () => {
      const allocs = [0.4, 0.6, 0.4, 0.6, 0.4, 0.6, 0.4, 0.6, 0.4, 0.6, 0.4, 0.6];
      const bins = makeBins(allocs);
      const sd = computeSD(bins);
      expect(sd).toBeGreaterThan(0);
    });
  });

  describe('checkSteadyState', () => {
    const ssConfig = { bins: 12, maxSlope: 0.002, maxSD: 0.08, minResponses: 100 };

    it('returns met=true for stable behavior', () => {
      const bins = makeBins(Array(12).fill(0.5));
      const result = checkSteadyState(bins, ssConfig);
      expect(result.met).toBe(true);
    });

    it('returns met=false when not enough bins', () => {
      const bins = makeBins(Array(8).fill(0.5));
      const result = checkSteadyState(bins, ssConfig);
      expect(result.met).toBe(false);
    });

    it('returns met=false when slope too steep', () => {
      const allocs = Array.from({ length: 12 }, (_, i) => 0.3 + i * 0.03);
      const bins = makeBins(allocs);
      const result = checkSteadyState(bins, ssConfig);
      expect(result.met).toBe(false);
    });

    it('returns met=false when SD too high', () => {
      const allocs = [0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8];
      const bins = makeBins(allocs);
      const result = checkSteadyState(bins, ssConfig);
      expect(result.met).toBe(false);
    });

    it('returns met=false when not enough responses', () => {
      const bins = Array(12).fill(null).map((_, i) => ({
        binIndex: i,
        binStartMs: i * 5000,
        binEndMs: (i + 1) * 5000,
        leftResponses: 2,
        rightResponses: 2,
        totalResponses: 4,
        leftReinforcers: 0,
        rightReinforcers: 0,
        leftAllocation: 0.5,
      }));
      const result = checkSteadyState(bins, ssConfig);
      expect(result.met).toBe(false);
    });
  });
});
