import unittest
from backend.core import Actor, can_respond_to_consent, transcript_consent_status


class TranscriptConsentTests(unittest.TestCase):
    def test_every_human_participant_must_approve(self):
        people = ["dr-samuel-lee", "maya-chen"]
        self.assertEqual(transcript_consent_status(people, {"dr-samuel-lee": "approved", "maya-chen": "pending"}), "pending")
        self.assertEqual(transcript_consent_status(people, {"dr-samuel-lee": "approved", "maya-chen": "approved"}), "approved")

    def test_ai_is_exempt_but_patient_is_not(self):
        people = ["maya-chen"]
        self.assertEqual(transcript_consent_status(people, {"maya-chen": "pending"}), "pending")
        self.assertEqual(transcript_consent_status(people, {"maya-chen": "approved"}), "approved")

    def test_one_rejection_blocks_access(self):
        self.assertEqual(transcript_consent_status(["priya-nair", "maya-chen"], {"priya-nair": "approved", "maya-chen": "rejected"}), "rejected")

    def test_only_participant_can_respond(self):
        clinician = Actor("dr-samuel-lee", "clinician", "north")
        self.assertFalse(can_respond_to_consent(clinician, ["maya-chen"]))
        patient = Actor("maya-chen", "patient", "north", "patient-1")
        self.assertTrue(can_respond_to_consent(patient, ["maya-chen"]))


if __name__ == "__main__":
    unittest.main()
