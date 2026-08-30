export type TranscriptSource = {
  title: string;
  session: string;
  humanParticipants: string[];
  lines: { time: string; speaker: string; text: string; match?: boolean }[];
};

// Server-only synthetic source material. Full text is never included in the client bundle.
export const transcriptSources: Record<string, TranscriptSource> = {
  "entry-aug-26": { title: "Doctor–patient consult", session: "NC-4821 · 26 Aug 2026", humanParticipants: ["dr-samuel-lee", "maya-chen"], lines: [
    { time: "08:14", speaker: "Dr. Lee", text: "When does the chest discomfort usually happen?" },
    { time: "08:21", speaker: "Synthetic Patient", text: "Usually after climbing two flights of stairs.", match: true },
    { time: "08:35", speaker: "Synthetic Patient", text: "It happened three times this week. Before this, it was maybe once a month.", match: true },
    { time: "08:42", speaker: "Dr. Lee", text: "Does it happen while you are resting?" },
    { time: "08:45", speaker: "Synthetic Patient", text: "No, only with exercise. It settles after eight or ten minutes of rest.", match: true },
  ]},
  "entry-aug-20": { title: "AI–patient session", session: "PS-1189 · 20 Aug 2026", humanParticipants: ["maya-chen"], lines: [
    { time: "20:01", speaker: "Nightingale AI", text: "What has changed since your last visit?" },
    { time: "20:03", speaker: "Synthetic Patient", text: "I stopped my evening walks because the pressure starts sooner now.", match: true },
    { time: "20:05", speaker: "Synthetic Patient", text: "I want to know if exercise is safe before the weekend.", match: true },
  ]},
  "entry-aug-18": { title: "Nurse–patient consult", session: "NS-3310 · 18 Aug 2026", humanParticipants: ["mei-tan", "maya-chen"], lines: [
    { time: "03:10", speaker: "Nurse Mei Tan", text: "How long can you walk before symptoms begin?" },
    { time: "03:28", speaker: "Synthetic Patient", text: "About five minutes if I walk quickly.", match: true },
    { time: "04:05", speaker: "Nurse Mei Tan", text: "Please avoid strenuous exercise and seek urgent help for pain at rest." },
  ]},
};

export const sourceMetadata = Object.fromEntries(Object.entries(transcriptSources).map(([entryId, source]) => [entryId, {
  entryId, title: source.title, sourceId: source.session.split(" · ")[0], humanParticipants: source.humanParticipants,
}]));
