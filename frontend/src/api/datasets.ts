import { request } from './client'
import type { DatasetListResponse, DatasetResponse } from '../types/api'

const DEFAULT_PAGE_SIZE = 50

export interface ListDatasetsParams {
  page?: number
  pageSize?: number
}

export function listDatasets({ page = 1, pageSize = DEFAULT_PAGE_SIZE }: ListDatasetsParams = {}): Promise<DatasetListResponse> {
  const searchParams = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })

  return request<DatasetListResponse>(`/datasets?${searchParams.toString()}`)
}

export interface CreateDatasetInput {
  file: File
  name: string
  description?: string
}

export function getDataset(datasetId: string): Promise<DatasetResponse> {
  return request<DatasetResponse>(`/datasets/${datasetId}`)
}

export function createDataset({ file, name, description }: CreateDatasetInput): Promise<DatasetResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('name', name)
  if (description?.trim()) {
    formData.append('description', description.trim())
  }

  return request<DatasetResponse>('/datasets', {
    method: 'POST',
    body: formData,
  })
}
