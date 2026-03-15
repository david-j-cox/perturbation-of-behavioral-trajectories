import { describe, it, expect } from 'vitest';
import { createRng, hashString, randomChoice } from '../../src/utils/rng';

describe('rng', () => {
  describe('createRng', () => {
    it('produces deterministic output for same seed', () => {
      const rng1 = createRng(42);
      const rng2 = createRng(42);
      for (let i = 0; i < 20; i++) {
        expect(rng1()).toBe(rng2());
      }
    });

    it('produces values in [0, 1)', () => {
      const rng = createRng('test-seed');
      for (let i = 0; i < 1000; i++) {
        const val = rng();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });

    it('produces different sequences for different seeds', () => {
      const rng1 = createRng(1);
      const rng2 = createRng(2);
      const vals1 = Array.from({ length: 10 }, () => rng1());
      const vals2 = Array.from({ length: 10 }, () => rng2());
      expect(vals1).not.toEqual(vals2);
    });

    it('accepts string seeds', () => {
      const rng = createRng('hello');
      expect(typeof rng()).toBe('number');
    });
  });

  describe('hashString', () => {
    it('returns consistent hash', () => {
      expect(hashString('test')).toBe(hashString('test'));
    });

    it('returns different hashes for different strings', () => {
      expect(hashString('abc')).not.toBe(hashString('def'));
    });
  });

  describe('randomChoice', () => {
    it('returns element from array', () => {
      const arr = ['a', 'b', 'c'];
      const rng = createRng(42);
      const choice = randomChoice(arr, rng);
      expect(arr).toContain(choice);
    });

    it('is deterministic with same RNG', () => {
      const arr = [1, 2, 3, 4, 5];
      const rng1 = createRng(42);
      const rng2 = createRng(42);
      expect(randomChoice(arr, rng1)).toBe(randomChoice(arr, rng2));
    });
  });
});
