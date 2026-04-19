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
