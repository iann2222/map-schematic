import { cloneEditorDocument, cloneEditorObject } from "./document.js";
import type { EditorDocument, EditorObject } from "./types.js";

export type StoredFieldValue =
  | { present: false }
  | { present: true; value: string | number | boolean };

export type EditorFieldChange = {
  path: [string] | ["style", string];
  before: StoredFieldValue;
  after: StoredFieldValue;
};

export type EditorCommand =
  | {
      type: "add-object";
      object: EditorObject;
      objectIndex: number;
      listOrderIndex: number;
      displayOrderIndex: number;
    }
  | {
      type: "remove-object";
      object: EditorObject;
      objectIndex: number;
      listOrderIndex: number;
      displayOrderIndex: number;
    }
  | {
      type: "update-object";
      objectId: string;
      objectKind: EditorObject["objectKind"];
      changes: EditorFieldChange[];
    }
  | {
      type: "reorder-objects";
      mode: "list" | "display";
      before: string[];
      after: string[];
    }
  | {
      type: "clear-objects";
      objects: EditorObject[];
      listOrderKeys: string[];
      displayOrderKeys: string[];
    }
  | {
      type: "batch";
      commands: EditorCommand[];
    };

export type EditorCommandDirection = "forward" | "backward";

function objectKey(object: EditorObject): string {
  return `${object.objectKind}:${object.id}`;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function storedValue(
  source: Record<string, unknown>,
  key: string,
): StoredFieldValue {
  if (!Object.prototype.hasOwnProperty.call(source, key)) {
    return { present: false };
  }
  const value = source[key];
  if (value === undefined) {
    return { present: false };
  }
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    throw new Error(`Unsupported editor field value: ${key}`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`Editor field must be finite: ${key}`);
  }
  return { present: true, value };
}

function fieldValueEqual(left: StoredFieldValue, right: StoredFieldValue): boolean {
  return valuesEqual(left, right);
}

function collectFieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix?: "style",
): EditorFieldChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: EditorFieldChange[] = [];
  keys.forEach((key) => {
    if (!prefix && (key === "id" || key === "objectKind" || key === "style")) {
      return;
    }
    const beforeValue = storedValue(before, key);
    const afterValue = storedValue(after, key);
    if (fieldValueEqual(beforeValue, afterValue)) {
      return;
    }
    changes.push({
      path: prefix ? [prefix, key] : [key],
      before: beforeValue,
      after: afterValue,
    });
  });
  return changes;
}

function insertAt<T>(items: T[], index: number, value: T): void {
  items.splice(Math.max(0, Math.min(index, items.length)), 0, value);
}

function removeValue(items: string[], value: string): void {
  const index = items.indexOf(value);
  if (index >= 0) {
    items.splice(index, 1);
  }
}

function replaceDocument(target: EditorDocument, source: EditorDocument): void {
  const cloned = cloneEditorDocument(source);
  target.objects.splice(0, target.objects.length, ...cloned.objects);
  target.listOrderKeys.splice(
    0,
    target.listOrderKeys.length,
    ...cloned.listOrderKeys,
  );
  target.displayOrderKeys.splice(
    0,
    target.displayOrderKeys.length,
    ...cloned.displayOrderKeys,
  );
}

function applyStoredValue(
  target: Record<string, unknown>,
  key: string,
  value: StoredFieldValue,
): void {
  if (!value.present) {
    delete target[key];
    return;
  }
  target[key] = value.value;
}

function applyObjectPresenceCommand(
  document: EditorDocument,
  command: Extract<EditorCommand, { type: "add-object" | "remove-object" }>,
  shouldExist: boolean,
): boolean {
  const currentIndex = document.objects.findIndex(
    (object) => object.id === command.object.id,
  );
  const key = objectKey(command.object);
  if (shouldExist) {
    if (
      currentIndex >= 0 ||
      document.listOrderKeys.includes(key) ||
      document.displayOrderKeys.includes(key)
    ) {
      return false;
    }
    insertAt(document.objects, command.objectIndex, cloneEditorObject(command.object));
    if (command.listOrderIndex >= 0) {
      insertAt(document.listOrderKeys, command.listOrderIndex, key);
    }
    if (command.displayOrderIndex >= 0) {
      insertAt(document.displayOrderKeys, command.displayOrderIndex, key);
    }
    return true;
  }
  if (
    currentIndex < 0 ||
    !valuesEqual(document.objects[currentIndex], command.object) ||
    (command.listOrderIndex >= 0 &&
      document.listOrderKeys.indexOf(key) !== command.listOrderIndex) ||
    (command.displayOrderIndex >= 0 &&
      document.displayOrderKeys.indexOf(key) !== command.displayOrderIndex)
  ) {
    return false;
  }
  document.objects.splice(currentIndex, 1);
  removeValue(document.listOrderKeys, key);
  removeValue(document.displayOrderKeys, key);
  return true;
}

