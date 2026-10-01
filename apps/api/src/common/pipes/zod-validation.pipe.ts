import { Injectable, PipeTransform, UnprocessableEntityException } from '@nestjs/common';
import { toFieldErrors } from '../../shared/validation';
import type { z } from 'zod';

/**
 * Route-level validation using the shared Zod schemas from `shared/validation`,
 * so the API and the web client enforce identical rules.
 *
 * Usage: `@Query(new ZodValidationPipe(listTransactionsSchema)) query: ListTransactionsQueryDto`
 */
@Injectable()
export class ZodValidationPipe<Output> implements PipeTransform<unknown, Output> {
  constructor(private readonly schema: z.ZodType<Output>) {}

  transform(value: unknown): Output {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new UnprocessableEntityException({
        message: 'Validation failed',
        details: toFieldErrors(result.error),
      });
    }
    return result.data;
  }
}
