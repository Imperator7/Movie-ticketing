import { Module } from "@nestjs/common";
import { AccessTokenService } from "./access-token.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { OriginGuard } from "./origin.guard.js";
import { PasswordService } from "./password.service.js";

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, AccessTokenService, OriginGuard],
  // AccessTokenService is needed by the global JwtAuthGuard.
  exports: [AccessTokenService],
})
export class AuthModule {}
