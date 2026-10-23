export type EvalMode = 'template' | 'live';
export type EvalRunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled' | 'error';
export type EvalGateStatus = 'pending' | 'passed' | 'failed' | 'skipped';
export type EvalCaseStatus = 'passed' | 'failed' | 'error' | 'cancelled';
export type EvalScene = 'workbench' | 'document';

export interface EvalSuiteSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  case_count: number;
  redline_count: number;
  source: string;
  modes: EvalMode[];
}

export interface EvalSuiteList {
  items: EvalSuiteSummary[];
  total: number;
  enabled: boolean;
  live_enabled: boolean;
  max_concurrency: number;
}

export interface EvalCase {
  id: string;
  question: string;
  scene: EvalScene;
  minimum: number;
  redline: boolean;
  expected: string[];
}

export interface EvalSuiteDetail extends EvalSuiteSummary {
  scorer: string;
  prompt_version: string;
  cases: EvalCase[];
}

export interface EvalCreateRunBody {
  suite_id?: string;
  mode?: EvalMode;
  model?: string;
  note?: string;
}

export interface EvalCreateRunResponse {
  run_id: string;
  suite_id: string;
  mode: EvalMode;
  status: 'queued';
}

export interface EvalRunQuery {
  suite_id?: string;
  status?: EvalRunStatus;
  mode?: EvalMode;
  page?: number;
  page_size?: number;
}

export interface EvalGatePolicy {
  max_failed_cases: number;
  min_average: number | null;
  require_baseline: boolean;
  regression_tolerance: number;
  live_baseline: 'warn' | 'fail';
  policy_version: string;
}

export interface EvalGateReason {
  code: string;
  level: 'fail' | 'warn' | 'info';
  message: string;
  case_id?: string;
}

export interface EvalGate {
  status: EvalGateStatus;
  policy: EvalGatePolicy;
  baseline_id: string | null;
  baseline_label: string | null;
  baseline_compatible: boolean | null;
  regression_count: number;
  failed_cases: string[];
  reasons: EvalGateReason[];
  evaluated_at: string | null;
}

export interface EvalScoreDetail {
  status: 'completed' | 'skipped' | 'failed';
  text?: string;
  score?: number | null;
  matched?: string[];
  missing?: string[];
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  latency_ms?: number;
  error?: string | null;
  truncated?: boolean;
}

export interface EvalCaseResult {
  case_id: string;
  question: string;
  scene: EvalScene;
  minimum: number;
  status: EvalCaseStatus;
  template: EvalScoreDetail;
  live: EvalScoreDetail;
  score: number;
  error: string | null;
}

export interface EvalRunListItem {
  id: string;
  suite_id: string;
  suite_version: string;
  mode: EvalMode;
  status: EvalRunStatus;
  total: number;
  completed: number;
  passed_cases: number;
  failed_cases: number;
  error_cases: number;
  average_score: number;
  template_average: number;
  live_average: number | null;
  gate: { status: EvalGateStatus; reasons_count: number };
  created_at: string;
  duration_ms: number | null;
}

export interface EvalRunDetail {
  id: string;
  suite_id: string;
  suite_version: string;
  mode: EvalMode;
  status: EvalRunStatus;
  owner_id: string;
  model: string | null;
  prompt_version: string;
  scorer: string;
  total: number;
  completed: number;
  passed_cases: number;
  failed_cases: number;
  error_cases: number;
  average_score: number;
  template_average: number;
  live_average: number | null;
  failed: string[];
  case_results: EvalCaseResult[];
  gate: EvalGate;
  baseline_id: string | null;
  baseline_label: string | null;
  error: { code: string; message: string } | null;
  cancel_requested: boolean;
  persist_error: string | null;
  event_seq: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  duration_ms: number | null;
  note: string;
}

export interface EvalRunPage {
  items: EvalRunListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface EvalOverview {
  suite_id: string;
  total_runs: number;
  pass_rate_7d: number | null;
  average_score_7d: number | null;
  last_run: { id: string; status: EvalRunStatus; average_score: number; created_at: string } | null;
  trend: Array<{ run_id: string; created_at: string; average_score: number; status: EvalRunStatus }>;
  failure_top: Array<{ case_id: string; fail_count: number }>;
  active_baseline: { id: string; label: string; average_score: number } | null;
  enabled: boolean;
  live_enabled: boolean;
  max_concurrency: number;
  generated_at: string;
}

export interface EvalBaselineSummary {
  id: string;
  label: string;
  average_score: number;
  active: boolean;
  rebuild: boolean;
  created_at: string;
}

export interface EvalGateResponse {
  suite_id: string;
  policy: EvalGatePolicy;
  active_baseline: {
    id: string;
    label: string;
    run_id: string;
    average_score: number;
    prompt_version: string;
    rebuild: boolean;
    created_at: string;
  } | null;
  baselines: EvalBaselineSummary[];
  enabled: boolean;
  live_enabled: boolean;
  max_concurrency: number;
}

export interface EvalBaselinePromoteResponse {
  baseline_id: string;
  suite_id: string;
  label: string;
  active: boolean;
  average_score: number;
  rebuild: boolean;
}

export interface EvalProgressPayload {
  run_id: string;
  status: 'queued' | 'running';
  percent: number;
  stage: string;
  completed: number;
  total: number;
  passed_cases: number;
  failed_cases: number;
  current_case_id: string | null;
  current_case_question?: string | null;
  phase: 'run_start' | 'case_start' | 'case_done' | 'gating';
  elapsed_ms?: number;
}

export interface EvalDonePayload {
  run_id: string;
  status: 'passed' | 'failed' | 'cancelled';
  gate: { status: EvalGateStatus; reasons: EvalGateReason[] };
  summary: { passed_cases: number; failed_cases: number; average_score: number };
}
