export type ProjectOperationKind =
  | "load"
  | "save"
  | "saveAs"
  | "saveBeforeClose";

export class ProjectOperationCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private activeKind: ProjectOperationKind | null = null;
  private pendingCount = 0;

  get activeOperation(): ProjectOperationKind | null {
    return this.activeKind;
  }

  get pendingOperationCount(): number {
    return this.pendingCount;
  }

  enqueue<T>(
    kind: ProjectOperationKind,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.pendingCount += 1;
    const scheduled = this.tail.then(async () => {
      this.activeKind = kind;
      try {
        return await operation();
      } finally {
        this.activeKind = null;
        this.pendingCount -= 1;
      }
    });

    this.tail = scheduled.then(
      () => undefined,
      () => undefined,
    );
    return scheduled;
  }
}
