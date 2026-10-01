import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

/**
 * Paths are relative to the global `api/v1` prefix set in `main.ts`
 * (see `API_ROUTES.health` in `shared/config` for the absolute URLs).
 */
@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — is the process running?' })
  @ApiOkResponse({ description: 'Process is alive' })
  live() {
    return this.health.live();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — are dependencies reachable?' })
  @ApiOkResponse({ type: Object, description: 'All dependencies are up' })
  ready() {
    return this.health.ready();
  }
}
