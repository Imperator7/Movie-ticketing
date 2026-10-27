import { loadDb, resetDb, saveDb, type PayOutcome } from "./db";
import { fastForwardPayment, setOutcome, takeSeatsAsSomeoneElse } from "./service";

/** Actions behind the floating demo-controls panel. They change the mock server's state directly. */

export function getOutcome(): PayOutcome {
  return loadDb().outcome;
}

export function demoSetOutcome(outcome: PayOutcome): void {
  const db = loadDb();
  setOutcome(db, outcome);
  saveDb(db);
}

/** Someone else buys the given seats. Returns how many were taken. */
export function demoTakeSeats(seatIds: string[]): number {
  const db = loadDb();
  const taken = takeSeatsAsSomeoneElse(db, seatIds);
  saveDb(db);
  return taken.length;
}

/** Moves the payment deadline of the in-progress booking to `ms` from now. */
export function demoFastForward(ms: number): boolean {
  const db = loadDb();
  const pending = db.bookings.find((b) => b.status === "PENDING_PAYMENT");
  const done = pending ? fastForwardPayment(db, pending.userId, Date.now(), ms) : false;
  saveDb(db);
  return done;
}

export function demoReset(): void {
  resetDb();
}

export { DEMO_EMAIL, DEMO_PASSWORD } from "./db";
