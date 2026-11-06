import { getDb } from "./db";
import { assertProductionEnv } from "./lib/env";

/** Runs once when the Node server boots: fail fast on bad config, then migrate and seed. */
export function startup() {
  try {
    assertProductionEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  getDb();
}
