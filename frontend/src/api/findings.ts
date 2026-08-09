import { apiGet, apiPost } from "./client";
import type {
  DetectionRunResponse,
  FindingListResponse,
  Validation,
  ValidationListResponse,
} from "@/types/api";

export function listFindings(
  datasetId: string,
  page = 1,
  pageSize = 50,
) {
  return apiGet<FindingListResponse>(`/datasets/${datasetId}/detections`, {
    page,
    page_size: pageSize,
  });
}

export function runDetection(datasetId: string) {
  return apiPost<DetectionRunResponse>(`/datasets/${datasetId}/detections`);
}

export function listValidations(
  datasetId: string,
  recommendationId: string,
  page = 1,
  pageSize = 50,
) {
  return apiGet<ValidationListResponse>(
    `/datasets/${datasetId}/recommendations/${recommendationId}/validations`,
    { page, page_size: pageSize },
  );
}

export function runValidation(datasetId: string, recommendationId: string) {
  return apiPost<Validation>(
    `/datasets/${datasetId}/recommendations/${recommendationId}/validate`,
  );
}
