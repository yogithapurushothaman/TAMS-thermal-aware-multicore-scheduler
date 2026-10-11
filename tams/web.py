"""
Flask Web Dashboard for T.A.M.S.
Serves interactive visualization, parameter tuning, live simulation player, and metrics benchmark on localhost.
"""

from flask import Flask, render_template, request, jsonify
from tams.config import SimulationConfig
from tams.process import Process, ProcessType, WorkloadGenerator
from tams.scheduler import TAMSScheduler
from tams.baselines import FCFSScheduler, RoundRobinScheduler
from tams.simulator import SimulationEngine
from tams.metrics import MetricsEngine

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/simulate", methods=["POST"])
def simulate():
    data = request.json or {}
    
    num_p = int(data.get("num_p_cores", 2))
    num_e = int(data.get("num_e_cores", 4))
    p_heat = float(data.get("p_heat_rate", 5.0))
    e_heat = float(data.get("e_heat_rate", 1.0))
    crit_temp = float(data.get("critical_temp", 90.0))
    rec_temp = float(data.get("recovery_temp", 60.0))
    mig_penalty = int(data.get("migration_penalty_ticks", 2))
    
    scenario = data.get("scenario", "DEMO")
    process_count = int(data.get("count", 20))
    fg_ratio = float(data.get("fg_ratio", 0.6))
    seed = int(data.get("seed", 42))

    config = SimulationConfig(
        num_p_cores=num_p,
        num_e_cores=num_e,
        p_heat_rate=p_heat,
        e_heat_rate=e_heat,
        critical_temp=crit_temp,
        recovery_temp=rec_temp,
        migration_penalty_ticks=mig_penalty,
        random_seed=seed
    )

    if scenario in ["T-1", "T-2", "T-3", "T-4", "DEMO"]:
        workload = WorkloadGenerator.get_test_scenario(scenario)
    else:
        workload = WorkloadGenerator.generate_random(
            count=process_count, fg_ratio=fg_ratio, seed=seed
        )

    engine = SimulationEngine(config)

    tams_res = engine.run(TAMSScheduler, workload, "T.A.M.S.")
    fcfs_res = engine.run(FCFSScheduler, workload, "FCFS")
    rr_res = engine.run(RoundRobinScheduler, workload, "Round Robin")

    m_tams = MetricsEngine.compute(tams_res)
    m_fcfs = MetricsEngine.compute(fcfs_res)
    m_rr = MetricsEngine.compute(rr_res)

    response_data = {
        "metrics": {
            "tams": {
                "avg_waiting": round(m_tams.avg_waiting_time, 2),
                "avg_turnaround": round(m_tams.avg_turnaround_time, 2),
                "max_temp": round(m_tams.max_temperature, 1),
                "total_energy": round(m_tams.total_energy, 1),
                "migrations": m_tams.thermal_migrations,
                "throttles": m_tams.throttle_events,
                "time_above_90": m_tams.time_above_threshold,
                "total_ticks": m_tams.total_ticks
            },
            "fcfs": {
                "avg_waiting": round(m_fcfs.avg_waiting_time, 2),
                "avg_turnaround": round(m_fcfs.avg_turnaround_time, 2),
                "max_temp": round(m_fcfs.max_temperature, 1),
                "total_energy": round(m_fcfs.total_energy, 1),
                "migrations": m_fcfs.thermal_migrations,
                "throttles": m_fcfs.throttle_events,
                "time_above_90": m_fcfs.time_above_threshold,
                "total_ticks": m_fcfs.total_ticks
            },
            "rr": {
                "avg_waiting": round(m_rr.avg_waiting_time, 2),
                "avg_turnaround": round(m_rr.avg_turnaround_time, 2),
                "max_temp": round(m_rr.max_temperature, 1),
                "total_energy": round(m_rr.total_energy, 1),
                "migrations": m_rr.thermal_migrations,
                "throttles": m_rr.throttle_events,
                "time_above_90": m_rr.time_above_threshold,
                "total_ticks": m_rr.total_ticks
            }
        },
        "workload_info": {
            "total_processes": len(workload),
            "fg_processes": sum(1 for p in workload if p.type == ProcessType.FOREGROUND),
            "bg_processes": sum(1 for p in workload if p.type == ProcessType.BACKGROUND),
            "seed": seed
        },
        "traces": {
            "tams": tams_res.trace,
            "fcfs": fcfs_res.trace,
            "rr": rr_res.trace
        }
    }

    return jsonify(response_data)

def start_server(host: str = "127.0.0.1", port: int = 5000):
    print(f"Starting T.A.M.S. Local Server at http://{host}:{port}")
    app.run(host=host, port=port, debug=False)

if __name__ == "__main__":
    start_server()
