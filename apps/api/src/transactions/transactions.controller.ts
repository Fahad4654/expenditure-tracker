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
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { uuidSchema } from '../shared/validation';
import {
  createTransactionSchema,
  listTransactionsSchema,
  updateTransactionSchema,
  type CreateTransactionInputDto,
  type ListTransactionsQueryDto,
  type UpdateTransactionInputDto,
} from '../shared/validation';
import type { Paginated, Transaction } from '../shared/types';
import type { Response } from 'express';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@ApiSecurity('bearer')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a transaction',
    description:
      'Pass a client-generated `clientId` to make retries idempotent — replaying ' +
      'the same id returns the original row instead of creating a duplicate.',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createTransactionSchema)) body: CreateTransactionInputDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Transaction> {
    const { transaction, created } = await this.transactions.create(user.sub, body);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return transaction;
  }

  @Get()
  @ApiOperation({ summary: 'List, search, filter and paginate transactions' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listTransactionsSchema)) query: ListTransactionsQueryDto,
  ): Promise<Paginated<Transaction>> {
    return this.transactions.list(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch one transaction (404 when owned by another user)' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<Transaction> {
    return this.transactions.get(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a transaction',
    description:
      'Send `baseVersion` for optimistic concurrency — a stale version returns ' +
      '409 CONFLICT instead of silently overwriting a newer edit.',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateTransactionSchema)) body: UpdateTransactionInputDto,
  ): Promise<Transaction> {
    return this.transactions.update(user.sub, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a transaction (tombstone for sync)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
  ): Promise<Transaction> {
    return this.transactions.remove(user.sub, id);
  }
}
