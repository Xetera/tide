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
  stage: 'assembling' | 'calling-api' | 'validating' | 'retrying' | 'done' | 'error'
  attempt?: number
  message?: string
  validationErrors?: string[]
  timestamp: number
}

export interface GenerationAttempt {
  attempt: number
  jsonataExpression: string
  validationErrors: string[]
}
