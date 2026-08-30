import unittest
from backend.core import Actor, Entry, update_entry, revert_entry

class TestRevisionHistory(unittest.TestCase):
 def test_edit_increments_and_revert_is_audited(self):
    actor=Actor("c1","clinician","north")
    entry=Entry("e1","p1","north","clinician","c1","plan","original")
    audit=[]
    update_entry(actor,entry,"changed",1,audit)
    self.assertTrue(entry.version==2 and audit[-1].from_version==1)
    revert_entry(actor,entry,"original",audit)
    self.assertTrue(entry.content=="original" and entry.version==3)
    self.assertTrue(audit[-1].action=="entry.reverted" and audit[-1].actor_id=="c1")
