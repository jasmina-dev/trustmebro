"use client";

import type { AnchorHTMLAttributes } from "react";
import Markdown from "markdown-to-jsx";

/**
 * Markdown renderer for chat messages.
 *
 * @remarks
 * Keeps the surface area intentionally small (links + basic formatting) and
 * ensures external links open safely in a new tab.
 */
function MarkdownLink({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const external = Boolean(href?.startsWith("http"));
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="font-medium text-accent underline-offset-2 hover:underline"
      {...rest}
    >
      {children}
    </a>
  );
}

export function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="chat-prose">
      <Markdown
        options={{
          disableParsingRawHTML: true,
          overrides: { a: { component: MarkdownLink } },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
