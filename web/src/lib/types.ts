/* ── Diary ── */

export interface DiaryBrief {
  id: string;
  title: string;
  title_source: string;
  tags: string[];
  ai_tags?: string[];
  preview: string;
  address?: string;
  weather?: string;
  weather_icon?: string;
  created_at: string;
  updated_at: string;
}

export interface ReferenceInfo {
  id: string;
  title: string;
  date: string;
}

export interface DiaryDetail {
  id: string;
  author: string;
  title: string;
  title_source: string;
  content: string;
  tags: string[];
  ai_tags?: string[];
  latitude?: number;
  longitude?: number;
  address?: string;
  weather?: string;
  weather_icon?: string;
  temperature?: number;
  references_out: ReferenceInfo[];
  backlinks: ReferenceInfo[];
  comments: CommentResponse[];
  agent_tasks: AgentTaskResponse[];
  is_agent_marked: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiaryListResponse {
  items: DiaryBrief[];
  total: number;
  page: number;
  per_page: number;
}

/* ── Tag ── */

export interface TagSuggestItem {
  tag: string;
  count: number;
}

export interface TagSuggestResponse {
  suggestions: TagSuggestItem[];
}

export interface TagListResponse {
  tags: TagSuggestItem[];
}

export interface TagTreeNode {
  tag: string;
  count: number;
  children: TagTreeNode[];
}

export interface TagTreeResponse {
  tree: TagTreeNode[];
}

/* ── Diary Suggest ── */

export interface DiarySuggestItem {
  id: string;
  title: string;
  date: string;
  preview: string;
}

export interface DiarySuggestResponse {
  suggestions: DiarySuggestItem[];
}

/* ── Comment ── */

export interface CommentResponse {
  id: string;
  entry_id: string;
  author_id: string;
  author_role: "user" | "agent";
  content: string;
  metadata_?: Record<string, unknown>;
  created_at: string;
}

/* ── Agent Task ── */

export interface AgentTaskResponse {
  id: string;
  entry_id: string;
  command: string;
  status: "pending" | "running" | "done" | "failed";
  result?: string;
  error?: string;
  created_at: string;
  completed_at?: string;
}

/* ── User / Auth ── */

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  display_name?: string;
  role: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

/* ── Media ── */

export interface MediaUploadResponse {
  id: string;
  media_type: string;
  original_name: string;
  file_size: number;
  url: string;
  thumb_url?: string;
  media_text_status?: string;
  markdown_embed: string;
}

export interface MediaInfoResponse {
  id: string;
  media_type: string;
  duration_ms?: number;
  width?: number;
  height?: number;
  media_text_status?: string;
  media_text_method?: string;
  media_text?: string;
  media_text_metadata?: Record<string, unknown>;
}
