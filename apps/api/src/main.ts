import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api");
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(",") ?? ["http://localhost:5173"] });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000));
}

bootstrap();
