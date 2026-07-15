export type HistoryRecordOptions = {
  mergeKey?: string;
  timestamp?: number;
};

type HistoryEntry<T> = {
  before: T;
  after: T;
  mergeKey?: string;
  timestamp: number;
};

export type HistoryManagerOptions<T> = {
  clone: (value: T) => T;
  equals: (left: T, right: T) => boolean;
  limit?: number;
  mergeWindowMs?: number;
};

export class HistoryManager<T> {
  private readonly clone: (value: T) => T;
  private readonly equals: (left: T, right: T) => boolean;
  private readonly limit: number;
  private readonly mergeWindowMs: number;
  private past: HistoryEntry<T>[] = [];
  private future: HistoryEntry<T>[] = [];

  constructor(options: HistoryManagerOptions<T>) {
    this.clone = options.clone;
    this.equals = options.equals;
    this.limit = Math.max(1, options.limit ?? 100);
    this.mergeWindowMs = Math.max(0, options.mergeWindowMs ?? 750);
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoCount(): number {
    return this.past.length;
  }

  get redoCount(): number {
    return this.future.length;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }

  record(before: T, after: T, options: HistoryRecordOptions = {}): boolean {
    if (this.equals(before, after)) {
      return false;
    }
    const timestamp = options.timestamp ?? Date.now();
    const previous = this.past[this.past.length - 1];
    const shouldMerge =
      Boolean(options.mergeKey) &&
      previous?.mergeKey === options.mergeKey &&
      timestamp - previous.timestamp <= this.mergeWindowMs;
    if (shouldMerge) {
      previous.after = this.clone(after);
      previous.timestamp = timestamp;
    } else {
      this.past.push({
        before: this.clone(before),
        after: this.clone(after),
        mergeKey: options.mergeKey,
        timestamp
      });
      if (this.past.length > this.limit) {
        this.past.shift();
      }
    }
    this.future = [];
    return true;
  }

  undo(): T | null {
    const entry = this.past.pop();
    if (!entry) {
      return null;
    }
    this.future.push(entry);
    return this.clone(entry.before);
  }

  redo(): T | null {
    const entry = this.future.pop();
    if (!entry) {
      return null;
    }
    this.past.push(entry);
    return this.clone(entry.after);
  }
}
