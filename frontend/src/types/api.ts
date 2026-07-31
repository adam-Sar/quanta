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
