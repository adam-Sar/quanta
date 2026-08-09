/* ---------- Domain types mirroring backend/app/schemas/* ---------- */

export interface Pagination {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

/* ---------- Health ---------- */

export interface HealthStatus {
  status: string;
  service: string;
  version: string;
  environment: string;
  timestamp: string;
}

export interface HealthReady {
  status: string;
  checks: { database: string };
  timestamp: string;
}

/* ---------- Datasets ---------- */

export type DatasetVersionStatus = "uploading" | "stored" | "failed";

export interface DatasetColumn {
  name: string;
  ordinal_position: number;
  physical_type: string;
  logical_type: string;
  nullable: boolean | null;
}

export interface DatasetVersion {
  id: string;
  version_number: number;
  format: string;
  status: DatasetVersionStatus;
  original_filename: string;
  media_type: string | null;
  size_bytes: number;
  row_count: number;
  column_count: number;
  content_sha256: string;
  created_at: string;
  columns: DatasetColumn[];
}

export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  current_version: DatasetVersion | null;
}

export interface DatasetListResponse {
  items: Dataset[];
  pagination: Pagination;
}

export interface DatasetVersionListResponse {
  items: DatasetVersion[];
  pagination: Pagination;
}
/* ---------- Profiles ---------- */

export interface TopValue {
  value: string;
  count: number;
  frequency: number;
}

export interface NumericMetrics {
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  std: number | null;
  sum: number | null;
}

export interface TemporalMetrics {
  min: string | null;
  max: string | null;
}

export interface StringLengthMetrics {
  min: number | null;
  max: number | null;
  mean: number | null;
}

export interface ColumnMetrics {
  physical_type: string;
  sample_size: number;
  non_null_count: number;
  null_count: number;
  null_rate: number;
  distinct_count: number;
  distinct_rate: number;
  top_values: TopValue[];
  numeric: NumericMetrics;
  temporal: TemporalMetrics;
  string_length: StringLengthMetrics;
}

export interface DatasetProfileColumn {
  name: string;
  ordinal_position: number;
  metrics: ColumnMetrics;
}

export interface DatasetProfile {
  profile_id: string;
  dataset_id: string;
  dataset_version_id: string;
  sample_size: number;
  sampled: "sampled" | "full";
  started_at: string;
  completed_at: string;
  duration_ms: number;
  columns: DatasetProfileColumn[];
}

export interface DatasetProfileListResponse {
  items: DatasetProfile[];
  pagination: Pagination;
}
/* ---------- Findings ---------- */

export type FindingKind =
  | "missingness"
  | "duplicates"
  | "invalid_values"
  | "outlier"
  | "cardinality";

export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface Finding {
  finding_id: string;
  dataset_id: string;
  dataset_version_id: string;
  profile_id: string;
  kind: FindingKind;
  severity: FindingSeverity;
  column_name: string | null;
  metric: string;
  value: number;
  threshold: number;
  description: string;
  details: Record<string, unknown>;
}

export interface FindingListResponse {
  items: Finding[];
  pagination: Pagination;
}

export interface DetectionRunResponse {
  job_id: string;
  dataset_id: string;
  finding_count: number;
  findings: Finding[];
}
/* ---------- Scores ---------- */

export interface ScoreComponentBucket {
  count: number;
  penalty_total: number;
  penalty_normalized: number;
}

export interface PerFindingScore {
  kind: FindingKind;
  severity: FindingSeverity;
  column_name: string | null;
  metric: string;
  value: number;
  threshold: number;
  detection_confidence: number;
  data_error_confidence: number;
  penalty: number;
}

export interface ScoreComponents {
  by_kind: Record<string, ScoreComponentBucket>;
  by_severity: Record<string, ScoreComponentBucket>;
  by_column: Record<string, ScoreComponentBucket>;
  overall_penalty_total: number;
  overall_penalty_normalized: number;
  column_count: number;
  per_finding: PerFindingScore[];
}

export interface QualityScore {
  score_id: string;
  dataset_id: string;
  dataset_version_id: string;
  profile_id: string;
  finding_count: number;
  score: number;
  grade: string;
  formula_version: string;
  components: ScoreComponents;
  created_at: string;
}

export interface QualityScoreListResponse {
  items: QualityScore[];
  pagination: Pagination;
}
/* ---------- Recommendations ---------- */

export type RecommendationKind =
  | "data_quality_fix"
  | "duplicate_removal"
  | "outlier_treatment"
  | "schema_normalization"
  | "cardinality_reduction"
  | "missingness_treatment"
  | "pipeline_review";

export type OperationKind =
  | "impute_missing"
  | "drop_column"
  | "drop_duplicates"
  | "cap_outliers"
  | "cast_type"
  | "normalize_string"
  | "deduplicate_keys";

export interface Recommendation {
  recommendation_id: string;
  dataset_id: string;
  dataset_version_id: string;
  profile_id: string;
  kind: RecommendationKind;
  severity: FindingSeverity;
  title: string;
  rationale: string;
  operation: OperationKind;
  affected_columns: string[];
  parameters: Record<string, unknown>;
  confidence: number;
  priority: number;
  preview_only: boolean;
  created_at: string;
}

export interface RecommendationListResponse {
  items: Recommendation[];
  pagination: Pagination;
}

export interface ValidationImpact {
  rows_changed: number;
  columns_changed: number;
  nulls_removed: number;
  duplicates_removed: number;
  outliers_capped: number;
  values_normalized: number;
}

export interface Validation {
  validation_id: string;
  recommendation_id: string;
  dataset_id: string;
  dataset_version_id: string;
  status: "succeeded" | "failed";
  impact: ValidationImpact;
  created_at: string;
}

export interface ValidationListResponse {
  items: Validation[];
  pagination: Pagination;
}
/* ---------- History ---------- */

export interface LineageEdge {
  from_version_id: string;
  to_version_id: string;
  from_version_number: number;
  to_version_number: number;
  relationship: string;
}

export interface LineageResponse {
  dataset_id: string;
  edges: LineageEdge[];
}

/* ---------- AI ---------- */

export interface AIInterpretation {
  interpretation_id: string;
  dataset_id: string;
  profile_id: string;
  finding_count: number;
  summary: string;
  likely_cause: string | null;
  confidence: number;
  model: string;
  formula_version: string;
  created_at: string;
}

export interface AIInterpretationListResponse {
  items: AIInterpretation[];
  pagination: Pagination;
}

/* ---------- Jobs ---------- */

export type JobKind =
  | "profile"
  | "detect"
  | "score"
  | "history"
  | "recommendations"
  | "validations";

export type JobStatus = "pending" | "running" | "succeeded" | "failed";

export interface Job {
  job_id: string;
  dataset_id: string;
  profile_id: string | null;
  kind: JobKind;
  status: JobStatus;
  title: string;
  parameters: Record<string, unknown>;
  result: Record<string, unknown>;
  error: Record<string, unknown>;
  formula_version: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface JobListResponse {
  items: Job[];
  pagination: Pagination;
}

/* ---------- Ops ---------- */

export interface Limits {
  rate_limit_capacity: number;
  rate_limit_window_seconds: number;
  max_request_bytes: number;
  max_upload_size_bytes: number;
  request_budget_ms: number;
  metrics_buffer_capacity: number;
}