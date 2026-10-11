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
  // Theme State
  const [theme, setTheme] = useState("light");
  const isDark = theme === "dark";

  // Navigation View State
  const [activeTab, setActiveTab] = useState("overview");

  // Core Simulation States
  const [isRunning, setIsRunning] = useState(true);
  const [cores, setCores] = useState(INITIAL_CORES);
  const [algorithm, setAlgorithm] = useState("predictive"); // 'predictive' (Smart T.A.M.S.) vs 'greedy' (Standard OS)
  const [environment, setEnvironment] = useState("desk"); // 'server', 'desk', 'blanket'
  const [ingressLoad, setIngressLoad] = useState(78.4);
  const [packageTDP, setPackageTDP] = useState(118.4);
  const [logs, setLogs] = useState(INITIAL_LOGS);

  // References to bridge config into interval without stale closures
  const algorithmRef = useRef(algorithm);
  algorithmRef.current = algorithm;

  const envRef = useRef(environment);
  envRef.current = environment;

  const ingressRef = useRef(ingressLoad);
  ingressRef.current = ingressLoad;

  const logContainerRef = useRef(null);

  // Chart Data (Rolling 24 points)
  const [chartData, setChartData] = useState(() => {
    const arr = [];
    const now = Date.now();
    for (let i = 24; i >= 0; i--) {
      const d = new Date(now - i * 1000);
      const timeStr = d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      arr.push({
        time: timeStr,
        timestamp: d.getTime(),
        requestInflow: Math.round(65 + Math.sin(i * 0.3) * 15),
        thermalTj: parseFloat((70 + Math.cos(i * 0.3) * 8).toFixed(1)),
      });
    }
    return arr;
  });

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

      // 1. Natural Ingress Walk
      const rawIngress = ingressRef.current + (Math.random() * 5.0 - 2.5);
      const newIngress = parseFloat(Math.max(35, Math.min(150, rawIngress)).toFixed(1));
      setIngressLoad(newIngress);
      ingressRef.current = newIngress;

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

      // 2. Functional State Updater for 16-Core Matrix & Thermal Dissipation
      setCores((prevCores) => {
        let activeCount = 0;
        let sumTemp = 0;

        const updated = prevCores.map((c) => {
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
            // Environmental cooling towards ambient base
            const coolDelta = activeEnv.coolRate * 0.4 + (Math.random() * 0.2);
            const temp = Math.max(activeEnv.ambient, c.temp - coolDelta);
            return {
              ...c,
              status: "PARKED",
              temp: parseFloat(temp.toFixed(1)),
              freq: 0.0,
              util: 0,
            };
          }

          // Active core
          activeCount++;
          const heatFactor = c.type === "P" ? (newIngress / 90) * 1.5 : (newIngress / 120) * 0.9;
          const deltaTemp = Math.random() * 1.8 - 0.7 + heatFactor;
          let temp = Math.max(activeEnv.ambient + 10, Math.min(96, c.temp + deltaTemp));
          let util = Math.max(20, Math.min(100, Math.round(50 + (newIngress / 2) + (Math.random() * 10 - 5))));

          let status = "ONLINE";

          // Thermal Throttling / Migration Logic
          if (activeAlgo === "predictive") {
            // Smart T.A.M.S. pre-emptively cools down and migrates
            if (temp >= 85) {
              status = "HOTSPOT";
              temp = Math.max(76, temp - 3.5);
            } else if (temp >= 79 && c.type === "P") {
              status = "MIGRATING";
            }
          } else {
            // Standard OS: Ignores heat until emergency throttle
            if (temp >= 85) {
              status = "HOTSPOT";
            }
          }

          let freq = c.type === "P" ? 4.7 : 3.2;
          if (status === "HOTSPOT") {
            freq = Math.max(3.0, freq - 0.5);
          } else if (status === "ONLINE" && c.type === "P") {
            freq = Math.min(5.1, freq + (Math.random() * 0.1 - 0.05));
          }

          sumTemp += temp;
          return {
            ...c,
            status,
            temp: parseFloat(temp.toFixed(1)),
            util,
            freq: parseFloat(freq.toFixed(2)),
          };
        });

        // 3. Compute Package TDP and Push to chartData
        const avgTemp = activeCount > 0 ? sumTemp / activeCount : activeEnv.ambient;
        const newTDP = parseFloat((35 + activeCount * 7.2 + (Math.random() * 3 - 1.5)).toFixed(1));
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

        return updated;
      });

      // 4. Actionable Kernel Telemetry Log generation
      if (Math.random() > 0.4) {
        const eventTypes = ["PREDICT_BURST", "CORE_PARK", "MIGRATE_TASK", "SYS_TICK", "THERMAL_WARN"];
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
          case "MIGRATE_TASK":
            message = `Affinity migration: Task #0x${Math.floor(Math.random() * 9000 + 1000).toString(16).toUpperCase()} transferred from P-Core to E-Core.`;
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
    setCores((prev) =>
      prev.map((c) =>
        c.type === "P"
          ? { ...c, status: "ONLINE", util: 98, temp: Math.min(92, c.temp + 12), freq: 4.95 }
          : { ...c, status: "ONLINE", util: 90, temp: Math.min(68, c.temp + 6) }
      )
    );
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
    setCores((prev) =>
      prev.map((c, i) =>
        i < 4
          ? { ...c, status: "ONLINE", util: 85, temp: c.temp + 5 }
          : c
      )
    );
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
    setCores((prev) =>
      prev.map((c) => ({
        ...c,
        status: c.type === "P" && c.temp > 82 ? "HOTSPOT" : "ONLINE",
        util: 95,
        temp: Math.min(95, c.temp + 8),
      }))
    );
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

  // Theme Classes (Pure Jet Black #000000 for Dark Mode)
  const bgClass = isDark ? "bg-[#000000] text-neutral-100" : "bg-[#fcfbf9] text-stone-900";
  const headerBgClass = isDark ? "bg-[#000000] border-neutral-800" : "bg-[#fcfbf9]/90 border-stone-200/80";
  const cardBgClass = isDark ? "bg-[#080808] border-neutral-800 shadow-none" : "bg-white border-stone-200/70 shadow-sm";
  const subTextClass = isDark ? "text-neutral-400" : "text-stone-500";
  const titleTextClass = isDark ? "text-neutral-100" : "text-stone-900";

  return (
    <div className={`min-h-screen ${bgClass} font-sans transition-colors duration-200 flex flex-col`}>
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

            {/* PAUSE / RESUME ENGINE BUTTON */}
            <button
              type="button"
              onClick={() => setIsRunning(!isRunning)}
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
      <main className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
        {/* =================================================================== */}
        {/* TAB 1: OVERVIEW                                                     */}
        {/* =================================================================== */}
        {activeTab === "overview" && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className={`grid grid-cols-1 lg:grid-cols-12 gap-8 items-center ${cardBgClass} rounded-3xl p-8 sm:p-12`}>
              <div className="lg:col-span-7 space-y-6">
                <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase ${
                  isDark
                    ? "bg-indigo-950/50 border border-indigo-800/60 text-indigo-300"
                    : "bg-indigo-50 border border-indigo-200 text-indigo-700"
                }`}>
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  REAL-TIME PREEMPTIVE DISPATCH
                </div>

                <h1 className={`text-4xl sm:text-5xl font-extrabold ${titleTextClass} tracking-tight leading-[1.1]`}>
                  Thermal-Aware Multicore <br />
                  <span className="bg-gradient-to-r from-indigo-500 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Operating System Scheduler
                  </span>
                </h1>

                <p className={`${subTextClass} text-base sm:text-lg leading-relaxed max-w-xl`}>
                  Self-contained dynamic simulation modeling 16 heterogeneous cores (8 Performance + 8 Efficiency). Pre-emptively migrates compute threads before junction temperatures breach TjMax (85°C).
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("simulation")}
                    className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-sm shadow-md shadow-indigo-300/30 transition-all flex items-center gap-2 active:scale-95"
                  >
                    <span>Simulation Controls</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={triggerSpike}
                    className={`px-5 py-3.5 rounded-xl ${
                      isDark ? "bg-neutral-800 hover:bg-neutral-700 text-neutral-200" : "bg-stone-100 hover:bg-stone-200/80 text-stone-700"
                    } font-semibold text-sm transition-all flex items-center gap-2`}
                  >
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    <span>Inject 10x Spike</span>
                  </button>
                </div>
              </div>

              {/* Silicon Preview Card */}
              <div className="lg:col-span-5">
                <div className={`${isDark ? "bg-[#0c0c0c] border-neutral-800" : "bg-slate-900 border-slate-800"} rounded-2xl p-6 text-white shadow-2xl border space-y-5`}>
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                    <span className="font-bold text-sm text-neutral-200">Silicon Topology (P00-P07)</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                      CLOCK: 800MS TICK
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2.5 py-2">
                    {cores.slice(0, 8).map((c) => (
                      <div
                        key={c.id}
                        className={`p-2.5 rounded-xl border text-center transition-all ${
                          c.status === "HOTSPOT"
                            ? "bg-rose-950/60 border-rose-600 text-rose-300 animate-pulse"
                            : c.status === "MIGRATING"
                            ? "bg-amber-950/60 border-amber-600 text-amber-300"
                            : c.status === "PARKED"
                            ? isDark
                              ? "bg-[#141414] border-neutral-800 text-neutral-500"
                              : "bg-slate-950 border-slate-800 text-slate-600"
                            : "bg-slate-800/90 border-slate-700 text-emerald-400"
                        }`}
                      >
                        <div className="text-[10px] font-mono font-bold">{c.id}</div>
                        <div className="text-xs font-mono font-black mt-0.5">{c.temp.toFixed(0)}°C</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-neutral-800 text-center font-mono text-xs">
                    <div>
                      <span className="text-neutral-500 text-[10px] block">Active Cores</span>
                      <span className="font-bold text-white">{onlineCoresCount}/16</span>
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
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: SIMULATION CONTROLS                                          */}
        {/* =================================================================== */}
        {activeTab === "simulation" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className={`flex flex-wrap items-center justify-between gap-4 ${cardBgClass} p-6 rounded-2xl border`}>
              <div>
                <h2 className={`text-xl font-extrabold ${titleTextClass}`}>Simulation Workload & Engine Controls</h2>
                <p className={`text-xs ${subTextClass} mt-1`}>
                  Toggle between Smart T.A.M.S. and Standard OS, inject workload spikes, or mutate environment cooling profiles.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("cores")}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-xs transition flex items-center gap-2"
                >
                  <span>Proceed to Core Matrix</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Traffic Injectors */}
              <div className={`lg:col-span-6 ${cardBgClass} p-6 rounded-2xl border space-y-4`}>
                <div className={`flex items-center justify-between border-b ${isDark ? "border-neutral-800" : "border-stone-100"} pb-3`}>
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    <h2 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                      Synthetic Traffic Injectors
                    </h2>
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
                    className={`w-full p-4 rounded-xl border transition flex items-center justify-between text-left ${
                      isDark ? "border-indigo-800/60 bg-indigo-950/20 hover:bg-indigo-950/40" : "border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100/60"
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
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-indigo-500 text-white">
                      Inject
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={simulateMicroBurst}
                    className={`w-full p-4 rounded-xl border transition flex items-center justify-between text-left ${
                      isDark ? "border-amber-800/60 bg-amber-950/20 hover:bg-amber-950/40" : "border-amber-200 bg-amber-50/50 hover:bg-amber-100/60"
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
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-amber-500 text-white">
                      Inject
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={triggerSustainedStress}
                    className={`w-full p-4 rounded-xl border transition flex items-center justify-between text-left ${
                      isDark ? "border-rose-800/60 bg-rose-950/20 hover:bg-rose-950/40" : "border-rose-200 bg-rose-50/50 hover:bg-rose-100/60"
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
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-rose-500 text-white">
                      Inject
                    </span>
                  </button>
                </div>
              </div>

              {/* Algorithm Toggle: Smart T.A.M.S. vs Standard OS */}
              <div className={`lg:col-span-6 ${cardBgClass} p-6 rounded-2xl border space-y-4`}>
                <div className={`flex items-center justify-between border-b ${isDark ? "border-neutral-800" : "border-stone-100"} pb-3`}>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                    <h2 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                      Scheduler Algorithm Toggle
                    </h2>
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
                        ? isDark ? "border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500" : "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500"
                        : isDark ? "border-neutral-800 hover:bg-neutral-900" : "border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${titleTextClass}`}>Smart T.A.M.S. (Predictive Auto-Park)</span>
                      <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded">
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
                        ? isDark ? "border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500" : "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500"
                        : isDark ? "border-neutral-800 hover:bg-neutral-900" : "border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${titleTextClass}`}>Standard OS (Greedy Compute)</span>
                      <span className={`text-[10px] font-mono ${subTextClass} ${isDark ? "bg-neutral-800" : "bg-stone-100"} px-2 py-0.5 rounded`}>
                        NO PARKING
                      </span>
                    </div>
                    <p className={`text-xs ${subTextClass} mt-1`}>
                      Wakes all 16 cores at maximum frequencies regardless of thermal dissipation until extreme thermal throttle occurs.
                    </p>
                  </div>
                </div>
              </div>

              {/* Operating Environment Profile Selector */}
              <div className={`lg:col-span-12 ${cardBgClass} p-6 rounded-2xl border space-y-4`}>
                <div className={`flex items-center justify-between border-b ${isDark ? "border-neutral-800" : "border-stone-100"} pb-3`}>
                  <div className="flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-rose-400" />
                    <h2 className={`text-sm font-bold ${titleTextClass} uppercase tracking-wide`}>
                      Operating Environment Cooling Profile
                    </h2>
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
                              ? "border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500"
                              : "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500"
                            : isDark
                            ? "border-neutral-800 bg-[#0d0d0d] hover:bg-neutral-900"
                            : "border-stone-200 bg-white hover:bg-stone-50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xl">{prof.icon}</span>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                            isSelected
                              ? isDark ? "bg-indigo-900 text-indigo-200" : "bg-indigo-100 text-indigo-700"
                              : isDark ? "bg-neutral-800 text-neutral-400" : "bg-stone-100 text-stone-600"
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
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className={`flex flex-wrap items-center justify-between gap-4 ${cardBgClass} p-6 rounded-2xl border`}>
              <div>
                <h2 className={`text-xl font-extrabold ${titleTextClass}`}>16-Core Silicon Matrix Telemetry</h2>
                <p className={`text-xs ${subTextClass} mt-1`}>
                  Observing 8 P-Cores & 8 E-Cores live temperatures, frequencies, and active task migrations.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("simulation")}
                  className={`px-3.5 py-2 rounded-xl ${isDark ? "bg-neutral-800 text-neutral-200" : "bg-stone-100 text-stone-700"} font-semibold text-xs`}
                >
                  Back to Controls
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("analytics")}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-xs flex items-center gap-2"
                >
                  <span>Proceed to Waveforms</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {cores.map((c) => (
                <div
                  key={c.id}
                  className={`p-3.5 rounded-2xl border text-center transition-all ${
                    c.status === "HOTSPOT"
                      ? "bg-rose-950/40 border-rose-600 text-rose-300 shadow-md shadow-rose-950/20"
                      : c.status === "MIGRATING"
                      ? "bg-amber-950/40 border-amber-600 text-amber-300 shadow-md shadow-amber-950/20"
                      : c.status === "PARKED"
                      ? isDark ? "bg-[#0d0d0d] border-neutral-800 text-neutral-500" : "bg-stone-100/60 border-stone-200 text-stone-400"
                      : isDark ? "bg-[#111111] border-neutral-800 text-emerald-400" : "bg-white border-stone-200 text-stone-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold mb-1">
                    <span>{c.id}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] ${c.type === "P" ? "bg-indigo-900/60 text-indigo-300" : "bg-cyan-900/60 text-cyan-300"}`}>
                      {c.type}
                    </span>
                  </div>
                  <div className="text-xl font-mono font-black my-1">
                    {c.temp.toFixed(1)}°C
                  </div>
                  <div className="text-[10px] font-mono opacity-80">
                    {c.freq > 0 ? `${c.freq.toFixed(2)} GHz` : "PARKED"}
                  </div>
                  <div className="mt-2 text-[9px] font-mono px-1 py-0.5 rounded bg-black/20 truncate">
                    {c.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: WAVEFORMS & THERMAL JUNCTION                                 */}
        {/* =================================================================== */}
        {activeTab === "analytics" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className={`flex flex-wrap items-center justify-between gap-4 ${cardBgClass} p-6 rounded-2xl border`}>
              <div>
                <h2 className={`text-xl font-extrabold ${titleTextClass}`}>Live Thermal Waveforms & Ingress Dynamics</h2>
                <p className={`text-xs ${subTextClass} mt-1`}>
                  Synchronized Recharts telemetry showing junction temperature Tj vs incoming request volume.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("audit")}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white font-bold text-xs flex items-center gap-2"
                >
                  <span>Proceed to Kernel Logs</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className={`${cardBgClass} p-6 rounded-2xl border space-y-4`}>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="ingressGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="thermalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" stroke={isDark ? "#555" : "#aaa"} fontSize={10} tickLine={false} />
                    <YAxis stroke={isDark ? "#555" : "#aaa"} fontSize={10} domain={[20, 160]} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? "#111" : "#fff",
                        borderColor: isDark ? "#333" : "#ddd",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                    />
                    <ReferenceLine y={85} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: "TjMax (85°C)", fill: "#f43f5e", fontSize: 10 }} />
                    <Area type="monotone" dataKey="requestInflow" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#ingressGrad)" name="Ingress (k req/s)" />
                    <Area type="monotone" dataKey="thermalTj" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#thermalGrad)" name="Thermal Tj (°C)" />
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
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className={`flex flex-wrap items-center justify-between gap-4 ${cardBgClass} p-6 rounded-2xl border`}>
              <div>
                <h2 className={`text-xl font-extrabold ${titleTextClass}`}>Preempt-RT Kernel Telemetry Stream</h2>
                <p className={`text-xs ${subTextClass} mt-1`}>
                  Deterministic micro-event logs capturing dynamic thread migrations, C6 sleeps, and thermal adjustments.
                </p>
              </div>
            </div>

            <div className={`${isDark ? "bg-[#050505] border-neutral-800" : "bg-neutral-950 border-neutral-900"} rounded-2xl p-4 font-mono text-xs border`}>
              <div
                ref={logContainerRef}
                className="h-96 overflow-y-auto space-y-2 pr-2"
              >
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 py-1 border-b border-neutral-900">
                    <span className="text-neutral-500 shrink-0">{log.timestamp}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      log.tag === "PREDICT_BURST"
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
