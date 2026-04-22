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
    }
    // For non-HttpException `Error` and truly-unknown throws we keep
    // the default `"Internal server error"` message on the client
    // response (see scrub reasons below). The backend log still gets
    // the real detail via `rawFor5xxLog()` which is computed lazily
    // inside the 5xx branch so 4xx requests don't pay for a
    // stack-trace read they'll never use.

    // Only 5xx is scrubbed for the client. 4xx (validation errors,
    // permission denials, conflicts) come from explicit
    // `throw new BadRequestException(...)` etc. where the message
    // IS the intended user-facing text.
    if (status >= 500) {
      // Lazily extract the most useful string form of the exception
      // for the backend log. We never let this leak to the client —
      // Prisma throws leak column names, `pg` errors leak query
      // fragments, bcrypt errors leak algorithm internals, Node fs
      // errors leak absolute paths. Server-side log is fine.
      const rawForLog: string = (() => {
        if (exception instanceof HttpException) {
          return exception.stack ?? exception.message ?? exception.name;
        }
        if (exception instanceof Error) {
          return exception.stack ?? exception.message;
        }
        return String(exception);
      })();
      this.logger.error(
        `Unhandled exception @ ${request.method} ${request.url}: ${rawForLog}`,
      );
      message = "Internal server error";
      error = undefined;
    } else if (status >= 400) {
      // Log 4xx at debug level so we can trace user-facing errors
      // without drowning the log during normal validation failures.
      // No stack extraction here — debug logs shouldn't pay for a
      // full stack format on every failed field validation.
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
