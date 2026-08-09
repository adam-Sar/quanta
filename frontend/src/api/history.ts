import { apiGet } from "./client";
import type { LineageResponse } from "@/types/api";

export function getLineage(datasetId: string) {
  return apiGet<LineageResponse>(`/datasets/${datasetId}/lineage`);
}
