export class ReconnectBackoff {
  private attempt = 0;

  constructor(
    private readonly initialMs = 1_000,
    private readonly maximumMs = 30_000,
  ) {}

  next(): number {
    const base = Math.min(this.maximumMs, this.initialMs * 2 ** this.attempt++);
    return Math.round(base * (0.8 + Math.random() * 0.4));
  }

  reset(): void {
    this.attempt = 0;
  }
}
