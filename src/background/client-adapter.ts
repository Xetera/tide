import { sendMessage } from 'webext-bridge/background'
import type { JobParameters } from '@tide/spec'
import type { DiagnosticEvent, SubmissionEvent } from '@tide/client'
import {
  log,
  pushScrapeLog,
  updateScrapeLogStatus,
} from './backend-logger'
import { flashError, flashSuccess } from './badge'
import type { ContentScriptTracker } from './content-script-tracker'

export interface ClientBindings {
  getJobTab(): Promise<number>
  runJob(params: JobParameters, opts: { tabId: number }): Promise<void>
  onSubmission(event: SubmissionEvent): void
  onDiagnostic(event: DiagnosticEvent): void
  onSubmitError(tabId?: number): void
  onSubmitSuccess(tabId?: number): void
}

/**
 * Translates the transport-only client's domain events into the extension's
 * side effects: scrape logs, badge flashes, and content-script messaging. The
 * client itself knows nothing about logging or chrome; this is the only place
 * those concerns are wired together.
 */
export function extensionClientBindings(
  cst: ContentScriptTracker,
): ClientBindings {
  const submissionLogIds = new Map<string, string[]>()

  return {
    getJobTab: () => cst.getScriptTab(),
    runJob: async (params: JobParameters, { tabId }) => {
      await sendMessage('run-job', params, { context: 'content-script', tabId })
    },
    onSubmission: (event) => handleSubmission(event, submissionLogIds),
    onDiagnostic: handleDiagnostic,
    onSubmitError: (tabId) => flashError(tabId),
    onSubmitSuccess: (tabId) => flashSuccess(tabId),
  }
}

function handleSubmission(
  event: SubmissionEvent,
  submissionLogIds: Map<string, string[]>,
): void {
  switch (event.phase) {
    case 'skipped-duplicate':
      log({
        severity: 'info',
        scope: 'pool',
        text: 'Skipping duplicate submission',
      })
      return
    case 'start': {
      void Promise.all(
        event.events.map((scraped) =>
          pushScrapeLog({
            type: 'scrape',
            severity: 'info',
            patches: scraped.patches,
            warnings: event.warnings,
            source: scraped.funnel,
          }),
        ),
      ).then((ids) => {
        submissionLogIds.set(event.submissionId, ids)
      })
      const labels = event.events
        .map((e) => e.funnel.kind)
        .join(', ')
      console.log(`[tide] scraped ${labels}`, event.events)
      return
    }
    case 'submitted':
    case 'failed': {
      const ids = submissionLogIds.get(event.submissionId) ?? []
      submissionLogIds.delete(event.submissionId)
      const status = event.phase === 'submitted' ? 'submitted' : 'failed'
      void Promise.all(
        ids.map((id) => updateScrapeLogStatus(id, status, event.meta)),
      )
      return
    }
  }
}

function handleDiagnostic(event: DiagnosticEvent): void {
  switch (event.kind) {
    case 'heartbeat-skipped':
      log({
        severity: event.reason === 'invalid-url' ? 'error' : 'debug',
        scope: 'pool',
        text:
          event.reason === 'invalid-url'
            ? 'Heartbeat failed: invalid server URL'
            : 'Heartbeat skipped: server not configured',
        data: event.error ? { error: event.error } : undefined,
      })
      return
    case 'heartbeat-unreachable':
      log({
        severity: 'warning',
        scope: 'pool',
        text: 'Heartbeat: fetch threw before receiving a response',
        data: { error: event.error },
      })
      return
    case 'server-undefined-on-update':
      log({
        severity: 'error',
        scope: 'pool',
        text: 'Tried to update server URL but no server is defined',
      })
      return
    case 'sites-sync-failed':
      log({
        severity: 'error',
        scope: 'pool',
        text: 'Failed to sync opted-in sites',
        data: { error: event.error },
      })
      return
    case 'job-run-start':
      log({
        severity: 'debug',
        scope: 'pool',
        text: `Running job: ${event.siteId}`,
        data: { url: event.url, siteId: event.siteId, tabId: event.tabId },
      })
      return
    case 'job-run-failed':
      log({
        severity: 'error',
        scope: 'pool',
        text: 'Something went wrong while trying to run job',
        data: { error: event.error, tabId: event.tabId },
      })
      return
    case 'sites-refetch-requested':
      log({
        severity: 'info',
        scope: 'pool',
        text: 'The server requested a refetch because the sites have changed',
      })
      return
    case 'poll-failed':
      log({
        severity: 'error',
        scope: 'pool',
        text: `Error polling for new jobs: ${event.server.name} ${event.error}`,
        data: { server: event.server, message: event.error },
      })
      return
    case 'submit-unreachable':
      log({
        severity: 'error',
        scope: 'pool',
        text: 'Failed to reach server',
        data: { error: event.error },
      })
      return
    case 'precondition-giving-up':
      log({
        severity: 'error',
        scope: 'pool',
        text: 'Failed job precondition more than 3 times while submitting! Giving up and pausing temporarily',
        data: { retries: event.retries },
      })
      return
    case 'precondition-retrying':
      log({
        severity: 'warning',
        scope: 'pool',
        text: 'Failed job precondition while submitting. Trying to refresh and re-submit...',
      })
      return
    case 'precondition-reschedule-failed':
      log({
        severity: 'error',
        scope: 'pool',
        text: 'Got an error while trying to reschedule a failed precondition',
        data: { error: event.error },
      })
      return
    case 'submit-rejected':
      log({
        severity: 'error',
        scope: 'pool',
        text: 'Failed to submit job',
        data: { response: event.response },
      })
      return
    case 'site-not-found':
      log({
        severity: 'error',
        scope: 'pool',
        text: `Could not find site ${event.siteId}`,
      })
      return
  }
}
