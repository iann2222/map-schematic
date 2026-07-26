import type {
  HistoryMarkerSnapshot,
  HistoryCommandLimit,
  HistoryObjectSnapshot,
  HistoryShapeSnapshot,
  HistoryVersion,
  ProjectHistory,
  SerializedEditorCommand,
  SerializedEditorFieldChange,
  StoredHistoryFieldValue
} from "./mapproj-contract";
import {
  isFiniteNumber,
  isNonEmptyString,
  isRecord
} from "../validation/primitives";

export const CURRENT_HISTORY_VERSION = 1 satisfies HistoryVersion;
export const MAX_HISTORY_COMMANDS = 300 satisfies HistoryCommandLimit;

const MAX_BATCH_DEPTH = 12;
const MAX_COMMAND_NODES = 3000;
const MAX_COLLECTION_ITEMS = 1000;

export type HistoryValidationError = {
  path: string;
  message: string;
};

export type HistoryValidationResult = {
  valid: boolean;
  errors: HistoryValidationError[];
};

type ValidationContext = {
  errors: HistoryValidationError[];
  commandNodes: number;
  commandLimitReported: boolean;
};

function isSafeJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 32) {
    return false;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return (
      value.length <= MAX_COLLECTION_ITEMS &&
      value.every((entry) => isSafeJsonValue(entry, depth + 1))
    );
  }
  if (!isRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length <= 100 &&
    keys.every(
      (key) =>
        key !== "__proto__" &&
        key !== "constructor" &&
        key !== "prototype" &&
        isSafeJsonValue(value[key], depth + 1)
    )
  );
}

function validateOptionalString(
  value: unknown,
  path: string,
  errors: HistoryValidationError[]
): void {
  if (value !== undefined && typeof value !== "string") {
    errors.push({ path, message: "must be a string" });
  }
}

function validateFiniteFields(
  value: Record<string, unknown>,
  fields: string[],
  path: string,
  errors: HistoryValidationError[]
): void {
  for (const field of fields) {
    if (!isFiniteNumber(value[field])) {
      errors.push({
        path: `${path}.${field}`,
        message: "must be a finite number"
      });
    }
  }
}

function validateStringFields(
  value: Record<string, unknown>,
  fields: string[],
  path: string,
  errors: HistoryValidationError[]
): void {
  for (const field of fields) {
    if (typeof value[field] !== "string") {
      errors.push({ path: `${path}.${field}`, message: "must be a string" });
    }
  }
}

function validateMarkerSnapshot(
  value: Record<string, unknown>,
  path: string,
  errors: HistoryValidationError[]
): value is HistoryMarkerSnapshot {
  const errorCount = errors.length;
  if (!isNonEmptyString(value.id)) {
    errors.push({ path: `${path}.id`, message: "must be a non-empty string" });
  }
  if (!isNonEmptyString(value.layerId)) {
    errors.push({
      path: `${path}.layerId`,
      message: "must be a non-empty string"
    });
  }
  if (typeof value.name !== "string") {
    errors.push({ path: `${path}.name`, message: "must be a string" });
  }
  validateOptionalString(value.nameAlt, `${path}.nameAlt`, errors);
  validateOptionalString(value.displayName, `${path}.displayName`, errors);
  validateOptionalString(value.sourceId, `${path}.sourceId`, errors);
  validateOptionalString(value.labelName, `${path}.labelName`, errors);
  validateFiniteFields(value, ["latitude", "longitude"], path, errors);
  if (
    value.sourceType !== "geonames" &&
    value.sourceType !== "coords" &&
    value.sourceType !== "manual"
  ) {
    errors.push({
      path: `${path}.sourceType`,
      message: "must be geonames, coords, or manual"
    });
  }
  if (value.labelMode !== "name" && value.labelMode !== "coords") {
    errors.push({
      path: `${path}.labelMode`,
      message: "must be name or coords"
    });
  }
  if (value.showLabel !== undefined && typeof value.showLabel !== "boolean") {
    errors.push({ path: `${path}.showLabel`, message: "must be a boolean" });
  }
  if (
    value.kind !== undefined &&
    value.kind !== "label" &&
    value.kind !== "point"
  ) {
    errors.push({ path: `${path}.kind`, message: "must be label or point" });
  }
  if (!isRecord(value.style)) {
    errors.push({ path: `${path}.style`, message: "must be an object" });
  } else {
    validateFiniteFields(
      value.style,
      ["dotSize", "textSize", "textOffsetX", "textOffsetY"],
      `${path}.style`,
      errors
    );
    validateStringFields(
      value.style,
      ["dotColor", "textColor", "fontFamily"],
      `${path}.style`,
      errors
    );
    if (
      value.style.textAnchor !== undefined &&
      value.style.textAnchor !== "start" &&
      value.style.textAnchor !== "end"
    ) {
      errors.push({
        path: `${path}.style.textAnchor`,
        message: "must be start or end"
      });
    }
  }
  return errors.length === errorCount;
}

