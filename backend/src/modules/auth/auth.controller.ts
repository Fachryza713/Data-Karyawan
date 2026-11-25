import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user.js';
import {
  type ClientMeta,
  RequestClientMeta,
} from '../../common/decorators/client-meta.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { AuthMessages, REFRESH_COOKIE_NAME } from './auth.constants.js';
import { AuthService, type AuthSession } from './auth.service.js';
import {
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
} from './dto/auth-request.dto.js';
import {
  LoginResponseDto,
  MeResponseDto,
  MessageResponseDto,
} from './dto/auth-response.dto.js';
import {
  AuthThrottlerGuard,
  FORGOT_PASSWORD_THROTTLER,
  LOGIN_THROTTLER,
} from './guards/auth-throttler.guard.js';
import { PasswordResetService } from './password-reset.service.js';
import { RefreshCookie } from './refresh-cookie.js';

const COOKIE_NOTE = `Refresh token dikirim sebagai cookie httpOnly ${REFRESH_COOKIE_NAME} (path /api/v1/auth).`;

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
    private readonly cookie: RefreshCookie,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthThrottlerGuard)
  @SkipThrottle({ [FORGOT_PASSWORD_THROTTLER]: true })
  @ApiOperation({
    summary: 'Login email + password',
    description: `${COOKIE_NOTE} Maksimal 5 percobaan per menit per IP + email.`,
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({
    description: AuthMessages.invalidCredentials,
    type: ErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: AuthMessages.inactiveAccount,
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async login(
    @Body() dto: LoginDto,
    @RequestClientMeta() meta: ClientMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    return this.respondWithSession(res, await this.auth.login(dto, meta));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({
    summary: 'Tukar refresh token (cookie) dengan access token baru',
    description:
      `${COOKIE_NOTE} Setiap refresh merotasi token. Token lama yang dipakai ` +
      'lagi dianggap bocor: semua sesi di family-nya dicabut (401).',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async refresh(
    @Req() req: Request,
    @RequestClientMeta() meta: ClientMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    try {
      const session = await this.auth.refresh(this.cookie.read(req), meta);
      return this.respondWithSession(res, session);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.cookie.clear(res);
      }
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({
    summary: 'Logout perangkat ini',
    description:
      'Mencabut refresh token di cookie dan menghapus cookie. Tidak butuh ' +
      'access token, jadi tetap bisa dipakai saat access token kedaluwarsa.',
  })
  @ApiNoContentResponse()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(this.cookie.read(req));
    this.cookie.clear(res);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout semua perangkat (cabut semua sesi)' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user.id);
    this.cookie.clear(res);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthThrottlerGuard)
  @SkipThrottle({ [LOGIN_THROTTLER]: true })
  @ApiOperation({
    summary: 'Minta link reset password lewat email',
    description:
      'Selalu 200 dengan pesan yang sama, terdaftar atau tidak. Link berlaku ' +
      '30 menit dan sekali pakai. Maksimal 3 permintaan per jam per IP + email.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @RequestClientMeta() meta: ClientMeta,
  ): MessageResponseDto {
    this.passwordReset.requestReset(dto.email, meta);
    return { message: AuthMessages.forgotPasswordAccepted };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set password baru dengan token dari email',
    description:
      'Password minimal 8 karakter. Semua sesi user dicabut, jadi harus login ulang.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({
    description: AuthMessages.resetTokenInvalid,
    type: ErrorResponseDto,
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @RequestClientMeta() meta: ClientMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    await this.passwordReset.resetPassword(dto.token, dto.newPassword, meta);
    this.cookie.clear(res);
    return { message: AuthMessages.passwordResetDone };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Data akun dan karyawan yang sedang login' })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  me(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    return this.auth.me(user.id);
  }

  private respondWithSession(
    res: Response,
    session: AuthSession,
  ): LoginResponseDto {
    this.cookie.set(res, session.refreshToken.token);
    return { accessToken: session.accessToken, user: session.user };
  }
}
