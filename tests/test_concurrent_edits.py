import unittest
from backend.core import Actor, Entry, Conflict, update_entry

class TestConcurrency(unittest.TestCase):
 def test_distinct_owned_sections_do_not_overwrite(self):
    staff=Actor("s","staff","north"); clinician=Actor("c","clinician","north")
    s=Entry("s1","p","north","staff","s","staff_note","a")
    c=Entry("c1","p","north","clinician","c","plan","b")
    update_entry(staff,s,"a2",1,[]); update_entry(clinician,c,"b2",1,[])
    self.assertEqual((s.content,c.content),("a2","b2"))

 def test_same_section_uses_optimistic_locking(self):
    clinician=Actor("c","clinician","north")
    entry=Entry("c1","p","north","clinician","c","plan","v1")
    update_entry(clinician,entry,"first writer",1,[])
    with self.assertRaises(Conflict): update_entry(clinician,entry,"stale writer",1,[])
