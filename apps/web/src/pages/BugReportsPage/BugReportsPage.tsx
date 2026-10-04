import { useState, type FormEvent } from 'react';
import type { BugReport, BugReportSeverity } from '../../shared/types';
import {
  BUG_REPORT_SEVERITIES,
  createBugReportSchema,
  toFieldErrors,
} from '../../shared/validation';
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
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  Select,
  Spinner,
  TextInput,
  inputClass,
} from '../../components/ui';
import { API_ROUTES, apiFetch } from '../../lib/api';
import { bannerFor, indexByPath, parseFormError } from '../../lib/errors';
import { formatInstant } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';

const DEFAULT_SEVERITY: BugReportSeverity = 'MEDIUM';

/**
 * Bug reports: an inline create form above the caller's own reports, following
 * the NotesPage conventions — no modals, confirmations expand in place, and a
 * successful submit prepends the new report to the list. The platform is
 * captured automatically; severity comes from the system select.
 */
export default function BugReportsPage() {
  const list = useAsync<BugReport[]>(
    (signal) => apiFetch<BugReport[]>(API_ROUTES.bugReports.base, { signal }),
    [],
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<BugReportSeverity>(DEFAULT_SEVERITY);
  const [area, setArea] = useState('');
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const reports = list.data ?? [];

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);

    const parsed = createBugReportSchema.safeParse({
      title,
      description,
      severity,
      area: area.trim() || null,
      platform: 'web',
    });
    if (!parsed.success) {
      setCreateErrors(indexByPath(toFieldErrors(parsed.error)));
      return;
    }

    setCreateErrors({});
    setSubmitting(true);
    try {
      const created = await apiFetch<BugReport>(API_ROUTES.bugReports.base, {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      list.setData([created, ...(list.data ?? [])]);
      setTitle('');
      setDescription('');
      setArea('');
      setSeverity(DEFAULT_SEVERITY);
    } catch (error) {
      setCreateErrors(parseFormError(error).fields);
      setBanner(bannerFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(report: BugReport) {
    setBanner(null);
    try {
      await apiFetch(API_ROUTES.bugReports.byId(report.id), { method: 'DELETE' });
      list.setData((list.data ?? []).filter((row) => row.id !== report.id));
      setPendingDeleteId(null);
    } catch (error) {
      setPendingDeleteId(null);
      setBanner(bannerFor(error));
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
      <PageHeader
        title="Bug reports"
        subtitle="Something broken? Tell us what happened and we'll look into it."
      />

      <ErrorBanner>{banner}</ErrorBanner>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold text-white">Report a bug</h2>
        <form onSubmit={handleCreate} className="grid gap-4" noValidate>
          <Field label="Title" htmlFor="bug-title" error={createErrors.title}>
            <TextInput
              id="bug-title"
              placeholder="Chart renders empty on the reports page"
              maxLength={160}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="What happened?" htmlFor="bug-description" error={createErrors.description}>
            <textarea
              id="bug-description"
              rows={5}
              maxLength={5000}
              placeholder="Steps to reproduce, what you expected, and what you saw…"
              className={inputClass}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
            <Field label="Severity" htmlFor="bug-severity" error={createErrors.severity}>
              <Select
                id="bug-severity"
                value={severity}
                onChange={(event) => setSeverity(event.target.value as BugReportSeverity)}
              >
                {BUG_REPORT_SEVERITIES.map((value) => (
                  <option key={value} value={value}>
                    {SEVERITY_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Where did it happen?"
              htmlFor="bug-area"
              error={createErrors.area}
              hint="Optional — a page, screen or feature."
            >
              <TextInput
                id="bug-area"
                placeholder="Reports"
                maxLength={80}
                value={area}
                onChange={(event) => setArea(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send report'}
            </Button>
          </div>
        </form>
      </Card>

      {list.loading && !list.data ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading bug reports" />
        </div>
      ) : list.error ? (
        <ErrorBanner>{list.error.message}</ErrorBanner>
      ) : reports.length === 0 ? (
        <EmptyState
          title="No bug reports yet"
          body="If something misbehaves, file your first report above."
        />
      ) : (
        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
          {reports.map((report) => {
            const context = contextLine(report);
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
                <p className="mt-2 flex-1 whitespace-pre-wrap break-words text-sm text-slate-400 line-clamp-6">
                  {report.description}
                </p>
                {context ? (
                  <p className="mt-3 text-xs text-slate-500 break-words">{context}</p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">
                  Reported {formatInstant(report.createdAt)}
                </p>
                <div className="mt-3">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setPendingDeleteId(pendingDeleteId === report.id ? null : report.id)
                    }
                  >
                    Delete
                  </Button>
                </div>

                {pendingDeleteId === report.id ? (
                  <div className="mt-3 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm">
                    <p className="text-rose-200">Delete “{report.title}”? This cannot be undone.</p>
                    <div className="mt-2 flex gap-2">
                      <Button variant="danger" onClick={() => void handleDelete(report)}>
                        Delete
                      </Button>
                      <Button variant="ghost" onClick={() => setPendingDeleteId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
