"use client";

import React from "react";
import { SimulationRequest } from "@/types";
import { Cpu, Flame, Play, RefreshCw, SlidersHorizontal } from "lucide-react";

interface ControlCenterProps {
  params: SimulationRequest;
  setParams: React.Dispatch<React.SetStateAction<SimulationRequest>>;
  onRun: () => void;
  loading: boolean;
}

export const ControlCenter: React.FC<ControlCenterProps> = ({
  params,
  setParams,
  onRun,
  loading,
}) => {
  const handleChange = (key: keyof SimulationRequest, value: any) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
          Control Center
        </h2>
        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-mono font-semibold">
          CONFIG
        </span>
      </div>

      <div className="space-y-3.5 text-xs">
        {/* Workload Scenario */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Workload Scenario
          </label>
          <select
            value={params.scenario}
            onChange={(e) => handleChange("scenario", e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
          >
            <option value="DEMO">PRD Demo (20 Procs, Seed 42)</option>
            <option value="T-1">Scenario T-1 (Single FG Short Burst)</option>
            <option value="T-2">Scenario T-2 (Single FG Thermal Migration)</option>
            <option value="T-3">Scenario T-3 (Background-Only Workload)</option>
            <option value="T-4">Scenario T-4 (Mixed Load Queue Overflow)</option>
            <option value="RANDOM">Random Synthetic Workload</option>
          </select>
        </div>

        {params.scenario === "RANDOM" && (
          <div className="grid grid-cols-2 gap-2 p-2 bg-slate-950/80 rounded-lg border border-slate-800">
            <div>
              <label className="text-slate-400 text-[10px]">Count</label>
              <input
                type="number"
                value={params.count}
                onChange={(e) => handleChange("count", parseInt(e.target.value) || 20)}
                className="w-full mt-0.5 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
              />
            </div>
            <div>
              <label className="text-slate-400 text-[10px]">FG Ratio</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={params.fg_ratio}
                onChange={(e) => handleChange("fg_ratio", parseFloat(e.target.value) || 0.6)}
                className="w-full mt-0.5 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
              />
            </div>
          </div>
        )}

        {/* Core Layout */}
        <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" /> Core Topology
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-red-400 font-bold text-[10px] block">P-Cores</span>
              <input
                type="number"
                min="1"
                max="16"
                value={params.num_p_cores}
                onChange={(e) => handleChange("num_p_cores", parseInt(e.target.value) || 2)}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs font-mono"
              />
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-sky-400 font-bold text-[10px] block">E-Cores</span>
              <input
                type="number"
                min="1"
                max="32"
                value={params.num_e_cores}
                onChange={(e) => handleChange("num_e_cores", parseInt(e.target.value) || 4)}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Thermal Rules */}
        <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-400" /> Thermal Rules (°C)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 text-[10px]">P-Heat (+°C)</label>
              <input
                type="number"
                step="0.5"
                value={params.p_heat_rate}
                onChange={(e) => handleChange("p_heat_rate", parseFloat(e.target.value) || 5.0)}
                className="w-full mt-0.5 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 text-[10px]">E-Heat (+°C)</label>
              <input
                type="number"
                step="0.5"
                value={params.e_heat_rate}
                onChange={(e) => handleChange("e_heat_rate", parseFloat(e.target.value) || 1.0)}
                className="w-full mt-0.5 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 text-[10px]">Critical Limit</label>
              <input
                type="number"
                value={params.critical_temp}
                onChange={(e) => handleChange("critical_temp", parseFloat(e.target.value) || 90.0)}
                className="w-full mt-0.5 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 text-[10px]">Recovery Temp</label>
              <input
                type="number"
                value={params.recovery_temp}
                onChange={(e) => handleChange("recovery_temp", parseFloat(e.target.value) || 60.0)}
                className="w-full mt-0.5 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Penalty & I/O Chance */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
          <div>
            <label className="text-slate-400 text-[10px]">I/O Chance</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="0.5"
              value={params.io_probability}
              onChange={(e) => handleChange("io_probability", parseFloat(e.target.value) || 0.05)}
              className="w-full mt-0.5 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs font-mono"
            />
          </div>
          <div>
            <label className="text-slate-400 text-[10px]">Mig Penalty</label>
            <input
              type="number"
              min="0"
              max="10"
              value={params.migration_penalty_ticks}
              onChange={(e) => handleChange("migration_penalty_ticks", parseInt(e.target.value) || 2)}
              className="w-full mt-0.5 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white text-xs font-mono"
            />
          </div>
        </div>
      </div>

      {/* Primary Action Button */}
      <button
        onClick={onRun}
        disabled={loading}
        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-bold py-2.5 px-3 rounded-lg shadow-md transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
      >
        {loading ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current" />
        )}
        {loading ? "Simulating..." : "Run Simulation"}
      </button>
    </div>
  );
};
