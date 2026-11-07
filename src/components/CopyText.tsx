"use client";

import { useState } from "react";

/** A value shown as selectable text with a copy button next to it. */
export function CopyText({
  value,
  display,
  label,
  copiedLabel,
  testId,
}: {
  value: string;
  display?: string;
  label: string;
  copiedLabel: string;
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="select-all font-mono text-lg font-semibold tracking-wide" data-testid={testId}>
        {display ?? value}
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard unavailable: the text can still be selected manually.
          }
        }}
      >
        <span aria-live="polite">{copied ? copiedLabel : label}</span>
      </button>
    </div>
  );
}
