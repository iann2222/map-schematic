import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { DataPackError, datapackError } from "./errors";
import type { DataPackIssue } from "./types";

type Claim = { pid: number; ticket: number | null };
type LockOptions = { timeoutMs?: number; onWarning?: (issue: DataPackIssue) => void };

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}

async function writeClaim(file: string, claim: Claim): Promise<void> {
  const temporary = `${file}.writing-${randomUUID()}`;
  try {
    await fs.writeFile(temporary, JSON.stringify(claim), { flag: "wx" });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function exists(file: string): Promise<boolean> {
  try { await fs.access(file); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function removeClaim(file: string): Promise<void> {
  // Remove the owner first. Keep its release marker if that removal fails.
  await fs.rm(file, { force: true });
  await fs.rm(`${file}.ticket`, { force: true });
  await fs.rm(`${file}.released`, { force: true });
}

async function readClaims(directory: string): Promise<Array<Claim & { file: string }>> {
  const claims: Array<Claim & { file: string }> = [];
  for (const name of await fs.readdir(directory)) {
    if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
    const file = path.join(directory, name);
    let claim: Claim;
    try {
      claim = JSON.parse(await fs.readFile(file, "utf8")) as Claim;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!claim || !Number.isSafeInteger(claim.pid) || claim.pid <= 0 ||
        (claim.ticket !== null && (!Number.isSafeInteger(claim.ticket) || claim.ticket < 0))) {
      throw new Error(`Invalid datapack lock record: ${file}`);
    }
    if (await exists(`${file}.released`) || !processAlive(claim.pid)) {
      // Released/dead records are harmless even when deletion must be deferred.
      await removeClaim(file).catch(() => undefined);
    } else {
      try {
        const decision = JSON.parse(await fs.readFile(`${file}.ticket`, "utf8")) as Claim;
        if (decision.pid !== claim.pid || !Number.isSafeInteger(decision.ticket) || (decision.ticket ?? 0) <= 0) {
          throw new Error(`Invalid datapack lock ticket: ${file}`);
        }
        claim.ticket = decision.ticket;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      claims.push({ ...claim, file });
    }
  }
  return claims;
}

// Bakery-style tickets use unique records: reclaiming a dead owner can never delete
// a newly acquired lock. No age timeout may evict an owner that is still alive.
export async function withDatapackLock<T>(
  dataRoot: string,
  name: "install" | "access",
  operation: () => Promise<T>,
  options: LockOptions = {},
): Promise<T> {
  const directory = path.join(dataRoot, ".locks", name);
  const file = path.join(directory, `${randomUUID()}.json`);
  const timeout = options.timeoutMs ?? 30_000;
  const started = Date.now();
  let claimed = false;
  try {
    await fs.mkdir(directory, { recursive: true });
    await writeClaim(file, { pid: process.pid, ticket: null });
    claimed = true;
    const existing = await readClaims(directory);
    const ticket = Math.max(0, ...existing.map((claim) => claim.ticket ?? 0)) + 1;
    // Publish each phase once: Windows readers never prevent replacing a record.
    await writeClaim(`${file}.ticket`, { pid: process.pid, ticket });
    while (true) {
      const others = (await readClaims(directory)).filter((claim) => claim.file !== file);
      const waiting = others.some((claim) => claim.ticket === null ||
        (claim.ticket !== 0 && (claim.ticket < ticket || (claim.ticket === ticket && claim.file < file))));
      if (!waiting) break;
      if (Date.now() - started >= timeout) {
        throw new DataPackError({ code: "busy", stage: "lock",
          message: "另一個程式正在使用或更新此資料包，請稍後再試。" });
      }
      await delay(25);
    }
  } catch (error) {
    if (claimed) await releaseClaim(file, options);
    throw datapackError(error, "lock");
  }
  try {
    return await operation();
  } finally {
    await releaseClaim(file, options);
  }
}

async function releaseClaim(file: string, options: LockOptions): Promise<void> {
  try {
    await fs.writeFile(`${file}.released`, "", { flag: "wx" });
    await removeClaim(file);
  } catch (error) {
    try { await removeClaim(file); }
    catch {
      const issue = datapackError(error, "cleanup").issue;
      if (options.onWarning) options.onWarning(issue);
      else console.warn("Datapack lock cleanup:", issue.message);
    }
  }
}
