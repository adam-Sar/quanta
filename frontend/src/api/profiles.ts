import { apiGet, apiPost } from "./client";
import type {
  DatasetProfile,
  DatasetProfileListResponse,
} from "@/types/api";

export function getDatasetProfile(datasetId: string) {
  return apiGet<DatasetProfile>(`/datasets/${datasetId}/profile`);
}

export function getVersionProfile(datasetId: string, versionId: string) {
  return apiGet<DatasetProfile>(
    `/datasets/${datasetId}/versions/${versionId}/profile`,
  );
}

export function listDatasetProfiles(
  datasetId: string,
  page = 1,
  pageSize = 50,
) {
  return apiGet<DatasetProfileListResponse>(
    `/datasets/${datasetId}/profiles`,
    { page, page_size: pageSize },
  );
}

export function createDatasetProfile(datasetId: string) {
  return apiPost<DatasetProfile>(`/datasets/${datasetId}/profile`);
}
