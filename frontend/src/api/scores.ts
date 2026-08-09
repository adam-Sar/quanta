import { apiGet, apiPost } from "./client";
import type {
  QualityScore,
  QualityScoreListResponse,
} from "@/types/api";

export function getLatestScore(datasetId: string) {
  return apiGet<QualityScore>(`/datasets/${datasetId}/score`);
}

export function getVersionScore(datasetId: string, versionId: string) {
  return apiGet<QualityScore>(
    `/datasets/${datasetId}/versions/${versionId}/score`,
  );
}

export function listScores(datasetId: string, page = 1, pageSize = 50) {
  return apiGet<QualityScoreListResponse>(`/datasets/${datasetId}/scores`, {
    page,
    page_size: pageSize,
  });
}

export function runScore(datasetId: string) {
  return apiPost<QualityScore>(`/datasets/${datasetId}/scores`);
}
