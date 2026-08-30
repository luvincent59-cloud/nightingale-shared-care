import unittest
from backend.core import redact_phi

class TestPhiRedaction(unittest.TestCase):
 def test_phi_removed_before_llm_boundary(self):
    clean=redact_phi("Name: Synthetic Patient, SYNTHETIC_ID, call SYNTHETIC_PHONE")
    self.assertTrue("Synthetic" not in clean and "SYNTHETIC_ID" not in clean and "SYNTHETIC_PHONE" not in clean)
