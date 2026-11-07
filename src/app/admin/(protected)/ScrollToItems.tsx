"use client";

import { useEffect } from "react";

/**
 * After "save item" the server action redirects to /admin?saved=1 (a redirect from an action
 * loses the #fragment). Scroll to the item list and tidy the URL to /admin#items.
 */
export function ScrollToItems() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("saved") !== "1") return;
    window.history.replaceState(window.history.state, "", "/admin#items");
    document.getElementById("items")?.scrollIntoView({ block: "start" });
  }, []);
  return null;
}
