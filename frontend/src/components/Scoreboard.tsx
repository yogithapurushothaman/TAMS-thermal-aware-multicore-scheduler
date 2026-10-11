"use client";

import React from "react";
import { SimulationResponse } from "@/types";
import { Trophy, CheckCircle2 } from "lucide-react";

interface ScoreboardProps {
  data: SimulationResponse | null;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({ data }) => {
  if (!data) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
        Click "Run Simulation" to execute the virtual clock loop and generate comparative benchmark metrics.
      </div>
    );
  }

  const { metrics, workload_info } = data;

  return (
    <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h2 className="text-base font-bold text-white">
            Comparative Benchmark Scoreboard
          </h2>
          <span className="text-[11px] text-slate-400 font-mono hidden md:inline">
            ({workload_info.total_processes} tasks: {workload_info.fg_processes} FG / {workload_info.bg_processes} BG)
          </span>
        </div>
        <span className="text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> T.A.M.S. Active
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
              <th className="py-2 px-3">Metric</th>
              <th className="py-2 px-3 bg-emerald-950/40 text-emerald-400 font-bold border-l border-r border-emerald-800/40 rounded-t">
                ✨ T.A.M.S. (Custom)
              </th>
              <th className="py-2 px-3 text-amber-400">FCFS (Baseline)</th>
              <th className="py-2 px-3 text-cyan-400">Round Robin (Baseline)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium">
            <tr>
              <td className="py-2 px-3 text-slate-300">Avg Waiting Time (ticks)</td>
              <td className="py-2 px-3 bg-emerald-950/20 text-emerald-300 font-bold border-l border-r border-emerald-800/30">
                {metrics.tams.avg_waiting}
              </td>
              <td className="py-2 px-3 text-slate-300">{metrics.fcfs.avg_waiting}</td>
              <td className="py-2 px-3 text-slate-300">{metrics.rr.avg_waiting}</td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-slate-300">Avg Turnaround Time (ticks)</td>
              <td className="py-2 px-3 bg-emerald-950/20 text-emerald-300 font-bold border-l border-r border-emerald-800/30">
                {metrics.tams.avg_turnaround}
              </td>
              <td className="py-2 px-3 text-slate-300">{metrics.fcfs.avg_turnaround}</td>
              <td className="py-2 px-3 text-slate-300">{metrics.rr.avg_turnaround}</td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-slate-300">Max Core Temp (°C)</td>
              <td className="py-2 px-3 bg-emerald-950/20 text-emerald-300 font-bold border-l border-r border-emerald-800/30">
                {metrics.tams.max_temp} °C
              </td>
              <td className="py-2 px-3 text-amber-400">{metrics.fcfs.max_temp} °C</td>
              <td className="py-2 px-3 text-cyan-400">{metrics.rr.max_temp} °C</td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-slate-300">CPU Utilization (%)</td>
              <td className="py-2 px-3 bg-emerald-950/20 text-emerald-300 font-bold border-l border-r border-emerald-800/30">
                {metrics.tams.cpu_utilization} %
              </td>
              <td className="py-2 px-3 text-slate-300">{metrics.fcfs.cpu_utilization} %</td>
              <td className="py-2 px-3 text-slate-300">{metrics.rr.cpu_utilization} %</td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-slate-300">Total Energy Units</td>
              <td className="py-2 px-3 bg-emerald-950/20 text-emerald-300 font-bold border-l border-r border-emerald-800/30">
                {metrics.tams.total_energy}
              </td>
              <td className="py-2 px-3 text-slate-300">{metrics.fcfs.total_energy}</td>
              <td className="py-2 px-3 text-slate-300">{metrics.rr.total_energy}</td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-slate-300">Thermal Migrations</td>
              <td className="py-2 px-3 bg-emerald-950/20 text-emerald-300 font-bold border-l border-r border-emerald-800/30">
                {metrics.tams.migrations}
              </td>
              <td className="py-2 px-3 text-slate-400">{metrics.fcfs.migrations}</td>
              <td className="py-2 px-3 text-slate-400">{metrics.rr.migrations}</td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-slate-300">Throttling Events</td>
              <td className="py-2 px-3 bg-emerald-950/20 text-emerald-300 font-bold border-l border-r border-emerald-800/30">
                {metrics.tams.throttles}
              </td>
              <td className="py-2 px-3 text-red-400">{metrics.fcfs.throttles}</td>
              <td className="py-2 px-3 text-red-400">{metrics.rr.throttles}</td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-slate-300">Time Above 90°C (ticks)</td>
              <td className="py-2 px-3 bg-emerald-950/20 text-emerald-300 font-bold border-l border-r border-emerald-800/30 rounded-b">
                {metrics.tams.time_above_90}
              </td>
              <td className="py-2 px-3 text-red-400">{metrics.fcfs.time_above_90}</td>
              <td className="py-2 px-3 text-red-400">{metrics.rr.time_above_90}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