function validateShapeSnapshot(
  value: Record<string, unknown>,
  path: string,
  errors: HistoryValidationError[]
): value is HistoryShapeSnapshot {
  const errorCount = errors.length;
  if (!isNonEmptyString(value.id)) {
    errors.push({ path: `${path}.id`, message: "must be a non-empty string" });
  }
  if (!isNonEmptyString(value.layerId)) {
    errors.push({
      path: `${path}.layerId`,
      message: "must be a non-empty string"
    });
  }
  if (
    value.type !== "line" &&
    value.type !== "area" &&
    value.type !== "text" &&
    value.type !== "arrow"
  ) {
    errors.push({
      path: `${path}.type`,
      message: "must be line, area, text, or arrow"
    });
  }
  validateOptionalString(value.displayName, `${path}.displayName`, errors);
  validateOptionalString(value.text, `${path}.text`, errors);
  validateFiniteFields(
    value,
    ["longitude", "latitude", "width", "height"],
    path,
    errors
  );
  if (value.rotation !== undefined && !isFiniteNumber(value.rotation)) {
    errors.push({
      path: `${path}.rotation`,
      message: "must be a finite number"
    });
  }
  if (!isRecord(value.style)) {
    errors.push({ path: `${path}.style`, message: "must be an object" });
  } else {
    validateFiniteFields(
      value.style,
      ["strokeWidth", "fillOpacity", "textSize"],
      `${path}.style`,
      errors
    );
    validateStringFields(
      value.style,
      ["strokeColor", "fillColor", "textColor", "fontFamily"],
      `${path}.style`,
      errors
    );
  }
  return errors.length === errorCount;
}

function validateObjectSnapshot(
  value: unknown,
  path: string,
  errors: HistoryValidationError[]
): value is HistoryObjectSnapshot {
  if (!isRecord(value)) {
    errors.push({ path, message: "must be an object" });
    return false;
  }
  if (value.objectKind === "marker") {
    return validateMarkerSnapshot(value, path, errors);
  }
  if (value.objectKind === "shape") {
    return validateShapeSnapshot(value, path, errors);
  }
  errors.push({
    path: `${path}.objectKind`,
    message: "must be marker or shape"
  });
  return false;
}

function validateStoredFieldValue(
  value: unknown,
  path: string,
  errors: HistoryValidationError[]
): value is StoredHistoryFieldValue {
  const errorCount = errors.length;
  if (!isRecord(value) || typeof value.present !== "boolean") {
    errors.push({
      path,
      message: "must contain a boolean present field"
    });
    return false;
  }
  if (!value.present) {
    return true;
  }
  if (
    typeof value.value !== "string" &&
    typeof value.value !== "boolean" &&
    !isFiniteNumber(value.value)
  ) {
    errors.push({
      path: `${path}.value`,
      message: "must be a JSON-safe scalar"
    });
    return false;
  }
  return errors.length === errorCount;
}

