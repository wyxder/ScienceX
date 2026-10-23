import { api } from './client';
import type {
  EvalBaselinePromoteResponse,
  EvalCreateRunBody,
  EvalCreateRunResponse,
  EvalGateResponse,
  EvalOverview,
  EvalRunDetail,
  EvalRunPage,
  EvalRunQuery,
  EvalSuiteDetail,
  EvalSuiteList,
} from '../types/eval';

export const evalApi = {
  suites: (signal?: AbortSignal) =>
    api<EvalSuiteList>('/harness/eval/suites', { signal }),

  suite: (id: string, signal?: AbortSignal) =>
    api<EvalSuiteDetail>(`/harness/eval/suites/${encodeURIComponent(id)}`, { signal }),

  createRun: (body: EvalCreateRunBody) =>
    api<EvalCreateRunResponse>('/harness/eval/runs', { method: 'POST', body }),

  runs: (query: EvalRunQuery, signal?: AbortSignal) =>
    api<EvalRunPage>('/harness/eval/runs', { params: { ...query }, signal }),

  run: (id: string, signal?: AbortSignal) =>
    api<EvalRunDetail>(`/harness/eval/runs/${encodeURIComponent(id)}`, { signal }),

  cancel: (id: string) =>
    api<{ run_id: string; status: 'cancelling' }>(`/harness/eval/runs/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: {},
    }),

  promoteBaseline: (id: string, label?: string, rebuild?: boolean) =>
    api<EvalBaselinePromoteResponse>(`/harness/eval/runs/${encodeURIComponent(id)}/baseline`, {
      method: 'POST',
      body: { label, rebuild },
    }),

  overview: (suiteId = 'core', signal?: AbortSignal) =>
    api<EvalOverview>('/harness/eval/overview', { params: { suite_id: suiteId }, signal }),

  gates: (suiteId = 'core', signal?: AbortSignal) =>
    api<EvalGateResponse>('/harness/eval/gates', { params: { suite_id: suiteId }, signal }),
};
