import { apiGet, apiPost } from "./client";
import type {
  AIInterpretation,
  AIInterpretationListResponse,
} from "@/types/api";

export function listInterpretations(
  datasetId: string,
  page = 1,
  pageSize = 50,
) {
  return apiGet<AIInterpretationListResponse>(
    `/datasets/${datasetId}/interpretations`,
    { page, page_size: pageSize },
  );
}

export function getInterpretation(datasetId: string, interpretationId: string) {
  return apiGet<AIInterpretation>(
    `/datasets/${datasetId}/interpretations/${interpretationId}`,
  );
}

export function runInterpretation(datasetId: string) {
  return apiPost<AIInterpretation>(
    `/datasets/${datasetId}/interpretations`,
  );
}
