import type { InitializeOpenAIOptionsParams, OpenAIOptionsResult } from '~/types';
/**
 * Initializes OpenAI options for agent usage. This function always returns configuration
 * options and never creates a client instance (equivalent to optionsOnly=true behavior).
 *
 * @param params - Configuration parameters
 * @returns Promise resolving to OpenAI configuration options
 * @throws Error if API key is missing or user key has expired
 */
export declare const initializeOpenAI: ({ req, appConfig, overrideModel, endpointOption, overrideEndpoint, getUserKeyValues, checkUserKeyExpiry, }: InitializeOpenAIOptionsParams) => Promise<OpenAIOptionsResult>;
//# sourceMappingURL=initialize.d.ts.map