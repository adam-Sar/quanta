import axios, { AxiosError, AxiosRequestConfig } from "axios";

export class ApiError extends Error {
  code: string;
  status: number;
  requestId: string | null;
  details: unknown;

  constructor(
    message: string,
    code: string,
    status: number,
    requestId: string | null,
    details: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

interface ApiEnvelopeError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    request_id?: string;
  };
}

function makeRequestId(): string {
  // Aligned with the backend's safe character set for X-Request-ID
  // (letters, digits, ., _, :, -; length 1–128).
  const rand = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36);
  return `ui-${stamp}-${rand}`;
}

export const apiClient = axios.create({
  baseURL: "/api", // proxied to the backend in dev (see vite.config.ts)
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((cfg) => {
  cfg.headers = cfg.headers ?? {};
  cfg.headers["X-Request-ID"] = makeRequestId();
  return cfg;
});

apiClient.interceptors.response.use(
  (r) => r,
  (err: AxiosError<ApiEnvelopeError>) => {
    const status = err.response?.status ?? 0;
    const requestId =
      (err.response?.headers?.["x-request-id"] as string | undefined) ?? null;
    const data = err.response?.data;
    if (data && typeof data === "object" && "error" in data) {
      const e = (data as ApiEnvelopeError).error;
      throw new ApiError(
        e.message ?? err.message,
        e.code ?? "internal_error",
        status,
        e.request_id ?? requestId,
        e.details ?? null,
      );
    }
    throw new ApiError(
      err.message || "Network error",
      "network_error",
      status,
      requestId,
      null,
    );
  },
);

export async function apiGet<T>(
  url: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await apiClient.get<T>(url, { params, ...config });
  return res.data;
}

export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await apiClient.post<T>(url, body, config);
  return res.data;
}

export async function apiDelete<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await apiClient.delete<T>(url, config);
  return res.data;
}
