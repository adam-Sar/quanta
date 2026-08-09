import { apiClient, apiGet } from "./client";
import type { Dataset, DatasetListResponse, DatasetVersionListResponse } from "@/types/api";

export interface DatasetListParams {
  page?: number;
  page_size?: number;
}

export function listDatasets(params: DatasetListParams = {}) {
  return apiGet<DatasetListResponse>("/datasets", params as Record<string, unknown>);
}

export function getDataset(datasetId: string) {
  return apiGet<Dataset>(`/datasets/${datasetId}`);
}

export function listDatasetVersions(datasetId: string, page = 1, pageSize = 50) {
  return apiGet<DatasetVersionListResponse>(
    `/datasets/${datasetId}/versions`,
    { page, page_size: pageSize },
  );
}

export interface CreateDatasetInput {
  name: string;
  description?: string;
  file: File;
}

export async function createDataset(input: CreateDatasetInput) {
  const form = new FormData();
  form.append("name", input.name);
  if (input.description) form.append("description", input.description);
  form.append("file", input.file);
  const res = await apiClient.post<Dataset>("/datasets", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}