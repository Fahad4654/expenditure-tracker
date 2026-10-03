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
  createNoteSchema,
  updateNoteSchema,
  uuidSchema,
  type CreateNoteInputDto,
  type UpdateNoteInputDto,
} from '../shared/validation';
import type { Note } from '../shared/types';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { logEvent } from '../common/utils/log-event';
import { NotesService } from './notes.service';

@ApiTags('notes')
@Controller('notes')
export class NotesController {
  private readonly logger = new Logger(NotesController.name);

  constructor(private readonly notes: NotesService) {}

  @Get()
  @ApiOperation({ summary: 'List the callers notes, newest first' })
  @ApiOkResponse({ type: Object, description: 'List of notes' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Note[]> {
    return this.notes.list(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Create a note' })
  @ApiOkResponse({ type: Object, description: 'Created note' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createNoteSchema)) body: CreateNoteInputDto,
  ): Promise<Note> {
    const note = await this.notes.create(user.sub, body);
    logEvent(this.logger, user.sub, 'NOTE_CREATE', 'Created a note', undefined, 'NOTE', note.id);
    return note;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a note the caller owns' })
  @ApiOkResponse({ type: Object, description: 'Updated note' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateNoteSchema)) body: UpdateNoteInputDto,
  ): Promise<Note> {
    const note = await this.notes.update(user.sub, id, body);
    logEvent(this.logger, user.sub, 'NOTE_UPDATE', 'Updated a note', undefined, 'NOTE', note.id);
    return note;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a note the caller owns' })
  @ApiOkResponse({ type: Object, description: 'Deleted note' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<Note> {
    const note = await this.notes.remove(user.sub, id);
    logEvent(this.logger, user.sub, 'NOTE_DELETE', 'Deleted a note', undefined, 'NOTE', note.id);
    return note;
  }
}
