"""
Command-Line Interface (CLI) for T.A.M.S. Simulator and Benchmark Suite.
"""

import sys
import os
import argparse
from typing import List

# Ensure parent directory is in sys.path when run directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from tams.config import SimulationConfig
from tams.process import Process, ProcessType, WorkloadGenerator
from tams.scheduler import TAMSScheduler
from tams.baselines import FCFSScheduler, RoundRobinScheduler
from tams.simulator import SimulationEngine, SimulationResult
from tams.metrics import MetricsEngine

def print_trace(result: SimulationResult):
    """Prints a detailed per-tick execution trace."""
    print(f"\n=================== PER-TICK TRACE ({result.scheduler_name}) ===================")
    for snap in result.trace:
        t = snap['tick']
        temps = " | ".join(f"{cid}:{temp:.1f}°C({snap['core_states'][cid]})" for cid, temp in snap['core_temps'].items())
        pids = " | ".join(f"{cid}:P{pid}" if pid is not None else f"{cid}:--" for cid, pid in snap['core_pids'].items())
        print(f"Tick {t:03d} | Temps: {temps}")
        print(f"         | Pids : {pids}")
    print("========================================================================\n")


def run_comparison(workload: List[Process], config: SimulationConfig, seed: int = 42, show_gantt: bool = False, show_trace: bool = False, csv_out: str = None, chart_out: str = None):
    engine = SimulationEngine(config)

    tams_res = engine.run(TAMSScheduler, workload, "T.A.M.S.")
    fcfs_res = engine.run(FCFSScheduler, workload, "FCFS")
    rr_res = engine.run(RoundRobinScheduler, workload, "Round Robin")

    if show_trace:
        print_trace(tams_res)

    # Print Comparative Report
    report = MetricsEngine.format_comparative_report(tams_res, fcfs_res, rr_res, workload, seed=seed)
    print("\n" + report + "\n")

    if show_gantt:
        print(MetricsEngine.generate_gantt_text(tams_res))
        print("\n")

    if csv_out:
        MetricsEngine.export_csv(tams_res, csv_out)
        print(f"Exported T.A.M.S. temperature timeline to {csv_out}")

    if chart_out:
        results = {
            "T.A.M.S.": tams_res,
            "FCFS": fcfs_res,
            "Round Robin": rr_res
        }
        MetricsEngine.render_chart(results, chart_out)
        print(f"Rendered temperature chart to {chart_out}")

    return tams_res, fcfs_res, rr_res


def main():
    parser = argparse.ArgumentParser(description="T.A.M.S. Thermal-Aware Multicore Scheduler Simulation")
    parser.add_argument("--server", action="store_true", help="Launch interactive web dashboard on http://localhost:5000")
    parser.add_argument("--demo", action="store_true", help="Run full comparative demo with 20 processes (12 FG / 8 BG)")
    parser.add_argument("--workload", type=str, help="Path to JSON or CSV workload file")
    parser.add_argument("--random", action="store_true", help="Generate a random workload")
    parser.add_argument("--count", type=int, default=20, help="Number of processes for random workload")
    parser.add_argument("--fg-ratio", type=float, default=0.6, help="Ratio of Foreground processes (0.0 - 1.0)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--trace", action="store_true", help="Print per-tick trace")
    parser.add_argument("--gantt", action="store_true", help="Print ASCII Gantt timeline per core")
    parser.add_argument("--csv", type=str, help="CSV output path for temperature timeline")
    parser.add_argument("--chart", type=str, help="Image output path for temperature timeline plot")
    
    args = parser.parse_args()

    if args.server:
        from tams.web import start_server
        start_server(host="127.0.0.1", port=5000)
        return

    config = SimulationConfig(random_seed=args.seed)

    if args.demo or len(sys.argv) == 1:
        print("Running T.A.M.S. Demo Scenario...")
        workload = WorkloadGenerator.get_test_scenario("DEMO")
        csv_file = args.csv if args.csv else "tams_temperature_timeline.csv"
        chart_file = args.chart if args.chart else "tams_temperature_plot.png"
        run_comparison(workload, config, seed=42, show_gantt=True, show_trace=args.trace, csv_out=csv_file, chart_out=chart_file)

    elif args.workload:
        if args.workload.endswith(".json"):
            workload = WorkloadGenerator.load_from_json(args.workload)
        elif args.workload.endswith(".csv"):
            workload = WorkloadGenerator.load_from_csv(args.workload)
        else:
            print("Error: Workload file must be .json or .csv")
            sys.exit(1)
        run_comparison(workload, config, seed=args.seed, show_gantt=args.gantt, show_trace=args.trace, csv_out=args.csv, chart_out=args.chart)

    elif args.random:
        workload = WorkloadGenerator.generate_random(
            count=args.count, fg_ratio=args.fg_ratio, seed=args.seed
        )
        run_comparison(workload, config, seed=args.seed, show_gantt=args.gantt, show_trace=args.trace, csv_out=args.csv, chart_out=args.chart)


if __name__ == "__main__":
    main()
