import { describe, expect, it } from "vitest";
import {
  enclosingClass,
  fieldTypes,
  findDefinition,
  importedName,
  lineAt,
  matchBrace,
  memberCalls,
  namedImports,
  operationOfIdentifier,
  plainCalls,
  tablesFromSchema,
  tablesIn,
} from "./code-scan";

const SERVICE = `import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { PaymentGateway } from "./payment-gateway.js";
import { canCancel, type Rule as R } from "./rules.js";

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: PaymentGateway,
  ) {}

  async create(
    userId: string,
    key: string,
  ): Promise<{ id: string } | null> {
    const text = "a } brace in a string";
    // a { brace in a comment
    const sql = await this.prisma.$queryRaw<{ id: string }[]>\`
      SELECT id FROM seat_locks WHERE id = \${userId}
    \`;
    await this.prisma.booking.update({ where: { id: key }, data: {} });
    return this.findActive(userId);
  }

  private async findActive(userId: string): Promise<{ id: string } | null> {
    if (canCancel(userId)) await this.gateway.cancelPaymentIntent(userId);
    return this.prisma.booking.findFirst({ where: { userId } });
  }
}
`;

describe("findDefinition", () => {
  it("finds a method with a multi-line signature and an object return type", () => {
    const span = findDefinition(SERVICE, "create");
    expect(span).not.toBeNull();
    const body = SERVICE.slice(span?.start, span?.end);
    expect(body.startsWith("async create(")).toBe(true);
    expect(body.trimEnd().endsWith("return this.findActive(userId);\n  }")).toBe(true);
  });

  it("finds private methods, classes and functions", () => {
    expect(SERVICE.slice(findDefinition(SERVICE, "findActive")?.start).startsWith("private")).toBe(
      true,
    );
    const cls = findDefinition(SERVICE, "BookingService");
    expect(SERVICE.slice(cls?.start, cls?.end).trimEnd().endsWith("}")).toBe(true);
    expect(findDefinition("export function a() {\n  return 1;\n}\n", "a")).toEqual({
      start: 0,
      end: 35,
    });
  });

  it("does not mistake a call statement for a method", () => {
    const source = "function Comp() {\n  useEffect(() => {}, []);\n}\n";
    expect(findDefinition(source, "useEffect")).toBeNull();
  });

  it("ends abstract methods and constants at the semicolon", () => {
    const source = "export abstract class P {\n  abstract refund(id: string): Promise<void>;\n}\n";
    const span = findDefinition(source, "refund");
    expect(source.slice(span?.start, span?.end)).toBe(
      "abstract refund(id: string): Promise<void>;",
    );
    expect(findDefinition("export const TTL = 24 * 60;\n", "TTL")).toEqual({ start: 0, end: 27 });
  });

  it("returns null when the name isn't defined", () => {
    expect(findDefinition(SERVICE, "missing")).toBeNull();
  });
});

describe("scanning helpers", () => {
  it("matches braces across strings, comments and template expressions", () => {
    const source = "{ const a = `x ${ { b: 1 }.b }`; /* } */ '}' }";
    expect(matchBrace(source, 0)).toBe(source.length - 1);
  });

  it("counts lines from 1", () => {
    expect(lineAt("a\nb\nc", 0)).toBe(1);
    expect(lineAt("a\nb\nc", 4)).toBe(3);
  });

  it("reads injected fields, imports and aliases", () => {
    expect(fieldTypes(SERVICE).get("gateway")).toBe("PaymentGateway");
    const imports = namedImports(SERVICE);
    expect(imports.get("canCancel")).toBe("./rules.js");
    expect(imports.get("R")).toBe("./rules.js");
    expect(
      importedName('import { register as registerAccount } from "x";', "registerAccount"),
    ).toBe("register");
  });

  it("lists member and plain calls once, in order", () => {
    const body = SERVICE.slice(findDefinition(SERVICE, "findActive")?.start);
    expect(memberCalls(body)).toEqual([{ field: "gateway", method: "cancelPaymentIntent" }]);
    expect(plainCalls(body, ["canCancel", "unused"])).toEqual(["canCancel"]);
    expect(
      plainCalls("@CurrentUser() u; throw new AppError(1); check(u);", [
        "CurrentUser",
        "AppError",
        "check",
      ]),
    ).toEqual(["check"]);
  });

  it("knows the class a position is in", () => {
    expect(enclosingClass(SERVICE, SERVICE.indexOf("findActive(userId: string)"))).toBe(
      "BookingService",
    );
    expect(enclosingClass(SERVICE, 0)).toBeNull();
  });

  it("finds tables from Prisma calls and raw SQL", () => {
    const models = tablesFromSchema(
      'model Booking {\n  id String\n  @@map("bookings")\n}\nmodel BookingSeat {\n  @@map("booking_seats")\n}\n',
    );
    expect(models.get("bookingSeat")).toBe("booking_seats");
    expect(tablesIn(SERVICE, models)).toEqual([
      { table: "bookings", kind: "write" },
      { table: "seat_locks", kind: "sql" },
    ]);
  });

  it("maps generated client names to operations", () => {
    const ops = new Set(["getBooking", "login"]);
    expect(operationOfIdentifier("useGetBooking", ops)).toBe("getBooking");
    expect(operationOfIdentifier("login", ops)).toBe("login");
    expect(operationOfIdentifier("getGetBookingQueryKey", ops)).toBeNull();
  });
});
