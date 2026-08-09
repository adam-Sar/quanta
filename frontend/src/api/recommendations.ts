import { apiGet, apiPost } from "./client";
import type {
  Recommendation,
  RecommendationListResponse,
} from "@/types/api";

export function listRecommendations(
  datasetId: string,
  page = 1,
  pageSize = 50,
) {
  return apiGet<RecommendationListResponse>(
    `/datasets/${datasetId}/recommendations`,
    { page, page_size: pageSize },
  );
}

export function getRecommendation(datasetId: string, recommendationId: string) {
  return apiGet<Recommendation>(
    `/datasets/${datasetId}/recommendations/${recommendationId}`,
  );
}

export function runRecommendations(datasetId: string) {
  return apiPost<RecommendationListResponse>(
    `/datasets/${datasetId}/recommendations`,
  );
}
