import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn = configService.getOrThrow<string>('JWT_EXPIRES_IN');
        return {
          secret: configService.getOrThrow<string>('JWT_SECRET'),
          signOptions: {
            // Duration strings such as 1h are validated in configuration.
            expiresIn: expiresIn as `${number}h`,
          },
        };
      },
    }),
  ],
  controllers: [IdentityController],
  providers: [IdentityService, JwtStrategy],
  exports: [IdentityService, JwtStrategy, JwtModule, PassportModule],
})
export class IdentityModule {}
