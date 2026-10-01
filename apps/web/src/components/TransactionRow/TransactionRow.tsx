import { Link } from 'react-router-dom';
import type { Category, Transaction } from '../../shared/types';
import { formatDay, money } from '../../lib/format';
import { transactionPath } from '../../routes';

const TYPE_STYLES: Record<Transaction['type'], string> = {
  EXPENSE: 'text-rose-400',
  INCOME: 'text-emerald-400',
};

function amountLabel(transaction: Transaction): string {
  const value = money(transaction.amount, transaction.currency);
  return transaction.type === 'EXPENSE' ? `−${value}` : `+${value}`;
}

/** Single row in any transaction list; also used on the dashboard. */
export default function TransactionRow({
  transaction,
  categories,
}: {
  transaction: Transaction;
  categories: ReadonlyMap<string, Category>;
}) {
  const category = categories.get(transaction.categoryId);

  return (
    <li>
      <Link
        to={transactionPath(transaction.id)}
        className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-slate-800/60"
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-100">{transaction.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{formatDay(transaction.transactionDate, { weekday: true })}</span>
            {category ? (
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  backgroundColor: category.color ? `${category.color}22` : undefined,
                  color: category.color ?? '#94a3b8',
                }}
              >
                {category.name}
              </span>
            ) : null}
          </p>
        </div>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${TYPE_STYLES[transaction.type]}`}
        >
          {amountLabel(transaction)}
        </span>
      </Link>
    </li>
  );
}
