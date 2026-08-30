import unittest
from backend.core import Actor, Entry, Forbidden, can_read, update_entry

def fixtures():
    staff=Actor("s1","staff","north")
    clinician=Actor("c1","clinician","north")
    patient=Actor("p1","patient","north","patient-1")
    note=Entry("e1","patient-1","north","staff","s1","staff_note","internal")
    return staff,clinician,patient,note

class TestRbacScope(unittest.TestCase):
 def test_staff_cannot_impersonate_clinician(self):
    staff,_,_,note=fixtures(); note.owner_role="clinician"
    with self.assertRaises(Forbidden): update_entry(staff,note,"overwrite",1,[])

 def test_clinician_cannot_overwrite_staff(self):
    _,clinician,_,note=fixtures()
    with self.assertRaises(Forbidden): update_entry(clinician,note,"overwrite",1,[])

 def test_patient_cannot_read_internal_or_raw_ai(self):
    _,_,patient,note=fixtures()
    self.assertFalse(can_read(patient,note))
    note.owner_role="system"; note.patient_visible=True; note.raw_ai=True
    self.assertFalse(can_read(patient,note))

 def test_cross_clinic_denied(self):
    staff,_,_,note=fixtures(); staff=Actor(staff.id,staff.role,"south")
    self.assertFalse(can_read(staff,note))
