import { describe, it, expect } from 'vitest';
import { buildPhaseSequence, determinePreferredKey, getScheduleValuesForPhase } from '../../src/engine/phaseController';
import { PerturbationOrder, DEFAULT_ENGINE_CONFIG, BinData, PhaseDef } from '../../src/engine/types';

describe('phaseController', () => {
  describe('buildPhaseSequence', () => {
    const cases: [PerturbationOrder, string[]][] = [
      ['BCD', ['A1','B1','A2','B2','A3','C1','A4','C2','A5','D1','A6','D2']],
      ['BDC', ['A1','B1','A2','B2','A3','D1','A4','D2','A5','C1','A6','C2']],
      ['CBD', ['A1','C1','A2','C2','A3','B1','A4','B2','A5','D1','A6','D2']],
      ['CDB', ['A1','C1','A2','C2','A3','D1','A4','D2','A5','B1','A6','B2']],
      ['DBC', ['A1','D1','A2','D2','A3','B1','A4','B2','A5','C1','A6','C2']],
      ['DCB', ['A1','D1','A2','D2','A3','C1','A4','C2','A5','B1','A6','B2']],
    ];

    it.each(cases)('order %s produces correct sequence', (order, expectedLabels) => {
      const phases = buildPhaseSequence(order);
      expect(phases.map(p => p.label)).toEqual(expectedLabels);
      expect(phases).toHaveLength(12);
    });

    it('sets correct phase types', () => {
      const phases = buildPhaseSequence('BCD');
      expect(phases[0].type).toBe('A');
      expect(phases[1].type).toBe('B');
      expect(phases[2].type).toBe('A');
      expect(phases[3].type).toBe('B');
      expect(phases[4].type).toBe('A');
      expect(phases[5].type).toBe('C');
      expect(phases[6].type).toBe('A');
      expect(phases[7].type).toBe('C');
      expect(phases[8].type).toBe('A');
      expect(phases[9].type).toBe('D');
      expect(phases[10].type).toBe('A');
      expect(phases[11].type).toBe('D');
    });

    it('assigns correct perturbation instances', () => {
      const phases = buildPhaseSequence('BCD');
      expect(phases[1].perturbationInstance).toBe(1);
      expect(phases[3].perturbationInstance).toBe(2);
      expect(phases[5].perturbationInstance).toBe(1);
      expect(phases[7].perturbationInstance).toBe(2);
    });

    it('assigns sequential indexes', () => {
      const phases = buildPhaseSequence('BCD');
      phases.forEach((p, i) => expect(p.index).toBe(i));
    });
  });

  describe('determinePreferredKey', () => {
    function makeBins(leftAllocs: number[]): BinData[] {
      return leftAllocs.map((alloc, i) => ({
        binIndex: i,
        binStartMs: i * 5000,
        binEndMs: (i + 1) * 5000,
        leftResponses: Math.round(alloc * 10),
        rightResponses: Math.round((1 - alloc) * 10),
        totalResponses: 10,
        leftReinforcers: 0,
        rightReinforcers: 0,
        leftAllocation: alloc,
      }));
    }

    it('returns left when left allocation > 0.5', () => {
      const bins = makeBins(Array(12).fill(0.7));
      expect(determinePreferredKey(bins, 60000)).toBe('left');
    });

    it('returns right when left allocation < 0.5', () => {
      const bins = makeBins(Array(12).fill(0.3));
      expect(determinePreferredKey(bins, 60000)).toBe('right');
    });

    it('returns left for exactly 0.5', () => {
      const bins = makeBins(Array(12).fill(0.5));
      expect(determinePreferredKey(bins, 60000)).toBe('left');
    });
  });

  describe('getScheduleValuesForPhase', () => {
    it('returns baseline for A phases', () => {
      const phaseDef: PhaseDef = { label: 'A1', type: 'A', index: 0 };
      const result = getScheduleValuesForPhase(phaseDef, DEFAULT_ENGINE_CONFIG, null);
      expect(result.leftMs).toBe(20000);
      expect(result.rightMs).toBe(20000);
    });

    it('remaps for B phases with left preferred', () => {
      const phaseDef: PhaseDef = { label: 'B1', type: 'B', index: 1, perturbationType: 'B', perturbationInstance: 1 };
      const result = getScheduleValuesForPhase(phaseDef, DEFAULT_ENGINE_CONFIG, 'left');
      // left is preferred -> more-preferred gets VI 30s, less-preferred gets VI 8s
      expect(result.leftMs).toBe(30000);  // more preferred = longer VI
      expect(result.rightMs).toBe(8000);  // less preferred = shorter VI
    });

    it('remaps for B phases with right preferred', () => {
      const phaseDef: PhaseDef = { label: 'B1', type: 'B', index: 1, perturbationType: 'B', perturbationInstance: 1 };
      const result = getScheduleValuesForPhase(phaseDef, DEFAULT_ENGINE_CONFIG, 'right');
      expect(result.leftMs).toBe(8000);   // less preferred
      expect(result.rightMs).toBe(30000); // more preferred
    });

    it('returns baseline for C phases', () => {
      const phaseDef: PhaseDef = { label: 'C1', type: 'C', index: 5, perturbationType: 'C', perturbationInstance: 1 };
      const result = getScheduleValuesForPhase(phaseDef, DEFAULT_ENGINE_CONFIG, 'left');
      expect(result.leftMs).toBe(20000);
      expect(result.rightMs).toBe(20000);
    });

    it('returns baseline for D phases', () => {
      const phaseDef: PhaseDef = { label: 'D1', type: 'D', index: 9, perturbationType: 'D', perturbationInstance: 1 };
      const result = getScheduleValuesForPhase(phaseDef, DEFAULT_ENGINE_CONFIG, 'left');
      expect(result.leftMs).toBe(20000);
      expect(result.rightMs).toBe(20000);
    });
  });
});
