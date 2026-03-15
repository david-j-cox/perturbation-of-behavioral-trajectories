/**
 * Mock Supabase client for testing.
 * Provides in-memory storage for event_log, bin_log, phase_summary tables.
 */

interface MockTable {
  rows: Record<string, unknown>[];
}

const tables: Record<string, MockTable> = {
  event_log: { rows: [] },
  bin_log: { rows: [] },
  phase_summary: { rows: [] },
  sessions: { rows: [] },
  participants: { rows: [] },
  order_assignments: { rows: [] },
};

export function createMockSupabaseClient() {
  return {
    from: (table: string) => ({
      insert: (data: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(data) ? data : [data];
        if (tables[table]) {
          tables[table].rows.push(...rows);
        }
        return Promise.resolve({ data: rows, error: null });
      },
      select: (_columns?: string) => ({
        eq: (_col: string, _val: unknown) => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
        order: (_col: string, _opts?: unknown) => ({
          limit: (_n: number) => Promise.resolve({ data: [], error: null }),
        }),
      }),
      update: (data: Record<string, unknown>) => ({
        eq: (_col: string, _val: unknown) => Promise.resolve({ data, error: null }),
      }),
      delete: () => ({
        eq: (_col: string, _val: unknown) => Promise.resolve({ data: null, error: null }),
        like: (_col: string, _val: unknown) => Promise.resolve({ data: null, error: null }),
        in: (_col: string, _val: unknown[]) => Promise.resolve({ data: null, error: null }),
      }),
    }),
    rpc: (fn: string, params?: Record<string, unknown>) => {
      if (fn === 'reserve_counterbalanced_order') {
        return Promise.resolve({
          data: {
            success: true,
            assigned_order: params?.p_manual_order || 'BCD',
            already_assigned: false,
            candidate_orders: ['BCD', 'BDC', 'CBD', 'CDB', 'DBC', 'DCB'],
            reservation_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            assignment_status: 'reserved',
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

export function resetMockTables() {
  for (const table of Object.values(tables)) {
    table.rows = [];
  }
}

export function getMockTableRows(table: string): Record<string, unknown>[] {
  return tables[table]?.rows || [];
}
