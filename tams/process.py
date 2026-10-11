"""
Process Control Block (PCB) definition and Workload Generator module.
"""

from enum import Enum
from typing import List, Optional, Dict, Any
import copy
import json
import csv
import random

class ProcessType(Enum):
    FOREGROUND = "FOREGROUND"
    BACKGROUND = "BACKGROUND"

class Process:
    """Process Control Block (PCB) tracking process execution state and metrics."""
    
    def __init__(
        self,
        pid: int,
        arrival_time: int,
        burst_time: int,
        process_type: ProcessType,
        remaining_work: Optional[int] = None
    ):
        self.pid = pid
        self.arrival_time = arrival_time
        self.burst_time = burst_time
        self.remaining_work = remaining_work if remaining_work is not None else burst_time
        self.type = process_type
        
        # Timing & Metrics fields
        self.start_time: Optional[int] = None
        self.finish_time: Optional[int] = None
        self.migrations: int = 0
        self.exec_ticks: int = 0
        self.penalty_ticks: int = 0
        self.penalty_remaining: int = 0
        self.is_migrated: bool = False

    def is_completed(self) -> bool:
        """Returns True if all work units for this process have been executed."""
        return self.remaining_work <= 0

    @property
    def turnaround_time(self) -> Optional[int]:
        """Calculates turnaround time: finish_time - arrival_time."""
        if self.finish_time is None:
            return None
        return self.finish_time - self.arrival_time

    @property
    def waiting_time(self) -> Optional[int]:
        """
        Calculates waiting time in ready queues:
        turnaround_time - exec_ticks - penalty_ticks.
        """
        if self.finish_time is None or self.turnaround_time is None:
            return None
        return self.turnaround_time - self.exec_ticks - self.penalty_ticks

    def clone(self) -> "Process":
        """Creates a fresh copy of the PCB for baseline comparison runs."""
        p = Process(
            pid=self.pid,
            arrival_time=self.arrival_time,
            burst_time=self.burst_time,
            process_type=self.type,
            remaining_work=self.burst_time
        )
        return p

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pid": self.pid,
            "arrival_time": self.arrival_time,
            "burst_time": self.burst_time,
            "remaining_work": self.remaining_work,
            "type": self.type.value,
            "start_time": self.start_time,
            "finish_time": self.finish_time,
            "migrations": self.migrations,
            "exec_ticks": self.exec_ticks,
            "penalty_ticks": self.penalty_ticks,
            "turnaround_time": self.turnaround_time,
            "waiting_time": self.waiting_time
        }

    def __repr__(self):
        return f"Process(PID={self.pid}, Type={self.type.value}, Arrival={self.arrival_time}, Burst={self.burst_time}, Rem={self.remaining_work})"


class WorkloadGenerator:
    """Generates workload streams from synthetic distributions, files, or predefined test scenarios."""

    @staticmethod
    def generate_random(
        count: int = 20,
        min_burst: int = 10,
        max_burst: int = 50,
        fg_ratio: float = 0.6,
        max_arrival: int = 15,
        seed: int = 42
    ) -> List[Process]:
        """Generates a reproducible list of Process objects using a random seed."""
        rng = random.Random(seed)
        processes = []
        
        for i in range(1, count + 1):
            arrival = rng.randint(0, max_arrival)
            burst = rng.randint(min_burst, max_burst)
            is_fg = rng.random() < fg_ratio
            p_type = ProcessType.FOREGROUND if is_fg else ProcessType.BACKGROUND
            processes.append(Process(pid=i, arrival_time=arrival, burst_time=burst, process_type=p_type))
            
        # Sort processes by arrival time
        processes.sort(key=lambda p: p.arrival_time)
        return processes

    @staticmethod
    def load_from_json(filepath: str) -> List[Process]:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        processes = []
        for item in data:
            p_type = ProcessType.FOREGROUND if item["type"].upper() == "FOREGROUND" else ProcessType.BACKGROUND
            processes.append(Process(
                pid=item["pid"],
                arrival_time=item["arrival_time"],
                burst_time=item["burst_time"],
                process_type=p_type
            ))
        processes.sort(key=lambda p: p.arrival_time)
        return processes

    @staticmethod
    def save_to_json(processes: List[Process], filepath: str):
        data = [p.to_dict() for p in processes]
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    @staticmethod
    def load_from_csv(filepath: str) -> List[Process]:
        processes = []
        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                p_type = ProcessType.FOREGROUND if row["type"].strip().upper() == "FOREGROUND" else ProcessType.BACKGROUND
                processes.append(Process(
                    pid=int(row["pid"]),
                    arrival_time=int(row["arrival_time"]),
                    burst_time=int(row["burst_time"]),
                    process_type=p_type
                ))
        processes.sort(key=lambda p: p.arrival_time)
        return processes

    @staticmethod
    def save_to_csv(processes: List[Process], filepath: str):
        fieldnames = ["pid", "arrival_time", "burst_time", "type"]
        with open(filepath, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for p in processes:
                writer.writerow({
                    "pid": p.pid,
                    "arrival_time": p.arrival_time,
                    "burst_time": p.burst_time,
                    "type": p.type.value
                })

    @staticmethod
    def get_test_scenario(scenario_id: str) -> List[Process]:
        """Predefined test workloads matching Section 12 test scenarios."""
        sid = scenario_id.upper()
        if sid == "T-1":
            # Single Foreground process with short burst
            return [Process(pid=1, arrival_time=0, burst_time=4, process_type=ProcessType.FOREGROUND)]
        elif sid == "T-2":
            # Single long Foreground process (triggers thermal migration)
            return [Process(pid=1, arrival_time=0, burst_time=40, process_type=ProcessType.FOREGROUND)]
        elif sid == "T-3":
            # Background-only workload
            return [
                Process(pid=1, arrival_time=0, burst_time=10, process_type=ProcessType.BACKGROUND),
                Process(pid=2, arrival_time=1, burst_time=12, process_type=ProcessType.BACKGROUND),
                Process(pid=3, arrival_time=2, burst_time=8, process_type=ProcessType.BACKGROUND),
            ]
        elif sid == "T-4":
            # Mixed workload, more Foreground processes than P-cores
            return [
                Process(pid=1, arrival_time=0, burst_time=25, process_type=ProcessType.FOREGROUND),
                Process(pid=2, arrival_time=0, burst_time=25, process_type=ProcessType.FOREGROUND),
                Process(pid=3, arrival_time=1, burst_time=20, process_type=ProcessType.FOREGROUND),
                Process(pid=4, arrival_time=2, burst_time=20, process_type=ProcessType.FOREGROUND),
                Process(pid=5, arrival_time=0, burst_time=15, process_type=ProcessType.BACKGROUND),
                Process(pid=6, arrival_time=1, burst_time=15, process_type=ProcessType.BACKGROUND),
            ]
        elif sid == "DEMO":
            # 20 processes (12 FG / 8 BG), seed 42
            return WorkloadGenerator.generate_random(
                count=20, min_burst=15, max_burst=45, fg_ratio=0.6, max_arrival=10, seed=42
            )
        else:
            raise ValueError(f"Unknown test scenario ID: {scenario_id}")
