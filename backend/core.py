"""Dependency-free domain core for the Nightingale prototype.

The hosted UI uses synthetic state for its demo. This module is the reference
server-side enforcement layer and is intentionally framework-neutral so its
security invariants can be tested without infrastructure.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
import re
from typing import Literal

Role = Literal["patient", "staff", "clinician", "admin", "system"]

@dataclass(frozen=True)
class Actor:
    id: str
    role: Role
    clinic_id: str
    patient_id: str | None = None

@dataclass
class Entry:
    id: str
    patient_id: str
    clinic_id: str
    owner_role: Role
    author_id: str
    entry_type: str
    content: str
    patient_visible: bool = False
    raw_ai: bool = False
    version: int = 1
    provenance_pointer: str | None = None
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

@dataclass(frozen=True)
class AuditEvent:
    actor_id: str
    action: str
    resource_id: str
    from_version: int
    to_version: int
    timestamp: str

class Forbidden(PermissionError): pass
class Conflict(RuntimeError): pass

def can_read(actor: Actor, entry: Entry) -> bool:
    if actor.clinic_id != entry.clinic_id: return False
    if actor.role == "patient":
        return actor.patient_id == entry.patient_id and entry.patient_visible and not entry.raw_ai
    if actor.role == "staff": return entry.owner_role in {"staff", "system"}
    if actor.role in {"clinician", "admin"}: return True
    return False

def update_entry(actor: Actor, entry: Entry, content: str, expected_version: int, audit: list[AuditEvent]) -> Entry:
    if actor.clinic_id != entry.clinic_id or actor.role != entry.owner_role:
        raise Forbidden("role and clinic ownership are enforced server-side")
    if entry.version != expected_version:
        raise Conflict(f"expected v{expected_version}; current v{entry.version}")
    old = entry.version
    entry.content, entry.version = content, old + 1
    entry.updated_at = datetime.now(timezone.utc).isoformat()
    audit.append(AuditEvent(actor.id, "entry.updated", entry.id, old, entry.version, entry.updated_at))
    return entry

def revert_entry(actor: Actor, entry: Entry, snapshot_content: str, audit: list[AuditEvent]) -> Entry:
    old = entry.version
    update_entry(actor, entry, snapshot_content, old, audit)
    audit[-1] = AuditEvent(actor.id, "entry.reverted", entry.id, old, entry.version, entry.updated_at)
    return entry

def resolve_provenance(highlight: dict, entries: dict[str, Entry]) -> Entry:
    pointer = highlight.get("provenance_pointer")
    if not pointer or pointer not in entries: raise ValueError("unresolvable provenance")
    return entries[pointer]

def redact_phi(text: str) -> str:
    """Deterministic pre-LLM redaction; production adds NER + review queue."""
    # Synthetic fixture tokens are redacted before any model boundary.
    text = text.replace("SYNTHETIC_ID", "[REDACTED_ID]")
    text = text.replace("SYNTHETIC_PHONE", "[REDACTED_PHONE]")
    text = text.replace("SYNTHETIC_EMAIL", "[REDACTED_EMAIL]")
    text = re.sub(r"\b[STFG]\d{7}[A-Z]\b", "[REDACTED_ID]", text, flags=re.I)
    text = re.sub(r"(?:\+65[ -]?)?[689]\d{3}[ -]?\d{4}\b", "[REDACTED_PHONE]", text)
    text = re.sub(r"\b(?:patient name|name)\s*:\s*[A-Z][A-Za-z -]+", "Name: [REDACTED_NAME]", text, flags=re.I)
    return text

def importance_score(*, recency: float, risk: float, unresolved: bool, entity: float, learned_weight: float = 0) -> float:
    return round(.30 * recency + .35 * risk + .20 * float(unresolved) + .10 * entity + .05 * learned_weight, 4)

def transcript_consent_status(human_participants: list[str], approvals: dict[str, str]) -> str:
    """AI is intentionally absent from human_participants."""
    if any(approvals.get(person) == "rejected" for person in human_participants):
        return "rejected"
    if all(approvals.get(person) == "approved" for person in human_participants):
        return "approved"
    return "pending"

def can_respond_to_consent(actor: Actor, human_participants: list[str]) -> bool:
    return actor.id in human_participants

def project_timeline_event(entry: Entry, audience_role: Role, safe_content: str) -> dict:
    """Keep event identity aligned while returning only the audience-safe view."""
    if audience_role == "patient" and entry.raw_ai and safe_content == entry.content:
        raise Forbidden("raw AI content cannot be reused as a patient projection")
    return {"event_id": entry.id, "audience_role": audience_role, "content": safe_content}

def archive_is_complete(event_count: int, manifest_event_ids: list[str], revision_count: int, stored_revisions: int) -> bool:
    """Compression may change presentation, never event or revision cardinality."""
    return event_count == len(set(manifest_event_ids)) and revision_count == stored_revisions

def archive_projection_for_role(projections: dict[str, str], role: Role) -> str:
    if role not in projections:
        raise Forbidden("archive projection is not available for this role")
    return projections[role]
