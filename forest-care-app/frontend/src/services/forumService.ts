import api from './api';

// Forum ("Foorumi"): authors are nicknames only, the API never returns emails

export interface ForumThreadSummary {
  id: number;
  title: string;
  author_name: string;
  preview: string;
  reply_count: number;
  created_at: string;
  last_post_at: string;
  is_own: boolean;
}

export interface ForumPost {
  id: number;
  author_name: string;
  body: string;
  created_at: string;
  is_own: boolean;
  is_hidden: boolean;
  is_deleted: boolean;
  has_reported: boolean;
}

export interface ForumThread {
  id: number;
  title: string;
  created_at: string;
  posts: ForumPost[];
}

export type ForumReportReason =
  | 'abusive_language'
  | 'harassment'
  | 'spam'
  | 'personal_information'
  | 'other';

export interface ForumMe {
  display_name: string | null;
  role: 'user' | 'admin';
  forum_banned: boolean;
}

export interface ForumModerationReport {
  post_id: number;
  thread_id: number;
  thread_title: string;
  author_user_id: number | null;
  author_name: string;
  body: string;
  created_at: string;
  author_banned: boolean;
  report_count: number;
  reports: Array<{
    reason: ForumReportReason;
    note: string | null;
    created_at: string;
  }>;
}

export const forumService = {
  getThreads: async (): Promise<ForumThreadSummary[]> => (await api.get<ForumThreadSummary[]>('/api/forum/threads')).data,
  getThread: async (id: number): Promise<ForumThread> => (await api.get<ForumThread>(`/api/forum/threads/${id}`)).data,
  createThread: async (data: { title: string; body: string; author_name: string }): Promise<number> =>
    (await api.post<{ id: number }>('/api/forum/threads', data)).data.id,
  reply: async (threadId: number, data: { body: string; author_name: string }): Promise<ForumPost> =>
    (await api.post<ForumPost>(`/api/forum/threads/${threadId}/posts`, data)).data,
  deletePost: async (postId: number): Promise<{ thread_deleted: boolean }> =>
    (await api.delete<{ thread_deleted: boolean }>(`/api/forum/posts/${postId}`)).data,
  reportPost: async (postId: number, data: { reason: ForumReportReason; note: string }): Promise<void> => {
    await api.post(`/api/forum/posts/${postId}/reports`, data);
  },
  getMe: async (): Promise<ForumMe> => (await api.get<ForumMe>('/api/forum/me')).data,
  getModerationReports: async (): Promise<ForumModerationReport[]> =>
    (await api.get<ForumModerationReport[]>('/api/forum/admin/reports')).data,
  resolveReports: async (postId: number): Promise<void> => {
    await api.post(`/api/forum/admin/reports/${postId}/resolve`);
  },
  removePostAsAdmin: async (postId: number): Promise<void> => {
    await api.delete(`/api/forum/admin/posts/${postId}`);
  },
  removeThreadAsAdmin: async (threadId: number): Promise<void> => {
    await api.delete(`/api/forum/admin/threads/${threadId}`);
  },
  setForumBan: async (userId: number, banned: boolean): Promise<boolean> =>
    (await api.put<{ banned: boolean }>(`/api/forum/admin/users/${userId}/forum-ban`, { banned })).data.banned,
};

export function forumError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } }).response?.data?.error || fallback;
}
