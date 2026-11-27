import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { z } from "zod/v4";

import type { FoundryDirectCredentials } from "./types.js";

const CredentialsSchema = z.object({
  worldId: z.string().min(1),
  userId: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export class DirectCredentialStore {
  constructor(private readonly path: string) {}

  async load(): Promise<FoundryDirectCredentials | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    const parsed = CredentialsSchema.parse(JSON.parse(raw));
    return parsed;
  }

  async save(input: Omit<FoundryDirectCredentials, "createdAt" | "updatedAt">): Promise<FoundryDirectCredentials> {
    const existing = await this.load().catch(() => undefined);
    const now = new Date().toISOString();
    const credentials: FoundryDirectCredentials = {
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = join(dirname(this.path), `.${Date.now()}-${process.pid}.tmp`);
    await writeFile(temporary, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, this.path);
    await chmod(this.path, 0o600);
    return credentials;
  }
}
