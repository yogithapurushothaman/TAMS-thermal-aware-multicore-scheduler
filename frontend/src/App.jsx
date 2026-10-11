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
  ArrowRight,
  Sun,
  Moon,
  FileText,
} from "lucide-react";
import GhostFibers from "./components/GhostFibers";

// ============================================================================
// Types & Environment Configurations
// ============================================================================

const ENV_PROFILES = {
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

const INITIAL_CORES = [
  // 8 Performance Cores (P-Cores)
  { id: "P00", type: "P", status: "ONLINE", temp: 72.4, freq: 4.85, util: 88, taskId: "tls_handshake" },
  { id: "P01", type: "P", status: "ONLINE", temp: 68.2, freq: 4.70, util: 82, taskId: "grpc_dispatch" },
  { id: "P02", type: "P", status: "MIGRATING", temp: 84.6, freq: 4.10, util: 96, taskId: "MIGRATING -> E02" },
  { id: "P03", type: "P", status: "HOTSPOT", temp: 87.1, freq: 3.60, util: 99, taskId: "4k_h265_encode" },
  { id: "P04", type: "P", status: "PARKED", temp: 34.2, freq: 0.0, util: 0, taskId: "C6 DEEP SLEEP" },
  { id: "P05", type: "P", status: "PARKED", temp: 33.8, freq: 0.0, util: 0, taskId: "C6 DEEP SLEEP" },
  { id: "P06", type: "P", status: "PARKED", temp: 35.1, freq: 0.0, util: 0, taskId: "C6 DEEP SLEEP" },
  { id: "P07", type: "P", status: "PARKED", temp: 34.7, freq: 0.0, util: 0, taskId: "C6 DEEP SLEEP" },
  // 8 Efficiency Cores (E-Cores)
  { id: "E00", type: "E", status: "ONLINE", temp: 48.3, freq: 3.20, util: 64, taskId: "async_db_pool" },
  { id: "E01", type: "E", status: "ONLINE", temp: 51.0, freq: 3.20, util: 71, taskId: "k8s_telemetry" },
  { id: "E02", type: "E", status: "ONLINE", temp: 54.7, freq: 3.40, util: 78, taskId: "migrated_calc" },
  { id: "E03", type: "E", status: "ONLINE", temp: 46.2, freq: 3.00, util: 52, taskId: "log_flusher" },
  { id: "E04", type: "E", status: "ONLINE", temp: 47.9, freq: 3.10, util: 58, taskId: "epoll_worker" },
  { id: "E05", type: "E", status: "ONLINE", temp: 49.5, freq: 3.15, util: 60, taskId: "redis_io" },
  { id: "E06", type: "E", status: "PARKED", temp: 32.1, freq: 0.0, util: 0, taskId: "C6 DEEP SLEEP" },
  { id: "E07", type: "E", status: "PARKED", temp: 31.9, freq: 0.0, util: 0, taskId: "C6 DEEP SLEEP" },
];

const INITIAL_LOGS = [
  { id: "l-1", timestamp: "15:28:01.104", tag: "SYS_TICK", message: "Scheduler loop running at 1000Hz (deterministic tick: 1ms)." },
  { id: "l-2", timestamp: "15:28:01.320", tag: "PREDICT_BURST", message: "MLFQ classified incoming batch as compute-bound. Vector affinity mapped." },
  { id: "l-3", timestamp: "15:28:01.590", tag: "CORE_PARK", message: "Queue length < 8. Cores [P04, P05, P06, P07] held in C6 ultra-low sleep." },
  { id: "l-4", timestamp: "15:28:01.810", tag: "THERMAL_WARN", message: "Core P03 reported hotspot at 87.1°C (TjMax 85°C breached)." },
  { id: "l-5", timestamp: "15:28:02.040", tag: "MIGRATE_TASK", message: "Task 4k_h265_encode downshifted: preemption triggered, migrating to E02." },
];

export default function App() {
  // Theme State: 'dark' by default (pure jet black), switchable to 'light'
  const [theme, setTheme] = useState("dark");
  const isDark = theme === "dark";

  // Navigation View State
  const [activeTab, setActiveTab] = useState("overview");

  // Core Simulation States
  const [isRunning, setIsRunning] = useState(true);
  const [tick, setTick] = useState(0);
  const [cores, setCores] = useState(INITIAL_CORES);
  const [algorithm, setAlgorithm] = useState("predictive"); // 'predictive' (Smart T.A.M.S.) vs 'greedy' (Standard OS)
  const [environment, setEnvironment] = useState("desk"); // 'server', 'desk', 'blanket'
  const [ingressLoad, setIngressLoad] = useState(78.4);
  const [packageTDP, setPackageTDP] = useState(118.4);
  const [logs, setLogs] = useState(INITIAL_LOGS);

  // Active Visual Migrations State: [{ id, fromId, toId, fromTemp, toTemp, timestamp }]
  const [activeMigrations, setActiveMigrations] = useState([]);
  const coreElementRefs = useRef({});

  // References to bridge config into interval without stale closures
  const algorithmRef = useRef(algorithm);
  algorithmRef.current = algorithm;

  const envRef = useRef(environment);
  envRef.current = environment;

  const ingressRef = useRef(ingressLoad);
  ingressRef.current = ingressLoad;

  const coresRef = useRef(cores);
  coresRef.current = cores;

  const logContainerRef = useRef(null);

  // Chart Data (Rolling 30 historical points)
  const [chartData, setChartData] = useState(() => {
    const arr = [];
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 800);
      const timeStr = d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      arr.push({
        time: timeStr,
        timestamp: d.getTime(),
        requestInflow: Math.round(65 + Math.sin(i * 0.4) * 15),
        thermalTj: parseFloat((68 + Math.cos(i * 0.35) * 8).toFixed(1)),
      });
    }
    return arr;
  });

  // Ambient Cursor Glow (Aura Effect)
  const [mousePos, setMousePos] = useState({ x: -500, y: -500 });
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Clean up expired migrations after 2400ms
  useEffect(() => {
    if (activeMigrations.length === 0) return;
    const cleanup = setTimeout(() => {
      const now = Date.now();
      setActiveMigrations((prev) => prev.filter((m) => now - m.timestamp < 2400));
    }, 800);
    return () => clearTimeout(cleanup);
  }, [activeMigrations]);

  // Keep terminal logs pinned to bottom without page auto-scrolling
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // ==========================================================================
  // RELIABLE useEffect TICKER HOOK (800ms)
  // Strictly respects `isRunning`. Uses functional updaters to prevent stale closures.
  // ==========================================================================
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      const activeAlgo = algorithmRef.current;
      const activeEnv = ENV_PROFILES[envRef.current] || ENV_PROFILES.desk;

      // Step 2.1: The Clock Advances
      let nextTick = 0;
      setTick((prev) => {
        nextTick = prev + 1;
        return prev + 1;
      });

      // Step 2.2: Dynamic Ingress Harmonic Wave Walk
      const waveBase = 72 + Math.sin(nextTick * 0.18) * 18 + Math.cos(nextTick * 0.08) * 10;
      const jitter = Math.random() * 6.0 - 3.0;
      const rawIngress = ingressRef.current * 0.85 + (waveBase + jitter) * 0.15;
      const newIngress = parseFloat(Math.max(25, Math.min(160, rawIngress)).toFixed(1));
      ingressRef.current = newIngress;
      setIngressLoad(newIngress);

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

      // Step 2.3: Pure Synchronous Computation of 16-Core Matrix
      let activeCount = 0;
      let sumTemp = 0;

      // First pass: update temperatures and check for >78°C threshold migrations
      let updatedCores = coresRef.current.map((c) => {
        let isParked = c.status === "PARKED";

        if (activeAlgo === "predictive") {
          // Smart T.A.M.S.: Dynamic Parking logic
          if (newIngress < 85 && (c.id === "P04" || c.id === "P05" || c.id === "P06" || c.id === "P07" || c.id === "E06" || c.id === "E07")) {
            isParked = true;
          } else if (newIngress > 105) {
            isParked = false; // Awaken on high ingress
          }
        } else if (activeAlgo === "greedy") {
          // Standard OS: Greedy compute disables core parking
          isParked = false;
        }

        if (isParked) {
          const coolStep = activeEnv.coolRate * 0.45;
          const temp = Math.max(activeEnv.ambient, c.temp - coolStep);
          return {
            ...c,
            status: "PARKED",
            temp: parseFloat(temp.toFixed(1)),
            freq: 0.0,
            util: 0,
            taskId: "C6 DEEP SLEEP",
          };
        }

        // Active core
        activeCount++;
        let util = Math.max(25, Math.min(100, Math.round(45 + (newIngress / 2.2) + (Math.random() * 8 - 4))));
        let status = "ONLINE";

        // Target temperature based on load and environment
        const baseOffset = c.type === "P" ? 22 : 12;
        const loadHeat = (util / 100) * (c.type === "P" ? 28 : 14) * (newIngress / 80);
        let targetTemp = activeEnv.ambient + baseOffset + loadHeat;

        // Thermal Threshold Trigger at >80°C (Overheat Trigger)
        if (activeAlgo === "predictive") {
          if (c.temp >= 80) {
            status = "MIGRATING";
            util = Math.round(util * 0.4); // Preemptively shed compute load to prevent hardware thermal clamp
            targetTemp = activeEnv.ambient + baseOffset + 2; // Rapid cooling
          }
        } else {
          if (c.temp >= 80) {
            status = "HOTSPOT";
            targetTemp = Math.min(102, targetTemp + 7);
          }
        }

        // Newton thermal convergence
        const alpha = 0.22;
        const tempJitter = Math.random() * 0.6 - 0.3;
        const nextTemp = c.temp + (targetTemp - c.temp) * alpha + tempJitter;
        const temp = Math.max(activeEnv.ambient + 5, Math.min(activeAlgo === "greedy" ? 99 : 92, nextTemp));

        let freq = c.type === "P" ? 4.7 : 3.2;
        if (status === "HOTSPOT") {
          freq = Math.max(3.0, freq - 0.6);
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
          taskId: status === "MIGRATING" ? "MIGRATING ➔ E-Core" : c.taskId || "active_task",
        };
      });

      // Check for Cores breaching >= 80°C to establish explicit cause-and-effect Migration Paths
      const hotCores = updatedCores.filter((c) => c.temp >= 80 && c.status === "MIGRATING");
      const coolCores = updatedCores.filter((c) => c.temp < 70 && c.status !== "HOTSPOT" && c.status !== "MIGRATING");

      if (hotCores.length > 0 && coolCores.length > 0) {
        const sourceCore = hotCores[Math.floor(Math.random() * hotCores.length)];
        const destCore = coolCores.reduce((min, c) => (c.temp < min.temp ? c : min), coolCores[0]);

        const migrationEvent = {
          id: `mig-${Date.now()}-${Math.random()}`,
          fromId: sourceCore.id,
          toId: destCore.id,
          fromTemp: sourceCore.temp,
          toTemp: destCore.temp,
          timestamp: Date.now(),
        };

        setActiveMigrations((prev) => [migrationEvent, ...prev.slice(0, 3)]);

        // Broadcast explicit cause-and-effect migration log
        const ms = String(now.getMilliseconds()).padStart(3, "0");
        const logTimestamp = `${timeStr}.${ms}`;
        const migrationLog = {
          id: `log-mig-${Date.now()}`,
          timestamp: logTimestamp,
          tag: "MIGRATE",
          message: `Core #${sourceCore.id} is overheating (${sourceCore.temp}°C). Workload successfully transferred to cooler Core #${destCore.id} (${destCore.temp}°C).`,
        };

        setLogs((prev) => [...prev.slice(-35), migrationLog]);
      }

      coresRef.current = updatedCores;
      setCores(updatedCores);

      // Step 2.4: Compute Package TDP and Push to chartData (30 rolling points)
      const avgTemp = activeCount > 0 ? sumTemp / activeCount : activeEnv.ambient;
      const newTDP = parseFloat((35 + activeCount * 7.2 + (Math.random() * 2 - 1)).toFixed(1));
      setPackageTDP(newTDP);

      setChartData((prev) => [
        ...prev.slice(1),
        {
          time: timeStr,
          timestamp: Date.now(),
          requestInflow: newIngress,
          thermalTj: parseFloat(avgTemp.toFixed(1)),
        },
      ]);

      // 4. Background kernel logs when no migration occurs
      if (Math.random() > 0.55 && hotCores.length === 0) {
        const eventTypes = ["PREDICT_BURST", "CORE_PARK", "SYS_TICK", "THERMAL_WARN"];
        const pickedTag = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        const ms = String(now.getMilliseconds()).padStart(3, "0");
        const logTimestamp = `${timeStr}.${ms}`;

        let message = "";
        switch (pickedTag) {
          case "PREDICT_BURST":
            message = `Heuristic vector observed ${newIngress}k req/s ingress under [${activeAlgo.toUpperCase()}] algorithm.`;
            break;
          case "CORE_PARK":
            message = `Thermal dissipation in [${activeEnv.name}]: Idle cooling rate -${activeEnv.coolRate}°C/tick active.`;
            break;
          case "THERMAL_WARN":
            message = `Silicon junction calibration check: Ambient floor locked at ${activeEnv.ambient}°C.`;
            break;
          case "SYS_TICK":
            message = `Real-Time clock tick validated: Preempt-RT deterministic jitter ±0.02μs.`;
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
  }, [isRunning]);

  // ==========================================================================
  // Interactive Action Bindings
  // ==========================================================================
  const triggerSpike = () => {
    setIngressLoad(145.0);
    ingressRef.current = 145.0;
    const spiked = coresRef.current.map((c) =>
      c.type === "P"
        ? { ...c, status: "ONLINE", util: 98, temp: Math.min(92, c.temp + 12), freq: 4.95 }
        : { ...c, status: "ONLINE", util: 90, temp: Math.min(68, c.temp + 6) }
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
        message: "🚨 MANUAL OVERRIDE: 10x Ingress Spike Injected (+145.0k req/s)! All P-Cores woken from C6 sleep.",
      },
    ]);
  };

  const simulateMicroBurst = () => {
    setIngressLoad(96.4);
    ingressRef.current = 96.4;
    const burst = coresRef.current.map((c, i) =>
      i < 4
        ? { ...c, status: "ONLINE", util: 85, temp: c.temp + 5 }
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
        message: "⚡ Micro-burst detected (12ms window). Handled via fast P00-P03 DVFS boost.",
      },
    ]);
  };

  const triggerSustainedStress = () => {
    setIngressLoad(120.0);
    ingressRef.current = 120.0;
    const stressed = coresRef.current.map((c) => ({
      ...c,
      status: c.type === "P" && c.temp > 82 ? "HOTSPOT" : "ONLINE",
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
        message: "🔥 SUSTAINED STRESS ENGAGED: Multi-threaded compute workload saturating silicon die.",
      },
    ]);
  };

  const toggleAlgorithm = (algo) => {
    setAlgorithm(algo);
    algorithmRef.current = algo;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const label = algo === "predictive" ? "Smart T.A.M.S." : "Standard OS";
    setLogs((prev) => [
      ...prev,
      {
        id: `log-${Date.now()}`,
        timestamp: `${timeStr}.050`,
        tag: "SYS_TICK",
        message: `⚙️ Migration algorithm shifted to [${label}]. Core allocation logic updated immediately.`,
      },
    ]);
  };

  const selectEnvironment = (envKey) => {
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
        message: `🌍 Environment profile changed to [${prof.name}]. Ambient floor set to ${prof.ambient}°C.`,
      },
    ]);
  };

  // Top Metrics
  const onlineCoresCount = cores.filter((c) => c.status !== "PARKED").length;
  const packageLoadAvg = Math.round(cores.reduce((acc, c) => acc + c.util, 0) / cores.length);
  const peakDieTemp = Math.max(...cores.map((c) => c.temp));

  // Theme Classes & Glassmorphism Polish (Pure Jet Black #000000 with Neon Blue Fibers)
  const bgClass = isDark ? "bg-[#000000] text-slate-100" : "bg-[#f8fafc] text-slate-800";
  const headerBgClass = isDark ? "bg-[#000000]/80 backdrop-blur-md border-cyan-500/20" : "bg-white/80 backdrop-blur-md border-stone-200/80";
  const cardBgClass = isDark ? "bg-[#080B12]/80 backdrop-blur-md border border-cyan-500/25 shadow-[0_8px_32px_rgba(0,0,0,0.6)]" : "bg-white/85 backdrop-blur-md border border-stone-200/80 shadow-sm";
  const subTextClass = isDark ? "text-slate-400" : "text-stone-500";
  const titleTextClass = isDark ? "text-slate-100" : "text-stone-900";

  return (
    <div className={`min-h-screen ${bgClass} font-sans transition-colors duration-200 flex flex-col relative overflow-x-hidden`}>
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
      {/* 1. SEAMLESS MERGED HEADER                                             */}
      {/* ===================================================================== */}
      <header className={`sticky top-0 z-50 backdrop-blur-md ${headerBgClass} border-b transition-colors`}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          {/* Logo & System Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-md shadow-indigo-300/20">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`font-black text-base sm:text-lg tracking-tight ${titleTextClass}`}>
                  T.A.M.S.
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                  algorithm === "predictive"
                    ? isDark ? "bg-indigo-950/80 text-indigo-300 border-indigo-800" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                    : isDark ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-stone-100 text-stone-700 border-stone-300"
                }`}>
                  {algorithm === "predictive" ? "SMART T.A.M.S." : "STANDARD OS"}
                </span>
              </div>
              <p className={`text-[11px] ${subTextClass} hidden sm:block`}>
                Thermal-Aware Multicore Scheduler • 16-Core Heterogeneous
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className={`flex items-center gap-1.5 p-1 rounded-full border text-xs font-medium ${
            isDark ? "bg-[#111111] border-neutral-800" : "bg-stone-100 border-stone-200/80"
          }`}>
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`px-3.5 py-1.5 rounded-full transition-all ${
                activeTab === "overview"
                  ? isDark ? "bg-[#222222] text-indigo-300 font-bold border border-neutral-700" : "bg-white text-indigo-700 font-bold shadow-xs"
                  : isDark ? "text-neutral-400 hover:text-white" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("simulation")}
              className={`px-3.5 py-1.5 rounded-full transition-all ${
                activeTab === "simulation"
                  ? isDark ? "bg-[#222222] text-indigo-300 font-bold border border-neutral-700" : "bg-white text-indigo-700 font-bold shadow-xs"
                  : isDark ? "text-neutral-400 hover:text-white" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Simulation Controls
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("cores")}
              className={`px-3.5 py-1.5 rounded-full transition-all ${
                activeTab === "cores"
                  ? isDark ? "bg-[#222222] text-indigo-300 font-bold border border-neutral-700" : "bg-white text-indigo-700 font-bold shadow-xs"
                  : isDark ? "text-neutral-400 hover:text-white" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Core Matrix
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("analytics")}
              className={`px-3.5 py-1.5 rounded-full transition-all ${
                activeTab === "analytics"
                  ? isDark ? "bg-[#222222] text-indigo-300 font-bold border border-neutral-700" : "bg-white text-indigo-700 font-bold shadow-xs"
                  : isDark ? "text-neutral-400 hover:text-white" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Waveforms
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("audit")}
              className={`px-3.5 py-1.5 rounded-full transition-all ${
                activeTab === "audit"
                  ? isDark ? "bg-[#222222] text-indigo-300 font-bold border border-neutral-700" : "bg-white text-indigo-700 font-bold shadow-xs"
                  : isDark ? "text-neutral-400 hover:text-white" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              Audit Logs
            </button>
          </nav>

          {/* Action Area: Theme Toggle & Synchronized Pause/Resume Button */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={`p-2 rounded-xl border transition-all flex items-center justify-center shadow-xs ${
                isDark
                  ? "bg-[#111111] border-neutral-800 text-amber-300 hover:bg-neutral-800"
                  : "bg-stone-50 border-stone-200 text-indigo-600 hover:bg-stone-100"
              }`}
              title={isDark ? "Switch to Light Theme" : "Switch to Dark Theme"}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Status indicator pill */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border ${
              isRunning
                ? isDark ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                : isDark ? "bg-amber-950/60 text-amber-300 border-amber-800" : "bg-amber-50 text-amber-700 border-amber-200"
            }`}>
              <span className={`w-2 h-2 rounded-full ${isRunning ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              <span>{isRunning ? `RUNNING • TICK #${tick}` : "PAUSED"}</span>
            </div>

            {/* PAUSE / RESUME ENGINE BUTTON */}
            <button
              type="button"
              onClick={() => setIsRunning((prev) => !prev)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs active:scale-95 ${
                isRunning
                  ? "bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-indigo-300/30"
                  : isDark
                  ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
                  : "bg-stone-800 hover:bg-stone-900 text-white"
              }`}
            >
              {isRunning ? (
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
        {/* TAB 1: OVERVIEW                                                     */}
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
                  REAL-TIME PREEMPTIVE DISPATCH
                </div>

                <h1 className={`text-4xl sm:text-5xl lg:text-6xl font-extrabold ${titleTextClass} tracking-tight leading-[1.1]`}>
                  Thermal-Aware Multicore <br />
                  <span className="bg-gradient-to-r from-indigo-500 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Operating System Scheduler
                  </span>
                </h1>

                <p className={`${subTextClass} text-base sm:text-lg leading-relaxed max-w-xl`}>
                  Self-contained dynamic simulation modeling 16 heterogeneous cores (8 Performance + 8 Efficiency). Pre-emptively migrates compute threads before junction temperatures breach TjMax (85°C).
                </p>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRunning(true);
                      setActiveTab("simulation");
                    }}
                    className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 transition-all flex items-center gap-2 active:scale-95"
                  >
                    <span>Simulation Controls</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={triggerSpike}
                    className={`px-5 py-3.5 rounded-xl ${
                      isDark
                        ? "bg-slate-800/60 hover:bg-slate-700/70 text-slate-200 border border-slate-700/50"
                        : "bg-white/80 hover:bg-stone-100 text-stone-700 border border-stone-200/80 shadow-sm"
                    } font-semibold text-sm transition-all flex items-center gap-2`}
                  >
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    <span>Inject 10x Spike</span>
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
                    <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                      CLOCK: 800MS TICK
                    </span>
                  </div>

                  {/* Visual Topology Nodes */}
                  <div className="grid grid-cols-4 gap-2.5 py-1">
                    {cores.slice(0, 8).map((c) => {
                      const isOverheating = c.temp >= 85 || c.status === "HOTSPOT";
                      return (
                        <div
                          key={c.id}
                          className={`p-2.5 rounded-xl border text-center transition-all ${
                            isOverheating
                              ? "bg-rose-950/70 border-rose-500/80 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse"
                              : c.status === "MIGRATING"
                              ? "bg-amber-950/70 border-amber-500/70 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                              : c.status === "PARKED"
                              ? isDark
                                ? "bg-slate-900/40 border-slate-800/80 text-slate-600"
                                : "bg-stone-100/70 border-stone-200 text-stone-400"
                              : isDark
                              ? "bg-slate-900/80 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                              : "bg-white border-emerald-500/30 text-emerald-600 shadow-sm"
                          }`}
                        >
                          <div className="text-[10px] font-mono font-bold">{c.id}</div>
                          <div className="text-xs font-mono font-black mt-0.5">{c.temp.toFixed(0)}°C</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary Telemetry Metrics */}
                  <div className={`grid grid-cols-3 gap-2 pt-2 border-t ${isDark ? "border-slate-800/80" : "border-stone-200/80"} text-center font-mono text-xs`}>
                    <div>
                      <span className="text-neutral-500 text-[10px] block">Active Cores</span>
                      <span className={`font-bold ${isDark ? "text-white" : "text-stone-900"}`}>{onlineCoresCount}/16</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 text-[10px] block">Peak Junction</span>
                      <span className={`font-bold ${peakDieTemp >= 85 ? "text-rose-400" : "text-amber-400"}`}>
                        {peakDieTemp.toFixed(1)}°C
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 text-[10px] block">Package TDP</span>
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
        {/* TAB 2: SIMULATION CONTROLS                                          */}
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
                <h2 className={`text-2xl sm:text-3xl font-extrabold ${titleTextClass}`}>Simulation Workload & Engine Controls</h2>
                <p className={`text-sm ${subTextClass} mt-1.5 max-w-2xl`}>
                  Toggle between Smart T.A.M.S. and Standard OS, inject workload spikes, or mutate environment cooling profiles.
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
              {/* Traffic Injectors - Open Layout */}
              <div className="lg:col-span-6 space-y-5">
                <div className={`flex items-center justify-between pb-3 border-b ${isDark ? "border-slate-800" : "border-stone-200/80"}`}>
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    <h3 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                      Synthetic Traffic Injectors
                    </h3>
                  </div>
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                    isDark ? "text-indigo-300 bg-indigo-950/60 border border-indigo-800" : "text-indigo-700 bg-indigo-50"
                  }`}>
                    {ingressLoad.toFixed(1)}k req/s
                  </span>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={triggerSpike}
                    className={`w-full p-4 rounded-xl border transition flex items-center justify-between text-left group ${
                      isDark ? "border-indigo-800/40 bg-indigo-950/20 hover:bg-indigo-950/40 hover:border-indigo-500/50" : "border-indigo-200/70 bg-indigo-50/40 hover:bg-indigo-100/60"
                    }`}
                  >
                    <div>
                      <span className={`text-sm font-bold ${isDark ? "text-indigo-300" : "text-indigo-900"} flex items-center gap-1.5`}>
                        <TrendingUp className="w-4 h-4 text-indigo-400" />
                        Trigger 10x Spike
                      </span>
                      <span className={`text-xs ${subTextClass}`}>
                        Jumps inflow to 145k req/s. Awakens all C6 parked cores instantaneously.
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-lg bg-indigo-500 text-white shadow-xs">
                      Inject
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={simulateMicroBurst}
                    className={`w-full p-4 rounded-xl border transition flex items-center justify-between text-left group ${
                      isDark ? "border-amber-800/40 bg-amber-950/20 hover:bg-amber-950/40 hover:border-amber-500/50" : "border-amber-200/70 bg-amber-50/40 hover:bg-amber-100/60"
                    }`}
                  >
                    <div>
                      <span className={`text-sm font-bold ${isDark ? "text-amber-300" : "text-amber-900"} flex items-center gap-1.5`}>
                        <Zap className="w-4 h-4 text-amber-400" />
                        Simulate Micro-Burst
                      </span>
                      <span className={`text-xs ${subTextClass}`}>
                        12ms high-frequency burst absorbed via DVFS turbo boosting.
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-lg bg-amber-500 text-white shadow-xs">
                      Inject
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={triggerSustainedStress}
                    className={`w-full p-4 rounded-xl border transition flex items-center justify-between text-left group ${
                      isDark ? "border-rose-800/40 bg-rose-950/20 hover:bg-rose-950/40 hover:border-rose-500/50" : "border-rose-200/70 bg-rose-50/40 hover:bg-rose-100/60"
                    }`}
                  >
                    <div>
                      <span className={`text-sm font-bold ${isDark ? "text-rose-300" : "text-rose-900"} flex items-center gap-1.5`}>
                        <Flame className="w-4 h-4 text-rose-400" />
                        Sustained 4K Encoding Stress
                      </span>
                      <span className={`text-xs ${subTextClass}`}>
                        Heavy continuous workload forcing die junction temperatures to breach 85°C.
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-lg bg-rose-500 text-white shadow-xs">
                      Inject
                    </span>
                  </button>
                </div>
              </div>

              {/* Algorithm Toggle: Smart T.A.M.S. vs Standard OS - Open Layout */}
              <div className="lg:col-span-6 space-y-5">
                <div className={`flex items-center justify-between pb-3 border-b ${isDark ? "border-slate-800" : "border-stone-200/80"}`}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <h3 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                      Scheduler Algorithm Toggle
                    </h3>
                  </div>
                  <span className={`text-xs font-mono ${subTextClass}`}>
                    Current: {algorithm.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-3">
                  <div
                    onClick={() => toggleAlgorithm("predictive")}
                    className={`p-4 rounded-xl border transition cursor-pointer ${
                      algorithm === "predictive"
                        ? isDark ? "border-emerald-500/50 bg-emerald-950/30 ring-1 ring-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500 shadow-sm"
                        : isDark ? "border-slate-800/80 bg-slate-900/30 hover:bg-slate-900/60" : "border-stone-200/80 hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${titleTextClass}`}>Smart T.A.M.S. (Predictive Auto-Park)</span>
                      <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)] px-2 py-0.5 rounded">
                        RECOMMENDED
                      </span>
                    </div>
                    <p className={`text-xs ${subTextClass} mt-1`}>
                      Predictively parks idle cores in deep C6 sleep and migrates hot threads to E-Cores before throttling.
                    </p>
                  </div>

                  <div
                    onClick={() => toggleAlgorithm("greedy")}
                    className={`p-4 rounded-xl border transition cursor-pointer ${
                      algorithm === "greedy"
                        ? isDark ? "border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500" : "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 shadow-sm"
                        : isDark ? "border-slate-800/80 bg-slate-900/30 hover:bg-slate-900/60" : "border-stone-200/80 hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${titleTextClass}`}>Standard OS (Greedy Compute)</span>
                      <span className={`text-[10px] font-mono ${subTextClass} ${isDark ? "bg-slate-800" : "bg-stone-100"} px-2 py-0.5 rounded`}>
                        NO PARKING
                      </span>
                    </div>
                    <p className={`text-xs ${subTextClass} mt-1`}>
                      Wakes all 16 cores at maximum frequencies regardless of thermal dissipation until extreme thermal throttle occurs.
                    </p>
                  </div>
                </div>
              </div>

              {/* Operating Environment Profile Selector - Open Layout */}
              <div className={`lg:col-span-12 pt-4 border-t ${isDark ? "border-slate-800" : "border-stone-200/80"} space-y-4`}>
                <div className={`flex items-center justify-between pb-3 border-b ${isDark ? "border-slate-800" : "border-stone-200/80"}`}>
                  <div className="flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-rose-400" />
                    <h3 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                      Operating Environment Cooling Profile
                    </h3>
                  </div>
                  <span className={`text-xs font-mono ${subTextClass}`}>
                    Ambient: {ENV_PROFILES[environment].ambient}°C • Active: {ENV_PROFILES[environment].name}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {["server", "desk", "blanket"].map((envKey) => {
                    const prof = ENV_PROFILES[envKey];
                    const isSelected = environment === envKey;
                    return (
                      <button
                        key={envKey}
                        type="button"
                        onClick={() => selectEnvironment(envKey)}
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
        {/* TAB 3: 16-CORE MATRIX                                               */}
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
                <h2 className={`text-2xl sm:text-3xl font-extrabold ${titleTextClass}`}>16-Core Silicon Matrix Telemetry</h2>
                <p className={`text-sm ${subTextClass} mt-1.5 max-w-2xl`}>
                  Observing 8 P-Cores & 8 E-Cores live temperatures, frequencies, and active task migrations.
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

            {/* Active Real-Time Migration Bridges Banner */}
            {activeMigrations.length > 0 && (
              <div className={`p-4 rounded-2xl border transition-all animate-in fade-in slide-in-from-top-2 ${
                isDark 
                  ? "bg-slate-900/80 backdrop-blur-md border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.2)]"
                  : "bg-cyan-50/90 backdrop-blur-md border-cyan-300 shadow-sm"
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                    </span>
                    <span className="text-xs font-mono font-bold tracking-wider uppercase text-cyan-400">
                      Active Real-Time Migration Bridges ({activeMigrations.length})
                    </span>
                  </div>
                  <span className={`text-[11px] font-mono ${subTextClass}`}>
                    Threshold &gt; 78°C breached ➔ Preemptive MLFQ Shedding
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3">
                  {activeMigrations.map((m) => (
                    <div
                      key={m.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between font-mono text-xs ${
                        isDark ? "bg-[#090D16] border-cyan-500/30" : "bg-white border-cyan-200"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded font-bold text-rose-300 bg-rose-950/80 border border-rose-500/50 animate-pulse">
                          {m.fromId} ({m.fromTemp}°C)
                        </span>
                        <span className="text-cyan-400 font-bold animate-pulse">➔➔</span>
                        <span className="px-2 py-0.5 rounded font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                          {m.toId} ({m.toTemp}°C)
                        </span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-bold">BALANCED</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Core Matrix Grid - Open Layout with Neon Migration States */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3.5">
              {cores.map((c) => {
                const isOverheating = c.temp >= 85 || c.status === "HOTSPOT";
                const isParked = c.status === "PARKED";
                const isMigrating = c.status === "MIGRATING" || c.temp >= 78;
                const isMigrationSource = activeMigrations.some((m) => m.fromId === c.id);
                const isMigrationDest = activeMigrations.some((m) => m.toId === c.id);

                let cardStyle = "";
                if (isMigrationSource) {
                  // Pulsing orange/red neon aura for source
                  cardStyle = "bg-rose-950/80 border-2 border-rose-500 text-rose-200 shadow-[0_0_25px_rgba(244,63,94,0.45)] animate-pulse ring-2 ring-rose-500/40";
                } else if (isMigrationDest) {
                  // Glowing emerald/cyan neon aura for destination
                  cardStyle = "bg-emerald-950/80 border-2 border-emerald-400 text-emerald-200 shadow-[0_0_25px_rgba(16,185,129,0.45)] ring-2 ring-cyan-400/50 animate-bounce";
                } else if (isOverheating) {
                  cardStyle = "bg-rose-950/70 border-rose-500/80 text-rose-300 shadow-[0_0_18px_rgba(244,63,94,0.35)] animate-pulse";
                } else if (isMigrating) {
                  cardStyle = "bg-amber-950/70 border-amber-500/70 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.25)]";
                } else if (isParked) {
                  cardStyle = isDark ? "bg-slate-950/40 border-slate-800/60 text-slate-500" : "bg-stone-100/60 border-stone-200 text-stone-400";
                } else {
                  cardStyle = isDark
                    ? "bg-slate-900/50 border border-emerald-500/30 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.12)] hover:border-emerald-400/50"
                    : "bg-white/80 border border-stone-200 text-stone-800 shadow-sm";
                }

                return (
                  <div
                    key={c.id}
                    className={`p-3.5 rounded-2xl border text-center transition-all hover:scale-[1.03] ${cardStyle}`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono font-bold mb-1">
                      <span className="font-bold">{c.id}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        isMigrationSource
                          ? "bg-rose-500 text-white animate-pulse"
                          : isMigrationDest
                          ? "bg-emerald-500 text-white animate-pulse"
                          : c.type === "P"
                          ? isDark ? "bg-indigo-950/80 text-indigo-300 border border-indigo-500/30" : "bg-indigo-100 text-indigo-700"
                          : isDark ? "bg-cyan-950/80 text-cyan-300 border border-cyan-500/30" : "bg-cyan-100 text-cyan-700"
                      }`}>
                        {isMigrationSource ? "SOURCE" : isMigrationDest ? "TARGET" : c.type}
                      </span>
                    </div>
                    <div className="text-xl font-mono font-black my-1">
                      {c.temp.toFixed(1)}°C
                    </div>
                    <div className="text-[10px] font-mono opacity-80">
                      {c.freq > 0 ? `${c.freq.toFixed(2)} GHz` : "PARKED"}
                    </div>
                    <div className="mt-2 text-[9px] font-mono px-1 py-0.5 rounded bg-black/30 truncate">
                      {isMigrationSource ? "MIGRATING OUT" : isMigrationDest ? "ACCEPTING LOAD" : c.status}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: WAVEFORMS & THERMAL JUNCTION                                 */}
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
                <h2 className={`text-2xl sm:text-3xl font-extrabold ${titleTextClass}`}>Live Thermal Waveforms & Ingress Dynamics</h2>
                <p className={`text-sm ${subTextClass} mt-1.5 max-w-2xl`}>
                  Synchronized Recharts telemetry showing junction temperature Tj vs incoming request volume.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={triggerSpike}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition flex items-center gap-1.5 active:scale-95"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>10x Spike (+145k)</span>
                </button>
                <button
                  type="button"
                  onClick={simulateMicroBurst}
                  className={`px-3.5 py-2.5 rounded-xl ${isDark ? "bg-slate-800/60 text-amber-300 border border-amber-500/30" : "bg-stone-100 text-stone-800 border border-stone-200"} font-semibold text-xs transition flex items-center gap-1.5`}
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Micro-Burst</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("audit")}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition flex items-center gap-2"
                >
                  <span>Proceed to Kernel Logs</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Waveform Chart - Open Layout */}
            <div className="space-y-4">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ingressGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#38BDF8" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="thermalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34D399" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#34D399" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" stroke={isDark ? "#64748B" : "#94A3B8"} fontSize={10} tickLine={false} minTickGap={25} />
                    <YAxis yAxisId="left" stroke={isDark ? "#64748B" : "#94A3B8"} fontSize={10} domain={[20, 100]} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" stroke={isDark ? "#64748B" : "#94A3B8"} fontSize={10} domain={[0, 160]} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? "#111" : "#fff",
                        borderColor: isDark ? "#333" : "#ddd",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                    />
                    <ReferenceLine yAxisId="left" y={85} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: "TjMax (85°C)", fill: "#f43f5e", fontSize: 10 }} />
                    <Area isAnimationActive={false} yAxisId="right" type="monotone" dataKey="requestInflow" stroke="#38BDF8" strokeWidth={2.5} fillOpacity={1} fill="url(#ingressGrad)" name="Ingress (k req/s)" />
                    <Area isAnimationActive={false} yAxisId="left" type="monotone" dataKey="thermalTj" stroke="#34D399" strokeWidth={2.5} fillOpacity={1} fill="url(#thermalGrad)" name="Thermal Tj (°C)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 5: AUDIT LOGS                                                   */}
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
                <h2 className={`text-2xl sm:text-3xl font-extrabold ${titleTextClass}`}>Preempt-RT Kernel Telemetry Stream</h2>
                <p className={`text-sm ${subTextClass} mt-1.5 max-w-2xl`}>
                  Deterministic micro-event logs capturing dynamic thread migrations, C6 sleeps, and thermal adjustments.
                </p>
              </div>
            </div>

            <div className={`${isDark ? "bg-[#090D16] border-slate-800" : "bg-neutral-950 border-neutral-900"} rounded-2xl p-4 font-mono text-xs border`}>
              <div
                ref={logContainerRef}
                className="h-96 overflow-y-auto space-y-2 pr-2"
              >
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 py-1 border-b border-neutral-900">
                    <span className="text-neutral-500 shrink-0">{log.timestamp}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      log.tag === "MIGRATE"
                        ? "bg-cyan-950 text-cyan-300 border border-cyan-500/60 shadow-[0_0_10px_rgba(6,182,212,0.3)] animate-pulse"
                        : log.tag === "PREDICT_BURST"
                        ? "bg-indigo-950 text-indigo-300 border border-indigo-800"
                        : log.tag === "CORE_PARK"
                        ? "bg-cyan-950 text-cyan-300 border border-cyan-800"
                        : log.tag === "MIGRATING" || log.tag === "MIGRATE_TASK"
                        ? "bg-amber-950 text-amber-300 border border-amber-800"
                        : log.tag === "THERMAL_WARN"
                        ? "bg-rose-950 text-rose-300 border border-rose-800"
                        : "bg-neutral-900 text-neutral-400 border border-neutral-800"
                    }`}>
                      {log.tag}
                    </span>
                    <span className="text-neutral-200">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
