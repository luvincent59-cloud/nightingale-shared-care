import unittest
from backend.core import Forbidden, archive_is_complete, archive_projection_for_role


class DataDecayArchiveTests(unittest.TestCase):
    def test_compression_preserves_event_and_revision_counts(self):
        self.assertTrue(archive_is_complete(3, ["e1", "e2", "e3"], 7, 7))
        self.assertFalse(archive_is_complete(3, ["e1", "e2"], 7, 7))
        self.assertFalse(archive_is_complete(3, ["e1", "e2", "e3"], 7, 6))

    def test_role_gets_only_its_archive_projection(self):
        views = {"patient": "patient-safe history", "clinician": "clinical history", "staff": "coordination history", "nurse": "nursing history"}
        self.assertEqual(archive_projection_for_role(views, "patient"), "patient-safe history")
        with self.assertRaises(Forbidden):
            archive_projection_for_role(views, "admin")


if __name__ == "__main__":
    unittest.main()
