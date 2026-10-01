import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiErrorCode, API_ERROR_CODES } from '../../shared/types';
import type { Request, Response } from 'express';

const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

interface HttpExceptionBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  /** Stable machine-readable code; honoured when present and known. */
  code?: string;
  details?: Array<{ path: string; message: string }>;
}

const KNOWN_CODES = new Set<string>(API_ERROR_CODES);

/**
 * Converts every thrown error into the shared `{ ok: false, error }` envelope.
 *
 * Never leaks stack traces, SQL, tokens or OTP values to the client; those are
 * written to the server log instead.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ApiErrorCode = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: Array<{ path: string; message: string }> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_TO_CODE[status] ?? 'INTERNAL_ERROR';
      const body = exception.getResponse();
      const parsed: HttpExceptionBody =
        typeof body === 'string' ? { message: body } : (body as HttpExceptionBody);
      message = Array.isArray(parsed.message)
        ? parsed.message.join('; ')
        : (parsed.message ?? exception.message);
      details = parsed.details;
      // An explicit code (see `apiError()`) refines the status-derived default,
      // e.g. 401 + `INVALID_CREDENTIALS` vs 401 + `REFRESH_TOKEN_INVALID`.
      if (parsed.code !== undefined && KNOWN_CODES.has(parsed.code)) {
        code = parsed.code as ApiErrorCode;
      }
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (status >= 500) {
      // Expected dependency failures (e.g. readiness probes) — not a crash.
      this.logger.warn(`${request.method} ${request.url} -> ${status} ${message}`);
    } else if (status === 429) {
      this.logger.warn(`${request.method} ${request.url} -> 429 rate limited`);
    }

    response.status(status).json({
      ok: false,
      error: {
        code,
        message,
        ...(details && details.length > 0 ? { details } : {}),
      },
    });
  }
}
