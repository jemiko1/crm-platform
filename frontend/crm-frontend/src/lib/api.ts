export const API_BASE = "";

export const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Handle 401 Unauthorized - session expired
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname;
        if (!currentPath.startsWith("/login")) {
          window.location.href = `/login?expired=1&next=${encodeURIComponent(currentPath + window.location.search)}`;
          return new Promise(() => {}); // Never resolves - page is navigating
        }
      }
    }

    let errorMessage = `Request failed: ${res.status} ${res.statusText}`;
    let errorData: unknown = null;

    try {
      const contentType = res.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        errorData = await res.json();
        errorMessage =
          (errorData as { message?: string })?.message || errorMessage;
      } else {
        const text = await res.text();
        errorMessage = text || errorMessage;
      }
    } catch {
      // If parsing fails, use default error message
    }

    throw new ApiError(errorMessage, res.status, res.statusText, errorData);
  }

  // Handle empty responses (204 No Content, etc.)
  const contentType = res.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include", // Important for cookie-based auth
  });

  return handleResponse<T>(res);
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return apiRequest<T>(path, {
    method: "GET",
    ...init,
  });
}

/**
 * Fetch a list endpoint that may return either a plain array or
 * a paginated wrapper `{ data: T[], meta: {...} }`.
 * Always returns a flat T[].
 */
export async function apiGetList<T>(path: string, init?: RequestInit): Promise<T[]> {
  const raw = await apiGet<any>(path, init);
  if (Array.isArray(raw)) return raw;
  if (raw?.data && Array.isArray(raw.data)) return raw.data;
  if (raw?.items && Array.isArray(raw.items)) return raw.items;
  return [];
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
  });
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  return apiRequest<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
    ...init,
  });
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  return apiRequest<T>(path, {
    method: "PUT",
    body: JSON.stringify(body),
    ...init,
  });
}

export async function apiDelete<T>(
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  return apiRequest<T>(path, {
    method: "DELETE",
    body: body ? JSON.stringify(body) : undefined,
    ...init,
  });
}
