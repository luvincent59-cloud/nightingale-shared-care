import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const careEntries = sqliteTable("care_entries", {
 version:integer("version").notNull().default(1),updatedAt:text("updated_at"),mutationId:text("mutation_id"),
  id: text("id").primaryKey(), clinicId: text("clinic_id").notNull(), patientId: text("patient_id").notNull(), ownerRole: text("owner_role").notNull(), authorId: text("author_id").notNull(), kind: text("kind").notNull(), title: text("title").notNull(), content: text("content").notNull(), source: text("source").notNull(), confidence: text("confidence").notNull(), patientVisible: integer("patient_visible", { mode: "boolean" }).notNull().default(false), rawAi: integer("raw_ai", { mode: "boolean" }).notNull().default(false), createdAt: text("created_at").notNull(),
});
export const comments = sqliteTable("comments", {
 version:integer("version").notNull().default(1),mutationId:text("mutation_id"),
  id: text("id").primaryKey(), entryId: text("entry_id").notNull(), clinicId: text("clinic_id").notNull(), authorRole: text("author_role").notNull(), authorId: text("author_id").notNull(), body: text("body").notNull(), mention: text("mention"), resolved: integer("resolved", { mode: "boolean" }).notNull().default(false), createdAt: text("created_at").notNull(),
});
export const carePlans = sqliteTable("care_plans", {
 mutationId:text("mutation_id"),
  patientId: text("patient_id").primaryKey(), clinicId: text("clinic_id").notNull(), content: text("content").notNull(), version: integer("version").notNull(), updatedBy: text("updated_by").notNull(), updatedAt: text("updated_at").notNull(),
});
export const planVersions = sqliteTable("plan_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }), patientId: text("patient_id").notNull(), clinicId: text("clinic_id").notNull(), version: integer("version").notNull(), content: text("content").notNull(), actorId: text("actor_id").notNull(), action: text("action").notNull(), createdAt: text("created_at").notNull(),
});
export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }), clinicId: text("clinic_id").notNull(), actorRole: text("actor_role").notNull(), actorId: text("actor_id").notNull(), action: text("action").notNull(), resourceId: text("resource_id").notNull(), metadata: text("metadata").notNull().default("{}"), createdAt: text("created_at").notNull(),
});
export const highlightFeedback = sqliteTable("highlight_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }), highlightId: text("highlight_id").notNull(), clinicId: text("clinic_id").notNull(), actorId: text("actor_id").notNull(), decision: text("decision").notNull(), createdAt: text("created_at").notNull(),
});
export const highlightSuggestions = sqliteTable("highlight_suggestions", {
  id: text("id").primaryKey(), clinicId: text("clinic_id").notNull(), patientId: text("patient_id").notNull(), entryId: text("entry_id").notNull(), entityKey: text("entity_key").notNull(), label: text("label").notNull(), meta: text("meta").notNull(), severity: text("severity").notNull(), riskReason: text("risk_reason").notNull(), provenancePointer: text("provenance_pointer").notNull(), componentsJson: text("components_json").notNull(), baseScore: integer("base_score").notNull(), status: text("status").notNull().default("pending"), modelVersion: text("model_version").notNull(), createdAt: text("created_at").notNull(), reviewedBy: text("reviewed_by"), reviewedAt: text("reviewed_at"), reviewReason: text("review_reason"), resolvedAt: text("resolved_at"), resolvedBy: text("resolved_by"),
});
export const learningSignals = sqliteTable("learning_signals", {
  id: text("id").primaryKey(), clinicId: text("clinic_id").notNull(), patientId: text("patient_id").notNull(), entityKey: text("entity_key").notNull(), entryId: text("entry_id").notNull(), actorId: text("actor_id").notNull(), actorRole: text("actor_role").notNull(), signal: text("signal").notNull(), value: integer("value").notNull(), createdAt: text("created_at").notNull(),
});
export const careTasks = sqliteTable("care_tasks", {
  id: text("id").primaryKey(), clinicId: text("clinic_id").notNull(), patientId: text("patient_id").notNull(), entryId: text("entry_id").notNull(), highlightId: text("highlight_id"), label: text("label").notNull(), assignee: text("assignee").notNull(), completed: integer("completed").notNull().default(0), updatedAt: text("updated_at").notNull(),
});
export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(), actorId: text("actor_id").notNull(), clinicId: text("clinic_id").notNull(), expiresAt: text("expires_at").notNull(), createdAt: text("created_at").notNull(),
});
export const securityAlerts = sqliteTable("security_alerts", {
  id: text("id").primaryKey(), clinicId: text("clinic_id").notNull(), targetActorId: text("target_actor_id").notNull(), severity: text("severity").notNull(), eventType: text("event_type").notNull(), message: text("message").notNull(), source: text("source").notNull(), createdAt: text("created_at").notNull(), readAt: text("read_at"),
});
export const transcriptAccessRequests = sqliteTable("transcript_access_requests", {
  id: text("id").primaryKey(), clinicId: text("clinic_id").notNull(), entryId: text("entry_id").notNull(), requesterId: text("requester_id").notNull(), participantsJson: text("participants_json").notNull(), approvalsJson: text("approvals_json").notNull(), status: text("status").notNull(), reason: text("reason").notNull(), createdAt: text("created_at").notNull(), expiresAt: text("expires_at").notNull(), resolvedAt: text("resolved_at"),
});
export const timelineProjections = sqliteTable("timeline_projections", {
  id: text("id").primaryKey(), eventId: text("event_id").notNull(), clinicId: text("clinic_id").notNull(), patientId: text("patient_id").notNull(), audienceRole: text("audience_role").notNull(), ownerRole: text("owner_role").notNull(), authorId: text("author_id").notNull(), kind: text("kind").notNull(), title: text("title").notNull(), content: text("content").notNull(), source: text("source").notNull(), confidence: text("confidence").notNull(), aiGenerated: integer("ai_generated", { mode: "boolean" }).notNull().default(false), reviewStatus: text("review_status").notNull(), createdAt: text("created_at").notNull(),
});
export const timelineArchives = sqliteTable("timeline_archives", {
  id: text("id").primaryKey(), clinicId: text("clinic_id").notNull(), patientId: text("patient_id").notNull(), periodStart: text("period_start").notNull(), periodEnd: text("period_end").notNull(), storageTier: text("storage_tier").notNull(), eventCount: integer("event_count").notNull(), revisionCount: integer("revision_count").notNull(), rolesJson: text("roles_json").notNull(), manifestPointer: text("manifest_pointer").notNull(), checksum: text("checksum").notNull(), compressionVersion: integer("compression_version").notNull(), createdAt: text("created_at").notNull(), verifiedAt: text("verified_at").notNull(),
});
export const archiveProjections = sqliteTable("archive_projections", {
  id: text("id").primaryKey(), archiveId: text("archive_id").notNull(), clinicId: text("clinic_id").notNull(), audienceRole: text("audience_role").notNull(), summary: text("summary").notNull(), keyFactsJson: text("key_facts_json").notNull(), aiGenerated: integer("ai_generated", { mode: "boolean" }).notNull().default(true), reviewStatus: text("review_status").notNull(),
});
export const archiveVersions = sqliteTable("archive_versions", {
  id: text("id").primaryKey(), archiveId: text("archive_id").notNull(), clinicId: text("clinic_id").notNull(), audienceRole: text("audience_role").notNull(), version: integer("version").notNull(), snapshotJson: text("snapshot_json").notNull(), actorId: text("actor_id").notNull(), action: text("action").notNull(), checksum: text("checksum").notNull(), createdAt: text("created_at").notNull(),
});
export const voiceRecords = sqliteTable("voice_records", {
  id: text("id").primaryKey(), entryId: text("entry_id").notNull(), clinicId: text("clinic_id").notNull(), patientId: text("patient_id").notNull(), actorId: text("actor_id").notNull(), language: text("language").notNull(), method: text("method").notNull(), originalText: text("original_text").notNull(), reviewedText: text("reviewed_text").notNull(), extractionJson: text("extraction_json").notNull(), createdAt: text("created_at").notNull(),
});
export const recordConflicts = sqliteTable('record_conflicts', {
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull(),patientId:text('patient_id').notNull(),clinicianEntryId:text('clinician_entry_id').notNull(),otherEntryId:text('other_entry_id').notNull(),claimKey:text('claim_key').notNull(),clinicianValue:text('clinician_value').notNull(),otherValue:text('other_value').notNull(),reason:text('reason').notNull(),provenanceJson:text('provenance_json').notNull(),status:text('status').notNull(),createdAt:text('created_at').notNull(),reviewedBy:text('reviewed_by'),reviewNote:text('review_note'),reviewedAt:text('reviewed_at'),
});
export const topCardProjections = sqliteTable('top_card_projections', {
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull(),patientId:text('patient_id').notNull(),audienceRole:text('audience_role').notNull(),payloadJson:text('payload_json').notNull(),updatedAt:text('updated_at').notNull(),
});

