import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let error: string | undefined = undefined;
    // Capture the raw throwable so the server-side log keeps the full
    // detail even when we scrub it from the client response below.
    let rawForLog: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message =
          (typeof responseObj.message === "string"
            ? responseObj.message
            : Array.isArray(responseObj.message)
            ? responseObj.message.join(", ")
            : message) || message;
        error = responseObj.error as string | undefined;
      }
    } else if (exception instanceof Error) {
      rawForLog = exception.stack ?? exception.message;
      // Do NOT copy raw Error messages into the client response.
      // Prisma throws like `Unique constraint failed on the fields:
      // ('"email"')` — i.e. leaks column names. `pg` errors can carry
      // query fragments. bcrypt errors mention algorithm internals.
      // Node fs errors leak absolute filesystem paths. Any of these
      // being rendered by a client-side error banner (see the Call
      // Logs page's new red chip) would expose internal detail to the
      // user and potentially to their shoulder-surfers. Surface only
      // the generic "Internal server error" placeholder — the full
      // stack goes to the backend log where ops can correlate it with
      // the same timestamp the client sees.
    }

    // Only 5xx should be scrubbed; 4xx status codes (validation
    // errors, permission denials, conflicts) come from explicit
    // `throw new BadRequestException(...)` / `ForbiddenException`
    // etc. where the message IS the intended user-facing text.
    if (status >= 500) {
      this.logger.error(
        `Unhandled exception @ ${request.method} ${request.url}: ${rawForLog ?? message}`,
      );
      message = "Internal server error";
      error = undefined;
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      ...(error && { error }),
    };

    response.status(status).json(errorResponse);
  }
}
