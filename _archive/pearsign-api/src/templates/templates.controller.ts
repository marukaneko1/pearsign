import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TemplatesService } from './templates.service';
import type { CreateTemplateDto, UpdateTemplateDto } from './templates.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { TemplateCategory } from './entities/template.entity';

/**
 * TemplatesController
 *
 * REST API for template management
 *
 * Use Cases:
 * - Create reusable document templates
 * - List and search templates
 * - Use template to create envelope
 * - Create template from existing envelope
 */
@Controller('v1/templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  /**
   * Create template
   *
   * POST /api/v1/templates
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: User,
  ) {
    return this.templatesService.create(dto, user);
  }

  /**
   * Create template from envelope
   *
   * POST /api/v1/templates/from-envelope
   */
  @Post('from-envelope')
  @HttpCode(HttpStatus.CREATED)
  async createFromEnvelope(
    @Body('envelopeId') envelopeId: string,
    @Body('templateName') templateName: string,
    @CurrentUser() user: User,
  ) {
    return this.templatesService.createFromEnvelope(envelopeId, templateName, user);
  }

  /**
   * List templates
   *
   * GET /api/v1/templates
   *
   * Query params:
   * - category: Filter by category
   * - includeArchived: Include archived templates (default: false)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listTemplates(
    @Query('category') category?: TemplateCategory,
    @Query('includeArchived') includeArchived?: string,
    @CurrentUser() user?: User,
  ) {
    if (!user) {
      return { templates: [] };
    }

    return this.templatesService.findAll(user, {
      category,
      includeArchived: includeArchived === 'true',
    });
  }

  /**
   * Get template by ID
   *
   * GET /api/v1/templates/:id
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getTemplate(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.templatesService.findOne(id, user);
  }

  /**
   * Update template
   *
   * PATCH /api/v1/templates/:id
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: User,
  ) {
    return this.templatesService.update(id, dto, user);
  }

  /**
   * Archive template
   *
   * POST /api/v1/templates/:id/archive
   */
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  async archiveTemplate(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.templatesService.archive(id, user);
  }

  /**
   * Unarchive template
   *
   * POST /api/v1/templates/:id/unarchive
   */
  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  async unarchiveTemplate(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.templatesService.unarchive(id, user);
  }

  /**
   * Delete template
   *
   * DELETE /api/v1/templates/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTemplate(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    await this.templatesService.delete(id, user);
  }

  /**
   * Use template to create envelope
   *
   * POST /api/v1/templates/:id/use
   *
   * Body:
   * - title: Envelope title
   * - recipients: Array of { placeholderLabel, name, email }
   * - message: Optional custom message
   */
  @Post(':id/use')
  @HttpCode(HttpStatus.CREATED)
  async useTemplate(
    @Param('id') id: string,
    @Body() body: {
      title: string;
      recipients: Array<{
        placeholderLabel: string;
        name: string;
        email: string;
      }>;
      message?: string;
    },
    @CurrentUser() user: User,
  ) {
    return this.templatesService.useTemplate(id, body, user);
  }
}
