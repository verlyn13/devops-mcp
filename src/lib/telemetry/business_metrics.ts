import { meter } from './otel.js';
import type { Attributes } from '@opentelemetry/api';

const m = meter();
const convergenceSuccess = m.createCounter('converge_success_total');
const convergenceFailure = m.createCounter('converge_failure_total');
const pkgOpsDur = m.createHistogram('package_operations_duration_ms', { unit: 'ms' });
const dotfilesChanges = m.createCounter('dotfiles_changes_total');
const runDur = m.createHistogram('mcp_run_duration_ms', { unit: 'ms' });

export function recordConvergenceOutcome(success: boolean, profile: string, residuals: number) {
  const attrs: Attributes = { profile, has_residuals: residuals > 0 } as any;
  if (success) convergenceSuccess.add(1, attrs); else convergenceFailure.add(1, attrs);
}

export function recordPackageOpsDuration(ms: number, profile?: string) {
  const attrs: Attributes = {}; if (profile) (attrs as any).profile = profile; pkgOpsDur.record(ms, attrs);
}

export function incDotfilesChanges(n = 1, profile?: string) {
  const attrs: Attributes = {}; if (profile) (attrs as any).profile = profile; dotfilesChanges.add(n, attrs);
}

export function recordRunDuration(ms: number, profile?: string, run_id?: string) {
  const attrs: Attributes = {}; if (profile) (attrs as any).profile = profile; if (run_id) (attrs as any).run_id = run_id; runDur.record(ms, attrs);
}
