import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { updateProfileSchema, type UpdateProfileInputDto } from '@exp/validation';
import type { UserProfile } from '@exp/types';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current user profile' })
  @ApiOkResponse({ type: Object, description: 'User profile' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    return this.users.me(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update name / defaultCurrency / timezone' })
  @ApiOkResponse({ type: Object, description: 'Updated user profile' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInputDto,
  ): Promise<UserProfile> {
    return this.users.update(user.sub, body);
  }
}
