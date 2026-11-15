export type Course = string;

export interface CourseRecord {
  id: string;
  title: string;
  description: string;
  active: boolean;
  completion_threshold: number;
  topic_count: number;
  stage_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminCourseRecord extends CourseRecord {
  dify_api_base_url: string;
  dify_api_key_configured: boolean;
}

export interface FreeQaDifySettings {
  api_base_url: string;
  api_key_configured: boolean;
  updated_at: string;
}

export interface DifyCallLogSummary {
  id: string;
  credential_id: string | null;
  student_id: string | null;
  student_name: string | null;
  course_id: string | null;
  course_title: string | null;
  topic_id: string | null;
  topic_title: string | null;
  business_type: "free_qa" | "topic_teaching" | "topic_clarification" | "topic_practice" | "topic_answer" | "diagnosis";
  is_anonymous: boolean;
  started_at: string;
  duration_ms: number | null;
  status: "in_progress" | "succeeded" | "failed" | "timeout" | "cancelled";
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  total_price: string | null;
  currency: string | null;
  cny_conversion: {
    amount: string;
    rate: string;
    rate_date: string | null;
    source: "Frankfurter" | "original";
  } | null;
}

export interface DifyCallLogList {
  items: DifyCallLogSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface DifyCallLogFilters {
  credential_id?: string;
  student?: string;
  course?: string;
  topic?: string;
  student_type?: string;
  business_type?: string;
  status?: string;
  started_from?: string;
  started_before?: string;
}

export interface DifyCallLogFilterOptions {
  credentials: { id: string; course_titles: string[]; free_qa: boolean }[];
}

export interface DifyCallLogDetail extends DifyCallLogSummary {
  request_id: string;
  finished_at: string | null;
  http_status: number | null;
  error_code: "unexpected_error" | "upstream_error" | "http_error" | "transport_error" | "invalid_response" | "incomplete_response" | "timeout" | "cancelled" | null;
  error_summary: string | null;
  conversation_id: string | null;
  message_id: string | null;
  task_id: string | null;
  workflow_run_id: string | null;
}

export interface CourseInput {
  title: string;
  description: string;
  active: boolean;
  completion_threshold: number;
  dify_api_base_url: string;
  dify_api_key?: string;
}

export interface CourseList {
  items: AdminCourseRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface CourseDetail extends AdminCourseRecord {
  topics: {
    id: string;
    title: string;
    stage: number;
    stage_title: string;
  }[];
}

export interface Source {
  source_course?: Course | null;
  topic_id?: string | null;
  source_id: string;
  document_id: string;
  source_file: string;
  title?: string | null;
  chapter?: string | null;
  section?: string | null;
  page?: number | null;
  chunk_index: number;
  snippet: string;
  distance?: number | null;
}

export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface ChatMessage extends ChatHistoryItem {
  id: string;
  createdAt: string;
  sources?: Source[];
}

export interface ChatRequest {
  course?: Course;
  message: string;
  history: ChatHistoryItem[];
  topic_id?: string;
  conversation_token?: string;
  learning_mode?:
    | "free_qa"
    | "topic_teaching"
    | "topic_clarification"
    | "topic_practice"
    | "topic_answer";
}

export interface TopicEvaluation {
  score: number | null;
  threshold: number;
  status: "learning" | "mastered" | null;
  recorded: boolean;
}

export interface ChatResponse {
  answer: string;
  course: Course | null;
  sources: Source[];
  retrieval_count: number;
  conversation_token?: string | null;
  evaluation?: TopicEvaluation | null;
}

export interface Conversation {
  id: string;
  conversationToken?: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface StoredChatState {
  activeConversationId: string;
  conversations: Conversation[];
}

export const TOPIC_STATUSES = [
  "not_started",
  "learning",
  "mastered",
] as const;

export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export type NextAction =
  | "start_learning"
  | "continue_learning"
  | "course_completed";

export interface AuthenticatedStudent {
  student_id: string;
  username: string;
  display_name: string;
  access_token: string;
  created_at: string;
}

export interface Administrator {
  admin_id: string;
  username: string;
  display_name: string;
  role: "admin";
  created_at: string;
  last_active_at: string;
}

export interface AuthenticatedAdmin extends Administrator {
  access_token: string;
}

export interface CurriculumTopicSummary {
  id: string;
  title: string;
  order_index?: number;
  description?: string;
  status: TopicStatus;
  mastery: number | null;
  mastery_display?: string | null;
  evidence_count?: number;
  attempt_count?: number;
  latest_score?: number | null;
}

export interface CurriculumTopic extends CurriculumTopicSummary {
  course: Course;
  stage: number;
  stage_title: string;
  learning_objectives: string[];
  created_at?: string;
  updated_at?: string;
}

export interface CurriculumStage {
  stage: number;
  title: string;
  topics: CurriculumTopicSummary[];
}

export interface CurriculumResponse {
  course: Course;
  stages: CurriculumStage[];
}

export interface DashboardTopic {
  id: string;
  title: string;
  stage: number;
  stage_title: string;
  order_index: number;
  status: TopicStatus;
  mastery: number | null;
}

export interface DashboardStage {
  stage: number;
  title: string;
  topics: DashboardTopic[];
}

export interface LearningDashboard {
  course: Course;
  total_topics: number;
  mastered_count: number;
  learning_count: number;
  not_started_count: number;
  current_topic: DashboardTopic | null;
  recommended_topic_id: string | null;
  next_action: NextAction;
  reasons: string[];
  stages: DashboardStage[];
}

export interface OutlineTopic {
  id: string;
  topic_id: string;
  title: string;
  description: string;
  learning_objectives: string[];
  order_index: number;
  status: TopicStatus;
  mastery: number | null;
}

export interface OutlineGroup {
  id: string;
  title: string;
  parent_group_id: string | null;
  order_index: number;
  topics: OutlineTopic[];
}

export interface CourseOutline {
  course: Course;
  title: string;
  groups: OutlineGroup[];
  recommended_topic_id: string | null;
}