function validateFieldChange(
  value: unknown,
  path: string,
  errors: HistoryValidationError[]
): value is SerializedEditorFieldChange {
  const errorCount = errors.length;
  if (!isRecord(value)) {
    errors.push({ path, message: "must be an object" });
    return false;
  }
  const fieldPath = value.path;
  const unsafeFields = new Set(["__proto__", "constructor", "prototype"]);
  const validPath =
    Array.isArray(fieldPath) &&
    ((fieldPath.length === 1 &&
      isNonEmptyString(fieldPath[0]) &&
      !unsafeFields.has(fieldPath[0]) &&
      !["id", "objectKind", "style"].includes(fieldPath[0])) ||
      (fieldPath.length === 2 &&
        fieldPath[0] === "style" &&
        isNonEmptyString(fieldPath[1]) &&
        !unsafeFields.has(fieldPath[1])));
  if (!validPath) {
    errors.push({ path: `${path}.path`, message: "must be an editable field path" });
  }
  validateStoredFieldValue(value.before, `${path}.before`, errors);
  validateStoredFieldValue(value.after, `${path}.after`, errors);
  return validPath && errors.length === errorCount;
}

function validateStringArray(
  value: unknown,
  path: string,
  errors: HistoryValidationError[]
): value is string[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_COLLECTION_ITEMS ||
    value.some((entry) => typeof entry !== "string")
  ) {
    errors.push({
      path,
      message: `must be an array of at most ${MAX_COLLECTION_ITEMS} strings`
    });
    return false;
  }
  return true;
}

function validateIndex(
  value: unknown,
  path: string,
  minimum: number,
  errors: HistoryValidationError[]
): void {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    errors.push({
      path,
      message: `must be an integer greater than or equal to ${minimum}`
    });
  }
}

function validateCommand(
  value: unknown,
  path: string,
  depth: number,
  context: ValidationContext
): value is SerializedEditorCommand {
  const errorCount = context.errors.length;
  context.commandNodes += 1;
  if (
    context.commandNodes > MAX_COMMAND_NODES &&
    !context.commandLimitReported
  ) {
    context.errors.push({
      path,
      message: `history must contain at most ${MAX_COMMAND_NODES} command nodes`
    });
    context.commandLimitReported = true;
    return false;
  }
  if (depth > MAX_BATCH_DEPTH) {
    context.errors.push({
      path,
      message: `batch depth must not exceed ${MAX_BATCH_DEPTH}`
    });
    return false;
  }
  if (!isRecord(value) || typeof value.type !== "string") {
    context.errors.push({ path, message: "must be a command object" });
    return false;
  }
  const errors = context.errors;
  if (value.type === "add-object" || value.type === "remove-object") {
    validateObjectSnapshot(value.object, `${path}.object`, errors);
    validateIndex(value.objectIndex, `${path}.objectIndex`, 0, errors);
    validateIndex(value.listOrderIndex, `${path}.listOrderIndex`, -1, errors);
    validateIndex(
      value.displayOrderIndex,
      `${path}.displayOrderIndex`,
      -1,
      errors
    );
    return errors.length === errorCount;
  }
  if (value.type === "update-object") {
    if (!isNonEmptyString(value.objectId)) {
      errors.push({
        path: `${path}.objectId`,
        message: "must be a non-empty string"
      });
    }
    if (value.objectKind !== "marker" && value.objectKind !== "shape") {
      errors.push({
        path: `${path}.objectKind`,
        message: "must be marker or shape"
      });
    }
    if (
      !Array.isArray(value.changes) ||
      value.changes.length === 0 ||
      value.changes.length > MAX_COLLECTION_ITEMS
    ) {
      errors.push({
        path: `${path}.changes`,
        message: `must contain 1 to ${MAX_COLLECTION_ITEMS} field changes`
      });
    } else {
      const paths = new Set<string>();
      value.changes.forEach((change, index) => {
        validateFieldChange(change, `${path}.changes[${index}]`, errors);
        if (isRecord(change) && Array.isArray(change.path)) {
          const key = change.path.join(".");
          if (paths.has(key)) {
            errors.push({
              path: `${path}.changes[${index}].path`,
              message: "must be unique within the command"
            });
          }
          paths.add(key);
        }
      });
    }
    return errors.length === errorCount;
  }
  if (value.type === "reorder-objects") {
    if (value.mode !== "list" && value.mode !== "display") {
      errors.push({
        path: `${path}.mode`,
        message: "must be list or display"
      });
    }
    validateStringArray(value.before, `${path}.before`, errors);
    validateStringArray(value.after, `${path}.after`, errors);
    return errors.length === errorCount;
  }
  if (value.type === "clear-objects") {
    if (
      !Array.isArray(value.objects) ||
      value.objects.length > MAX_COLLECTION_ITEMS
    ) {
      errors.push({
        path: `${path}.objects`,
        message: `must contain at most ${MAX_COLLECTION_ITEMS} objects`
      });
    } else {
      value.objects.forEach((object, index) =>
        validateObjectSnapshot(object, `${path}.objects[${index}]`, errors)
      );
    }
    validateStringArray(value.listOrderKeys, `${path}.listOrderKeys`, errors);
    validateStringArray(
      value.displayOrderKeys,
      `${path}.displayOrderKeys`,
      errors
    );
    return errors.length === errorCount;
  }
  if (value.type === "batch") {
    if (
      !Array.isArray(value.commands) ||
      value.commands.length === 0 ||
      value.commands.length > MAX_COLLECTION_ITEMS
    ) {
      errors.push({
        path: `${path}.commands`,
        message: `must contain 1 to ${MAX_COLLECTION_ITEMS} commands`
      });
    } else {
      value.commands.forEach((command, index) => {
        if (context.commandNodes <= MAX_COMMAND_NODES) {
          validateCommand(
            command,
            `${path}.commands[${index}]`,
            depth + 1,
            context
          );
        }
      });
    }
    return errors.length === errorCount;
  }
  errors.push({ path: `${path}.type`, message: "unsupported history command" });
  return false;
}

