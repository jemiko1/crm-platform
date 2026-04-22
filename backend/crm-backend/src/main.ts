import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { getCorsOrigins } from "./cors";

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    console.error("FATAL: JWT_SECRET environment variable is required");
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // Trust the reverse proxy (Nginx on VM / Railway edge) so req.ip resolves
  // from X-Forwarded-For rather than the loopback address. Required for the
  // per-IP login throttle and any future rate limiter that keys on req.ip.
  app.getHttpAdapter().getInstance().set("trust proxy", true);

  // Disable Express's default weak-ETag on JSON responses.
  //
  // See CLAUDE.md Silent Override Risk #23 for the full story. TL;DR:
  // Express adds `ETag: W/"<hash>"` on every JSON response. The browser
  // caches that body keyed by the ETag and sends `If-None-Match` on
  // subsequent identical requests. If the response body hashes the
  // same as it did on first load (very common for paginated list
  // endpoints that happened to be empty when the user first arrived),
  // Express returns `304 Not Modified` with 0 bytes — and the browser
  // reuses the stale cached body. Field symptom: operator sees an
  // empty Call Logs table for hours even as the DB fills up.
  //
  // This whole app serves authenticated JSON with `credentials:
  // include`. There is no endpoint that legitimately benefits from
  // ETag revalidation — caching should always be an explicit, opt-in
  // decision per endpoint rather than the default. Flipping the global
  // default off kills the entire bug class. Per-endpoint
  // `@Header('Cache-Control', 'no-store')` remains on the telephony
  // list controllers as belt-and-suspenders.
  app.getHttpAdapter().getInstance().set("etag", false);

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  });

  // Global exception filter (consistent error responses)
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global validation — whitelist strips unknown DTO properties silently;
  // forbidNonWhitelisted is OFF so @Query('param') coexists with @Query() DTO.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Swagger setup — only exposed in non-production environments
  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("CRM API")
      .setDescription("CRM backend API")
      .setVersion("1.0")
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api", app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
