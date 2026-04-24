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
      suggestedLoaderName: string
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

export interface LoaderFixture {
  path: string
  name: string
  data: unknown
}

export interface LoaderInfo {
  site: string
  loader: string
  file: string
  path: string
  expression: string
  fixtures: LoaderFixture[]
  request?: { method: string; url: string }
}

export type LoaderMatchResult =
  | {
      matched: true
      loader: string
      file: string
      patches: unknown[]
      validationErrors: string[]
    }
  | {
      matched: false
      loader: string
      file: string
      error?: string
    }

export interface GenerationAttempt {
  attempt: number
  jsonataExpression: string
  validationErrors: string[]
}
