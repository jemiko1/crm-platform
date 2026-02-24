import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // CORS (required so frontend can send/receive cookies)
  app.enableCors({
    origin: ["http://localhost:3002", "http://localhost:4002"],
    credentials: true,
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

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle("CRM API")
    .setDescription("CRM backend API")
    .setVersion("1.0")
    // Optional: allows testing protected routes via Bearer token in Swagger
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
