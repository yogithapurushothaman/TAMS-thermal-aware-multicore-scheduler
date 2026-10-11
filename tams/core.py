"""
Hardware Simulator: Core abstraction, state machine, and thermal physics modeling.
"""

from enum import Enum
from typing import Optional, Any
from tams.config import SimulationConfig

class CoreType(Enum):
    P_CORE = "P-Core"
    E_CORE = "E-Core"

class CoreState(Enum):
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    LOCKED_COOLING = "LOCKED_COOLING"
    SWITCHING = "SWITCHING"

class Core:
    """Models an individual CPU core with thermal physics and state tracking."""
    
    def __init__(self, core_id: str, core_type: CoreType, config: SimulationConfig):
        self.id = core_id
        self.type = core_type
        
        if core_type == CoreType.P_CORE:
            self.speed_multiplier = config.p_speed
            self.heat_rate = config.p_heat_rate
            self.energy_rate = config.p_energy_rate
        else:
            self.speed_multiplier = config.e_speed
            self.heat_rate = config.e_heat_rate
            self.energy_rate = config.e_energy_rate
            
        self.idle_cooling_rate = config.idle_cooling_rate
        self.baseline_temp = config.baseline_temp
        self.critical_temp = config.critical_temp
        self.recovery_temp = config.recovery_temp
        
        self.temperature = config.baseline_temp
        self.state = CoreState.IDLE
        self.current_process: Optional[Any] = None
        self.switch_ticks_remaining: int = 0
        self.time_slice_remaining: int = 0

    def is_available(self) -> bool:
        """Returns True if the core is free to accept a new process."""
        return self.state == CoreState.IDLE and self.current_process is None

    def is_overheated(self) -> bool:
        """Returns True if core temperature has reached or exceeded the critical threshold."""
        return self.temperature >= self.critical_temp

    def assign_process(self, process: Any, time_slice: int = 0):
        """Binds a process to this core and sets state to RUNNING."""
        self.current_process = process
        self.state = CoreState.RUNNING
        self.time_slice_remaining = time_slice

    def detach_process(self) -> Optional[Any]:
        """Detaches the currently running process and sets state to IDLE if not locked."""
        proc = self.current_process
        self.current_process = None
        if self.state == CoreState.RUNNING:
            self.state = CoreState.IDLE
        return proc

    def lock_cooling(self):
        """Forces the core into LOCKED_COOLING state due to thermal threshold breach."""
        self.current_process = None
        self.state = CoreState.LOCKED_COOLING

    def tick_active(self) -> float:
        """
        Simulates one active execution tick.
        Advances current process, updates core temperature, and returns energy consumed.
        """
        if self.current_process is not None:
            self.current_process.exec_ticks += 1
            self.current_process.remaining_work -= self.speed_multiplier
            if self.time_slice_remaining > 0:
                self.time_slice_remaining -= 1
                
        self.temperature += self.heat_rate
        return self.energy_rate

    def tick_idle(self) -> float:
        """
        Simulates one idle/cooling tick.
        Cools temperature down to baseline floor and handles recovery transition.
        """
        self.temperature = max(self.baseline_temp, self.temperature - self.idle_cooling_rate)
        
        if self.state == CoreState.LOCKED_COOLING:
            if self.temperature <= self.recovery_temp:
                self.state = CoreState.IDLE
                
        return 0.0  # Idle energy consumption

    def reset(self):
        """Resets core to default state and baseline temperature."""
        self.temperature = self.baseline_temp
        self.state = CoreState.IDLE
        self.current_process = None
        self.switch_ticks_remaining = 0
        self.time_slice_remaining = 0

    def __repr__(self):
        proc_str = f"PID:{self.current_process.pid}" if self.current_process else "None"
        return f"Core({self.id}, {self.type.value}, {self.temperature:.1f}°C, {self.state.value}, {proc_str})"
