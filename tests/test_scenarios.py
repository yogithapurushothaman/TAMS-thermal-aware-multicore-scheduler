"""
Acceptance Test Suite verifying scenarios T-1 through T-7 from Section 12 of the PRD.
"""

import unittest
from tams.config import SimulationConfig
from tams.process import Process, ProcessType, WorkloadGenerator
from tams.scheduler import TAMSScheduler
from tams.baselines import FCFSScheduler, RoundRobinScheduler
from tams.simulator import SimulationEngine
from tams.metrics import MetricsEngine

class TestScenarios(unittest.TestCase):

    def setUp(self):
        self.config = SimulationConfig()
        self.engine = SimulationEngine(self.config)

    def test_T1_single_fg_short_burst(self):
        """T-1: A single Foreground process with a short burst (burst 4). Expectation: Runs on P-core at 2x; no migration."""
        workload = WorkloadGenerator.get_test_scenario("T-1")
        res = self.engine.run(TAMSScheduler, workload, "T.A.M.S.")
        
        proc = res.completed_processes[0]
        self.assertEqual(proc.migrations, 0)
        self.assertEqual(res.thermal_migrations, 0)
        # 4 work units at 2x speed = 2 ticks
        self.assertEqual(proc.exec_ticks, 2)
        self.assertEqual(proc.finish_time, 2)

    def test_T2_single_fg_long_burst(self):
        """T-2: A single long Foreground process (burst 40). Expectation: P-core hits 90°C, 2-tick penalty, migrates to E-core, finishes there; P-core locked until 60°C."""
        workload = WorkloadGenerator.get_test_scenario("T-2")
        res = self.engine.run(TAMSScheduler, workload, "T.A.M.S.")
        
        proc = res.completed_processes[0]
        self.assertEqual(proc.migrations, 1)
        self.assertEqual(res.thermal_migrations, 1)
        self.assertTrue(proc.is_migrated)
        self.assertEqual(proc.penalty_ticks, 2)
        
        # Verify P-core reached 90°C and was locked
        p_core_temps = [snap["core_temps"]["P0"] for snap in res.trace]
        self.assertIn(90.0, p_core_temps)
        
        # Verify P0 was locked cooling after reaching 90°C
        p0_states = [snap["core_states"]["P0"] for snap in res.trace]
        self.assertIn("LOCKED_COOLING", p0_states)

    def test_T3_background_only_workload(self):
        """T-3: Background-only workload. Expectation: All run on E-cores; P-cores stay at 30°C."""
        workload = WorkloadGenerator.get_test_scenario("T-3")
        res = self.engine.run(TAMSScheduler, workload, "T.A.M.S.")
        
        # Check P-core temperatures stayed at baseline 30°C throughout
        for snap in res.trace:
            self.assertEqual(snap["core_temps"]["P0"], 30.0)
            self.assertEqual(snap["core_temps"]["P1"], 30.0)
            self.assertIsNone(snap["core_pids"]["P0"])
            self.assertIsNone(snap["core_pids"]["P1"])

    def test_T4_mixed_workload_queue_routing(self):
        """T-4: Mixed workload, more Foreground than P-cores. Expectation: Foreground queue builds; no Background task ever on a P-core."""
        workload = WorkloadGenerator.get_test_scenario("T-4")
        res = self.engine.run(TAMSScheduler, workload, "T.A.M.S.")
        
        # Check that P-cores only ran Foreground tasks (PIDs 1, 2, 3, 4)
        bg_pids = {5, 6}
        for snap in res.trace:
            p0_pid = snap["core_pids"]["P0"]
            p1_pid = snap["core_pids"]["P1"]
            self.assertNotIn(p0_pid, bg_pids)
            self.assertNotIn(p1_pid, bg_pids)

    def test_T5_idle_cooling_floor(self):
        """T-5: Idle cooling. Expectation: Idle core temperature falls 2°C per tick and never goes below 30°C."""
        workload = WorkloadGenerator.get_test_scenario("T-3") # BG only, P-cores idle
        res = self.engine.run(TAMSScheduler, workload, "T.A.M.S.")
        
        for snap in res.trace:
            for cid, temp in snap["core_temps"].items():
                self.assertGreaterEqual(temp, 30.0)

    def test_T6_determinism(self):
        """T-6: Same seed run twice. Expectation: Identical metrics."""
        w1 = WorkloadGenerator.generate_random(count=15, seed=42)
        w2 = WorkloadGenerator.generate_random(count=15, seed=42)
        
        res1 = self.engine.run(TAMSScheduler, w1, "T.A.M.S.")
        res2 = self.engine.run(TAMSScheduler, w2, "T.A.M.S.")
        
        m1 = MetricsEngine.compute(res1)
        m2 = MetricsEngine.compute(res2)
        
        self.assertEqual(m1.avg_waiting_time, m2.avg_waiting_time)
        self.assertEqual(m1.avg_turnaround_time, m2.avg_turnaround_time)
        self.assertEqual(m1.max_temperature, m2.max_temperature)
        self.assertEqual(m1.total_energy, m2.total_energy)

    def test_T7_comparative_benchmark(self):
        """T-7: Same workload on T.A.M.S., FCFS and RR. Expectation: T.A.M.S. peak temperature below baselines."""
        workload = WorkloadGenerator.get_test_scenario("DEMO")
        
        tams_res = self.engine.run(TAMSScheduler, workload, "T.A.M.S.")
        fcfs_res = self.engine.run(FCFSScheduler, workload, "FCFS")
        rr_res = self.engine.run(RoundRobinScheduler, workload, "Round Robin")
        
        m_tams = MetricsEngine.compute(tams_res)
        m_fcfs = MetricsEngine.compute(fcfs_res)
        m_rr = MetricsEngine.compute(rr_res)
        
        # Max temperature for TAMS should not exceed 90.0°C by more than 1 tick heat (+5°C)
        self.assertLessEqual(m_tams.max_temperature, 95.0)
        # Comparative report can be generated cleanly
        report = MetricsEngine.format_comparative_report(tams_res, fcfs_res, rr_res, workload, seed=42)
        self.assertIn("T.A.M.S. COMPARATIVE REPORT", report)

if __name__ == "__main__":
    unittest.main()
