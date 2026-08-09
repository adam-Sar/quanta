import { apiGet, apiPost } from "./client";
import type { Job, JobKind, JobListResponse } from "@/types/api";

export interface CreateJobInput {
  datasetId: string;
  kind: JobKind;
  title?: string;
  profile_id?: string;
  parameters?: Record<string, unknown>;
}

export function createJob(input: CreateJobInput) {
  return apiPost<Job>(`/datasets/${input.datasetId}/jobs`, {
    kind: input.kind,
    title: input.title,
    profile_id: input.profile_id,
    parameters: input.parameters ?? {},
  });
}

export function listDatasetJobs(
  datasetId: string,
  page = 1,
  pageSize = 50,
) {
  return apiGet<JobListResponse>(`/datasets/${datasetId}/jobs`, {
    page,
    page_size: pageSize,
  });
}

export function getJob(jobId: string) {
  return apiGet<Job>(`/datasets/jobs/${jobId}`);
}
