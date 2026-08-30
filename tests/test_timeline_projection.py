import unittest
from backend.core import Entry, Forbidden, project_timeline_event


class TimelineProjectionTests(unittest.TestCase):
    def setUp(self):
        self.entry = Entry("event-1", "patient-1", "north", "system", "system", "ai_summary", "raw clinical inference", raw_ai=True)

    def test_roles_share_the_same_event_identity(self):
        patient = project_timeline_event(self.entry, "patient", "Visit completed; follow the reviewed instructions.")
        clinician = project_timeline_event(self.entry, "clinician", self.entry.content)
        self.assertEqual(patient["event_id"], clinician["event_id"])
        self.assertNotEqual(patient["content"], clinician["content"])

    def test_raw_ai_cannot_be_patient_projection(self):
        with self.assertRaises(Forbidden):
            project_timeline_event(self.entry, "patient", self.entry.content)


if __name__ == "__main__":
    unittest.main()
