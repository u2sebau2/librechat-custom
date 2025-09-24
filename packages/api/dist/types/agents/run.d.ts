import { Run, Providers } from '@librechat/agents';
import type { EventHandler, GenericTool, GraphEvents, IState } from '@librechat/agents';
import type { Agent } from 'librechat-data-provider';
import type * as t from '~/types';
export declare function getReasoningKey(provider: Providers, llmConfig: t.RunLLMConfig, agentEndpoint?: string | null): 'reasoning_content' | 'reasoning';
/**
 * Creates a new Run instance with custom handlers and configuration.
 *
 * @param options - The options for creating the Run instance.
 * @param options.agent - The agent for this run.
 * @param options.signal - The signal for this run.
 * @param options.req - The server request.
 * @param options.runId - Optional run ID; otherwise, a new run ID will be generated.
 * @param options.customHandlers - Custom event handlers.
 * @param options.streaming - Whether to use streaming.
 * @param options.streamUsage - Whether to stream usage information.
 * @returns {Promise<Run<IState>>} A promise that resolves to a new Run instance.
 */
export declare function createRun({ runId, agent, signal, customHandlers, streaming, streamUsage, }: {
    agent: Omit<Agent, 'tools'> & {
        tools?: GenericTool[];
    };
    signal: AbortSignal;
    runId?: string;
    streaming?: boolean;
    streamUsage?: boolean;
    customHandlers?: Record<GraphEvents, EventHandler>;
}): Promise<Run<IState>>;
//# sourceMappingURL=run.d.ts.map