import { useState, type ReactNode } from 'react';
import type { AdminBugReport, BugReportStatus } from '../../shared/types';
import { BUG_REPORT_STATUSES } from '../../shared/validation';
import { Chip } from '../../shared/bug-report-chip';
import {
  SEVERITY_CLASSES,
  SEVERITY_LABELS,
  STATUS_CLASSES,
  contextLine,
  statusLabel,
} from '../../shared/bug-report-view';
import {
  Button,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  Select,
  Spinner,
} from '../../components/ui';
import { API_ROUTES, apiFetch } from '../../lib/api';
import { bannerFor } from '../../lib/errors';
import { formatInstant } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';

/** `'ALL'` keeps the filter in one select instead of a separate toggle. */
type StatusFilter = 'ALL' | BugReportStatus;

function ReporterLine({ report }: { report: AdminBugReport }): ReactNode {
  return (
    <p className="mt-2 text-xs text-slate-400 break-words">
      {report.reporterName}
      {report.reporterEmail ? (
        <span className="text-slate-500"> · {report.reporterEmail}</span>
      ) : null}
    </p>
  );
}

/**
 * Triage board: every report from every account, newest first, with a status
 * select on each card. Read of `GET /admin/bug-reports`; the only write is the
 * `PATCH` that moves a report through `OPEN → IN_PROGRESS → RESOLVED → CLOSED`.
 *
 * The filter is client-side — the full list is already on screen, and paging
 * would only hide work the admin has to do eventually.
 */
export default function AdminBugReportsPage() {
  const list = useAsync<AdminBugReport[]>(
    (signal) => apiFetch<AdminBugReport[]>(API_ROUTES.adminBugReports.base, { signal }),
    [],
  );

  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [banner, setBanner] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const reports = list.data ?? [];
  const visible = filter === 'ALL' ? reports : reports.filter((row) => row.status === filter);

  async function handleStatus(report: AdminBugReport, status: BugReportStatus) {
    if (status === report.status) return;
    setBanner(null);
    setSavingId(report.id);
    try {
      const updated = await apiFetch<AdminBugReport>(API_ROUTES.adminBugReports.byId(report.id), {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      list.setData(
        (list.data ?? []).map((row) => (row.id === updated.id ? { ...row, ...updated } : row)),
      );
    } catch (error) {
      setBanner(bannerFor(error));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
      <PageHeader
        title="Admin · Bug reports"
        subtitle="Everything users have reported, newest first. Change a status to move a report through triage."
      />

      <ErrorBanner>{banner}</ErrorBanner>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-400">
          {reports.length === 0
            ? 'No bug reports'
            : `${visible.length} of ${reports.length} report${reports.length === 1 ? '' : 's'}`}
        </p>

        <div className="min-w-0 sm:min-w-52">
          <Field label="Filter by status" htmlFor="admin-bug-filter">
            <Select
              id="admin-bug-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value as StatusFilter)}
            >
              <option value="ALL">All statuses</option>
              {BUG_REPORT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {list.loading && !list.data ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading bug reports" />
        </div>
      ) : list.error ? (
        <ErrorBanner>{list.error.message}</ErrorBanner>
      ) : reports.length === 0 ? (
        <EmptyState
          title="No bug reports yet"
          body="Nothing has been reported. Enjoy the quiet while it lasts."
        />
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing with that status" body="Pick another status above." />
      ) : (
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
          {visible.map((report) => {
            const context = contextLine(report);
            const busy = savingId === report.id;
            return (
              <li
                key={report.id}
                className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip className={SEVERITY_CLASSES[report.severity]}>
                    {SEVERITY_LABELS[report.severity]}
                  </Chip>
                  <Chip className={STATUS_CLASSES[report.status]}>
                    {statusLabel(report.status)}
                  </Chip>
                </div>

                <h3 className="mt-3 font-medium text-slate-100 break-words">{report.title}</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-400 line-clamp-6">
                  {report.description}
                </p>

                <ReporterLine report={report} />

                {context ? (
                  <p className="mt-3 text-xs text-slate-500 break-words">{context}</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  Reported {formatInstant(report.createdAt)}
                </p>

                <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Field label="Status" htmlFor={`admin-bug-status-${report.id}`}>
                      <Select
                        id={`admin-bug-status-${report.id}`}
                        value={report.status}
                        disabled={busy}
                        onChange={(event) =>
                          void handleStatus(report, event.target.value as BugReportStatus)
                        }
                      >
                        {BUG_REPORT_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {statusLabel(value)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  {busy ? (
                    <p className="pb-2 text-xs text-slate-500" role="status">
                      Saving…
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!list.loading && !list.error && reports.length > 0 ? (
        <div className="mt-6">
          <Button
            variant="ghost"
            onClick={() => {
              setBanner(null);
              list.reload();
            }}
          >
            Refresh
          </Button>
        </div>
      ) : null}
    </main>
  );
}
