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
}

export interface ForumThread {
  id: number;
  title: string;
  created_at: string;
  posts: ForumPost[];
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
  // Nickname used last time, to prefill the form
  getMyName: async (): Promise<string | null> =>
    (await api.get<{ display_name: string | null }>('/api/forum/me')).data.display_name,
};

export function forumError(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } }).response?.data?.error || fallback;
}
