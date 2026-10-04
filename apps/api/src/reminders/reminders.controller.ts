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
import {
  createReminderSchema,
  updateReminderSchema,
  uuidSchema,
  type CreateReminderInputDto,
  type UpdateReminderInputDto,
} from '../shared/validation';
import type { Reminder } from '../shared/types';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { logEvent } from '../common/utils/log-event';
import { RemindersService } from './reminders.service';

@ApiTags('reminders')
@Controller('reminders')
export class RemindersController {
  private readonly logger = new Logger(RemindersController.name);

  constructor(private readonly reminders: RemindersService) {}

  @Get()
  @ApiOperation({ summary: 'List the callers reminders, earliest due date first' })
  @ApiOkResponse({ type: Object, description: 'List of reminders' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Reminder[]> {
    return this.reminders.list(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Create a reminder' })
  @ApiOkResponse({ type: Object, description: 'Created reminder' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createReminderSchema)) body: CreateReminderInputDto,
  ): Promise<Reminder> {
    const reminder = await this.reminders.create(user.sub, body);
    logEvent(
      this.logger,
      user.sub,
      'REMINDER_CREATE',
      'Created a reminder',
      { dueDate: reminder.dueDate, dueTime: reminder.dueTime },
      'REMINDER',
      reminder.id,
    );
    return reminder;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a reminder — including marking it completed' })
  @ApiOkResponse({ type: Object, description: 'Updated reminder' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateReminderSchema)) body: UpdateReminderInputDto,
  ): Promise<Reminder> {
    const reminder = await this.reminders.update(user.sub, id, body);
    logEvent(
      this.logger,
      user.sub,
      body.completed === undefined ? 'REMINDER_UPDATE' : reminder.completedAt ? 'REMINDER_COMPLETE' : 'REMINDER_REOPEN',
      body.completed === undefined ? 'Updated a reminder' : 'Toggled reminder completion',
      { dueDate: reminder.dueDate, dueTime: reminder.dueTime },
      'REMINDER',
      reminder.id,
    );
    return reminder;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a reminder the caller owns' })
  @ApiOkResponse({ type: Object, description: 'Deleted reminder' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<Reminder> {
    const reminder = await this.reminders.remove(user.sub, id);
    logEvent(this.logger, user.sub, 'REMINDER_DELETE', 'Deleted a reminder', undefined, 'REMINDER', reminder.id);
    return reminder;
  }
}
