import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { TokenMethods } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { TUser } from 'librechat-data-provider';
import type { MCPOAuthTokens } from '~/mcp/oauth';
import type { RequestBody } from '~/types';
import type * as t from './types';
import { UserConnectionManager } from '~/mcp/UserConnectionManager';
import { MCPConnection } from './connection';
/**
 * Centralized manager for MCP server connections and tool execution.
 * Extends UserConnectionManager to handle both app-level and user-specific connections.
 */
export declare class MCPManager extends UserConnectionManager {
    private static instance;
    private appConnections;
    /** Creates and initializes the singleton MCPManager instance */
    static createInstance(configs: t.MCPServers): Promise<MCPManager>;
    /** Returns the singleton MCPManager instance */
    static getInstance(): MCPManager;
    /** Initializes the MCPManager by setting up server registry and app connections */
    initialize(): Promise<void>;
    /** Returns all app-level connections */
    getAllConnections(): Promise<Map<string, MCPConnection> | null>;
    /** Get servers that require OAuth */
    getOAuthServers(): Set<string> | null;
    /** Get all servers */
    getAllServers(): t.MCPServers | null;
    /** Returns all available tool functions from app-level connections */
    getAppToolFunctions(): t.LCAvailableTools | null;
    /** Returns all available tool functions from all connections available to user */
    getAllToolFunctions(userId: string): Promise<t.LCAvailableTools | null>;
    /**
     * Get instructions for MCP servers
     * @param serverNames Optional array of server names. If not provided or empty, returns all servers.
     * @returns Object mapping server names to their instructions
     */
    getInstructions(serverNames?: string[]): Record<string, string>;
    /**
     * Format MCP server instructions for injection into context
     * @param serverNames Optional array of server names to include. If not provided, includes all servers.
     * @returns Formatted instructions string ready for context injection
     */
    formatInstructionsForContext(serverNames?: string[]): string;
    private loadAppManifestTools;
    private loadUserManifestTools;
    loadAllManifestTools(userId: string): Promise<t.LCManifestTool[]>;
    /** Loads tools from all app-level connections into the manifest. */
    private loadManifestTools;
    /**
     * Calls a tool on an MCP server, using either a user-specific connection
     * (if userId is provided) or an app-level connection. Updates the last activity timestamp
     * for user-specific connections upon successful call initiation.
     */
    callTool({ user, serverName, toolName, provider, toolArguments, options, tokenMethods, requestBody, flowManager, oauthStart, oauthEnd, customUserVars, }: {
        user?: TUser;
        serverName: string;
        toolName: string;
        provider: t.Provider;
        toolArguments?: Record<string, unknown>;
        options?: RequestOptions;
        requestBody?: RequestBody;
        tokenMethods?: TokenMethods;
        customUserVars?: Record<string, string>;
        flowManager: FlowStateManager<MCPOAuthTokens | null>;
        oauthStart?: (authURL: string) => Promise<void>;
        oauthEnd?: () => Promise<void>;
    }): Promise<t.FormattedToolResponse>;
}
//# sourceMappingURL=MCPManager.d.ts.map