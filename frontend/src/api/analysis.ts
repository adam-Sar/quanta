import { request } from './client'
import type {
  DatasetProfileListResponse,
  DatasetProfileResponse,
  DetectionRunResponse,
  FindingListResponse,
  HistoryComparisonListResponse,
  HistoryComparisonRequest,
  HistoryComparisonResponse,
  LineageResponse,
  QualityScoreResponse,
} from '../types/api'

export function getDatasetProfile(datasetId: string): Promise<DatasetProfileResponse> {
  return request<DatasetProfileResponse>(`/datasets/${datasetId}/profile`)
}

export function getVersionProfile(
  datasetId: string,
  versionId: string,
): Promise<DatasetProfileResponse> {
  return request<DatasetProfileResponse>(`/datasets/${datasetId}/versions/${versionId}/profile`)
}

export interface ListDatasetProfilesParams {
  page?: number
  pageSize?: number
}

export function listDatasetProfiles(
  datasetId: string,
  { page = 1, pageSize = 50 }: ListDatasetProfilesParams = {},
): Promise<DatasetProfileListResponse> {
  const searchParams = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return request<DatasetProfileListResponse>(`/datasets/${datasetId}/profiles?${searchParams.toString()}`)
}

export function createDatasetProfile(datasetId: string): Promise<DatasetProfileResponse> {
  return request<DatasetProfileResponse>(`/datasets/${datasetId}/profile`, {
    method: 'POST',
  })
}

export interface ListFindingsParams {
  page?: number
  pageSize?: number
}

export function listFindings(
  datasetId: string,
  { page = 1, pageSize = 50 }: ListFindingsParams = {},
): Promise<FindingListResponse> {
  const searchParams = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return request<FindingListResponse>(`/datasets/${datasetId}/detections?${searchParams.toString()}`)
}

export function createDatasetDetection(datasetId: string): Promise<DetectionRunResponse> {
  return request<DetectionRunResponse>(`/datasets/${datasetId}/detections`, {
    method: 'POST',
  })
}

export function getDatasetScore(datasetId: string): Promise<QualityScoreResponse> {
  return request<QualityScoreResponse>(`/datasets/${datasetId}/score`)
}

export function getDatasetLineage(datasetId: string): Promise<LineageResponse> {
  return request<LineageResponse>(`/datasets/${datasetId}/lineage`)
}

export interface ListDatasetComparisonsParams {
  page?: number
  pageSize?: number
}

export function listDatasetComparisons(
  datasetId: string,
  { page = 1, pageSize = 50 }: ListDatasetComparisonsParams = {},
): Promise<HistoryComparisonListResponse> {
  const searchParams = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return request<HistoryComparisonListResponse>(`/datasets/${datasetId}/comparisons?${searchParams.toString()}`)
}

export function getDatasetComparison(
  datasetId: string,
  comparisonId: string,
): Promise<HistoryComparisonResponse> {
  return request<HistoryComparisonResponse>(`/datasets/${datasetId}/comparisons/${comparisonId}`)
}

export function createDatasetComparison(
  datasetId: string,
  payload: HistoryComparisonRequest,
): Promise<HistoryComparisonResponse> {
  return request<HistoryComparisonResponse>(`/datasets/${datasetId}/comparisons`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
