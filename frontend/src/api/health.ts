import { request } from './client'

export interface HealthResponse {
  status: 'ok'
  service: string
  version: string
  environment: string
  timestamp: string
}

export interface ReadinessResponse {
  status: 'ready'
  checks: { database: 'up' }
  timestamp: string
}

export interface LimitsResponse {
  rate_limit_capacity: number
  rate_limit_window_seconds: number
  max_request_bytes: number
  max_upload_size_bytes: number
  request_budget_ms: number
  metrics_buffer_capacity: number
}

export interface MetricsRecent {
  method: string
  path: string
  status_code: number
  duration_ms: number
  observed_at: number
  request_id: string
}

export interface MetricsSummary {
  total_requests: number
  average_ms: number
  min_ms: number
  max_ms: number
  by_status: Record<string, number>
  by_path: Record<string, number>
}

export interface MetricsResponse {
  capacity: number
  size: number
  summary: MetricsSummary
  by_status?: Record<string, number>
  by_path?: Record<string, number>
  recent: MetricsRecent[]
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health')
}

export function getReadiness(): Promise<ReadinessResponse> {
  return request<ReadinessResponse>('/health/ready')
}

export function getLimits(): Promise<LimitsResponse> {
  return request<LimitsResponse>('/limits')
}

export function getMetrics(): Promise<MetricsResponse> {
  return request<MetricsResponse>('/metrics')
}