function applyUpdateCommand(
  document: EditorDocument,
  command: Extract<EditorCommand, { type: "update-object" }>,
  direction: EditorCommandDirection,
): boolean {
  const object = document.objects.find((item) => item.id === command.objectId);
  if (!object || object.objectKind !== command.objectKind) {
    return false;
  }
  const paths = command.changes.map((change) => change.path.join("."));
  if (
    command.changes.length === 0 ||
    new Set(paths).size !== paths.length ||
    command.changes.some(
      (change) =>
        (change.path.length === 1 &&
          ["id", "objectKind", "style"].includes(change.path[0])) ||
        (change.path.length === 2 && change.path[0] !== "style"),
    )
  ) {
    return false;
  }
  const expectedSide = direction === "forward" ? "before" : "after";
  for (const change of command.changes) {
    const target =
      change.path[0] === "style"
        ? (object.style as unknown as Record<string, unknown>)
        : (object as unknown as Record<string, unknown>);
    const key = change.path[change.path.length - 1];
    if (!fieldValueEqual(storedValue(target, key), change[expectedSide])) {
      return false;
    }
  }
  const nextSide = direction === "forward" ? "after" : "before";
  command.changes.forEach((change) => {
    const target =
      change.path[0] === "style"
        ? (object.style as unknown as Record<string, unknown>)
        : (object as unknown as Record<string, unknown>);
    applyStoredValue(target, change.path[change.path.length - 1], change[nextSide]);
  });
  return true;
}

function applyReorderCommand(
  document: EditorDocument,
  command: Extract<EditorCommand, { type: "reorder-objects" }>,
  direction: EditorCommandDirection,
): boolean {
  const target =
    command.mode === "list"
      ? document.listOrderKeys
      : document.displayOrderKeys;
  const expected = direction === "forward" ? command.before : command.after;
  const next = direction === "forward" ? command.after : command.before;
  if (!sameOrderMembers(command.before, command.after) || !valuesEqual(target, expected)) {
    return false;
  }
  target.splice(0, target.length, ...next);
  return true;
}

function applyClearCommand(
  document: EditorDocument,
  command: Extract<EditorCommand, { type: "clear-objects" }>,
  direction: EditorCommandDirection,
): boolean {
  if (direction === "forward") {
    if (
      !valuesEqual(document.objects, command.objects) ||
      !valuesEqual(document.listOrderKeys, command.listOrderKeys) ||
      !valuesEqual(document.displayOrderKeys, command.displayOrderKeys)
    ) {
      return false;
    }
    document.objects.splice(0);
    document.listOrderKeys.splice(0);
    document.displayOrderKeys.splice(0);
    return true;
  }
  if (
    document.objects.length > 0 ||
    document.listOrderKeys.length > 0 ||
    document.displayOrderKeys.length > 0
  ) {
    return false;
  }
  replaceDocument(document, {
    objects: command.objects,
    listOrderKeys: command.listOrderKeys,
    displayOrderKeys: command.displayOrderKeys,
  });
  return true;
}

export function applyEditorCommand(
  document: EditorDocument,
  command: EditorCommand,
  direction: EditorCommandDirection,
): boolean {
  if (command.type === "add-object") {
    return applyObjectPresenceCommand(
      document,
      command,
      direction === "forward",
    );
  }
  if (command.type === "remove-object") {
    return applyObjectPresenceCommand(
      document,
      command,
      direction === "backward",
    );
  }
  if (command.type === "update-object") {
    return applyUpdateCommand(document, command, direction);
  }
  if (command.type === "reorder-objects") {
    return applyReorderCommand(document, command, direction);
  }
  if (command.type === "clear-objects") {
    return applyClearCommand(document, command, direction);
  }
  const commands =
    direction === "forward" ? command.commands : [...command.commands].reverse();
  const working = cloneEditorDocument(document);
  for (const child of commands) {
    if (!applyEditorCommand(working, child, direction)) {
      return false;
    }
  }
  replaceDocument(document, working);
  return true;
}

export function createAddObjectCommand(
  document: EditorDocument,
  object: EditorObject,
): EditorCommand {
  return {
    type: "add-object",
    object: cloneEditorObject(object),
    objectIndex: document.objects.length,
    listOrderIndex: document.listOrderKeys.length,
    displayOrderIndex: document.displayOrderKeys.length,
  };
}

export function createRemoveObjectCommand(
  document: EditorDocument,
  objectId: string,
): EditorCommand | null {
  const objectIndex = document.objects.findIndex((object) => object.id === objectId);
  if (objectIndex < 0) {
    return null;
  }
  const object = document.objects[objectIndex];
  const key = objectKey(object);
  return {
    type: "remove-object",
    object: cloneEditorObject(object),
    objectIndex,
    listOrderIndex: document.listOrderKeys.indexOf(key),
    displayOrderIndex: document.displayOrderKeys.indexOf(key),
  };
}

