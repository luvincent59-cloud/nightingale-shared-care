import unittest
from backend.core import Entry, resolve_provenance

class TestProvenance(unittest.TestCase):
 def test_highlight_pointer_resolves(self):
    entry=Entry("entry-1","p1","north","system","system","ai_doctor_consult_summary","text",raw_ai=True,provenance_pointer="session-1")
    self.assertIs(resolve_provenance({"provenance_pointer":"entry-1"},{entry.id:entry}),entry)

 def test_missing_pointer_rejected(self):
    with self.assertRaises(ValueError): resolve_provenance({}, {})
