import { randomUUID } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Argon2id password hashing.
 *
 * Parameters come from the environment (`ARGON2_*`) so cost can be raised
 * without a code change. Hashes embed their own parameters, so raising the cost
 * does not invalidate existing hashes — `verify` reads them from the hash.
 */
@Injectable()
export class PasswordService {
  private readonly options: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  };

  constructor(config: ConfigService) {
    this.options = {
      memoryCost: config.get<number>('auth.argon2.memoryCost') ?? 65536,
      timeCost: config.get<number>('auth.argon2.timeCost') ?? 3,
      parallelism: config.get<number>('auth.argon2.parallelism') ?? 1,
    };
  }

  async hash(plain: string): Promise<string> {
    return hash(plain, { algorithm: 2 /* argon2id */, ...this.options });
  }

  async verify(storedHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(storedHash, plain);
    } catch {
      // Malformed/unreadable hash — treat as a failed verification, never a
      // 500, and never log the input.
      return false;
    }
  }

  private dummyHash?: string;

  /**
   * Verification target for accounts that do not exist (or have no password).
   *
   * Running a real Argon2id round keeps "no such user" on the same timing path
   * as "wrong password"; a syntactically bogus hash would return instantly and
   * turn response time into an account-existence oracle.
   */
  async verifyAgainstDummy(plain: string): Promise<boolean> {
    this.dummyHash ??= await hash(randomUUID(), {
      algorithm: 2 /* argon2id */,
      ...this.options,
    });
    return this.verify(this.dummyHash, plain);
  }
}
