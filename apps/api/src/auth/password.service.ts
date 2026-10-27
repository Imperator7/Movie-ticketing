import { randomBytes } from "node:crypto";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import { hashPassword, verifyPassword } from "./password.js";

@Injectable()
export class PasswordService implements OnModuleInit {
  /** A real argon2id hash of a random password nobody knows, verified against when the email is unknown. */
  private dummyHash = "";

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashPassword(randomBytes(24).toString("base64url"));
  }

  hash(password: string): Promise<string> {
    return hashPassword(password);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verifyPassword(passwordHash, password);
  }

  /**
   * Spends the same time as a real verification so an unknown email cannot be told apart by timing.
   * Always returns false.
   */
  async verifyDummy(password: string): Promise<false> {
    await verifyPassword(this.dummyHash, password);
    return false;
  }
}
