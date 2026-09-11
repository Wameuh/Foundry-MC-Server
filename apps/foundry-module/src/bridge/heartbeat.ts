export class Heartbeat {
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastServerActivity = Date.now();

  constructor(
    private readonly send: () => void,
    private readonly disconnect: () => void,
    private readonly intervalMs = 20_000,
    private readonly timeoutMs = 60_000,
  ) {}

  start(): void {
    this.stop();
    this.lastServerActivity = Date.now();
    this.timer = setInterval(() => {
      if (Date.now() - this.lastServerActivity > this.timeoutMs) {
        this.disconnect();
        return;
      }
      this.send();
    }, this.intervalMs);
  }

  touch(): void {
    this.lastServerActivity = Date.now();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
