import { Module } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { AllExceptionsFilter } from "./errors/all-exceptions.filter.js";

/** Cross-cutting providers: the global error filter and the global (Zod) validation pipe. */
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class CommonModule {}
