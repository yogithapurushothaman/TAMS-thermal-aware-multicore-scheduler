"""
Metrics Engine: Metrics calculation, comparative reporting, CSV export, Gantt text chart, and plot generation.
"""

from typing import List, Dict, Any, Optional
import csv
from tams.simulator import SimulationResult
from tams.process import Process, ProcessType

class MetricsSummary:
    """Encapsulates calculated evaluation metrics for a single simulation run."""

    def __init__(self, result: SimulationResult):
        self.scheduler_name = result.scheduler_name
        self.total_processes = len(result.completed_processes)
        
        # Calculate Average Waiting & Turnaround times
        if self.total_processes > 0:
            self.avg_waiting_time = sum(p.waiting_time for p in result.completed_processes if p.waiting_time is not None) / self.total_processes
            self.avg_turnaround_time = sum(p.turnaround_time for p in result.completed_processes if p.turnaround_time is not None) / self.total_processes
        else:
            self.avg_waiting_time = 0.0
            self.avg_turnaround_time = 0.0
            
        # Temperatures
        self.max_temperature = 0.0
        self.max_p_temp = 0.0
        self.max_e_temp = 0.0
        self.time_above_threshold = 0
        
        for snap in result.trace:
            for core_id, temp in snap["core_temps"].items():
                if temp > self.max_temperature:
                    self.max_temperature = temp
                if core_id.startswith("P") and temp > self.max_p_temp:
                    self.max_p_temp = temp
                elif core_id.startswith("E") and temp > self.max_e_temp:
                    self.max_e_temp = temp
                if temp >= result.config.critical_temp:
                    self.time_above_threshold += 1

        self.total_energy = result.total_energy
        self.thermal_migrations = result.thermal_migrations
        self.throttle_events = result.throttle_events
        self.total_ticks = result.total_ticks


class MetricsEngine:
    """Computes summary statistics and formats output reports and visualizations."""

    @staticmethod
    def compute(result: SimulationResult) -> MetricsSummary:
        return MetricsSummary(result)

    @staticmethod
    def format_comparative_report(
        tams_res: SimulationResult,
        fcfs_res: SimulationResult,
        rr_res: SimulationResult,
        workload: List[Process],
        seed: Optional[int] = 42
    ) -> str:
        m_tams = MetricsEngine.compute(tams_res)
        m_fcfs = MetricsEngine.compute(fcfs_res)
        m_rr = MetricsEngine.compute(rr_res)

        fg_count = sum(1 for p in workload if p.type == ProcessType.FOREGROUND)
        bg_count = sum(1 for p in workload if p.type == ProcessType.BACKGROUND)
        total_count = len(workload)

        lines = []
        lines.append("=============== T.A.M.S. COMPARATIVE REPORT ===============")
        lines.append(f"Workload: {total_count} processes ({fg_count} FG / {bg_count} BG), seed = {seed if seed else 'N/A'}")
        lines.append("")
        lines.append(f"{'Metric':<30} {'T.A.M.S.':<12} {'FCFS':<12} {'Round Robin':<12}")
        lines.append("-" * 66)
        lines.append(f"{'Avg Waiting Time (ticks)':<30} {m_tams.avg_waiting_time:<12.2f} {m_fcfs.avg_waiting_time:<12.2f} {m_rr.avg_waiting_time:<12.2f}")
        lines.append(f"{'Avg Turnaround (ticks)':<30} {m_tams.avg_turnaround_time:<12.2f} {m_fcfs.avg_turnaround_time:<12.2f} {m_rr.avg_turnaround_time:<12.2f}")
        lines.append(f"{'Max Temperature (°C)':<30} {m_tams.max_temperature:<12.1f} {m_fcfs.max_temperature:<12.1f} {m_rr.max_temperature:<12.1f}")
        lines.append(f"{'Total Energy Units':<30} {m_tams.total_energy:<12.1f} {m_fcfs.total_energy:<12.1f} {m_rr.total_energy:<12.1f}")
        lines.append(f"{'Thermal Migrations':<30} {m_tams.thermal_migrations:<12} {m_fcfs.thermal_migrations:<12} {m_rr.thermal_migrations:<12}")
        lines.append(f"{'Throttle Events':<30} {m_tams.throttle_events:<12} {m_fcfs.throttle_events:<12} {m_rr.throttle_events:<12}")
        lines.append(f"{'Time Above 90°C (ticks)':<30} {m_tams.time_above_threshold:<12} {m_fcfs.time_above_threshold:<12} {m_rr.time_above_threshold:<12}")
        lines.append("=" * 66)

        return "\n".join(lines)

    @staticmethod
    def export_csv(result: SimulationResult, filepath: str):
        """Exports the temperature timeline of all cores over ticks to a CSV file."""
        if not result.trace:
            return

        core_ids = list(result.trace[0]["core_temps"].keys())
        fieldnames = ["tick"] + [f"{cid}_temp" for cid in core_ids] + [f"{cid}_state" for cid in core_ids] + [f"{cid}_pid" for cid in core_ids]

        with open(filepath, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            for snap in result.trace:
                row = {"tick": snap["tick"]}
                for cid in core_ids:
                    row[f"{cid}_temp"] = f"{snap['core_temps'][cid]:.1f}"
                    row[f"{cid}_state"] = snap['core_states'][cid]
                    row[f"{cid}_pid"] = snap['core_pids'][cid] if snap['core_pids'][cid] is not None else ""
                writer.writerow(row)

    @staticmethod
    def generate_gantt_text(result: SimulationResult, max_ticks: int = 60) -> str:
        """Generates an ASCII text Gantt chart showing process assignments per core over time."""
        if not result.trace:
            return "No simulation trace available."

        core_ids = list(result.trace[0]["core_temps"].keys())
        ticks_to_show = min(len(result.trace), max_ticks)

        lines = []
        lines.append(f"--- Gantt Timeline per Core ({result.scheduler_name}, first {ticks_to_show} ticks) ---")
        
        for cid in core_ids:
            row_str = f"{cid:<4} |"
            for t in range(ticks_to_show):
                pid = result.trace[t]["core_pids"][cid]
                state = result.trace[t]["core_states"][cid]
                if pid is not None:
                    row_str += f" P{pid:02d} |"
                elif state == "LOCKED_COOLING":
                    row_str += " COOL |"
                else:
                    row_str += "  --  |"
            lines.append(row_str)
            
        return "\n".join(lines)

    @staticmethod
    def render_chart(results: Dict[str, SimulationResult], output_path: str):
        """Renders comparative temperature timeline chart using matplotlib if available."""
        try:
            import matplotlib.pyplot as plt
        except ImportError:
            print("matplotlib not available. Skipping chart generation.")
            return

        fig, ax = plt.subplots(figsize=(10, 6))

        for name, res in results.items():
            ticks = [snap["tick"] for snap in res.trace]
            # Max core temp across all cores at each tick
            max_temps = [max(snap["core_temps"].values()) for snap in res.trace]
            ax.plot(ticks, max_temps, label=f"{name} Max Core Temp")

        ax.axhline(y=90, color="r", linestyle="--", label="Critical Threshold (90°C)")
        ax.axhline(y=60, color="g", linestyle=":", label="Recovery Threshold (60°C)")
        ax.set_xlabel("Ticks")
        ax.set_ylabel("Temperature (°C)")
        ax.set_title("T.A.M.S. vs Baselines: Core Temperature Over Time")
        ax.legend()
        ax.grid(True)

        fig.tight_layout()
        fig.savefig(output_path)
        plt.close(fig)
