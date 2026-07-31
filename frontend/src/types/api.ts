export type ApiErrorDetails =
  | Record<string, unknown>
  | Array<Record<string, unknown>>
  | null

export interface ApiErrorDetail {
  code: string
  message: string
  details: ApiErrorDetails
  request_id: string
}

export interface ApiErrorPayload {
  error: ApiErrorDetail
}

export interface HealthResponse {
  status: 'ok'
  service: string
  version: string
  environment: string
  timestamp: string
}

export interface ReadinessResponse {
  status: 'ready'
  checks: {
    database: 'up'
  }
  timestamp: string
}
