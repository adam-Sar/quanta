import { request } from './client'
import type {
  AIInterpretationListResponse,
  AIInterpretationResponse,
  DatasetProfileListResponse,
  DatasetProfileResponse,
  DetectionRunResponse,
  FindingListResponse,
  HistoryComparisonListResponse,
  HistoryComparisonRequest,
  HistoryComparisonResponse,
  JobCreateRequest,
  JobListResponse,
  JobResponse,
  LineageResponse,
  QualityScoreResponse,
  RecommendationListResponse,
  RecommendationResponse,
  ValidationListResponse,
  ValidationResponse,
} from '../types/api'
import { listDatasets } from './datasets'

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

export interface ListDatasetInterpretationsParams {
  page?: number
  pageSize?: number
}

export function listDatasetInterpretations(
  datasetId: string,
  { page = 1, pageSize = 50 }: ListDatasetInterpretationsParams = {},
): Promise<AIInterpretationListResponse> {
  const searchParams = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return request<AIInterpretationListResponse>(`/datasets/${datasetId}/interpretations?${searchParams.toString()}`)
}

export function getDatasetInterpretation(
  datasetId: string,
  interpretationId: string,
): Promise<AIInterpretationResponse> {
  return request<AIInterpretationResponse>(`/datasets/${datasetId}/interpretations/${interpretationId}`)
}

export function createDatasetInterpretation(datasetId: string): Promise<AIInterpretationResponse> {
  return request<AIInterpretationResponse>(`/datasets/${datasetId}/interpretations`, {
    method: 'POST',
  })
}

export interface ListDatasetRecommendationsParams {
  page?: number
  pageSize?: number
}

export function listDatasetRecommendations(
  datasetId: string,
  { page = 1, pageSize = 50 }: ListDatasetRecommendationsParams = {},
): Promise<RecommendationListResponse> {
  const searchParams = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return request<RecommendationListResponse>(`/datasets/${datasetId}/recommendations?${searchParams.toString()}`)
}

export function getDatasetRecommendation(
  datasetId: string,
  recommendationId: string,
): Promise<RecommendationResponse> {
  return request<RecommendationResponse>(`/datasets/${datasetId}/recommendations/${recommendationId}`)
}

export function createDatasetRecommendations(datasetId: string): Promise<RecommendationResponse[]> {
  return request<RecommendationResponse[]>(`/datasets/${datasetId}/recommendations`, {
    method: 'POST',
  })
}

export interface ListDatasetValidationsParams {
  page?: number
  pageSize?: number
}

export function listDatasetValidations(
  datasetId: string,
  recommendationId: string,
  { page = 1, pageSize = 50 }: ListDatasetValidationsParams = {},
): Promise<ValidationListResponse> {
  const searchParams = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return request<ValidationListResponse>(
    `/datasets/${datasetId}/recommendations/${recommendationId}/validations?${searchParams.toString()}`,
  )
}

export function getDatasetValidation(
  datasetId: string,
  recommendationId: string,
  validationId: string,
): Promise<ValidationResponse> {
  return request<ValidationResponse>(
    `/datasets/${datasetId}/recommendations/${recommendationId}/validations/${validationId}`,
  )
}

export function createDatasetValidation(
  datasetId: string,
  recommendationId: string,
): Promise<ValidationResponse> {
  return request<ValidationResponse>(
    `/datasets/${datasetId}/recommendations/${recommendationId}/validate`,
    { method: 'POST' },
  )
}

export interface ListDatasetJobsParams {
  page?: number
  pageSize?: number
}

export function listDatasetJobs(
  datasetId: string,
  { page = 1, pageSize = 50 }: ListDatasetJobsParams = {},
): Promise<JobListResponse> {
  const searchParams = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return request<JobListResponse>(`/datasets/${datasetId}/jobs?${searchParams.toString()}`)
}

export function getDatasetJob(jobId: string): Promise<JobResponse> {
  return request<JobResponse>(`/datasets/jobs/${jobId}`)
}

export function createDatasetJob(
  datasetId: string,
  payload: JobCreateRequest,
): Promise<JobResponse> {
  return request<JobResponse>(`/datasets/${datasetId}/jobs`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * Aggregated workspace Jobs view.
 *
 * The backend has no global jobs endpoint; the durable jobs are stored
 * per-dataset. We list every dataset, then fan out to the per-dataset
 * jobs endpoint and merge the results. Each job gets the source
 * dataset_id attached for display.
 */
export interface GlobalJob extends JobResponse {
  dataset_id: string
}

export async function listGlobalJobs(maxDatasets = 50): Promise<GlobalJob[]> {
  const ds = await listDatasets({ page: 1, pageSize: maxDatasets })
  const results = await Promise.all(
    ds.items.map(async (dataset) => {
      try {
        const res = await listDatasetJobs(dataset.id, { page: 1, pageSize: 50 })
        return res.items.map((job) => ({ ...job, dataset_id: dataset.id }))
      } catch {
        return [] as GlobalJob[]
      }
    }),
  )
  return results
    .flat()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}
