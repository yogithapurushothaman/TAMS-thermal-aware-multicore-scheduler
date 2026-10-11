"""
FastAPI Backend Simulation Engine for T.A.M.S.
Enhanced with:
1. Predictive Profiling / Multi-Level Feedback (Tasks start UNKNOWN, tested on E-core for 2 ticks)
2. Dynamic Core Parking (P-cores sleep/park when Ready Queue < 3 tasks, 0 energy/heat)
3. Spiky Burst Workload Generator (Traffic bursts testing wake up and re-parking)
4. Power Saved by Parking metric
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from enum import Enum
import random

from tams.config import SimulationConfig
from tams.core import Core, CoreType, CoreState
from tams.process import Process, ProcessType, WorkloadGenerator
from tams.scheduler import BaseScheduler
from tams.baselines import FCFSScheduler, RoundRobinScheduler

app = FastAPI(
    title="T.A.M.S. Predictive OS Engine",
    description="FastAPI Backend with Predictive Profiling, Dynamic Core Parking, and Spiky Traffic.",
    version="4.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Data Models ---

class DVFSMode(str, Enum):
    TURBO = "TURBO"        # Speed: 2.0, Heat: +5.0°C, Energy: 5.0
    BALANCED = "BALANCED"  # Speed: 1.5, Heat: +1.0°C, Energy: 2.5
    ECO = "ECO"            # Speed: 0.5, Cool: -1.0°C, Energy: 1.0


class SimulationRequest(BaseModel):
    num_p_cores: int = Field(default=2, ge=1, le=8)
    num_e_cores: int = Field(default=4, ge=1, le=16)
    p_heat_rate: float = Field(default=5.0)
    e_heat_rate: float = Field(default=1.0)
    critical_temp: float = Field(default=90.0)
    recovery_temp: float = Field(default=60.0)
    migration_penalty_ticks: int = Field(default=2)
    io_probability: float = Field(default=0.05)
    scenario: str = Field(default="SPIKY")
    count: int = Field(default=20)
    fg_ratio: float = Field(default=0.6)
    seed: int = Field(default=42)


class MetricDetail(BaseModel):
    avg_waiting: float
    avg_turnaround: float
    max_temp: float
    total_energy: float
    cpu_utilization: float
    migrations: int
    throttles: int
    time_above_90: int
    deadlines_missed: int
    power_saved_parking: float
    deadlocks_resolved: int = 0
    total_ticks: int


class SimulationResponse(BaseModel):
    metrics: Dict[str, MetricDetail]
    workload_info: Dict[str, Any]
    traces: Dict[str, List[Dict[str, Any]]]


# --- Advanced Simulation Core with Core Parking ---

class AdvancedCore(Core):
    """Core with DVFS, Cache Load state, and Dynamic Core Parking (Deep Sleep C-State)."""

    def __init__(self, core_id: str, core_type: CoreType, config: SimulationConfig):
        super().__init__(core_id, core_type, config)
        self.dvfs_mode = DVFSMode.TURBO
        self.cache_load_remaining = 0
        self.is_parked = False
        self.is_locked_mutex = False

    def park(self):
        """Parks core: shuts down power, consumes 0 energy, 0 heat, accepts no work."""
        self.is_parked = True
        self.state = CoreState.IDLE
        self.current_process = None

    def unpark(self):
        """Wakes up core from deep sleep."""
        self.is_parked = False

    def set_dvfs_mode(self, mode: DVFSMode):
        self.dvfs_mode = mode
        if self.type == CoreType.P_CORE:
            if mode == DVFSMode.TURBO:
                self.speed_multiplier = 2.0
                self.heat_rate = 5.0
                self.energy_rate = 5.0
            elif mode == DVFSMode.BALANCED:
                self.speed_multiplier = 1.5
                self.heat_rate = 1.0
                self.energy_rate = 2.5
            elif mode == DVFSMode.ECO:
                self.speed_multiplier = 0.5
                self.heat_rate = -1.0
                self.energy_rate = 1.0

    def tick_active_advanced(self) -> float:
        if self.is_parked:
            return 0.0

        if self.cache_load_remaining > 0:
            self.cache_load_remaining -= 1
            if self.current_process:
                self.current_process.exec_ticks += 1
            self.temperature += self.heat_rate
            return self.energy_rate

        if self.current_process is not None:
            self.current_process.exec_ticks += 1
            self.current_process.remaining_work -= self.speed_multiplier
            if self.time_slice_remaining > 0:
                self.time_slice_remaining -= 1

        self.temperature += self.heat_rate
        return self.energy_rate

    def tick_idle_advanced(self) -> float:
        """Idle/Parked cooling tick: Parked cores consume 0 energy."""
        self.temperature = max(self.baseline_temp, self.temperature - self.idle_cooling_rate)
        if self.state == CoreState.LOCKED_COOLING and self.temperature <= self.recovery_temp:
            self.state = CoreState.IDLE
        return 0.0


# --- Predictive Heuristic Profiler & Core Parking Scheduler ---

class PredictiveTAMSScheduler(BaseScheduler):
    """
    T.A.M.S. Scheduler featuring:
    1. Multi-Level Feedback Predictive Profiling (Tasks start UNKNOWN, profiled for 2 ticks on E-Core)
    2. Dynamic Core Parking (P-Cores park when Ready Queue < 3)
    3. DVFS Downshift at 80°C
    4. Real-Time EDF Deadlines
    """

    def __init__(self, cores: List[AdvancedCore], config: SimulationConfig):
        super().__init__(cores, config)
        self.advanced_cores = cores
        self.probation_queue: List[Process] = []  # UNKNOWN tasks waiting for 2-tick profiling
        self.fg_ready_queue: List[Process] = []    # Promoted P-Core tasks (EDF sorted)
        self.bg_ready_queue: List[Process] = []    # Classified E-Core tasks
        self.migrated_fg_queue: List[Process] = []
        self.penalty_list: List[Process] = []
        self.parked_ticks_count = 0

    def admit_arrivals(self, tick: int, arrivals: List[Process]):
        for proc in arrivals:
            # All tasks arrive as UNKNOWN and must be profiled
            proc.classification = "UNKNOWN"
            proc.profile_ticks_remaining = 2
            proc.profile_blocked = False
            self.probation_queue.append(proc)

    def watchdog(self, tick: int):
        # 1. Dynamic Core Parking Logic:
        # Check total active ready tasks: probation + fg + bg + migrated
        total_ready = len(self.probation_queue) + len(self.fg_ready_queue) + len(self.bg_ready_queue) + len(self.migrated_fg_queue)
        
        for core in self.advanced_cores:
            if core.type == CoreType.P_CORE:
                if total_ready < 3 and core.current_process is None and core.state != CoreState.LOCKED_COOLING:
                    # Low load budget: Park P-Core to save extreme energy
                    core.park()
                    self.parked_ticks_count += 1
                elif total_ready >= 3 and core.is_parked:
                    # Heavy load / spike arrived: Wake up P-Core
                    core.unpark()

                # DVFS and Overheat check on active P-Cores
                if not core.is_parked:
                    if core.temperature >= self.config.critical_temp:
                        if core.current_process is not None:
                            proc = core.detach_process()
                            core.lock_cooling()
                            proc.migrations += 1
                            proc.is_migrated = True
                            proc.penalty_remaining = self.config.migration_penalty_ticks
                            self.penalty_list.append(proc)
                            self.thermal_migrations_count += 1
                    elif core.temperature >= 80.0:
                        core.set_dvfs_mode(DVFSMode.BALANCED)
                    elif core.temperature <= 70.0 and core.state != CoreState.LOCKED_COOLING:
                        core.set_dvfs_mode(DVFSMode.TURBO)

            elif core.type == CoreType.E_CORE:
                if core.temperature >= self.config.critical_temp and core.current_process is not None:
                    proc = core.detach_process()
                    core.lock_cooling()
                    if getattr(proc, 'classification', 'E_CORE') == "P_CORE":
                        self.migrated_fg_queue.insert(0, proc)
                    else:
                        self.bg_ready_queue.insert(0, proc)
                    self.throttle_events_count += 1

    def process_penalties(self, tick: int):
        finished = []
        for proc in self.penalty_list:
            proc.penalty_remaining -= 1
            proc.penalty_ticks += 1
            if proc.penalty_remaining <= 0:
                finished.append(proc)
        for proc in finished:
            self.penalty_list.remove(proc)
            self.migrated_fg_queue.append(proc)

    def dispatch(self, tick: int):
        # 1. Check probationary tasks running on E-cores: have they finished 2 ticks profiling?
        for core in self.advanced_cores:
            if core.type == CoreType.E_CORE and core.current_process is not None:
                p = core.current_process
                if getattr(p, "classification", None) == "UNKNOWN":
                    p.profile_ticks_remaining -= 1
                    if p.profile_ticks_remaining <= 0:
                        # Profiling finished!
                        if getattr(p, "profile_blocked", False) or getattr(p, "is_bg_bias", False):
                            p.classification = "E_CORE"
                            # Continues running on E-core
                        else:
                            # Used full CPU without blocking: PROMOTE to P-CORE task!
                            p.classification = "P_CORE"
                            core.detach_process()
                            self.fg_ready_queue.append(p)
                            # Sort by Real-Time EDF
                            self.fg_ready_queue.sort(
                                key=lambda x: (getattr(x, 'deadline_tick', 999999), x.arrival_time)
                            )

        # 2. Dispatch Migrated FG tasks to E-Cores (Cache Load penalty)
        idle_e = [c for c in self.advanced_cores if c.type == CoreType.E_CORE and c.is_available()]
        for e_core in idle_e:
            if self.migrated_fg_queue:
                proc = self.migrated_fg_queue.pop(0)
                if proc.start_time is None:
                    proc.start_time = tick
                e_core.assign_process(proc)
                e_core.cache_load_remaining = 3

        # 3. Dispatch UNKNOWN tasks to E-Cores for 2-tick profiling
        remaining_idle_e = [c for c in self.advanced_cores if c.type == CoreType.E_CORE and c.is_available()]
        for e_core in remaining_idle_e:
            if self.probation_queue:
                proc = self.probation_queue.pop(0)
                if proc.start_time is None:
                    proc.start_time = tick
                e_core.assign_process(proc)

        # 4. Dispatch Promoted P-Core tasks to active (unparked) P-Cores
        idle_p = [c for c in self.advanced_cores if c.type == CoreType.P_CORE and c.is_available() and not c.is_parked]
        for p_core in idle_p:
            if self.fg_ready_queue:
                proc = self.fg_ready_queue.pop(0)
                if proc.start_time is None:
                    proc.start_time = tick
                p_core.assign_process(proc)

        # 5. Dispatch remaining E-Core tasks
        last_idle_e = [c for c in self.advanced_cores if c.type == CoreType.E_CORE and c.is_available()]
        for e_core in last_idle_e:
            if self.bg_ready_queue:
                proc = self.bg_ready_queue.pop(0)
                if proc.start_time is None:
                    proc.start_time = tick
                e_core.assign_process(proc)

    def has_pending_work(self) -> bool:
        if any(c.current_process is not None for c in self.cores):
            return True
        return bool(self.probation_queue or self.fg_ready_queue or self.bg_ready_queue or self.migrated_fg_queue or self.penalty_list)


# --- Spiky Workload Generator Helper ---

def create_spiky_workload() -> List[Process]:
    """
    Creates traffic with low initial load (P-Cores parked),
    followed by a massive burst of 15 tasks at Tick 30 (P-Cores wake up!),
    which then drains, allowing P-Cores to park themselves again!
    Includes background tasks that grab the shared mutex lock and foreground tasks needing it.
    """
    procs = []
    # Initial trickle of 2 tasks (Queue < 3 -> P-cores park)
    procs.append(Process(pid=1, arrival_time=0, burst_time=10, process_type=ProcessType.BACKGROUND))
    p2 = Process(pid=2, arrival_time=2, burst_time=14, process_type=ProcessType.BACKGROUND)
    p2.needs_lock = True
    procs.append(p2)

    # Massive Traffic Spike at Tick 30: 15 heavy tasks arriving simultaneously!
    for i in range(3, 18):
        burst = 18 + ((i * 3) % 20)
        p = Process(pid=i, arrival_time=30, burst_time=burst, process_type=ProcessType.FOREGROUND)
        p.deadline_tick = 30 + int(burst * 1.5) + 5
        if i in (5, 9):
            p.needs_lock = True
        procs.append(p)

    return procs


# --- Simulation Execution ---

def run_predictive_simulation(req: SimulationRequest) -> SimulationResponse:
    config = SimulationConfig(
        num_p_cores=req.num_p_cores,
        num_e_cores=req.num_e_cores,
        p_heat_rate=req.p_heat_rate,
        e_heat_rate=req.e_heat_rate,
        critical_temp=req.critical_temp,
        recovery_temp=req.recovery_temp,
        migration_penalty_ticks=req.migration_penalty_ticks,
        random_seed=req.seed
    )

    if req.scenario == "SPIKY":
        base_workload = create_spiky_workload()
    elif req.scenario in ["T-1", "T-2", "T-3", "T-4", "DEMO"]:
        base_workload = WorkloadGenerator.get_test_scenario(req.scenario)
        for p in base_workload:
            if not hasattr(p, "deadline_tick") or p.deadline_tick is None:
                p.deadline_tick = p.arrival_time + int(p.burst_time * 1.6)
            if getattr(p, "needs_lock", None) is None:
                p.needs_lock = (p.type == ProcessType.BACKGROUND and p.pid % 10 == 0) or (p.type == ProcessType.FOREGROUND and p.pid % 5 == 0)
    else:
        base_workload = WorkloadGenerator.generate_random(
            count=req.count, fg_ratio=req.fg_ratio, seed=req.seed
        )
        for p in base_workload:
            p.deadline_tick = p.arrival_time + int(p.burst_time * 1.6)
            p.needs_lock = (p.type == ProcessType.BACKGROUND and p.pid % 10 == 0) or (p.type == ProcessType.FOREGROUND and p.pid % 5 == 0)

    results = {}

    for sched_name, is_tams in [("tams", True), ("fcfs", False), ("rr", False)]:
        cores = [
            AdvancedCore(f"P{i}", CoreType.P_CORE, config) for i in range(req.num_p_cores)
        ] + [
            AdvancedCore(f"E{i}", CoreType.E_CORE, config) for i in range(req.num_e_cores)
        ]

        if is_tams:
            scheduler = PredictiveTAMSScheduler(cores, config)
        elif sched_name == "fcfs":
            scheduler = FCFSScheduler(cores, config)
        else:
            scheduler = RoundRobinScheduler(cores, config)

        processes = [p.clone() for p in base_workload]
        for idx, p in enumerate(processes):
            p.deadline_tick = getattr(base_workload[idx], 'deadline_tick', None)
            p.is_bg_bias = (base_workload[idx].type == ProcessType.BACKGROUND)
            p.needs_lock = getattr(base_workload[idx], 'needs_lock', False)
            p.is_holding_lock = False
            p.is_boosted = False
            p.is_locked_waiting = False

        completed = []
        io_queue = []
        trace = []
        current_tick = 0
        total_energy = 0.0
        active_ticks = 0
        rng = random.Random(req.seed + (15 if is_tams else 25))

        # Shared Resource Mutex & Priority Inheritance State
        resource_lock: Optional[int] = None
        deadlocks_resolved_count = 0
        preempted_blocked_tasks: Dict[str, Process] = {}

        MAX_TICKS = 10_000

        while current_tick < MAX_TICKS:
            # 1. Recover I/O blocked tasks
            rec_io = []
            for proc in list(io_queue):
                if hasattr(proc, 'io_remaining_ticks'):
                    proc.io_remaining_ticks -= 1
                    if proc.io_remaining_ticks <= 0:
                        io_queue.remove(proc)
                        rec_io.append(proc)

            # 2. Admit arrivals
            arrivals = [p for p in processes if p.arrival_time == current_tick] + rec_io
            if arrivals:
                scheduler.admit_arrivals(current_tick, arrivals)

            # 3. Watchdog & Core Parking
            scheduler.watchdog(current_tick)

            # 4. Penalties
            scheduler.process_penalties(current_tick)

            # 5. Dispatch
            scheduler.dispatch(current_tick)

            # 5.1 Mutex Lock Requests & Deadlock Detection
            # A) Background tasks running acquire lock if free
            for core in cores:
                if core.state == CoreState.RUNNING and core.current_process is not None:
                    proc = core.current_process
                    if getattr(proc, 'needs_lock', False):
                        if resource_lock is None and not getattr(proc, 'is_holding_lock', False):
                            resource_lock = proc.pid
                            proc.is_holding_lock = True

            # B) P-Core tasks needing the lock enter LOCKED if held by an E-core task
            for core in cores:
                if core.type == CoreType.P_CORE and core.current_process is not None:
                    proc = core.current_process
                    if getattr(proc, 'needs_lock', False):
                        if resource_lock is not None and resource_lock != proc.pid:
                            # Blocked waiting on mutex
                            core.is_locked_mutex = True
                            proc.is_locked_waiting = True
                        else:
                            core.is_locked_mutex = False
                            proc.is_locked_waiting = False
                            if resource_lock is None:
                                resource_lock = proc.pid
                                proc.is_holding_lock = True
                elif core.type == CoreType.E_CORE:
                    core.is_locked_mutex = False

            # 5.2 Priority Inheritance (T.A.M.S. only)
            if is_tams and resource_lock is not None:
                blocked_p_cores = [c for c in cores if c.type == CoreType.P_CORE and getattr(c, 'is_locked_mutex', False)]
                if blocked_p_cores:
                    lock_holder = None
                    lock_holder_core = None
                    for c in cores:
                        if c.current_process and c.current_process.pid == resource_lock:
                            lock_holder = c.current_process
                            lock_holder_core = c
                            break

                    if lock_holder and not getattr(lock_holder, 'is_boosted', False):
                        deadlocks_resolved_count += 1
                        lock_holder.is_boosted = True
                        target_p_core = blocked_p_cores[0]

                        # Preempt the blocked P-core task
                        preempted_task = target_p_core.detach_process()
                        preempted_blocked_tasks[target_p_core.id] = preempted_task

                        # Detach lock holder from its E-Core
                        if lock_holder_core:
                            lock_holder_core.detach_process()

                        # Boost lock holder to the P-Core at 2.0x Turbo speed!
                        target_p_core.assign_process(lock_holder)
                        target_p_core.set_dvfs_mode(DVFSMode.TURBO)
                        target_p_core.speed_multiplier = 2.0
                        target_p_core.is_locked_mutex = False

            # 6. Execute
            tick_energy = 0.0
            for core in cores:
                if core.state == CoreState.RUNNING and core.current_process is not None:
                    proc = core.current_process
                    if getattr(core, 'is_locked_mutex', False):
                        # Frozen in LOCKED state: 0 work completed!
                        proc.exec_ticks += 1
                        active_ticks += 1
                        core.temperature = max(core.baseline_temp, core.temperature - 0.2)
                        tick_energy += 0.5
                        continue

                    active_ticks += 1
                    tick_energy += core.tick_active_advanced()

                    if proc.is_completed():
                        proc.finish_time = current_tick + 1
                        core.detach_process()
                        completed.append(proc)

                        # Release lock if held
                        if getattr(proc, 'is_holding_lock', False):
                            resource_lock = None
                            proc.is_holding_lock = False

                        # If boosted task finished, resume the preempted original P-Core task!
                        if getattr(proc, 'is_boosted', False):
                            proc.is_boosted = False
                            if core.id in preempted_blocked_tasks:
                                original_task = preempted_blocked_tasks.pop(core.id)
                                original_task.is_locked_waiting = False
                                if resource_lock is None:
                                    resource_lock = original_task.pid
                                    original_task.is_holding_lock = True
                                core.assign_process(original_task)
                                core.is_locked_mutex = False
                    elif req.io_probability > 0 and rng.random() < req.io_probability:
                        proc.profile_blocked = True
                        detached = core.detach_process()
                        if detached:
                            detached.io_remaining_ticks = 3
                            io_queue.append(detached)
                else:
                    tick_energy += core.tick_idle_advanced()

            total_energy += tick_energy

            # Snapshot with PARKED, LOCKED, and BOOST states and classification tags
            snap_states = {}
            for c in cores:
                if getattr(c, "is_locked_mutex", False):
                    snap_states[c.id] = "LOCKED"
                elif c.current_process and getattr(c.current_process, "is_boosted", False):
                    snap_states[c.id] = "BOOST"
                elif getattr(c, "is_parked", False):
                    snap_states[c.id] = "PARKED"
                elif getattr(c, "cache_load_remaining", 0) > 0:
                    snap_states[c.id] = "CACHE_LOAD"
                else:
                    snap_states[c.id] = c.state.value

            snap_classifications = {}
            for c in cores:
                if c.current_process is not None:
                    if getattr(c.current_process, "is_boosted", False):
                        snap_classifications[c.id] = "BOOST"
                    elif getattr(c, "is_locked_mutex", False):
                        snap_classifications[c.id] = "LOCKED"
                    else:
                        snap_classifications[c.id] = getattr(c.current_process, "classification", "PROMOTED")
                else:
                    snap_classifications[c.id] = None

            snap = {
                "tick": current_tick,
                "core_temps": {c.id: c.temperature for c in cores},
                "core_states": snap_states,
                "core_modes": {c.id: (c.dvfs_mode.value if hasattr(c, "dvfs_mode") else "TURBO") for c in cores},
                "core_pids": {c.id: (c.current_process.pid if c.current_process else None) for c in cores},
                "classifications": snap_classifications,
                "blocked_pids": [p.pid for p in io_queue],
                "energy": tick_energy
            }
            trace.append(snap)

            all_arr = all(p.arrival_time <= current_tick for p in processes)
            all_done = len(completed) == len(processes)
            if all_arr and all_done and not scheduler.has_pending_work() and not io_queue:
                break

            current_tick += 1

        num_c = len(completed)
        avg_wait = sum(p.waiting_time for p in completed if p.waiting_time is not None) / max(1, num_c)
        avg_turn = sum(p.turnaround_time for p in completed if p.turnaround_time is not None) / max(1, num_c)
        max_temp = max(snap["core_temps"][cid] for snap in trace for cid in snap["core_temps"])
        time_above_90 = sum(1 for snap in trace for temp in snap["core_temps"].values() if temp >= config.critical_temp)

        deadlines_missed = sum(
            1 for p in completed
            if getattr(p, "deadline_tick", None) is not None and p.finish_time is not None and p.finish_time > p.deadline_tick
        )

        cpu_util = round((active_ticks / max(1, current_tick * len(cores))) * 100, 1)

        # Calculate Power Saved by Parking
        parked_ticks = getattr(scheduler, "parked_ticks_count", 0) if is_tams else 0
        power_saved = round(parked_ticks * 3.5, 1)

        results[sched_name] = {
            "metrics": MetricDetail(
                avg_waiting=round(avg_wait, 2),
                avg_turnaround=round(avg_turn, 2),
                max_temp=round(max_temp, 1),
                total_energy=round(total_energy, 1),
                cpu_utilization=cpu_util,
                migrations=scheduler.thermal_migrations_count,
                throttles=scheduler.throttle_events_count,
                time_above_90=time_above_90,
                deadlines_missed=deadlines_missed,
                power_saved_parking=power_saved,
                deadlocks_resolved=deadlocks_resolved_count if is_tams else 0,
                total_ticks=current_tick + 1
            ),
            "trace": trace
        }

    return SimulationResponse(
        metrics={
            "tams": results["tams"]["metrics"],
            "fcfs": results["fcfs"]["metrics"],
            "rr": results["rr"]["metrics"]
        },
        workload_info={
            "total_processes": len(base_workload),
            "fg_processes": sum(1 for p in base_workload if p.type == ProcessType.FOREGROUND),
            "bg_processes": sum(1 for p in base_workload if p.type == ProcessType.BACKGROUND),
            "seed": req.seed
        },
        traces={
            "tams": results["tams"]["trace"],
            "fcfs": results["fcfs"]["trace"],
            "rr": results["rr"]["trace"]
        }
    )


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "T.A.M.S. Predictive OS Engine with Core Parking"}

@app.post("/api/simulate", response_model=SimulationResponse)
def simulate(req: SimulationRequest):
    return run_predictive_simulation(req)
