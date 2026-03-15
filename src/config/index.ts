import { EngineConfig, DEFAULT_ENGINE_CONFIG, PerturbationOrder, PERTURBATION_ORDERS } from '../engine/types';

export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  experimentId: string;
  appVersion: string;
  debugLocalOnly: boolean;
  defaultSeed: string;
  pointsPerReinforcer: number;
  reservationMinutes: number;
  targetNPerOrder: number;
  engine: EngineConfig;
}

export function loadConfig(): AppConfig {
  const debugLocalOnly = import.meta.env.VITE_DEBUG_LOCAL_ONLY === 'true';
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    experimentId: import.meta.env.VITE_EXPERIMENT_ID || 'concurrent_operants_counterbalanced_v1',
    appVersion: import.meta.env.VITE_APP_VERSION || '0.1.0',
    debugLocalOnly,
    defaultSeed: import.meta.env.VITE_DEFAULT_SEED || String(Date.now()),
    pointsPerReinforcer: Number(import.meta.env.VITE_POINTS_PER_REINFORCER) || 1,
    reservationMinutes: Number(import.meta.env.ASSIGNMENT_RESERVATION_MINUTES) || 30,
    targetNPerOrder: Number(import.meta.env.TARGET_N_PER_ORDER) || 5,
    engine: {
      ...DEFAULT_ENGINE_CONFIG,
      pointsPerReinforcer: Number(import.meta.env.VITE_POINTS_PER_REINFORCER) || 1,
    },
  };
}

export function isValidOrder(order: string): order is PerturbationOrder {
  return PERTURBATION_ORDERS.includes(order as PerturbationOrder);
}
