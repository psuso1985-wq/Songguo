/** In-process rate limiter for Owner login endpoint.
 *
 * Tracks login failures per client IP + account (case-insensitive).
 * After 5 failures within 5 minutes, the key is locked for 15 minutes.
 * Successful login clears the key. Entries expire on access.
 */

type Clock = () => number; // milliseconds since epoch

export interface RateLimitEntry {
  failureCount: number;
  lastFailureTime: number;
  lockedUntil: number; // 0 if not locked
}

export class LoginRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private clock: Clock;

  // Configuration (in milliseconds)
  private readonly FAILURE_WINDOW = 5 * 60 * 1000; // 5 minutes
  private readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
  private readonly FAILURE_THRESHOLD = 5; // failures to trigger lockout

  constructor(clock: Clock = () => Date.now()) {
    this.clock = clock;
  }

  /**
   * Extract client IP from request headers.
   * Prefers x-forwarded-for (first hop), falls back to x-real-ip, then 'unknown'.
   */
  private getClientIp(request: Request): string {
    let ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (!ip) ip = request.headers.get('x-real-ip')?.trim();
    return ip || 'unknown';
  }

  /**
   * Build cache key: IP + lowercase account.
   */
  private makeKey(ip: string, account: string): string {
    return `${ip}:${account.toLowerCase()}`;
  }

  /**
   * Check if key is locked. If expired, clear the lock.
   */
  private isLocked(entry: RateLimitEntry): boolean {
    const now = this.clock();
    if (entry.lockedUntil <= now) {
      entry.lockedUntil = 0;
      return false;
    }
    return true;
  }

  /**
   * Prune expired failure records (if outside the failure window).
   */
  private pruneFailures(entry: RateLimitEntry): void {
    const now = this.clock();
    if (now - entry.lastFailureTime > this.FAILURE_WINDOW) {
      entry.failureCount = 0;
    }
  }

  /**
   * Check if a key is currently locked without recording anything.
   */
  checkLocked(request: Request, account: string): { locked: boolean; retryAfterSeconds: number | null } {
    const ip = this.getClientIp(request);
    const key = this.makeKey(ip, account);
    const now = this.clock();

    const entry = this.store.get(key);
    if (!entry) {
      return { locked: false, retryAfterSeconds: null };
    }

    if (this.isLocked(entry)) {
      const retryAfterSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
      return { locked: true, retryAfterSeconds };
    }

    return { locked: false, retryAfterSeconds: null };
  }

  /**
   * Record a login failure. Returns { locked: boolean, retryAfterSeconds: number | null }.
   * This increments the failure counter and may trigger a lockout.
   */
  recordFailure(request: Request, account: string): { locked: boolean; retryAfterSeconds: number | null } {
    const ip = this.getClientIp(request);
    const key = this.makeKey(ip, account);
    const now = this.clock();

    let entry = this.store.get(key);
    if (!entry) {
      entry = { failureCount: 0, lastFailureTime: now, lockedUntil: 0 };
      this.store.set(key, entry);
    }

    // If locked, return remaining lock time without incrementing
    if (this.isLocked(entry)) {
      const retryAfterSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
      return { locked: true, retryAfterSeconds };
    }

    // Prune old failures
    this.pruneFailures(entry);

    // Increment failure count
    entry.failureCount++;
    entry.lastFailureTime = now;

    // Check if we should lock
    if (entry.failureCount >= this.FAILURE_THRESHOLD) {
      entry.lockedUntil = now + this.LOCKOUT_DURATION;
      const retryAfterSeconds = Math.ceil(this.LOCKOUT_DURATION / 1000);
      return { locked: true, retryAfterSeconds };
    }

    return { locked: false, retryAfterSeconds: null };
  }

  /**
   * Clear failure counter on successful login.
   */
  recordSuccess(request: Request, account: string): void {
    const ip = this.getClientIp(request);
    const key = this.makeKey(ip, account);
    this.store.delete(key);
  }

  /**
   * Return current stats for testing.
   */
  getStats(): { totalKeys: number; lockedKeys: number } {
    let lockedKeys = 0;
    const now = this.clock();
    for (const entry of this.store.values()) {
      if (entry.lockedUntil > now) lockedKeys++;
    }
    return { totalKeys: this.store.size, lockedKeys };
  }

  /**
   * Clear all entries. Only for testing.
   */
  _resetForTesting(): void {
    this.store.clear();
  }
}

// Singleton instance for production
export const rateLimiter = new LoginRateLimiter();
