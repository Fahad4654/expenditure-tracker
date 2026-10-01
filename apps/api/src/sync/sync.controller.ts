import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { logEvent } from '../common/utils/log-event';
import { syncChangesQuerySchema, syncRequestSchema } from '../shared/validation';
import type { SyncChangesQueryDto, SyncRequestDto } from '../shared/validation';
import type { SyncChangesResponse, SyncResponse } from '../shared/types';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiSecurity('bearer')
@Controller('sync')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(private readonly sync: SyncService) {}

  @Post()
  @ApiOperation({
    summary: 'Push a batch of offline operations and receive server changes',
    description:
      'Applies up to 200 operations idempotently (replayed `operationId`s ' +
      'return `DUPLICATE`), then returns changes after `cursor` excluding this ' +
      'device\'s own writes. See docs/synchronization.md for statuses and ' +
      'conflict rules.',
  })
  async push(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(syncRequestSchema)) body: SyncRequestDto,
  ): Promise<SyncResponse> {
    const response = await this.sync.push(user.sub, body);
    const counts = { applied: 0, duplicate: 0, conflict: 0, rejected: 0 };
    for (const result of response.results) {
      if (result.status === 'APPLIED') counts.applied += 1;
      else if (result.status === 'DUPLICATE') counts.duplicate += 1;
      else if (result.status === 'CONFLICT') counts.conflict += 1;
      else counts.rejected += 1;
    }
    logEvent(
      this.logger,
      user.sub,
      'SYNC_PUSH',
      `Sync batch of ${response.results.length} operation(s)`,
      { deviceId: body.deviceId, cursor: response.cursor, ...counts },
      'DEVICE',
      body.deviceId,
    );
    return response;
  }

  @Get('changes')
  @ApiOperation({
    summary: 'Pull server changes after a cursor',
    description:
      'ChangeLog rows with `id > cursor` for the caller, excluding rows ' +
      'originated by `deviceId`. A null cursor starts from the beginning and ' +
      'adds the shared system categories (they have no per-user change rows).',
  })
  pull(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(syncChangesQuerySchema)) query: SyncChangesQueryDto,
  ): Promise<SyncChangesResponse> {
    return this.sync.pull(user.sub, query);
  }
}
