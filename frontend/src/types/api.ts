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

export interface DetectionRunResponse {
  dataset_id: string
  profile_id: string | null
  finding_count: number
  findings: FindingResponse[]
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

export type SchemaChangeType = 'added' | 'removed' | 'type_changed'

export interface ColumnDiffResponse {
  name: string
  change: SchemaChangeType
  base_physical_type: string | null
  target_physical_type: string | null
  base_logical_type: string | null
  target_logical_type: string | null
}

export interface SchemaDiffResponse {
  added: string[]
  removed: string[]
  type_changes: ColumnDiffResponse[]
}

export type NumericDriftMetric = 'mean' | 'median' | 'std' | 'min' | 'max'

export interface NumericDriftResponse {
  column: string
  metric: NumericDriftMetric
  base_value: number | null
  target_value: number | null
  absolute_change: number | null
  relative_change: number | null
}

export interface CategoricalDriftResponse {
  column: string
  metric: 'psi'
  psi: number
  base_top_values: Array<Record<string, unknown>>
  target_top_values: Array<Record<string, unknown>>
}

export interface DistributionDriftResponse {
  numeric: NumericDriftResponse[]
  categorical: CategoricalDriftResponse[]
}

export interface ScoreDriftResponse {
  base_score: number | null
  target_score: number | null
  delta: number | null
  absolute_delta: number | null
  base_grade: string | null
  target_grade: string | null
  grade_changed: boolean
}

export interface HistoryComparisonRequest {
  base_version_id: string
  target_version_id: string
}

export interface HistoryComparisonResponse {
  comparison_id: string
  dataset_id: string
  base_version_id: string
  target_version_id: string
  formula_version: string
  schema_diff: SchemaDiffResponse
  distribution_drift: DistributionDriftResponse
  score_drift: ScoreDriftResponse
  created_at: string
}

export interface HistoryComparisonListResponse {
  items: HistoryComparisonResponse[]
  pagination: Pagination
}

export interface DatasetVersionListResponse {
  items: DatasetVersionResponse[]
  pagination: Pagination
}

export type HypothesisCategory =
  | 'schema_drift'
  | 'data_quality'
  | 'pipeline'
  | 'upstream_source'
  | 'other'

export interface HypothesisResponse {
  category: HypothesisCategory
  summary: string
  affected_columns: string[]
  supporting_finding_ids: string[]
  confidence: number
}

export interface AIInterpretationResponse {
  interpretation_id: string
  dataset_id: string
  profile_id: string
  provider_name: string
  model_name: string
  formula_version: string
  summary: string
  overall_confidence: number
  input_finding_ids: string[]
  hypotheses: HypothesisResponse[]
  created_at: string
}

export interface AIInterpretationListResponse {
  items: AIInterpretationResponse[]
  pagination: Pagination
}