export const noteVersions=sqliteTable('note_versions',{
 id:text('id').primaryKey(),entryId:text('entry_id').notNull(),clinicId:text('clinic_id').notNull(),patientId:text('patient_id').notNull(),version:integer('version').notNull(),title:text('title').notNull(),content:text('content').notNull(),patientVisible:integer('patient_visible').notNull(),actorId:text('actor_id').notNull(),action:text('action').notNull(),createdAt:text('created_at').notNull(),
});
export const commentVersions=sqliteTable('comment_versions',{
 id:text('id').primaryKey(),commentId:text('comment_id').notNull(),clinicId:text('clinic_id').notNull(),version:integer('version').notNull(),body:text('body').notNull(),resolved:integer('resolved').notNull(),actorId:text('actor_id').notNull(),createdAt:text('created_at').notNull(),
});
export const recordEvents=sqliteTable('record_events',{
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull(),patientId:text('patient_id').notNull(),entryId:text('entry_id').notNull(),actorId:text('actor_id').notNull(),actorRole:text('actor_role').notNull(),action:text('action').notNull(),version:integer('version').notNull(),patientVisible:integer('patient_visible').notNull(),createdAt:text('created_at').notNull(),
});
export const consultSources=sqliteTable('consult_sources',{
 id:text('id').primaryKey(),entryId:text('entry_id').notNull(),clinicId:text('clinic_id').notNull(),patientId:text('patient_id').notNull(),interaction:text('interaction').notNull(),model:text('model').notNull(),participantsJson:text('participants_json').notNull(),messagesJson:text('messages_json').notNull(),evidenceJson:text('evidence_json').notNull(),redactionCount:integer('redaction_count').notNull(),checksum:text('checksum').notNull(),createdAt:text('created_at').notNull(),
});
