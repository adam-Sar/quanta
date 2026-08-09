import { apiGet } from "./client";
import type { HealthStatus, HealthReady } from "@/types/api";

export const getHealth = () => apiGet<HealthStatus>("/health");
export const getHealthReady = () => apiGet<HealthReady>("/health/ready");
