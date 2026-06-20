"use client";

import { useId, useMemo, useState } from "react";

type CollapsibleTextProps = {
  text: string;
  maxChars?: number;
  className?: string;
  as?: "p" | "div";
};

export function CollapsibleText({
  text,
  maxChars = 220,
  className = "",
  as: Tag = "p",
}: CollapsibleTextProps) {
  const [expanded, setExpanded] = useState(false);
  const controlId = useId();
  const trimmed = text.trim();
  const needsToggle = trimmed.length > maxChars;

  const visible = useMemo(() => {
    if (!needsToggle || expanded) return trimmed;
    const slice = trimmed.slice(0, maxChars);
    const lastSpace = slice.lastIndexOf(" ");
    return `${(lastSpace > 80 ? slice.slice(0, lastSpace) : slice).trim()}…`;
  }, [trimmed, maxChars, needsToggle, expanded]);

  if (!trimmed) {
    return <Tag className={className}>—</Tag>;
  }

  return (
    <Tag className={`collapsible-text ${className}`.trim()} id={controlId}>
      <span className="collapsible-text-body">{visible}</span>
      {needsToggle ? (
        <button
          type="button"
          className="collapsible-text-toggle"
          aria-expanded={expanded}
          aria-controls={controlId}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </Tag>
  );
}
