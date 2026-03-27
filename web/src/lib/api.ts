import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "./auth";
import type {
  TokenResponse,
  UserResponse,
  DiaryListResponse,
  DiaryDetail,
  TagSuggestResponse,
  DiarySuggestResponse,
  TagListResponse,
  TagTreeResponse,
  CommentResponse,
  MediaUploadResponse,
  MediaInfoResponse,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

/* ── Generic fetch wrapper ── */

async function fetchApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Try refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${getAccessToken()}`;
      const retryRes = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });
      if (!retryRes.ok) {
        throw new ApiError(retryRes.status, await retryRes.text());
      }
      return retryRes.json();
    }
    clearTokens();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Unauthorized");
  }

  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`API Error ${status}: ${body}`);
    this.status = status;
  }
}

async function tryRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data: TokenResponse = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

/* ── Auth ── */

export async function login(
  username: string,
  password: string,
): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export async function register(
  username: string,
  email: string,
  password: string,
): Promise<UserResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export async function refreshToken(): Promise<TokenResponse> {
  const refresh = getRefreshToken();
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  const data: TokenResponse = await res.json();
  setTokens(data.access_token, data.refresh_token);
  return data;
}

/* ── Diaries ── */

export async function getDiaries(params?: {
  page?: number;
  per_page?: number;
  tag?: string;
  q?: string;
}): Promise<DiaryListResponse> {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.per_page) sp.set("per_page", String(params.per_page));
  if (params?.tag) sp.set("tag", params.tag);
  if (params?.q) sp.set("q", params.q);
  const qs = sp.toString();
  return fetchApi<DiaryListResponse>(`/diary${qs ? `?${qs}` : ""}`);
}

export async function getDiary(id: string): Promise<DiaryDetail> {
  return fetchApi<DiaryDetail>(`/diary/${id}`);
}

export async function createDiary(
  content: string,
  manualTitle?: string,
  latitude?: number,
  longitude?: number,
): Promise<DiaryDetail> {
  const payload: Record<string, unknown> = { content, manual_title: manualTitle };
  if (latitude !== undefined && longitude !== undefined) {
    payload.latitude = latitude;
    payload.longitude = longitude;
  }
  return fetchApi<DiaryDetail>("/diary", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateDiary(
  id: string,
  content: string,
  manualTitle?: string,
): Promise<DiaryDetail> {
  return fetchApi<DiaryDetail>(`/diary/${id}`, {
    method: "PUT",
    body: JSON.stringify({ content, manual_title: manualTitle }),
  });
}

export async function deleteDiary(id: string): Promise<void> {
  return fetchApi<void>(`/diary/${id}`, { method: "DELETE" });
}

/* ── Suggestions ── */

export async function suggestTags(q: string): Promise<TagSuggestResponse> {
  return fetchApi<TagSuggestResponse>(
    `/tags/suggest?q=${encodeURIComponent(q)}`,
  );
}

export async function suggestDiary(q: string): Promise<import("./types").DiarySuggestResponse> {
  return fetchApi<import("./types").DiarySuggestResponse>(
    `/diary/suggest?q=${encodeURIComponent(q)}`,
  );
}

/* ── Tags ── */

export async function getTags(): Promise<TagListResponse> {
  return fetchApi<TagListResponse>("/tags");
}

export async function getTagTree(): Promise<TagTreeResponse> {
  return fetchApi<TagTreeResponse>("/tags/tree");
}

export async function setTagHierarchy(tag: string, parent: string): Promise<void> {
  return fetchApi<void>("/tags/hierarchy", {
    method: "PUT",
    body: JSON.stringify({ tag, parent }),
  });
}

export async function removeTagHierarchy(tag: string): Promise<void> {
  return fetchApi<void>(`/tags/hierarchy/${encodeURIComponent(tag)}`, {
    method: "DELETE",
  });
}

/* ── Versions (edit history) ── */

export interface DiaryVersion {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
}

export async function getDiaryVersions(entryId: string): Promise<DiaryVersion[]> {
  return fetchApi<DiaryVersion[]>(`/diary/${entryId}/versions`);
}

/* ── Comments ── */

export async function getComments(entryId: string): Promise<CommentResponse[]> {
  return fetchApi<CommentResponse[]>(`/diary/${entryId}/comments`);
}

export async function createComment(
  entryId: string,
  content: string,
): Promise<CommentResponse> {
  return fetchApi<CommentResponse>(`/diary/${entryId}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

/* ── Agent Tasks ── */

export async function getAgentTasksByEntry(entryId: string): Promise<import("./types").AgentTaskResponse[]> {
  return fetchApi<import("./types").AgentTaskResponse[]>(`/agent/tasks/by-entry/${entryId}`);
}

export async function dispatchAgentTask(entryId: string, command: string): Promise<import("./types").AgentTaskResponse> {
  return fetchApi<import("./types").AgentTaskResponse>("/agent/dispatch", {
    method: "POST",
    body: JSON.stringify({ entry_id: entryId, command }),
  });
}

/* ── Media ── */

export async function uploadMedia(
  file: File,
  entryId?: string,
): Promise<MediaUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  if (entryId) form.append("entry_id", entryId);
  return fetchApi<MediaUploadResponse>("/media/upload", {
    method: "POST",
    body: form,
  });
}

export async function getMediaInfo(mediaId: string): Promise<MediaInfoResponse> {
  return fetchApi<MediaInfoResponse>(`/media/${mediaId}/info`);
}

// ── Retag All ──

export function startRetagAll() {
  return fetchApi<{ task_id: string; message: string }>("/tags/retag-all", {
    method: "POST",
  });
}

export function getRetagStatus(taskId: string) {
  return fetchApi<{
    state: string;
    phase?: string;
    message?: string;
    current?: number;
    total?: number;
    taxonomy?: Record<string, string[]>;
    updated?: number;
  }>(`/tags/retag-all/${taskId}`);
}
