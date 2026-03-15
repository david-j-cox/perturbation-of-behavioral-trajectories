/** High-resolution timestamp in ms (relative to page load) */
export function nowMs(): number {
  return performance.now();
}

/** Wall clock timestamp */
export function wallClock(): number {
  return Date.now();
}

/** Format ms duration as MM:SS */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Get timezone string */
export function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'unknown';
  }
}
