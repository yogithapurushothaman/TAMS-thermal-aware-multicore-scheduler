"use client";

import React, { useState, useEffect, useRef } from "react";
import { SimulationResponse, TickSnapshot } from "@/types";
import { Play, Pause, SkipForward, RotateCcw, Activity } from "lucide-react";

interface GanttChartProps {
  data: SimulationResponse | null;
}

export const GanttChart: React.FC<GanttChartProps> = ({ data }) => {
  const [algorithm, setAlgorithm] = useState<"tams" | "fcfs" | "rr">("tams");
  const [currentTick, setCurrentTick] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(200);

  const scrollRef = useRef<HTMLDivElement>(null);

  const trace: TickSnapshot[] = data?.traces[algorithm] || [];
  const maxTicks = trace.length;

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && maxTicks > 0) {
      timer = setInterval(() => {
        setCurrentTick((prev) => {
          if (prev >= maxTicks - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, playbackSpeed);
    }
    return () => clearInterval(timer);
  }, [isPlaying, maxTicks, playbackSpeed]);

  useEffect(() => {
    if (scrollRef.current && currentTick >= 0) {
      const activeElement = document.getElementById(`tick-header-${currentTick}`);
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [currentTick]);

  if (!data || maxTicks === 0) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
        Run simulation to visualize core execution timelines.
      </div>
    );
  }

  const coreIds = Object.keys(trace[0].core_temps);

  return (
    <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h2 className="text-base font-bold text-white">Execution Timeline</h2>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            (Active: Green, Cool: Red, I/O Wait: Yellow, Idle: Grey)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Algorithm Selector */}
          <select
            value={algorithm}
            onChange={(e) => {
              setAlgorithm(e.target.value as any);
              setCurrentTick(0);
              setIsPlaying(false);
            }}
            className="bg-slate-950 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 font-semibold focus:outline-none"
          >
            <option value="tams">T.A.M.S. (Custom)</option>
            <option value="fcfs">FCFS (Baseline)</option>
            <option value="rr">Round Robin (Baseline)</option>
          </select>

          {/* Controls */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentTick((prev) => Math.min(maxTicks - 1, prev + 1));
              }}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition"
              title="Step Forward"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentTick(0);
              }}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition"
              title="Reset Timeline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-xs font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-lg">
            Tick: {currentTick} / {maxTicks - 1}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[11px] font-medium text-slate-400 border-b border-slate-800/60 pb-2">
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block"></span>
          <span>Active</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-red-600 inline-block"></span>
          <span>Cool Down (COOL)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block"></span>
          <span>I/O Wait (WAIT)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-slate-800 inline-block"></span>
          <span>Idle</span>
        </div>
      </div>

      {/* Horizontal Gantt Grid */}
      <div ref={scrollRef} className="overflow-x-auto pb-2">
        <div className="min-w-max space-y-1.5">
          {/* Header */}
          <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500 border-b border-slate-800 pb-1">
            <div className="w-14 flex-shrink-0 font-bold text-slate-400">Core \ T</div>
            {trace.map((snap, t) => (
              <div
                key={t}
                id={`tick-header-${t}`}
                className={`w-9 text-center flex-shrink-0 py-0.5 rounded text-[10px] ${
                  t === currentTick ? "bg-indigo-600 text-white font-bold" : ""
                }`}
              >
                {t}
              </div>
            ))}
          </div>

          {/* Rows */}
          {coreIds.map((cid) => {
            const isP = cid.startsWith("P");
            return (
              <div key={cid} className="flex items-center gap-1">
                <div className="w-14 flex-shrink-0 text-xs font-mono font-bold flex items-center justify-between pr-1">
                  <span className={isP ? "text-red-400" : "text-sky-400"}>{cid}</span>
                  <span className="text-[9px] text-slate-500">
                    {trace[currentTick]?.core_temps[cid]?.toFixed(0)}°C
                  </span>
                </div>

                {trace.map((snap, t) => {
                  const pid = snap.core_pids[cid];
                  const state = snap.core_states[cid];
                  const isBlocked = snap.blocked_pids?.includes(pid as number);
                  const isCurrent = t === currentTick;

                  let cellBg = "bg-slate-800/60 text-slate-600";
                  let label = "--";

                  if (state === "LOCKED_COOLING") {
                    cellBg = "bg-red-600 text-white font-bold animate-pulse";
                    label = "COOL";
                  } else if (pid !== null && pid !== undefined) {
                    if (isBlocked) {
                      cellBg = "bg-amber-500 text-slate-950 font-bold";
                      label = "WAIT";
                    } else {
                      cellBg = "bg-emerald-600 text-white font-bold shadow-sm";
                      label = `P${pid}`;
                    }
                  }

                  return (
                    <div
                      key={t}
                      className={`w-9 h-8 flex items-center justify-center text-[11px] rounded font-mono transition-all flex-shrink-0 ${cellBg} ${
                        isCurrent ? "ring-2 ring-indigo-400 ring-offset-1 ring-offset-slate-900 scale-105 z-10" : ""
                      }`}
                      title={`Tick ${t} | Core ${cid} | ${state} | PID: ${pid ?? "None"} | ${snap.core_temps[cid]?.toFixed(1)}°C`}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
