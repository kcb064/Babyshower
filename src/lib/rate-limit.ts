/** Minimal in-memory sliding-window rate limiter (single container, so memory is enough). */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Record an attempt. Returns false if the key is over the limit (attempt not counted). */
  attempt(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.prune(now);
    return true;
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private prune(now: number) {
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.hits) {
      if (!times.some((t) => t > cutoff)) this.hits.delete(key);
    }
  }
}
