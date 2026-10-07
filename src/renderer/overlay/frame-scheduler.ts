/** Synchronous renders also cancel pending work, so save/export can flush safely. */
export class FrameScheduler {
  private pending: number | null = null;

  constructor(
    private readonly render: () => void,
    private readonly request: (callback: FrameRequestCallback) => number = (callback) => requestAnimationFrame(callback),
    private readonly cancel: (id: number) => void = (id) => cancelAnimationFrame(id),
  ) {}

  schedule(): void {
    if (this.pending !== null) return;
    this.pending = this.request(() => {
      this.pending = null;
      this.render();
    });
  }

  flush(): void {
    this.dispose();
    this.render();
  }

  dispose(): void {
    if (this.pending === null) return;
    this.cancel(this.pending);
    this.pending = null;
  }
}
