"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Cpu,
  Flame,
  Zap,
  Activity,
  Layers,
  ShieldCheck,
  Radio,
  Terminal as TerminalIcon,
  RotateCcw,
  Thermometer,
  Play,
  Pause,
  Sliders,
  ChevronRight,
  TrendingUp,
  Clock,
  Sparkles,
  Waves,
  ArrowRight,
  CheckCircle2,
  Info,
  Server,
  Compass,
  FileText,
  SlidersHorizontal,
  Sun,
  Moon,
} from "lucide-react";
import GhostFibers from "../components/GhostFibers";

// ============================================================================
// Types & Data Contracts
// ============================================================================

type CoreStatus = "ONLINE" | "PARKED" | "MIGRATING" | "HOTSPOT";
type GovernorMode = "predictive" | "greedy" | "guard";
type EnvironmentMode = "server" | "desk" | "blanket";
type ActiveTab = "overview" | "simulation" | "cores" | "analytics" | "audit";
type ThemeMode = "light" | "dark";

interface EnvironmentConfig {
  name: string;
  icon: string;
  coolRate: number; // °C cooled per idle/parked tick
  ambient: number;  // Base ambient temp in °C
  desc: string;
}

const ENV_PROFILES: Record<EnvironmentMode, EnvironmentConfig> = {
  server: {
    name: "Server Room (A/C)",
    icon: "❄️",
    coolRate: 4.5,
    ambient: 24.0,
    desc: "-4.5°C/tick idle cooling (Chilled Airflow)",
  },
  desk: {
    name: "Desk Laptop",
    icon: "💻",
    coolRate: 2.0,
    ambient: 35.0,
    desc: "-2.0°C/tick idle cooling (Standard Active Fan)",
  },
  blanket: {
    name: "Blanket Laptop",
    icon: "🔥",
    coolRate: 0.6,
    ambient: 46.0,
    desc: "-0.6°C/tick (Choked Vents • Extreme Thermal Build-Up)",
  },
};

interface CoreState {
  id: string; // P00-P07, E00-E07
  type: "P" | "E";
  status: CoreStatus;
  temp: number; // in °C
  freq: number; // in GHz
  util: number; // in %
  taskId?: string;
}

interface WaveformPoint {
  time: string;
  timestamp: number;
  requestInflow: number; // k req/s
  thermalTj: number;     // °C
}

interface LogEntry {
  id: string;
  timestamp: string;
  tag: "PREDICT_BURST" | "CORE_PARK" | "MIGRATE_TASK" | "THERMAL_WARN" | "SYS_TICK";
  message: string;
}

interface GanttSegment {
  id: string;
  coreId: string;
  name: string;
  startPct: number;
  widthPct: number;
  type: "turbo" | "exec" | "migrate" | "parked" | "io";
}

// ============================================================================
// Initial Mock Data
// ============================================================================

const INITIAL_CORES: CoreState[] = [
  // 8 P-Cores
  { id: "P00", type: "P", status: "ONLINE", temp: 72.4, freq: 4.85, util: 88, taskId: "tls_handshake" },
  { id: "P01", type: "P", status: "ONLINE", temp: 68.2, freq: 4.70, util: 82, taskId: "grpc_dispatch" },
  { id: "P02", type: "P", status: "MIGRATING", temp: 84.6, freq: 4.10, util: 96, taskId: "MIGRATING -> E02" },
  { id: "P03", type: "P", status: "HOTSPOT", temp: 87.1, freq: 3.60, util: 99, taskId: "4k_h265_encode" },
  { id: "P04", type: "P", status: "PARKED", temp: 34.2, freq: 0.0, util: 0, taskId: "C6 DEEP SLEEP" },
  { id: "P05", type: "P", status: "PARKED", temp: 33.8, freq: 0.0, util: 0, taskId: "C6 DEEP SLEEP" },
  { id: "P06", type: "P", status: "PARKED", temp: 35.1, freq: 0.0, util: 0, taskId: "C6 DEEP SLEEP" },
  { id: "P07", type: "P", status: "PARKED", temp: 34.7, freq: 0.0, util: 0, taskId: "C6 DEEP SLEEP" },
  // 8 E-Cores
  { id: "E00", type: "E", status: "ONLINE", temp: 48.3, freq: 3.20, util: 64, taskId: "async_db_pool" },
  { id: "E01", type: "E", status: "ONLINE", temp: 51.0, freq: 3.20, util: 71, taskId: "k8s_telemetry" },
  { id: "E02", type: "E", status: "ONLINE", temp: 54.7, freq: 3.40, util: 78, taskId: "migrated_calc" },
  { id: "E03", type: "E", status: "ONLINE", temp: 46.2, freq: 3.00, util: 52, taskId: "log_flusher" },
  { id: "E04", type: "E", status: "ONLINE", temp: 47.9, freq: 3.10, util: 58, taskId: "epoll_worker" },
  { id: "E05", type: "E", status: "ONLINE", temp: 49.5, freq: 3.15, util: 60, taskId: "redis_io" },
  { id: "E06", type: "E", status: "PARKED", temp: 32.1, freq: 0.0, util: 0, taskId: "C6 DEEP SLEEP" },
  { id: "E07", type: "E", status: "PARKED", temp: 31.9, freq: 0.0, util: 0, taskId: "C6 DEEP SLEEP" },
];

const INITIAL_LOGS: LogEntry[] = [
  { id: "l-1", timestamp: "15:28:01.104", tag: "SYS_TICK", message: "Scheduler loop running at 1000Hz (deterministic tick: 1ms)." },
  { id: "l-2", timestamp: "15:28:01.320", tag: "PREDICT_BURST", message: "MLFQ classified incoming batch as compute-bound. Vector affinity mapped." },
  { id: "l-3", timestamp: "15:28:01.590", tag: "CORE_PARK", message: "Queue length < 8. Cores [P04, P05, P06, P07] held in C6 ultra-low sleep." },
  { id: "l-4", timestamp: "15:28:01.810", tag: "THERMAL_WARN", message: "Core P03 reported hotspot at 87.1°C (TjMax 85°C breached)." },
  { id: "l-5", timestamp: "15:28:02.040", tag: "MIGRATE_TASK", message: "Task 4k_h265_encode downshifted: preemption triggered, migrating to E02." },
];

