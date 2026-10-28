import { HttpStatus, Injectable, type PipeTransform } from "@nestjs/common";
import { z } from "zod";
import { AppException } from "../errors/app.exception.js";
import { ErrorCode } from "../errors/error-code.js";

const notFound = (): AppException =>
  new AppException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, "Resource not found");

const uuid = z.uuid();
const slug = z.string().regex(/^[a-z0-9-]{1,120}$/);

/**
 * Path ids that are not UUIDs can never exist, so they answer 404 like an unknown id (the spec lists no 422 for
 * path parameters) and never reach the database.
 */
@Injectable()
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!uuid.safeParse(value).success) throw notFound();
    return value;
  }
}

/** Same idea for movie slugs: only `a-z`, `0-9` and `-`, at most 120 characters. */
@Injectable()
export class SlugParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!slug.safeParse(value).success) throw notFound();
    return value;
  }
}