export function createUpdateObjectCommand(
  before: EditorObject,
  after: EditorObject,
): EditorCommand | null {
  if (before.id !== after.id || before.objectKind !== after.objectKind) {
    throw new Error("Cannot update a different editor object");
  }
  const changes = [
    ...collectFieldChanges(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    ),
    ...collectFieldChanges(
      before.style as unknown as Record<string, unknown>,
      after.style as unknown as Record<string, unknown>,
      "style",
    ),
  ];
  if (changes.length === 0) {
    return null;
  }
  return {
    type: "update-object",
    objectId: before.id,
    objectKind: before.objectKind,
    changes,
  };
}

export function createReorderCommand(
  mode: "list" | "display",
  before: string[],
  after: string[],
): EditorCommand | null {
  if (valuesEqual(before, after)) {
    return null;
  }
  if (!sameOrderMembers(before, after)) {
    return null;
  }
  return {
    type: "reorder-objects",
    mode,
    before: [...before],
    after: [...after],
  };
}

function sameOrderMembers(left: string[], right: string[]): boolean {
  if (left.length !== right.length || new Set(left).size !== left.length) {
    return false;
  }
  const rightSet = new Set(right);
  return rightSet.size === right.length && left.every((key) => rightSet.has(key));
}

export function createClearObjectsCommand(
  document: EditorDocument,
): EditorCommand | null {
  if (
    document.objects.length === 0 &&
    document.listOrderKeys.length === 0 &&
    document.displayOrderKeys.length === 0
  ) {
    return null;
  }
  return {
    type: "clear-objects",
    objects: document.objects.map(cloneEditorObject),
    listOrderKeys: [...document.listOrderKeys],
    displayOrderKeys: [...document.displayOrderKeys],
  };
}

export function createDocumentChangeCommand(
  before: EditorDocument,
  after: EditorDocument,
): EditorCommand | null {
  const commands: EditorCommand[] = [];
  const working = cloneEditorDocument(before);
  const afterById = new Map(after.objects.map((object) => [object.id, object]));
  const applyAndPush = (command: EditorCommand | null): void => {
    if (!command) {
      return;
    }
    if (!applyEditorCommand(working, command, "forward")) {
      throw new Error("Could not build a consistent editor command");
    }
    commands.push(command);
  };
  [...working.objects].forEach((object) => {
    const next = afterById.get(object.id);
    if (!next || next.objectKind !== object.objectKind) {
      applyAndPush(createRemoveObjectCommand(working, object.id));
    }
  });
  after.objects.forEach((object) => {
    const current = working.objects.find((item) => item.id === object.id);
    if (current) {
      applyAndPush(createUpdateObjectCommand(current, object));
      return;
    }
    const key = objectKey(object);
    applyAndPush({
      type: "add-object",
      object: cloneEditorObject(object),
      objectIndex: after.objects.findIndex((item) => item.id === object.id),
      listOrderIndex: after.listOrderKeys.indexOf(key),
      displayOrderIndex: after.displayOrderKeys.indexOf(key),
    });
  });
  const listCommand = createReorderCommand(
    "list",
    working.listOrderKeys,
    after.listOrderKeys,
  );
  applyAndPush(listCommand);
  const displayCommand = createReorderCommand(
    "display",
    working.displayOrderKeys,
    after.displayOrderKeys,
  );
  applyAndPush(displayCommand);
  if (!valuesEqual(working, after)) {
    throw new Error("Editor document changes cannot be represented as commands");
  }
  if (commands.length === 0) {
    return null;
  }
  return commands.length === 1 ? commands[0] : { type: "batch", commands };
}

export function mergeEditorCommands(
  previous: EditorCommand,
  next: EditorCommand,
): EditorCommand | null | undefined {
  if (
    previous.type !== "update-object" ||
    next.type !== "update-object" ||
    previous.objectId !== next.objectId ||
    previous.objectKind !== next.objectKind
  ) {
    return undefined;
  }
  const merged = new Map<string, EditorFieldChange>();
  previous.changes.forEach((change) => {
    merged.set(change.path.join("."), {
      path: [...change.path] as EditorFieldChange["path"],
      before: change.before,
      after: change.after,
    });
  });
  next.changes.forEach((change) => {
    const key = change.path.join(".");
    const current = merged.get(key);
    if (current) {
      current.after = change.after;
      if (fieldValueEqual(current.before, current.after)) {
        merged.delete(key);
      }
      return;
    }
    merged.set(key, change);
  });
  const changes = [...merged.values()];
  if (changes.length === 0) {
    return null;
  }
  return { ...previous, changes };
}
