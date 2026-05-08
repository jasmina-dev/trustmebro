/**
 * Helpers for exporting the AI chat transcript as a plain-text file.
 *
 * The formatter is split out from the React component so it can be unit-tested
 * without touching the DOM, and so the download wiring (Blob + anchor click)
 * is the only browser-only piece.
 */

import type { ChatMessage } from "./types";

const ROLE_LABEL: Record<ChatMessage["role"], string> = {
  user: "You",
  assistant: "Analyst",
};

/** ISO-ish timestamp safe for filenames (no `:` characters on Windows). */
function isoForFilename(d: Date): string {
  return d.toISOString().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");
}

/** Human-readable timestamp for the body of the transcript. */
function formatBodyTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

export function buildExportFilename(exportedAt: Date = new Date()): string {
  return `trustmebro-chat-${isoForFilename(exportedAt)}.txt`;
}

export function formatChatTranscript(
  messages: ChatMessage[],
  exportedAt: Date = new Date(),
): string {
  const header = [
    "TrustMeBro AI Analyst — Conversation Export",
    `Exported: ${exportedAt.toISOString()}`,
    `Messages: ${messages.length}`,
    "",
    "----------------------------------------",
    "",
  ].join("\n");

  if (messages.length === 0) {
    return `${header}(no messages)\n`;
  }

  const body = messages
    .map((m) => {
      const ts = formatBodyTimestamp(m.createdAt);
      const who = ROLE_LABEL[m.role];
      const content = m.content.length > 0 ? m.content : "(empty)";
      return `[${ts}] ${who}:\n${content}\n`;
    })
    .join("\n");

  return `${header}${body}`;
}

/**
 * Triggers a browser download of the transcript. Safe to call only in the
 * browser; the component guards against SSR.
 */
export function downloadChatTranscript(messages: ChatMessage[]): void {
  const exportedAt = new Date();
  const text = formatChatTranscript(messages, exportedAt);
  const filename = buildExportFilename(exportedAt);

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  // Some browsers require the anchor to be in the DOM for the click to take
  // effect (older Firefox especially).
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Defer revoke so the download has had a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
