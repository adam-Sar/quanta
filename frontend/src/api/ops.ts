import { apiGet } from "./client";
import type { Limits } from "@/types/api";

export function getLimits() {
  return apiGet<Limits>("/limits");
}
