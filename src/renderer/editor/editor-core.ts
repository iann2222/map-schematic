import {
  applyEditorCommand,
  createDocumentChangeCommand,
  mergeEditorCommands,
} from "./commands.js";
import type { EditorCommand } from "./commands.js";
import { cloneEditorDocument } from "./document.js";
import type { EditorDocument } from "./types.js";
import type { ProjectHistory } from "../../shared/schema/mapproj-contract.js";

export type EditorCoreChange = {
  kind: "execute" | "undo" | "redo" | "reset";
  command: EditorCommand | null;
};

export type EditorCoreRecordOptions = {
  mergeKey?: string;
  timestamp?: number;
};

export type EditorHistorySnapshot = ProjectHistory;

const EDITOR_HISTORY_VERSION = 1 satisfies ProjectHistory["historyVersion"];

type HistoryEntry = {
  command: EditorCommand;
  mergeKey?: string;
  timestamp: number;
};

function cloneCommand(command: EditorCommand): EditorCommand {
  return JSON.parse(JSON.stringify(command)) as EditorCommand;
}

function cloneHistoryCommands(value: unknown, limit: number): EditorCommand[] | null {
  if (!Array.isArray(value) || value.length > limit) {
    return null;
  }
  try {
    return value.map((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        throw new Error("History command must be an object");
      }
      return cloneCommand(entry as EditorCommand);
    });
  } catch {
    return null;
  }
}

function documentsEqual(left: EditorDocument, right: EditorDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class EditorCore {
  readonly document: EditorDocument;
  private readonly limit: number;
  private readonly mergeWindowMs: number;
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private transactionBefore: EditorDocument | null = null;
  private listeners = new Set<(change: EditorCoreChange) => void>();

  constructor(
    document: EditorDocument,
    options: { limit?: number; mergeWindowMs?: number } = {},
  ) {
    this.document = cloneEditorDocument(document);
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

  subscribe(listener: (change: EditorCoreChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(
    command: EditorCommand | null,
    options: EditorCoreRecordOptions = {},
  ): boolean {
    if (!command || !applyEditorCommand(this.document, command, "forward")) {
      return false;
    }
    this.record(command, options);
    this.emit({ kind: "execute", command });
    return true;
  }

  beginTransaction(): void {
    if (!this.transactionBefore) {
      this.transactionBefore = cloneEditorDocument(this.document);
    }
  }

  commitTransaction(options: EditorCoreRecordOptions = {}): boolean {
    if (!this.transactionBefore) {
      return false;
    }
    const before = this.transactionBefore;
    this.transactionBefore = null;
    let command: EditorCommand | null;
    try {
      command = createDocumentChangeCommand(before, this.document);
    } catch {
      this.replaceDocument(before, false);
      return false;
    }
    if (!command) {
      return false;
    }
    this.record(command, options);
    this.emit({ kind: "execute", command });
    return true;
  }

  cancelTransaction(restore = false): void {
    if (restore && this.transactionBefore) {
      this.replaceDocument(this.transactionBefore, false);
    }
    this.transactionBefore = null;
  }

  undo(): EditorCommand | null {
    this.cancelTransaction(true);
    const entry = this.past.pop();
    if (!entry) {
      return null;
    }
    if (!applyEditorCommand(this.document, entry.command, "backward")) {
      this.past.push(entry);
      return null;
    }
    this.future.push(entry);
    this.emit({ kind: "undo", command: entry.command });
    return entry.command;
  }

  redo(): EditorCommand | null {
    this.cancelTransaction(true);
    const entry = this.future.pop();
    if (!entry) {
      return null;
    }
    if (!applyEditorCommand(this.document, entry.command, "forward")) {
      this.future.push(entry);
      return null;
    }
    this.past.push(entry);
    this.emit({ kind: "redo", command: entry.command });
    return entry.command;
  }

  replaceDocument(document: EditorDocument, clearHistory = true): void {
    const cloned = cloneEditorDocument(document);
    this.document.objects.splice(
      0,
      this.document.objects.length,
      ...cloned.objects,
    );
    this.document.listOrderKeys.splice(
      0,
      this.document.listOrderKeys.length,
      ...cloned.listOrderKeys,
    );
    this.document.displayOrderKeys.splice(
      0,
      this.document.displayOrderKeys.length,
      ...cloned.displayOrderKeys,
    );
    this.transactionBefore = null;
    if (clearHistory) {
      this.past = [];
      this.future = [];
    }
    this.emit({ kind: "reset", command: null });
  }

  clearHistory(): void {
    this.transactionBefore = null;
    this.past = [];
    this.future = [];
    this.emit({ kind: "reset", command: null });
  }

  exportHistory(): EditorHistorySnapshot {
    return {
      historyVersion: EDITOR_HISTORY_VERSION,
      undo: this.past.map((entry) => cloneCommand(entry.command)),
      redo: this.future.map((entry) => cloneCommand(entry.command)),
    };
  }

  restoreHistory(snapshot: unknown): boolean {
    if (
      typeof snapshot !== "object" ||
      snapshot === null ||
      Array.isArray(snapshot)
    ) {
      return false;
    }
    const record = snapshot as {
      historyVersion?: unknown;
      undo?: unknown;
      redo?: unknown;
    };
    if (record.historyVersion !== EDITOR_HISTORY_VERSION) {
      return false;
    }
    const undo = cloneHistoryCommands(record.undo, this.limit);
    const redo = cloneHistoryCommands(record.redo, this.limit);
    if (!undo || !redo || undo.length + redo.length > this.limit) {
      return false;
    }

    try {
      const base = cloneEditorDocument(this.document);
      for (const command of [...undo].reverse()) {
        if (!applyEditorCommand(base, command, "backward")) {
          return false;
        }
      }
      const replayed = cloneEditorDocument(base);
      for (const command of undo) {
        if (!applyEditorCommand(replayed, command, "forward")) {
          return false;
        }
      }
      if (!documentsEqual(replayed, this.document)) {
        return false;
      }
      const redone = cloneEditorDocument(this.document);
      for (const command of [...redo].reverse()) {
        if (!applyEditorCommand(redone, command, "forward")) {
          return false;
        }
      }
    } catch {
      return false;
    }

    this.transactionBefore = null;
    this.past = undo.map((command) => ({ command, timestamp: 0 }));
    this.future = redo.map((command) => ({ command, timestamp: 0 }));
    this.emit({ kind: "reset", command: null });
    return true;
  }

  private record(command: EditorCommand, options: EditorCoreRecordOptions): void {
    const timestamp = options.timestamp ?? Date.now();
    const previous = this.past[this.past.length - 1];
    const canMerge =
      Boolean(options.mergeKey) &&
      previous?.mergeKey === options.mergeKey &&
      timestamp - previous.timestamp <= this.mergeWindowMs;
    if (canMerge && previous) {
      const merged = mergeEditorCommands(previous.command, command);
      if (merged === null) {
        this.past.pop();
      } else if (merged) {
        previous.command = merged;
        previous.timestamp = timestamp;
      } else {
        this.pushHistory({ command, mergeKey: options.mergeKey, timestamp });
      }
    } else {
      this.pushHistory({ command, mergeKey: options.mergeKey, timestamp });
    }
    this.future = [];
  }

  private pushHistory(entry: HistoryEntry): void {
    this.past.push(entry);
    if (this.past.length > this.limit) {
      this.past.shift();
    }
  }

  private emit(change: EditorCoreChange): void {
    this.listeners.forEach((listener) => listener(change));
  }
}
