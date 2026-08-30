import unittest
from backend.core import importance_score

class TestSelfLearning(unittest.TestCase):
 def test_clinician_pin_increases_similar_future_priority(self):
    baseline=importance_score(recency=.8,risk=.8,unresolved=True,entity=.7,learned_weight=0)
    after_pin=importance_score(recency=.8,risk=.8,unresolved=True,entity=.7,learned_weight=1)
    self.assertGreater(after_pin,baseline)