export default function ModularDashboard() {
  // Theme State: 'dark' by default (pure jet black), switchable to 'light'
  const [theme, setTheme] = useState<ThemeMode>("dark");

  // Navigation View State
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");

  // Live Simulation Engine State
  const [tick, setTick] = useState<number>(0);
  const [cores, setCores] = useState<CoreState[]>(INITIAL_CORES);
  const [governor, setGovernor] = useState<GovernorMode>("predictive");
  const [environment, setEnvironment] = useState<EnvironmentMode>("desk");
  const [ingressLoad, setIngressLoad] = useState<number>(78.4); // k req/s
  const [thermalCeiling, setThermalCeiling] = useState<number>(85.0); // °C
  const [packageTDP, setPackageTDP] = useState<number>(118.4); // W
  const [isSimulationRunning, setIsSimulationRunning] = useState<boolean>(true);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);

  // References to eliminate stale closure bugs while keeping interval reactive
  const governorRef = useRef<GovernorMode>(governor);
  governorRef.current = governor;

  const envRef = useRef<EnvironmentMode>(environment);
  envRef.current = environment;

  const ingressRef = useRef<number>(ingressLoad);
  ingressRef.current = ingressLoad;

  const coresRef = useRef<CoreState[]>(cores);
  coresRef.current = cores;

  // Waveform History (30 rolling points)
  const [waveform, setWaveform] = useState<WaveformPoint[]>(() => {
    const arr: WaveformPoint[] = [];
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      const t = now - i * 800;
      const d = new Date(t);
      arr.push({
        time: d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        timestamp: t,
        requestInflow: Math.round(65 + Math.sin(i * 0.4) * 15),
        thermalTj: parseFloat((68 + Math.cos(i * 0.35) * 8).toFixed(1)),
      });
    }
    return arr;
  });

  // Ambient Cursor Glow (Aura Effect)
  const [mousePos, setMousePos] = useState({ x: -500, y: -500 });
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const terminalContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll terminal internally (never drag page down)
  useEffect(() => {
    if (terminalContainerRef.current) {
      terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Robust Live Simulation Loop (800ms) with zero stale closures and reliable pause/resume
  useEffect(() => {
    if (!isSimulationRunning) return;

    const timer = setInterval(() => {
      const activeGov = governorRef.current;
      const activeEnv = ENV_PROFILES[envRef.current] || ENV_PROFILES.desk;
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

      // Step 2.1: The Clock Advances
      const nextTick = tick + 1;
      setTick((prev) => prev + 1);

      // Step 2.2: Dynamic Ingress Harmonic Wave Walk
      const waveBase = 72 + Math.sin(nextTick * 0.18) * 18 + Math.cos(nextTick * 0.08) * 10;
      const jitter = Math.random() * 6.0 - 3.0;
      const rawIngress = ingressRef.current * 0.85 + (waveBase + jitter) * 0.15;
      const newIngress = parseFloat(Math.max(25, Math.min(160, rawIngress)).toFixed(1));
      ingressRef.current = newIngress;
      setIngressLoad(newIngress);

      // Step 2.3: Core Thermodynamics & Brain Migration Logic
      let activeCount = 0;
      let sumTemp = 0;

      const updatedCores = coresRef.current.map((c) => {
        let isParked = c.status === "PARKED";

        if (activeGov === "predictive") {
          // Smart T.A.M.S. Dynamic Auto-Park
          if (newIngress < 85 && (c.id === "P04" || c.id === "P05" || c.id === "P06" || c.id === "P07" || c.id === "E06" || c.id === "E07")) {
            isParked = true;
          } else if (newIngress > 105) {
            isParked = false; // Awaken during traffic spikes
          }
        } else if (activeGov === "greedy") {
          // Standard OS Greedy Compute: Disables parking, wakes all cores
          isParked = false;
        } else if (activeGov === "guard") {
          // Strict Thermal Guard: Park high index P-Cores
          if (c.type === "P" && (c.id === "P02" || c.id === "P03" || c.id === "P04" || c.id === "P05" || c.id === "P06" || c.id === "P07")) {
            isParked = true;
          }
        }

        if (isParked) {
          // Environmental cooling towards ambient
          const coolStep = activeEnv.coolRate * 0.45;
          const temp = Math.max(activeEnv.ambient, c.temp - coolStep);
          return {
            ...c,
            status: "PARKED" as CoreStatus,
            temp: parseFloat(temp.toFixed(1)),
            freq: 0.0,
            util: 0,
            taskId: "C6 DEEP SLEEP",
          };
        }

        // Active core
        activeCount++;
        let util = Math.max(25, Math.min(100, Math.round(45 + (newIngress / 2.2) + (Math.random() * 8 - 4))));
        let status: CoreStatus = "ONLINE";

        // Equilibrium target temp based on ambient, type, util, and environment
        const baseOffset = c.type === "P" ? 22 : 12;
        const loadHeat = (util / 100) * (c.type === "P" ? 28 : 14) * (newIngress / 80);
        let targetTemp = activeEnv.ambient + baseOffset + loadHeat;

        // Thermal Migration Logic (The Brain)
        // Critical threshold: > 88°C
        if (activeGov === "predictive") {
          // Smart T.A.M.S.: Pre-emptively sheds load and migrates task to E-Core when crossing >88°C
          if (c.temp >= 88 && c.type === "P") {
            status = "MIGRATING";
            util = Math.round(util * 0.35); // Heavy task migrated away to E-Core
            targetTemp = activeEnv.ambient + baseOffset + 4; // Rapid cooling
          } else if (c.temp >= 80 && c.type === "P") {
            status = "MIGRATING";
            util = Math.round(util * 0.55);
            targetTemp = activeEnv.ambient + baseOffset + 6;
          }
        } else if (activeGov === "greedy") {
          // Standard OS: Dumb OS ignores heat! Allows temperatures to spike into dangerous red zones (>95°C)
          if (c.temp >= 95) {
            status = "HOTSPOT";
            targetTemp = Math.min(102, targetTemp + 8);
          } else if (c.temp >= 88) {
            status = "HOTSPOT";
            targetTemp = Math.min(99, targetTemp + 5);
          }
        } else if (activeGov === "guard") {
          if (c.temp >= 78) {
            status = "MIGRATING";
            util = 25;
            targetTemp = activeEnv.ambient + baseOffset + 2;
          }
        }

        // Smooth Newton heating/cooling convergence
        const alpha = 0.22;
        const jitter = Math.random() * 0.6 - 0.3;
        const nextTemp = c.temp + (targetTemp - c.temp) * alpha + jitter;
        const temp = Math.max(activeEnv.ambient + 5, Math.min(activeGov === "greedy" ? 99 : 92, nextTemp));

        // Frequency scaling (DVFS)
        let freq = c.type === "P" ? 4.7 : 3.2;
        if (status === "HOTSPOT") {
          freq = Math.max(3.0, freq - 0.6); // Thermal throttle
        } else if (status === "MIGRATING") {
          freq = 3.8;
        } else if (c.type === "P") {
          freq = Math.min(5.1, Math.max(4.2, freq + (Math.random() * 0.1 - 0.05)));
        }

        sumTemp += temp;
        return {
          ...c,
          status,
          temp: parseFloat(temp.toFixed(1)),
          util,
          freq: parseFloat(freq.toFixed(2)),
          taskId: status === "MIGRATING" ? "MIGRATING -> E-Core" : c.taskId || "active_task",
        };
      });

      coresRef.current = updatedCores;
      setCores(updatedCores);

      // Step 2.4: Compute Package TDP and Live Waveform Point (30 rolling points)
      const avgTemp = activeCount > 0 ? sumTemp / activeCount : activeEnv.ambient;
      const newTDP = parseFloat((35 + activeCount * 7.2 + (Math.random() * 2 - 1)).toFixed(1));
      setPackageTDP(newTDP);

      setWaveform((prev) => [
        ...prev.slice(1),
        {
          time: timeStr,
          timestamp: Date.now(),
          requestInflow: newIngress,
          thermalTj: parseFloat(avgTemp.toFixed(1)),
        },
      ]);

      // 4. Kernel Telemetry Log Generation
      if (Math.random() > 0.4) {
        const eventTypes: Array<LogEntry["tag"]> = [
          "PREDICT_BURST",
          "CORE_PARK",
          "MIGRATE_TASK",
          "SYS_TICK",
          "THERMAL_WARN",
        ];
        const pickedTag = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        const ms = String(now.getMilliseconds()).padStart(3, "0");
        const logTimestamp = `${timeStr}.${ms}`;

        let message = "";
        switch (pickedTag) {
          case "PREDICT_BURST":
            message = `Heuristic vector observed ${newIngress}k req/s ingress under [${activeGov.toUpperCase()}] governor.`;
            break;
          case "CORE_PARK":
            message = `Thermal governor applied [${activeEnv.name}]: Idle cooling rate -${activeEnv.coolRate}°C/tick active.`;
            break;
          case "MIGRATE_TASK":
            message = `Affinity migration: Task #0x${Math.floor(Math.random() * 9000 + 1000).toString(16).toUpperCase()} transferred from P-Core to E-Core.`;
            break;
          case "THERMAL_WARN":
            message = `Die sensor array reported thermal equilibrium adjustment. Ambient base: ${activeEnv.ambient}°C.`;
            break;
          case "SYS_TICK":
            message = `Real-Time tick validated at 1000Hz: Preempt-RT deterministic jitter ±0.02μs.`;
            break;
        }

        setLogs((prev) => [
          ...prev.slice(-35),
          {
            id: `log-${Date.now()}-${Math.random()}`,
            timestamp: logTimestamp,
            tag: pickedTag,
            message,
          },
        ]);
      }
    }, 800);

    return () => clearInterval(timer);
  }, [isSimulationRunning]);

  // Traffic Injectors
  const trigger10xSpike = () => {
    setIngressLoad(142.8);
    ingressRef.current = 142.8;
    const spiked = coresRef.current.map((c) =>
      c.type === "P"
        ? { ...c, status: "ONLINE" as CoreStatus, util: 98, temp: Math.min(92, c.temp + 12), freq: 4.95 }
        : { ...c, status: "ONLINE" as CoreStatus, util: 90, temp: Math.min(68, c.temp + 6) }
    );
    coresRef.current = spiked;
    setCores(spiked);
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}`,
        timestamp: `${timeStr}.000`,
        tag: "PREDICT_BURST",
        message: "🚨 MANUAL OVERRIDE: 10x Web Traffic Spike Injected! All 8 P-Cores woken from C6 sleep.",
      },
    ]);
  };
  const triggerSpike = trigger10xSpike;

  const simulateMicroBurst = () => {
    setIngressLoad(96.4);
    ingressRef.current = 96.4;
    const burst = coresRef.current.map((c, i) =>
      i < 4
        ? { ...c, status: "ONLINE" as CoreStatus, util: 85, temp: c.temp + 5 }
        : c
    );
    coresRef.current = burst;
    setCores(burst);
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}`,
        timestamp: `${timeStr}.120`,
        tag: "PREDICT_BURST",
        message: "⚡ Micro-burst detected (12ms window). Handled via fast P00-P03 DVFS frequency boost.",
      },
    ]);
  };

  const triggerSustainedStress = () => {
    setIngressLoad(120.0);
    ingressRef.current = 120.0;
    const stressed = coresRef.current.map((c) => ({
      ...c,
      status: (c.type === "P" && c.temp > 82 ? "HOTSPOT" : "ONLINE") as CoreStatus,
      util: 95,
      temp: Math.min(95, c.temp + 8),
    }));
    coresRef.current = stressed;
    setCores(stressed);
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}`,
        timestamp: `${timeStr}.240`,
        tag: "THERMAL_WARN",
        message: "🔥 SUSTAINED STRESS ENGAGED: Multi-threaded compute workload saturating silicon package.",
      },
    ]);
  };

  const switchGovernor = (mode: GovernorMode) => {
    setGovernor(mode);
    governorRef.current = mode;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const label = mode === "predictive" ? "Smart T.A.M.S. (Predictive Auto-Park)" : mode === "greedy" ? "Standard OS (Greedy Compute)" : "Strict Thermal Guard";
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}`,
        timestamp: `${timeStr}.050`,
        tag: "SYS_TICK",
        message: `⚙️ Scheduler policy mutated to [${label}]. Migration heuristic recomputed.`,
      },
    ]);
  };

  const switchEnvironment = (envKey: EnvironmentMode) => {
    setEnvironment(envKey);
    envRef.current = envKey;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const prof = ENV_PROFILES[envKey];
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}`,
        timestamp: `${timeStr}.080`,
        tag: "CORE_PARK",
        message: `🌍 Environment Profile switched to [${prof.name}]. Ambient floor set to ${prof.ambient}°C.`,
      },
    ]);
  };

  // Top Metrics Calculations
  const onlineCoresCount = cores.filter((c) => c.status !== "PARKED").length;
  const packageLoadAvg = Math.round(cores.reduce((acc, c) => acc + c.util, 0) / cores.length);
  const peakDieTemp = Math.max(...cores.map((c) => c.temp));

  // Gantt Mock Segments
  const ganttRows: GanttSegment[] = [
    { id: "g-p00-1", coreId: "P00", name: "tls_handshake (P00)", startPct: 0, widthPct: 45, type: "turbo" },
    { id: "g-p00-2", coreId: "P00", name: "redis_bgsave", startPct: 48, widthPct: 50, type: "turbo" },
    { id: "g-p03-1", coreId: "P03", name: "4k_h265_encode", startPct: 0, widthPct: 60, type: "turbo" },
    { id: "g-p03-2", coreId: "P03", name: "MIGRATING -> E02", startPct: 62, widthPct: 36, type: "migrate" },
    { id: "g-e00-1", coreId: "E00", name: "async_db_pool", startPct: 0, widthPct: 52, type: "exec" },
    { id: "g-e00-2", coreId: "E00", name: "k8s_telemetry", startPct: 55, widthPct: 42, type: "exec" },
    { id: "g-e04-1", coreId: "E04", name: "PARKED / C6 DEEP SLEEP", startPct: 0, widthPct: 70, type: "parked" },
    { id: "g-e04-2", coreId: "E04", name: "epoll_worker", startPct: 72, widthPct: 26, type: "io" },
  ];

  // Theme Classes & Glassmorphism Polish (Translucent dark styling & neon accents)
  // Theme Classes: Pure Jet Black (#000000) Canvas with Vivid Neon Blue Fibers
  const isDark = theme === "dark";
  const bgClass = isDark ? "bg-[#000000] text-slate-100" : "bg-[#f8fafc] text-slate-800";
  const headerBgClass = isDark ? "bg-[#000000]/80 backdrop-blur-md border-cyan-500/20" : "bg-white/80 backdrop-blur-md border-stone-200/80";
  const cardBgClass = isDark ? "bg-[#080B12]/80 backdrop-blur-md border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.6)]" : "bg-white/85 backdrop-blur-md border border-stone-200/80 shadow-sm";
  const navTrackBgClass = isDark ? "bg-[#080B12]/90 border-cyan-500/20" : "bg-stone-100/90 border-stone-200/80";
  const subTextClass = isDark ? "text-slate-400" : "text-stone-500";
  const titleTextClass = isDark ? "text-slate-100" : "text-stone-900";
  const innerCardBgClass = isDark ? "bg-[#0F1420]/60 border-slate-800/80" : "bg-stone-50/80 border-stone-200/80";

  return (
    <div className={`min-h-screen ${bgClass} font-sans antialiased flex flex-col justify-between transition-colors duration-200 relative overflow-x-hidden`}>
      {/* React Bits: Full-Screen GhostFibers Background (Jet Black in Dark mode, Crisp Bright White/Pastel in Light mode) */}
      <div className={`fixed inset-0 pointer-events-none z-0 overflow-hidden ${isDark ? "bg-[#000000]" : "bg-[#f8fafc]"}`}>
        <GhostFibers
          glowColor={isDark ? "#0066ff" : "#6366f1"}
          lineColor={isDark ? "#38bdf8" : "#818cf8"}
          speed={0.22}
          scale={2.2}
          rotationSpeed={0.2}
          layers={4}
          twist={0.12}
          threads={1}
          glow={1.2}
          brightness={isDark ? 1.4 : 1.2}
          vignette={isDark ? 0.9 : 0.4}
          mouseInteraction={true}
          lightMode={!isDark}
        />
      </div>

      {/* Ambient Cursor Glow (Aura Effect) */}
      {isDark && (
        <div
          aria-hidden="true"
          className="fixed pointer-events-none -inset-px z-0 transition-opacity duration-300"
          style={{
            background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(16, 185, 129, 0.07), rgba(6, 182, 212, 0.04), transparent 80%)`,
          }}
        />
      )}

      {/* ===================================================================== */}
      {/* 1. TOP ENTERPRISE NAVIGATION BAR (Merged Seamless Header)              */}
      {/* ===================================================================== */}
      <header className={`w-full ${headerBgClass} border-b shadow-2xs transition-colors duration-200 sticky top-0 z-50 backdrop-blur-md`}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          {/* Logo / Branding */}
          <div
            onClick={() => setActiveTab("overview")}
            className="flex items-center gap-3 cursor-pointer group select-none"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-400 text-white flex items-center justify-center shadow-md shadow-indigo-300/30 group-hover:scale-105 transition-all">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`font-extrabold text-base tracking-tight ${titleTextClass} group-hover:text-indigo-400 transition-colors`}>
                  T.A.M.S.
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                  isDark
                    ? "text-purple-300 bg-purple-950/60 border-purple-800"
                    : "text-purple-700 bg-purple-50 border-purple-200"
                }`}>
                  v4.19-RT
                </span>
              </div>
              <p className={`text-[11px] ${subTextClass} font-medium hidden sm:block tracking-normal`}>
                Thermal-Aware Multicore Scheduler
              </p>
            </div>
          </div>

          {/* Stepper / Tab Pills */}
          <nav className={`flex items-center gap-1 sm:gap-1.5 ${navTrackBgClass} p-1.5 rounded-full border text-xs font-medium`}>
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === "overview"
                  ? isDark
                    ? "bg-[#242424] text-indigo-300 font-bold shadow-xs border border-neutral-700"
                    : "bg-white text-indigo-700 font-bold shadow-xs"
                  : isDark
                  ? "text-neutral-400 hover:text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-indigo-400" />
              <span>Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("simulation")}
              className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === "simulation"
                  ? isDark
                    ? "bg-[#242424] text-indigo-300 font-bold shadow-xs border border-neutral-700"
                    : "bg-white text-indigo-700 font-bold shadow-xs"
                  : isDark
                  ? "text-neutral-400 hover:text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
              <span>Simulation Controls</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("cores")}
              className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === "cores"
                  ? isDark
                    ? "bg-[#242424] text-indigo-300 font-bold shadow-xs border border-neutral-700"
                    : "bg-white text-indigo-700 font-bold shadow-xs"
                  : isDark
                  ? "text-neutral-400 hover:text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span>Core Matrix</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("analytics")}
              className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === "analytics"
                  ? isDark
                    ? "bg-[#242424] text-indigo-300 font-bold shadow-xs border border-neutral-700"
                    : "bg-white text-indigo-700 font-bold shadow-xs"
                  : isDark
                  ? "text-neutral-400 hover:text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Thermal & Timeline</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("audit")}
              className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === "audit"
                  ? isDark
                    ? "bg-[#242424] text-indigo-300 font-bold shadow-xs border border-neutral-700"
                    : "bg-white text-indigo-700 font-bold shadow-xs"
                  : isDark
                  ? "text-neutral-400 hover:text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>Audit Logs</span>
            </button>
          </nav>

          {/* Right Action Area: Theme Toggle & Play/Pause */}
          <div className="flex items-center gap-2.5">
            {/* Light / Dark Pastel Toggle */}
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={`p-2 rounded-xl border transition-all flex items-center justify-center shadow-xs ${
                isDark
                  ? "bg-[#1E2433] border-slate-700 text-amber-300 hover:bg-slate-800"
                  : "bg-stone-50 border-stone-200 text-indigo-600 hover:bg-stone-100"
              }`}
              title={isDark ? "Switch to Light Pastel Theme" : "Switch to Dark Pastel Theme"}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Status indicator pill */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border ${
              isSimulationRunning
                ? isDark ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                : isDark ? "bg-amber-950/60 text-amber-300 border-amber-800" : "bg-amber-50 text-amber-700 border-amber-200"
            }`}>
              <span className={`w-2 h-2 rounded-full ${isSimulationRunning ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              <span>{isSimulationRunning ? `RUNNING • TICK #${tick}` : "PAUSED"}</span>
            </div>

            {/* Simulation Engine Toggle */}
            <button
              type="button"
              onClick={() => setIsSimulationRunning((prev) => !prev)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs active:scale-95 ${
                isSimulationRunning
                  ? "bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-indigo-300/30"
                  : isDark
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                  : "bg-stone-800 hover:bg-stone-900 text-white"
              }`}
            >
              {isSimulationRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Engine</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume Engine</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ===================================================================== */}
      {/* 2. BODY CONTENT - STEP BY STEP VIEWS                                  */}
      {/* ===================================================================== */}
      <main className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 relative z-10">
        {/* =================================================================== */}
        {/* TAB 1: OVERVIEW / HERO STEP                                         */}
        {/* =================================================================== */}
        {activeTab === "overview" && (
          <div className="space-y-16 animate-in fade-in duration-300 py-4 sm:py-8">
            {/* Hero Section - Open, Borderless Layout without Bento Container */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              {/* Left Column: Headlines & Call to Actions */}
              <div className="lg:col-span-7 space-y-6">
                <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase ${
                  isDark
                    ? "bg-indigo-950/40 border border-indigo-500/30 text-indigo-300"
                    : "bg-indigo-50/80 border border-indigo-200/80 text-indigo-700"
                }`}>
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  OPERATING SYSTEM MULTICORE ENGINE
                </div>

                <h1 className={`text-4xl sm:text-5xl lg:text-6xl font-extrabold ${titleTextClass} tracking-tight leading-[1.1]`}>
                  See thermal throttles <br />
                  <span className="bg-gradient-to-r from-indigo-500 to-purple-400 bg-clip-text text-transparent">
                    before they happen.
                  </span>
                </h1>

                <p className={`${subTextClass} text-base sm:text-lg leading-relaxed max-w-xl`}>
                  An interactive Operating System simulation to model heterogeneous core allocation, dynamic core parking, and evaluate predictive MLFQ thermal migration with step-by-step telemetry visualization.
                </p>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSimulationRunning(true);
                      setActiveTab("simulation");
                    }}
                    className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all flex items-center gap-2 active:scale-95"
                  >
                    <span>Start Simulation</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("analytics")}
                    className={`px-5 py-3.5 rounded-xl ${
                      isDark
                        ? "bg-slate-800/60 hover:bg-slate-700/70 text-slate-200 border border-slate-700/50"
                        : "bg-white/80 hover:bg-stone-100 text-stone-700 border border-stone-200/80 shadow-sm"
                    } font-semibold text-sm transition-all flex items-center gap-2`}
                  >
                    <Activity className="w-4 h-4 text-indigo-400" />
                    <span>Live Waveforms</span>
                  </button>
                </div>

                {/* Quick Presets / Tags */}
                <div className="pt-4 flex flex-wrap items-center gap-2 text-xs font-medium">
                  <span className={`${subTextClass} mr-1`}>Quick Scenarios:</span>
                  <button
                    type="button"
                    onClick={() => {
                      trigger10xSpike();
                      setActiveTab("analytics");
                    }}
                    className={`px-3 py-1 rounded-full border transition ${
                      isDark
                        ? "bg-emerald-950/30 text-emerald-300 border-emerald-500/30 hover:bg-emerald-900/40"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    }`}
                  >
                    ⚡ Web Traffic Spike
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerSustainedStress();
                      setActiveTab("cores");
                    }}
                    className={`px-3 py-1 rounded-full border transition ${
                      isDark
                        ? "bg-rose-950/30 text-rose-300 border-rose-500/30 hover:bg-rose-900/40"
                        : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                    }`}
                  >
                    🔥 4K Video Render
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("simulation")}
                    className={`px-3 py-1 rounded-full border transition ${
                      isDark
                        ? "bg-amber-950/30 text-amber-300 border-amber-500/30 hover:bg-amber-900/40"
                        : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                    }`}
                  >
                    🛡️ Core Parking Guard
                  </button>
                </div>
              </div>

              {/* Right Column: Silicon Allocation Topology (Clean & Open without heavy outer bento card) */}
              <div className="lg:col-span-5">
                <div className="space-y-4">
                  <div className={`flex items-center justify-between pb-2 border-b ${isDark ? "border-slate-800/80" : "border-stone-200/80"}`}>
                    <span className={`font-bold text-sm flex items-center gap-2 ${isDark ? "text-slate-200" : "text-stone-800"}`}>
                      <Cpu className="w-4 h-4 text-cyan-400" />
                      Silicon Allocation Topology
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                      PREEMPT-RT ONLINE
                    </span>
                  </div>

                  {/* Visual Topology Nodes */}
                  <div className="grid grid-cols-4 gap-2.5 py-1">
                    {cores.slice(0, 8).map((c) => (
                      <div
                        key={c.id}
                        className={`p-2.5 rounded-xl border text-center transition-all ${
                          c.status === "HOTSPOT"
                            ? "bg-rose-950/60 border-rose-600 text-rose-300 animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.3)]"
                            : c.status === "MIGRATING"
                            ? "bg-amber-950/60 border-amber-500/60 text-amber-300"
                            : c.status === "PARKED"
                            ? isDark
                              ? "bg-slate-900/40 border-slate-800/60 text-neutral-500"
                              : "bg-stone-100/70 border-stone-200 text-stone-400"
                            : isDark
                            ? "bg-slate-900/70 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                            : "bg-white border-emerald-500/30 text-emerald-600 shadow-sm"
                        }`}
                      >
                        <div className="text-[10px] font-mono font-bold">{c.id}</div>
                        <div className="text-xs font-mono font-black mt-0.5">
                          {c.temp.toFixed(0)}°C
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary Telemetry Metrics */}
                  <div className={`grid grid-cols-3 gap-2 pt-2 border-t ${isDark ? "border-slate-800/80" : "border-stone-200/80"} text-center font-mono text-xs`}>
                    <div>
                      <span className="text-neutral-400 text-[10px] block">Cores Active</span>
                      <span className={`font-bold ${isDark ? "text-white" : "text-stone-900"}`}>{onlineCoresCount}/16</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 text-[10px] block">Peak Junction</span>
                      <span className={`font-bold ${peakDieTemp >= 85 ? "text-rose-400" : "text-amber-400"}`}>
                        {peakDieTemp.toFixed(1)}°C
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-400 text-[10px] block">Package TDP</span>
                      <span className="font-bold text-emerald-400">{packageTDP.toFixed(1)}W</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick 4-Step Process Guide - Open Flow without Bento Boxes */}
            <div className={`pt-6 border-t ${isDark ? "border-slate-800/60" : "border-stone-200/80"}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div
                  onClick={() => setActiveTab("simulation")}
                  className="space-y-2 cursor-pointer group transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold flex items-center justify-center text-xs group-hover:bg-indigo-500 group-hover:text-white transition">
                    1
                  </div>
                  <h2 className={`font-bold text-sm ${titleTextClass} group-hover:text-indigo-400 transition`}>Set Workload Profile</h2>
                  <p className={`text-xs ${subTextClass} leading-relaxed`}>
                    Inject synthetic bursts, web traffic spikes, or sustained video encoding stress.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab("cores")}
                  className="space-y-2 cursor-pointer group transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold flex items-center justify-center text-xs group-hover:bg-emerald-500 group-hover:text-white transition">
                    2
                  </div>
                  <h2 className={`font-bold text-sm ${titleTextClass} group-hover:text-emerald-400 transition`}>Inspect 16-Core Matrix</h2>
                  <p className={`text-xs ${subTextClass} leading-relaxed`}>
                    Monitor 8 P-Cores & 8 E-Cores dynamically park or wake up in C6 sleep states.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab("analytics")}
                  className="space-y-2 cursor-pointer group transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold flex items-center justify-center text-xs group-hover:bg-cyan-500 group-hover:text-white transition">
                    3
                  </div>
                  <h2 className={`font-bold text-sm ${titleTextClass} group-hover:text-cyan-400 transition`}>Analyze Waveforms</h2>
                  <p className={`text-xs ${subTextClass} leading-relaxed`}>
                    Correlate incoming request vectors with die temperature spikes and TjMax ceilings.
                  </p>
                </div>

                <div
                  onClick={() => setActiveTab("audit")}
                  className="space-y-2 cursor-pointer group transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold flex items-center justify-center text-xs group-hover:bg-amber-500 group-hover:text-white transition">
                    4
                  </div>
                  <h2 className={`font-bold text-sm ${titleTextClass} group-hover:text-amber-400 transition`}>Verify Kernel Audit</h2>
                  <p className={`text-xs ${subTextClass} leading-relaxed`}>
                    Inspect raw deterministic telemetry logs, micro-task migrations, and clock jitter.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: STEP 1 - SIMULATION CONTROLS & GOVERNOR                      */}
        {/* =================================================================== */}
        {/* =================================================================== */}
        {/* TAB 2: STEP 1 - SIMULATION CONTROLS & GOVERNOR                      */}
        {/* =================================================================== */}
        {activeTab === "simulation" && (
          <div className="space-y-12 animate-in fade-in duration-300 py-4 sm:py-6">
            {/* Step Header - Open & Borderless */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-700/40">
              <div>
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase mb-3 ${
                  isDark ? "bg-indigo-950/40 border border-indigo-500/30 text-indigo-300" : "bg-indigo-50/80 border border-indigo-200/80 text-indigo-700"
                }`}>
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  STEP 01 OF 04
                </div>
                <h2 className={`text-2xl sm:text-3xl font-extrabold ${titleTextClass}`}>Configure & Inject Simulation Workload</h2>
                <p className={`text-sm ${subTextClass} mt-1.5 max-w-2xl`}>
                  Tune the CPU governor logic, trigger traffic vectors, and select environmental cooling to test thermal boundaries in real time.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("cores")}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition flex items-center gap-2"
                >
                  <span>Proceed to Core Matrix</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
              {/* Traffic Burst Injectors - Open Layout */}
              <div className="lg:col-span-6 space-y-5">
                <div className={`flex items-center justify-between pb-3 border-b ${isDark ? "border-slate-800" : "border-stone-200/80"}`}>
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    <h3 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                      Synthetic Traffic Injector
                    </h3>
                  </div>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                    isDark ? "text-indigo-300 bg-indigo-950/60 border border-indigo-800" : "text-indigo-700 bg-indigo-50"
                  }`}>
                    {ingressLoad.toFixed(1)}k req/s
                  </span>
                </div>

                <p className={`text-xs ${subTextClass}`}>
                  Click an action below to inject instantaneous traffic patterns and observe how T.A.M.S. pre-empts thermal hot-spots:
                </p>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={trigger10xSpike}
                    className={`w-full p-4 rounded-xl border transition flex items-center justify-between text-left group ${
                      isDark
                        ? "border-indigo-800/40 bg-indigo-950/20 hover:bg-indigo-950/40 hover:border-indigo-500/50"
                        : "border-indigo-200/70 bg-indigo-50/40 hover:bg-indigo-100/60"
                    }`}
                  >
                    <div>
                      <span className={`text-sm font-bold ${isDark ? "text-indigo-300" : "text-indigo-900"} block flex items-center gap-1.5`}>
                        <TrendingUp className="w-4 h-4 text-indigo-400" />
                        Trigger 10x Web Spike
                      </span>
                      <span className={`text-xs ${subTextClass}`}>
                        Pumps ingress to +140k req/s. Awakens all parked P-Cores instantly.
                      </span>
                    </div>
                    <span className={`text-xs font-mono font-bold px-3 py-1.5 rounded-lg border transition ${
                      isDark ? "text-indigo-300 bg-indigo-900/40 border-indigo-700 group-hover:bg-indigo-600 group-hover:text-white" : "text-indigo-700 bg-white border-indigo-200 group-hover:bg-indigo-600 group-hover:text-white"
                    }`}>
                      Execute
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={simulateMicroBurst}
                    className={`w-full p-4 rounded-xl border transition flex items-center justify-between text-left group ${
                      isDark
                        ? "border-amber-800/40 bg-amber-950/20 hover:bg-amber-950/40 hover:border-amber-500/50"
                        : "border-amber-200/70 bg-amber-50/40 hover:bg-amber-100/60"
                    }`}
                  >
                    <div>
                      <span className={`text-sm font-bold ${isDark ? "text-amber-300" : "text-amber-900"} block flex items-center gap-1.5`}>
                        <Zap className="w-4 h-4 text-amber-400" />
                        Simulate Micro-Burst
                      </span>
                      <span className={`text-xs ${subTextClass}`}>
                        12ms high-frequency vector handled via P00-P03 DVFS turbo boost.
                      </span>
                    </div>
                    <span className={`text-xs font-mono font-bold px-3 py-1.5 rounded-lg border transition ${
                      isDark ? "text-amber-300 bg-amber-900/40 border-amber-700 group-hover:bg-amber-600 group-hover:text-white" : "text-amber-700 bg-white border-amber-200 group-hover:bg-amber-600 group-hover:text-white"
                    }`}>
                      Execute
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={triggerSustainedStress}
                    className={`w-full p-4 rounded-xl border transition flex items-center justify-between text-left group ${
                      isDark
                        ? "border-rose-800/40 bg-rose-950/20 hover:bg-rose-950/40 hover:border-rose-500/50"
                        : "border-rose-200/70 bg-rose-50/40 hover:bg-rose-100/60"
                    }`}
                  >
                    <div>
                      <span className={`text-sm font-bold ${isDark ? "text-rose-300" : "text-rose-900"} block flex items-center gap-1.5`}>
                        <Flame className="w-4 h-4 text-rose-400" />
                        Sustained 4K Video Encoding Stress
                      </span>
                      <span className={`text-xs ${subTextClass}`}>
                        Heavy compute workload designed to force cores past TjMax (85°C).
                      </span>
                    </div>
                    <span className={`text-xs font-mono font-bold px-3 py-1.5 rounded-lg border transition ${
                      isDark ? "text-rose-300 bg-rose-900/40 border-rose-700 group-hover:bg-rose-600 group-hover:text-white" : "text-rose-700 bg-white border-rose-200 group-hover:bg-rose-600 group-hover:text-white"
                    }`}>
                      Execute
                    </span>
                  </button>
                </div>
              </div>

              {/* Parking Governor Settings - Open Layout */}
              <div className="lg:col-span-6 space-y-5">
                <div className={`flex items-center justify-between pb-3 border-b ${isDark ? "border-slate-800" : "border-stone-200/80"}`}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <h3 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                      CPU Parking Governor Policy
                    </h3>
                  </div>
                  <span className={`text-xs font-mono ${subTextClass}`}>
                    Mode: {governor.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-3">
                  <label
                    onClick={() => switchGovernor("predictive")}
                    className={`block p-4 rounded-xl border transition cursor-pointer ${
                      governor === "predictive"
                        ? isDark
                          ? "border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500"
                          : "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 shadow-sm"
                        : isDark
                        ? "border-slate-800/80 bg-slate-900/30 hover:bg-slate-900/60"
                        : "border-stone-200/80 hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${titleTextClass}`}>
                        Smart T.A.M.S. (Predictive Auto-Park)
                      </span>
                      <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded">
                        RECOMMENDED
                      </span>
                    </div>
                    <p className={`text-xs ${subTextClass} mt-1`}>
                      Predicts load spikes using heuristic queues. Dynamically parks idle P-Cores in deep C6 sleep to save up to 46.6W.
                    </p>
                  </label>

                  <label
                    onClick={() => switchGovernor("greedy")}
                    className={`block p-4 rounded-xl border transition cursor-pointer ${
                      governor === "greedy"
                        ? isDark
                          ? "border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500"
                          : "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 shadow-sm"
                        : isDark
                        ? "border-slate-800/80 bg-slate-900/30 hover:bg-slate-900/60"
                        : "border-stone-200/80 hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${titleTextClass}`}>
                        Standard OS (Greedy Compute)
                      </span>
                      <span className={`text-[10px] font-mono ${subTextClass} ${isDark ? "bg-slate-800" : "bg-stone-100"} px-2 py-0.5 rounded`}>
                        MAX POWER
                      </span>
                    </div>
                    <p className={`text-xs ${subTextClass} mt-1`}>
                      Disables parking. Keeps all 16 cores spun up at maximum frequencies regardless of thermal dissipation.
                    </p>
                  </label>

                  <label
                    onClick={() => switchGovernor("guard")}
                    className={`block p-4 rounded-xl border transition cursor-pointer ${
                      governor === "guard"
                        ? isDark
                          ? "border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500"
                          : "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 shadow-sm"
                        : isDark
                        ? "border-slate-800/80 bg-slate-900/30 hover:bg-slate-900/60"
                        : "border-stone-200/80 hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${titleTextClass}`}>
                        Strict Thermal Throttling Guard
                      </span>
                      <span className="text-[10px] font-mono text-amber-600 bg-amber-100 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded">
                        AGGRESSIVE
                      </span>
                    </div>
                    <p className={`text-xs ${subTextClass} mt-1`}>
                      Hard clamps temperatures strictly under 80°C. Forces immediate task downshifting to E-Cores.
                    </p>
                  </label>
                </div>
              </div>

              {/* Environment Profile Selector - Open Layout */}
              <div className={`lg:col-span-12 pt-4 border-t ${isDark ? "border-slate-800" : "border-stone-200/80"} space-y-4`}>
                <div className={`flex items-center justify-between pb-3 border-b ${isDark ? "border-slate-800" : "border-stone-200/80"}`}>
                  <div className="flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-rose-400" />
                    <h3 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                      Operating Environment Thermal Profile
                    </h3>
                  </div>
                  <span className={`text-xs font-mono ${subTextClass}`}>
                    Ambient: {ENV_PROFILES[environment].ambient}°C • Active: {ENV_PROFILES[environment].name}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(["server", "desk", "blanket"] as EnvironmentMode[]).map((envKey) => {
                    const prof = ENV_PROFILES[envKey];
                    const isSelected = environment === envKey;
                    return (
                      <button
                        key={envKey}
                        type="button"
                        onClick={() => switchEnvironment(envKey)}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          isSelected
                            ? isDark
                              ? "border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500 shadow-sm"
                              : "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 shadow-sm"
                            : isDark
                            ? "border-slate-800/80 bg-slate-900/30 hover:bg-slate-900/60"
                            : "border-stone-200/80 bg-white/60 hover:bg-stone-50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xl">{prof.icon}</span>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                            isSelected
                              ? isDark ? "bg-indigo-900 text-indigo-200" : "bg-indigo-100 text-indigo-700"
                              : isDark ? "bg-slate-800 text-slate-400" : "bg-stone-100 text-stone-600"
                          }`}>
                            {prof.ambient}°C Ambient
                          </span>
                        </div>
                        <div className={`text-sm font-bold ${titleTextClass}`}>{prof.name}</div>
                        <p className={`text-xs ${subTextClass} mt-1 leading-relaxed`}>{prof.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: STEP 2 - 16-CORE SILICON MATRIX                             */}
        {/* =================================================================== */}
        {activeTab === "cores" && (
          <div className="space-y-10 animate-in fade-in duration-300 py-4 sm:py-6">
            {/* Step Header - Open & Borderless */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-700/40">
              <div>
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase mb-3 ${
                  isDark ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300" : "bg-emerald-50/80 border border-emerald-200/80 text-emerald-700"
                }`}>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  STEP 02 OF 04
                </div>
                <h2 className={`text-2xl sm:text-3xl font-extrabold ${titleTextClass}`}>16-Core Silicon Die Matrix Telemetry</h2>
                <p className={`text-sm ${subTextClass} mt-1.5 max-w-2xl`}>
                  Real-time thermal and frequency readings across 8 Performance Cores (P00-P07) and 8 Efficiency Cores (E00-E07).
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("simulation")}
                  className={`px-4 py-2.5 rounded-xl ${isDark ? "bg-slate-800/60 hover:bg-slate-700/70 text-slate-200 border border-slate-700/50" : "bg-white/80 hover:bg-stone-100 text-stone-700 border border-stone-200/80"} font-semibold text-xs transition`}
                >
                  Back to Controls
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("analytics")}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition flex items-center gap-2"
                >
                  <span>Proceed to Waveforms</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Core Matrix - Open Layout without Outer Bento Card */}
            <div className="space-y-6">
              <div className={`flex flex-wrap items-center justify-between gap-3 pb-3 border-b ${isDark ? "border-slate-800" : "border-stone-200/80"}`}>
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <h3 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                    Silicon Die Floorplan (8P / 8E Heterogeneous Array)
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-emerald-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> Online
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-500">
                    <span className="w-2 h-2 rounded-full bg-amber-400" /> Migrating
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-500">
                    <span className="w-2 h-2 rounded-full bg-rose-400" /> Hotspot
                  </span>
                  <span className={`flex items-center gap-1.5 ${subTextClass}`}>
                    <span className="w-2 h-2 rounded-full bg-slate-400" /> Parked (C6)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3.5">
                {cores.map((c) => {
                  let badgeBg = isDark ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-emerald-50 text-emerald-700 border-emerald-200";
                  let cardBorder = isDark ? "border-slate-800/80 bg-slate-900/40" : "border-stone-200/80 bg-white/70 shadow-xs";
                  if (c.status === "HOTSPOT") {
                    badgeBg = isDark ? "bg-rose-950/60 text-rose-300 border-rose-800 animate-pulse" : "bg-rose-50 text-rose-700 border-rose-200 animate-pulse";
                    cardBorder = isDark ? "border-rose-800/80 bg-rose-950/30 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse" : "border-rose-300 bg-rose-50/40";
                  } else if (c.status === "MIGRATING") {
                    badgeBg = isDark ? "bg-amber-950/60 text-amber-300 border-amber-800" : "bg-amber-50 text-amber-700 border-amber-200";
                    cardBorder = isDark ? "border-amber-800/80 bg-amber-950/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]" : "border-amber-300 bg-amber-50/40";
                  } else if (c.status === "PARKED") {
                    badgeBg = isDark ? "bg-slate-800 text-slate-500 border-slate-700" : "bg-stone-100 text-stone-500 border-stone-200";
                    cardBorder = isDark ? "border-slate-800/50 bg-slate-950/30 text-slate-600" : "border-stone-200/60 bg-stone-100/40 text-stone-400";
                  }

                  return (
                    <div
                      key={c.id}
                      className={`p-3.5 rounded-xl border ${cardBorder} flex flex-col justify-between transition-all hover:scale-[1.02]`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-mono font-bold text-xs ${titleTextClass}`}>
                          {c.id}
                        </span>
                        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${badgeBg}`}>
                          {c.status}
                        </span>
                      </div>

                      <div className="my-2.5">
                        <div className={`text-base font-mono font-black ${
                          c.temp >= 85 ? "text-rose-500" : c.temp >= 75 ? "text-amber-500" : isDark ? "text-slate-100" : "text-stone-800"
                        }`}>
                          {c.temp.toFixed(1)}°C
                        </div>
                        <div className={`text-[10px] font-mono ${subTextClass}`}>
                          {c.freq > 0 ? `${c.freq.toFixed(2)} GHz` : "0.0 GHz (Sleep)"}
                        </div>
                      </div>

                      {/* Mini Util Bar */}
                      <div className="space-y-1">
                        <div className={`w-full h-1.5 rounded-full ${isDark ? "bg-slate-800" : "bg-stone-100"} overflow-hidden`}>
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              c.status === "HOTSPOT"
                                ? "bg-rose-400"
                                : c.status === "MIGRATING"
                                ? "bg-amber-400"
                                : c.status === "ONLINE"
                                ? "bg-indigo-400"
                                : "bg-slate-500"
                            }`}
                            style={{ width: `${c.util}%` }}
                          />
                        </div>
                        <div className={`flex justify-between text-[9px] font-mono ${subTextClass}`}>
                          <span>Util</span>
                          <span>{c.util}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: STEP 3 - THERMAL WAVEFORM & TASK GANTT                       */}
        {/* =================================================================== */}
        {activeTab === "analytics" && (
          <div className="space-y-12 animate-in fade-in duration-300 py-4 sm:py-6">
            {/* Step Header - Open & Borderless */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-700/40">
              <div>
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase mb-3 ${
                  isDark ? "bg-cyan-950/40 border border-cyan-500/30 text-cyan-300" : "bg-cyan-50/80 border border-cyan-200/80 text-cyan-700"
                }`}>
                  <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                  STEP 03 OF 04
                </div>
                <h2 className={`text-2xl sm:text-3xl font-extrabold ${titleTextClass}`}>Thermal Waveform & Task Timeline</h2>
                <p className={`text-sm ${subTextClass} mt-1.5 max-w-2xl`}>
                  Correlate request ingress spikes with core junction temperatures and task preemptions across a synchronized dual-axis canvas.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={trigger10xSpike}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition flex items-center gap-1.5 active:scale-95"
                  title="Inject sudden 10x traffic spike"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>10x Spike (+145k)</span>
                </button>
                <button
                  type="button"
                  onClick={simulateMicroBurst}
                  className={`px-3.5 py-2.5 rounded-xl ${isDark ? "bg-slate-800/60 hover:bg-slate-700/70 text-amber-300 border border-amber-500/30" : "bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200"} font-semibold text-xs transition flex items-center gap-1.5`}
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Micro-Burst</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("cores")}
                  className={`px-4 py-2.5 rounded-xl ${isDark ? "bg-slate-800/60 hover:bg-slate-700/70 text-slate-200 border border-slate-700/50" : "bg-white/80 hover:bg-stone-100 text-stone-700 border border-stone-200/80"} font-semibold text-xs transition`}
                >
                  Back to Cores
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("audit")}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition flex items-center gap-2"
                >
                  <span>Proceed to Kernel Audit</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Thermal Waveform Area Chart - Open Section */}
            <div className="space-y-4">
              <div className={`flex flex-wrap items-center justify-between gap-3 pb-3 border-b ${isDark ? "border-slate-800" : "border-stone-200/80"}`}>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <h3 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                    Thermal Waveform & Inflow Correlation (Recharts Dual-Axis)
                  </h3>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-cyan-500">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" /> Request Inflow ({ingressLoad.toFixed(1)}k req/s)
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-500">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> Thermal Tj
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-500">
                    <span className="w-2 h-0.5 bg-rose-400" /> TjMax (85°C)
                  </span>
                </div>
              </div>

              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={waveform} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38BDF8" stopOpacity={isDark ? 0.45 : 0.3} />
                        <stop offset="95%" stopColor="#38BDF8" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="thermalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34D399" stopOpacity={isDark ? 0.45 : 0.3} />
                        <stop offset="95%" stopColor="#34D399" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>

                    <XAxis
                      dataKey="time"
                      stroke={isDark ? "#64748B" : "#94A3B8"}
                      fontSize={10}
                      fontFamily="monospace"
                      tickLine={false}
                      minTickGap={25}
                    />
                    <YAxis
                      yAxisId="left"
                      domain={[20, 100]}
                      stroke={isDark ? "#64748B" : "#94A3B8"}
                      fontSize={10}
                      fontFamily="monospace"
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 160]}
                      stroke={isDark ? "#64748B" : "#94A3B8"}
                      fontSize={10}
                      fontFamily="monospace"
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? "#1E2433" : "#FFFFFF",
                        borderColor: isDark ? "#334155" : "#E2E8F0",
                        borderRadius: "0.75rem",
                        color: isDark ? "#F8FAFC" : "#0F172A",
                        fontSize: "11px",
                        fontFamily: "monospace",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                      }}
                    />

                    <ReferenceLine
                      yAxisId="left"
                      y={85}
                      stroke="#F87171"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: "TjMax (85°C)",
                        position: "insideTopRight",
                        fill: "#F87171",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />

                    <Area
                      isAnimationActive={false}
                      yAxisId="right"
                      type="monotone"
                      dataKey="requestInflow"
                      stroke="#38BDF8"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#inflowGrad)"
                      name="Inflow (k req/s)"
                    />

                    <Area
                      isAnimationActive={false}
                      yAxisId="left"
                      type="monotone"
                      dataKey="thermalTj"
                      stroke="#34D399"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#thermalGrad)"
                      name="Thermal Tj (°C)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Task Dispatch Gantt Timeline - Open Section */}
            <div className={`pt-6 border-t ${isDark ? "border-slate-800" : "border-stone-200/80"} space-y-4`}>
              <div className={`flex items-center justify-between pb-3 border-b ${isDark ? "border-slate-800" : "border-stone-200/80"}`}>
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <h3 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                    Task Dispatch Timeline (Preemption & Migrations)
                  </h3>
                </div>
                <span className={`font-mono text-[10px] ${subTextClass}`}>
                  Window: [0ms - 100ms]
                </span>
              </div>

              {/* Gantt Rows */}
              <div className="space-y-3 font-mono">
                {["P00", "P03", "E00", "E04"].map((cid) => {
                  const segments = ganttRows.filter((g) => g.coreId === cid);

                  return (
                    <div key={cid} className="flex items-center gap-3">
                      <div className={`w-12 text-xs font-bold text-center flex-shrink-0 px-2 py-1 rounded border ${
                        isDark ? "bg-[#161B26] border-slate-700 text-slate-300" : "bg-stone-100 border-stone-200 text-stone-700"
                      }`}>
                        {cid}
                      </div>

                      <div className={`relative flex-1 h-7 rounded-xl border overflow-hidden ${
                        isDark ? "bg-[#141824] border-slate-700/60" : "bg-stone-50 border-stone-200"
                      }`}>
                        {segments.map((s) => {
                          let pillBg = isDark ? "bg-emerald-950/80 border-emerald-700 text-emerald-300" : "bg-emerald-100 border-emerald-300 text-emerald-800";
                          if (s.type === "migrate") {
                            pillBg = isDark ? "bg-amber-950/80 border-amber-600 text-amber-200 animate-pulse" : "bg-amber-100 border-amber-300 text-amber-800 animate-pulse";
                          } else if (s.type === "parked") {
                            pillBg = isDark ? "bg-slate-900 border-slate-700 text-slate-500" : "bg-stone-200 border-stone-300 text-stone-500";
                          } else if (s.type === "io") {
                            pillBg = isDark ? "bg-blue-950/80 border-blue-700 text-blue-300" : "bg-blue-100 border-blue-300 text-blue-800";
                          }

                          return (
                            <div
                              key={s.id}
                              className={`absolute top-0.5 bottom-0.5 rounded-lg border text-[10px] font-bold flex items-center justify-center px-2 truncate shadow-xs transition-all ${pillBg}`}
                              style={{
                                left: `${s.startPct}%`,
                                width: `${s.widthPct}%`,
                              }}
                              title={`${s.name} (${s.widthPct}ms)`}
                            >
                              <span className="truncate">{s.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Bottom Time Ruler */}
                <div className="flex items-center gap-3 pt-1">
                  <div className="w-12 flex-shrink-0" />
                  <div className={`relative flex-1 flex justify-between text-[10px] ${subTextClass} font-mono px-0.5 border-t ${
                    isDark ? "border-slate-700/60" : "border-stone-200"
                  } pt-1`}>
                    <span>0ms</span>
                    <span>25ms</span>
                    <span>50ms</span>
                    <span>75ms</span>
                    <span>100ms</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 5: STEP 4 - KERNEL AUDIT & DIE SENSORS                          */}
        {/* =================================================================== */}
        {activeTab === "audit" && (
          <div className="space-y-12 animate-in fade-in duration-300 py-4 sm:py-6">
            {/* Step Header - Open & Borderless */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-700/40">
              <div>
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase mb-3 ${
                  isDark ? "bg-amber-950/40 border border-amber-500/30 text-amber-300" : "bg-amber-50/80 border border-amber-200/80 text-amber-700"
                }`}>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  STEP 04 OF 04
                </div>
                <h2 className={`text-2xl sm:text-3xl font-extrabold ${titleTextClass}`}>Kernel Audit & VRM Sensors</h2>
                <p className={`text-sm ${subTextClass} mt-1.5 max-w-2xl`}>
                  Low-level deterministic audit logs streamed directly from /dev/kmsg along with package TDP and VRM telemetry readings.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("analytics")}
                  className={`px-4 py-2.5 rounded-xl ${isDark ? "bg-slate-800/60 hover:bg-slate-700/70 text-slate-200 border border-slate-700/50" : "bg-white/80 hover:bg-stone-100 text-stone-700 border border-stone-200/80"} font-semibold text-xs transition`}
                >
                  Back to Waveforms
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("overview")}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition"
                >
                  Back to Overview
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
              {/* Die Sensors & TDP - Open Column */}
              <div className="lg:col-span-5 space-y-5">
                <div className={`flex items-center justify-between pb-3 border-b ${isDark ? "border-slate-800" : "border-stone-200/80"}`}>
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <h3 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                      Die Sensors & TDP
                    </h3>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                    isDark ? "text-emerald-300 bg-emerald-950/60 border-emerald-800" : "text-emerald-700 bg-emerald-50 border-emerald-200"
                  }`}>
                    REALTIME VRM
                  </span>
                </div>

                {/* SVG Half-Donut Gauge */}
                {(() => {
                  const radius = 70;
                  const fullCirc = 2 * Math.PI * radius;
                  const halfCirc = Math.PI * radius;
                  const currentTdp = Math.min(165, Math.max(0, packageTDP));
                  const activeLen = (currentTdp / 165) * halfCirc;

                  return (
                    <div className="flex flex-col items-center justify-center py-2">
                      <svg viewBox="0 0 200 115" className="w-full max-w-[200px] mx-auto block">
                        <circle
                          cx="100"
                          cy="100"
                          r={radius}
                          fill="none"
                          stroke={isDark ? "#283347" : "#E2E8F0"}
                          strokeWidth="14"
                          strokeDasharray={`${halfCirc} ${fullCirc}`}
                          strokeDashoffset={0}
                          transform="rotate(-180 100 100)"
                          strokeLinecap="round"
                        />
                        <circle
                          cx="100"
                          cy="100"
                          r={radius}
                          fill="none"
                          stroke="#34D399"
                          strokeWidth="14"
                          strokeDasharray={`${activeLen} ${fullCirc}`}
                          strokeDashoffset={0}
                          transform="rotate(-180 100 100)"
                          strokeLinecap="round"
                          className="transition-all duration-700 ease-out"
                        />
                        <text
                          x="100"
                          y="80"
                          textAnchor="middle"
                          fill={isDark ? "#F8FAFC" : "#0F172A"}
                          fontSize="28"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          {packageTDP.toFixed(1)}W
                        </text>
                        <text
                          x="100"
                          y="98"
                          textAnchor="middle"
                          fill={isDark ? "#94A3B8" : "#64748B"}
                          fontSize={11}
                          fontFamily="monospace"
                        >
                          / 165W Ceiling
                        </text>
                      </svg>
                    </div>
                  );
                })()}

                {/* Sensor Readings Table */}
                <div className={`space-y-2 pt-2 border-t ${isDark ? "border-slate-800" : "border-stone-200/80"} font-mono text-xs`}>
                  <div className={`flex items-center justify-between p-3 rounded-xl border ${isDark ? "border-slate-800 bg-slate-900/30" : "border-stone-200/80 bg-white/70"}`}>
                    <span className={subTextClass}>Die Center Junction:</span>
                    <span className={`font-bold ${titleTextClass}`}>71.4°C @ 1.28V</span>
                  </div>
                  <div className={`flex items-center justify-between p-3 rounded-xl border ${isDark ? "border-slate-800 bg-slate-900/30" : "border-stone-200/80 bg-white/70"}`}>
                    <span className={subTextClass}>VRM Phase Array:</span>
                    <span className="font-bold text-cyan-400">58.9°C @ 12.04V</span>
                  </div>
                  <div className={`flex items-center justify-between p-3 rounded-xl border ${isDark ? "border-slate-800 bg-slate-900/30" : "border-stone-200/80 bg-white/70"}`}>
                    <span className={subTextClass}>Vapor Chamber Mesh:</span>
                    <span className="font-bold text-amber-400">49.2°C (Phase 2)</span>
                  </div>
                </div>
              </div>

              {/* Live Terminal Log Stream - Open Frame */}
              <div className="lg:col-span-7 space-y-4">
                <div className={`flex items-center justify-between pb-3 border-b ${isDark ? "border-slate-800" : "border-stone-200/80"}`}>
                  <div className="flex items-center gap-2">
                    <TerminalIcon className="w-4 h-4 text-emerald-400" />
                    <h3 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                      Kernel Telemetry Audit Stream
                    </h3>
                  </div>
                  <span className={`text-[10px] font-mono ${isDark ? "text-neutral-500" : "text-slate-500"}`}>
                    /dev/kmsg
                  </span>
                </div>

                <div
                  ref={terminalContainerRef}
                  className={`h-[340px] ${isDark ? "bg-[#090D16] border-slate-800" : "bg-slate-950 border-slate-800"} border rounded-xl p-4 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-2 select-text shadow-inner`}
                >
                  {logs.map((l) => {
                    let tagColor = "text-slate-400";
                    if (l.tag === "PREDICT_BURST") tagColor = "text-[#34D399]";
                    else if (l.tag === "CORE_PARK") tagColor = "text-[#FBBF24]";
                    else if (l.tag === "MIGRATE_TASK") tagColor = "text-[#22D3EE]";
                    else if (l.tag === "THERMAL_WARN") tagColor = "text-[#F87171]";

                    return (
                      <div key={l.id} className="text-slate-300 break-words">
                        <span className="text-slate-600 mr-1.5">{l.timestamp}</span>
                        <span className={`font-bold mr-1.5 ${tagColor}`}>[{l.tag}]</span>
                        <span>{l.message}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ===================================================================== */}
      {/* 3. ENTERPRISE FOOTER                                                  */}
      {/* ===================================================================== */}
      <footer className={`${headerBgClass} border-t py-4 transition-colors duration-200`}>
        <div className={`max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap justify-between items-center text-xs font-mono ${subTextClass} gap-4`}>
          <div className="flex items-center gap-3">
            <span>Kernel: <span className={`${titleTextClass} font-bold`}>6.12.8-rt7-tams</span></span>
            <span>•</span>
            <span>Policy: <span className="text-indigo-400 font-bold">MLFQ-Thermal-Guard</span></span>
            <span>•</span>
            <span>Tick Jitter: <span className="text-emerald-400 font-bold">±0.02 μs</span></span>
          </div>

          <div className="flex items-center gap-3">
            <span>Context Switch: <span className={`${titleTextClass} font-bold`}>0.84 μs</span></span>
            <span>•</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Preempt-RT Active
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
