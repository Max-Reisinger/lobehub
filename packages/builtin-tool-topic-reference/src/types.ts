export const TopicReferenceIdentifier = 'lobe-topic-reference';

export const TopicReferenceApiName = {
  getTopicContext: 'getTopicContext',
  searchMessages: 'searchMessages',
  searchTopics: 'searchTopics',
} as const;

export type TopicReferenceApiNameType =
  (typeof TopicReferenceApiName)[keyof typeof TopicReferenceApiName];

export interface SearchHistoryParams {
  agentId?: string;
  limit?: number;
  query: string;
}

export interface SearchHistoryQuery {
  agentId?: string;
  limitPerType: number;
  query: string;
  type: 'message' | 'topic';
}

export interface SearchHistoryItem {
  agent?: { title: string | null } | null;
  agentId: string | null;
  content?: string;
  description?: string | null;
  groupId: string | null;
  id: string;
  title: string;
  topicId?: string | null;
  type: 'message' | 'topic';
  updatedAt: Date | string;
}
