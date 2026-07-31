import { request } from './client'
import type { HealthResponse, ReadinessResponse } from '../types/api'

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health')
}

export function getReadiness(): Promise<ReadinessResponse> {
  return request<ReadinessResponse>('/health/ready')
}
