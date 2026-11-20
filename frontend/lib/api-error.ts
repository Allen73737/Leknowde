import type { ApiErrorPayload } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload: ApiErrorPayload | null;

  constructor(status: number, message: string, code = "request_failed", payload: ApiErrorPayload | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export async function errorFromResponse(response: Response): Promise<ApiError> {
  let payload: ApiErrorPayload | null = null;
  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    payload = null;
  }
  const message =
    payload?.message ||
    (response.status === 401
      ? "Your session has expired. Sign in again."
      : response.status === 403
        ? "You do not have access to this resource."
        : response.status === 404
          ? "The requested resource was not found."
          : response.status >= 500
            ? "The service could not complete this request."
            : "The request failed.");
  return new ApiError(response.status, message, payload?.error ?? "request_failed", payload);
}
