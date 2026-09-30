import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface Envelope<T> {
  ok: true;
  data: T;
}

/**
 * Wraps every successful controller response in the shared success envelope
 * `{ ok: true, data }`, so clients only ever have two shapes to handle.
 *
 * Controllers must return *raw* data — never an envelope.
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<Envelope<unknown>> {
    return next
      .handle()
      .pipe(map((data: unknown): Envelope<unknown> => ({ ok: true, data: data ?? null })));
  }
}
