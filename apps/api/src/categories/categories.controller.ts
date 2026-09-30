import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { uuidSchema } from '@exp/validation';
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInputDto,
  type UpdateCategoryInputDto,
} from '@exp/validation';
import type { Category } from '@exp/types';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
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
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInputDto,
  ): Promise<Category> {
    return this.categories.create(user.sub, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a category the caller owns' })
  @ApiOkResponse({ type: Object, description: 'Updated category' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInputDto,
  ): Promise<Category> {
    return this.categories.update(user.sub, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a category the caller owns' })
  @ApiOkResponse({ type: Object, description: 'Deleted category' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<Category> {
    return this.categories.remove(user.sub, id);
  }
}
