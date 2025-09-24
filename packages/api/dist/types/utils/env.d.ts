import type { TUser, MCPOptions } from 'librechat-data-provider';
import type { RequestBody } from '~/types';
/**
 * Recursively processes an object to replace environment variables in string values
 * @param params - Processing parameters
 * @param params.options - The MCP options to process
 * @param params.user - The user object containing all user fields
 * @param params.customUserVars - vars that user set in settings
 * @param params.body - the body of the request that is being processed
 * @returns - The processed object with environment variables replaced
 */
export declare function processMCPEnv(params: {
    options: Readonly<MCPOptions>;
    user?: TUser;
    customUserVars?: Record<string, string>;
    body?: RequestBody;
}): MCPOptions;
/**
 * Resolves header values by replacing user placeholders, body variables, custom variables, and environment variables.
 *
 * @param options - Optional configuration object.
 * @param options.headers - The headers object to process.
 * @param options.user - Optional user object for replacing user field placeholders (can be partial with just id).
 * @param options.body - Optional request body object for replacing body field placeholders.
 * @param options.customUserVars - Optional custom user variables to replace placeholders.
 * @returns The processed headers with all placeholders replaced.
 */
export declare function resolveHeaders(options?: {
    headers: Record<string, string> | undefined;
    user?: Partial<TUser> | {
        id: string;
    };
    body?: RequestBody;
    customUserVars?: Record<string, string>;
}): Record<string, string>;
//# sourceMappingURL=env.d.ts.map