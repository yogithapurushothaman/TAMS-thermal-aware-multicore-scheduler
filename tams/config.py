"""
Configuration parameters and default settings for T.A.M.S.
"""

from dataclasses import dataclass

@dataclass
class SimulationConfig:
    """System-wide parameters for hardware, thermals, and scheduling rules."""
    
    # Core Layout
    num_p_cores: int = 2
    num_e_cores: int = 4
    
    # Core Speeds (work units per active tick)
    p_speed: int = 2
    e_speed: int = 1
    
    # Thermal Properties (°C per active tick / idle tick)
    p_heat_rate: float = 5.0
    e_heat_rate: float = 1.0
    idle_cooling_rate: float = 2.0
    baseline_temp: float = 30.0
    critical_temp: float = 90.0
    recovery_temp: float = 60.0
    
    # Energy Units (per active tick)
    p_energy_rate: float = 5.0
    e_energy_rate: float = 1.0
    idle_energy_rate: float = 0.0
    
    # Scheduling Overhead & Constants
    migration_penalty_ticks: int = 2
    rr_quantum_ticks: int = 4
    random_seed: int = 42

    def total_cores(self) -> int:
        return self.num_p_cores + self.num_e_cores
