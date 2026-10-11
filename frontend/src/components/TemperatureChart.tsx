"use client";

import React from "react";
import { SimulationResponse } from "@/types";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Flame } from "lucide-react";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface TemperatureChartProps {
  data: SimulationResponse | null;
}

export const TemperatureChart: React.FC<TemperatureChartProps> = ({ data }) => {
  if (!data) return null;

  const tamsTrace = data.traces.tams || [];
  const fcfsTrace = data.traces.fcfs || [];
  const rrTrace = data.traces.rr || [];

  const labels = tamsTrace.map((s) => s.tick);
  const tamsMax = tamsTrace.map((s) => Math.max(...Object.values(s.core_temps)));
  const fcfsMax = fcfsTrace.map((s) => Math.max(...Object.values(s.core_temps)));
  const rrMax = rrTrace.map((s) => Math.max(...Object.values(s.core_temps)));

  const chartData = {
    labels,
    datasets: [
      {
        label: "T.A.M.S. Max Temp",
        data: tamsMax,
        borderColor: "#10b981",
        backgroundColor: "#10b98120",
        borderWidth: 2,
        tension: 0.15,
        pointRadius: 1,
      },
      {
        label: "FCFS Max Temp",
        data: fcfsMax,
        borderColor: "#f59e0b",
        borderWidth: 1.5,
        tension: 0.15,
        pointRadius: 1,
      },
      {
        label: "Round Robin Max Temp",
        data: rrMax,
        borderColor: "#06b6d4",
        borderWidth: 1.5,
        tension: 0.15,
        pointRadius: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: "#1e293b" },
        ticks: { color: "#94a3b8", maxTicksLimit: 25 },
      },
      y: {
        min: 25,
        max: 105,
        grid: { color: "#1e293b" },
        ticks: { color: "#94a3b8" },
      },
    },
    plugins: {
      legend: { labels: { color: "#f8fafc", boxWidth: 12, font: { size: 11 } } },
    },
  };

  return (
    <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-lg space-y-2.5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Flame className="w-4 h-4 text-red-400" />
          Thermal Profile Timeline (°C)
        </h2>
        <span className="text-[11px] text-slate-400 font-mono">Limit: 90°C</span>
      </div>
      <div className="h-56 w-full">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};
