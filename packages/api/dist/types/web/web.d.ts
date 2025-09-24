import type { TCustomConfig, TWebSearchConfig } from 'librechat-data-provider';
import { SearchCategories, AuthType } from 'librechat-data-provider';
export declare function loadWebSearchConfig(config: TCustomConfig['webSearch']): TCustomConfig['webSearch'];
export type TWebSearchKeys = 'serperApiKey' | 'searxngInstanceUrl' | 'searxngApiKey' | 'firecrawlApiKey' | 'firecrawlApiUrl' | 'jinaApiKey' | 'jinaApiUrl' | 'cohereApiKey';
export type TWebSearchCategories = SearchCategories.PROVIDERS | SearchCategories.SCRAPERS | SearchCategories.RERANKERS;
export declare const webSearchAuth: {
    providers: {
        serper: {
            serperApiKey: 1;
        };
        searxng: {
            searxngInstanceUrl: 1;
            /** Optional (0) */
            searxngApiKey: 0;
        };
    };
    scrapers: {
        firecrawl: {
            firecrawlApiKey: 1;
            /** Optional (0) */
            firecrawlApiUrl: 0;
        };
    };
    rerankers: {
        jina: {
            jinaApiKey: 1;
            /** Optional (0) */
            jinaApiUrl: 0;
        };
        cohere: {
            cohereApiKey: 1;
        };
    };
};
/**
 * Extracts all API keys from the webSearchAuth configuration object
 */
export declare function getWebSearchKeys(): TWebSearchKeys[];
export declare const webSearchKeys: TWebSearchKeys[];
export declare function extractWebSearchEnvVars({ keys, config, }: {
    keys: TWebSearchKeys[];
    config: TCustomConfig['webSearch'] | undefined;
}): string[];
/**
 * Type for web search authentication result
 */
export interface WebSearchAuthResult {
    /** Whether all required categories have at least one authenticated service */
    authenticated: boolean;
    /** Authentication type (user_provided or system_defined) by category */
    authTypes: [TWebSearchCategories, AuthType][];
    /** Original authentication values mapped to their respective keys */
    authResult: Partial<TWebSearchConfig>;
}
/**
 * Loads and verifies web search authentication values
 * @param params - Authentication parameters
 * @returns Authentication result
 */
export declare function loadWebSearchAuth({ userId, webSearchConfig, loadAuthValues, throwError, }: {
    userId: string;
    webSearchConfig: TCustomConfig['webSearch'];
    loadAuthValues: (params: {
        userId: string;
        authFields: string[];
        optional?: Set<string>;
        throwError?: boolean;
    }) => Promise<Record<string, string>>;
    throwError?: boolean;
}): Promise<WebSearchAuthResult>;
//# sourceMappingURL=web.d.ts.map