import type { ApiErrorDetails, ApiErrorPayload } from '../types/api'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
const defaultBaseUrl = import.meta.env.DEV ? '' : 'http://localhost:8000'
export const API_BASE_URL = (configuredBaseUrl ?? defaultBaseUrl).replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: ApiErrorDetails
  readonly requestId: string | null

  constructor(
    status: number,
    code: string,
    message: string,
    details: ApiErrorDetails,
    requestId: string | null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ui-${crypto.randomUUID()}`
  }

  return `ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (!value || typeof value !== 'object' || !('error' in value)) {
    return false
  }

  const error = value.error
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'request_id' in error &&
    typeof error.code === 'string' &&
    typeof error.message === 'string' &&
    typeof error.request_id === 'string'
  )
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestId = createRequestId()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('X-Request-ID', requestId)

  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(
      0,
      'network_error',
      'Unable to reach the Quanta API. Check that the backend is running and try again.',
      null,
      requestId,
    )
  }

  const responseRequestId = response.headers.get('X-Request-ID') ?? requestId
  const rawBody = await response.text()
  let payload: unknown = null

  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as unknown
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    if (isApiErrorPayload(payload)) {
      throw new ApiError(
        response.status,
        payload.error.code,
        payload.error.message,
        payload.error.details,
        payload.error.request_id || responseRequestId,
      )
    }

    throw new ApiError(
      response.status,
      'request_failed',
      `The API returned an unexpected ${response.status} response.`,
      null,
      responseRequestId,
    )
  }

  if (response.status === 204 || !rawBody) {
    return undefined as T
  }

  return payload as T
}
