import z from 'zod';
import { EModelEndpoint } from 'librechat-data-provider';
/** Configuration object mapping model keys to their respective prompt, completion rates, and context limit
 *
 * Note: the [key: string]: unknown is not in the original JSDoc typedef in /api/typedefs.js, but I've included it since
 * getModelMaxOutputTokens calls getModelTokenValue with a key of 'output', which was not in the original JSDoc typedef,
 * but would be referenced in a TokenConfig in the if(matchedPattern) portion of getModelTokenValue.
 * So in order to preserve functionality for that case and any others which might reference an additional key I'm unaware of,
 * I've included it here until the interface can be typed more tightly.
 */
export interface TokenConfig {
    prompt: number;
    completion: number;
    context: number;
    [key: string]: unknown;
}
/** An endpoint's config object mapping model keys to their respective prompt, completion rates, and context limit */
export type EndpointTokenConfig = Record<string, TokenConfig>;
export declare const maxTokensMap: {
    azureOpenAI: {
        'o4-mini': number;
        'o3-mini': number;
        o3: number;
        o1: number;
        'o1-mini': number;
        'o1-preview': number;
        'gpt-4': number;
        'gpt-4-0613': number;
        'gpt-4-32k': number;
        'gpt-4-32k-0314': number;
        'gpt-4-32k-0613': number;
        'gpt-4-1106': number;
        'gpt-4-0125': number;
        'gpt-4.5': number;
        'gpt-4.1': number;
        'gpt-4.1-mini': number;
        'gpt-4.1-nano': number;
        'gpt-5': number;
        'gpt-5-mini': number;
        'gpt-5-nano': number;
        'gpt-4o': number;
        'gpt-4o-mini': number;
        'gpt-4o-2024-05-13': number;
        'gpt-4o-2024-08-06': number;
        'gpt-4-turbo': number;
        'gpt-4-vision': number;
        'gpt-3.5-turbo': number;
        'gpt-3.5-turbo-0613': number;
        'gpt-3.5-turbo-0301': number;
        'gpt-3.5-turbo-16k': number;
        'gpt-3.5-turbo-16k-0613': number;
        'gpt-3.5-turbo-1106': number;
        'gpt-3.5-turbo-0125': number;
    };
    openAI: {
        kimi: number;
        'gpt-oss-20b': number;
        'gpt-oss-120b': number;
        grok: number;
        'grok-beta': number;
        'grok-vision-beta': number;
        'grok-2': number;
        'grok-2-latest': number;
        'grok-2-1212': number;
        'grok-2-vision': number;
        'grok-2-vision-latest': number;
        'grok-2-vision-1212': number;
        'grok-3': number;
        'grok-3-fast': number;
        'grok-3-mini': number;
        'grok-3-mini-fast': number;
        'grok-4': number;
        'amazon.titan-text-lite-v1': number;
        'amazon.titan-text-express-v1': number;
        'amazon.titan-text-premier-v1:0': number;
        'amazon.nova-micro-v1:0': number;
        'amazon.nova-lite-v1:0': number;
        'amazon.nova-pro-v1:0': number;
        'amazon.nova-premier-v1:0': number;
        'amazon.nova-canvas-v1:0': number;
        'ai21.j2-mid-v1': number;
        'ai21.j2-ultra-v1': number;
        'ai21.jamba-instruct-v1:0': number;
        llama3: number;
        llama2: number;
        'llama-3': number;
        'llama-2': number;
        'llama3.1': number;
        'llama3.2': number;
        'llama3.3': number;
        'llama3-1': number;
        'llama3-2': number;
        'llama3-3': number;
        'llama-3.1': number;
        'llama-3.2': number;
        'llama-3.3': number;
        'llama3.1:405b': number;
        'llama3.1:70b': number;
        'llama3.1:8b': number;
        'llama3.2:1b': number;
        'llama3.2:3b': number;
        'llama3.2:11b': number;
        'llama3.2:90b': number;
        'llama3.3:70b': number;
        'llama3-1-405b': number;
        'llama3-1-70b': number;
        'llama3-1-8b': number;
        'llama3-2-1b': number;
        'llama3-2-3b': number;
        'llama3-2-11b': number;
        'llama3-2-90b': number;
        'llama3-3-70b': number;
        'llama-3.1-405b': number;
        'llama-3.1-70b': number;
        'llama-3.1-8b': number;
        'llama-3.2-1b': number;
        'llama-3.2-3b': number;
        'llama-3.2-11b': number;
        'llama-3.2-90b': number;
        'llama-3.3-70b': number;
        'llama3-70b': number;
        'llama3-8b': number;
        'llama2-70b': number;
        'llama2-13b': number;
        'llama3:70b': number;
        'llama3:8b': number;
        'llama2:70b': number;
        'deepseek-reasoner': number;
        deepseek: number;
        'deepseek.r1': number;
        'qwen2.5': number;
        'command-light': number;
        'command-light-nightly': number;
        command: number;
        'command-nightly': number;
        'command-r': number;
        'command-r-plus': number;
        'mistral-': number;
        'mistral-7b': number;
        'mistral-small': number;
        'mixtral-8x7b': number;
        'mistral-large': number;
        'mistral-large-2402': number;
        'mistral-large-2407': number;
        'pixtral-large': number;
        'mistral-saba': number;
        codestral: number;
        'ministral-8b': number;
        'ministral-3b': number;
        'claude-': number;
        'claude-instant': number;
        'claude-2': number;
        'claude-2.1': number;
        'claude-3': number;
        'claude-3-haiku': number;
        'claude-3-sonnet': number;
        'claude-3-opus': number;
        'claude-3.5-haiku': number;
        'claude-3-5-haiku': number;
        'claude-3-5-sonnet': number;
        'claude-3.5-sonnet': number;
        'claude-3-7-sonnet': number;
        'claude-3.7-sonnet': number;
        'claude-3-5-sonnet-latest': number;
        'claude-3.5-sonnet-latest': number;
        'claude-sonnet-4': number;
        'claude-opus-4': number;
        'claude-4': number;
        gemma: number;
        'gemma-2': number;
        'gemma-3': number;
        'gemma-3-27b': number;
        gemini: number;
        'gemini-pro-vision': number;
        'gemini-exp': number;
        'gemini-2.5': number;
        'gemini-2.5-pro': number;
        'gemini-2.5-flash': number;
        'gemini-2.0': number;
        'gemini-2.0-flash': number;
        'gemini-2.0-flash-lite': number;
        'gemini-1.5': number;
        'gemini-1.5-flash': number;
        'gemini-1.5-flash-8b': number;
        'text-bison-32k': number;
        'chat-bison-32k': number;
        'code-bison-32k': number;
        'codechat-bison-32k': number;
        'code-': number;
        'codechat-': number;
        'text-': number;
        'chat-': number;
        'o4-mini': number;
        'o3-mini': number;
        o3: number;
        o1: number;
        'o1-mini': number;
        'o1-preview': number;
        'gpt-4': number;
        'gpt-4-0613': number;
        'gpt-4-32k': number;
        'gpt-4-32k-0314': number;
        'gpt-4-32k-0613': number;
        'gpt-4-1106': number;
        'gpt-4-0125': number;
        'gpt-4.5': number;
        'gpt-4.1': number;
        'gpt-4.1-mini': number;
        'gpt-4.1-nano': number;
        'gpt-5': number;
        'gpt-5-mini': number;
        'gpt-5-nano': number;
        'gpt-4o': number;
        'gpt-4o-mini': number;
        'gpt-4o-2024-05-13': number;
        'gpt-4o-2024-08-06': number;
        'gpt-4-turbo': number;
        'gpt-4-vision': number;
        'gpt-3.5-turbo': number;
        'gpt-3.5-turbo-0613': number;
        'gpt-3.5-turbo-0301': number;
        'gpt-3.5-turbo-16k': number;
        'gpt-3.5-turbo-16k-0613': number;
        'gpt-3.5-turbo-1106': number;
        'gpt-3.5-turbo-0125': number;
    };
    agents: {
        kimi: number;
        'gpt-oss-20b': number;
        'gpt-oss-120b': number;
        grok: number;
        'grok-beta': number;
        'grok-vision-beta': number;
        'grok-2': number;
        'grok-2-latest': number;
        'grok-2-1212': number;
        'grok-2-vision': number;
        'grok-2-vision-latest': number;
        'grok-2-vision-1212': number;
        'grok-3': number;
        'grok-3-fast': number;
        'grok-3-mini': number;
        'grok-3-mini-fast': number;
        'grok-4': number;
        'amazon.titan-text-lite-v1': number;
        'amazon.titan-text-express-v1': number;
        'amazon.titan-text-premier-v1:0': number;
        'amazon.nova-micro-v1:0': number;
        'amazon.nova-lite-v1:0': number;
        'amazon.nova-pro-v1:0': number;
        'amazon.nova-premier-v1:0': number;
        'amazon.nova-canvas-v1:0': number;
        'ai21.j2-mid-v1': number;
        'ai21.j2-ultra-v1': number;
        'ai21.jamba-instruct-v1:0': number;
        llama3: number;
        llama2: number;
        'llama-3': number;
        'llama-2': number;
        'llama3.1': number;
        'llama3.2': number;
        'llama3.3': number;
        'llama3-1': number;
        'llama3-2': number;
        'llama3-3': number;
        'llama-3.1': number;
        'llama-3.2': number;
        'llama-3.3': number;
        'llama3.1:405b': number;
        'llama3.1:70b': number;
        'llama3.1:8b': number;
        'llama3.2:1b': number;
        'llama3.2:3b': number;
        'llama3.2:11b': number;
        'llama3.2:90b': number;
        'llama3.3:70b': number;
        'llama3-1-405b': number;
        'llama3-1-70b': number;
        'llama3-1-8b': number;
        'llama3-2-1b': number;
        'llama3-2-3b': number;
        'llama3-2-11b': number;
        'llama3-2-90b': number;
        'llama3-3-70b': number;
        'llama-3.1-405b': number;
        'llama-3.1-70b': number;
        'llama-3.1-8b': number;
        'llama-3.2-1b': number;
        'llama-3.2-3b': number;
        'llama-3.2-11b': number;
        'llama-3.2-90b': number;
        'llama-3.3-70b': number;
        'llama3-70b': number;
        'llama3-8b': number;
        'llama2-70b': number;
        'llama2-13b': number;
        'llama3:70b': number;
        'llama3:8b': number;
        'llama2:70b': number;
        'deepseek-reasoner': number;
        deepseek: number;
        'deepseek.r1': number;
        'qwen2.5': number;
        'command-light': number;
        'command-light-nightly': number;
        command: number;
        'command-nightly': number;
        'command-r': number;
        'command-r-plus': number;
        'mistral-': number;
        'mistral-7b': number;
        'mistral-small': number;
        'mixtral-8x7b': number;
        'mistral-large': number;
        'mistral-large-2402': number;
        'mistral-large-2407': number;
        'pixtral-large': number;
        'mistral-saba': number;
        codestral: number;
        'ministral-8b': number;
        'ministral-3b': number;
        'claude-': number;
        'claude-instant': number;
        'claude-2': number;
        'claude-2.1': number;
        'claude-3': number;
        'claude-3-haiku': number;
        'claude-3-sonnet': number;
        'claude-3-opus': number;
        'claude-3.5-haiku': number;
        'claude-3-5-haiku': number;
        'claude-3-5-sonnet': number;
        'claude-3.5-sonnet': number;
        'claude-3-7-sonnet': number;
        'claude-3.7-sonnet': number;
        'claude-3-5-sonnet-latest': number;
        'claude-3.5-sonnet-latest': number;
        'claude-sonnet-4': number;
        'claude-opus-4': number;
        'claude-4': number;
        gemma: number;
        'gemma-2': number;
        'gemma-3': number;
        'gemma-3-27b': number;
        gemini: number;
        'gemini-pro-vision': number;
        'gemini-exp': number;
        'gemini-2.5': number;
        'gemini-2.5-pro': number;
        'gemini-2.5-flash': number;
        'gemini-2.0': number;
        'gemini-2.0-flash': number;
        'gemini-2.0-flash-lite': number;
        'gemini-1.5': number;
        'gemini-1.5-flash': number;
        'gemini-1.5-flash-8b': number;
        'text-bison-32k': number;
        'chat-bison-32k': number;
        'code-bison-32k': number;
        'codechat-bison-32k': number;
        'code-': number;
        'codechat-': number;
        'text-': number;
        'chat-': number;
        'o4-mini': number;
        'o3-mini': number;
        o3: number;
        o1: number;
        'o1-mini': number;
        'o1-preview': number;
        'gpt-4': number;
        'gpt-4-0613': number;
        'gpt-4-32k': number;
        'gpt-4-32k-0314': number;
        'gpt-4-32k-0613': number;
        'gpt-4-1106': number;
        'gpt-4-0125': number;
        'gpt-4.5': number;
        'gpt-4.1': number;
        'gpt-4.1-mini': number;
        'gpt-4.1-nano': number;
        'gpt-5': number;
        'gpt-5-mini': number;
        'gpt-5-nano': number;
        'gpt-4o': number;
        'gpt-4o-mini': number;
        'gpt-4o-2024-05-13': number;
        'gpt-4o-2024-08-06': number;
        'gpt-4-turbo': number;
        'gpt-4-vision': number;
        'gpt-3.5-turbo': number;
        'gpt-3.5-turbo-0613': number;
        'gpt-3.5-turbo-0301': number;
        'gpt-3.5-turbo-16k': number;
        'gpt-3.5-turbo-16k-0613': number;
        'gpt-3.5-turbo-1106': number;
        'gpt-3.5-turbo-0125': number;
    };
    custom: {
        kimi: number;
        'gpt-oss-20b': number;
        'gpt-oss-120b': number;
        grok: number;
        'grok-beta': number;
        'grok-vision-beta': number;
        'grok-2': number;
        'grok-2-latest': number;
        'grok-2-1212': number;
        'grok-2-vision': number;
        'grok-2-vision-latest': number;
        'grok-2-vision-1212': number;
        'grok-3': number;
        'grok-3-fast': number;
        'grok-3-mini': number;
        'grok-3-mini-fast': number;
        'grok-4': number;
        'amazon.titan-text-lite-v1': number;
        'amazon.titan-text-express-v1': number;
        'amazon.titan-text-premier-v1:0': number;
        'amazon.nova-micro-v1:0': number;
        'amazon.nova-lite-v1:0': number;
        'amazon.nova-pro-v1:0': number;
        'amazon.nova-premier-v1:0': number;
        'amazon.nova-canvas-v1:0': number;
        'ai21.j2-mid-v1': number;
        'ai21.j2-ultra-v1': number;
        'ai21.jamba-instruct-v1:0': number;
        llama3: number;
        llama2: number;
        'llama-3': number;
        'llama-2': number;
        'llama3.1': number;
        'llama3.2': number;
        'llama3.3': number;
        'llama3-1': number;
        'llama3-2': number;
        'llama3-3': number;
        'llama-3.1': number;
        'llama-3.2': number;
        'llama-3.3': number;
        'llama3.1:405b': number;
        'llama3.1:70b': number;
        'llama3.1:8b': number;
        'llama3.2:1b': number;
        'llama3.2:3b': number;
        'llama3.2:11b': number;
        'llama3.2:90b': number;
        'llama3.3:70b': number;
        'llama3-1-405b': number;
        'llama3-1-70b': number;
        'llama3-1-8b': number;
        'llama3-2-1b': number;
        'llama3-2-3b': number;
        'llama3-2-11b': number;
        'llama3-2-90b': number;
        'llama3-3-70b': number;
        'llama-3.1-405b': number;
        'llama-3.1-70b': number;
        'llama-3.1-8b': number;
        'llama-3.2-1b': number;
        'llama-3.2-3b': number;
        'llama-3.2-11b': number;
        'llama-3.2-90b': number;
        'llama-3.3-70b': number;
        'llama3-70b': number;
        'llama3-8b': number;
        'llama2-70b': number;
        'llama2-13b': number;
        'llama3:70b': number;
        'llama3:8b': number;
        'llama2:70b': number;
        'deepseek-reasoner': number;
        deepseek: number;
        'deepseek.r1': number;
        'qwen2.5': number;
        'command-light': number;
        'command-light-nightly': number;
        command: number;
        'command-nightly': number;
        'command-r': number;
        'command-r-plus': number;
        'mistral-': number;
        'mistral-7b': number;
        'mistral-small': number;
        'mixtral-8x7b': number;
        'mistral-large': number;
        'mistral-large-2402': number;
        'mistral-large-2407': number;
        'pixtral-large': number;
        'mistral-saba': number;
        codestral: number;
        'ministral-8b': number;
        'ministral-3b': number;
        'claude-': number;
        'claude-instant': number;
        'claude-2': number;
        'claude-2.1': number;
        'claude-3': number;
        'claude-3-haiku': number;
        'claude-3-sonnet': number;
        'claude-3-opus': number;
        'claude-3.5-haiku': number;
        'claude-3-5-haiku': number;
        'claude-3-5-sonnet': number;
        'claude-3.5-sonnet': number;
        'claude-3-7-sonnet': number;
        'claude-3.7-sonnet': number;
        'claude-3-5-sonnet-latest': number;
        'claude-3.5-sonnet-latest': number;
        'claude-sonnet-4': number;
        'claude-opus-4': number;
        'claude-4': number;
        gemma: number;
        'gemma-2': number;
        'gemma-3': number;
        'gemma-3-27b': number;
        gemini: number;
        'gemini-pro-vision': number;
        'gemini-exp': number;
        'gemini-2.5': number;
        'gemini-2.5-pro': number;
        'gemini-2.5-flash': number;
        'gemini-2.0': number;
        'gemini-2.0-flash': number;
        'gemini-2.0-flash-lite': number;
        'gemini-1.5': number;
        'gemini-1.5-flash': number;
        'gemini-1.5-flash-8b': number;
        'text-bison-32k': number;
        'chat-bison-32k': number;
        'code-bison-32k': number;
        'codechat-bison-32k': number;
        'code-': number;
        'codechat-': number;
        'text-': number;
        'chat-': number;
        'o4-mini': number;
        'o3-mini': number;
        o3: number;
        o1: number;
        'o1-mini': number;
        'o1-preview': number;
        'gpt-4': number;
        'gpt-4-0613': number;
        'gpt-4-32k': number;
        'gpt-4-32k-0314': number;
        'gpt-4-32k-0613': number;
        'gpt-4-1106': number;
        'gpt-4-0125': number;
        'gpt-4.5': number;
        'gpt-4.1': number;
        'gpt-4.1-mini': number;
        'gpt-4.1-nano': number;
        'gpt-5': number;
        'gpt-5-mini': number;
        'gpt-5-nano': number;
        'gpt-4o': number;
        'gpt-4o-mini': number;
        'gpt-4o-2024-05-13': number;
        'gpt-4o-2024-08-06': number;
        'gpt-4-turbo': number;
        'gpt-4-vision': number;
        'gpt-3.5-turbo': number;
        'gpt-3.5-turbo-0613': number;
        'gpt-3.5-turbo-0301': number;
        'gpt-3.5-turbo-16k': number;
        'gpt-3.5-turbo-16k-0613': number;
        'gpt-3.5-turbo-1106': number;
        'gpt-3.5-turbo-0125': number;
    };
    google: {
        gemma: number;
        'gemma-2': number;
        'gemma-3': number;
        'gemma-3-27b': number;
        gemini: number;
        'gemini-pro-vision': number;
        'gemini-exp': number;
        'gemini-2.5': number;
        'gemini-2.5-pro': number;
        'gemini-2.5-flash': number;
        'gemini-2.0': number;
        'gemini-2.0-flash': number;
        'gemini-2.0-flash-lite': number;
        'gemini-1.5': number;
        'gemini-1.5-flash': number;
        'gemini-1.5-flash-8b': number;
        'text-bison-32k': number;
        'chat-bison-32k': number;
        'code-bison-32k': number;
        'codechat-bison-32k': number;
        'code-': number;
        'codechat-': number;
        'text-': number;
        'chat-': number;
    };
    anthropic: {
        'claude-': number;
        'claude-instant': number;
        'claude-2': number;
        'claude-2.1': number;
        'claude-3': number;
        'claude-3-haiku': number;
        'claude-3-sonnet': number;
        'claude-3-opus': number;
        'claude-3.5-haiku': number;
        'claude-3-5-haiku': number;
        'claude-3-5-sonnet': number;
        'claude-3.5-sonnet': number;
        'claude-3-7-sonnet': number;
        'claude-3.7-sonnet': number;
        'claude-3-5-sonnet-latest': number;
        'claude-3.5-sonnet-latest': number;
        'claude-sonnet-4': number;
        'claude-opus-4': number;
        'claude-4': number;
    };
    bedrock: {
        'amazon.titan-text-lite-v1': number;
        'amazon.titan-text-express-v1': number;
        'amazon.titan-text-premier-v1:0': number;
        'amazon.nova-micro-v1:0': number;
        'amazon.nova-lite-v1:0': number;
        'amazon.nova-pro-v1:0': number;
        'amazon.nova-premier-v1:0': number;
        'amazon.nova-canvas-v1:0': number;
        'ai21.j2-mid-v1': number;
        'ai21.j2-ultra-v1': number;
        'ai21.jamba-instruct-v1:0': number;
        llama3: number;
        llama2: number;
        'llama-3': number;
        'llama-2': number;
        'llama3.1': number;
        'llama3.2': number;
        'llama3.3': number;
        'llama3-1': number;
        'llama3-2': number;
        'llama3-3': number;
        'llama-3.1': number;
        'llama-3.2': number;
        'llama-3.3': number;
        'llama3.1:405b': number;
        'llama3.1:70b': number;
        'llama3.1:8b': number;
        'llama3.2:1b': number;
        'llama3.2:3b': number;
        'llama3.2:11b': number;
        'llama3.2:90b': number;
        'llama3.3:70b': number;
        'llama3-1-405b': number;
        'llama3-1-70b': number;
        'llama3-1-8b': number;
        'llama3-2-1b': number;
        'llama3-2-3b': number;
        'llama3-2-11b': number;
        'llama3-2-90b': number;
        'llama3-3-70b': number;
        'llama-3.1-405b': number;
        'llama-3.1-70b': number;
        'llama-3.1-8b': number;
        'llama-3.2-1b': number;
        'llama-3.2-3b': number;
        'llama-3.2-11b': number;
        'llama-3.2-90b': number;
        'llama-3.3-70b': number;
        'llama3-70b': number;
        'llama3-8b': number;
        'llama2-70b': number;
        'llama2-13b': number;
        'llama3:70b': number;
        'llama3:8b': number;
        'llama2:70b': number;
        'deepseek-reasoner': number;
        deepseek: number;
        'deepseek.r1': number;
        'qwen2.5': number;
        'command-light': number;
        'command-light-nightly': number;
        command: number;
        'command-nightly': number;
        'command-r': number;
        'command-r-plus': number;
        'mistral-': number;
        'mistral-7b': number;
        'mistral-small': number;
        'mixtral-8x7b': number;
        'mistral-large': number;
        'mistral-large-2402': number;
        'mistral-large-2407': number;
        'pixtral-large': number;
        'mistral-saba': number;
        codestral: number;
        'ministral-8b': number;
        'ministral-3b': number;
        'claude-': number;
        'claude-instant': number;
        'claude-2': number;
        'claude-2.1': number;
        'claude-3': number;
        'claude-3-haiku': number;
        'claude-3-sonnet': number;
        'claude-3-opus': number;
        'claude-3.5-haiku': number;
        'claude-3-5-haiku': number;
        'claude-3-5-sonnet': number;
        'claude-3.5-sonnet': number;
        'claude-3-7-sonnet': number;
        'claude-3.7-sonnet': number;
        'claude-3-5-sonnet-latest': number;
        'claude-3.5-sonnet-latest': number;
        'claude-sonnet-4': number;
        'claude-opus-4': number;
        'claude-4': number;
    };
};
export declare const modelMaxOutputs: {
    o1: number;
    'o1-mini': number;
    'o1-preview': number;
    'gpt-5': number;
    'gpt-5-mini': number;
    'gpt-5-nano': number;
    'gpt-oss-20b': number;
    'gpt-oss-120b': number;
    system_default: number;
};
export declare const maxOutputTokensMap: {
    anthropic: {
        'claude-3-haiku': number;
        'claude-3-sonnet': number;
        'claude-3-opus': number;
        'claude-opus-4': number;
        'claude-sonnet-4': number;
        'claude-3.5-sonnet': number;
        'claude-3-5-sonnet': number;
        'claude-3.7-sonnet': number;
        'claude-3-7-sonnet': number;
    };
    azureOpenAI: {
        o1: number;
        'o1-mini': number;
        'o1-preview': number;
        'gpt-5': number;
        'gpt-5-mini': number;
        'gpt-5-nano': number;
        'gpt-oss-20b': number;
        'gpt-oss-120b': number;
        system_default: number;
    };
    openAI: {
        o1: number;
        'o1-mini': number;
        'o1-preview': number;
        'gpt-5': number;
        'gpt-5-mini': number;
        'gpt-5-nano': number;
        'gpt-oss-20b': number;
        'gpt-oss-120b': number;
        system_default: number;
    };
    custom: {
        o1: number;
        'o1-mini': number;
        'o1-preview': number;
        'gpt-5': number;
        'gpt-5-mini': number;
        'gpt-5-nano': number;
        'gpt-oss-20b': number;
        'gpt-oss-120b': number;
        system_default: number;
    };
};
/**
 * Finds the first matching pattern in the tokens map.
 * @param {string} modelName
 * @param {Record<string, number> | EndpointTokenConfig} tokensMap
 * @returns {string|null}
 */
