export interface SimulationRequest {
  num_p_cores: number;
  num_e_cores: number;
  p_heat_rate: number;
  e_heat_rate: number;
  critical_temp: number;
  recovery_temp: number;
  migration_penalty_ticks: number;
  io_probability: number;
  scenario: string;
  count: number;
  fg_ratio: number;
  seed: number;
}

export interface MetricDetail {
  avg_waiting: number;
  avg_turnaround: number;
  max_temp: number;
  total_energy: number;
  cpu_utilization: number;
  migrations: number;
  throttles: number;
  time_above_90: number;
  total_ticks: number;
}

export interface TickSnapshot {
  tick: number;
  core_temps: Record<string, number>;
  core_states: Record<string, string>;
  core_pids: Record<string, number | null>;
  blocked_pids: number[];
  energy: number;
}

export interface SimulationResponse {
  metrics: {
    tams: MetricDetail;
    fcfs: MetricDetail;
    rr: MetricDetail;
  };
  workload_info: {
    total_processes: number;
    fg_processes: number;
    bg_processes: number;
    seed: number;
  };
  traces: {
    tams: TickSnapshot[];
    fcfs: TickSnapshot[];
    rr: TickSnapshot[];
  };
}
