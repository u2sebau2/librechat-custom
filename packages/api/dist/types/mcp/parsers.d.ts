import type * as t from './types';
/**
 * Converts MCPToolCallResponse content into recognized content block types
 * Recognized types: "image", "image_url", "text", "json"
 *
 * @param {t.MCPToolCallResponse} result - The MCPToolCallResponse object
 * @param {string} provider - The provider name (google, anthropic, openai)
 * @returns {Array<Object>} Formatted content blocks
 */
/**
 * Converts MCPToolCallResponse content into recognized content block types
 * First element: string or formatted content (excluding image_url)
 * Second element: image_url content if any
 *
 * @param {t.MCPToolCallResponse} result - The MCPToolCallResponse object
 * @param {string} provider - The provider name (google, anthropic, openai)
 * @returns {t.FormattedContentResult} Tuple of content and image_urls
 */
export declare function formatToolContent(result: t.MCPToolCallResponse, provider: t.Provider): t.FormattedContentResult;
//# sourceMappingURL=parsers.d.ts.map