export declare function findMatchingPattern(modelName: string, tokensMap: Record<string, number> | EndpointTokenConfig): string | null;
/**
 * Retrieves a token value for a given model name from a tokens map.
 *
 * @param modelName - The name of the model to look up.
 * @param tokensMap - The map of model names to token values.
 * @param [key='context'] - The key to look up in the tokens map.
 * @returns The token value for the given model or undefined if no match is found.
 */
export declare function getModelTokenValue(modelName: string, tokensMap?: EndpointTokenConfig | Record<string, number>, key?: keyof TokenConfig): number | undefined;
/**
 * Retrieves the maximum tokens for a given model name.
 *
 * @param modelName - The name of the model to look up.
 * @param endpoint - The endpoint (default is 'openAI').
 * @param [endpointTokenConfig] - Token Config for current endpoint to use for max tokens lookup
 * @returns The maximum tokens for the given model or undefined if no match is found.
 */
export declare function getModelMaxTokens(modelName: string, endpoint?: EModelEndpoint, endpointTokenConfig?: EndpointTokenConfig): number | undefined;
/**
 * Retrieves the maximum output tokens for a given model name.
 *
 * @param modelName - The name of the model to look up.
 * @param endpoint - The endpoint (default is 'openAI').
 * @param [endpointTokenConfig] - Token Config for current endpoint to use for max tokens lookup
 * @returns The maximum output tokens for the given model or undefined if no match is found.
 */
