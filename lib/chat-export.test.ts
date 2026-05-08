import {
  buildExportFilename,
  formatChatTranscript,
} from "./chat-export";
import type { ChatMessage } from "./types";

const FIXED_DATE = new Date("2026-05-08T16:45:30.000Z");

function msg(
  role: ChatMessage["role"],
  content: string,
  createdAt: number,
  id = `${role}-${createdAt}`,
): ChatMessage {
  return { id, role, content, createdAt };
}

describe("buildExportFilename", () => {
  test("uses an ISO timestamp without illegal filename characters", () => {
    const name = buildExportFilename(FIXED_DATE);
    expect(name).toBe("trustmebro-chat-2026-05-08T16-45-30Z.txt");
    // Colons are illegal in Windows filenames; the only `.` should be `.txt`.
    expect(name).not.toMatch(/:/);
    expect(name.match(/\./g)).toHaveLength(1);
  });
});

describe("formatChatTranscript", () => {
  test("renders a placeholder when there are no messages", () => {
    const out = formatChatTranscript([], FIXED_DATE);
    expect(out).toContain("TrustMeBro AI Analyst — Conversation Export");
    expect(out).toContain("Exported: 2026-05-08T16:45:30.000Z");
    expect(out).toContain("Messages: 0");
    expect(out).toContain("(no messages)");
  });

  test("renders user and assistant turns with timestamps and labels", () => {
    const messages: ChatMessage[] = [
      msg("user", "Why do sports markets skew NO?", Date.UTC(2026, 4, 8, 12, 35, 0)),
      msg("assistant", "Because of the favorite-longshot bias.", Date.UTC(2026, 4, 8, 12, 35, 2)),
    ];
    const out = formatChatTranscript(messages, FIXED_DATE);

    expect(out).toContain("Messages: 2");
    expect(out).toContain("[2026-05-08 12:35:00Z] You:\nWhy do sports markets skew NO?");
    expect(out).toContain(
      "[2026-05-08 12:35:02Z] Analyst:\nBecause of the favorite-longshot bias.",
    );
  });

  test("substitutes (empty) for blank assistant turns", () => {
    const messages: ChatMessage[] = [msg("assistant", "", 0)];
    expect(formatChatTranscript(messages, FIXED_DATE)).toContain("Analyst:\n(empty)");
  });
});
