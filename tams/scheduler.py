"""
T.A.M.S. Multilevel Queue Scheduler and Thermal Migration Engine.
"""

from collections import deque
from typing import List, Dict, Any, Optional
from tams.config import SimulationConfig
from tams.core import Core, CoreType, CoreState
from tams.process import Process, ProcessType

class BaseScheduler:
    """Abstract base class for all schedulers in the simulation."""

    def __init__(self, cores: List[Core], config: SimulationConfig):
        self.cores = cores
        self.config = config
        self.p_cores = [c for c in cores if c.type == CoreType.P_CORE]
        self.e_cores = [c for c in cores if c.type == CoreType.E_CORE]
        self.thermal_migrations_count = 0
        self.throttle_events_count = 0

    def admit_arrivals(self, tick: int, arrivals: List[Process]):
        raise NotImplementedError

    def watchdog(self, tick: int):
        raise NotImplementedError

    def process_penalties(self, tick: int):
        pass

    def dispatch(self, tick: int):
        raise NotImplementedError

    def has_pending_work(self) -> bool:
        raise NotImplementedError


class TAMSScheduler(BaseScheduler):
    """
    Thermal-Aware Multicore Scheduler (T.A.M.S.)
    Uses multilevel queues (FG -> P-cores, BG -> E-cores) and preemptive thermal migration.
    """

    def __init__(self, cores: List[Core], config: SimulationConfig):
        super().__init__(cores, config)
        self.fg_ready_queue: deque[Process] = deque()
        self.bg_ready_queue: deque[Process] = deque()
        self.migrated_fg_queue: deque[Process] = deque()
        self.penalty_list: List[Process] = []

    def admit_arrivals(self, tick: int, arrivals: List[Process]):
        """Routes newly arrived processes into Foreground or Background ready queues."""
        for proc in arrivals:
            if proc.type == ProcessType.FOREGROUND:
                self.fg_ready_queue.append(proc)
            else:
                self.bg_ready_queue.append(proc)

    def watchdog(self, tick: int):
        """
        Monitors running P-cores and E-cores.
        If a P-core temperature reaches or exceeds 90 °C, triggers preemptive migration.
        If an E-core temperature reaches or exceeds 90 °C, locks core for cooling and re-queues process.
        """
        # 1. P-cores watchdog
        for core in self.p_cores:
            if core.current_process is not None and core.is_overheated():
                proc = core.detach_process()
                core.lock_cooling()  # Lock overheated P-core in LOCKED_COOLING state
                
                # Update process state for context-switch penalty phase
                proc.migrations += 1
                proc.is_migrated = True
                proc.penalty_remaining = self.config.migration_penalty_ticks
                self.penalty_list.append(proc)
                self.thermal_migrations_count += 1

        # 2. E-cores watchdog
        for core in self.e_cores:
            if core.current_process is not None and core.is_overheated():
                proc = core.detach_process()
                core.lock_cooling()  # Lock overheated E-core in LOCKED_COOLING state
                if proc.type == ProcessType.FOREGROUND or proc.is_migrated:
                    self.migrated_fg_queue.appendleft(proc)
                else:
                    self.bg_ready_queue.appendleft(proc)
                self.throttle_events_count += 1

    def process_penalties(self, tick: int):
        """
        Advances context-switch penalty ticks for processes undergoing migration.
        When penalty is finished, moves process to migrated FG queue.
        """
        finished_penalty = []
        for proc in self.penalty_list:
            proc.penalty_remaining -= 1
            proc.penalty_ticks += 1
            if proc.penalty_remaining <= 0:
                finished_penalty.append(proc)

        for proc in finished_penalty:
            self.penalty_list.remove(proc)
            self.migrated_fg_queue.append(proc)

    def dispatch(self, tick: int):
        """
        Dispatches processes according to priority rules:
        1. Migrated FG processes -> idle E-cores (highest priority on E-cores)
        2. FG processes -> idle P-cores (FCFS)
        3. BG processes -> idle E-cores (FCFS)
        """
        # 1. Dispatch migrated Foreground processes to available E-cores
        idle_e_cores = [c for c in self.e_cores if c.is_available()]
        for e_core in idle_e_cores:
            if self.migrated_fg_queue:
                proc = self.migrated_fg_queue.popleft()
                if proc.start_time is None:
                    proc.start_time = tick
                e_core.assign_process(proc)

        # 2. Dispatch Foreground processes to available P-cores
        idle_p_cores = [c for c in self.p_cores if c.is_available()]
        for p_core in idle_p_cores:
            if self.fg_ready_queue:
                proc = self.fg_ready_queue.popleft()
                if proc.start_time is None:
                    proc.start_time = tick
                p_core.assign_process(proc)

        # 3. Dispatch Background processes to available E-cores
        remaining_idle_e_cores = [c for c in self.e_cores if c.is_available()]
        for e_core in remaining_idle_e_cores:
            if self.bg_ready_queue:
                proc = self.bg_ready_queue.popleft()
                if proc.start_time is None:
                    proc.start_time = tick
                e_core.assign_process(proc)

    def has_pending_work(self) -> bool:
        """Returns True if any processes are active, queued, or undergoing penalty."""
        if any(c.current_process is not None for c in self.cores):
            return True
        if self.fg_ready_queue or self.bg_ready_queue or self.migrated_fg_queue or self.penalty_list:
            return True
        return False