export declare function getModelMaxOutputTokens(modelName: string, endpoint?: EModelEndpoint, endpointTokenConfig?: EndpointTokenConfig): number | undefined;
/**
 * Retrieves the model name key for a given model name input. If the exact model name isn't found,
 * it searches for partial matches within the model name, checking keys in reverse order.
 *
 * @param modelName - The name of the model to look up.
 * @param endpoint - The endpoint (default is 'openAI').
 * @returns The model name key for the given model; returns input if no match is found and is string.
 *
 * @example
 * matchModelName('gpt-4-32k-0613'); // Returns 'gpt-4-32k-0613'
 * matchModelName('gpt-4-32k-unknown'); // Returns 'gpt-4-32k'
 * matchModelName('unknown-model'); // Returns undefined
 */
export declare function matchModelName(modelName: string, endpoint?: EModelEndpoint): string | undefined;
export declare const modelSchema: z.ZodObject<{
    id: z.ZodString;
    pricing: z.ZodObject<{
        prompt: z.ZodString;
        completion: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        prompt: string;
        completion: string;
    }, {
        prompt: string;
        completion: string;
    }>;
    context_length: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    pricing: {
        prompt: string;
        completion: string;
    };
    context_length: number;
}, {
    id: string;
    pricing: {
        prompt: string;
        completion: string;
    };
    context_length: number;
}>;
export declare const inputSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        pricing: z.ZodObject<{
            prompt: z.ZodString;
            completion: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            prompt: string;
            completion: string;
        }, {
            prompt: string;
            completion: string;
        }>;
        context_length: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        id: string;
        pricing: {
            prompt: string;
            completion: string;
        };
        context_length: number;
    }, {
        id: string;
        pricing: {
            prompt: string;
            completion: string;
        };
        context_length: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    data: {
        id: string;
        pricing: {
            prompt: string;
            completion: string;
        };
        context_length: number;
    }[];
}, {
    data: {
        id: string;
        pricing: {
            prompt: string;
            completion: string;
        };
        context_length: number;
    }[];
}>;
/**
 * Processes a list of model data from an API and organizes it into structured data based on URL and specifics of rates and context.
 * @param {{ data: Array<z.infer<typeof modelSchema>> }} input The input object containing base URL and data fetched from the API.
 * @returns {EndpointTokenConfig} The processed model data.
 */
export declare function processModelData(input: z.infer<typeof inputSchema>): EndpointTokenConfig;
export declare const tiktokenModels: Set<string>;
//# sourceMappingURL=tokens.d.ts.map