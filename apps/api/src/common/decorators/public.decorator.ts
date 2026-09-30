import { SetMetadata } from '@nestjs/common';

/**
 * Marks a handler or controller as reachable without an access token.
 * Consulted by the global `JwtAuthGuard`.
 */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
