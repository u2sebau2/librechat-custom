import type { MCPConnection } from '~/mcp/connection';
import type * as t from '~/mcp/types';
/**
 * Manages MCP server configurations and metadata discovery.
 * Fetches server capabilities, OAuth requirements, and tool definitions for registry.
 * Determines which servers are for app-level connections.
 * Has its own connections repository. All connections are disconnected after initialization.
 */
export declare class MCPServersRegistry {
    private initialized;
    private connections;
    readonly rawConfigs: t.MCPServers;
    readonly parsedConfigs: Record<string, t.ParsedServerConfig>;
    oauthServers: Set<string> | null;
    serverInstructions: Record<string, string> | null;
    toolFunctions: t.LCAvailableTools | null;
    appServerConfigs: t.MCPServers | null;
    constructor(configs: t.MCPServers);
    /** Initializes all startup-enabled servers by gathering their metadata asynchronously */
    initialize(): Promise<void>;
    /** Fetches all metadata for a single server in parallel */
    private gatherServerInfo;
    /** Sets app-level server configs (startup enabled, non-OAuth servers) */
    private setAppServerConfigs;
    /** Creates set of server names that require OAuth authentication */
    private setOAuthServers;
    /** Collects server instructions from all configured servers */
    private setServerInstructions;
    /** Builds registry of all available tool functions from loaded connections */
    private setAppToolFunctions;
    /** Converts server tools to LibreChat-compatible tool functions format */
    getToolFunctions(serverName: string, conn: MCPConnection): Promise<t.LCAvailableTools>;
    /** Determines if server requires OAuth if not already specified in the config */
    private fetchOAuthRequirement;
    /** Retrieves server instructions from MCP server if enabled in the config */
    private fetchServerInstructions;
    /** Fetches server capabilities and available tools list */
    private fetchServerCapabilities;
    private logUpdatedConfig;
    private prefix;
}
//# sourceMappingURL=MCPServersRegistry.d.ts.map