import { request } from "@/lib/api";

export interface TopicValues {
  title: string;
  description: string;
  chapter_id: string;
  learning_objectives: string[];
  related_topic_ids?: string[];
}
export interface TopicBatchValues {
  chapter_id: string;
  titles: string[];
}
export interface RelatedTopic {
  id: string;
  title: string;
  course: string;
  course_title: string;
  course_active: boolean;
  chapter_id: string;
  chapter_title: string;
}
export interface RelatedTopicCandidates {
  items: RelatedTopic[];
  courses: { id: string; title: string; active: boolean }[];
  total: number;
  page: number;
  page_size: number;
}
export interface ManagedTopic extends TopicValues {
  id: string;
  course: string;
  stage: number;
  stage_title: string;
  related_topic_ids: string[];
  related_topics: RelatedTopic[];
}
export function getRelatedTopicCandidates(
  token: string,
  filters: { q: string; course: string; exclude?: string; page: number },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    q: filters.q,
    page: String(filters.page),
    page_size: "30",
  });
  if (filters.course) params.set("course_id", filters.course);
  if (filters.exclude) params.set("exclude_topic_id", filters.exclude);
  return request<RelatedTopicCandidates>(
    `/api/v1/admin/related-topics?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
}
export interface TopicGroup {
  id: string;
  title: string;
  sort_order: number;
  topics: ManagedTopic[];
}
export interface ManagedOutline {
  course: { id: string; title: string; active: boolean };
  groups: TopicGroup[];
}
export function manageTopics(
  token: string,
  course: string,
  method = "GET",
  suffix = "",
  body?: unknown,
  signal?: AbortSignal,
) {
  return request<ManagedOutline>(
    `/api/v1/admin/courses/${encodeURIComponent(course)}/topics${suffix}`,
    {
      method,
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
}
