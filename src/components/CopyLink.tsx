"use client";

import { useState } from "react";

export function CopyLink({ url, label, copiedLabel }: { url: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <input
        readOnly
        value={url}
        className="field font-mono text-xs"
        onFocus={(e) => e.currentTarget.select()}
        aria-label={label}
        data-testid="my-claims-url"
      />
      <button
        type="button"
        className="btn btn-secondary btn-small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard unavailable: the field above can still be selected manually.
          }
        }}
      >
        <span aria-live="polite">{copied ? copiedLabel : label}</span>
      </button>
    </div>
  );
}
