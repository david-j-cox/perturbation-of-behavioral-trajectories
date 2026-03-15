import { BinData, SteadyStateResult } from './types';

/**
 * Compute OLS slope of left allocation over bins.
 * x = bin midpoint time in seconds, y = left allocation.
 */
export function computeOLSSlope(bins: BinData[]): number {
  const n = bins.length;
  if (n < 2) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const bin of bins) {
    const x = (bin.binStartMs + bin.binEndMs) / 2 / 1000; // midpoint in seconds
    const y = bin.leftAllocation;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * Compute standard deviation of left allocation across bins.
 * Uses population SD (not sample SD) for consistency.
 */
export function computeSD(bins: BinData[]): number {
  const n = bins.length;
  if (n < 2) return 0;

  const mean = bins.reduce((s, b) => s + b.leftAllocation, 0) / n;
  const variance = bins.reduce((s, b) => s + (b.leftAllocation - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

/**
 * Check steady state criteria against the most recent bins:
 * - at least `config.bins` bins available
 * - abs(OLS slope) <= config.maxSlope
 * - SD <= config.maxSD
 * - total responses across bins >= config.minResponses
 */
export function checkSteadyState(
  bins: BinData[],
  config: { bins: number; maxSlope: number; maxSD: number; minResponses: number }
): SteadyStateResult {
  const n = bins.length;
  if (n < config.bins) {
    return { met: false, slope: 0, sd: 0, totalResponses: 0, binsUsed: n, consecutivePasses: 0 };
  }

  const recentBins = bins.slice(-config.bins);
  const slope = computeOLSSlope(recentBins);
  const sd = computeSD(recentBins);
  const totalResponses = recentBins.reduce((s, b) => s + b.totalResponses, 0);

  const met =
    Math.abs(slope) <= config.maxSlope &&
    sd <= config.maxSD &&
    totalResponses >= config.minResponses;

  return {
    met,
    slope,
    sd,
    totalResponses,
    binsUsed: config.bins,
    consecutivePasses: 0, // Tracked externally
  };
}
