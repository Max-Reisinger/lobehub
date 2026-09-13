import type { BuiltinToolContext, BuiltinToolResult } from '@lobechat/types';
import { BaseExecutor } from '@lobechat/types';

import type { SearchHistoryParams } from '../types';
import { TopicReferenceApiName, TopicReferenceIdentifier } from '../types';

interface GetTopicContextParams {
  topicId: string;
}

interface TopicReferenceExecutionRuntime {
  getTopicContext: (params: GetTopicContextParams) => Promise<BuiltinToolResult>;
  searchMessages: (params: SearchHistoryParams) => Promise<BuiltinToolResult>;
  searchTopics: (params: SearchHistoryParams) => Promise<BuiltinToolResult>;
}

export class TopicReferenceExecutor extends BaseExecutor<typeof TopicReferenceApiName> {
  readonly identifier = TopicReferenceIdentifier;
  protected readonly apiEnum = TopicReferenceApiName;
  private runtime: TopicReferenceExecutionRuntime;

  constructor(runtime: TopicReferenceExecutionRuntime) {
    super();
    this.runtime = runtime;
  }

  getTopicContext = async (
    params: GetTopicContextParams,
    _ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => {
    return this.runtime.getTopicContext(params);
  };

  searchMessages = async (
    params: SearchHistoryParams,
    _ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => this.runtime.searchMessages(params);

  searchTopics = async (
    params: SearchHistoryParams,
    _ctx: BuiltinToolContext,
  ): Promise<BuiltinToolResult> => this.runtime.searchTopics(params);
}
