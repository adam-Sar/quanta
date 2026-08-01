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

export type DatasetFormat = 'csv' | 'parquet'
export type DatasetVersionStatus = 'stored'
export type LogicalDataType =
  | 'boolean'
  | 'integer'
  | 'float'
  | 'decimal'
  | 'string'
  | 'date'
  | 'datetime'
  | 'time'
  | 'duration'
  | 'binary'
  | 'list'
  | 'struct'
  | 'unknown'

export interface Pagination {
  page: number
  page_size: number
  total_items: number
  total_pages: number
}

export interface DatasetColumnResponse {
  name: string
  ordinal_position: number
  physical_type: string
  logical_type: LogicalDataType
  nullable: boolean | null
}

export interface DatasetVersionResponse {
  id: string
  version_number: number
  format: DatasetFormat
  status: DatasetVersionStatus
  original_filename: string
  media_type: string | null
  size_bytes: number
  row_count: number
  column_count: number
  content_sha256: string
  created_at: string
  columns: DatasetColumnResponse[]
}

export interface DatasetResponse {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  current_version: DatasetVersionResponse | null
}

export interface DatasetListResponse {
  items: DatasetResponse[]
  pagination: Pagination
}

export type ColumnSamplingFlag = 'full' | 'sampled'

export interface TopValueResponse {
  value: string
  count: number
  frequency: number
}

export interface NumericMetricsResponse {
  min: number | null
  max: number | null
  mean: number | null
  median: number | null
  std: number | null
  sum: number | null
}

export interface TemporalMetricsResponse {
  min: string | null
  max: string | null
}

export interface StringLengthMetricsResponse {
  min: number | null
  max: number | null
  mean: number | null
}

export interface ColumnProfileMetricsResponse {
  physical_type: string
  sample_size: number
  non_null_count: number
  null_count: number
  null_rate: number
  distinct_count: number
  distinct_rate: number
  top_values: TopValueResponse[]
  numeric: NumericMetricsResponse
  temporal: TemporalMetricsResponse
  string_length: StringLengthMetricsResponse
}

export interface ColumnProfileResponse {
  name: string
  ordinal_position: number
  metrics: ColumnProfileMetricsResponse
}

export interface DatasetProfileResponse {
  profile_id: string
  dataset_id: string
  dataset_version_id: string
  sample_size: number
  sampled: ColumnSamplingFlag
  started_at: string
  completed_at: string
  duration_ms: number
  columns: ColumnProfileResponse[]
}

export interface DatasetProfileListResponse {
  items: DatasetProfileResponse[]
  pagination: Pagination
}

export type FindingKind = 'missingness' | 'duplicates' | 'invalid_values' | 'outlier' | 'cardinality'
export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export interface FindingResponse {
  finding_id: string
  dataset_id: string
  dataset_version_id: string
  profile_id: string
  kind: FindingKind
  severity: FindingSeverity
  column_name: string | null
  metric: string
  value: number
  threshold: number
  description: string
  details: Record<string, unknown>
}

export interface FindingListResponse {
  items: FindingResponse[]
  pagination: Pagination
}

export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface ScoreComponentBucket {
  count: number
  penalty_total: number
  penalty_normalized: number
}

export interface PerFindingScore {
  kind: FindingKind
  severity: FindingSeverity
  column_name: string | null
  metric: string
  value: number
  threshold: number
  detection_confidence: number
  data_error_confidence: number
  penalty: number
}

export interface ScoreComponents {
  by_kind: Record<string, ScoreComponentBucket>
  by_severity: Record<string, ScoreComponentBucket>
  by_column: Record<string, ScoreComponentBucket>
  overall_penalty_total: number
  overall_penalty_normalized: number
  column_count: number
  per_finding: PerFindingScore[]
}

export interface QualityScoreResponse {
  score_id: string
  dataset_id: string
  dataset_version_id: string
  profile_id: string
  finding_count: number
  score: number
  grade: QualityGrade
  formula_version: string
  components: ScoreComponents
  created_at: string
}

export interface LineageEdgeResponse {
  dataset_id: string
  from_version_id: string
  from_version_number: number
  from_created_at: string
  to_version_id: string
  to_version_number: number
  to_created_at: string
}

export interface LineageResponse {
  dataset_id: string
  edges: LineageEdgeResponse[]
}
