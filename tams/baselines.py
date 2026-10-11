"""
Baseline Schedulers: First-Come, First-Served (FCFS) and Round-Robin (RR).
Models traditional homogeneous/type-blind scheduling with thermal throttling.
"""

from collections import deque
from typing import List
from tams.config import SimulationConfig
from tams.core import Core, CoreType, CoreState
from tams.process import Process
from tams.scheduler import BaseScheduler

class FCFSScheduler(BaseScheduler):
    """
    First-Come First-Served (FCFS) Baseline Scheduler.
    Single queue, non-preemptive (except when throttled by thermals), type-blind core routing.
    """

    def __init__(self, cores: List[Core], config: SimulationConfig):
        super().__init__(cores, config)
        self.ready_queue: deque[Process] = deque()

    def admit_arrivals(self, tick: int, arrivals: List[Process]):
        """Appends all incoming processes into a single FIFO ready queue."""
        for proc in arrivals:
            self.ready_queue.append(proc)

    def watchdog(self, tick: int):
        """
        Monitors running cores.
        If a core reaches critical temperature (>= 90 °C), it is throttled into LOCKED_COOLING.
        The running task is suspended back to the head of the ready queue.
        """
        for core in self.cores:
            if core.current_process is not None and core.is_overheated():
                proc = core.detach_process()
                core.lock_cooling()
                self.ready_queue.appendleft(proc)  # Re-queue task at head
                self.throttle_events_count += 1

    def dispatch(self, tick: int):
        """Dispatches ready queue processes to available cores in FIFO order."""
        idle_cores = [c for c in self.cores if c.is_available()]
        for core in idle_cores:
            if self.ready_queue:
                proc = self.ready_queue.popleft()
                if proc.start_time is None:
                    proc.start_time = tick
                core.assign_process(proc)

    def has_pending_work(self) -> bool:
        if any(c.current_process is not None for c in self.cores):
            return True
        return len(self.ready_queue) > 0


class RoundRobinScheduler(BaseScheduler):
    """
    Round-Robin (RR) Baseline Scheduler.
    Single queue, time-slice preemptive (quantum = 4 ticks by default), type-blind core routing.
    """

    def __init__(self, cores: List[Core], config: SimulationConfig):
        super().__init__(cores, config)
        self.ready_queue: deque[Process] = deque()
        self.quantum = config.rr_quantum_ticks

    def admit_arrivals(self, tick: int, arrivals: List[Process]):
        """Appends all incoming processes into the round-robin ready queue."""
        for proc in arrivals:
            self.ready_queue.append(proc)

    def watchdog(self, tick: int):
        """
        Monitors running cores.
        If a core hits critical temp (>= 90 °C), throttles core and re-queues process.
        Also handles time-slice quantum expiration.
        """
        for core in self.cores:
            if core.current_process is not None:
                # 1. Thermal watchdog check
                if core.is_overheated():
                    proc = core.detach_process()
                    core.lock_cooling()
                    self.ready_queue.append(proc)
                    self.throttle_events_count += 1
                # 2. Time quantum expiration check
                elif core.time_slice_remaining <= 0 and not core.current_process.is_completed():
                    proc = core.detach_process()
                    self.ready_queue.append(proc)

    def dispatch(self, tick: int):
        """Dispatches ready queue processes with a full time quantum."""
        idle_cores = [c for c in self.cores if c.is_available()]
        for core in idle_cores:
            if self.ready_queue:
                proc = self.ready_queue.popleft()
                if proc.start_time is None:
                    proc.start_time = tick
                core.assign_process(proc, time_slice=self.quantum)

    def has_pending_work(self) -> bool:
        if any(c.current_process is not None for c in self.cores):
            return True
        return len(self.ready_queue) > 0
