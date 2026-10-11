"""
Unit tests for Core class and thermal physics.
"""

import unittest
from tams.config import SimulationConfig
from tams.core import Core, CoreType, CoreState
from tams.process import Process, ProcessType

class TestCoreThermals(unittest.TestCase):

    def setUp(self):
        self.config = SimulationConfig()
        self.p_core = Core("P0", CoreType.P_CORE, self.config)
        self.e_core = Core("E0", CoreType.E_CORE, self.config)

    def test_initial_state(self):
        self.assertEqual(self.p_core.temperature, 30.0)
        self.assertEqual(self.p_core.state, CoreState.IDLE)
        self.assertTrue(self.p_core.is_available())
        self.assertFalse(self.p_core.is_overheated())

    def test_active_heating(self):
        proc = Process(1, 0, 10, ProcessType.FOREGROUND)
        self.p_core.assign_process(proc)
        self.assertEqual(self.p_core.state, CoreState.RUNNING)
        
        # Tick 1: P-core heat rate is +5.0°C per tick, speed 2x
        energy = self.p_core.tick_active()
        self.assertEqual(self.p_core.temperature, 35.0)
        self.assertEqual(proc.remaining_work, 8)
        self.assertEqual(energy, 5.0)

    def test_idle_cooling(self):
        self.p_core.temperature = 50.0
        # Cooling rate is -2.0°C per tick
        self.p_core.tick_idle()
        self.assertEqual(self.p_core.temperature, 48.0)

    def test_idle_cooling_floor(self):
        self.p_core.temperature = 31.0
        self.p_core.tick_idle()
        self.assertEqual(self.p_core.temperature, 30.0)
        
        # Should not drop below baseline 30.0°C
        self.p_core.tick_idle()
        self.assertEqual(self.p_core.temperature, 30.0)

    def test_locked_cooling_recovery(self):
        self.p_core.temperature = 90.0
        self.p_core.lock_cooling()
        self.assertEqual(self.p_core.state, CoreState.LOCKED_COOLING)
        self.assertFalse(self.p_core.is_available())

        # Cool down until recovery threshold 60°C is reached
        # (90 - 60) / 2 = 15 ticks
        for _ in range(14):
            self.p_core.tick_idle()
            self.assertEqual(self.p_core.state, CoreState.LOCKED_COOLING)

        self.p_core.tick_idle() # 15th tick: temp reaches 60.0°C
        self.assertEqual(self.p_core.temperature, 60.0)
        self.assertEqual(self.p_core.state, CoreState.IDLE)
        self.assertTrue(self.p_core.is_available())

if __name__ == "__main__":
    unittest.main()
