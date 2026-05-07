export interface CaptureEntry {
  id: string
  hostname: string
  url: string
  method: string
  status: number
  requestBody: string | null
  responseBody: string
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  capturedAt: number
}

export interface GenerationRequest {
  selectedCaptureIds: string[]
  targetHostname: string
}

export type GenerationResult =
  | {
      success: true
      jsonataExpression: string
      fixtureJson: string
      suggestedFunnelName: string
      suggestedRequestUrl: string
      suggestedRequestMethod: string
      potentialEntities: string
    }
  | {
      success: false
      error: string
    }

export interface GenerationProgress {
  stage:
    | 'assembling'
    | 'calling-api'
    | 'validating'
    | 'retrying'
    | 'done'
    | 'error'
  attempt?: number
  message?: string
  validationErrors?: string[]
  timestamp: number
}

export interface FunnelFixture {
  path: string
  name: string
  data: unknown
}

export interface FunnelInfo {
  site: string
  funnel: string
  file: string
  path: string
  expression: string
  format: 'jsonata' | 'htmlegy'
  fixtures: FunnelFixture[]
  request: { method: string; url: string | string[] }
}

export type FunnelMatchResult =
  | {
      matched: true
      funnel: string
      file: string
      patches: unknown[]
      validationErrors: string[]
    }
  | {
      matched: false
      funnel: string
      file: string
      error?: string
    }

export interface GenerationAttempt {
  attempt: number
  jsonataExpression: string
  validationErrors: string[]
}
