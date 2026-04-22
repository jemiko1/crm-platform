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
    // Capture the raw throwable — the server-side log ALWAYS gets the
    // full detail, even when we scrub the client-facing response.
    // Previous version of this filter only set this for non-HttpException
    // paths, which meant `throw new InternalServerErrorException("AMI
    // down")` silently logged just "Internal server error" with no
    // attribution — useless for debugging. Now every branch populates
    // rawForLog so operators can see exactly what went wrong.
    let rawForLog: string = "unknown";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      rawForLog = exception.stack ?? exception.message ?? exception.name;

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
      // ('"email"')` — leaks column names. `pg` errors can carry query
      // fragments. bcrypt errors mention algorithm internals. Node fs
      // errors leak absolute filesystem paths. Keep the raw detail in
      // the backend log (above) and surface only the generic message
      // in the client response.
    } else {
      rawForLog = String(exception);
    }

    // Only 5xx should be scrubbed for the client; 4xx status codes
    // (validation errors, permission denials, conflicts) come from
    // explicit `throw new BadRequestException(...)` /
    // `ForbiddenException` etc. where the message IS the intended
    // user-facing text.
    if (status >= 500) {
      // Log BEFORE scrubbing so operators can correlate. The stack
      // (or message if no stack) is preserved here verbatim.
      this.logger.error(
        `Unhandled exception @ ${request.method} ${request.url}: ${rawForLog}`,
      );
      message = "Internal server error";
      error = undefined;
    } else if (status >= 400) {
      // Log 4xx at debug level so we can trace user-facing errors
      // without drowning the log during normal validation failures.
      this.logger.debug(
        `Client error ${status} @ ${request.method} ${request.url}: ${message}`,
      );
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