export function createEmptyProjectHistory(): ProjectHistory {
  return {
    historyVersion: CURRENT_HISTORY_VERSION,
    undo: [],
    redo: []
  };
}

export function validateProjectHistory(
  value: unknown,
  path = "history"
): HistoryValidationResult {
  const errors: HistoryValidationError[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      errors: [{ path, message: "must be an object" }]
    };
  }
  if (!isSafeJsonValue(value)) {
    return {
      valid: false,
      errors: [{ path, message: "must contain JSON-safe command data" }]
    };
  }
  if (value.historyVersion !== CURRENT_HISTORY_VERSION) {
    errors.push({
      path: `${path}.historyVersion`,
      message: `must be ${CURRENT_HISTORY_VERSION}`
    });
  }
  const context: ValidationContext = {
    errors,
    commandNodes: 0,
    commandLimitReported: false
  };
  const stacks: unknown[][] = [];
  for (const field of ["undo", "redo"] as const) {
    const stack = value[field];
    if (!Array.isArray(stack)) {
      errors.push({ path: `${path}.${field}`, message: "must be an array" });
      continue;
    }
    if (stack.length > MAX_HISTORY_COMMANDS) {
      errors.push({
        path: `${path}.${field}`,
        message: `must contain at most ${MAX_HISTORY_COMMANDS} commands`
      });
      continue;
    }
    stacks.push(stack);
    stack.forEach((command, index) => {
      if (context.commandNodes <= MAX_COMMAND_NODES) {
        validateCommand(command, `${path}.${field}[${index}]`, 0, context);
      }
    });
  }
  if (
    stacks.length === 2 &&
    stacks[0].length + stacks[1].length > MAX_HISTORY_COMMANDS
  ) {
    errors.push({
      path,
      message: `must contain at most ${MAX_HISTORY_COMMANDS} commands in total`
    });
  }
  return { valid: errors.length === 0, errors };
}

export function migrateLegacyProjectHistory(value: unknown): ProjectHistory {
  if (!isRecord(value)) {
    return createEmptyProjectHistory();
  }
  const candidate = {
    historyVersion: CURRENT_HISTORY_VERSION,
    undo: value.undo,
    redo: value.redo
  };
  return validateProjectHistory(candidate).valid
    ? (candidate as ProjectHistory)
    : createEmptyProjectHistory();
}
