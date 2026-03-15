import { getSupabaseClient, isOnline } from './supabaseClient';

/** All event types */
export type EventType =
  | 'consent_agreed' | 'consent_declined'
  | 'participant_id_submitted'
  | 'assignment_requested' | 'assignment_reserved' | 'assignment_failed'
  | 'instructions_viewed'
  | 'practice_start' | 'practice_end'
  | 'phase_start' | 'phase_end'
  | 'response' | 'switch'
  | 'reinforcer_baited' | 'reinforcer_delivered'
  | 'cod_start' | 'cod_end'
  | 'lockout_start' | 'lockout_end'
  | 'bin_closed'
  | 'experiment_end'
  | 'focus_lost'
  | 'focus_restored'
  | 'session_restored'
  | 'upload_error';

export interface EventRecord {
  session_id: string;
  participant_id: string;
  experiment_id: string;
  event_type: EventType;
  event_seq: number;
  event_timestamp?: string;
  client_timestamp_ms: number;
  phase_label?: string;
  phase_index?: number;
  key?: string;
  side?: string;
  rt_ms?: number;
  points?: number;
  schedule_value_ms?: number;
  was_baited?: boolean;
  cod_active?: boolean;
  lockout_active?: boolean;
  metadata_json?: Record<string, unknown>;
}

export interface BinRecord {
  session_id: string;
  participant_id: string;
  experiment_id: string;
  phase_label: string;
  phase_index: number;
  bin_index: number;
  bin_start_ms: number;
  bin_end_ms: number;
  left_responses: number;
  right_responses: number;
  total_responses: number;
  left_reinforcers: number;
  right_reinforcers: number;
  left_allocation: number;
  right_allocation: number;
  metadata_json?: Record<string, unknown>;
}

export interface PhaseSummaryRecord {
  session_id: string;
  participant_id: string;
  experiment_id: string;
  phase_label: string;
  phase_index: number;
  phase_type: string;
  perturbation_type?: string;
  start_time_ms: number;
  end_time_ms: number;
  duration_ms: number;
  ended_by: string;
  total_left_responses: number;
  total_right_responses: number;
  total_left_reinforcers: number;
  total_right_reinforcers: number;
  final_left_allocation: number;
  steady_state_reached: boolean;
  steady_state_slope?: number;
  steady_state_sd?: number;
  preferred_key?: string;
  vi_left_ms?: number;
  vi_right_ms?: number;
  metadata_json?: Record<string, unknown>;
}

const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 5000;

export class DataLogger {
  private eventBuffer: EventRecord[] = [];
  private binBuffer: BinRecord[] = [];
  private phaseSummaryBuffer: PhaseSummaryRecord[] = [];
  private localLog: Array<Record<string, unknown>> = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private debugLocalOnly: boolean;
  private sessionId: string;
  private participantId: string;
  private experimentId: string;
  private nextEventSeq: number = 0;

  constructor(
    sessionId: string,
    participantId: string,
    experimentId: string,
    debugLocalOnly: boolean = false
  ) {
    this.sessionId = sessionId;
    this.participantId = participantId;
    this.experimentId = experimentId;
    this.debugLocalOnly = debugLocalOnly;
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  /** Log an event */
  logEvent(event: Omit<EventRecord, 'session_id' | 'participant_id' | 'experiment_id' | 'event_seq'>): void {
    const record: EventRecord = {
      session_id: this.sessionId,
      participant_id: this.participantId,
      experiment_id: this.experimentId,
      event_seq: this.nextEventSeq++,
      event_timestamp: new Date().toISOString(),
      ...event,
    };
    this.eventBuffer.push(record);
    this.localLog.push({ table: 'event_log', ...record });

    if (this.eventBuffer.length >= BATCH_SIZE) {
      this.flushEvents();
    }
  }

  /** Log a bin */
  logBin(bin: Omit<BinRecord, 'session_id' | 'participant_id' | 'experiment_id'>): void {
    const record: BinRecord = {
      session_id: this.sessionId,
      participant_id: this.participantId,
      experiment_id: this.experimentId,
      ...bin,
    };
    this.binBuffer.push(record);
    this.localLog.push({ table: 'bin_log', ...record });

    if (this.binBuffer.length >= BATCH_SIZE) {
      this.flushBins();
    }
  }

  /** Log a phase summary */
  logPhaseSummary(summary: Omit<PhaseSummaryRecord, 'session_id' | 'participant_id' | 'experiment_id'>): void {
    const record: PhaseSummaryRecord = {
      session_id: this.sessionId,
      participant_id: this.participantId,
      experiment_id: this.experimentId,
      ...summary,
    };
    this.phaseSummaryBuffer.push(record);
    this.localLog.push({ table: 'phase_summary', ...record });
  }

  /** Flush all buffers to Supabase */
  async flush(): Promise<void> {
    await Promise.all([
      this.flushEvents(),
      this.flushBins(),
      this.flushPhaseSummaries(),
    ]);
  }

  private async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) return;
    const batch = this.eventBuffer.splice(0);
    if (!this.debugLocalOnly && isOnline()) {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { error } = await client.from('event_log').upsert(batch, {
            onConflict: 'session_id,event_seq',
            ignoreDuplicates: true,
          });
          if (error) {
            console.error('Event flush error:', error);
            this.logUploadError('event_log', error.message);
            this.eventBuffer.unshift(...batch);
          }
        }
      } catch (e) {
        console.error('Event flush exception:', e);
        this.eventBuffer.unshift(...batch);
      }
    }
  }

  private async flushBins(): Promise<void> {
    if (this.binBuffer.length === 0) return;
    const batch = this.binBuffer.splice(0);
    if (!this.debugLocalOnly && isOnline()) {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { error } = await client.from('bin_log').upsert(batch, {
            onConflict: 'session_id,phase_index,bin_index',
            ignoreDuplicates: true,
          });
          if (error) {
            console.error('Bin flush error:', error);
            this.logUploadError('bin_log', error.message);
            this.binBuffer.unshift(...batch);
          }
        }
      } catch (e) {
        console.error('Bin flush exception:', e);
        this.binBuffer.unshift(...batch);
      }
    }
  }

  private async flushPhaseSummaries(): Promise<void> {
    if (this.phaseSummaryBuffer.length === 0) return;
    const batch = this.phaseSummaryBuffer.splice(0);
    if (!this.debugLocalOnly && isOnline()) {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { error } = await client.from('phase_summary').upsert(batch, {
            onConflict: 'session_id,phase_index',
            ignoreDuplicates: true,
          });
          if (error) {
            console.error('Phase summary flush error:', error);
            this.logUploadError('phase_summary', error.message);
            this.phaseSummaryBuffer.unshift(...batch);
          }
        }
      } catch (e) {
        console.error('Phase summary flush exception:', e);
        this.phaseSummaryBuffer.unshift(...batch);
      }
    }
  }

  private logUploadError(table: string, message: string): void {
    this.localLog.push({
      table: 'event_log',
      session_id: this.sessionId,
      participant_id: this.participantId,
      experiment_id: this.experimentId,
      event_type: 'upload_error',
      client_timestamp_ms: performance.now(),
      metadata_json: { failed_table: table, error: message },
    });
  }

  /** Download local log as JSONL file */
  downloadLocalLog(): void {
    const lines = this.localLog.map(r => JSON.stringify(r)).join('\n');
    const blob = new Blob([lines], { type: 'application/x-jsonlines' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `experiment_${this.participantId}_${Date.now()}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Get local log for testing */
  getLocalLog(): Array<Record<string, unknown>> {
    return [...this.localLog];
  }

  /** Clean up */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}
