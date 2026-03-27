import { applyDecorators, type Type } from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from "@nestjs/swagger";

export type DocParam = { name: string; description: string; type?: "string" | "number" };

export type DocQuery = { name: string; description: string; required?: boolean };

/**
 * Composes Swagger decorators for controller methods. Uses the same OpenAPI
 * primitives as inline @ApiOperation / @ApiResponse, without duplicating dozens
 * of lines per route.
 */
export function Doc(opts: {
  summary: string;
  ok: string;
  status?: 200 | 201 | 204;
  /** Set true for login, public webhooks, health, etc. */
  noAuth?: boolean;
  permission?: boolean;
  notFound?: boolean;
  badRequest?: boolean;
  tooManyRequests?: boolean;
  bodyType?: Type<unknown>;
  params?: DocParam[];
  queries?: DocQuery[];
}) {
  const decs: MethodDecorator[] = [];

  if (opts.bodyType) {
    decs.push(ApiBody({ type: opts.bodyType }) as MethodDecorator);
  }

  for (const p of opts.params ?? []) {
    decs.push(
      ApiParam({
        name: p.name,
        description: p.description,
        type: p.type === "number" ? Number : String,
      }) as MethodDecorator,
    );
  }

  for (const q of opts.queries ?? []) {
    decs.push(
      ApiQuery({
        name: q.name,
        description: q.description,
        required: q.required ?? false,
      }) as MethodDecorator,
    );
  }

  decs.push(ApiOperation({ summary: opts.summary }) as MethodDecorator);
  decs.push(
    ApiResponse({
      status: opts.status ?? 200,
      description: opts.ok,
    }) as MethodDecorator,
  );

  if (!opts.noAuth) {
    decs.push(
      ApiResponse({ status: 401, description: "Unauthorized" }) as MethodDecorator,
    );
  }

  if (opts.permission) {
    decs.push(
      ApiResponse({
        status: 403,
        description: "Forbidden — insufficient permissions",
      }) as MethodDecorator,
    );
  }

  if (opts.notFound) {
    decs.push(
      ApiResponse({ status: 404, description: "Not found" }) as MethodDecorator,
    );
  }

  if (opts.badRequest) {
    decs.push(
      ApiResponse({ status: 400, description: "Bad request" }) as MethodDecorator,
    );
  }

  if (opts.tooManyRequests) {
    decs.push(
      ApiResponse({
        status: 429,
        description: "Too many requests or account temporarily locked",
      }) as MethodDecorator,
    );
  }

  return applyDecorators(...decs);
}
