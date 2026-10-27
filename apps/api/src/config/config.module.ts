import { Global, Module } from "@nestjs/common";
import { ConfigService } from "./config.service.js";
import { validateEnv } from "./env.schema.js";

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      // Throws EnvValidationError at boot when the environment is invalid (fail fast).
      useFactory: () => new ConfigService(validateEnv(process.env)),
    },
  ],
  exports: [ConfigService],
})
export class ConfigModule {}
