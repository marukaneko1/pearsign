import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  Ip,
  Headers,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { EnvelopesService } from './envelopes.service';
import { PublicSigningService } from './public-signing.service';
import { CaptureSignatureDto } from './dto/capture-signature.dto';
import { CompleteSigningDto } from './dto/complete-signing.dto';

/**
 * PublicSigningController
 *
 * CRITICAL: This controller handles the public signing workflow
 * NO JWT AUTHENTICATION REQUIRED - Token-based access only
 *
 * Security:
 * - Access via unique recipient token
 * - IP & user agent tracking
 * - One-time or session-based tokens
 * - All actions logged in audit trail
 */
@Controller('public/sign')
@Public() // No JWT required
export class PublicSigningController {
  constructor(
    private readonly envelopesService: EnvelopesService,
    private readonly publicSigningService: PublicSigningService,
  ) {}

  /**
   * Get signing page data
   * GET /public/sign/:token
   */
  @Get(':token')
  @HttpCode(HttpStatus.OK)
  async getSigningPage(
    @Param('token') token: string,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    // Validate token and get envelope + recipient + fields
    const signingData = await this.publicSigningService.validateTokenAndGetData(
      token,
      ipAddress,
      userAgent,
    );

    return signingData;
  }

  /**
   * Mark envelope as viewed
   * POST /public/sign/:token/viewed
   */
  @Post(':token/viewed')
  @HttpCode(HttpStatus.OK)
  async markAsViewed(
    @Param('token') token: string,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    await this.publicSigningService.markAsViewed(token, ipAddress, userAgent);

    return { success: true };
  }

  /**
   * Capture signature for a field
   * POST /public/sign/:token/signature
   */
  @Post(':token/signature')
  @HttpCode(HttpStatus.OK)
  async captureSignature(
    @Param('token') token: string,
    @Body() dto: CaptureSignatureDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const signature = await this.publicSigningService.captureSignature(
      token,
      dto,
      ipAddress,
      userAgent,
    );

    return signature;
  }

  /**
   * Complete signing
   * POST /public/sign/:token/complete
   */
  @Post(':token/complete')
  @HttpCode(HttpStatus.OK)
  async completeSigning(
    @Param('token') token: string,
    @Body() dto: CompleteSigningDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const result = await this.publicSigningService.completeSigning(
      token,
      dto,
      ipAddress,
      userAgent,
    );

    return result;
  }

  /**
   * Decline signing
   * POST /public/sign/:token/decline
   */
  @Post(':token/decline')
  @HttpCode(HttpStatus.OK)
  async declineSigning(
    @Param('token') token: string,
    @Body() body: { reason: string },
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    await this.publicSigningService.declineSigning(
      token,
      body.reason,
      ipAddress,
      userAgent,
    );

    return { success: true };
  }
}
