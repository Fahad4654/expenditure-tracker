import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { uuidSchema } from '../shared/validation';
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInputDto,
  type UpdateCategoryInputDto,
} from '../shared/validation';
import type { Category } from '../shared/types';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { logEvent } from '../common/utils/log-event';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  private readonly logger = new Logger(CategoriesController.name);

  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'System categories plus the callers own' })
  @ApiOkResponse({ type: Object, description: 'List of categories' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Category[]> {
    return this.categories.list(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Create a user category' })
  @ApiOkResponse({ type: Object, description: 'Created category' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInputDto,
  ): Promise<Category> {
    const category = await this.categories.create(user.sub, body);
    logEvent(
      this.logger,
      user.sub,
      'CATEGORY_CREATE',
      'Created a category',
      { name: category.name, suggestedType: category.suggestedType },
      'CATEGORY',
      category.id,
    );
    return category;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category the caller owns' })
  @ApiOkResponse({ type: Object, description: 'Updated category' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInputDto,
  ): Promise<Category> {
    const category = await this.categories.update(user.sub, id, body);
    logEvent(
      this.logger,
      user.sub,
      'CATEGORY_UPDATE',
      'Updated a category',
      { fields: Object.keys(body) },
      'CATEGORY',
      category.id,
    );
    return category;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a category the caller owns' })
  @ApiOkResponse({ type: Object, description: 'Deleted category' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<Category> {
    const category = await this.categories.remove(user.sub, id);
    logEvent(
      this.logger,
      user.sub,
      'CATEGORY_DELETE',
      'Deleted a category',
      { name: category.name },
      'CATEGORY',
      category.id,
    );
    return category;
  }
}
