"""
Simulation Engine: Main clock loop runner and state recorder.
"""

from typing import List, Dict, Any, Type
import copy
from tams.config import SimulationConfig
from tams.core import Core, CoreType, CoreState
from tams.process import Process
from tams.scheduler import BaseScheduler

class SimulationResult:
    """Stores the outputs, trace timeline, and completed process states of a simulation run."""

    def __init__(
        self,
        scheduler_name: str,
        config: SimulationConfig,
        completed_processes: List[Process],
        trace: List[Dict[str, Any]],
        total_ticks: int,
        total_energy: float,
        thermal_migrations: int,
        throttle_events: int
    ):
        self.scheduler_name = scheduler_name
        self.config = config
        self.completed_processes = completed_processes
        self.trace = trace
        self.total_ticks = total_ticks
        self.total_energy = total_energy
        self.thermal_migrations = thermal_migrations
        self.throttle_events = throttle_events


class SimulationEngine:
    """Executes the time-stepped virtual clock loop for a given scheduler and workload."""

    def __init__(self, config: SimulationConfig = None):
        self.config = config if config is not None else SimulationConfig()

    def _build_cores(self) -> List[Core]:
        cores = []
        for i in range(self.config.num_p_cores):
            cores.append(Core(f"P{i}", CoreType.P_CORE, self.config))
        for i in range(self.config.num_e_cores):
            cores.append(Core(f"E{i}", CoreType.E_CORE, self.config))
        return cores

    def run(self, scheduler_class: Type[BaseScheduler], workload: List[Process], scheduler_name: str = None) -> SimulationResult:
        """
        Runs the time-stepped clock loop until all processes complete.
        """
        # Deep copy workload to avoid mutating original
        processes = [p.clone() for p in workload]
        pending_arrivals = {p.pid: p for p in processes}
        completed_processes: List[Process] = []
        
        cores = self._build_cores()
        scheduler = scheduler_class(cores, self.config)
        if scheduler_name is None:
            scheduler_name = scheduler_class.__name__

        trace: List[Dict[str, Any]] = []
        current_tick = 0
        total_energy = 0.0

        # Safety max ticks limit to prevent infinite loops in buggy scenarios
        MAX_TICKS = 100_000

        while current_tick < MAX_TICKS:
            # 1. Admit arrivals for current_tick
            arrivals = [p for p in processes if p.arrival_time == current_tick]
            if arrivals:
                scheduler.admit_arrivals(current_tick, arrivals)

            # 2. Watchdog: check overheating / preemption
            scheduler.watchdog(current_tick)

            # 3. Process context-switch penalties (for TAMS)
            scheduler.process_penalties(current_tick)

            # 4. Dispatch ready processes to idle cores
            scheduler.dispatch(current_tick)

            # 5. Core execution & thermal physics update
            tick_energy = 0.0
            for core in cores:
                if core.state == CoreState.RUNNING and core.current_process is not None:
                    proc = core.current_process
                    tick_energy += core.tick_active()
                    
                    if proc.is_completed():
                        proc.finish_time = current_tick + 1
                        core.detach_process()
                        completed_processes.append(proc)
                else:
                    tick_energy += core.tick_idle()

            total_energy += tick_energy

            # 6. Record tick trace snapshot
            snapshot = {
                "tick": current_tick,
                "core_temps": {c.id: c.temperature for c in cores},
                "core_states": {c.id: c.state.value for c in cores},
                "core_pids": {c.id: (c.current_process.pid if c.current_process else None) for c in cores},
                "energy": tick_energy
            }
            trace.append(snapshot)

            # 7. Check completion condition
            all_arrived = all(p.arrival_time <= current_tick for p in processes)
            all_finished = len(completed_processes) == len(processes)
            
            if all_arrived and all_finished and not scheduler.has_pending_work():
                break

            current_tick += 1

        return SimulationResult(
            scheduler_name=scheduler_name,
            config=self.config,
            completed_processes=completed_processes,
            trace=trace,
            total_ticks=current_tick + 1,
            total_energy=total_energy,
            thermal_migrations=scheduler.thermal_migrations_count,
            throttle_events=scheduler.throttle_events_count
        )
