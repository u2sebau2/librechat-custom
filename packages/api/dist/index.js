'use strict';

var librechatDataProvider = require('librechat-data-provider');
var axios$1 = require('axios');
var dataSchemas = require('@librechat/data-schemas');
var agents = require('@librechat/agents');
var path$1 = require('path');
var crypto$1 = require('node:crypto');
var fetch$1 = require('node-fetch');
var fs$1 = require('fs');
var tiktoken = require('tiktoken');
var yaml = require('js-yaml');
var z = require('zod');
var types_js = require('@modelcontextprotocol/sdk/types.js');
var require$$3 = require('crypto');
var auth_js = require('@modelcontextprotocol/sdk/client/auth.js');
var auth_js$1 = require('@modelcontextprotocol/sdk/shared/auth.js');
var require$$2 = require('os');
var jwt = require('jsonwebtoken');
var events = require('events');
var undici = require('undici');
var stdio_js = require('@modelcontextprotocol/sdk/client/stdio.js');
var streamableHttp_js = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
var websocket_js = require('@modelcontextprotocol/sdk/client/websocket.js');
var sse_js = require('@modelcontextprotocol/sdk/client/sse.js');
var index_js = require('@modelcontextprotocol/sdk/client/index.js');
var keyv = require('keyv');
var tools = require('@langchain/core/tools');
var FormData = require('form-data');
var url = require('url');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var path__namespace = /*#__PURE__*/_interopNamespaceDefault(path$1);
var fs__namespace = /*#__PURE__*/_interopNamespaceDefault(fs$1);

/**
 * Logs Axios errors based on the error object and a custom message.
 * @param options - The options object.
 * @param options.message - The custom message to be logged.
 * @param options.error - The Axios error object.
 * @returns The log message.
 */
const logAxiosError = ({ message, error }) => {
    var _a, _b;
    let logMessage = message;
    try {
        const stack = error.stack || 'No stack trace available';
        if ((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) {
            const { status, headers, data } = error.response;
            logMessage = `${message} The server responded with status ${status}: ${error.message}`;
            dataSchemas.logger.error(logMessage, {
                status,
                headers,
                data,
                stack,
            });
        }
        else if (error.request) {
            const { method, url } = error.config || {};
            logMessage = `${message} No response received for ${method ? method.toUpperCase() : ''} ${url || ''}: ${error.message}`;
            dataSchemas.logger.error(logMessage, {
                requestInfo: { method, url },
                stack,
            });
        }
        else if ((_b = error === null || error === void 0 ? void 0 : error.message) === null || _b === void 0 ? void 0 : _b.includes("Cannot read properties of undefined (reading 'status')")) {
            logMessage = `${message} It appears the request timed out or was unsuccessful: ${error.message}`;
            dataSchemas.logger.error(logMessage, { stack });
        }
        else {
            logMessage = `${message} An error occurred while setting up the request: ${error.message}`;
            dataSchemas.logger.error(logMessage, { stack });
        }
    }
    catch (err) {
        logMessage = `Error in logAxiosError: ${err.message}`;
        dataSchemas.logger.error(logMessage, { stack: err.stack || 'No stack trace available' });
    }
    return logMessage;
};
/**
 * Creates and configures an Axios instance with optional proxy settings.

 * @returns A configured Axios instance
 * @throws If there's an issue creating the Axios instance or parsing the proxy URL
 */
function createAxiosInstance() {
    const instance = axios$1.create();
    if (process.env.proxy) {
        try {
            const url = new URL(process.env.proxy);
            const proxyConfig = {
                host: url.hostname.replace(/^\[|\]$/g, ''),
                protocol: url.protocol.replace(':', ''),
            };
            if (url.port) {
                proxyConfig.port = parseInt(url.port, 10);
            }
            instance.defaults.proxy = proxyConfig;
        }
        catch (error) {
            console.error('Error parsing proxy URL:', error);
            throw new Error(`Invalid proxy URL: ${process.env.proxy}`);
        }
    }
    return instance;
}

/**
 * Checks if the given value is truthy by being either the boolean `true` or a string
 * that case-insensitively matches 'true'.
 *
 * @param value - The value to check.
 * @returns Returns `true` if the value is the boolean `true` or a case-insensitive
 *                    match for the string 'true', otherwise returns `false`.
 * @example
 *
 * isEnabled("True");  // returns true
 * isEnabled("TRUE");  // returns true
 * isEnabled(true);    // returns true
 * isEnabled("false"); // returns false
 * isEnabled(false);   // returns false
 * isEnabled(null);    // returns false
 * isEnabled();        // returns false
 */
function isEnabled(value) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        return value.toLowerCase().trim() === 'true';
    }
    return false;
}
/**
 * Checks if the provided value is 'user_provided'.
 *
 * @param value - The value to check.
 * @returns - Returns true if the value is 'user_provided', otherwise false.
 */
const isUserProvided = (value) => value === librechatDataProvider.AuthType.USER_PROVIDED;
/**
 * @param values
 */
function optionalChainWithEmptyCheck(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }
    return values[values.length - 1];
}
/**
 * Normalize the endpoint name to system-expected value.
 * @param name
 */
function normalizeEndpointName(name = '') {
    return name.toLowerCase() === agents.Providers.OLLAMA ? agents.Providers.OLLAMA : name;
}

/**
 * Sanitizes the model name to be used in the URL by removing or replacing disallowed characters.
 * @param modelName - The model name to be sanitized.
 * @returns The sanitized model name.
 */
const sanitizeModelName = (modelName) => {
    // Replace periods with empty strings and other disallowed characters as needed.
    return modelName.replace(/\./g, '');
};
/**
 * Generates the Azure OpenAI API endpoint URL.
 * @param params - The parameters object.
 * @param params.azureOpenAIApiInstanceName - The Azure OpenAI API instance name.
 * @param params.azureOpenAIApiDeploymentName - The Azure OpenAI API deployment name.
 * @returns The complete endpoint URL for the Azure OpenAI API.
 */
const genAzureEndpoint = ({ azureOpenAIApiInstanceName, azureOpenAIApiDeploymentName, }) => {
    return `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${azureOpenAIApiDeploymentName}`;
};
/**
 * Generates the Azure OpenAI API chat completion endpoint URL with the API version.
 * If both deploymentName and modelName are provided, modelName takes precedence.
 * @param azureConfig - The Azure configuration object.
 * @param azureConfig.azureOpenAIApiInstanceName - The Azure OpenAI API instance name.
 * @param azureConfig.azureOpenAIApiDeploymentName - The Azure OpenAI API deployment name (optional).
 * @param azureConfig.azureOpenAIApiVersion - The Azure OpenAI API version.
 * @param modelName - The model name to be included in the deployment name (optional).
 * @param client - The API Client class for optionally setting properties (optional).
 * @returns The complete chat completion endpoint URL for the Azure OpenAI API.
 * @throws Error if neither azureOpenAIApiDeploymentName nor modelName is provided.
 */
const genAzureChatCompletion = ({ azureOpenAIApiInstanceName, azureOpenAIApiDeploymentName, azureOpenAIApiVersion, }, modelName, client) => {
    // Determine the deployment segment of the URL based on provided modelName or azureOpenAIApiDeploymentName
    let deploymentSegment;
    if (isEnabled(process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME) && modelName) {
        const sanitizedModelName = sanitizeModelName(modelName);
        deploymentSegment = sanitizedModelName;
        if (client && typeof client === 'object') {
            client.azure.azureOpenAIApiDeploymentName = sanitizedModelName;
        }
    }
    else if (azureOpenAIApiDeploymentName) {
        deploymentSegment = azureOpenAIApiDeploymentName;
    }
    else if (!process.env.AZURE_OPENAI_BASEURL) {
        throw new Error('Either a model name with the `AZURE_USE_MODEL_AS_DEPLOYMENT_NAME` setting or a deployment name must be provided if `AZURE_OPENAI_BASEURL` is omitted.');
    }
    else {
        deploymentSegment = '';
    }
    return `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${deploymentSegment}/chat/completions?api-version=${azureOpenAIApiVersion}`;
};
/**
 * Retrieves the Azure OpenAI API credentials from environment variables.
 * @returns An object containing the Azure OpenAI API credentials.
 */
const getAzureCredentials = () => {
    var _a;
    return {
        azureOpenAIApiKey: (_a = process.env.AZURE_API_KEY) !== null && _a !== void 0 ? _a : process.env.AZURE_OPENAI_API_KEY,
        azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
        azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
        azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    };
};
/**
 * Constructs a URL by replacing placeholders in the baseURL with values from the azure object.
 * It specifically looks for '${INSTANCE_NAME}' and '${DEPLOYMENT_NAME}' within the baseURL and replaces
 * them with 'azureOpenAIApiInstanceName' and 'azureOpenAIApiDeploymentName' from the azure object.
 * If the respective azure property is not provided, the placeholder is replaced with an empty string.
 *
 * @param params - The parameters object.
 * @param params.baseURL - The baseURL to inspect for replacement placeholders.
 * @param params.azureOptions - The azure options object containing the instance and deployment names.
 * @returns The complete baseURL with credentials injected for the Azure OpenAI API.
 */
function constructAzureURL({ baseURL, azureOptions, }) {
    var _a, _b;
    let finalURL = baseURL;
    // Replace INSTANCE_NAME and DEPLOYMENT_NAME placeholders with actual values if available
    if (azureOptions) {
        finalURL = finalURL.replace('${INSTANCE_NAME}', (_a = azureOptions.azureOpenAIApiInstanceName) !== null && _a !== void 0 ? _a : '');
        finalURL = finalURL.replace('${DEPLOYMENT_NAME}', (_b = azureOptions.azureOpenAIApiDeploymentName) !== null && _b !== void 0 ? _b : '');
    }
    return finalURL;
}

/**
 * Check if email configuration is set
 * @returns Returns `true` if either Mailgun or SMTP is properly configured
 */
function checkEmailConfig() {
    const hasMailgunConfig = !!process.env.MAILGUN_API_KEY && !!process.env.MAILGUN_DOMAIN && !!process.env.EMAIL_FROM;
    const hasSMTPConfig = (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) &&
        !!process.env.EMAIL_USERNAME &&
        !!process.env.EMAIL_PASSWORD &&
        !!process.env.EMAIL_FROM;
    return hasMailgunConfig || hasSMTPConfig;
}

/**
 * List of allowed user fields that can be used in MCP environment variables.
 * These are non-sensitive string/boolean fields from the IUser interface.
 */
const ALLOWED_USER_FIELDS = [
    'id',
    'name',
    'username',
    'email',
    'provider',
    'role',
    'googleId',
    'facebookId',
    'openidId',
    'samlId',
    'ldapId',
    'githubId',
    'discordId',
    'appleId',
    'emailVerified',
    'twoFactorEnabled',
    'termsAccepted',
];
/**
 * List of allowed request body fields that can be used in header placeholders.
 * These are common fields from the request body that are safe to expose in headers.
 */
const ALLOWED_BODY_FIELDS = ['conversationId', 'parentMessageId', 'messageId'];
/**
 * Processes a string value to replace user field placeholders
 * @param value - The string value to process
 * @param user - The user object
 * @returns The processed string with placeholders replaced
 */
function processUserPlaceholders(value, user) {
    if (!user || typeof value !== 'string') {
        return value;
    }
    for (const field of ALLOWED_USER_FIELDS) {
        const placeholder = `{{LIBRECHAT_USER_${field.toUpperCase()}}}`;
        if (!value.includes(placeholder)) {
            continue;
        }
        const fieldValue = user[field];
        // Skip replacement if field doesn't exist in user object
        if (!(field in user)) {
            continue;
        }
        // Special case for 'id' field: skip if undefined or empty
        if (field === 'id' && (fieldValue === undefined || fieldValue === '')) {
            continue;
        }
        const replacementValue = fieldValue == null ? '' : String(fieldValue);
        value = value.replace(new RegExp(placeholder, 'g'), replacementValue);
    }
    return value;
}
/**
 * Replaces request body field placeholders within a string.
 * Recognized placeholders: `{{LIBRECHAT_BODY_<FIELD>}}` where `<FIELD>` ∈ ALLOWED_BODY_FIELDS.
 * If a body field is absent or null/undefined, it is replaced with an empty string.
 *
 * @param value - The string value to process
 * @param body - The request body object
 * @returns The processed string with placeholders replaced
 */
function processBodyPlaceholders(value, body) {
    for (const field of ALLOWED_BODY_FIELDS) {
        const placeholder = `{{LIBRECHAT_BODY_${field.toUpperCase()}}}`;
        if (!value.includes(placeholder)) {
            continue;
        }
        const fieldValue = body[field];
        const replacementValue = fieldValue == null ? '' : String(fieldValue);
        value = value.replace(new RegExp(placeholder, 'g'), replacementValue);
    }
    return value;
}
/**
 * Processes a single string value by replacing various types of placeholders
 * @param originalValue - The original string value to process
 * @param customUserVars - Optional custom user variables to replace placeholders
 * @param user - Optional user object for replacing user field placeholders
 * @param body - Optional request body object for replacing body field placeholders
 * @returns The processed string with all placeholders replaced
 */
function processSingleValue({ originalValue, customUserVars, user, body = undefined, }) {
    let value = originalValue;
    // 1. Replace custom user variables
    if (customUserVars) {
        for (const [varName, varVal] of Object.entries(customUserVars)) {
            /** Escaped varName for use in regex to avoid issues with special characters */
            const escapedVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const placeholderRegex = new RegExp(`\\{\\{${escapedVarName}\\}\\}`, 'g');
            value = value.replace(placeholderRegex, varVal);
        }
    }
    // 2. Replace user field placeholders (e.g., {{LIBRECHAT_USER_EMAIL}}, {{LIBRECHAT_USER_ID}})
    value = processUserPlaceholders(value, user);
    // 3. Replace body field placeholders (e.g., {{LIBRECHAT_BODY_CONVERSATIONID}}, {{LIBRECHAT_BODY_PARENTMESSAGEID}})
    if (body) {
        value = processBodyPlaceholders(value, body);
    }
    // 4. Replace system environment variables
    value = librechatDataProvider.extractEnvVariable(value);
    return value;
}
/**
 * Recursively processes an object to replace environment variables in string values
 * @param params - Processing parameters
 * @param params.options - The MCP options to process
 * @param params.user - The user object containing all user fields
 * @param params.customUserVars - vars that user set in settings
 * @param params.body - the body of the request that is being processed
 * @returns - The processed object with environment variables replaced
 */
function processMCPEnv(params) {
    const { options, user, customUserVars, body } = params;
    if (options === null || options === undefined) {
        return options;
    }
    const newObj = structuredClone(options);
    if ('env' in newObj && newObj.env) {
        const processedEnv = {};
        for (const [key, originalValue] of Object.entries(newObj.env)) {
            processedEnv[key] = processSingleValue({ originalValue, customUserVars, user, body });
        }
        newObj.env = processedEnv;
    }
    if ('args' in newObj && newObj.args) {
        const processedArgs = [];
        for (const originalValue of newObj.args) {
            processedArgs.push(processSingleValue({ originalValue, customUserVars, user, body }));
        }
        newObj.args = processedArgs;
    }
    // Process headers if they exist (for WebSocket, SSE, StreamableHTTP types)
    // Note: `env` and `headers` are on different branches of the MCPOptions union type.
    if ('headers' in newObj && newObj.headers) {
        const processedHeaders = {};
        for (const [key, originalValue] of Object.entries(newObj.headers)) {
            processedHeaders[key] = processSingleValue({ originalValue, customUserVars, user, body });
        }
        newObj.headers = processedHeaders;
    }
    // Process URL if it exists (for WebSocket, SSE, StreamableHTTP types)
    if ('url' in newObj && newObj.url) {
        newObj.url = processSingleValue({ originalValue: newObj.url, customUserVars, user, body });
    }
    // Process OAuth configuration if it exists (for all transport types)
    if ('oauth' in newObj && newObj.oauth) {
        const processedOAuth = {};
        for (const [key, originalValue] of Object.entries(newObj.oauth)) {
            // Only process string values for environment variables
            // token_exchange_method is an enum and shouldn't be processed
            if (typeof originalValue === 'string') {
                processedOAuth[key] = processSingleValue({ originalValue, customUserVars, user, body });
            }
            else {
                processedOAuth[key] = originalValue;
            }
        }
        newObj.oauth = processedOAuth;
    }
    return newObj;
}
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
function resolveHeaders(options) {
    const { headers, user, body, customUserVars } = options !== null && options !== void 0 ? options : {};
    const inputHeaders = headers !== null && headers !== void 0 ? headers : {};
    const resolvedHeaders = Object.assign({}, inputHeaders);
    if (inputHeaders && typeof inputHeaders === 'object' && !Array.isArray(inputHeaders)) {
        Object.keys(inputHeaders).forEach((key) => {
            resolvedHeaders[key] = processSingleValue({
                originalValue: inputHeaders[key],
                customUserVars,
                user: user,
                body,
            });
        });
    }
    return resolvedHeaders;
}

/**
 * Sends message data in Server Sent Events format.
 * @param res - The server response.
 * @param event - The message event.
 * @param event.event - The type of event.
 * @param event.data - The message to be sent.
 */
function sendEvent(res, event) {
    if (typeof event.data === 'string' && event.data.length === 0) {
        return;
    }
    res.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`);
}
/**
 * Sends error data in Server Sent Events format and ends the response.
 * @param res - The server response.
 * @param message - The error message.
 */
function handleError(res, message) {
    res.write(`event: error\ndata: ${JSON.stringify(message)}\n\n`);
    res.end();
}

/**
 * Sanitize a filename by removing any directory components, replacing non-alphanumeric characters
 * @param inputName
 */
function sanitizeFilename(inputName) {
    // Remove any directory components
    let name = path$1.basename(inputName);
    // Replace any non-alphanumeric characters except for '.' and '-'
    name = name.replace(/[^a-zA-Z0-9.-]/g, '_');
    // Ensure the name doesn't start with a dot (hidden file in Unix-like systems)
    if (name.startsWith('.') || name === '') {
        name = '_' + name;
    }
    // Limit the length of the filename
    const MAX_LENGTH = 255;
    if (name.length > MAX_LENGTH) {
        const ext = path$1.extname(name);
        const nameWithoutExt = path$1.basename(name, ext);
        name =
            nameWithoutExt.slice(0, MAX_LENGTH - ext.length - 7) +
                '-' +
                crypto$1.randomBytes(3).toString('hex') +
                ext;
    }
    return name;
}

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __rest(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

/**
 * Makes a function to make HTTP request and logs the process.
 * @param params
 * @param params.directEndpoint - Whether to use a direct endpoint.
 * @param params.reverseProxyUrl - The reverse proxy URL to use for the request.
 * @returns A promise that resolves to the response of the fetch request.
 */
function createFetch({ directEndpoint = false, reverseProxyUrl = '', }) {
    /**
     * Makes an HTTP request and logs the process.
     * @param url - The URL to make the request to. Can be a string or a Request object.
     * @param init - Optional init options for the request.
     * @returns A promise that resolves to the response of the fetch request.
     */
    return function (_url, init) {
        return __awaiter(this, void 0, void 0, function* () {
            let url = _url;
            if (directEndpoint) {
                url = reverseProxyUrl;
            }
            dataSchemas.logger.debug(`Making request to ${url}`);
            if (typeof Bun !== 'undefined') {
                return yield fetch$1(url, init);
            }
            return yield fetch$1(url, init);
        });
    };
}
/**
 * Creates event handlers for stream events that don't capture client references
 * @param res - The response object to send events to
 * @returns Object containing handler functions
 */
function createStreamEventHandlers(res) {
    return {
        [agents.GraphEvents.ON_RUN_STEP]: function (event) {
            if (res) {
                sendEvent(res, event);
            }
        },
        [agents.GraphEvents.ON_MESSAGE_DELTA]: function (event) {
            if (res) {
                sendEvent(res, event);
            }
        },
        [agents.GraphEvents.ON_REASONING_DELTA]: function (event) {
            if (res) {
                sendEvent(res, event);
            }
        },
    };
}
function createHandleLLMNewToken(streamRate) {
    return function () {
        return __awaiter(this, void 0, void 0, function* () {
            if (streamRate) {
                yield agents.sleep(streamRate);
            }
        });
    };
}

/**
 * Load Google service key from file path, URL, or stringified JSON
 * @param keyPath - The path to the service key file, URL to fetch it from, or stringified JSON
 * @returns The parsed service key object or null if failed
 */
function loadServiceKey(keyPath) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!keyPath) {
            return null;
        }
        let serviceKey;
        // Check if it's base64 encoded (common pattern for storing in env vars)
        if (keyPath.trim().match(/^[A-Za-z0-9+/]+=*$/)) {
            try {
                const decoded = Buffer.from(keyPath.trim(), 'base64').toString('utf-8');
                // Try to parse the decoded string as JSON
                serviceKey = JSON.parse(decoded);
            }
            catch (_a) {
                // Not base64 or not valid JSON after decoding, continue with other methods
                // Silent failure - not critical
            }
        }
        // Check if it's a stringified JSON (starts with '{')
        if (!serviceKey && keyPath.trim().startsWith('{')) {
            try {
                serviceKey = JSON.parse(keyPath);
            }
            catch (error) {
                dataSchemas.logger.error('Failed to parse service key from stringified JSON', error);
                return null;
            }
        }
        // Check if it's a URL
        else if (!serviceKey && /^https?:\/\//.test(keyPath)) {
            try {
                const response = yield axios$1.get(keyPath);
                serviceKey = response.data;
            }
            catch (error) {
                dataSchemas.logger.error(`Failed to fetch the service key from URL: ${keyPath}`, error);
                return null;
            }
        }
        else if (!serviceKey) {
            // It's a file path
            try {
                const absolutePath = path$1.isAbsolute(keyPath) ? keyPath : path$1.resolve(keyPath);
                const fileContent = fs$1.readFileSync(absolutePath, 'utf8');
                serviceKey = JSON.parse(fileContent);
            }
            catch (error) {
                dataSchemas.logger.error(`Failed to load service key from file: ${keyPath}`, error);
                return null;
            }
        }
        // If the response is a string (e.g., from a URL that returns JSON as text), parse it
        if (typeof serviceKey === 'string') {
            try {
                serviceKey = JSON.parse(serviceKey);
            }
            catch (parseError) {
                dataSchemas.logger.error(`Failed to parse service key JSON from ${keyPath}`, parseError);
                return null;
            }
        }
        // Validate the service key has required fields
        if (!serviceKey || typeof serviceKey !== 'object') {
            dataSchemas.logger.error(`Invalid service key format from ${keyPath}`);
            return null;
        }
        // Fix private key formatting if needed
        const key = serviceKey;
        if (key.private_key && typeof key.private_key === 'string') {
            // Replace escaped newlines with actual newlines
            // When JSON.parse processes "\\n", it becomes "\n" (single backslash + n)
            // When JSON.parse processes "\n", it becomes an actual newline character
            key.private_key = key.private_key.replace(/\\n/g, '\n');
            // Also handle the String.raw`\n` case mentioned in Stack Overflow
            key.private_key = key.private_key.split(String.raw `\n`).join('\n');
            // Ensure proper PEM format
            if (!key.private_key.includes('\n')) {
                // If no newlines are present, try to format it properly
                const privateKeyMatch = key.private_key.match(/^(-----BEGIN [A-Z ]+-----)(.*)(-----END [A-Z ]+-----)$/);
                if (privateKeyMatch) {
                    const [, header, body, footer] = privateKeyMatch;
                    // Add newlines after header and before footer
                    key.private_key = `${header}\n${body}\n${footer}`;
                }
            }
        }
        return key;
    });
}

/**
 * Separates LibreChat-specific parameters from model options
 * @param options - The combined options object
 */
function extractLibreChatParams(options) {
    var _a;
    if (!options) {
        return {
            modelOptions: {},
            resendFiles: librechatDataProvider.librechat.resendFiles.default,
        };
    }
    const modelOptions = Object.assign({}, options);
    const resendFiles = (_a = (delete modelOptions.resendFiles, options.resendFiles)) !== null && _a !== void 0 ? _a : librechatDataProvider.librechat.resendFiles.default;
    const promptPrefix = (delete modelOptions.promptPrefix, options.promptPrefix);
    const maxContextTokens = (delete modelOptions.maxContextTokens, options.maxContextTokens);
    const fileTokenLimit = (delete modelOptions.fileTokenLimit, options.fileTokenLimit);
    const modelLabel = (delete modelOptions.modelLabel, options.modelLabel);
    return {
        modelOptions: modelOptions,
        maxContextTokens,
        fileTokenLimit,
        promptPrefix,
        resendFiles,
        modelLabel,
    };
}

/**
 * Evaluates a mathematical expression provided as a string and returns the result.
 *
 * If the input is already a number, it returns the number as is.
 * If the input is not a string or contains invalid characters, an error is thrown.
 * If the evaluated result is not a number, an error is thrown.
 *
 * @param str - The mathematical expression to evaluate, or a number.
 * @param fallbackValue - The default value to return if the input is not a string or number, or if the evaluated result is not a number.
 *
 * @returns The result of the evaluated expression or the input number.
 *
 * @throws Throws an error if the input is not a string or number, contains invalid characters, or does not evaluate to a number.
 */
function math(str, fallbackValue) {
    const fallback = typeof fallbackValue !== 'undefined' && typeof fallbackValue === 'number';
    if (typeof str !== 'string' && typeof str === 'number') {
        return str;
    }
    else if (typeof str !== 'string') {
        if (fallback) {
            return fallbackValue;
        }
        throw new Error(`str is ${typeof str}, but should be a string`);
    }
    const validStr = /^[+\-\d.\s*/%()]+$/.test(str);
    if (!validStr) {
        if (fallback) {
            return fallbackValue;
        }
        throw new Error('Invalid characters in string');
    }
    const value = eval(str);
    if (typeof value !== 'number') {
        if (fallback) {
            return fallbackValue;
        }
        throw new Error(`[math] str did not evaluate to a number but to a ${typeof value}`);
    }
    return value;
}

/**
 * Helper function to safely log sensitive data when debug mode is enabled
 * @param obj - Object to stringify
 * @param maxLength - Maximum length of the stringified output
 * @returns Stringified object with sensitive data masked
 */
function safeStringify(obj, maxLength = 1000) {
    try {
        const str = JSON.stringify(obj, (key, value) => {
            // Mask sensitive values
            if (key === 'client_secret' ||
                key === 'Authorization' ||
                key.toLowerCase().includes('token') ||
                key.toLowerCase().includes('password')) {
                return typeof value === 'string' && value.length > 6
                    ? `${value.substring(0, 3)}...${value.substring(value.length - 3)}`
                    : '***MASKED***';
            }
            return value;
        });
        if (str && str.length > maxLength) {
            return `${str.substring(0, maxLength)}... (truncated)`;
        }
        return str;
    }
    catch (error) {
        return `[Error stringifying object: ${error.message}]`;
    }
}
/**
 * Helper to log headers without revealing sensitive information
 * @param headers - Headers object to log
 * @returns Stringified headers with sensitive data masked
 */
function logHeaders(headers) {
    const headerObj = {};
    if (!headers || typeof headers.entries !== 'function') {
        return 'No headers available';
    }
    for (const [key, value] of headers.entries()) {
        if (key.toLowerCase() === 'authorization' || key.toLowerCase().includes('secret')) {
            headerObj[key] = '***MASKED***';
        }
        else {
            headerObj[key] = value;
        }
    }
    return safeStringify(headerObj);
}

/**
 * Default retention period for temporary chats in hours
 */
const DEFAULT_RETENTION_HOURS = 24 * 30; // 30 days
/**
 * Minimum allowed retention period in hours
 */
const MIN_RETENTION_HOURS = 1;
/**
 * Maximum allowed retention period in hours (1 year = 8760 hours)
 */
const MAX_RETENTION_HOURS = 8760;
/**
 * Gets the temporary chat retention period from environment variables or config
 * @param interfaceConfig - The custom configuration object
 * @returns The retention period in hours
 */
function getTempChatRetentionHours(interfaceConfig) {
    let retentionHours = DEFAULT_RETENTION_HOURS;
    // Check environment variable first
    if (process.env.TEMP_CHAT_RETENTION_HOURS) {
        const envValue = parseInt(process.env.TEMP_CHAT_RETENTION_HOURS, 10);
        if (!isNaN(envValue)) {
            retentionHours = envValue;
        }
        else {
            dataSchemas.logger.warn(`Invalid TEMP_CHAT_RETENTION_HOURS environment variable: ${process.env.TEMP_CHAT_RETENTION_HOURS}. Using default: ${DEFAULT_RETENTION_HOURS} hours.`);
        }
    }
    // Check config file (takes precedence over environment variable)
    if ((interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.temporaryChatRetention) !== undefined) {
        const configValue = interfaceConfig.temporaryChatRetention;
        if (typeof configValue === 'number' && !isNaN(configValue)) {
            retentionHours = configValue;
        }
        else {
            dataSchemas.logger.warn(`Invalid temporaryChatRetention in config: ${configValue}. Using ${retentionHours} hours.`);
        }
    }
    // Validate the retention period
    if (retentionHours < MIN_RETENTION_HOURS) {
        dataSchemas.logger.warn(`Temporary chat retention period ${retentionHours} is below minimum ${MIN_RETENTION_HOURS} hours. Using minimum value.`);
        retentionHours = MIN_RETENTION_HOURS;
    }
    else if (retentionHours > MAX_RETENTION_HOURS) {
        dataSchemas.logger.warn(`Temporary chat retention period ${retentionHours} exceeds maximum ${MAX_RETENTION_HOURS} hours. Using maximum value.`);
        retentionHours = MAX_RETENTION_HOURS;
    }
    return retentionHours;
}
/**
 * Creates an expiration date for temporary chats
 * @param interfaceConfig - The custom configuration object
 * @returns The expiration date
 */
function createTempChatExpirationDate(interfaceConfig) {
    const retentionHours = getTempChatRetentionHours(interfaceConfig);
    const expiredAt = new Date();
    expiredAt.setHours(expiredAt.getHours() + retentionHours);
    return expiredAt;
}

/**
 * Processes text content by counting tokens and truncating if it exceeds the specified limit.
 * @param text - The text content to process
 * @param tokenLimit - The maximum number of tokens allowed
 * @param tokenCountFn - Function to count tokens
 * @returns Promise resolving to object with processed text, token count, and truncation status
 */
function processTextWithTokenLimit({ text, tokenLimit, tokenCountFn, }) {
    return __awaiter(this, void 0, void 0, function* () {
        const originalTokenCount = yield tokenCountFn(text);
        if (originalTokenCount <= tokenLimit) {
            return {
                text,
                tokenCount: originalTokenCount,
                wasTruncated: false,
            };
        }
        /**
         * Doing binary search here to find the truncation point efficiently
         * (May be a better way to go about this)
         */
        let low = 0;
        let high = text.length;
        let bestText = '';
        dataSchemas.logger.debug(`[textTokenLimiter] Text content exceeds token limit: ${originalTokenCount} > ${tokenLimit}, truncating...`);
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const truncatedText = text.substring(0, mid);
            const tokenCount = yield tokenCountFn(truncatedText);
            if (tokenCount <= tokenLimit) {
                bestText = truncatedText;
                low = mid + 1;
            }
            else {
                high = mid - 1;
            }
        }
        const finalTokenCount = yield tokenCountFn(bestText);
        dataSchemas.logger.warn(`[textTokenLimiter] Text truncated from ${originalTokenCount} to ${finalTokenCount} tokens (limit: ${tokenLimit})`);
        return {
            text: bestText,
            tokenCount: finalTokenCount,
            wasTruncated: true,
        };
    });
}

class Tokenizer {
    constructor() {
        this.tokenizersCache = {};
        this.tokenizerCallsCount = 0;
    }
    getTokenizer(encoding, isModelName = false, extendSpecialTokens = {}) {
        let tokenizer;
        if (this.tokenizersCache[encoding]) {
            tokenizer = this.tokenizersCache[encoding];
        }
        else {
            if (isModelName) {
                tokenizer = tiktoken.encoding_for_model(encoding, extendSpecialTokens);
            }
            else {
                tokenizer = tiktoken.get_encoding(encoding, extendSpecialTokens);
            }
            this.tokenizersCache[encoding] = tokenizer;
        }
        return tokenizer;
    }
    freeAndResetAllEncoders() {
        try {
            Object.keys(this.tokenizersCache).forEach((key) => {
                if (this.tokenizersCache[key]) {
                    this.tokenizersCache[key].free();
                    delete this.tokenizersCache[key];
                }
            });
            this.tokenizerCallsCount = 1;
        }
        catch (error) {
            dataSchemas.logger.error('[Tokenizer] Free and reset encoders error', error);
        }
    }
    resetTokenizersIfNecessary() {
        var _a;
        if (this.tokenizerCallsCount >= 25) {
            if ((_a = this.options) === null || _a === void 0 ? void 0 : _a.debug) {
                dataSchemas.logger.debug('[Tokenizer] freeAndResetAllEncoders: reached 25 encodings, resetting...');
            }
            this.freeAndResetAllEncoders();
        }
        this.tokenizerCallsCount++;
    }
    getTokenCount(text, encoding = 'cl100k_base') {
        this.resetTokenizersIfNecessary();
        try {
            const tokenizer = this.getTokenizer(encoding);
            return tokenizer.encode(text, 'all').length;
        }
        catch (error) {
            dataSchemas.logger.error('[Tokenizer] Error getting token count:', error);
            this.freeAndResetAllEncoders();
            const tokenizer = this.getTokenizer(encoding);
            return tokenizer.encode(text, 'all').length;
        }
    }
}
const TokenizerSingleton = new Tokenizer();

function loadYaml(filepath) {
    try {
        const fileContents = fs$1.readFileSync(filepath, 'utf8');
        return yaml.load(fileContents);
    }
    catch (e) {
        return e;
    }
}

/**
 * Normalizes an error-like object into an HTTP status and message.
 * Ensures we always respond with a valid numeric status to avoid UI hangs.
 */
function normalizeHttpError(err, fallbackStatus = 400) {
    let status = fallbackStatus;
    if (err && typeof err === 'object' && 'status' in err && typeof err.status === 'number') {
        status = err.status;
    }
    let message = 'An error occurred.';
    if (err &&
        typeof err === 'object' &&
        'message' in err &&
        typeof err.message === 'string' &&
        err.message.length > 0) {
        message = err.message;
    }
    return { status, message };
}

const openAIModels = {
    'o4-mini': 200000,
    'o3-mini': 195000, // -5000 from max
    o3: 200000,
    o1: 195000, // -5000 from max
    'o1-mini': 127500, // -500 from max
    'o1-preview': 127500, // -500 from max
    'gpt-4': 8187, // -5 from max
    'gpt-4-0613': 8187, // -5 from max
    'gpt-4-32k': 32758, // -10 from max
    'gpt-4-32k-0314': 32758, // -10 from max
    'gpt-4-32k-0613': 32758, // -10 from max
    'gpt-4-1106': 127500, // -500 from max
    'gpt-4-0125': 127500, // -500 from max
    'gpt-4.5': 127500, // -500 from max
    'gpt-4.1': 1047576,
    'gpt-4.1-mini': 1047576,
    'gpt-4.1-nano': 1047576,
    'gpt-5': 400000,
    'gpt-5-mini': 400000,
    'gpt-5-nano': 400000,
    'gpt-4o': 127500, // -500 from max
    'gpt-4o-mini': 127500, // -500 from max
    'gpt-4o-2024-05-13': 127500, // -500 from max
    'gpt-4o-2024-08-06': 127500, // -500 from max
    'gpt-4-turbo': 127500, // -500 from max
    'gpt-4-vision': 127500, // -500 from max
    'gpt-3.5-turbo': 16375, // -10 from max
    'gpt-3.5-turbo-0613': 4092, // -5 from max
    'gpt-3.5-turbo-0301': 4092, // -5 from max
    'gpt-3.5-turbo-16k': 16375, // -10 from max
    'gpt-3.5-turbo-16k-0613': 16375, // -10 from max
    'gpt-3.5-turbo-1106': 16375, // -10 from max
    'gpt-3.5-turbo-0125': 16375, // -10 from max
};
const mistralModels = {
    'mistral-': 31990, // -10 from max
    'mistral-7b': 31990, // -10 from max
    'mistral-small': 31990, // -10 from max
    'mixtral-8x7b': 31990, // -10 from max
    'mistral-large': 131000,
    'mistral-large-2402': 127500,
    'mistral-large-2407': 127500,
    'pixtral-large': 131000,
    'mistral-saba': 32000,
    codestral: 256000,
    'ministral-8b': 131000,
    'ministral-3b': 131000,
};
const cohereModels = {
    'command-light': 4086, // -10 from max
    'command-light-nightly': 8182, // -10 from max
    command: 4086, // -10 from max
    'command-nightly': 8182, // -10 from max
    'command-r': 127500, // -500 from max
    'command-r-plus': 127500, // -500 from max
};
const googleModels = {
    /* Max I/O is combined so we subtract the amount from max response tokens for actual total */
    gemma: 8196,
    'gemma-2': 32768,
    'gemma-3': 32768,
    'gemma-3-27b': 131072,
    gemini: 30720, // -2048 from max
    'gemini-pro-vision': 12288,
    'gemini-exp': 2000000,
    'gemini-2.5': 1000000, // 1M input tokens, 64k output tokens
    'gemini-2.5-pro': 1000000,
    'gemini-2.5-flash': 1000000,
    'gemini-2.0': 2000000,
    'gemini-2.0-flash': 1000000,
    'gemini-2.0-flash-lite': 1000000,
    'gemini-1.5': 1000000,
    'gemini-1.5-flash': 1000000,
    'gemini-1.5-flash-8b': 1000000,
    'text-bison-32k': 32758, // -10 from max
    'chat-bison-32k': 32758, // -10 from max
    'code-bison-32k': 32758, // -10 from max
    'codechat-bison-32k': 32758,
    /* Codey, -5 from max: 6144 */
    'code-': 6139,
    'codechat-': 6139,
    /* PaLM2, -5 from max: 8192 */
    'text-': 8187,
    'chat-': 8187,
};
const anthropicModels = {
    'claude-': 100000,
    'claude-instant': 100000,
    'claude-2': 100000,
    'claude-2.1': 200000,
    'claude-3': 200000,
    'claude-3-haiku': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-opus': 200000,
    'claude-3.5-haiku': 200000,
    'claude-3-5-haiku': 200000,
    'claude-3-5-sonnet': 200000,
    'claude-3.5-sonnet': 200000,
    'claude-3-7-sonnet': 200000,
    'claude-3.7-sonnet': 200000,
    'claude-3-5-sonnet-latest': 200000,
    'claude-3.5-sonnet-latest': 200000,
    'claude-sonnet-4': 1000000,
    'claude-opus-4': 200000,
    'claude-4': 200000,
};
const deepseekModels = {
    'deepseek-reasoner': 63000, // -1000 from max (API)
    deepseek: 63000, // -1000 from max (API)
    'deepseek.r1': 127500,
};
const metaModels = {
    // Basic patterns
    llama3: 8000,
    llama2: 4000,
    'llama-3': 8000,
    'llama-2': 4000,
    // llama3.x pattern
    'llama3.1': 127500,
    'llama3.2': 127500,
    'llama3.3': 127500,
    // llama3-x pattern
    'llama3-1': 127500,
    'llama3-2': 127500,
    'llama3-3': 127500,
    // llama-3.x pattern
    'llama-3.1': 127500,
    'llama-3.2': 127500,
    'llama-3.3': 127500,
    // llama3.x:Nb pattern
    'llama3.1:405b': 127500,
    'llama3.1:70b': 127500,
    'llama3.1:8b': 127500,
    'llama3.2:1b': 127500,
    'llama3.2:3b': 127500,
    'llama3.2:11b': 127500,
    'llama3.2:90b': 127500,
    'llama3.3:70b': 127500,
    // llama3-x-Nb pattern
    'llama3-1-405b': 127500,
    'llama3-1-70b': 127500,
    'llama3-1-8b': 127500,
    'llama3-2-1b': 127500,
    'llama3-2-3b': 127500,
    'llama3-2-11b': 127500,
    'llama3-2-90b': 127500,
    'llama3-3-70b': 127500,
    // llama-3.x-Nb pattern
    'llama-3.1-405b': 127500,
    'llama-3.1-70b': 127500,
    'llama-3.1-8b': 127500,
    'llama-3.2-1b': 127500,
    'llama-3.2-3b': 127500,
    'llama-3.2-11b': 127500,
    'llama-3.2-90b': 127500,
    'llama-3.3-70b': 127500,
    // Original llama2/3 patterns
    'llama3-70b': 8000,
    'llama3-8b': 8000,
    'llama2-70b': 4000,
    'llama2-13b': 4000,
    'llama3:70b': 8000,
    'llama3:8b': 8000,
    'llama2:70b': 4000,
};
const ollamaModels = {
    'qwen2.5': 32000,
};
const ai21Models = {
    'ai21.j2-mid-v1': 8182, // -10 from max
    'ai21.j2-ultra-v1': 8182, // -10 from max
    'ai21.jamba-instruct-v1:0': 255500, // -500 from max
};
const amazonModels = {
    'amazon.titan-text-lite-v1': 4000,
    'amazon.titan-text-express-v1': 8000,
    'amazon.titan-text-premier-v1:0': 31500, // -500 from max
    // https://aws.amazon.com/ai/generative-ai/nova/
    'amazon.nova-micro-v1:0': 127000, // -1000 from max,
    'amazon.nova-lite-v1:0': 295000, // -5000 from max,
    'amazon.nova-pro-v1:0': 295000, // -5000 from max,
    'amazon.nova-premier-v1:0': 995000, // -5000 from max,
    'amazon.nova-canvas-v1:0': 4000, // Image generation model, limited tokens for prompts
};
const bedrockModels = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, anthropicModels), mistralModels), cohereModels), ollamaModels), deepseekModels), metaModels), ai21Models), amazonModels);
const xAIModels = {
    grok: 131072,
    'grok-beta': 131072,
    'grok-vision-beta': 8192,
    'grok-2': 131072,
    'grok-2-latest': 131072,
    'grok-2-1212': 131072,
    'grok-2-vision': 32768,
    'grok-2-vision-latest': 32768,
    'grok-2-vision-1212': 32768,
    'grok-3': 131072,
    'grok-3-fast': 131072,
    'grok-3-mini': 131072,
    'grok-3-mini-fast': 131072,
    'grok-4': 256000, // 256K context
};
const aggregateModels = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, openAIModels), googleModels), bedrockModels), xAIModels), { 
    // misc.
    kimi: 131000, 
    // GPT-OSS
    'gpt-oss-20b': 131000, 'gpt-oss-120b': 131000 });
const maxTokensMap = {
    [librechatDataProvider.EModelEndpoint.azureOpenAI]: openAIModels,
    [librechatDataProvider.EModelEndpoint.openAI]: aggregateModels,
    [librechatDataProvider.EModelEndpoint.agents]: aggregateModels,
    [librechatDataProvider.EModelEndpoint.custom]: aggregateModels,
    [librechatDataProvider.EModelEndpoint.google]: googleModels,
    [librechatDataProvider.EModelEndpoint.anthropic]: anthropicModels,
    [librechatDataProvider.EModelEndpoint.bedrock]: bedrockModels,
};
const modelMaxOutputs = {
    o1: 32268, // -500 from max: 32,768
    'o1-mini': 65136, // -500 from max: 65,536
    'o1-preview': 32268, // -500 from max: 32,768
    'gpt-5': 128000,
    'gpt-5-mini': 128000,
    'gpt-5-nano': 128000,
    'gpt-oss-20b': 131000,
    'gpt-oss-120b': 131000,
    system_default: 32000,
};
/** Outputs from https://docs.anthropic.com/en/docs/about-claude/models/all-models#model-names */
const anthropicMaxOutputs = {
    'claude-3-haiku': 4096,
    'claude-3-sonnet': 4096,
    'claude-3-opus': 4096,
    'claude-opus-4': 32000,
    'claude-sonnet-4': 64000,
    'claude-3.5-sonnet': 8192,
    'claude-3-5-sonnet': 8192,
    'claude-3.7-sonnet': 128000,
    'claude-3-7-sonnet': 128000,
};
const maxOutputTokensMap = {
    [librechatDataProvider.EModelEndpoint.anthropic]: anthropicMaxOutputs,
    [librechatDataProvider.EModelEndpoint.azureOpenAI]: modelMaxOutputs,
    [librechatDataProvider.EModelEndpoint.openAI]: modelMaxOutputs,
    [librechatDataProvider.EModelEndpoint.custom]: modelMaxOutputs,
};
/**
 * Finds the first matching pattern in the tokens map.
 * @param {string} modelName
 * @param {Record<string, number> | EndpointTokenConfig} tokensMap
 * @returns {string|null}
 */
function findMatchingPattern(modelName, tokensMap) {
    const keys = Object.keys(tokensMap);
    for (let i = keys.length - 1; i >= 0; i--) {
        const modelKey = keys[i];
        if (modelName.includes(modelKey)) {
            return modelKey;
        }
    }
    return null;
}
/**
 * Retrieves a token value for a given model name from a tokens map.
 *
 * @param modelName - The name of the model to look up.
 * @param tokensMap - The map of model names to token values.
 * @param [key='context'] - The key to look up in the tokens map.
 * @returns The token value for the given model or undefined if no match is found.
 */
function getModelTokenValue(modelName, tokensMap, key = 'context') {
    if (typeof modelName !== 'string' || !tokensMap) {
        return undefined;
    }
    const value = tokensMap[modelName];
    if (typeof value === 'number') {
        return value;
    }
    if (value === null || value === void 0 ? void 0 : value.context) {
        return value.context;
    }
    const matchedPattern = findMatchingPattern(modelName, tokensMap);
    if (matchedPattern) {
        const result = tokensMap[matchedPattern];
        if (typeof result === 'number') {
            return result;
        }
        const tokenValue = result === null || result === void 0 ? void 0 : result[key];
        if (typeof tokenValue === 'number') {
            return tokenValue;
        }
        return tokensMap.system_default;
    }
    return tokensMap.system_default;
}
/**
 * Retrieves the maximum tokens for a given model name.
 *
 * @param modelName - The name of the model to look up.
 * @param endpoint - The endpoint (default is 'openAI').
 * @param [endpointTokenConfig] - Token Config for current endpoint to use for max tokens lookup
 * @returns The maximum tokens for the given model or undefined if no match is found.
 */
function getModelMaxTokens(modelName, endpoint = librechatDataProvider.EModelEndpoint.openAI, endpointTokenConfig) {
    const tokensMap = endpointTokenConfig !== null && endpointTokenConfig !== void 0 ? endpointTokenConfig : maxTokensMap[endpoint];
    return getModelTokenValue(modelName, tokensMap);
}
/**
 * Retrieves the maximum output tokens for a given model name.
 *
 * @param modelName - The name of the model to look up.
 * @param endpoint - The endpoint (default is 'openAI').
 * @param [endpointTokenConfig] - Token Config for current endpoint to use for max tokens lookup
 * @returns The maximum output tokens for the given model or undefined if no match is found.
 */
function getModelMaxOutputTokens(modelName, endpoint = librechatDataProvider.EModelEndpoint.openAI, endpointTokenConfig) {
    const tokensMap = endpointTokenConfig !== null && endpointTokenConfig !== void 0 ? endpointTokenConfig : maxOutputTokensMap[endpoint];
    return getModelTokenValue(modelName, tokensMap, 'output');
}
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
function matchModelName(modelName, endpoint = librechatDataProvider.EModelEndpoint.openAI) {
    if (typeof modelName !== 'string') {
        return undefined;
    }
    const tokensMap = maxTokensMap[endpoint];
    if (!tokensMap) {
        return modelName;
    }
    if (tokensMap[modelName]) {
        return modelName;
    }
    const matchedPattern = findMatchingPattern(modelName, tokensMap);
    return matchedPattern || modelName;
}
const modelSchema = z.object({
    id: z.string(),
    pricing: z.object({
        prompt: z.string(),
        completion: z.string(),
    }),
    context_length: z.number(),
});
const inputSchema = z.object({
    data: z.array(modelSchema),
});
/**
 * Processes a list of model data from an API and organizes it into structured data based on URL and specifics of rates and context.
 * @param {{ data: Array<z.infer<typeof modelSchema>> }} input The input object containing base URL and data fetched from the API.
 * @returns {EndpointTokenConfig} The processed model data.
 */
function processModelData(input) {
    const validationResult = inputSchema.safeParse(input);
    if (!validationResult.success) {
        throw new Error('Invalid input data');
    }
    const { data } = validationResult.data;
    /** @type {EndpointTokenConfig} */
    const tokenConfig = {};
    for (const model of data) {
        const modelKey = model.id;
        if (modelKey === 'openrouter/auto') {
            model.pricing = {
                prompt: '0.00001',
                completion: '0.00003',
            };
        }
        const prompt = parseFloat(model.pricing.prompt) * 1000000;
        const completion = parseFloat(model.pricing.completion) * 1000000;
        tokenConfig[modelKey] = {
            prompt,
            completion,
            context: model.context_length,
        };
    }
    return tokenConfig;
}
const tiktokenModels = new Set([
    'text-davinci-003',
    'text-davinci-002',
    'text-davinci-001',
    'text-curie-001',
    'text-babbage-001',
    'text-ada-001',
    'davinci',
    'curie',
    'babbage',
    'ada',
    'code-davinci-002',
    'code-davinci-001',
    'code-cushman-002',
    'code-cushman-001',
    'davinci-codex',
    'cushman-codex',
    'text-davinci-edit-001',
    'code-davinci-edit-001',
    'text-embedding-ada-002',
    'text-similarity-davinci-001',
    'text-similarity-curie-001',
    'text-similarity-babbage-001',
    'text-similarity-ada-001',
    'text-search-davinci-doc-001',
    'text-search-curie-doc-001',
    'text-search-babbage-doc-001',
    'text-search-ada-doc-001',
    'code-search-babbage-code-001',
    'code-search-ada-code-001',
    'gpt2',
    'gpt-4',
    'gpt-4-0314',
    'gpt-4-32k',
    'gpt-4-32k-0314',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-0301',
]);

/**
 * Retrieves the balance configuration object
 * */
function getBalanceConfig(appConfig) {
    var _a;
    const isLegacyEnabled = isEnabled(process.env.CHECK_BALANCE);
    const startBalance = process.env.START_BALANCE;
    /** @type {} */
    const config = librechatDataProvider.removeNullishValues({
        enabled: isLegacyEnabled,
        startBalance: startBalance != null && startBalance ? parseInt(startBalance, 10) : undefined,
    });
    if (!appConfig) {
        return config;
    }
    return Object.assign(Object.assign({}, config), ((_a = appConfig === null || appConfig === void 0 ? void 0 : appConfig['balance']) !== null && _a !== void 0 ? _a : {}));
}
/**
 * Retrieves the transactions configuration object
 * */
function getTransactionsConfig(appConfig) {
    var _a;
    const defaultConfig = { enabled: true };
    if (!appConfig) {
        return defaultConfig;
    }
    const transactionsConfig = (_a = appConfig === null || appConfig === void 0 ? void 0 : appConfig['transactions']) !== null && _a !== void 0 ? _a : defaultConfig;
    const balanceConfig = getBalanceConfig(appConfig);
    // If balance is enabled but transactions are disabled, force transactions to be enabled
    // and log a warning
    if ((balanceConfig === null || balanceConfig === void 0 ? void 0 : balanceConfig.enabled) && !transactionsConfig.enabled) {
        dataSchemas.logger.warn('Configuration warning: transactions.enabled=false is incompatible with balance.enabled=true. ' +
            'Transactions will be enabled to ensure balance tracking works correctly.');
        return Object.assign(Object.assign({}, transactionsConfig), { enabled: true });
    }
    return transactionsConfig;
}
const getCustomEndpointConfig = ({ endpoint, appConfig, }) => {
    var _a, _b;
    if (!appConfig) {
        throw new Error(`Config not found for the ${endpoint} custom endpoint.`);
    }
    const customEndpoints = (_b = (_a = appConfig.endpoints) === null || _a === void 0 ? void 0 : _a[librechatDataProvider.EModelEndpoint.custom]) !== null && _b !== void 0 ? _b : [];
    return customEndpoints.find((endpointConfig) => normalizeEndpointName(endpointConfig.name) === endpoint);
};
function hasCustomUserVars(appConfig) {
    const mcpServers = appConfig === null || appConfig === void 0 ? void 0 : appConfig.mcpConfig;
    return Object.values(mcpServers !== null && mcpServers !== void 0 ? mcpServers : {}).some((server) => server.customUserVars);
}

const hasValidAgent = (agent) => !!agent &&
    (('id' in agent && !!agent.id) ||
        ('provider' in agent && 'model' in agent && !!agent.provider && !!agent.model));
const isDisabled = (config) => !config || config.disabled === true;
function loadMemoryConfig(config) {
    var _a;
    if (!config)
        return undefined;
    if (isDisabled(config))
        return config;
    if (!hasValidAgent(config.agent)) {
        return Object.assign(Object.assign({}, config), { disabled: true });
    }
    const charLimit = (_a = librechatDataProvider.memorySchema.shape.charLimit.safeParse(config.charLimit).data) !== null && _a !== void 0 ? _a : 10000;
    return Object.assign(Object.assign({}, config), { charLimit });
}
function isMemoryEnabled(config) {
    if (isDisabled(config))
        return false;
    return hasValidAgent(config.agent);
}

/**
 * Loads the default interface object.
 * @param params - The loaded custom configuration.
 * @param params.config - The loaded custom configuration.
 * @param params.configDefaults - The custom configuration default values.
 * @returns default interface object.
 */
function loadDefaultInterface({ config, configDefaults, }) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
    return __awaiter(this, void 0, void 0, function* () {
        const { interface: interfaceConfig } = config !== null && config !== void 0 ? config : {};
        const { interface: defaults } = configDefaults;
        const hasModelSpecs = ((_c = (_b = (_a = config === null || config === void 0 ? void 0 : config.modelSpecs) === null || _a === void 0 ? void 0 : _a.list) === null || _b === void 0 ? void 0 : _b.length) !== null && _c !== void 0 ? _c : 0) > 0;
        const includesAddedEndpoints = ((_f = (_e = (_d = config === null || config === void 0 ? void 0 : config.modelSpecs) === null || _d === void 0 ? void 0 : _d.addedEndpoints) === null || _e === void 0 ? void 0 : _e.length) !== null && _f !== void 0 ? _f : 0) > 0;
        const memoryConfig = config === null || config === void 0 ? void 0 : config.memory;
        const memoryEnabled = isMemoryEnabled(memoryConfig);
        /** Only disable memories if memory config is present but disabled/invalid */
        const shouldDisableMemories = memoryConfig && !memoryEnabled;
        const loadedInterface = librechatDataProvider.removeNullishValues({
            // UI elements - use schema defaults
            endpointsMenu: (_g = interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.endpointsMenu) !== null && _g !== void 0 ? _g : (hasModelSpecs ? false : defaults.endpointsMenu),
            modelSelect: (_h = interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.modelSelect) !== null && _h !== void 0 ? _h : (hasModelSpecs ? includesAddedEndpoints : defaults.modelSelect),
            parameters: (_j = interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.parameters) !== null && _j !== void 0 ? _j : (hasModelSpecs ? false : defaults.parameters),
            presets: (_k = interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.presets) !== null && _k !== void 0 ? _k : (hasModelSpecs ? false : defaults.presets),
            sidePanel: (_l = interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.sidePanel) !== null && _l !== void 0 ? _l : defaults.sidePanel,
            privacyPolicy: (_m = interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.privacyPolicy) !== null && _m !== void 0 ? _m : defaults.privacyPolicy,
            termsOfService: (_o = interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.termsOfService) !== null && _o !== void 0 ? _o : defaults.termsOfService,
            mcpServers: (_p = interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.mcpServers) !== null && _p !== void 0 ? _p : defaults.mcpServers,
            customWelcome: (_q = interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.customWelcome) !== null && _q !== void 0 ? _q : defaults.customWelcome,
            // Permissions - only include if explicitly configured
            bookmarks: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.bookmarks,
            memories: shouldDisableMemories ? false : interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.memories,
            prompts: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.prompts,
            multiConvo: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.multiConvo,
            modularChat: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.modularChat,
            agents: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.agents,
            temporaryChat: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.temporaryChat,
            speechToText: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.speechToText,
            textToSpeech: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.textToSpeech,
            editAgentMessages: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.editAgentMessages,
            runCode: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.runCode,
            webSearch: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.webSearch,
            fileSearch: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.fileSearch,
            fileCitations: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.fileCitations,
            peoplePicker: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.peoplePicker,
            marketplace: interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.marketplace,
        });
        let i = 0;
        const logSettings = () => {
            var _a;
            // log interface object and model specs object (without list) for reference
            dataSchemas.logger.warn(`\`interface\` settings:\n${JSON.stringify(loadedInterface, null, 2)}`);
            dataSchemas.logger.warn(`\`modelSpecs\` settings:\n${JSON.stringify(Object.assign(Object.assign({}, ((_a = config === null || config === void 0 ? void 0 : config.modelSpecs) !== null && _a !== void 0 ? _a : {})), { list: undefined }), null, 2)}`);
        };
        // warn about config.modelSpecs.prioritize if true and presets are enabled, that default presets will conflict with prioritizing model specs.
        if (((_r = config === null || config === void 0 ? void 0 : config.modelSpecs) === null || _r === void 0 ? void 0 : _r.prioritize) && loadedInterface.presets) {
            dataSchemas.logger.warn("Note: Prioritizing model specs can conflict with default presets if a default preset is set. It's recommended to disable presets from the interface or disable use of a default preset.");
            if (i === 0)
                i++;
        }
        // warn about config.modelSpecs.enforce if true and if any of these, endpointsMenu, modelSelect, presets, or parameters are enabled, that enforcing model specs can conflict with these options.
        if (((_s = config === null || config === void 0 ? void 0 : config.modelSpecs) === null || _s === void 0 ? void 0 : _s.enforce) &&
            (loadedInterface.endpointsMenu ||
                loadedInterface.modelSelect ||
                loadedInterface.presets ||
                loadedInterface.parameters)) {
            dataSchemas.logger.warn("Note: Enforcing model specs can conflict with the interface options: endpointsMenu, modelSelect, presets, and parameters. It's recommended to disable these options from the interface or disable enforcing model specs.");
            if (i === 0)
                i++;
        }
        // warn if enforce is true and prioritize is not, that enforcing model specs without prioritizing them can lead to unexpected behavior.
        if (((_t = config === null || config === void 0 ? void 0 : config.modelSpecs) === null || _t === void 0 ? void 0 : _t.enforce) && !((_u = config === null || config === void 0 ? void 0 : config.modelSpecs) === null || _u === void 0 ? void 0 : _u.prioritize)) {
            dataSchemas.logger.warn("Note: Enforcing model specs without prioritizing them can lead to unexpected behavior. It's recommended to enable prioritizing model specs if enforcing them.");
            if (i === 0)
                i++;
        }
        if (i > 0) {
            logSettings();
        }
        return loadedInterface;
    });
}

/**
 * Checks if a permission type has explicit configuration
 */
function hasExplicitConfig(interfaceConfig, permissionType) {
    switch (permissionType) {
        case librechatDataProvider.PermissionTypes.PROMPTS:
            return (interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.prompts) !== undefined;
        case librechatDataProvider.PermissionTypes.BOOKMARKS:
            return (interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.bookmarks) !== undefined;
        case librechatDataProvider.PermissionTypes.MEMORIES:
            return (interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.memories) !== undefined;
        case librechatDataProvider.PermissionTypes.MULTI_CONVO:
            return (interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.multiConvo) !== undefined;
        case librechatDataProvider.PermissionTypes.AGENTS:
            return (interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.agents) !== undefined;
        case librechatDataProvider.PermissionTypes.TEMPORARY_CHAT:
            return (interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.temporaryChat) !== undefined;
        case librechatDataProvider.PermissionTypes.RUN_CODE:
            return (interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.runCode) !== undefined;
        case librechatDataProvider.PermissionTypes.WEB_SEARCH:
            return (interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.webSearch) !== undefined;
        case librechatDataProvider.PermissionTypes.PEOPLE_PICKER:
            return (interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.peoplePicker) !== undefined;
        case librechatDataProvider.PermissionTypes.MARKETPLACE:
            return (interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.marketplace) !== undefined;
        case librechatDataProvider.PermissionTypes.FILE_SEARCH:
            return (interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.fileSearch) !== undefined;
        case librechatDataProvider.PermissionTypes.FILE_CITATIONS:
            return (interfaceConfig === null || interfaceConfig === void 0 ? void 0 : interfaceConfig.fileCitations) !== undefined;
        default:
            return false;
    }
}
function updateInterfacePermissions({ appConfig, getRoleByName, updateAccessPermissions, }) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3;
    return __awaiter(this, void 0, void 0, function* () {
        const loadedInterface = appConfig === null || appConfig === void 0 ? void 0 : appConfig.interfaceConfig;
        if (!loadedInterface) {
            return;
        }
        /** Configured values for interface object structure */
        const interfaceConfig = (_a = appConfig === null || appConfig === void 0 ? void 0 : appConfig.config) === null || _a === void 0 ? void 0 : _a.interface;
        const memoryConfig = (_b = appConfig === null || appConfig === void 0 ? void 0 : appConfig.config) === null || _b === void 0 ? void 0 : _b.memory;
        const memoryEnabled = isMemoryEnabled(memoryConfig);
        /** Check if memory is explicitly disabled */
        const isMemoryExplicitlyDisabled = memoryConfig && !memoryEnabled;
        /** Check if personalization is enabled (defaults to true if memory is configured and enabled) */
        const isPersonalizationEnabled = memoryConfig && memoryEnabled && memoryConfig.personalize !== false;
        /** Helper to get permission value with proper precedence */
        const getPermissionValue = (configValue, roleDefault, schemaDefault) => {
            if (configValue !== undefined)
                return configValue;
            if (roleDefault !== undefined)
                return roleDefault;
            return schemaDefault;
        };
        const defaults = librechatDataProvider.getConfigDefaults().interface;
        // Permission precedence order:
        // 1. Explicit user configuration (from librechat.yaml)
        // 2. Role-specific defaults (from roleDefaults)
        // 3. Interface schema defaults (from interfaceSchema.default())
        for (const roleName of [librechatDataProvider.SystemRoles.USER, librechatDataProvider.SystemRoles.ADMIN]) {
            const defaultPerms = (_c = librechatDataProvider.roleDefaults[roleName]) === null || _c === void 0 ? void 0 : _c.permissions;
            const existingRole = yield getRoleByName(roleName);
            const existingPermissions = existingRole === null || existingRole === void 0 ? void 0 : existingRole.permissions;
            const permissionsToUpdate = {};
            /**
             * Helper to add permission if it should be updated
             */
            const addPermissionIfNeeded = (permType, permissions) => {
                const permTypeExists = existingPermissions === null || existingPermissions === void 0 ? void 0 : existingPermissions[permType];
                const isExplicitlyConfigured = interfaceConfig && hasExplicitConfig(interfaceConfig, permType);
                const isMemoryDisabled = permType === librechatDataProvider.PermissionTypes.MEMORIES && isMemoryExplicitlyDisabled === true;
                // Only update if: doesn't exist OR explicitly configured
                if (!permTypeExists || isExplicitlyConfigured || isMemoryDisabled) {
                    permissionsToUpdate[permType] = permissions;
                    if (!permTypeExists) {
                        dataSchemas.logger.debug(`Role '${roleName}': Setting up default permissions for '${permType}'`);
                    }
                    else if (isExplicitlyConfigured) {
                        dataSchemas.logger.debug(`Role '${roleName}': Applying explicit config for '${permType}'`);
                    }
                    else if (isMemoryDisabled) {
                        dataSchemas.logger.debug(`Role '${roleName}': Disabling memories as it is explicitly disabled in config`);
                    }
                }
                else {
                    dataSchemas.logger.debug(`Role '${roleName}': Preserving existing permissions for '${permType}'`);
                }
            };
            const allPermissions = {
                [librechatDataProvider.PermissionTypes.PROMPTS]: {
                    [librechatDataProvider.Permissions.USE]: getPermissionValue(loadedInterface.prompts, (_d = defaultPerms[librechatDataProvider.PermissionTypes.PROMPTS]) === null || _d === void 0 ? void 0 : _d[librechatDataProvider.Permissions.USE], defaults.prompts),
                },
                [librechatDataProvider.PermissionTypes.BOOKMARKS]: {
                    [librechatDataProvider.Permissions.USE]: getPermissionValue(loadedInterface.bookmarks, (_e = defaultPerms[librechatDataProvider.PermissionTypes.BOOKMARKS]) === null || _e === void 0 ? void 0 : _e[librechatDataProvider.Permissions.USE], defaults.bookmarks),
                },
                [librechatDataProvider.PermissionTypes.MEMORIES]: Object.assign(Object.assign(Object.assign(Object.assign({ [librechatDataProvider.Permissions.USE]: isMemoryExplicitlyDisabled
                        ? false
                        : getPermissionValue(loadedInterface.memories, (_f = defaultPerms[librechatDataProvider.PermissionTypes.MEMORIES]) === null || _f === void 0 ? void 0 : _f[librechatDataProvider.Permissions.USE], defaults.memories) }, (((_g = defaultPerms[librechatDataProvider.PermissionTypes.MEMORIES]) === null || _g === void 0 ? void 0 : _g[librechatDataProvider.Permissions.CREATE]) !== undefined && {
                    [librechatDataProvider.Permissions.CREATE]: isMemoryExplicitlyDisabled
                        ? false
                        : defaultPerms[librechatDataProvider.PermissionTypes.MEMORIES][librechatDataProvider.Permissions.CREATE],
                })), (((_h = defaultPerms[librechatDataProvider.PermissionTypes.MEMORIES]) === null || _h === void 0 ? void 0 : _h[librechatDataProvider.Permissions.READ]) !== undefined && {
                    [librechatDataProvider.Permissions.READ]: isMemoryExplicitlyDisabled
                        ? false
                        : defaultPerms[librechatDataProvider.PermissionTypes.MEMORIES][librechatDataProvider.Permissions.READ],
                })), (((_j = defaultPerms[librechatDataProvider.PermissionTypes.MEMORIES]) === null || _j === void 0 ? void 0 : _j[librechatDataProvider.Permissions.UPDATE]) !== undefined && {
                    [librechatDataProvider.Permissions.UPDATE]: isMemoryExplicitlyDisabled
                        ? false
                        : defaultPerms[librechatDataProvider.PermissionTypes.MEMORIES][librechatDataProvider.Permissions.UPDATE],
                })), { [librechatDataProvider.Permissions.OPT_OUT]: isPersonalizationEnabled }),
                [librechatDataProvider.PermissionTypes.MULTI_CONVO]: {
                    [librechatDataProvider.Permissions.USE]: getPermissionValue(loadedInterface.multiConvo, (_k = defaultPerms[librechatDataProvider.PermissionTypes.MULTI_CONVO]) === null || _k === void 0 ? void 0 : _k[librechatDataProvider.Permissions.USE], defaults.multiConvo),
                },
                [librechatDataProvider.PermissionTypes.AGENTS]: {
                    [librechatDataProvider.Permissions.USE]: getPermissionValue(loadedInterface.agents, (_l = defaultPerms[librechatDataProvider.PermissionTypes.AGENTS]) === null || _l === void 0 ? void 0 : _l[librechatDataProvider.Permissions.USE], defaults.agents),
                },
                [librechatDataProvider.PermissionTypes.TEMPORARY_CHAT]: {
                    [librechatDataProvider.Permissions.USE]: getPermissionValue(loadedInterface.temporaryChat, (_m = defaultPerms[librechatDataProvider.PermissionTypes.TEMPORARY_CHAT]) === null || _m === void 0 ? void 0 : _m[librechatDataProvider.Permissions.USE], defaults.temporaryChat),
                },
                [librechatDataProvider.PermissionTypes.RUN_CODE]: {
                    [librechatDataProvider.Permissions.USE]: getPermissionValue(loadedInterface.runCode, (_o = defaultPerms[librechatDataProvider.PermissionTypes.RUN_CODE]) === null || _o === void 0 ? void 0 : _o[librechatDataProvider.Permissions.USE], defaults.runCode),
                },
                [librechatDataProvider.PermissionTypes.WEB_SEARCH]: {
                    [librechatDataProvider.Permissions.USE]: getPermissionValue(loadedInterface.webSearch, (_p = defaultPerms[librechatDataProvider.PermissionTypes.WEB_SEARCH]) === null || _p === void 0 ? void 0 : _p[librechatDataProvider.Permissions.USE], defaults.webSearch),
                },
                [librechatDataProvider.PermissionTypes.PEOPLE_PICKER]: {
                    [librechatDataProvider.Permissions.VIEW_USERS]: getPermissionValue((_q = loadedInterface.peoplePicker) === null || _q === void 0 ? void 0 : _q.users, (_r = defaultPerms[librechatDataProvider.PermissionTypes.PEOPLE_PICKER]) === null || _r === void 0 ? void 0 : _r[librechatDataProvider.Permissions.VIEW_USERS], (_s = defaults.peoplePicker) === null || _s === void 0 ? void 0 : _s.users),
                    [librechatDataProvider.Permissions.VIEW_GROUPS]: getPermissionValue((_t = loadedInterface.peoplePicker) === null || _t === void 0 ? void 0 : _t.groups, (_u = defaultPerms[librechatDataProvider.PermissionTypes.PEOPLE_PICKER]) === null || _u === void 0 ? void 0 : _u[librechatDataProvider.Permissions.VIEW_GROUPS], (_v = defaults.peoplePicker) === null || _v === void 0 ? void 0 : _v.groups),
                    [librechatDataProvider.Permissions.VIEW_ROLES]: getPermissionValue((_w = loadedInterface.peoplePicker) === null || _w === void 0 ? void 0 : _w.roles, (_x = defaultPerms[librechatDataProvider.PermissionTypes.PEOPLE_PICKER]) === null || _x === void 0 ? void 0 : _x[librechatDataProvider.Permissions.VIEW_ROLES], (_y = defaults.peoplePicker) === null || _y === void 0 ? void 0 : _y.roles),
                },
                [librechatDataProvider.PermissionTypes.MARKETPLACE]: {
                    [librechatDataProvider.Permissions.USE]: getPermissionValue((_z = loadedInterface.marketplace) === null || _z === void 0 ? void 0 : _z.use, (_0 = defaultPerms[librechatDataProvider.PermissionTypes.MARKETPLACE]) === null || _0 === void 0 ? void 0 : _0[librechatDataProvider.Permissions.USE], (_1 = defaults.marketplace) === null || _1 === void 0 ? void 0 : _1.use),
                },
                [librechatDataProvider.PermissionTypes.FILE_SEARCH]: {
                    [librechatDataProvider.Permissions.USE]: getPermissionValue(loadedInterface.fileSearch, (_2 = defaultPerms[librechatDataProvider.PermissionTypes.FILE_SEARCH]) === null || _2 === void 0 ? void 0 : _2[librechatDataProvider.Permissions.USE], defaults.fileSearch),
                },
                [librechatDataProvider.PermissionTypes.FILE_CITATIONS]: {
                    [librechatDataProvider.Permissions.USE]: getPermissionValue(loadedInterface.fileCitations, (_3 = defaultPerms[librechatDataProvider.PermissionTypes.FILE_CITATIONS]) === null || _3 === void 0 ? void 0 : _3[librechatDataProvider.Permissions.USE], defaults.fileCitations),
                },
            };
            // Check and add each permission type if needed
            for (const [permType, permissions] of Object.entries(allPermissions)) {
                addPermissionIfNeeded(permType, permissions);
            }
            // Update permissions if any need updating
            if (Object.keys(permissionsToUpdate).length > 0) {
                yield updateAccessPermissions(roleName, permissionsToUpdate, existingRole);
            }
        }
    });
}

/**
 * Finds or migrates a user for OpenID authentication
 * @returns user object (with migration fields if needed), error message, and whether migration is needed
 */
function findOpenIDUser({ openidId, email, findUser, strategyName = 'openid', }) {
    return __awaiter(this, void 0, void 0, function* () {
        let user = yield findUser({ openidId });
        if (!user && email) {
            user = yield findUser({ email });
            dataSchemas.logger.warn(`[${strategyName}] user ${user ? 'found' : 'not found'} with email: ${email} for openidId: ${openidId}`);
            // If user found by email, check if they're allowed to use OpenID provider
            if (user && user.provider && user.provider !== 'openid') {
                dataSchemas.logger.warn(`[${strategyName}] Attempted OpenID login by user ${user.email}, was registered with "${user.provider}" provider`);
                return { user: null, error: 'AUTH_FAILED', migration: false };
            }
            // If user found by email but doesn't have openidId, prepare for migration
            if (user && !user.openidId) {
                dataSchemas.logger.info(`[${strategyName}] Preparing user ${user.email} for migration to OpenID with sub: ${openidId}`);
                user.provider = 'openid';
                user.openidId = openidId;
                return { user, error: null, migration: true };
            }
        }
        return { user, error: null, migration: false };
    });
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */

var isArray$9 = Array.isArray;

var isArray_1 = isArray$9;

/** Detect free variable `global` from Node.js. */

var freeGlobal$1 = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

var _freeGlobal = freeGlobal$1;

var freeGlobal = _freeGlobal;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root$8 = freeGlobal || freeSelf || Function('return this')();

var _root = root$8;

var root$7 = _root;

/** Built-in value references. */
var Symbol$5 = root$7.Symbol;

var _Symbol = Symbol$5;

var Symbol$4 = _Symbol;

/** Used for built-in method references. */
var objectProto$d = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$a = objectProto$d.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString$1 = objectProto$d.toString;

/** Built-in value references. */
var symToStringTag$1 = Symbol$4 ? Symbol$4.toStringTag : undefined;

/**
 * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the raw `toStringTag`.
 */
function getRawTag$1(value) {
  var isOwn = hasOwnProperty$a.call(value, symToStringTag$1),
      tag = value[symToStringTag$1];

  try {
    value[symToStringTag$1] = undefined;
    var unmasked = true;
  } catch (e) {}

  var result = nativeObjectToString$1.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag$1] = tag;
    } else {
      delete value[symToStringTag$1];
    }
  }
  return result;
}

var _getRawTag = getRawTag$1;

/** Used for built-in method references. */

var objectProto$c = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString = objectProto$c.toString;

/**
 * Converts `value` to a string using `Object.prototype.toString`.
 *
 * @private
 * @param {*} value The value to convert.
 * @returns {string} Returns the converted string.
 */
function objectToString$1(value) {
  return nativeObjectToString.call(value);
}

var _objectToString = objectToString$1;

var Symbol$3 = _Symbol,
    getRawTag = _getRawTag,
    objectToString = _objectToString;

/** `Object#toString` result references. */
var nullTag = '[object Null]',
    undefinedTag = '[object Undefined]';

/** Built-in value references. */
var symToStringTag = Symbol$3 ? Symbol$3.toStringTag : undefined;

/**
 * The base implementation of `getTag` without fallbacks for buggy environments.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
function baseGetTag$5(value) {
  if (value == null) {
    return value === undefined ? undefinedTag : nullTag;
  }
  return (symToStringTag && symToStringTag in Object(value))
    ? getRawTag(value)
    : objectToString(value);
}

var _baseGetTag = baseGetTag$5;

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */

function isObjectLike$5(value) {
  return value != null && typeof value == 'object';
}

var isObjectLike_1 = isObjectLike$5;

var baseGetTag$4 = _baseGetTag,
    isObjectLike$4 = isObjectLike_1;

/** `Object#toString` result references. */
var symbolTag$1 = '[object Symbol]';

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol$3(value) {
  return typeof value == 'symbol' ||
    (isObjectLike$4(value) && baseGetTag$4(value) == symbolTag$1);
}

var isSymbol_1 = isSymbol$3;

var isArray$8 = isArray_1,
    isSymbol$2 = isSymbol_1;

/** Used to match property names within property paths. */
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
    reIsPlainProp = /^\w*$/;

/**
 * Checks if `value` is a property name and not a property path.
 *
 * @private
 * @param {*} value The value to check.
 * @param {Object} [object] The object to query keys on.
 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
 */
function isKey$3(value, object) {
  if (isArray$8(value)) {
    return false;
  }
  var type = typeof value;
  if (type == 'number' || type == 'symbol' || type == 'boolean' ||
      value == null || isSymbol$2(value)) {
    return true;
  }
  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
    (object != null && value in Object(object));
}

var _isKey = isKey$3;

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */

function isObject$5(value) {
  var type = typeof value;
  return value != null && (type == 'object' || type == 'function');
}

var isObject_1 = isObject$5;

var baseGetTag$3 = _baseGetTag,
    isObject$4 = isObject_1;

/** `Object#toString` result references. */
var asyncTag = '[object AsyncFunction]',
    funcTag$1 = '[object Function]',
    genTag = '[object GeneratorFunction]',
    proxyTag = '[object Proxy]';

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction$2(value) {
  if (!isObject$4(value)) {
    return false;
  }
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 9 which returns 'object' for typed arrays and other constructors.
  var tag = baseGetTag$3(value);
  return tag == funcTag$1 || tag == genTag || tag == asyncTag || tag == proxyTag;
}

var isFunction_1 = isFunction$2;

var root$6 = _root;

/** Used to detect overreaching core-js shims. */
var coreJsData$1 = root$6['__core-js_shared__'];

var _coreJsData = coreJsData$1;

var coreJsData = _coreJsData;

/** Used to detect methods masquerading as native. */
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
  return uid ? ('Symbol(src)_1.' + uid) : '';
}());

/**
 * Checks if `func` has its source masked.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
 */
function isMasked$1(func) {
  return !!maskSrcKey && (maskSrcKey in func);
}

var _isMasked = isMasked$1;

/** Used for built-in method references. */

var funcProto$1 = Function.prototype;

/** Used to resolve the decompiled source of functions. */
var funcToString$1 = funcProto$1.toString;

/**
 * Converts `func` to its source code.
 *
 * @private
 * @param {Function} func The function to convert.
 * @returns {string} Returns the source code.
 */
function toSource$2(func) {
  if (func != null) {
    try {
      return funcToString$1.call(func);
    } catch (e) {}
    try {
      return (func + '');
    } catch (e) {}
  }
  return '';
}

var _toSource = toSource$2;

var isFunction$1 = isFunction_1,
    isMasked = _isMasked,
    isObject$3 = isObject_1,
    toSource$1 = _toSource;

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 */
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Used for built-in method references. */
var funcProto = Function.prototype,
    objectProto$b = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty$9 = objectProto$b.hasOwnProperty;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  funcToString.call(hasOwnProperty$9).replace(reRegExpChar, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/**
 * The base implementation of `_.isNative` without bad shim checks.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function,
 *  else `false`.
 */
function baseIsNative$1(value) {
  if (!isObject$3(value) || isMasked(value)) {
    return false;
  }
  var pattern = isFunction$1(value) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource$1(value));
}

var _baseIsNative = baseIsNative$1;

/**
 * Gets the value at `key` of `object`.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {string} key The key of the property to get.
 * @returns {*} Returns the property value.
 */

function getValue$1(object, key) {
  return object == null ? undefined : object[key];
}

var _getValue = getValue$1;

var baseIsNative = _baseIsNative,
    getValue = _getValue;

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative$7(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : undefined;
}

var _getNative = getNative$7;

var getNative$6 = _getNative;

/* Built-in method references that are verified to be native. */
var nativeCreate$4 = getNative$6(Object, 'create');

var _nativeCreate = nativeCreate$4;

var nativeCreate$3 = _nativeCreate;

/**
 * Removes all key-value entries from the hash.
 *
 * @private
 * @name clear
 * @memberOf Hash
 */
function hashClear$1() {
  this.__data__ = nativeCreate$3 ? nativeCreate$3(null) : {};
  this.size = 0;
}

var _hashClear = hashClear$1;

/**
 * Removes `key` and its value from the hash.
 *
 * @private
 * @name delete
 * @memberOf Hash
 * @param {Object} hash The hash to modify.
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */

function hashDelete$1(key) {
  var result = this.has(key) && delete this.__data__[key];
  this.size -= result ? 1 : 0;
  return result;
}

var _hashDelete = hashDelete$1;

var nativeCreate$2 = _nativeCreate;

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED$2 = '__lodash_hash_undefined__';

/** Used for built-in method references. */
var objectProto$a = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$8 = objectProto$a.hasOwnProperty;

/**
 * Gets the hash value for `key`.
 *
 * @private
 * @name get
 * @memberOf Hash
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function hashGet$1(key) {
  var data = this.__data__;
  if (nativeCreate$2) {
    var result = data[key];
    return result === HASH_UNDEFINED$2 ? undefined : result;
  }
  return hasOwnProperty$8.call(data, key) ? data[key] : undefined;
}

var _hashGet = hashGet$1;

var nativeCreate$1 = _nativeCreate;

/** Used for built-in method references. */
var objectProto$9 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$7 = objectProto$9.hasOwnProperty;

/**
 * Checks if a hash value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Hash
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function hashHas$1(key) {
  var data = this.__data__;
  return nativeCreate$1 ? (data[key] !== undefined) : hasOwnProperty$7.call(data, key);
}

var _hashHas = hashHas$1;

var nativeCreate = _nativeCreate;

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED$1 = '__lodash_hash_undefined__';

/**
 * Sets the hash `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Hash
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the hash instance.
 */
function hashSet$1(key, value) {
  var data = this.__data__;
  this.size += this.has(key) ? 0 : 1;
  data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED$1 : value;
  return this;
}

var _hashSet = hashSet$1;

var hashClear = _hashClear,
    hashDelete = _hashDelete,
    hashGet = _hashGet,
    hashHas = _hashHas,
    hashSet = _hashSet;

/**
 * Creates a hash object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Hash$1(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `Hash`.
Hash$1.prototype.clear = hashClear;
Hash$1.prototype['delete'] = hashDelete;
Hash$1.prototype.get = hashGet;
Hash$1.prototype.has = hashHas;
Hash$1.prototype.set = hashSet;

var _Hash = Hash$1;

/**
 * Removes all key-value entries from the list cache.
 *
 * @private
 * @name clear
 * @memberOf ListCache
 */

function listCacheClear$1() {
  this.__data__ = [];
  this.size = 0;
}

var _listCacheClear = listCacheClear$1;

/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.eq(object, object);
 * // => true
 *
 * _.eq(object, other);
 * // => false
 *
 * _.eq('a', 'a');
 * // => true
 *
 * _.eq('a', Object('a'));
 * // => false
 *
 * _.eq(NaN, NaN);
 * // => true
 */

function eq$3(value, other) {
  return value === other || (value !== value && other !== other);
}

var eq_1 = eq$3;

var eq$2 = eq_1;

/**
 * Gets the index at which the `key` is found in `array` of key-value pairs.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} key The key to search for.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function assocIndexOf$4(array, key) {
  var length = array.length;
  while (length--) {
    if (eq$2(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}

var _assocIndexOf = assocIndexOf$4;

var assocIndexOf$3 = _assocIndexOf;

/** Used for built-in method references. */
var arrayProto = Array.prototype;

/** Built-in value references. */
var splice = arrayProto.splice;

/**
 * Removes `key` and its value from the list cache.
 *
 * @private
 * @name delete
 * @memberOf ListCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function listCacheDelete$1(key) {
  var data = this.__data__,
      index = assocIndexOf$3(data, key);

  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  --this.size;
  return true;
}

var _listCacheDelete = listCacheDelete$1;

var assocIndexOf$2 = _assocIndexOf;

/**
 * Gets the list cache value for `key`.
 *
 * @private
 * @name get
 * @memberOf ListCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function listCacheGet$1(key) {
  var data = this.__data__,
      index = assocIndexOf$2(data, key);

  return index < 0 ? undefined : data[index][1];
}

var _listCacheGet = listCacheGet$1;

var assocIndexOf$1 = _assocIndexOf;

/**
 * Checks if a list cache value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf ListCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function listCacheHas$1(key) {
  return assocIndexOf$1(this.__data__, key) > -1;
}

var _listCacheHas = listCacheHas$1;

var assocIndexOf = _assocIndexOf;

/**
 * Sets the list cache `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf ListCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the list cache instance.
 */
function listCacheSet$1(key, value) {
  var data = this.__data__,
      index = assocIndexOf(data, key);

  if (index < 0) {
    ++this.size;
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}

var _listCacheSet = listCacheSet$1;

var listCacheClear = _listCacheClear,
    listCacheDelete = _listCacheDelete,
    listCacheGet = _listCacheGet,
    listCacheHas = _listCacheHas,
    listCacheSet = _listCacheSet;

/**
 * Creates an list cache object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function ListCache$4(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `ListCache`.
ListCache$4.prototype.clear = listCacheClear;
ListCache$4.prototype['delete'] = listCacheDelete;
ListCache$4.prototype.get = listCacheGet;
ListCache$4.prototype.has = listCacheHas;
ListCache$4.prototype.set = listCacheSet;

var _ListCache = ListCache$4;

var getNative$5 = _getNative,
    root$5 = _root;

/* Built-in method references that are verified to be native. */
var Map$4 = getNative$5(root$5, 'Map');

var _Map = Map$4;

var Hash = _Hash,
    ListCache$3 = _ListCache,
    Map$3 = _Map;

/**
 * Removes all key-value entries from the map.
 *
 * @private
 * @name clear
 * @memberOf MapCache
 */
function mapCacheClear$1() {
  this.size = 0;
  this.__data__ = {
    'hash': new Hash,
    'map': new (Map$3 || ListCache$3),
    'string': new Hash
  };
}

var _mapCacheClear = mapCacheClear$1;

/**
 * Checks if `value` is suitable for use as unique object key.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
 */

function isKeyable$1(value) {
  var type = typeof value;
  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
    ? (value !== '__proto__')
    : (value === null);
}

var _isKeyable = isKeyable$1;

var isKeyable = _isKeyable;

/**
 * Gets the data for `map`.
 *
 * @private
 * @param {Object} map The map to query.
 * @param {string} key The reference key.
 * @returns {*} Returns the map data.
 */
function getMapData$4(map, key) {
  var data = map.__data__;
  return isKeyable(key)
    ? data[typeof key == 'string' ? 'string' : 'hash']
    : data.map;
}

var _getMapData = getMapData$4;

var getMapData$3 = _getMapData;

/**
 * Removes `key` and its value from the map.
 *
 * @private
 * @name delete
 * @memberOf MapCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function mapCacheDelete$1(key) {
  var result = getMapData$3(this, key)['delete'](key);
  this.size -= result ? 1 : 0;
  return result;
}

var _mapCacheDelete = mapCacheDelete$1;

var getMapData$2 = _getMapData;

/**
 * Gets the map value for `key`.
 *
 * @private
 * @name get
 * @memberOf MapCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function mapCacheGet$1(key) {
  return getMapData$2(this, key).get(key);
}

var _mapCacheGet = mapCacheGet$1;

var getMapData$1 = _getMapData;

/**
 * Checks if a map value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf MapCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function mapCacheHas$1(key) {
  return getMapData$1(this, key).has(key);
}

var _mapCacheHas = mapCacheHas$1;

var getMapData = _getMapData;

/**
 * Sets the map `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf MapCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the map cache instance.
 */
function mapCacheSet$1(key, value) {
  var data = getMapData(this, key),
      size = data.size;

  data.set(key, value);
  this.size += data.size == size ? 0 : 1;
  return this;
}

var _mapCacheSet = mapCacheSet$1;

var mapCacheClear = _mapCacheClear,
    mapCacheDelete = _mapCacheDelete,
    mapCacheGet = _mapCacheGet,
    mapCacheHas = _mapCacheHas,
    mapCacheSet = _mapCacheSet;

/**
 * Creates a map cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function MapCache$3(entries) {
  var index = -1,
      length = entries == null ? 0 : entries.length;

  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `MapCache`.
MapCache$3.prototype.clear = mapCacheClear;
MapCache$3.prototype['delete'] = mapCacheDelete;
MapCache$3.prototype.get = mapCacheGet;
MapCache$3.prototype.has = mapCacheHas;
MapCache$3.prototype.set = mapCacheSet;

var _MapCache = MapCache$3;

var MapCache$2 = _MapCache;

/** Error message constants. */
var FUNC_ERROR_TEXT = 'Expected a function';

/**
 * Creates a function that memoizes the result of `func`. If `resolver` is
 * provided, it determines the cache key for storing the result based on the
 * arguments provided to the memoized function. By default, the first argument
 * provided to the memoized function is used as the map cache key. The `func`
 * is invoked with the `this` binding of the memoized function.
 *
 * **Note:** The cache is exposed as the `cache` property on the memoized
 * function. Its creation may be customized by replacing the `_.memoize.Cache`
 * constructor with one whose instances implement the
 * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
 * method interface of `clear`, `delete`, `get`, `has`, and `set`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to have its output memoized.
 * @param {Function} [resolver] The function to resolve the cache key.
 * @returns {Function} Returns the new memoized function.
 * @example
 *
 * var object = { 'a': 1, 'b': 2 };
 * var other = { 'c': 3, 'd': 4 };
 *
 * var values = _.memoize(_.values);
 * values(object);
 * // => [1, 2]
 *
 * values(other);
 * // => [3, 4]
 *
 * object.a = 2;
 * values(object);
 * // => [1, 2]
 *
 * // Modify the result cache.
 * values.cache.set(object, ['a', 'b']);
 * values(object);
 * // => ['a', 'b']
 *
 * // Replace `_.memoize.Cache`.
 * _.memoize.Cache = WeakMap;
 */
function memoize$1(func, resolver) {
  if (typeof func != 'function' || (resolver != null && typeof resolver != 'function')) {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var memoized = function() {
    var args = arguments,
        key = resolver ? resolver.apply(this, args) : args[0],
        cache = memoized.cache;

    if (cache.has(key)) {
      return cache.get(key);
    }
    var result = func.apply(this, args);
    memoized.cache = cache.set(key, result) || cache;
    return result;
  };
  memoized.cache = new (memoize$1.Cache || MapCache$2);
  return memoized;
}

// Expose `MapCache`.
memoize$1.Cache = MapCache$2;

var memoize_1 = memoize$1;

var memoize = memoize_1;

/** Used as the maximum memoize cache size. */
var MAX_MEMOIZE_SIZE = 500;

/**
 * A specialized version of `_.memoize` which clears the memoized function's
 * cache when it exceeds `MAX_MEMOIZE_SIZE`.
 *
 * @private
 * @param {Function} func The function to have its output memoized.
 * @returns {Function} Returns the new memoized function.
 */
function memoizeCapped$1(func) {
  var result = memoize(func, function(key) {
    if (cache.size === MAX_MEMOIZE_SIZE) {
      cache.clear();
    }
    return key;
  });

  var cache = result.cache;
  return result;
}

var _memoizeCapped = memoizeCapped$1;

var memoizeCapped = _memoizeCapped;

/** Used to match property names within property paths. */
var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

/** Used to match backslashes in property paths. */
var reEscapeChar = /\\(\\)?/g;

/**
 * Converts `string` to a property path array.
 *
 * @private
 * @param {string} string The string to convert.
 * @returns {Array} Returns the property path array.
 */
var stringToPath$1 = memoizeCapped(function(string) {
  var result = [];
  if (string.charCodeAt(0) === 46 /* . */) {
    result.push('');
  }
  string.replace(rePropName, function(match, number, quote, subString) {
    result.push(quote ? subString.replace(reEscapeChar, '$1') : (number || match));
  });
  return result;
});

var _stringToPath = stringToPath$1;

/**
 * A specialized version of `_.map` for arrays without support for iteratee
 * shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the new mapped array.
 */

function arrayMap$2(array, iteratee) {
  var index = -1,
      length = array == null ? 0 : array.length,
      result = Array(length);

  while (++index < length) {
    result[index] = iteratee(array[index], index, array);
  }
  return result;
}

var _arrayMap = arrayMap$2;

var Symbol$2 = _Symbol,
    arrayMap$1 = _arrayMap,
    isArray$7 = isArray_1,
    isSymbol$1 = isSymbol_1;

/** Used to convert symbols to primitives and strings. */
var symbolProto$1 = Symbol$2 ? Symbol$2.prototype : undefined,
    symbolToString = symbolProto$1 ? symbolProto$1.toString : undefined;

/**
 * The base implementation of `_.toString` which doesn't convert nullish
 * values to empty strings.
 *
 * @private
 * @param {*} value The value to process.
 * @returns {string} Returns the string.
 */
function baseToString$1(value) {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value;
  }
  if (isArray$7(value)) {
    // Recursively convert values (susceptible to call stack limits).
    return arrayMap$1(value, baseToString$1) + '';
  }
  if (isSymbol$1(value)) {
    return symbolToString ? symbolToString.call(value) : '';
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -Infinity) ? '-0' : result;
}

var _baseToString = baseToString$1;

var baseToString = _baseToString;

/**
 * Converts `value` to a string. An empty string is returned for `null`
 * and `undefined` values. The sign of `-0` is preserved.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {string} Returns the converted string.
 * @example
 *
 * _.toString(null);
 * // => ''
 *
 * _.toString(-0);
 * // => '-0'
 *
 * _.toString([1, 2, 3]);
 * // => '1,2,3'
 */
function toString$1(value) {
  return value == null ? '' : baseToString(value);
}

var toString_1 = toString$1;

var isArray$6 = isArray_1,
    isKey$2 = _isKey,
    stringToPath = _stringToPath,
    toString = toString_1;

/**
 * Casts `value` to a path array if it's not one.
 *
 * @private
 * @param {*} value The value to inspect.
 * @param {Object} [object] The object to query keys on.
 * @returns {Array} Returns the cast property path array.
 */
function castPath$4(value, object) {
  if (isArray$6(value)) {
    return value;
  }
  return isKey$2(value, object) ? [value] : stringToPath(toString(value));
}

var _castPath = castPath$4;

var isSymbol = isSymbol_1;

/**
 * Converts `value` to a string key if it's not a string or symbol.
 *
 * @private
 * @param {*} value The value to inspect.
 * @returns {string|symbol} Returns the key.
 */
function toKey$5(value) {
  if (typeof value == 'string' || isSymbol(value)) {
    return value;
  }
  var result = (value + '');
  return (result == '0' && (1 / value) == -Infinity) ? '-0' : result;
}

var _toKey = toKey$5;

var castPath$3 = _castPath,
    toKey$4 = _toKey;

/**
 * The base implementation of `_.get` without support for default values.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array|string} path The path of the property to get.
 * @returns {*} Returns the resolved value.
 */
function baseGet$3(object, path) {
  path = castPath$3(path, object);

  var index = 0,
      length = path.length;

  while (object != null && index < length) {
    object = object[toKey$4(path[index++])];
  }
  return (index && index == length) ? object : undefined;
}

var _baseGet = baseGet$3;

var getNative$4 = _getNative;

var defineProperty$2 = (function() {
  try {
    var func = getNative$4(Object, 'defineProperty');
    func({}, '', {});
    return func;
  } catch (e) {}
}());

var _defineProperty = defineProperty$2;

var defineProperty$1 = _defineProperty;

/**
 * The base implementation of `assignValue` and `assignMergeValue` without
 * value checks.
 *
 * @private
 * @param {Object} object The object to modify.
 * @param {string} key The key of the property to assign.
 * @param {*} value The value to assign.
 */
function baseAssignValue$2(object, key, value) {
  if (key == '__proto__' && defineProperty$1) {
    defineProperty$1(object, key, {
      'configurable': true,
      'enumerable': true,
      'value': value,
      'writable': true
    });
  } else {
    object[key] = value;
  }
}

var _baseAssignValue = baseAssignValue$2;

var baseAssignValue$1 = _baseAssignValue,
    eq$1 = eq_1;

/** Used for built-in method references. */
var objectProto$8 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$6 = objectProto$8.hasOwnProperty;

/**
 * Assigns `value` to `key` of `object` if the existing value is not equivalent
 * using [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * for equality comparisons.
 *
 * @private
 * @param {Object} object The object to modify.
 * @param {string} key The key of the property to assign.
 * @param {*} value The value to assign.
 */
function assignValue$1(object, key, value) {
  var objValue = object[key];
  if (!(hasOwnProperty$6.call(object, key) && eq$1(objValue, value)) ||
      (value === undefined && !(key in object))) {
    baseAssignValue$1(object, key, value);
  }
}

var _assignValue = assignValue$1;

/** Used as references for various `Number` constants. */

var MAX_SAFE_INTEGER$1 = 9007199254740991;

/** Used to detect unsigned integer values. */
var reIsUint = /^(?:0|[1-9]\d*)$/;

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex$3(value, length) {
  var type = typeof value;
  length = length == null ? MAX_SAFE_INTEGER$1 : length;

  return !!length &&
    (type == 'number' ||
      (type != 'symbol' && reIsUint.test(value))) &&
        (value > -1 && value % 1 == 0 && value < length);
}

var _isIndex = isIndex$3;

var assignValue = _assignValue,
    castPath$2 = _castPath,
    isIndex$2 = _isIndex,
    isObject$2 = isObject_1,
    toKey$3 = _toKey;

/**
 * The base implementation of `_.set`.
 *
 * @private
 * @param {Object} object The object to modify.
 * @param {Array|string} path The path of the property to set.
 * @param {*} value The value to set.
 * @param {Function} [customizer] The function to customize path creation.
 * @returns {Object} Returns `object`.
 */
function baseSet$1(object, path, value, customizer) {
  if (!isObject$2(object)) {
    return object;
  }
  path = castPath$2(path, object);

  var index = -1,
      length = path.length,
      lastIndex = length - 1,
      nested = object;

  while (nested != null && ++index < length) {
    var key = toKey$3(path[index]),
        newValue = value;

    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return object;
    }

    if (index != lastIndex) {
      var objValue = nested[key];
      newValue = customizer ? customizer(objValue, key, nested) : undefined;
      if (newValue === undefined) {
        newValue = isObject$2(objValue)
          ? objValue
          : (isIndex$2(path[index + 1]) ? [] : {});
      }
    }
    assignValue(nested, key, newValue);
    nested = nested[key];
  }
  return object;
}

var _baseSet = baseSet$1;

var baseGet$2 = _baseGet,
    baseSet = _baseSet,
    castPath$1 = _castPath;

/**
 * The base implementation of  `_.pickBy` without support for iteratee shorthands.
 *
 * @private
 * @param {Object} object The source object.
 * @param {string[]} paths The property paths to pick.
 * @param {Function} predicate The function invoked per property.
 * @returns {Object} Returns the new object.
 */
function basePickBy$2(object, paths, predicate) {
  var index = -1,
      length = paths.length,
      result = {};

  while (++index < length) {
    var path = paths[index],
        value = baseGet$2(object, path);

    if (predicate(value, path)) {
      baseSet(result, castPath$1(path, object), value);
    }
  }
  return result;
}

var _basePickBy = basePickBy$2;

/**
 * The base implementation of `_.hasIn` without support for deep paths.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {Array|string} key The key to check.
 * @returns {boolean} Returns `true` if `key` exists, else `false`.
 */

function baseHasIn$1(object, key) {
  return object != null && key in Object(object);
}

var _baseHasIn = baseHasIn$1;

var baseGetTag$2 = _baseGetTag,
    isObjectLike$3 = isObjectLike_1;

/** `Object#toString` result references. */
var argsTag$2 = '[object Arguments]';

/**
 * The base implementation of `_.isArguments`.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 */
function baseIsArguments$1(value) {
  return isObjectLike$3(value) && baseGetTag$2(value) == argsTag$2;
}

var _baseIsArguments = baseIsArguments$1;

var baseIsArguments = _baseIsArguments,
    isObjectLike$2 = isObjectLike_1;

/** Used for built-in method references. */
var objectProto$7 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$5 = objectProto$7.hasOwnProperty;

/** Built-in value references. */
var propertyIsEnumerable$1 = objectProto$7.propertyIsEnumerable;

/**
 * Checks if `value` is likely an `arguments` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 *  else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
var isArguments$3 = baseIsArguments(function() { return arguments; }()) ? baseIsArguments : function(value) {
  return isObjectLike$2(value) && hasOwnProperty$5.call(value, 'callee') &&
    !propertyIsEnumerable$1.call(value, 'callee');
};

var isArguments_1 = isArguments$3;

/** Used as references for various `Number` constants. */

var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This method is loosely based on
 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 * @example
 *
 * _.isLength(3);
 * // => true
 *
 * _.isLength(Number.MIN_VALUE);
 * // => false
 *
 * _.isLength(Infinity);
 * // => false
 *
 * _.isLength('3');
 * // => false
 */
function isLength$3(value) {
  return typeof value == 'number' &&
    value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

var isLength_1 = isLength$3;

var castPath = _castPath,
    isArguments$2 = isArguments_1,
    isArray$5 = isArray_1,
    isIndex$1 = _isIndex,
    isLength$2 = isLength_1,
    toKey$2 = _toKey;

/**
 * Checks if `path` exists on `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Array|string} path The path to check.
 * @param {Function} hasFunc The function to check properties.
 * @returns {boolean} Returns `true` if `path` exists, else `false`.
 */
function hasPath$1(object, path, hasFunc) {
  path = castPath(path, object);

  var index = -1,
      length = path.length,
      result = false;

  while (++index < length) {
    var key = toKey$2(path[index]);
    if (!(result = object != null && hasFunc(object, key))) {
      break;
    }
    object = object[key];
  }
  if (result || ++index != length) {
    return result;
  }
  length = object == null ? 0 : object.length;
  return !!length && isLength$2(length) && isIndex$1(key, length) &&
    (isArray$5(object) || isArguments$2(object));
}

var _hasPath = hasPath$1;

var baseHasIn = _baseHasIn,
    hasPath = _hasPath;

/**
 * Checks if `path` is a direct or inherited property of `object`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Object
 * @param {Object} object The object to query.
 * @param {Array|string} path The path to check.
 * @returns {boolean} Returns `true` if `path` exists, else `false`.
 * @example
 *
 * var object = _.create({ 'a': _.create({ 'b': 2 }) });
 *
 * _.hasIn(object, 'a');
 * // => true
 *
 * _.hasIn(object, 'a.b');
 * // => true
 *
 * _.hasIn(object, ['a', 'b']);
 * // => true
 *
 * _.hasIn(object, 'b');
 * // => false
 */
function hasIn$2(object, path) {
  return object != null && hasPath(object, path, baseHasIn);
}

var hasIn_1 = hasIn$2;

var basePickBy$1 = _basePickBy,
    hasIn$1 = hasIn_1;

/**
 * The base implementation of `_.pick` without support for individual
 * property identifiers.
 *
 * @private
 * @param {Object} object The source object.
 * @param {string[]} paths The property paths to pick.
 * @returns {Object} Returns the new object.
 */
function basePick$1(object, paths) {
  return basePickBy$1(object, paths, function(value, path) {
    return hasIn$1(object, path);
  });
}

var _basePick = basePick$1;

/**
 * Appends the elements of `values` to `array`.
 *
 * @private
 * @param {Array} array The array to modify.
 * @param {Array} values The values to append.
 * @returns {Array} Returns `array`.
 */

function arrayPush$3(array, values) {
  var index = -1,
      length = values.length,
      offset = array.length;

  while (++index < length) {
    array[offset + index] = values[index];
  }
  return array;
}

var _arrayPush = arrayPush$3;

var Symbol$1 = _Symbol,
    isArguments$1 = isArguments_1,
    isArray$4 = isArray_1;

/** Built-in value references. */
var spreadableSymbol = Symbol$1 ? Symbol$1.isConcatSpreadable : undefined;

/**
 * Checks if `value` is a flattenable `arguments` object or array.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is flattenable, else `false`.
 */
function isFlattenable$1(value) {
  return isArray$4(value) || isArguments$1(value) ||
    !!(spreadableSymbol && value && value[spreadableSymbol]);
}

var _isFlattenable = isFlattenable$1;

var arrayPush$2 = _arrayPush,
    isFlattenable = _isFlattenable;

/**
 * The base implementation of `_.flatten` with support for restricting flattening.
 *
 * @private
 * @param {Array} array The array to flatten.
 * @param {number} depth The maximum recursion depth.
 * @param {boolean} [predicate=isFlattenable] The function invoked per iteration.
 * @param {boolean} [isStrict] Restrict to values that pass `predicate` checks.
 * @param {Array} [result=[]] The initial result value.
 * @returns {Array} Returns the new flattened array.
 */
function baseFlatten$1(array, depth, predicate, isStrict, result) {
  var index = -1,
      length = array.length;

  predicate || (predicate = isFlattenable);
  result || (result = []);

  while (++index < length) {
    var value = array[index];
    if (depth > 0 && predicate(value)) {
      if (depth > 1) {
        // Recursively flatten arrays (susceptible to call stack limits).
        baseFlatten$1(value, depth - 1, predicate, isStrict, result);
      } else {
        arrayPush$2(result, value);
      }
    } else if (!isStrict) {
      result[result.length] = value;
    }
  }
  return result;
}

var _baseFlatten = baseFlatten$1;

var baseFlatten = _baseFlatten;

/**
 * Flattens `array` a single level deep.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Array
 * @param {Array} array The array to flatten.
 * @returns {Array} Returns the new flattened array.
 * @example
 *
 * _.flatten([1, [2, [3, [4]], 5]]);
 * // => [1, 2, [3, [4]], 5]
 */
function flatten$1(array) {
  var length = array == null ? 0 : array.length;
  return length ? baseFlatten(array, 1) : [];
}

var flatten_1 = flatten$1;

/**
 * A faster alternative to `Function#apply`, this function invokes `func`
 * with the `this` binding of `thisArg` and the arguments of `args`.
 *
 * @private
 * @param {Function} func The function to invoke.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {Array} args The arguments to invoke `func` with.
 * @returns {*} Returns the result of `func`.
 */

function apply$1(func, thisArg, args) {
  switch (args.length) {
    case 0: return func.call(thisArg);
    case 1: return func.call(thisArg, args[0]);
    case 2: return func.call(thisArg, args[0], args[1]);
    case 3: return func.call(thisArg, args[0], args[1], args[2]);
  }
  return func.apply(thisArg, args);
}

var _apply = apply$1;

var apply = _apply;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max;

/**
 * A specialized version of `baseRest` which transforms the rest array.
 *
 * @private
 * @param {Function} func The function to apply a rest parameter to.
 * @param {number} [start=func.length-1] The start position of the rest parameter.
 * @param {Function} transform The rest array transform.
 * @returns {Function} Returns the new function.
 */
function overRest$1(func, start, transform) {
  start = nativeMax(start === undefined ? (func.length - 1) : start, 0);
  return function() {
    var args = arguments,
        index = -1,
        length = nativeMax(args.length - start, 0),
        array = Array(length);

    while (++index < length) {
      array[index] = args[start + index];
    }
    index = -1;
    var otherArgs = Array(start + 1);
    while (++index < start) {
      otherArgs[index] = args[index];
    }
    otherArgs[start] = transform(array);
    return apply(func, this, otherArgs);
  };
}

var _overRest = overRest$1;

/**
 * Creates a function that returns `value`.
 *
 * @static
 * @memberOf _
 * @since 2.4.0
 * @category Util
 * @param {*} value The value to return from the new function.
 * @returns {Function} Returns the new constant function.
 * @example
 *
 * var objects = _.times(2, _.constant({ 'a': 1 }));
 *
 * console.log(objects);
 * // => [{ 'a': 1 }, { 'a': 1 }]
 *
 * console.log(objects[0] === objects[1]);
 * // => true
 */

function constant$1(value) {
  return function() {
    return value;
  };
}

var constant_1 = constant$1;

/**
 * This method returns the first argument it receives.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Util
 * @param {*} value Any value.
 * @returns {*} Returns `value`.
 * @example
 *
 * var object = { 'a': 1 };
 *
 * console.log(_.identity(object) === object);
 * // => true
 */

function identity$2(value) {
  return value;
}

var identity_1 = identity$2;

var constant = constant_1,
    defineProperty = _defineProperty,
    identity$1 = identity_1;

/**
 * The base implementation of `setToString` without support for hot loop shorting.
 *
 * @private
 * @param {Function} func The function to modify.
 * @param {Function} string The `toString` result.
 * @returns {Function} Returns `func`.
 */
var baseSetToString$1 = !defineProperty ? identity$1 : function(func, string) {
  return defineProperty(func, 'toString', {
    'configurable': true,
    'enumerable': false,
    'value': constant(string),
    'writable': true
  });
};

var _baseSetToString = baseSetToString$1;

/** Used to detect hot functions by number of calls within a span of milliseconds. */

var HOT_COUNT = 800,
    HOT_SPAN = 16;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeNow = Date.now;

/**
 * Creates a function that'll short out and invoke `identity` instead
 * of `func` when it's called `HOT_COUNT` or more times in `HOT_SPAN`
 * milliseconds.
 *
 * @private
 * @param {Function} func The function to restrict.
 * @returns {Function} Returns the new shortable function.
 */
function shortOut$1(func) {
  var count = 0,
      lastCalled = 0;

  return function() {
    var stamp = nativeNow(),
        remaining = HOT_SPAN - (stamp - lastCalled);

    lastCalled = stamp;
    if (remaining > 0) {
      if (++count >= HOT_COUNT) {
        return arguments[0];
      }
    } else {
      count = 0;
    }
    return func.apply(undefined, arguments);
  };
}

var _shortOut = shortOut$1;

var baseSetToString = _baseSetToString,
    shortOut = _shortOut;

/**
 * Sets the `toString` method of `func` to return `string`.
 *
 * @private
 * @param {Function} func The function to modify.
 * @param {Function} string The `toString` result.
 * @returns {Function} Returns `func`.
 */
var setToString$1 = shortOut(baseSetToString);

var _setToString = setToString$1;

var flatten = flatten_1,
    overRest = _overRest,
    setToString = _setToString;

/**
 * A specialized version of `baseRest` which flattens the rest array.
 *
 * @private
 * @param {Function} func The function to apply a rest parameter to.
 * @returns {Function} Returns the new function.
 */
function flatRest$1(func) {
  return setToString(overRest(func, undefined, flatten), func + '');
}

var _flatRest = flatRest$1;

var basePick = _basePick,
    flatRest = _flatRest;

/**
 * Creates an object composed of the picked `object` properties.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Object
 * @param {Object} object The source object.
 * @param {...(string|string[])} [paths] The property paths to pick.
 * @returns {Object} Returns the new object.
 * @example
 *
 * var object = { 'a': 1, 'b': '2', 'c': 3 };
 *
 * _.pick(object, ['a', 'c']);
 * // => { 'a': 1, 'c': 3 }
 */
var pick = flatRest(function(object, paths) {
  return object == null ? {} : basePick(object, paths);
});

var pick_1 = pick;

var pick$1 = /*@__PURE__*/getDefaultExportFromCjs(pick_1);

class MCPOAuthHandler {
    /**
     * Discovers OAuth metadata from the server
     */
    static discoverMetadata(serverUrl) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            dataSchemas.logger.debug(`[MCPOAuth] discoverMetadata called with serverUrl: ${serverUrl}`);
            let authServerUrl = new URL(serverUrl);
            let resourceMetadata;
            try {
                // Try to discover resource metadata first
                dataSchemas.logger.debug(`[MCPOAuth] Attempting to discover protected resource metadata from ${serverUrl}`);
                resourceMetadata = yield auth_js.discoverOAuthProtectedResourceMetadata(serverUrl);
                if ((_a = resourceMetadata === null || resourceMetadata === void 0 ? void 0 : resourceMetadata.authorization_servers) === null || _a === void 0 ? void 0 : _a.length) {
                    authServerUrl = new URL(resourceMetadata.authorization_servers[0]);
                    dataSchemas.logger.debug(`[MCPOAuth] Found authorization server from resource metadata: ${authServerUrl}`);
                }
                else {
                    dataSchemas.logger.debug(`[MCPOAuth] No authorization servers found in resource metadata`);
                }
            }
            catch (error) {
                dataSchemas.logger.debug('[MCPOAuth] Resource metadata discovery failed, continuing with server URL', {
                    error,
                });
            }
            // Discover OAuth metadata
            dataSchemas.logger.debug(`[MCPOAuth] Discovering OAuth metadata from ${authServerUrl}`);
            const rawMetadata = yield auth_js.discoverAuthorizationServerMetadata(authServerUrl);
            if (!rawMetadata) {
                dataSchemas.logger.error(`[MCPOAuth] Failed to discover OAuth metadata from ${authServerUrl}`);
                throw new Error('Failed to discover OAuth metadata');
            }
            dataSchemas.logger.debug(`[MCPOAuth] OAuth metadata discovered successfully`);
            const metadata = yield auth_js$1.OAuthMetadataSchema.parseAsync(rawMetadata);
            dataSchemas.logger.debug(`[MCPOAuth] OAuth metadata parsed successfully`);
            return {
                metadata: metadata,
                resourceMetadata,
                authServerUrl,
            };
        });
    }
    /**
     * Registers an OAuth client dynamically
     */
    static registerOAuthClient(serverUrl, metadata, resourceMetadata, redirectUri) {
        return __awaiter(this, void 0, void 0, function* () {
            dataSchemas.logger.debug(`[MCPOAuth] Starting client registration for ${serverUrl}, server metadata:`, {
                grant_types_supported: metadata.grant_types_supported,
                response_types_supported: metadata.response_types_supported,
                token_endpoint_auth_methods_supported: metadata.token_endpoint_auth_methods_supported,
                scopes_supported: metadata.scopes_supported,
            });
            /** Client metadata based on what the server supports */
            const clientMetadata = {
                client_name: 'LibreChat MCP Client',
                redirect_uris: [redirectUri || this.getDefaultRedirectUri()],
                grant_types: ['authorization_code'],
                response_types: ['code'],
                token_endpoint_auth_method: 'client_secret_basic',
                scope: undefined,
            };
            const supportedGrantTypes = metadata.grant_types_supported || ['authorization_code'];
            const requestedGrantTypes = ['authorization_code'];
            if (supportedGrantTypes.includes('refresh_token')) {
                requestedGrantTypes.push('refresh_token');
                dataSchemas.logger.debug(`[MCPOAuth] Server ${serverUrl} supports \`refresh_token\` grant type, adding to request`);
            }
            else {
                dataSchemas.logger.debug(`[MCPOAuth] Server ${serverUrl} does not support \`refresh_token\` grant type`);
            }
            clientMetadata.grant_types = requestedGrantTypes;
            clientMetadata.response_types = metadata.response_types_supported || ['code'];
            if (metadata.token_endpoint_auth_methods_supported) {
                // Prefer client_secret_basic if supported, otherwise use the first supported method
                if (metadata.token_endpoint_auth_methods_supported.includes('client_secret_basic')) {
                    clientMetadata.token_endpoint_auth_method = 'client_secret_basic';
                }
                else if (metadata.token_endpoint_auth_methods_supported.includes('client_secret_post')) {
                    clientMetadata.token_endpoint_auth_method = 'client_secret_post';
                }
                else if (metadata.token_endpoint_auth_methods_supported.includes('none')) {
                    clientMetadata.token_endpoint_auth_method = 'none';
                }
                else {
                    clientMetadata.token_endpoint_auth_method =
                        metadata.token_endpoint_auth_methods_supported[0];
                }
            }
            const availableScopes = (resourceMetadata === null || resourceMetadata === void 0 ? void 0 : resourceMetadata.scopes_supported) || metadata.scopes_supported;
            if (availableScopes) {
                clientMetadata.scope = availableScopes.join(' ');
            }
            dataSchemas.logger.debug(`[MCPOAuth] Registering client for ${serverUrl} with metadata:`, clientMetadata);
            const clientInfo = yield auth_js.registerClient(serverUrl, {
                metadata: metadata,
                clientMetadata,
            });
            dataSchemas.logger.debug(`[MCPOAuth] Client registered successfully for ${serverUrl}:`, {
                client_id: clientInfo.client_id,
                has_client_secret: !!clientInfo.client_secret,
                grant_types: clientInfo.grant_types,
                scope: clientInfo.scope,
            });
            return clientInfo;
        });
    }
    /**
     * Initiates the OAuth flow for an MCP server
     */
    static initiateOAuthFlow(serverName, serverUrl, userId, config) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        return __awaiter(this, void 0, void 0, function* () {
            dataSchemas.logger.debug(`[MCPOAuth] initiateOAuthFlow called for ${serverName} with URL: ${serverUrl}`);
            const flowId = this.generateFlowId(userId, serverName);
            const state = this.generateState();
            dataSchemas.logger.debug(`[MCPOAuth] Generated flowId: ${flowId}, state: ${state}`);
            try {
                // Check if we have pre-configured OAuth settings
                if ((config === null || config === void 0 ? void 0 : config.authorization_url) && (config === null || config === void 0 ? void 0 : config.token_url) && (config === null || config === void 0 ? void 0 : config.client_id)) {
                    dataSchemas.logger.debug(`[MCPOAuth] Using pre-configured OAuth settings for ${serverName}`);
                    /** Metadata based on pre-configured settings */
                    const metadata = {
                        authorization_endpoint: config.authorization_url,
                        token_endpoint: config.token_url,
                        issuer: serverUrl,
                        scopes_supported: (_b = (_a = config.scope) === null || _a === void 0 ? void 0 : _a.split(' ')) !== null && _b !== void 0 ? _b : [],
                        grant_types_supported: (_c = config === null || config === void 0 ? void 0 : config.grant_types_supported) !== null && _c !== void 0 ? _c : [
                            'authorization_code',
                            'refresh_token',
                        ],
                        token_endpoint_auth_methods_supported: (_d = config === null || config === void 0 ? void 0 : config.token_endpoint_auth_methods_supported) !== null && _d !== void 0 ? _d : [
                            'client_secret_basic',
                            'client_secret_post',
                        ],
                        response_types_supported: (_e = config === null || config === void 0 ? void 0 : config.response_types_supported) !== null && _e !== void 0 ? _e : ['code'],
                        code_challenge_methods_supported: (_f = config === null || config === void 0 ? void 0 : config.code_challenge_methods_supported) !== null && _f !== void 0 ? _f : [
                            'S256',
                            'plain',
                        ],
                    };
                    dataSchemas.logger.debug(`[MCPOAuth] metadata for "${serverName}": ${JSON.stringify(metadata)}`);
                    const clientInfo = {
                        client_id: config.client_id,
                        client_secret: config.client_secret,
                        redirect_uris: [config.redirect_uri || this.getDefaultRedirectUri(serverName)],
                        scope: config.scope,
                    };
                    dataSchemas.logger.debug(`[MCPOAuth] Starting authorization with pre-configured settings`);
                    const { authorizationUrl, codeVerifier } = yield auth_js.startAuthorization(serverUrl, {
                        metadata: metadata,
                        clientInformation: clientInfo,
                        redirectUrl: ((_g = clientInfo.redirect_uris) === null || _g === void 0 ? void 0 : _g[0]) || this.getDefaultRedirectUri(serverName),
                        scope: config.scope,
                    });
                    /** Add state parameter with flowId to the authorization URL */
                    authorizationUrl.searchParams.set('state', flowId);
                    dataSchemas.logger.debug(`[MCPOAuth] Added state parameter to authorization URL`);
                    const flowMetadata = {
                        serverName,
                        userId,
                        serverUrl,
                        state,
                        codeVerifier,
                        clientInfo,
                        metadata,
                    };
                    dataSchemas.logger.debug(`[MCPOAuth] Authorization URL generated: ${authorizationUrl.toString()}`);
                    return {
                        authorizationUrl: authorizationUrl.toString(),
                        flowId,
                        flowMetadata,
                    };
                }
                dataSchemas.logger.debug(`[MCPOAuth] Starting auto-discovery of OAuth metadata from ${serverUrl}`);
                const { metadata, resourceMetadata, authServerUrl } = yield this.discoverMetadata(serverUrl);
                dataSchemas.logger.debug(`[MCPOAuth] OAuth metadata discovered, auth server URL: ${authServerUrl}`);
                /** Dynamic client registration based on the discovered metadata */
                const redirectUri = (config === null || config === void 0 ? void 0 : config.redirect_uri) || this.getDefaultRedirectUri(serverName);
                dataSchemas.logger.debug(`[MCPOAuth] Registering OAuth client with redirect URI: ${redirectUri}`);
                const clientInfo = yield this.registerOAuthClient(authServerUrl.toString(), metadata, resourceMetadata, redirectUri);
                dataSchemas.logger.debug(`[MCPOAuth] Client registered with ID: ${clientInfo.client_id}`);
                /** Authorization Scope */
                const scope = (config === null || config === void 0 ? void 0 : config.scope) ||
                    ((_h = resourceMetadata === null || resourceMetadata === void 0 ? void 0 : resourceMetadata.scopes_supported) === null || _h === void 0 ? void 0 : _h.join(' ')) ||
                    ((_j = metadata.scopes_supported) === null || _j === void 0 ? void 0 : _j.join(' '));
                dataSchemas.logger.debug(`[MCPOAuth] Starting authorization with scope: ${scope}`);
                let authorizationUrl;
                let codeVerifier;
                try {
                    dataSchemas.logger.debug(`[MCPOAuth] Calling startAuthorization...`);
                    const authResult = yield auth_js.startAuthorization(serverUrl, {
                        metadata: metadata,
                        clientInformation: clientInfo,
                        redirectUrl: redirectUri,
                        scope,
                    });
                    authorizationUrl = authResult.authorizationUrl;
                    codeVerifier = authResult.codeVerifier;
                    dataSchemas.logger.debug(`[MCPOAuth] startAuthorization completed successfully`);
                    dataSchemas.logger.debug(`[MCPOAuth] Authorization URL: ${authorizationUrl.toString()}`);
                    /** Add state parameter with flowId to the authorization URL */
                    authorizationUrl.searchParams.set('state', flowId);
                    dataSchemas.logger.debug(`[MCPOAuth] Added state parameter to authorization URL`);
                    if ((resourceMetadata === null || resourceMetadata === void 0 ? void 0 : resourceMetadata.resource) != null && resourceMetadata.resource) {
                        authorizationUrl.searchParams.set('resource', resourceMetadata.resource);
                        dataSchemas.logger.debug(`[MCPOAuth] Added resource parameter to authorization URL: ${resourceMetadata.resource}`);
                    }
                    else {
                        dataSchemas.logger.warn(`[MCPOAuth] Resource metadata missing 'resource' property for ${serverName}. ` +
                            'This can cause issues with some Authorization Servers who expect a "resource" parameter.');
                    }
                }
                catch (error) {
                    dataSchemas.logger.error(`[MCPOAuth] startAuthorization failed:`, error);
                    throw error;
                }
                const flowMetadata = {
                    serverName,
                    userId,
                    serverUrl,
                    state,
                    codeVerifier,
                    clientInfo,
                    metadata,
                    resourceMetadata,
                };
                dataSchemas.logger.debug(`[MCPOAuth] Authorization URL generated for ${serverName}: ${authorizationUrl.toString()}`);
                const result = {
                    authorizationUrl: authorizationUrl.toString(),
                    flowId,
                    flowMetadata,
                };
                dataSchemas.logger.debug(`[MCPOAuth] Returning from initiateOAuthFlow with result ${flowId} for ${serverName}`, result);
                return result;
            }
            catch (error) {
                dataSchemas.logger.error('[MCPOAuth] Failed to initiate OAuth flow', { error, serverName, userId });
                throw error;
            }
        });
    }
    /**
     * Completes the OAuth flow by exchanging the authorization code for tokens
     */
    static completeOAuthFlow(flowId, authorizationCode, flowManager) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                /** Flow state which contains our metadata */
                const flowState = yield flowManager.getFlowState(flowId, this.FLOW_TYPE);
                if (!flowState) {
                    throw new Error('OAuth flow not found');
                }
                const flowMetadata = flowState.metadata;
                if (!flowMetadata) {
                    throw new Error('OAuth flow metadata not found');
                }
                const metadata = flowMetadata;
                if (!metadata.metadata || !metadata.clientInfo || !metadata.codeVerifier) {
                    throw new Error('Invalid flow metadata');
                }
                let resource;
                try {
                    if (((_a = metadata.resourceMetadata) === null || _a === void 0 ? void 0 : _a.resource) != null && metadata.resourceMetadata.resource) {
                        resource = new URL(metadata.resourceMetadata.resource);
                        dataSchemas.logger.debug(`[MCPOAuth] Resource URL for flow ${flowId}: ${resource.toString()}`);
                    }
                }
                catch (error) {
                    dataSchemas.logger.warn(`[MCPOAuth] Invalid resource URL format for flow ${flowId}: '${metadata.resourceMetadata.resource}'. ` +
                        `Error: ${error instanceof Error ? error.message : 'Unknown error'}. Proceeding without resource parameter.`);
                    resource = undefined;
                }
                const tokens = yield auth_js.exchangeAuthorization(metadata.serverUrl, {
                    redirectUri: ((_b = metadata.clientInfo.redirect_uris) === null || _b === void 0 ? void 0 : _b[0]) || this.getDefaultRedirectUri(),
                    metadata: metadata.metadata,
                    clientInformation: metadata.clientInfo,
                    codeVerifier: metadata.codeVerifier,
                    authorizationCode,
                    resource,
                });
                dataSchemas.logger.debug('[MCPOAuth] Raw tokens from exchange:', {
                    access_token: tokens.access_token ? '[REDACTED]' : undefined,
                    refresh_token: tokens.refresh_token ? '[REDACTED]' : undefined,
                    expires_in: tokens.expires_in,
                    token_type: tokens.token_type,
                    scope: tokens.scope,
                });
                const mcpTokens = Object.assign(Object.assign({}, tokens), { obtained_at: Date.now(), expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined });
                /** Now complete the flow with the tokens */
                yield flowManager.completeFlow(flowId, this.FLOW_TYPE, mcpTokens);
                return mcpTokens;
            }
            catch (error) {
                dataSchemas.logger.error('[MCPOAuth] Failed to complete OAuth flow', { error, flowId });
                yield flowManager.failFlow(flowId, this.FLOW_TYPE, error);
                throw error;
            }
        });
    }
    /**
     * Gets the OAuth flow metadata
     */
    static getFlowState(flowId, flowManager) {
        return __awaiter(this, void 0, void 0, function* () {
            const flowState = yield flowManager.getFlowState(flowId, this.FLOW_TYPE);
            if (!flowState) {
                return null;
            }
            return flowState.metadata;
        });
    }
    /**
     * Generates a flow ID for the OAuth flow
     * @returns Consistent ID so concurrent requests share the same flow
     */
    static generateFlowId(userId, serverName) {
        return `${userId}:${serverName}`;
    }
    /**
     * Generates a secure state parameter
     */
    static generateState() {
        return require$$3.randomBytes(32).toString('base64url');
    }
    /**
     * Gets the default redirect URI for a server
     */
    static getDefaultRedirectUri(serverName) {
        const baseUrl = process.env.DOMAIN_SERVER || 'http://localhost:3080';
        return serverName
            ? `${baseUrl}/api/mcp/${serverName}/oauth/callback`
            : `${baseUrl}/api/mcp/oauth/callback`;
    }
    /**
     * Refreshes OAuth tokens using a refresh token
     */
    static refreshOAuthTokens(refreshToken, metadata, config) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            dataSchemas.logger.debug(`[MCPOAuth] Refreshing tokens for ${metadata.serverName}`);
            try {
                /** If we have stored client information from the original flow, use that first */
                if ((_a = metadata.clientInfo) === null || _a === void 0 ? void 0 : _a.client_id) {
                    dataSchemas.logger.debug(`[MCPOAuth] Using stored client information for token refresh for ${metadata.serverName}`);
                    dataSchemas.logger.debug(`[MCPOAuth] Client ID: ${metadata.clientInfo.client_id} for ${metadata.serverName}`);
                    dataSchemas.logger.debug(`[MCPOAuth] Has client secret: ${!!metadata.clientInfo.client_secret} for ${metadata.serverName}`);
                    dataSchemas.logger.debug(`[MCPOAuth] Stored client info for ${metadata.serverName}:`, {
                        client_id: metadata.clientInfo.client_id,
                        has_client_secret: !!metadata.clientInfo.client_secret,
                        grant_types: metadata.clientInfo.grant_types,
                        scope: metadata.clientInfo.scope,
                    });
                    /** Use the stored client information and metadata to determine the token URL */
                    let tokenUrl;
                    if (config === null || config === void 0 ? void 0 : config.token_url) {
                        tokenUrl = config.token_url;
                    }
                    else if (!metadata.serverUrl) {
                        throw new Error('No token URL available for refresh');
                    }
                    else {
                        /** Auto-discover OAuth configuration for refresh */
                        const oauthMetadata = yield auth_js.discoverAuthorizationServerMetadata(metadata.serverUrl);
                        if (!oauthMetadata) {
                            throw new Error('Failed to discover OAuth metadata for token refresh');
                        }
                        if (!oauthMetadata.token_endpoint) {
                            throw new Error('No token endpoint found in OAuth metadata');
                        }
                        tokenUrl = oauthMetadata.token_endpoint;
                    }
                    const body = new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: refreshToken,
                    });
                    /** Add scope if available */
                    if (metadata.clientInfo.scope) {
                        body.append('scope', metadata.clientInfo.scope);
                    }
                    const headers = {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                    };
                    /** Use client_secret for authentication if available */
                    if (metadata.clientInfo.client_secret) {
                        const clientAuth = Buffer.from(`${metadata.clientInfo.client_id}:${metadata.clientInfo.client_secret}`).toString('base64');
                        headers['Authorization'] = `Basic ${clientAuth}`;
                    }
                    else {
                        /** For public clients, client_id must be in the body */
                        body.append('client_id', metadata.clientInfo.client_id);
                    }
                    dataSchemas.logger.debug(`[MCPOAuth] Refresh request to: ${tokenUrl}`, {
                        body: body.toString(),
                        headers,
                    });
                    const response = yield fetch(tokenUrl, {
                        method: 'POST',
                        headers,
                        body,
                    });
                    if (!response.ok) {
                        const errorText = yield response.text();
                        throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`);
                    }
                    const tokens = yield response.json();
                    return Object.assign(Object.assign({}, tokens), { obtained_at: Date.now(), expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined });
                }
                // Fallback: If we have pre-configured OAuth settings, use them
                if ((config === null || config === void 0 ? void 0 : config.token_url) && (config === null || config === void 0 ? void 0 : config.client_id)) {
                    dataSchemas.logger.debug(`[MCPOAuth] Using pre-configured OAuth settings for token refresh`);
                    const tokenUrl = new URL(config.token_url);
                    const clientAuth = config.client_secret
                        ? Buffer.from(`${config.client_id}:${config.client_secret}`).toString('base64')
                        : null;
                    const body = new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: refreshToken,
                    });
                    if (config.scope) {
                        body.append('scope', config.scope);
                    }
                    const headers = {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                    };
                    if (clientAuth) {
                        headers['Authorization'] = `Basic ${clientAuth}`;
                    }
                    else {
                        // Use client_id in body for public clients
                        body.append('client_id', config.client_id);
                    }
                    const response = yield fetch(tokenUrl, {
                        method: 'POST',
                        headers,
                        body,
                    });
                    if (!response.ok) {
                        const errorText = yield response.text();
                        throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`);
                    }
                    const tokens = yield response.json();
                    return Object.assign(Object.assign({}, tokens), { obtained_at: Date.now(), expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined });
                }
                /** For auto-discovered OAuth, we need the server URL */
                if (!metadata.serverUrl) {
                    throw new Error('Server URL required for auto-discovered OAuth token refresh');
                }
                /** Auto-discover OAuth configuration for refresh */
                const oauthMetadata = yield auth_js.discoverAuthorizationServerMetadata(metadata.serverUrl);
                if (!(oauthMetadata === null || oauthMetadata === void 0 ? void 0 : oauthMetadata.token_endpoint)) {
                    throw new Error('No token endpoint found in OAuth metadata');
                }
                const tokenUrl = new URL(oauthMetadata.token_endpoint);
                const body = new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                });
                const headers = {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json',
                };
                const response = yield fetch(tokenUrl, {
                    method: 'POST',
                    headers,
                    body,
                });
                if (!response.ok) {
                    const errorText = yield response.text();
                    throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`);
                }
                const tokens = yield response.json();
                return Object.assign(Object.assign({}, tokens), { obtained_at: Date.now(), expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined });
            }
            catch (error) {
                dataSchemas.logger.error(`[MCPOAuth] Failed to refresh tokens for ${metadata.serverName}`, error);
                throw error;
            }
        });
    }
    /**
     * Revokes OAuth tokens at the authorization server (RFC 7009)
     */
    static revokeOAuthToken(serverName, token, tokenType, metadata) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            // build the revoke URL, falling back to the server URL + /revoke if no revocation endpoint is provided
            const revokeUrl = metadata.revocationEndpoint != null
                ? new URL(metadata.revocationEndpoint)
                : new URL('/revoke', metadata.serverUrl);
            // detect auth method to use
            const authMethods = (_a = metadata.revocationEndpointAuthMethodsSupported) !== null && _a !== void 0 ? _a : [
                'client_secret_basic', // RFC 8414 (https://datatracker.ietf.org/doc/html/rfc8414)
            ];
            const usesBasicAuth = authMethods.includes('client_secret_basic');
            const usesClientSecretPost = authMethods.includes('client_secret_post');
            // init the request headers
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
            };
            // init the request body
            const body = new URLSearchParams({ token });
            body.set('token_type_hint', tokenType === 'refresh' ? 'refresh_token' : 'access_token');
            // process auth method
            if (usesBasicAuth) {
                // encode the client id and secret and add to the headers
                const credentials = Buffer.from(`${metadata.clientId}:${metadata.clientSecret}`).toString('base64');
                headers['Authorization'] = `Basic ${credentials}`;
            }
            else if (usesClientSecretPost) {
                // add the client id and secret to the body
                body.set('client_secret', metadata.clientSecret);
                body.set('client_id', metadata.clientId);
            }
            // perform the revoke request
            dataSchemas.logger.info(`[MCPOAuth] Revoking tokens for ${serverName} via ${revokeUrl.toString()}`);
            const response = yield fetch(revokeUrl, {
                method: 'POST',
                body: body.toString(),
                headers,
            });
            if (!response.ok) {
                dataSchemas.logger.error(`[MCPOAuth] Token revocation failed for ${serverName}: HTTP ${response.status}`);
                throw new Error(`Token revocation failed: HTTP ${response.status}`);
            }
        });
    }
}
MCPOAuthHandler.FLOW_TYPE = 'mcp_oauth';
MCPOAuthHandler.FLOW_TTL = 10 * 60 * 1000; // 10 minutes

var main = {exports: {}};

var version$1 = "16.4.7";
var require$$4 = {
	version: version$1};

const fs = fs$1;
const path = path$1;
const os = require$$2;
const crypto = require$$3;
const packageJson = require$$4;

const version = packageJson.version;

const LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;

// Parse src into an Object
function parse (src) {
  const obj = {};

  // Convert buffer to string
  let lines = src.toString();

  // Convert line breaks to same format
  lines = lines.replace(/\r\n?/mg, '\n');

  let match;
  while ((match = LINE.exec(lines)) != null) {
    const key = match[1];

    // Default undefined or null to empty string
    let value = (match[2] || '');

    // Remove whitespace
    value = value.trim();

    // Check if double quoted
    const maybeQuote = value[0];

    // Remove surrounding quotes
    value = value.replace(/^(['"`])([\s\S]*)\1$/mg, '$2');

    // Expand newlines if double quoted
    if (maybeQuote === '"') {
      value = value.replace(/\\n/g, '\n');
      value = value.replace(/\\r/g, '\r');
    }

    // Add to object
    obj[key] = value;
  }

  return obj
}

function _parseVault (options) {
  const vaultPath = _vaultPath(options);

  // Parse .env.vault
  const result = DotenvModule.configDotenv({ path: vaultPath });
  if (!result.parsed) {
    const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
    err.code = 'MISSING_DATA';
    throw err
  }

  // handle scenario for comma separated keys - for use with key rotation
  // example: DOTENV_KEY="dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=prod,dotenv://:key_7890@dotenvx.com/vault/.env.vault?environment=prod"
  const keys = _dotenvKey(options).split(',');
  const length = keys.length;

  let decrypted;
  for (let i = 0; i < length; i++) {
    try {
      // Get full key
      const key = keys[i].trim();

      // Get instructions for decrypt
      const attrs = _instructions(result, key);

      // Decrypt
      decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);

      break
    } catch (error) {
      // last key
      if (i + 1 >= length) {
        throw error
      }
      // try next key
    }
  }

  // Parse decrypted .env string
  return DotenvModule.parse(decrypted)
}

function _log (message) {
  console.log(`[dotenv@${version}][INFO] ${message}`);
}

function _warn (message) {
  console.log(`[dotenv@${version}][WARN] ${message}`);
}

function _debug (message) {
  console.log(`[dotenv@${version}][DEBUG] ${message}`);
}

function _dotenvKey (options) {
  // prioritize developer directly setting options.DOTENV_KEY
  if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
    return options.DOTENV_KEY
  }

  // secondary infra already contains a DOTENV_KEY environment variable
  if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
    return process.env.DOTENV_KEY
  }

  // fallback to empty string
  return ''
}

function _instructions (result, dotenvKey) {
  // Parse DOTENV_KEY. Format is a URI
  let uri;
  try {
    uri = new URL(dotenvKey);
  } catch (error) {
    if (error.code === 'ERR_INVALID_URL') {
      const err = new Error('INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development');
      err.code = 'INVALID_DOTENV_KEY';
      throw err
    }

    throw error
  }

  // Get decrypt key
  const key = uri.password;
  if (!key) {
    const err = new Error('INVALID_DOTENV_KEY: Missing key part');
    err.code = 'INVALID_DOTENV_KEY';
    throw err
  }

  // Get environment
  const environment = uri.searchParams.get('environment');
  if (!environment) {
    const err = new Error('INVALID_DOTENV_KEY: Missing environment part');
    err.code = 'INVALID_DOTENV_KEY';
    throw err
  }

  // Get ciphertext payload
  const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
  const ciphertext = result.parsed[environmentKey]; // DOTENV_VAULT_PRODUCTION
  if (!ciphertext) {
    const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
    err.code = 'NOT_FOUND_DOTENV_ENVIRONMENT';
    throw err
  }

  return { ciphertext, key }
}

function _vaultPath (options) {
  let possibleVaultPath = null;

  if (options && options.path && options.path.length > 0) {
    if (Array.isArray(options.path)) {
      for (const filepath of options.path) {
        if (fs.existsSync(filepath)) {
          possibleVaultPath = filepath.endsWith('.vault') ? filepath : `${filepath}.vault`;
        }
      }
    } else {
      possibleVaultPath = options.path.endsWith('.vault') ? options.path : `${options.path}.vault`;
    }
  } else {
    possibleVaultPath = path.resolve(process.cwd(), '.env.vault');
  }

  if (fs.existsSync(possibleVaultPath)) {
    return possibleVaultPath
  }

  return null
}

function _resolveHome (envPath) {
  return envPath[0] === '~' ? path.join(os.homedir(), envPath.slice(1)) : envPath
}

function _configVault (options) {
  _log('Loading env from encrypted .env.vault');

  const parsed = DotenvModule._parseVault(options);

  let processEnv = process.env;
  if (options && options.processEnv != null) {
    processEnv = options.processEnv;
  }

  DotenvModule.populate(processEnv, parsed, options);

  return { parsed }
}

function configDotenv (options) {
  const dotenvPath = path.resolve(process.cwd(), '.env');
  let encoding = 'utf8';
  const debug = Boolean(options && options.debug);

  if (options && options.encoding) {
    encoding = options.encoding;
  } else {
    if (debug) {
      _debug('No encoding is specified. UTF-8 is used by default');
    }
  }

  let optionPaths = [dotenvPath]; // default, look for .env
  if (options && options.path) {
    if (!Array.isArray(options.path)) {
      optionPaths = [_resolveHome(options.path)];
    } else {
      optionPaths = []; // reset default
      for (const filepath of options.path) {
        optionPaths.push(_resolveHome(filepath));
      }
    }
  }

  // Build the parsed data in a temporary object (because we need to return it).  Once we have the final
  // parsed data, we will combine it with process.env (or options.processEnv if provided).
  let lastError;
  const parsedAll = {};
  for (const path of optionPaths) {
    try {
      // Specifying an encoding returns a string instead of a buffer
      const parsed = DotenvModule.parse(fs.readFileSync(path, { encoding }));

      DotenvModule.populate(parsedAll, parsed, options);
    } catch (e) {
      if (debug) {
        _debug(`Failed to load ${path} ${e.message}`);
      }
      lastError = e;
    }
  }

  let processEnv = process.env;
  if (options && options.processEnv != null) {
    processEnv = options.processEnv;
  }

  DotenvModule.populate(processEnv, parsedAll, options);

  if (lastError) {
    return { parsed: parsedAll, error: lastError }
  } else {
    return { parsed: parsedAll }
  }
}

// Populates process.env from .env file
function config (options) {
  // fallback to original dotenv if DOTENV_KEY is not set
  if (_dotenvKey(options).length === 0) {
    return DotenvModule.configDotenv(options)
  }

  const vaultPath = _vaultPath(options);

  // dotenvKey exists but .env.vault file does not exist
  if (!vaultPath) {
    _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);

    return DotenvModule.configDotenv(options)
  }

  return DotenvModule._configVault(options)
}

function decrypt$1 (encrypted, keyStr) {
  const key = Buffer.from(keyStr.slice(-64), 'hex');
  let ciphertext = Buffer.from(encrypted, 'base64');

  const nonce = ciphertext.subarray(0, 12);
  const authTag = ciphertext.subarray(-16);
  ciphertext = ciphertext.subarray(12, -16);

  try {
    const aesgcm = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    aesgcm.setAuthTag(authTag);
    return `${aesgcm.update(ciphertext)}${aesgcm.final()}`
  } catch (error) {
    const isRange = error instanceof RangeError;
    const invalidKeyLength = error.message === 'Invalid key length';
    const decryptionFailed = error.message === 'Unsupported state or unable to authenticate data';

    if (isRange || invalidKeyLength) {
      const err = new Error('INVALID_DOTENV_KEY: It must be 64 characters long (or more)');
      err.code = 'INVALID_DOTENV_KEY';
      throw err
    } else if (decryptionFailed) {
      const err = new Error('DECRYPTION_FAILED: Please check your DOTENV_KEY');
      err.code = 'DECRYPTION_FAILED';
      throw err
    } else {
      throw error
    }
  }
}

// Populate process.env with parsed values
function populate (processEnv, parsed, options = {}) {
  const debug = Boolean(options && options.debug);
  const override = Boolean(options && options.override);

  if (typeof parsed !== 'object') {
    const err = new Error('OBJECT_REQUIRED: Please check the processEnv argument being passed to populate');
    err.code = 'OBJECT_REQUIRED';
    throw err
  }

  // Set process.env
  for (const key of Object.keys(parsed)) {
    if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
      if (override === true) {
        processEnv[key] = parsed[key];
      }

      if (debug) {
        if (override === true) {
          _debug(`"${key}" is already defined and WAS overwritten`);
        } else {
          _debug(`"${key}" is already defined and was NOT overwritten`);
        }
      }
    } else {
      processEnv[key] = parsed[key];
    }
  }
}

const DotenvModule = {
  configDotenv,
  _configVault,
  _parseVault,
  config,
  decrypt: decrypt$1,
  parse,
  populate
};

main.exports.configDotenv = DotenvModule.configDotenv;
main.exports._configVault = DotenvModule._configVault;
main.exports._parseVault = DotenvModule._parseVault;
main.exports.config = DotenvModule.config;
main.exports.decrypt = DotenvModule.decrypt;
main.exports.parse = DotenvModule.parse;
main.exports.populate = DotenvModule.populate;

main.exports = DotenvModule;

var mainExports = main.exports;

// ../config.js accepts options via environment variables
const options = {};

if (process.env.DOTENV_CONFIG_ENCODING != null) {
  options.encoding = process.env.DOTENV_CONFIG_ENCODING;
}

if (process.env.DOTENV_CONFIG_PATH != null) {
  options.path = process.env.DOTENV_CONFIG_PATH;
}

if (process.env.DOTENV_CONFIG_DEBUG != null) {
  options.debug = process.env.DOTENV_CONFIG_DEBUG;
}

if (process.env.DOTENV_CONFIG_OVERRIDE != null) {
  options.override = process.env.DOTENV_CONFIG_OVERRIDE;
}

if (process.env.DOTENV_CONFIG_DOTENV_KEY != null) {
  options.DOTENV_KEY = process.env.DOTENV_CONFIG_DOTENV_KEY;
}

var envOptions = options;

const re = /^dotenv_config_(encoding|path|debug|override|DOTENV_KEY)=(.+)$/;

var cliOptions = function optionMatcher (args) {
  return args.reduce(function (acc, cur) {
    const matches = cur.match(re);
    if (matches) {
      acc[matches[1]] = matches[2];
    }
    return acc
  }, {})
};

(function () {
  mainExports.config(
    Object.assign(
      {},
      envOptions,
      cliOptions(process.argv)
    )
  );
})();

var _a$1, _b$1;
const { webcrypto } = crypto$1;
// Use hex decoding for both key and IV for legacy methods.
const key = Buffer.from((_a$1 = process.env.CREDS_KEY) !== null && _a$1 !== void 0 ? _a$1 : '', 'hex');
const iv = Buffer.from((_b$1 = process.env.CREDS_IV) !== null && _b$1 !== void 0 ? _b$1 : '', 'hex');
const algorithm = 'AES-CBC';
// --- Legacy v1/v2 Setup: AES-CBC with fixed key and IV ---
function encrypt(value) {
    return __awaiter(this, void 0, void 0, function* () {
        const cryptoKey = yield webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
            'encrypt',
        ]);
        const encoder = new TextEncoder();
        const data = encoder.encode(value);
        const encryptedBuffer = yield webcrypto.subtle.encrypt({ name: algorithm, iv: iv }, cryptoKey, data);
        return Buffer.from(encryptedBuffer).toString('hex');
    });
}
function decrypt(encryptedValue) {
    return __awaiter(this, void 0, void 0, function* () {
        const cryptoKey = yield webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
            'decrypt',
        ]);
        const encryptedBuffer = Buffer.from(encryptedValue, 'hex');
        const decryptedBuffer = yield webcrypto.subtle.decrypt({ name: algorithm, iv: iv }, cryptoKey, encryptedBuffer);
        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
    });
}
// --- v2: AES-CBC with a random IV per encryption ---
function encryptV2(value) {
    return __awaiter(this, void 0, void 0, function* () {
        const gen_iv = webcrypto.getRandomValues(new Uint8Array(16));
        const cryptoKey = yield webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
            'encrypt',
        ]);
        const encoder = new TextEncoder();
        const data = encoder.encode(value);
        const encryptedBuffer = yield webcrypto.subtle.encrypt({ name: algorithm, iv: gen_iv }, cryptoKey, data);
        return Buffer.from(gen_iv).toString('hex') + ':' + Buffer.from(encryptedBuffer).toString('hex');
    });
}
function decryptV2(encryptedValue) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const parts = encryptedValue.split(':');
        if (parts.length === 1) {
            return parts[0];
        }
        const gen_iv = Buffer.from((_a = parts.shift()) !== null && _a !== void 0 ? _a : '', 'hex');
        const encrypted = parts.join(':');
        const cryptoKey = yield webcrypto.subtle.importKey('raw', key, { name: algorithm }, false, [
            'decrypt',
        ]);
        const encryptedBuffer = Buffer.from(encrypted, 'hex');
        const decryptedBuffer = yield webcrypto.subtle.decrypt({ name: algorithm, iv: gen_iv }, cryptoKey, encryptedBuffer);
        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
    });
}
// --- v3: AES-256-CTR using Node's crypto functions ---
const algorithm_v3 = 'aes-256-ctr';
/**
 * Encrypts a value using AES-256-CTR.
 * Note: AES-256 requires a 32-byte key. Ensure that process.env.CREDS_KEY is a 64-character hex string.
 *
 * @param value - The plaintext to encrypt.
 * @returns The encrypted string with a "v3:" prefix.
 */
function encryptV3(value) {
    if (key.length !== 32) {
        throw new Error(`Invalid key length: expected 32 bytes, got ${key.length} bytes`);
    }
    const iv_v3 = crypto$1.randomBytes(16);
    const cipher = crypto$1.createCipheriv(algorithm_v3, key, iv_v3);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `v3:${iv_v3.toString('hex')}:${encrypted.toString('hex')}`;
}
function decryptV3(encryptedValue) {
    const parts = encryptedValue.split(':');
    if (parts[0] !== 'v3') {
        throw new Error('Not a v3 encrypted value');
    }
    const iv_v3 = Buffer.from(parts[1], 'hex');
    const encryptedText = Buffer.from(parts.slice(2).join(':'), 'hex');
    const decipher = crypto$1.createDecipheriv(algorithm_v3, key, iv_v3);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString('utf8');
}
function getRandomValues(length) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!Number.isInteger(length) || length <= 0) {
            throw new Error('Length must be a positive integer');
        }
        const randomValues = new Uint8Array(length);
        webcrypto.getRandomValues(randomValues);
        return Buffer.from(randomValues).toString('hex');
    });
}
/**
 * Computes SHA-256 hash for the given input.
 * @param input - The input to hash.
 * @returns The SHA-256 hash of the input.
 */
function hashBackupCode(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hashBuffer = yield webcrypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    });
}

/**
 * Generate a short-lived JWT token
 * @param {String} userId - The ID of the user
 * @param {String} [expireIn='5m'] - The expiration time for the token (default is 5 minutes)
 * @returns {String} - The generated JWT token
 */
const generateShortLivedToken = (userId, expireIn = '5m') => {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        expiresIn: expireIn,
        algorithm: 'HS256',
    });
};

var CONSTANTS;
(function (CONSTANTS) {
    CONSTANTS["mcp_delimiter"] = "_mcp_";
    /** System user ID for app-level OAuth tokens (all zeros ObjectId) */
    CONSTANTS["SYSTEM_USER_ID"] = "000000000000000000000000";
})(CONSTANTS || (CONSTANTS = {}));
function isSystemUserId(userId) {
    return userId === CONSTANTS.SYSTEM_USER_ID;
}

class MCPTokenStorage {
    static getLogPrefix(userId, serverName) {
        return isSystemUserId(userId)
            ? `[MCP][${serverName}]`
            : `[MCP][User: ${userId}][${serverName}]`;
    }
    /**
     * Stores OAuth tokens for an MCP server
     *
     * @param params.existingTokens - Optional: Pass existing token state to avoid duplicate DB calls.
     * This is useful when refreshing tokens, as getTokens() already has the token state.
     */
    static storeTokens({ userId, serverName, tokens, createToken, updateToken, findToken, clientInfo, existingTokens, metadata, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const logPrefix = this.getLogPrefix(userId, serverName);
            try {
                const identifier = `mcp:${serverName}`;
                // Encrypt and store access token
                const encryptedAccessToken = yield encryptV2(tokens.access_token);
                dataSchemas.logger.debug(`${logPrefix} Token expires_in: ${'expires_in' in tokens ? tokens.expires_in : 'N/A'}, expires_at: ${'expires_at' in tokens ? tokens.expires_at : 'N/A'}`);
                // Handle both expires_in and expires_at formats
                let accessTokenExpiry;
                if ('expires_at' in tokens && tokens.expires_at) {
                    /** MCPOAuthTokens format - already has calculated expiry */
                    dataSchemas.logger.debug(`${logPrefix} Using expires_at: ${tokens.expires_at}`);
                    accessTokenExpiry = new Date(tokens.expires_at);
                }
                else if (tokens.expires_in) {
                    /** Standard OAuthTokens format - calculate expiry */
                    dataSchemas.logger.debug(`${logPrefix} Using expires_in: ${tokens.expires_in}`);
                    accessTokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);
                }
                else {
                    /** No expiry provided - default to 1 year */
                    dataSchemas.logger.debug(`${logPrefix} No expiry provided, using default`);
                    accessTokenExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
                }
                dataSchemas.logger.debug(`${logPrefix} Calculated expiry date: ${accessTokenExpiry.toISOString()}`);
                dataSchemas.logger.debug(`${logPrefix} Date object: ${JSON.stringify({
                    time: accessTokenExpiry.getTime(),
                    valid: !isNaN(accessTokenExpiry.getTime()),
                    iso: accessTokenExpiry.toISOString(),
                })}`);
                // Ensure the date is valid before passing to createToken
                if (isNaN(accessTokenExpiry.getTime())) {
                    dataSchemas.logger.error(`${logPrefix} Invalid expiry date calculated, using default`);
                    accessTokenExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
                }
                // Calculate expiresIn (seconds from now)
                const expiresIn = Math.floor((accessTokenExpiry.getTime() - Date.now()) / 1000);
                const accessTokenData = {
                    userId,
                    type: 'mcp_oauth',
                    identifier,
                    token: encryptedAccessToken,
                    expiresIn: expiresIn > 0 ? expiresIn : 365 * 24 * 60 * 60, // Default to 1 year if negative
                };
                // Check if token already exists and update if it does
                if (findToken && updateToken) {
                    // Use provided existing token state if available, otherwise look it up
                    const existingToken = (existingTokens === null || existingTokens === void 0 ? void 0 : existingTokens.accessToken) !== undefined
                        ? existingTokens.accessToken
                        : yield findToken({ userId, identifier });
                    if (existingToken) {
                        yield updateToken({ userId, identifier }, accessTokenData);
                        dataSchemas.logger.debug(`${logPrefix} Updated existing access token`);
                    }
                    else {
                        yield createToken(accessTokenData);
                        dataSchemas.logger.debug(`${logPrefix} Created new access token`);
                    }
                }
                else {
                    // Create new token if it's initial store or update methods not provided
                    yield createToken(accessTokenData);
                    dataSchemas.logger.debug(`${logPrefix} Created access token (no update methods available)`);
                }
                // Store refresh token if available
                if (tokens.refresh_token) {
                    const encryptedRefreshToken = yield encryptV2(tokens.refresh_token);
                    const extendedTokens = tokens;
                    const refreshTokenExpiry = extendedTokens.refresh_token_expires_in
                        ? new Date(Date.now() + extendedTokens.refresh_token_expires_in * 1000)
                        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default to 1 year
                    /** Calculated expiresIn for refresh token */
                    const refreshExpiresIn = Math.floor((refreshTokenExpiry.getTime() - Date.now()) / 1000);
                    const refreshTokenData = {
                        userId,
                        type: 'mcp_oauth_refresh',
                        identifier: `${identifier}:refresh`,
                        token: encryptedRefreshToken,
                        expiresIn: refreshExpiresIn > 0 ? refreshExpiresIn : 365 * 24 * 60 * 60,
                    };
                    // Check if refresh token already exists and update if it does
                    if (findToken && updateToken) {
                        // Use provided existing token state if available, otherwise look it up
                        const existingRefreshToken = (existingTokens === null || existingTokens === void 0 ? void 0 : existingTokens.refreshToken) !== undefined
                            ? existingTokens.refreshToken
                            : yield findToken({
                                userId,
                                identifier: `${identifier}:refresh`,
                            });
                        if (existingRefreshToken) {
                            yield updateToken({ userId, identifier: `${identifier}:refresh` }, refreshTokenData);
                            dataSchemas.logger.debug(`${logPrefix} Updated existing refresh token`);
                        }
                        else {
                            yield createToken(refreshTokenData);
                            dataSchemas.logger.debug(`${logPrefix} Created new refresh token`);
                        }
                    }
                    else {
                        yield createToken(refreshTokenData);
                        dataSchemas.logger.debug(`${logPrefix} Created refresh token (no update methods available)`);
                    }
                }
                /** Store client information if provided */
                if (clientInfo) {
                    dataSchemas.logger.debug(`${logPrefix} Storing client info:`, {
                        client_id: clientInfo.client_id,
                        has_client_secret: !!clientInfo.client_secret,
                    });
                    const encryptedClientInfo = yield encryptV2(JSON.stringify(clientInfo));
                    const clientInfoData = {
                        userId,
                        type: 'mcp_oauth_client',
                        identifier: `${identifier}:client`,
                        token: encryptedClientInfo,
                        expiresIn: 365 * 24 * 60 * 60,
                        metadata,
                    };
                    // Check if client info already exists and update if it does
                    if (findToken && updateToken) {
                        // Use provided existing token state if available, otherwise look it up
                        const existingClientInfo = (existingTokens === null || existingTokens === void 0 ? void 0 : existingTokens.clientInfoToken) !== undefined
                            ? existingTokens.clientInfoToken
                            : yield findToken({
                                userId,
                                identifier: `${identifier}:client`,
                            });
                        if (existingClientInfo) {
                            yield updateToken({ userId, identifier: `${identifier}:client` }, clientInfoData);
                            dataSchemas.logger.debug(`${logPrefix} Updated existing client info`);
                        }
                        else {
                            yield createToken(clientInfoData);
                            dataSchemas.logger.debug(`${logPrefix} Created new client info`);
                        }
                    }
                    else {
                        yield createToken(clientInfoData);
                        dataSchemas.logger.debug(`${logPrefix} Created client info (no update methods available)`);
                    }
                }
                dataSchemas.logger.debug(`${logPrefix} Stored OAuth tokens`);
            }
            catch (error) {
                const logPrefix = this.getLogPrefix(userId, serverName);
                dataSchemas.logger.error(`${logPrefix} Failed to store tokens`, error);
                throw error;
            }
        });
    }
    /**
     * Retrieves OAuth tokens for an MCP server
     */
    static getTokens({ userId, serverName, findToken, createToken, updateToken, refreshTokens, }) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const logPrefix = this.getLogPrefix(userId, serverName);
            try {
                const identifier = `mcp:${serverName}`;
                // Get access token
                const accessTokenData = yield findToken({
                    userId,
                    type: 'mcp_oauth',
                    identifier,
                });
                /** Check if access token is missing or expired */
                const isMissing = !accessTokenData;
                const isExpired = (accessTokenData === null || accessTokenData === void 0 ? void 0 : accessTokenData.expiresAt) && new Date() >= accessTokenData.expiresAt;
                if (isMissing || isExpired) {
                    dataSchemas.logger.info(`${logPrefix} Access token ${isMissing ? 'missing' : 'expired'}`);
                    /** Refresh data if we have a refresh token and refresh function */
                    const refreshTokenData = yield findToken({
                        userId,
                        type: 'mcp_oauth_refresh',
                        identifier: `${identifier}:refresh`,
                    });
                    if (!refreshTokenData) {
                        dataSchemas.logger.info(`${logPrefix} Access token ${isMissing ? 'missing' : 'expired'} and no refresh token available`);
                        return null;
                    }
                    if (!refreshTokens) {
                        dataSchemas.logger.warn(`${logPrefix} Access token ${isMissing ? 'missing' : 'expired'}, refresh token available but no \`refreshTokens\` provided`);
                        return null;
                    }
                    if (!createToken) {
                        dataSchemas.logger.warn(`${logPrefix} Access token ${isMissing ? 'missing' : 'expired'}, refresh token available but no \`createToken\` function provided`);
                        return null;
                    }
                    try {
                        dataSchemas.logger.info(`${logPrefix} Attempting to refresh token`);
                        const decryptedRefreshToken = yield decryptV2(refreshTokenData.token);
                        /** Client information if available */
                        let clientInfo;
                        let clientInfoData;
                        try {
                            clientInfoData = yield findToken({
                                userId,
                                type: 'mcp_oauth_client',
                                identifier: `${identifier}:client`,
                            });
                            if (clientInfoData) {
                                const decryptedClientInfo = yield decryptV2(clientInfoData.token);
                                clientInfo = JSON.parse(decryptedClientInfo);
                                dataSchemas.logger.debug(`${logPrefix} Retrieved client info:`, {
                                    client_id: clientInfo.client_id,
                                    has_client_secret: !!clientInfo.client_secret,
                                });
                            }
                        }
                        catch (_b) {
                            dataSchemas.logger.debug(`${logPrefix} No client info found`);
                        }
                        const metadata = {
                            userId,
                            serverName,
                            identifier,
                            clientInfo,
                        };
                        const newTokens = yield refreshTokens(decryptedRefreshToken, metadata);
                        // Store the refreshed tokens (handles both create and update)
                        // Pass existing token state to avoid duplicate DB calls
                        yield this.storeTokens({
                            userId,
                            serverName,
                            tokens: newTokens,
                            createToken,
                            updateToken,
                            findToken,
                            clientInfo,
                            existingTokens: {
                                accessToken: accessTokenData, // We know this is expired/missing
                                refreshToken: refreshTokenData, // We already have this
                                clientInfoToken: clientInfoData, // We already looked this up
                            },
                        });
                        dataSchemas.logger.info(`${logPrefix} Successfully refreshed and stored OAuth tokens`);
                        return newTokens;
                    }
                    catch (refreshError) {
                        dataSchemas.logger.error(`${logPrefix} Failed to refresh tokens`, refreshError);
                        // Check if it's an unauthorized_client error (refresh not supported)
                        const errorMessage = refreshError instanceof Error ? refreshError.message : String(refreshError);
                        if (errorMessage.includes('unauthorized_client')) {
                            dataSchemas.logger.info(`${logPrefix} Server does not support refresh tokens for this client. New authentication required.`);
                        }
                        return null;
                    }
                }
                // If we reach here, access token should exist and be valid
                if (!accessTokenData) {
                    return null;
                }
                const decryptedAccessToken = yield decryptV2(accessTokenData.token);
                /** Get refresh token if available */
                const refreshTokenData = yield findToken({
                    userId,
                    type: 'mcp_oauth_refresh',
                    identifier: `${identifier}:refresh`,
                });
                const tokens = {
                    access_token: decryptedAccessToken,
                    token_type: 'Bearer',
                    obtained_at: accessTokenData.createdAt.getTime(),
                    expires_at: (_a = accessTokenData.expiresAt) === null || _a === void 0 ? void 0 : _a.getTime(),
                };
                if (refreshTokenData) {
                    tokens.refresh_token = yield decryptV2(refreshTokenData.token);
                }
                dataSchemas.logger.debug(`${logPrefix} Loaded existing OAuth tokens from storage`);
                return tokens;
            }
            catch (error) {
                dataSchemas.logger.error(`${logPrefix} Failed to retrieve tokens`, error);
                return null;
            }
        });
    }
    static getClientInfoAndMetadata({ userId, serverName, findToken, }) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const identifier = `mcp:${serverName}`;
            const clientInfoData = yield findToken({
                userId,
                type: 'mcp_oauth_client',
                identifier: `${identifier}:client`,
            });
            if (clientInfoData == null) {
                return null;
            }
            const tokenData = yield decryptV2(clientInfoData.token);
            const clientInfo = JSON.parse(tokenData);
            // get metadata from the token as a plain object. While it's defined as a Map in the database type, it's a plain object at runtime.
            function getMetadata(metadata) {
                if (metadata == null) {
                    return {};
                }
                if (metadata instanceof Map) {
                    return Object.fromEntries(metadata);
                }
                return Object.assign({}, metadata);
            }
            const clientMetadata = getMetadata((_a = clientInfoData.metadata) !== null && _a !== void 0 ? _a : null);
            return {
                clientInfo,
                clientMetadata,
            };
        });
    }
    /**
     * Deletes all OAuth-related tokens for a specific user and server
     */
    static deleteUserTokens({ userId, serverName, deleteToken, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const identifier = `mcp:${serverName}`;
            // delete client info token
            yield deleteToken({
                userId,
                type: 'mcp_oauth_client',
                identifier: `${identifier}:client`,
            });
            // delete access token
            yield deleteToken({
                userId,
                type: 'mcp_oauth',
                identifier,
            });
            // delete refresh token
            yield deleteToken({
                userId,
                type: 'mcp_oauth_refresh',
                identifier: `${identifier}:refresh`,
            });
        });
    }
}

var _a, _b, _c;
/**
 * Centralized configuration for MCP-related environment variables.
 * Provides typed access to MCP settings with default values.
 */
const mcpConfig = {
    OAUTH_ON_AUTH_ERROR: isEnabled((_a = process.env.MCP_OAUTH_ON_AUTH_ERROR) !== null && _a !== void 0 ? _a : true),
    OAUTH_DETECTION_TIMEOUT: math((_b = process.env.MCP_OAUTH_DETECTION_TIMEOUT) !== null && _b !== void 0 ? _b : 5000),
    CONNECTION_CHECK_TTL: math((_c = process.env.MCP_CONNECTION_CHECK_TTL) !== null && _c !== void 0 ? _c : 60000),
};

// ATTENTION: If you modify OAuth detection logic in this file, run the integration tests to verify:
// npx jest --testMatch="**/detectOAuth.integration.dev.ts" (from packages/api directory)
//
// These tests are excluded from CI because they make live HTTP requests to external services,
// which could cause flaky builds due to network issues or changes in third-party endpoints.
// Manual testing ensures the OAuth detection still works against real MCP servers.
/**
 * Detects if an MCP server requires OAuth authentication using proactive discovery methods.
 *
 * This function implements a comprehensive OAuth detection strategy:
 * 1. Standard Protected Resource Metadata (RFC 9728) - checks /.well-known/oauth-protected-resource
 * 2. 401 Challenge Method - checks WWW-Authenticate header for resource_metadata URL
 * 3. Optional fallback: treat any 401/403 response as OAuth requirement (if MCP_OAUTH_ON_AUTH_ERROR=true)
 *
 * @param serverUrl - The MCP server URL to check for OAuth requirements
 * @returns Promise<OAuthDetectionResult> - OAuth requirement details
 */
function detectOAuthRequirement(serverUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        const protectedResourceResult = yield checkProtectedResourceMetadata(serverUrl);
        if (protectedResourceResult)
            return protectedResourceResult;
        const challengeResult = yield check401ChallengeMetadata(serverUrl);
        if (challengeResult)
            return challengeResult;
        const fallbackResult = yield checkAuthErrorFallback(serverUrl);
        if (fallbackResult)
            return fallbackResult;
        // No OAuth detected
        return {
            requiresOAuth: false,
            method: 'no-metadata-found',
            metadata: null,
        };
    });
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// ------------------------ Private helper functions for OAuth detection -------------------------//
////////////////////////////////////////////////////////////////////////////////////////////////////
// Checks for OAuth using standard protected resource metadata (RFC 9728)
function checkProtectedResourceMetadata(serverUrl) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const resourceMetadata = yield auth_js.discoverOAuthProtectedResourceMetadata(serverUrl);
            if (!((_a = resourceMetadata === null || resourceMetadata === void 0 ? void 0 : resourceMetadata.authorization_servers) === null || _a === void 0 ? void 0 : _a.length))
                return null;
            return {
                requiresOAuth: true,
                method: 'protected-resource-metadata',
                metadata: resourceMetadata,
            };
        }
        catch (_b) {
            return null;
        }
    });
}
// Checks for OAuth using 401 challenge with resource metadata URL
function check401ChallengeMetadata(serverUrl) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(serverUrl, {
                method: 'HEAD',
                signal: AbortSignal.timeout(mcpConfig.OAUTH_DETECTION_TIMEOUT),
            });
            if (response.status !== 401)
                return null;
            const wwwAuth = response.headers.get('www-authenticate');
            const metadataUrl = (_a = wwwAuth === null || wwwAuth === void 0 ? void 0 : wwwAuth.match(/resource_metadata="([^"]+)"/)) === null || _a === void 0 ? void 0 : _a[1];
            if (!metadataUrl)
                return null;
            const metadataResponse = yield fetch(metadataUrl, {
                signal: AbortSignal.timeout(mcpConfig.OAUTH_DETECTION_TIMEOUT),
            });
            const metadata = yield metadataResponse.json();
            if (!((_b = metadata === null || metadata === void 0 ? void 0 : metadata.authorization_servers) === null || _b === void 0 ? void 0 : _b.length))
                return null;
            return {
                requiresOAuth: true,
                method: '401-challenge-metadata',
                metadata,
            };
        }
        catch (_c) {
            return null;
        }
    });
}
// Fallback method: treats any auth error as OAuth requirement if configured
function checkAuthErrorFallback(serverUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (!mcpConfig.OAUTH_ON_AUTH_ERROR)
                return null;
            const response = yield fetch(serverUrl, {
                method: 'HEAD',
                signal: AbortSignal.timeout(mcpConfig.OAUTH_DETECTION_TIMEOUT),
            });
            if (response.status !== 401 && response.status !== 403)
                return null;
            return {
                requiresOAuth: true,
                method: 'no-metadata-found',
                metadata: null,
            };
        }
        catch (_a) {
            return null;
        }
    });
}

function isStdioOptions(options) {
    return 'command' in options;
}
function isWebSocketOptions(options) {
    if ('url' in options) {
        const protocol = new URL(options.url).protocol;
        return protocol === 'ws:' || protocol === 'wss:';
    }
    return false;
}
function isSSEOptions(options) {
    if ('url' in options) {
        const protocol = new URL(options.url).protocol;
        return protocol !== 'ws:' && protocol !== 'wss:';
    }
    return false;
}
/**
 * Checks if the provided options are for a Streamable HTTP transport.
 *
 * Streamable HTTP is an MCP transport that uses HTTP POST for sending messages
 * and supports streaming responses. It provides better performance than
 * SSE transport while maintaining compatibility with most network environments.
 *
 * @param options MCP connection options to check
 * @returns True if options are for a streamable HTTP transport
 */
function isStreamableHTTPOptions(options) {
    if ('url' in options && 'type' in options) {
        const optionType = options.type;
        if (optionType === 'streamable-http' || optionType === 'http') {
            const protocol = new URL(options.url).protocol;
            return protocol !== 'ws:' && protocol !== 'wss:';
        }
    }
    return false;
}
const FIVE_MINUTES = 5 * 60 * 1000;
const DEFAULT_TIMEOUT = 60000;
class MCPConnection extends events.EventEmitter {
    setRequestHeaders(headers) {
        if (!headers) {
            return;
        }
        const normalizedHeaders = {};
        for (const [key, value] of Object.entries(headers)) {
            normalizedHeaders[key.toLowerCase()] = value;
        }
        this.requestHeaders = normalizedHeaders;
    }
    getRequestHeaders() {
        return this.requestHeaders;
    }
    constructor(params) {
        super();
        this.transport = null; // Make this nullable
        this.connectionState = 'disconnected';
        this.connectPromise = null;
        this.MAX_RECONNECT_ATTEMPTS = 3;
        this.shouldStopReconnecting = false;
        this.isReconnecting = false;
        this.isInitializing = false;
        this.reconnectAttempts = 0;
        this.lastConnectionCheckAt = 0;
        this.oauthRequired = false;
        this.options = params.serverConfig;
        this.serverName = params.serverName;
        this.userId = params.userId;
        this.iconPath = params.serverConfig.iconPath;
        this.timeout = params.serverConfig.timeout;
        this.lastPingTime = Date.now();
        if (params.oauthTokens) {
            this.oauthTokens = params.oauthTokens;
        }
        this.client = new index_js.Client({
            name: '@librechat/api-client',
            version: '1.2.3',
        }, {
            capabilities: {},
        });
        this.setupEventListeners();
    }
    /** Helper to generate consistent log prefixes */
    getLogPrefix() {
        const userPart = this.userId ? `[User: ${this.userId}]` : '';
        return `[MCP]${userPart}[${this.serverName}]`;
    }
    /**
     * Factory function to create fetch functions without capturing the entire `this` context.
     * This helps prevent memory leaks by only passing necessary dependencies.
     *
     * @param getHeaders Function to retrieve request headers
     * @param timeout Timeout value for the agent (in milliseconds)
     * @returns A fetch function that merges headers appropriately
     */
    createFetchFunction(getHeaders, timeout) {
        return function customFetch(input, init) {
            const requestHeaders = getHeaders();
            const effectiveTimeout = timeout || DEFAULT_TIMEOUT;
            const agent = new undici.Agent({
                bodyTimeout: effectiveTimeout,
                headersTimeout: effectiveTimeout,
            });
            if (!requestHeaders) {
                return undici.fetch(input, Object.assign(Object.assign({}, init), { dispatcher: agent }));
            }
            let initHeaders = {};
            if (init === null || init === void 0 ? void 0 : init.headers) {
                if (init.headers instanceof Headers) {
                    initHeaders = Object.fromEntries(init.headers.entries());
                }
                else if (Array.isArray(init.headers)) {
                    initHeaders = Object.fromEntries(init.headers);
                }
                else {
                    initHeaders = init.headers;
                }
            }
            return undici.fetch(input, Object.assign(Object.assign({}, init), { headers: Object.assign(Object.assign({}, initHeaders), requestHeaders), dispatcher: agent }));
        };
    }
    emitError(error, errorContext) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        dataSchemas.logger.error(`${this.getLogPrefix()} ${errorContext}: ${errorMessage}`);
    }
    constructTransport(options) {
        var _a, _b, _c;
        try {
            let type;
            if (isStdioOptions(options)) {
                type = 'stdio';
            }
            else if (isWebSocketOptions(options)) {
                type = 'websocket';
            }
            else if (isStreamableHTTPOptions(options)) {
                // Could be either 'streamable-http' or 'http', normalize to 'streamable-http'
                type = 'streamable-http';
            }
            else if (isSSEOptions(options)) {
                type = 'sse';
            }
            else {
                throw new Error('Cannot infer transport type: options.type is not provided and cannot be inferred from other properties.');
            }
            switch (type) {
                case 'stdio':
                    if (!isStdioOptions(options)) {
                        throw new Error('Invalid options for stdio transport.');
                    }
                    return new stdio_js.StdioClientTransport({
                        command: options.command,
                        args: options.args,
                        // workaround bug of mcp sdk that can't pass env:
                        // https://github.com/modelcontextprotocol/typescript-sdk/issues/216
                        env: Object.assign(Object.assign({}, stdio_js.getDefaultEnvironment()), ((_a = options.env) !== null && _a !== void 0 ? _a : {})),
                    });
                case 'websocket':
                    if (!isWebSocketOptions(options)) {
                        throw new Error('Invalid options for websocket transport.');
                    }
                    this.url = options.url;
                    return new websocket_js.WebSocketClientTransport(new URL(options.url));
                case 'sse': {
                    if (!isSSEOptions(options)) {
                        throw new Error('Invalid options for sse transport.');
                    }
                    this.url = options.url;
                    const url = new URL(options.url);
                    dataSchemas.logger.info(`${this.getLogPrefix()} Creating SSE transport: ${url.toString()}`);
                    const abortController = new AbortController();
                    /** Add OAuth token to headers if available */
                    const headers = Object.assign({}, options.headers);
                    if ((_b = this.oauthTokens) === null || _b === void 0 ? void 0 : _b.access_token) {
                        headers['Authorization'] = `Bearer ${this.oauthTokens.access_token}`;
                    }
                    const timeoutValue = this.timeout || DEFAULT_TIMEOUT;
                    const transport = new sse_js.SSEClientTransport(url, {
                        requestInit: {
                            headers,
                            signal: abortController.signal,
                        },
                        eventSourceInit: {
                            fetch: (url, init) => {
                                const fetchHeaders = new Headers(Object.assign({}, init === null || init === void 0 ? void 0 : init.headers, headers));
                                const agent = new undici.Agent({
                                    bodyTimeout: timeoutValue,
                                    headersTimeout: timeoutValue,
                                });
                                return undici.fetch(url, Object.assign(Object.assign({}, init), { dispatcher: agent, headers: fetchHeaders }));
                            },
                        },
                        fetch: this.createFetchFunction(this.getRequestHeaders.bind(this), this.timeout),
                    });
                    transport.onclose = () => {
                        dataSchemas.logger.info(`${this.getLogPrefix()} SSE transport closed`);
                        this.emit('connectionChange', 'disconnected');
                    };
                    transport.onmessage = (message) => {
                        dataSchemas.logger.info(`${this.getLogPrefix()} Message received: ${JSON.stringify(message)}`);
                    };
                    this.setupTransportErrorHandlers(transport);
                    return transport;
                }
                case 'streamable-http': {
                    if (!isStreamableHTTPOptions(options)) {
                        throw new Error('Invalid options for streamable-http transport.');
                    }
                    this.url = options.url;
                    const url = new URL(options.url);
                    dataSchemas.logger.info(`${this.getLogPrefix()} Creating streamable-http transport: ${url.toString()}`);
                    const abortController = new AbortController();
                    /** Add OAuth token to headers if available */
                    const headers = Object.assign({}, options.headers);
                    if ((_c = this.oauthTokens) === null || _c === void 0 ? void 0 : _c.access_token) {
                        headers['Authorization'] = `Bearer ${this.oauthTokens.access_token}`;
                    }
                    const transport = new streamableHttp_js.StreamableHTTPClientTransport(url, {
                        requestInit: {
                            headers,
                            signal: abortController.signal,
                        },
                        fetch: this.createFetchFunction(this.getRequestHeaders.bind(this), this.timeout),
                    });
                    transport.onclose = () => {
                        dataSchemas.logger.info(`${this.getLogPrefix()} Streamable-http transport closed`);
                        this.emit('connectionChange', 'disconnected');
                    };
                    transport.onmessage = (message) => {
                        dataSchemas.logger.info(`${this.getLogPrefix()} Message received: ${JSON.stringify(message)}`);
                    };
                    this.setupTransportErrorHandlers(transport);
                    return transport;
                }
                default: {
                    throw new Error(`Unsupported transport type: ${type}`);
                }
            }
        }
        catch (error) {
            this.emitError(error, 'Failed to construct transport:');
            throw error;
        }
    }
    setupEventListeners() {
        this.isInitializing = true;
        this.on('connectionChange', (state) => {
            this.connectionState = state;
            if (state === 'connected') {
                this.isReconnecting = false;
                this.isInitializing = false;
                this.shouldStopReconnecting = false;
                this.reconnectAttempts = 0;
                /**
                 * // FOR DEBUGGING
                 * // this.client.setRequestHandler(PingRequestSchema, async (request, extra) => {
                 * //    logger.info(`[MCP][${this.serverName}] PingRequest: ${JSON.stringify(request)}`);
                 * //    if (getEventListeners && extra.signal) {
                 * //      const listenerCount = getEventListeners(extra.signal, 'abort').length;
                 * //      logger.debug(`Signal has ${listenerCount} abort listeners`);
                 * //    }
                 * //    return {};
                 * //  });
                 */
            }
            else if (state === 'error' && !this.isReconnecting && !this.isInitializing) {
                this.handleReconnection().catch((error) => {
                    dataSchemas.logger.error(`${this.getLogPrefix()} Reconnection handler failed:`, error);
                });
            }
        });
        this.subscribeToResources();
    }
    handleReconnection() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isReconnecting ||
                this.shouldStopReconnecting ||
                this.isInitializing ||
                this.oauthRequired) {
                if (this.oauthRequired) {
                    dataSchemas.logger.info(`${this.getLogPrefix()} OAuth required, skipping reconnection attempts`);
                }
                return;
            }
            this.isReconnecting = true;
            const backoffDelay = (attempt) => Math.min(1000 * Math.pow(2, attempt), 30000);
            try {
                while (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS &&
                    !this.shouldStopReconnecting) {
                    this.reconnectAttempts++;
                    const delay = backoffDelay(this.reconnectAttempts);
                    dataSchemas.logger.info(`${this.getLogPrefix()} Reconnecting ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} (delay: ${delay}ms)`);
                    yield new Promise((resolve) => setTimeout(resolve, delay));
                    try {
                        yield this.connect();
                        this.reconnectAttempts = 0;
                        return;
                    }
                    catch (error) {
                        dataSchemas.logger.error(`${this.getLogPrefix()} Reconnection attempt failed:`, error);
                        if (this.reconnectAttempts === this.MAX_RECONNECT_ATTEMPTS ||
                            this.shouldStopReconnecting) {
                            dataSchemas.logger.error(`${this.getLogPrefix()} Stopping reconnection attempts`);
                            return;
                        }
                    }
                }
            }
            finally {
                this.isReconnecting = false;
            }
        });
    }
    subscribeToResources() {
        this.client.setNotificationHandler(types_js.ResourceListChangedNotificationSchema, () => __awaiter(this, void 0, void 0, function* () {
            this.emit('resourcesChanged');
        }));
    }
    connectClient() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.connectionState === 'connected') {
                return;
            }
            if (this.connectPromise) {
                return this.connectPromise;
            }
            if (this.shouldStopReconnecting) {
                return;
            }
            this.emit('connectionChange', 'connecting');
            this.connectPromise = (() => __awaiter(this, void 0, void 0, function* () {
                var _a, _b;
                try {
                    if (this.transport) {
                        try {
                            yield this.client.close();
                            this.transport = null;
                        }
                        catch (error) {
                            dataSchemas.logger.warn(`${this.getLogPrefix()} Error closing connection:`, error);
                        }
                    }
                    this.transport = this.constructTransport(this.options);
                    this.setupTransportDebugHandlers();
                    const connectTimeout = (_a = this.options.initTimeout) !== null && _a !== void 0 ? _a : 120000;
                    yield Promise.race([
                        this.client.connect(this.transport),
                        new Promise((_resolve, reject) => setTimeout(() => reject(new Error(`Connection timeout after ${connectTimeout}ms`)), connectTimeout)),
                    ]);
                    this.connectionState = 'connected';
                    this.emit('connectionChange', 'connected');
                    this.reconnectAttempts = 0;
                }
                catch (error) {
                    // Check if it's an OAuth authentication error
                    if (this.isOAuthError(error)) {
                        dataSchemas.logger.warn(`${this.getLogPrefix()} OAuth authentication required`);
                        this.oauthRequired = true;
                        const serverUrl = this.url;
                        dataSchemas.logger.debug(`${this.getLogPrefix()} Server URL for OAuth: ${serverUrl}`);
                        const oauthTimeout = (_b = this.options.initTimeout) !== null && _b !== void 0 ? _b : 60000 * 2;
                        /** Promise that will resolve when OAuth is handled */
                        const oauthHandledPromise = new Promise((resolve, reject) => {
                            let timeoutId = null;
                            let oauthHandledListener = null;
                            let oauthFailedListener = null;
                            /** Cleanup function to remove listeners and clear timeout */
                            const cleanup = () => {
                                if (timeoutId) {
                                    clearTimeout(timeoutId);
                                }
                                if (oauthHandledListener) {
                                    this.off('oauthHandled', oauthHandledListener);
                                }
                                if (oauthFailedListener) {
                                    this.off('oauthFailed', oauthFailedListener);
                                }
                            };
                            // Success handler
                            oauthHandledListener = () => {
                                cleanup();
                                resolve();
                            };
                            // Failure handler
                            oauthFailedListener = (error) => {
                                cleanup();
                                reject(error);
                            };
                            // Timeout handler
                            timeoutId = setTimeout(() => {
                                cleanup();
                                reject(new Error(`OAuth handling timeout after ${oauthTimeout}ms`));
                            }, oauthTimeout);
                            // Listen for both success and failure events
                            this.once('oauthHandled', oauthHandledListener);
                            this.once('oauthFailed', oauthFailedListener);
                        });
                        // Emit the event
                        this.emit('oauthRequired', {
                            serverName: this.serverName,
                            error,
                            serverUrl,
                            userId: this.userId,
                        });
                        try {
                            // Wait for OAuth to be handled
                            yield oauthHandledPromise;
                            // Reset the oauthRequired flag
                            this.oauthRequired = false;
                            // Don't throw the error - just return so connection can be retried
                            dataSchemas.logger.info(`${this.getLogPrefix()} OAuth handled successfully, connection will be retried`);
                            return;
                        }
                        catch (oauthError) {
                            // OAuth failed or timed out
                            this.oauthRequired = false;
                            dataSchemas.logger.error(`${this.getLogPrefix()} OAuth handling failed:`, oauthError);
                            // Re-throw the original authentication error
                            throw error;
                        }
                    }
                    this.connectionState = 'error';
                    this.emit('connectionChange', 'error');
                    throw error;
                }
                finally {
                    this.connectPromise = null;
                }
            }))();
            return this.connectPromise;
        });
    }
    setupTransportDebugHandlers() {
        if (!this.transport) {
            return;
        }
        this.transport.onmessage = (msg) => {
            dataSchemas.logger.debug(`${this.getLogPrefix()} Transport received: ${JSON.stringify(msg)}`);
        };
        const originalSend = this.transport.send.bind(this.transport);
        this.transport.send = (msg) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            if ('result' in msg && !('method' in msg) && Object.keys((_a = msg.result) !== null && _a !== void 0 ? _a : {}).length === 0) {
                if (Date.now() - this.lastPingTime < FIVE_MINUTES) {
                    throw new Error('Empty result');
                }
                this.lastPingTime = Date.now();
            }
            dataSchemas.logger.debug(`${this.getLogPrefix()} Transport sending: ${JSON.stringify(msg)}`);
            return originalSend(msg);
        });
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.disconnect();
                yield this.connectClient();
                if (!(yield this.isConnected())) {
                    throw new Error('Connection not established');
                }
            }
            catch (error) {
                dataSchemas.logger.error(`${this.getLogPrefix()} Connection failed:`, error);
                throw error;
            }
        });
    }
    setupTransportErrorHandlers(transport) {
        transport.onerror = (error) => {
            dataSchemas.logger.error(`${this.getLogPrefix()} Transport error:`, error);
            // Check if it's an OAuth authentication error
            if (error && typeof error === 'object' && 'code' in error) {
                const errorCode = error.code;
                if (errorCode === 401 || errorCode === 403) {
                    dataSchemas.logger.warn(`${this.getLogPrefix()} OAuth authentication error detected`);
                    this.emit('oauthError', error);
                }
            }
            this.emit('connectionChange', 'error');
        };
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.transport) {
                    yield this.client.close();
                    this.transport = null;
                }
                if (this.connectionState === 'disconnected') {
                    return;
                }
                this.connectionState = 'disconnected';
                this.emit('connectionChange', 'disconnected');
            }
            finally {
                this.connectPromise = null;
            }
        });
    }
    fetchResources() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { resources } = yield this.client.listResources();
                return resources;
            }
            catch (error) {
                this.emitError(error, 'Failed to fetch resources:');
                return [];
            }
        });
    }
    fetchTools() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { tools } = yield this.client.listTools();
                return tools;
            }
            catch (error) {
                this.emitError(error, 'Failed to fetch tools:');
                return [];
            }
        });
    }
    fetchPrompts() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { prompts } = yield this.client.listPrompts();
                return prompts;
            }
            catch (error) {
                this.emitError(error, 'Failed to fetch prompts:');
                return [];
            }
        });
    }
    isConnected() {
        return __awaiter(this, void 0, void 0, function* () {
            // First check if we're in a connected state
            if (this.connectionState !== 'connected') {
                return false;
            }
            // If we recently checked, skip expensive verification
            const now = Date.now();
            if (now - this.lastConnectionCheckAt < mcpConfig.CONNECTION_CHECK_TTL) {
                return true;
            }
            this.lastConnectionCheckAt = now;
            try {
                // Try ping first as it's the lightest check
                yield this.client.ping();
                return this.connectionState === 'connected';
            }
            catch (error) {
                // Check if the error is because ping is not supported (method not found)
                const pingUnsupported = error instanceof Error &&
                    ((error === null || error === void 0 ? void 0 : error.message.includes('-32601')) ||
                        (error === null || error === void 0 ? void 0 : error.message.includes('invalid method ping')) ||
                        (error === null || error === void 0 ? void 0 : error.message.includes('method not found')));
                if (!pingUnsupported) {
                    dataSchemas.logger.error(`${this.getLogPrefix()} Ping failed:`, error);
                    return false;
                }
                // Ping is not supported by this server, try an alternative verification
                dataSchemas.logger.debug(`${this.getLogPrefix()} Server does not support ping method, verifying connection with capabilities`);
                try {
                    // Get server capabilities to verify connection is truly active
                    const capabilities = this.client.getServerCapabilities();
                    // If we have capabilities, try calling a supported method to verify connection
                    if (capabilities === null || capabilities === void 0 ? void 0 : capabilities.tools) {
                        yield this.client.listTools();
                        return this.connectionState === 'connected';
                    }
                    else if (capabilities === null || capabilities === void 0 ? void 0 : capabilities.resources) {
                        yield this.client.listResources();
                        return this.connectionState === 'connected';
                    }
                    else if (capabilities === null || capabilities === void 0 ? void 0 : capabilities.prompts) {
                        yield this.client.listPrompts();
                        return this.connectionState === 'connected';
                    }
                    else {
                        // No capabilities to test, but we're in connected state and initialization succeeded
                        dataSchemas.logger.debug(`${this.getLogPrefix()} No capabilities to test, assuming connected based on state`);
                        return this.connectionState === 'connected';
                    }
                }
                catch (capabilityError) {
                    // If capability check fails, the connection is likely broken
                    dataSchemas.logger.error(`${this.getLogPrefix()} Connection verification failed:`, capabilityError);
                    return false;
                }
            }
        });
    }
    setOAuthTokens(tokens) {
        this.oauthTokens = tokens;
    }
    isOAuthError(error) {
        if (!error || typeof error !== 'object') {
            return false;
        }
        // Check for SSE error with 401 status
        if ('message' in error && typeof error.message === 'string') {
            return error.message.includes('401') || error.message.includes('Non-200 status code (401)');
        }
        // Check for error code
        if ('code' in error) {
            const code = error.code;
            return code === 401 || code === 403;
        }
        return false;
    }
}

/**
 * Factory for creating MCP connections with optional OAuth authentication.
 * Handles OAuth flows, token management, and connection retry logic.
 * NOTE: Much of the OAuth logic was extracted from the old MCPManager class as is.
 */
class MCPConnectionFactory {
    /** Creates a new MCP connection with optional OAuth support */
    static create(basic, oauth) {
        return __awaiter(this, void 0, void 0, function* () {
            const factory = new this(basic, oauth);
            return factory.createConnection();
        });
    }
    constructor(basic, oauth) {
        this.serverConfig = processMCPEnv({
            options: basic.serverConfig,
            user: oauth === null || oauth === void 0 ? void 0 : oauth.user,
            customUserVars: oauth === null || oauth === void 0 ? void 0 : oauth.customUserVars,
            body: oauth === null || oauth === void 0 ? void 0 : oauth.requestBody,
        });
        this.serverName = basic.serverName;
        this.useOAuth = !!(oauth === null || oauth === void 0 ? void 0 : oauth.useOAuth);
        this.connectionTimeout = oauth === null || oauth === void 0 ? void 0 : oauth.connectionTimeout;
        this.logPrefix = (oauth === null || oauth === void 0 ? void 0 : oauth.user)
            ? `[MCP][${basic.serverName}][${oauth.user.id}]`
            : `[MCP][${basic.serverName}]`;
        if (oauth === null || oauth === void 0 ? void 0 : oauth.useOAuth) {
            this.userId = oauth.user.id;
            this.flowManager = oauth.flowManager;
            this.tokenMethods = oauth.tokenMethods;
            this.signal = oauth.signal;
            this.oauthStart = oauth.oauthStart;
            this.oauthEnd = oauth.oauthEnd;
            this.returnOnOAuth = oauth.returnOnOAuth;
        }
    }
    /** Creates the base MCP connection with OAuth tokens */
    createConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            const oauthTokens = this.useOAuth ? yield this.getOAuthTokens() : null;
            const connection = new MCPConnection({
                serverName: this.serverName,
                serverConfig: this.serverConfig,
                userId: this.userId,
                oauthTokens,
            });
            let cleanupOAuthHandlers = null;
            if (this.useOAuth) {
                cleanupOAuthHandlers = this.handleOAuthEvents(connection);
            }
            try {
                yield this.attemptToConnect(connection);
                if (cleanupOAuthHandlers) {
                    cleanupOAuthHandlers();
                }
                return connection;
            }
            catch (error) {
                if (cleanupOAuthHandlers) {
                    cleanupOAuthHandlers();
                }
                throw error;
            }
        });
    }
    /** Retrieves existing OAuth tokens from storage or returns null */
    getOAuthTokens() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (!((_a = this.tokenMethods) === null || _a === void 0 ? void 0 : _a.findToken))
                return null;
            try {
                const flowId = MCPOAuthHandler.generateFlowId(this.userId, this.serverName);
                const tokens = yield this.flowManager.createFlowWithHandler(flowId, 'mcp_get_tokens', () => __awaiter(this, void 0, void 0, function* () {
                    return yield MCPTokenStorage.getTokens({
                        userId: this.userId,
                        serverName: this.serverName,
                        findToken: this.tokenMethods.findToken,
                        createToken: this.tokenMethods.createToken,
                        updateToken: this.tokenMethods.updateToken,
                        refreshTokens: this.createRefreshTokensFunction(),
                    });
                }), this.signal);
                if (tokens)
                    dataSchemas.logger.info(`${this.logPrefix} Loaded OAuth tokens`);
                return tokens;
            }
            catch (error) {
                dataSchemas.logger.debug(`${this.logPrefix} No existing tokens found or error loading tokens`, error);
                return null;
            }
        });
    }
    /** Creates a function to refresh OAuth tokens when they expire */
    createRefreshTokensFunction() {
        return (refreshToken, metadata) => __awaiter(this, void 0, void 0, function* () {
            return yield MCPOAuthHandler.refreshOAuthTokens(refreshToken, {
                serverUrl: this.serverConfig.url,
                serverName: metadata.serverName,
                clientInfo: metadata.clientInfo,
            }, this.serverConfig.oauth);
        });
    }
    /** Sets up OAuth event handlers for the connection */
    handleOAuthEvents(connection) {
        const oauthHandler = (data) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            dataSchemas.logger.info(`${this.logPrefix} oauthRequired event received`);
            // If we just want to initiate OAuth and return, handle it differently
            if (this.returnOnOAuth) {
                try {
                    const config = this.serverConfig;
                    const { authorizationUrl, flowId, flowMetadata } = yield MCPOAuthHandler.initiateOAuthFlow(this.serverName, data.serverUrl || '', this.userId, config === null || config === void 0 ? void 0 : config.oauth);
                    // Create the flow state so the OAuth callback can find it
                    // We spawn this in the background without waiting for it
                    this.flowManager.createFlow(flowId, 'mcp_oauth', flowMetadata).catch(() => {
                        // The OAuth callback will resolve this flow, so we expect it to timeout here
                        // which is fine - we just need the flow state to exist
                    });
                    if (this.oauthStart) {
                        dataSchemas.logger.info(`${this.logPrefix} OAuth flow started, issuing authorization URL`);
                        yield this.oauthStart(authorizationUrl);
                    }
                    // Emit oauthFailed to signal that connection should not proceed
                    // but OAuth was successfully initiated
                    connection.emit('oauthFailed', new Error('OAuth flow initiated - return early'));
                    return;
                }
                catch (error) {
                    dataSchemas.logger.error(`${this.logPrefix} Failed to initiate OAuth flow`, error);
                    connection.emit('oauthFailed', new Error('OAuth initiation failed'));
                    return;
                }
            }
            // Normal OAuth handling - wait for completion
            const result = yield this.handleOAuthRequired();
            if ((result === null || result === void 0 ? void 0 : result.tokens) && ((_a = this.tokenMethods) === null || _a === void 0 ? void 0 : _a.createToken)) {
                try {
                    connection.setOAuthTokens(result.tokens);
                    yield MCPTokenStorage.storeTokens({
                        userId: this.userId,
                        serverName: this.serverName,
                        tokens: result.tokens,
                        createToken: this.tokenMethods.createToken,
                        updateToken: this.tokenMethods.updateToken,
                        findToken: this.tokenMethods.findToken,
                        clientInfo: result.clientInfo,
                        metadata: result.metadata,
                    });
                    dataSchemas.logger.info(`${this.logPrefix} OAuth tokens saved to storage`);
                }
                catch (error) {
                    dataSchemas.logger.error(`${this.logPrefix} Failed to save OAuth tokens to storage`, error);
                }
            }
            // Only emit oauthHandled if we actually got tokens (OAuth succeeded)
            if (result === null || result === void 0 ? void 0 : result.tokens) {
                connection.emit('oauthHandled');
            }
            else {
                // OAuth failed, emit oauthFailed to properly reject the promise
                dataSchemas.logger.warn(`${this.logPrefix} OAuth failed, emitting oauthFailed event`);
                connection.emit('oauthFailed', new Error('OAuth authentication failed'));
            }
        });
        connection.on('oauthRequired', oauthHandler);
        /** Handler reference for cleanup when connection state changes to disconnected */
        const cleanupHandler = (state) => {
            if (state === 'disconnected') {
                connection.removeListener('oauthRequired', oauthHandler);
                connection.removeListener('connectionChange', cleanupHandler);
            }
        };
        connection.on('connectionChange', cleanupHandler);
        return () => {
            connection.removeListener('oauthRequired', oauthHandler);
            connection.removeListener('connectionChange', cleanupHandler);
        };
    }
    /** Attempts to establish connection with timeout handling */
    attemptToConnect(connection) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const connectTimeout = (_b = (_a = this.connectionTimeout) !== null && _a !== void 0 ? _a : this.serverConfig.initTimeout) !== null && _b !== void 0 ? _b : 30000;
            const connectionTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`Connection timeout after ${connectTimeout}ms`)), connectTimeout));
            const connectionAttempt = this.connectTo(connection);
            yield Promise.race([connectionAttempt, connectionTimeout]);
            if (yield connection.isConnected())
                return;
            dataSchemas.logger.error(`${this.logPrefix} Failed to establish connection.`);
        });
    }
    // Handles connection attempts with retry logic and OAuth error handling
    connectTo(connection) {
        return __awaiter(this, void 0, void 0, function* () {
            const maxAttempts = 3;
            let attempts = 0;
            let oauthHandled = false;
            while (attempts < maxAttempts) {
                try {
                    yield connection.connect();
                    if (yield connection.isConnected()) {
                        return;
                    }
                    throw new Error('Connection attempt succeeded but status is not connected');
                }
                catch (error) {
                    attempts++;
                    if (this.useOAuth && this.isOAuthError(error)) {
                        // Only handle OAuth if this is a user connection (has oauthStart handler)
                        if (this.oauthStart && !oauthHandled) {
                            const errorWithFlag = error;
                            if (errorWithFlag === null || errorWithFlag === void 0 ? void 0 : errorWithFlag.isOAuthError) {
                                oauthHandled = true;
                                dataSchemas.logger.info(`${this.logPrefix} Handling OAuth`);
                                yield this.handleOAuthRequired();
                            }
                        }
                        // Don't retry on OAuth errors - just throw
                        dataSchemas.logger.info(`${this.logPrefix} OAuth required, stopping connection attempts`);
                        throw error;
                    }
                    if (attempts === maxAttempts) {
                        dataSchemas.logger.error(`${this.logPrefix} Failed to connect after ${maxAttempts} attempts`, error);
                        throw error;
                    }
                    yield new Promise((resolve) => setTimeout(resolve, 2000 * attempts));
                }
            }
        });
    }
    // Determines if an error indicates OAuth authentication is required
    isOAuthError(error) {
        if (!error || typeof error !== 'object') {
            return false;
        }
        // Check for SSE error with 401 status
        if ('message' in error && typeof error.message === 'string') {
            return error.message.includes('401') || error.message.includes('Non-200 status code (401)');
        }
        // Check for error code
        if ('code' in error) {
            const code = error.code;
            return code === 401 || code === 403;
        }
        return false;
    }
    /** Manages OAuth flow initiation and completion */
    handleOAuthRequired() {
        return __awaiter(this, void 0, void 0, function* () {
            const serverUrl = this.serverConfig.url;
            dataSchemas.logger.debug(`${this.logPrefix} \`handleOAuthRequired\` called with serverUrl: ${serverUrl}`);
            if (!this.flowManager || !serverUrl) {
                dataSchemas.logger.error(`${this.logPrefix} OAuth required but flow manager not available or server URL missing for ${this.serverName}`);
                dataSchemas.logger.warn(`${this.logPrefix} Please configure OAuth credentials for ${this.serverName}`);
                return null;
            }
            try {
                dataSchemas.logger.debug(`${this.logPrefix} Checking for existing OAuth flow for ${this.serverName}...`);
                /** Flow ID to check if a flow already exists */
                const flowId = MCPOAuthHandler.generateFlowId(this.userId, this.serverName);
                /** Check if there's already an ongoing OAuth flow for this flowId */
                const existingFlow = yield this.flowManager.getFlowState(flowId, 'mcp_oauth');
                if (existingFlow && existingFlow.status === 'PENDING') {
                    dataSchemas.logger.debug(`${this.logPrefix} OAuth flow already exists for ${flowId}, waiting for completion`);
                    /** Tokens from existing flow to complete */
                    const tokens = yield this.flowManager.createFlow(flowId, 'mcp_oauth');
                    if (typeof this.oauthEnd === 'function') {
                        yield this.oauthEnd();
                    }
                    dataSchemas.logger.info(`${this.logPrefix} OAuth flow completed, tokens received for ${this.serverName}`);
                    /** Client information from the existing flow metadata */
                    const existingMetadata = existingFlow.metadata;
                    const clientInfo = existingMetadata === null || existingMetadata === void 0 ? void 0 : existingMetadata.clientInfo;
                    return { tokens, clientInfo };
                }
                dataSchemas.logger.debug(`${this.logPrefix} Initiating new OAuth flow for ${this.serverName}...`);
                const { authorizationUrl, flowId: newFlowId, flowMetadata, } = yield MCPOAuthHandler.initiateOAuthFlow(this.serverName, serverUrl, this.userId, this.serverConfig.oauth);
                if (typeof this.oauthStart === 'function') {
                    dataSchemas.logger.info(`${this.logPrefix} OAuth flow started, issued authorization URL to user`);
                    yield this.oauthStart(authorizationUrl);
                }
                else {
                    dataSchemas.logger.info(`${this.logPrefix} OAuth flow started, no \`oauthStart\` handler defined, relying on callback endpoint`);
                }
                /** Tokens from the new flow */
                const tokens = yield this.flowManager.createFlow(newFlowId, 'mcp_oauth', flowMetadata, this.signal);
                if (typeof this.oauthEnd === 'function') {
                    yield this.oauthEnd();
                }
                dataSchemas.logger.info(`${this.logPrefix} OAuth flow completed, tokens received for ${this.serverName}`);
                /** Client information from the flow metadata */
                const clientInfo = flowMetadata === null || flowMetadata === void 0 ? void 0 : flowMetadata.clientInfo;
                const metadata = flowMetadata === null || flowMetadata === void 0 ? void 0 : flowMetadata.metadata;
                return {
                    tokens,
                    clientInfo,
                    metadata,
                };
            }
            catch (error) {
                dataSchemas.logger.error(`${this.logPrefix} Failed to complete OAuth flow for ${this.serverName}`, error);
                return null;
            }
        });
    }
}

var ListCache$2 = _ListCache;

/**
 * Removes all key-value entries from the stack.
 *
 * @private
 * @name clear
 * @memberOf Stack
 */
function stackClear$1() {
  this.__data__ = new ListCache$2;
  this.size = 0;
}

var _stackClear = stackClear$1;

/**
 * Removes `key` and its value from the stack.
 *
 * @private
 * @name delete
 * @memberOf Stack
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */

function stackDelete$1(key) {
  var data = this.__data__,
      result = data['delete'](key);

  this.size = data.size;
  return result;
}

var _stackDelete = stackDelete$1;

/**
 * Gets the stack value for `key`.
 *
 * @private
 * @name get
 * @memberOf Stack
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */

function stackGet$1(key) {
  return this.__data__.get(key);
}

var _stackGet = stackGet$1;

/**
 * Checks if a stack value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Stack
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */

function stackHas$1(key) {
  return this.__data__.has(key);
}

var _stackHas = stackHas$1;

var ListCache$1 = _ListCache,
    Map$2 = _Map,
    MapCache$1 = _MapCache;

/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE = 200;

/**
 * Sets the stack `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Stack
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the stack cache instance.
 */
function stackSet$1(key, value) {
  var data = this.__data__;
  if (data instanceof ListCache$1) {
    var pairs = data.__data__;
    if (!Map$2 || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
      pairs.push([key, value]);
      this.size = ++data.size;
      return this;
    }
    data = this.__data__ = new MapCache$1(pairs);
  }
  data.set(key, value);
  this.size = data.size;
  return this;
}

var _stackSet = stackSet$1;

var ListCache = _ListCache,
    stackClear = _stackClear,
    stackDelete = _stackDelete,
    stackGet = _stackGet,
    stackHas = _stackHas,
    stackSet = _stackSet;

/**
 * Creates a stack cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Stack$2(entries) {
  var data = this.__data__ = new ListCache(entries);
  this.size = data.size;
}

// Add methods to `Stack`.
Stack$2.prototype.clear = stackClear;
Stack$2.prototype['delete'] = stackDelete;
Stack$2.prototype.get = stackGet;
Stack$2.prototype.has = stackHas;
Stack$2.prototype.set = stackSet;

var _Stack = Stack$2;

/** Used to stand-in for `undefined` hash values. */

var HASH_UNDEFINED = '__lodash_hash_undefined__';

/**
 * Adds `value` to the array cache.
 *
 * @private
 * @name add
 * @memberOf SetCache
 * @alias push
 * @param {*} value The value to cache.
 * @returns {Object} Returns the cache instance.
 */
function setCacheAdd$1(value) {
  this.__data__.set(value, HASH_UNDEFINED);
  return this;
}

var _setCacheAdd = setCacheAdd$1;

/**
 * Checks if `value` is in the array cache.
 *
 * @private
 * @name has
 * @memberOf SetCache
 * @param {*} value The value to search for.
 * @returns {number} Returns `true` if `value` is found, else `false`.
 */

function setCacheHas$1(value) {
  return this.__data__.has(value);
}

var _setCacheHas = setCacheHas$1;

var MapCache = _MapCache,
    setCacheAdd = _setCacheAdd,
    setCacheHas = _setCacheHas;

/**
 *
 * Creates an array cache object to store unique values.
 *
 * @private
 * @constructor
 * @param {Array} [values] The values to cache.
 */
function SetCache$1(values) {
  var index = -1,
      length = values == null ? 0 : values.length;

  this.__data__ = new MapCache;
  while (++index < length) {
    this.add(values[index]);
  }
}

// Add methods to `SetCache`.
SetCache$1.prototype.add = SetCache$1.prototype.push = setCacheAdd;
SetCache$1.prototype.has = setCacheHas;

var _SetCache = SetCache$1;

/**
 * A specialized version of `_.some` for arrays without support for iteratee
 * shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {boolean} Returns `true` if any element passes the predicate check,
 *  else `false`.
 */

function arraySome$1(array, predicate) {
  var index = -1,
      length = array == null ? 0 : array.length;

  while (++index < length) {
    if (predicate(array[index], index, array)) {
      return true;
    }
  }
  return false;
}

var _arraySome = arraySome$1;

/**
 * Checks if a `cache` value for `key` exists.
 *
 * @private
 * @param {Object} cache The cache to query.
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */

function cacheHas$1(cache, key) {
  return cache.has(key);
}

var _cacheHas = cacheHas$1;

var SetCache = _SetCache,
    arraySome = _arraySome,
    cacheHas = _cacheHas;

/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG$5 = 1,
    COMPARE_UNORDERED_FLAG$3 = 2;

/**
 * A specialized version of `baseIsEqualDeep` for arrays with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Array} array The array to compare.
 * @param {Array} other The other array to compare.
 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
 * @param {Function} customizer The function to customize comparisons.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Object} stack Tracks traversed `array` and `other` objects.
 * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
 */
function equalArrays$2(array, other, bitmask, customizer, equalFunc, stack) {
  var isPartial = bitmask & COMPARE_PARTIAL_FLAG$5,
      arrLength = array.length,
      othLength = other.length;

  if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
    return false;
  }
  // Check that cyclic values are equal.
  var arrStacked = stack.get(array);
  var othStacked = stack.get(other);
  if (arrStacked && othStacked) {
    return arrStacked == other && othStacked == array;
  }
  var index = -1,
      result = true,
      seen = (bitmask & COMPARE_UNORDERED_FLAG$3) ? new SetCache : undefined;

  stack.set(array, other);
  stack.set(other, array);

  // Ignore non-index properties.
  while (++index < arrLength) {
    var arrValue = array[index],
        othValue = other[index];

    if (customizer) {
      var compared = isPartial
        ? customizer(othValue, arrValue, index, other, array, stack)
        : customizer(arrValue, othValue, index, array, other, stack);
    }
    if (compared !== undefined) {
      if (compared) {
        continue;
      }
      result = false;
      break;
    }
    // Recursively compare arrays (susceptible to call stack limits).
    if (seen) {
      if (!arraySome(other, function(othValue, othIndex) {
            if (!cacheHas(seen, othIndex) &&
                (arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
              return seen.push(othIndex);
            }
          })) {
        result = false;
        break;
      }
    } else if (!(
          arrValue === othValue ||
            equalFunc(arrValue, othValue, bitmask, customizer, stack)
        )) {
      result = false;
      break;
    }
  }
  stack['delete'](array);
  stack['delete'](other);
  return result;
}

var _equalArrays = equalArrays$2;

var root$4 = _root;

/** Built-in value references. */
var Uint8Array$2 = root$4.Uint8Array;

var _Uint8Array = Uint8Array$2;

/**
 * Converts `map` to its key-value pairs.
 *
 * @private
 * @param {Object} map The map to convert.
 * @returns {Array} Returns the key-value pairs.
 */

function mapToArray$1(map) {
  var index = -1,
      result = Array(map.size);

  map.forEach(function(value, key) {
    result[++index] = [key, value];
  });
  return result;
}

var _mapToArray = mapToArray$1;

/**
 * Converts `set` to an array of its values.
 *
 * @private
 * @param {Object} set The set to convert.
 * @returns {Array} Returns the values.
 */

function setToArray$1(set) {
  var index = -1,
      result = Array(set.size);

  set.forEach(function(value) {
    result[++index] = value;
  });
  return result;
}

var _setToArray = setToArray$1;

var Symbol = _Symbol,
    Uint8Array$1 = _Uint8Array,
    eq = eq_1,
    equalArrays$1 = _equalArrays,
    mapToArray = _mapToArray,
    setToArray = _setToArray;

/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG$4 = 1,
    COMPARE_UNORDERED_FLAG$2 = 2;

/** `Object#toString` result references. */
var boolTag$1 = '[object Boolean]',
    dateTag$1 = '[object Date]',
    errorTag$1 = '[object Error]',
    mapTag$2 = '[object Map]',
    numberTag$1 = '[object Number]',
    regexpTag$1 = '[object RegExp]',
    setTag$2 = '[object Set]',
    stringTag$1 = '[object String]',
    symbolTag = '[object Symbol]';

var arrayBufferTag$1 = '[object ArrayBuffer]',
    dataViewTag$2 = '[object DataView]';

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol ? Symbol.prototype : undefined,
    symbolValueOf = symbolProto ? symbolProto.valueOf : undefined;

/**
 * A specialized version of `baseIsEqualDeep` for comparing objects of
 * the same `toStringTag`.
 *
 * **Note:** This function only supports comparing values with tags of
 * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {string} tag The `toStringTag` of the objects to compare.
 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
 * @param {Function} customizer The function to customize comparisons.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Object} stack Tracks traversed `object` and `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalByTag$1(object, other, tag, bitmask, customizer, equalFunc, stack) {
  switch (tag) {
    case dataViewTag$2:
      if ((object.byteLength != other.byteLength) ||
          (object.byteOffset != other.byteOffset)) {
        return false;
      }
      object = object.buffer;
      other = other.buffer;

    case arrayBufferTag$1:
      if ((object.byteLength != other.byteLength) ||
          !equalFunc(new Uint8Array$1(object), new Uint8Array$1(other))) {
        return false;
      }
      return true;

    case boolTag$1:
    case dateTag$1:
    case numberTag$1:
      // Coerce booleans to `1` or `0` and dates to milliseconds.
      // Invalid dates are coerced to `NaN`.
      return eq(+object, +other);

    case errorTag$1:
      return object.name == other.name && object.message == other.message;

    case regexpTag$1:
    case stringTag$1:
      // Coerce regexes to strings and treat strings, primitives and objects,
      // as equal. See http://www.ecma-international.org/ecma-262/7.0/#sec-regexp.prototype.tostring
      // for more details.
      return object == (other + '');

    case mapTag$2:
      var convert = mapToArray;

    case setTag$2:
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG$4;
      convert || (convert = setToArray);

      if (object.size != other.size && !isPartial) {
        return false;
      }
      // Assume cyclic values are equal.
      var stacked = stack.get(object);
      if (stacked) {
        return stacked == other;
      }
      bitmask |= COMPARE_UNORDERED_FLAG$2;

      // Recursively compare objects (susceptible to call stack limits).
      stack.set(object, other);
      var result = equalArrays$1(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
      stack['delete'](object);
      return result;

    case symbolTag:
      if (symbolValueOf) {
        return symbolValueOf.call(object) == symbolValueOf.call(other);
      }
  }
  return false;
}

var _equalByTag = equalByTag$1;

var arrayPush$1 = _arrayPush,
    isArray$3 = isArray_1;

/**
 * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
 * `keysFunc` and `symbolsFunc` to get the enumerable property names and
 * symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @param {Function} symbolsFunc The function to get the symbols of `object`.
 * @returns {Array} Returns the array of property names and symbols.
 */
function baseGetAllKeys$2(object, keysFunc, symbolsFunc) {
  var result = keysFunc(object);
  return isArray$3(object) ? result : arrayPush$1(result, symbolsFunc(object));
}

var _baseGetAllKeys = baseGetAllKeys$2;

/**
 * A specialized version of `_.filter` for arrays without support for
 * iteratee shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {Array} Returns the new filtered array.
 */

function arrayFilter$1(array, predicate) {
  var index = -1,
      length = array == null ? 0 : array.length,
      resIndex = 0,
      result = [];

  while (++index < length) {
    var value = array[index];
    if (predicate(value, index, array)) {
      result[resIndex++] = value;
    }
  }
  return result;
}

var _arrayFilter = arrayFilter$1;

/**
 * This method returns a new empty array.
 *
 * @static
 * @memberOf _
 * @since 4.13.0
 * @category Util
 * @returns {Array} Returns the new empty array.
 * @example
 *
 * var arrays = _.times(2, _.stubArray);
 *
 * console.log(arrays);
 * // => [[], []]
 *
 * console.log(arrays[0] === arrays[1]);
 * // => false
 */

function stubArray$2() {
  return [];
}

var stubArray_1 = stubArray$2;

var arrayFilter = _arrayFilter,
    stubArray$1 = stubArray_1;

/** Used for built-in method references. */
var objectProto$6 = Object.prototype;

/** Built-in value references. */
var propertyIsEnumerable = objectProto$6.propertyIsEnumerable;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeGetSymbols$1 = Object.getOwnPropertySymbols;

/**
 * Creates an array of the own enumerable symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of symbols.
 */
var getSymbols$2 = !nativeGetSymbols$1 ? stubArray$1 : function(object) {
  if (object == null) {
    return [];
  }
  object = Object(object);
  return arrayFilter(nativeGetSymbols$1(object), function(symbol) {
    return propertyIsEnumerable.call(object, symbol);
  });
};

var _getSymbols = getSymbols$2;

/**
 * The base implementation of `_.times` without support for iteratee shorthands
 * or max array length checks.
 *
 * @private
 * @param {number} n The number of times to invoke `iteratee`.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the array of results.
 */

function baseTimes$1(n, iteratee) {
  var index = -1,
      result = Array(n);

  while (++index < n) {
    result[index] = iteratee(index);
  }
  return result;
}

var _baseTimes = baseTimes$1;

var isBuffer$2 = {exports: {}};

/**
 * This method returns `false`.
 *
 * @static
 * @memberOf _
 * @since 4.13.0
 * @category Util
 * @returns {boolean} Returns `false`.
 * @example
 *
 * _.times(2, _.stubFalse);
 * // => [false, false]
 */

function stubFalse() {
  return false;
}

var stubFalse_1 = stubFalse;

isBuffer$2.exports;

(function (module, exports) {
	var root = _root,
	    stubFalse = stubFalse_1;

	/** Detect free variable `exports`. */
	var freeExports = exports && !exports.nodeType && exports;

	/** Detect free variable `module`. */
	var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

	/** Detect the popular CommonJS extension `module.exports`. */
	var moduleExports = freeModule && freeModule.exports === freeExports;

	/** Built-in value references. */
	var Buffer = moduleExports ? root.Buffer : undefined;

	/* Built-in method references for those with the same name as other `lodash` methods. */
	var nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined;

	/**
	 * Checks if `value` is a buffer.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.3.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
	 * @example
	 *
	 * _.isBuffer(new Buffer(2));
	 * // => true
	 *
	 * _.isBuffer(new Uint8Array(2));
	 * // => false
	 */
	var isBuffer = nativeIsBuffer || stubFalse;

	module.exports = isBuffer; 
} (isBuffer$2, isBuffer$2.exports));

var isBufferExports = isBuffer$2.exports;

var baseGetTag$1 = _baseGetTag,
    isLength$1 = isLength_1,
    isObjectLike$1 = isObjectLike_1;

/** `Object#toString` result references. */
var argsTag$1 = '[object Arguments]',
    arrayTag$1 = '[object Array]',
    boolTag = '[object Boolean]',
    dateTag = '[object Date]',
    errorTag = '[object Error]',
    funcTag = '[object Function]',
    mapTag$1 = '[object Map]',
    numberTag = '[object Number]',
    objectTag$2 = '[object Object]',
    regexpTag = '[object RegExp]',
    setTag$1 = '[object Set]',
    stringTag = '[object String]',
    weakMapTag$1 = '[object WeakMap]';

var arrayBufferTag = '[object ArrayBuffer]',
    dataViewTag$1 = '[object DataView]',
    float32Tag = '[object Float32Array]',
    float64Tag = '[object Float64Array]',
    int8Tag = '[object Int8Array]',
    int16Tag = '[object Int16Array]',
    int32Tag = '[object Int32Array]',
    uint8Tag = '[object Uint8Array]',
    uint8ClampedTag = '[object Uint8ClampedArray]',
    uint16Tag = '[object Uint16Array]',
    uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values of typed arrays. */
var typedArrayTags = {};
typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
typedArrayTags[uint32Tag] = true;
typedArrayTags[argsTag$1] = typedArrayTags[arrayTag$1] =
typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
typedArrayTags[dataViewTag$1] = typedArrayTags[dateTag] =
typedArrayTags[errorTag] = typedArrayTags[funcTag] =
typedArrayTags[mapTag$1] = typedArrayTags[numberTag] =
typedArrayTags[objectTag$2] = typedArrayTags[regexpTag] =
typedArrayTags[setTag$1] = typedArrayTags[stringTag] =
typedArrayTags[weakMapTag$1] = false;

/**
 * The base implementation of `_.isTypedArray` without Node.js optimizations.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
 */
function baseIsTypedArray$1(value) {
  return isObjectLike$1(value) &&
    isLength$1(value.length) && !!typedArrayTags[baseGetTag$1(value)];
}

var _baseIsTypedArray = baseIsTypedArray$1;

/**
 * The base implementation of `_.unary` without support for storing metadata.
 *
 * @private
 * @param {Function} func The function to cap arguments for.
 * @returns {Function} Returns the new capped function.
 */

function baseUnary$1(func) {
  return function(value) {
    return func(value);
  };
}

var _baseUnary = baseUnary$1;

var _nodeUtil = {exports: {}};

_nodeUtil.exports;

(function (module, exports) {
	var freeGlobal = _freeGlobal;

	/** Detect free variable `exports`. */
	var freeExports = exports && !exports.nodeType && exports;

	/** Detect free variable `module`. */
	var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

	/** Detect the popular CommonJS extension `module.exports`. */
	var moduleExports = freeModule && freeModule.exports === freeExports;

	/** Detect free variable `process` from Node.js. */
	var freeProcess = moduleExports && freeGlobal.process;

	/** Used to access faster Node.js helpers. */
	var nodeUtil = (function() {
	  try {
	    // Use `util.types` for Node.js 10+.
	    var types = freeModule && freeModule.require && freeModule.require('util').types;

	    if (types) {
	      return types;
	    }

	    // Legacy `process.binding('util')` for Node.js < 10.
	    return freeProcess && freeProcess.binding && freeProcess.binding('util');
	  } catch (e) {}
	}());

	module.exports = nodeUtil; 
} (_nodeUtil, _nodeUtil.exports));

var _nodeUtilExports = _nodeUtil.exports;

var baseIsTypedArray = _baseIsTypedArray,
    baseUnary = _baseUnary,
    nodeUtil = _nodeUtilExports;

/* Node.js helper references. */
var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;

/**
 * Checks if `value` is classified as a typed array.
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
 * @example
 *
 * _.isTypedArray(new Uint8Array);
 * // => true
 *
 * _.isTypedArray([]);
 * // => false
 */
var isTypedArray$2 = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;

var isTypedArray_1 = isTypedArray$2;

var baseTimes = _baseTimes,
    isArguments = isArguments_1,
    isArray$2 = isArray_1,
    isBuffer$1 = isBufferExports,
    isIndex = _isIndex,
    isTypedArray$1 = isTypedArray_1;

/** Used for built-in method references. */
var objectProto$5 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$4 = objectProto$5.hasOwnProperty;

/**
 * Creates an array of the enumerable property names of the array-like `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @param {boolean} inherited Specify returning inherited property names.
 * @returns {Array} Returns the array of property names.
 */
function arrayLikeKeys$2(value, inherited) {
  var isArr = isArray$2(value),
      isArg = !isArr && isArguments(value),
      isBuff = !isArr && !isArg && isBuffer$1(value),
      isType = !isArr && !isArg && !isBuff && isTypedArray$1(value),
      skipIndexes = isArr || isArg || isBuff || isType,
      result = skipIndexes ? baseTimes(value.length, String) : [],
      length = result.length;

  for (var key in value) {
    if ((inherited || hasOwnProperty$4.call(value, key)) &&
        !(skipIndexes && (
           // Safari 9 has enumerable `arguments.length` in strict mode.
           key == 'length' ||
           // Node.js 0.10 has enumerable non-index properties on buffers.
           (isBuff && (key == 'offset' || key == 'parent')) ||
           // PhantomJS 2 has enumerable non-index properties on typed arrays.
           (isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset')) ||
           // Skip index properties.
           isIndex(key, length)
        ))) {
      result.push(key);
    }
  }
  return result;
}

var _arrayLikeKeys = arrayLikeKeys$2;

/** Used for built-in method references. */

var objectProto$4 = Object.prototype;

/**
 * Checks if `value` is likely a prototype object.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
 */
function isPrototype$2(value) {
  var Ctor = value && value.constructor,
      proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto$4;

  return value === proto;
}

var _isPrototype = isPrototype$2;

/**
 * Creates a unary function that invokes `func` with its argument transformed.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {Function} transform The argument transform.
 * @returns {Function} Returns the new function.
 */

function overArg$2(func, transform) {
  return function(arg) {
    return func(transform(arg));
  };
}

var _overArg = overArg$2;

var overArg$1 = _overArg;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeKeys$1 = overArg$1(Object.keys, Object);

var _nativeKeys = nativeKeys$1;

var isPrototype$1 = _isPrototype,
    nativeKeys = _nativeKeys;

/** Used for built-in method references. */
var objectProto$3 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$3 = objectProto$3.hasOwnProperty;

/**
 * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function baseKeys$1(object) {
  if (!isPrototype$1(object)) {
    return nativeKeys(object);
  }
  var result = [];
  for (var key in Object(object)) {
    if (hasOwnProperty$3.call(object, key) && key != 'constructor') {
      result.push(key);
    }
  }
  return result;
}

var _baseKeys = baseKeys$1;

var isFunction = isFunction_1,
    isLength = isLength_1;

/**
 * Checks if `value` is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 * @example
 *
 * _.isArrayLike([1, 2, 3]);
 * // => true
 *
 * _.isArrayLike(document.body.children);
 * // => true
 *
 * _.isArrayLike('abc');
 * // => true
 *
 * _.isArrayLike(_.noop);
 * // => false
 */
function isArrayLike$2(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

var isArrayLike_1 = isArrayLike$2;

var arrayLikeKeys$1 = _arrayLikeKeys,
    baseKeys = _baseKeys,
    isArrayLike$1 = isArrayLike_1;

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
function keys$3(object) {
  return isArrayLike$1(object) ? arrayLikeKeys$1(object) : baseKeys(object);
}

var keys_1 = keys$3;

var baseGetAllKeys$1 = _baseGetAllKeys,
    getSymbols$1 = _getSymbols,
    keys$2 = keys_1;

/**
 * Creates an array of own enumerable property names and symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names and symbols.
 */
function getAllKeys$1(object) {
  return baseGetAllKeys$1(object, keys$2, getSymbols$1);
}

var _getAllKeys = getAllKeys$1;

var getAllKeys = _getAllKeys;

/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG$3 = 1;

/** Used for built-in method references. */
var objectProto$2 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$2 = objectProto$2.hasOwnProperty;

/**
 * A specialized version of `baseIsEqualDeep` for objects with support for
 * partial deep comparisons.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
 * @param {Function} customizer The function to customize comparisons.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Object} stack Tracks traversed `object` and `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function equalObjects$1(object, other, bitmask, customizer, equalFunc, stack) {
  var isPartial = bitmask & COMPARE_PARTIAL_FLAG$3,
      objProps = getAllKeys(object),
      objLength = objProps.length,
      othProps = getAllKeys(other),
      othLength = othProps.length;

  if (objLength != othLength && !isPartial) {
    return false;
  }
  var index = objLength;
  while (index--) {
    var key = objProps[index];
    if (!(isPartial ? key in other : hasOwnProperty$2.call(other, key))) {
      return false;
    }
  }
  // Check that cyclic values are equal.
  var objStacked = stack.get(object);
  var othStacked = stack.get(other);
  if (objStacked && othStacked) {
    return objStacked == other && othStacked == object;
  }
  var result = true;
  stack.set(object, other);
  stack.set(other, object);

  var skipCtor = isPartial;
  while (++index < objLength) {
    key = objProps[index];
    var objValue = object[key],
        othValue = other[key];

    if (customizer) {
      var compared = isPartial
        ? customizer(othValue, objValue, key, other, object, stack)
        : customizer(objValue, othValue, key, object, other, stack);
    }
    // Recursively compare objects (susceptible to call stack limits).
    if (!(compared === undefined
          ? (objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack))
          : compared
        )) {
      result = false;
      break;
    }
    skipCtor || (skipCtor = key == 'constructor');
  }
  if (result && !skipCtor) {
    var objCtor = object.constructor,
        othCtor = other.constructor;

    // Non `Object` object instances with different constructors are not equal.
    if (objCtor != othCtor &&
        ('constructor' in object && 'constructor' in other) &&
        !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
          typeof othCtor == 'function' && othCtor instanceof othCtor)) {
      result = false;
    }
  }
  stack['delete'](object);
  stack['delete'](other);
  return result;
}

var _equalObjects = equalObjects$1;

var getNative$3 = _getNative,
    root$3 = _root;

/* Built-in method references that are verified to be native. */
var DataView$1 = getNative$3(root$3, 'DataView');

var _DataView = DataView$1;

var getNative$2 = _getNative,
    root$2 = _root;

/* Built-in method references that are verified to be native. */
var Promise$2 = getNative$2(root$2, 'Promise');

var _Promise = Promise$2;

var getNative$1 = _getNative,
    root$1 = _root;

/* Built-in method references that are verified to be native. */
var Set$2 = getNative$1(root$1, 'Set');

var _Set = Set$2;

var getNative = _getNative,
    root = _root;

/* Built-in method references that are verified to be native. */
var WeakMap$1 = getNative(root, 'WeakMap');

var _WeakMap = WeakMap$1;

var DataView = _DataView,
    Map$1 = _Map,
    Promise$1 = _Promise,
    Set$1 = _Set,
    WeakMap = _WeakMap,
    baseGetTag = _baseGetTag,
    toSource = _toSource;

/** `Object#toString` result references. */
var mapTag = '[object Map]',
    objectTag$1 = '[object Object]',
    promiseTag = '[object Promise]',
    setTag = '[object Set]',
    weakMapTag = '[object WeakMap]';

var dataViewTag = '[object DataView]';

/** Used to detect maps, sets, and weakmaps. */
var dataViewCtorString = toSource(DataView),
    mapCtorString = toSource(Map$1),
    promiseCtorString = toSource(Promise$1),
    setCtorString = toSource(Set$1),
    weakMapCtorString = toSource(WeakMap);

/**
 * Gets the `toStringTag` of `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
var getTag$1 = baseGetTag;

// Fallback for data views, maps, sets, and weak maps in IE 11 and promises in Node.js < 6.
if ((DataView && getTag$1(new DataView(new ArrayBuffer(1))) != dataViewTag) ||
    (Map$1 && getTag$1(new Map$1) != mapTag) ||
    (Promise$1 && getTag$1(Promise$1.resolve()) != promiseTag) ||
    (Set$1 && getTag$1(new Set$1) != setTag) ||
    (WeakMap && getTag$1(new WeakMap) != weakMapTag)) {
  getTag$1 = function(value) {
    var result = baseGetTag(value),
        Ctor = result == objectTag$1 ? value.constructor : undefined,
        ctorString = Ctor ? toSource(Ctor) : '';

    if (ctorString) {
      switch (ctorString) {
        case dataViewCtorString: return dataViewTag;
        case mapCtorString: return mapTag;
        case promiseCtorString: return promiseTag;
        case setCtorString: return setTag;
        case weakMapCtorString: return weakMapTag;
      }
    }
    return result;
  };
}

var _getTag = getTag$1;

var Stack$1 = _Stack,
    equalArrays = _equalArrays,
    equalByTag = _equalByTag,
    equalObjects = _equalObjects,
    getTag = _getTag,
    isArray$1 = isArray_1,
    isBuffer = isBufferExports,
    isTypedArray = isTypedArray_1;

/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG$2 = 1;

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
    arrayTag = '[object Array]',
    objectTag = '[object Object]';

/** Used for built-in method references. */
var objectProto$1 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$1 = objectProto$1.hasOwnProperty;

/**
 * A specialized version of `baseIsEqual` for arrays and objects which performs
 * deep comparisons and tracks traversed objects enabling objects with circular
 * references to be compared.
 *
 * @private
 * @param {Object} object The object to compare.
 * @param {Object} other The other object to compare.
 * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
 * @param {Function} customizer The function to customize comparisons.
 * @param {Function} equalFunc The function to determine equivalents of values.
 * @param {Object} [stack] Tracks traversed `object` and `other` objects.
 * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
 */
function baseIsEqualDeep$1(object, other, bitmask, customizer, equalFunc, stack) {
  var objIsArr = isArray$1(object),
      othIsArr = isArray$1(other),
      objTag = objIsArr ? arrayTag : getTag(object),
      othTag = othIsArr ? arrayTag : getTag(other);

  objTag = objTag == argsTag ? objectTag : objTag;
  othTag = othTag == argsTag ? objectTag : othTag;

  var objIsObj = objTag == objectTag,
      othIsObj = othTag == objectTag,
      isSameTag = objTag == othTag;

  if (isSameTag && isBuffer(object)) {
    if (!isBuffer(other)) {
      return false;
    }
    objIsArr = true;
    objIsObj = false;
  }
  if (isSameTag && !objIsObj) {
    stack || (stack = new Stack$1);
    return (objIsArr || isTypedArray(object))
      ? equalArrays(object, other, bitmask, customizer, equalFunc, stack)
      : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
  }
  if (!(bitmask & COMPARE_PARTIAL_FLAG$2)) {
    var objIsWrapped = objIsObj && hasOwnProperty$1.call(object, '__wrapped__'),
        othIsWrapped = othIsObj && hasOwnProperty$1.call(other, '__wrapped__');

    if (objIsWrapped || othIsWrapped) {
      var objUnwrapped = objIsWrapped ? object.value() : object,
          othUnwrapped = othIsWrapped ? other.value() : other;

      stack || (stack = new Stack$1);
      return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
    }
  }
  if (!isSameTag) {
    return false;
  }
  stack || (stack = new Stack$1);
  return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
}

var _baseIsEqualDeep = baseIsEqualDeep$1;

var baseIsEqualDeep = _baseIsEqualDeep,
    isObjectLike = isObjectLike_1;

/**
 * The base implementation of `_.isEqual` which supports partial comparisons
 * and tracks traversed objects.
 *
 * @private
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @param {boolean} bitmask The bitmask flags.
 *  1 - Unordered comparison
 *  2 - Partial comparison
 * @param {Function} [customizer] The function to customize comparisons.
 * @param {Object} [stack] Tracks traversed `value` and `other` objects.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 */
function baseIsEqual$2(value, other, bitmask, customizer, stack) {
  if (value === other) {
    return true;
  }
  if (value == null || other == null || (!isObjectLike(value) && !isObjectLike(other))) {
    return value !== value && other !== other;
  }
  return baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual$2, stack);
}

var _baseIsEqual = baseIsEqual$2;

var Stack = _Stack,
    baseIsEqual$1 = _baseIsEqual;

/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG$1 = 1,
    COMPARE_UNORDERED_FLAG$1 = 2;

/**
 * The base implementation of `_.isMatch` without support for iteratee shorthands.
 *
 * @private
 * @param {Object} object The object to inspect.
 * @param {Object} source The object of property values to match.
 * @param {Array} matchData The property names, values, and compare flags to match.
 * @param {Function} [customizer] The function to customize comparisons.
 * @returns {boolean} Returns `true` if `object` is a match, else `false`.
 */
function baseIsMatch$1(object, source, matchData, customizer) {
  var index = matchData.length,
      length = index,
      noCustomizer = !customizer;

  if (object == null) {
    return !length;
  }
  object = Object(object);
  while (index--) {
    var data = matchData[index];
    if ((noCustomizer && data[2])
          ? data[1] !== object[data[0]]
          : !(data[0] in object)
        ) {
      return false;
    }
  }
  while (++index < length) {
    data = matchData[index];
    var key = data[0],
        objValue = object[key],
        srcValue = data[1];

    if (noCustomizer && data[2]) {
      if (objValue === undefined && !(key in object)) {
        return false;
      }
    } else {
      var stack = new Stack;
      if (customizer) {
        var result = customizer(objValue, srcValue, key, object, source, stack);
      }
      if (!(result === undefined
            ? baseIsEqual$1(srcValue, objValue, COMPARE_PARTIAL_FLAG$1 | COMPARE_UNORDERED_FLAG$1, customizer, stack)
            : result
          )) {
        return false;
      }
    }
  }
  return true;
}

var _baseIsMatch = baseIsMatch$1;

var isObject$1 = isObject_1;

/**
 * Checks if `value` is suitable for strict equality comparisons, i.e. `===`.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` if suitable for strict
 *  equality comparisons, else `false`.
 */
function isStrictComparable$2(value) {
  return value === value && !isObject$1(value);
}

var _isStrictComparable = isStrictComparable$2;

var isStrictComparable$1 = _isStrictComparable,
    keys$1 = keys_1;

/**
 * Gets the property names, values, and compare flags of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the match data of `object`.
 */
function getMatchData$1(object) {
  var result = keys$1(object),
      length = result.length;

  while (length--) {
    var key = result[length],
        value = object[key];

    result[length] = [key, value, isStrictComparable$1(value)];
  }
  return result;
}

var _getMatchData = getMatchData$1;

/**
 * A specialized version of `matchesProperty` for source values suitable
 * for strict equality comparisons, i.e. `===`.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @param {*} srcValue The value to match.
 * @returns {Function} Returns the new spec function.
 */

function matchesStrictComparable$2(key, srcValue) {
  return function(object) {
    if (object == null) {
      return false;
    }
    return object[key] === srcValue &&
      (srcValue !== undefined || (key in Object(object)));
  };
}

var _matchesStrictComparable = matchesStrictComparable$2;

var baseIsMatch = _baseIsMatch,
    getMatchData = _getMatchData,
    matchesStrictComparable$1 = _matchesStrictComparable;

/**
 * The base implementation of `_.matches` which doesn't clone `source`.
 *
 * @private
 * @param {Object} source The object of property values to match.
 * @returns {Function} Returns the new spec function.
 */
function baseMatches$1(source) {
  var matchData = getMatchData(source);
  if (matchData.length == 1 && matchData[0][2]) {
    return matchesStrictComparable$1(matchData[0][0], matchData[0][1]);
  }
  return function(object) {
    return object === source || baseIsMatch(object, source, matchData);
  };
}

var _baseMatches = baseMatches$1;

var baseGet$1 = _baseGet;

/**
 * Gets the value at `path` of `object`. If the resolved value is
 * `undefined`, the `defaultValue` is returned in its place.
 *
 * @static
 * @memberOf _
 * @since 3.7.0
 * @category Object
 * @param {Object} object The object to query.
 * @param {Array|string} path The path of the property to get.
 * @param {*} [defaultValue] The value returned for `undefined` resolved values.
 * @returns {*} Returns the resolved value.
 * @example
 *
 * var object = { 'a': [{ 'b': { 'c': 3 } }] };
 *
 * _.get(object, 'a[0].b.c');
 * // => 3
 *
 * _.get(object, ['a', '0', 'b', 'c']);
 * // => 3
 *
 * _.get(object, 'a.b.c', 'default');
 * // => 'default'
 */
function get$1(object, path, defaultValue) {
  var result = object == null ? undefined : baseGet$1(object, path);
  return result === undefined ? defaultValue : result;
}

var get_1 = get$1;

var baseIsEqual = _baseIsEqual,
    get = get_1,
    hasIn = hasIn_1,
    isKey$1 = _isKey,
    isStrictComparable = _isStrictComparable,
    matchesStrictComparable = _matchesStrictComparable,
    toKey$1 = _toKey;

/** Used to compose bitmasks for value comparisons. */
var COMPARE_PARTIAL_FLAG = 1,
    COMPARE_UNORDERED_FLAG = 2;

/**
 * The base implementation of `_.matchesProperty` which doesn't clone `srcValue`.
 *
 * @private
 * @param {string} path The path of the property to get.
 * @param {*} srcValue The value to match.
 * @returns {Function} Returns the new spec function.
 */
function baseMatchesProperty$1(path, srcValue) {
  if (isKey$1(path) && isStrictComparable(srcValue)) {
    return matchesStrictComparable(toKey$1(path), srcValue);
  }
  return function(object) {
    var objValue = get(object, path);
    return (objValue === undefined && objValue === srcValue)
      ? hasIn(object, path)
      : baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG | COMPARE_UNORDERED_FLAG);
  };
}

var _baseMatchesProperty = baseMatchesProperty$1;

/**
 * The base implementation of `_.property` without support for deep paths.
 *
 * @private
 * @param {string} key The key of the property to get.
 * @returns {Function} Returns the new accessor function.
 */

function baseProperty$1(key) {
  return function(object) {
    return object == null ? undefined : object[key];
  };
}

var _baseProperty = baseProperty$1;

var baseGet = _baseGet;

/**
 * A specialized version of `baseProperty` which supports deep paths.
 *
 * @private
 * @param {Array|string} path The path of the property to get.
 * @returns {Function} Returns the new accessor function.
 */
function basePropertyDeep$1(path) {
  return function(object) {
    return baseGet(object, path);
  };
}

var _basePropertyDeep = basePropertyDeep$1;

var baseProperty = _baseProperty,
    basePropertyDeep = _basePropertyDeep,
    isKey = _isKey,
    toKey = _toKey;

/**
 * Creates a function that returns the value at `path` of a given object.
 *
 * @static
 * @memberOf _
 * @since 2.4.0
 * @category Util
 * @param {Array|string} path The path of the property to get.
 * @returns {Function} Returns the new accessor function.
 * @example
 *
 * var objects = [
 *   { 'a': { 'b': 2 } },
 *   { 'a': { 'b': 1 } }
 * ];
 *
 * _.map(objects, _.property('a.b'));
 * // => [2, 1]
 *
 * _.map(_.sortBy(objects, _.property(['a', 'b'])), 'a.b');
 * // => [1, 2]
 */
function property$1(path) {
  return isKey(path) ? baseProperty(toKey(path)) : basePropertyDeep(path);
}

var property_1 = property$1;

var baseMatches = _baseMatches,
    baseMatchesProperty = _baseMatchesProperty,
    identity = identity_1,
    isArray = isArray_1,
    property = property_1;

/**
 * The base implementation of `_.iteratee`.
 *
 * @private
 * @param {*} [value=_.identity] The value to convert to an iteratee.
 * @returns {Function} Returns the iteratee.
 */
function baseIteratee$2(value) {
  // Don't store the `typeof` result in a variable to avoid a JIT bug in Safari 9.
  // See https://bugs.webkit.org/show_bug.cgi?id=156034 for more details.
  if (typeof value == 'function') {
    return value;
  }
  if (value == null) {
    return identity;
  }
  if (typeof value == 'object') {
    return isArray(value)
      ? baseMatchesProperty(value[0], value[1])
      : baseMatches(value);
  }
  return property(value);
}

var _baseIteratee = baseIteratee$2;

var overArg = _overArg;

/** Built-in value references. */
var getPrototype$1 = overArg(Object.getPrototypeOf, Object);

var _getPrototype = getPrototype$1;

var arrayPush = _arrayPush,
    getPrototype = _getPrototype,
    getSymbols = _getSymbols,
    stubArray = stubArray_1;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeGetSymbols = Object.getOwnPropertySymbols;

/**
 * Creates an array of the own and inherited enumerable symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of symbols.
 */
var getSymbolsIn$1 = !nativeGetSymbols ? stubArray : function(object) {
  var result = [];
  while (object) {
    arrayPush(result, getSymbols(object));
    object = getPrototype(object);
  }
  return result;
};

var _getSymbolsIn = getSymbolsIn$1;

/**
 * This function is like
 * [`Object.keys`](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
 * except that it includes inherited enumerable properties.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */

function nativeKeysIn$1(object) {
  var result = [];
  if (object != null) {
    for (var key in Object(object)) {
      result.push(key);
    }
  }
  return result;
}

var _nativeKeysIn = nativeKeysIn$1;

var isObject = isObject_1,
    isPrototype = _isPrototype,
    nativeKeysIn = _nativeKeysIn;

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * The base implementation of `_.keysIn` which doesn't treat sparse arrays as dense.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function baseKeysIn$1(object) {
  if (!isObject(object)) {
    return nativeKeysIn(object);
  }
  var isProto = isPrototype(object),
      result = [];

  for (var key in object) {
    if (!(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
      result.push(key);
    }
  }
  return result;
}

var _baseKeysIn = baseKeysIn$1;

var arrayLikeKeys = _arrayLikeKeys,
    baseKeysIn = _baseKeysIn,
    isArrayLike = isArrayLike_1;

/**
 * Creates an array of the own and inherited enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keysIn(new Foo);
 * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
 */
function keysIn$1(object) {
  return isArrayLike(object) ? arrayLikeKeys(object, true) : baseKeysIn(object);
}

var keysIn_1 = keysIn$1;

var baseGetAllKeys = _baseGetAllKeys,
    getSymbolsIn = _getSymbolsIn,
    keysIn = keysIn_1;

/**
 * Creates an array of own and inherited enumerable property names and
 * symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names and symbols.
 */
function getAllKeysIn$1(object) {
  return baseGetAllKeys(object, keysIn, getSymbolsIn);
}

var _getAllKeysIn = getAllKeysIn$1;

var arrayMap = _arrayMap,
    baseIteratee$1 = _baseIteratee,
    basePickBy = _basePickBy,
    getAllKeysIn = _getAllKeysIn;

/**
 * Creates an object composed of the `object` properties `predicate` returns
 * truthy for. The predicate is invoked with two arguments: (value, key).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Object
 * @param {Object} object The source object.
 * @param {Function} [predicate=_.identity] The function invoked per property.
 * @returns {Object} Returns the new object.
 * @example
 *
 * var object = { 'a': 1, 'b': '2', 'c': 3 };
 *
 * _.pickBy(object, _.isNumber);
 * // => { 'a': 1, 'c': 3 }
 */
function pickBy(object, predicate) {
  if (object == null) {
    return {};
  }
  var props = arrayMap(getAllKeysIn(object), function(prop) {
    return [prop];
  });
  predicate = baseIteratee$1(predicate);
  return basePickBy(object, props, function(value, path) {
    return predicate(value, path[0]);
  });
}

var pickBy_1 = pickBy;

var pickBy$1 = /*@__PURE__*/getDefaultExportFromCjs(pickBy_1);

/**
 * Creates a base function for methods like `_.forIn` and `_.forOwn`.
 *
 * @private
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {Function} Returns the new base function.
 */

function createBaseFor$1(fromRight) {
  return function(object, iteratee, keysFunc) {
    var index = -1,
        iterable = Object(object),
        props = keysFunc(object),
        length = props.length;

    while (length--) {
      var key = props[fromRight ? length : ++index];
      if (iteratee(iterable[key], key, iterable) === false) {
        break;
      }
    }
    return object;
  };
}

var _createBaseFor = createBaseFor$1;

var createBaseFor = _createBaseFor;

/**
 * The base implementation of `baseForOwn` which iterates over `object`
 * properties returned by `keysFunc` and invokes `iteratee` for each property.
 * Iteratee functions may exit iteration early by explicitly returning `false`.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @returns {Object} Returns `object`.
 */
var baseFor$1 = createBaseFor();

var _baseFor = baseFor$1;

var baseFor = _baseFor,
    keys = keys_1;

/**
 * The base implementation of `_.forOwn` without support for iteratee shorthands.
 *
 * @private
 * @param {Object} object The object to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Object} Returns `object`.
 */
function baseForOwn$1(object, iteratee) {
  return object && baseFor(object, iteratee, keys);
}

var _baseForOwn = baseForOwn$1;

var baseAssignValue = _baseAssignValue,
    baseForOwn = _baseForOwn,
    baseIteratee = _baseIteratee;

/**
 * Creates an object with the same keys as `object` and values generated
 * by running each own enumerable string keyed property of `object` thru
 * `iteratee`. The iteratee is invoked with three arguments:
 * (value, key, object).
 *
 * @static
 * @memberOf _
 * @since 2.4.0
 * @category Object
 * @param {Object} object The object to iterate over.
 * @param {Function} [iteratee=_.identity] The function invoked per iteration.
 * @returns {Object} Returns the new mapped object.
 * @see _.mapKeys
 * @example
 *
 * var users = {
 *   'fred':    { 'user': 'fred',    'age': 40 },
 *   'pebbles': { 'user': 'pebbles', 'age': 1 }
 * };
 *
 * _.mapValues(users, function(o) { return o.age; });
 * // => { 'fred': 40, 'pebbles': 1 } (iteration order is not guaranteed)
 *
 * // The `_.property` iteratee shorthand.
 * _.mapValues(users, 'age');
 * // => { 'fred': 40, 'pebbles': 1 } (iteration order is not guaranteed)
 */
function mapValues(object, iteratee) {
  var result = {};
  iteratee = baseIteratee(iteratee);

  baseForOwn(object, function(value, key, object) {
    baseAssignValue(result, key, iteratee(value, key, object));
  });
  return result;
}

var mapValues_1 = mapValues;

var mapValues$1 = /*@__PURE__*/getDefaultExportFromCjs(mapValues_1);

/**
 * Manages MCP connections with lazy loading and reconnection.
 * Maintains a pool of connections and handles connection lifecycle management.
 */
class ConnectionsRepository {
    constructor(serverConfigs, oauthOpts) {
        this.connections = new Map();
        this.serverConfigs = serverConfigs;
        this.oauthOpts = oauthOpts;
    }
    /** Checks whether this repository can connect to a specific server */
    has(serverName) {
        return !!this.serverConfigs[serverName];
    }
    /** Gets or creates a connection for the specified server with lazy loading */
    get(serverName) {
        return __awaiter(this, void 0, void 0, function* () {
            const existingConnection = this.connections.get(serverName);
            if (existingConnection && (yield existingConnection.isConnected()))
                return existingConnection;
            else
                yield this.disconnect(serverName);
            const connection = yield MCPConnectionFactory.create({
                serverName,
                serverConfig: this.getServerConfig(serverName),
            }, this.oauthOpts);
            this.connections.set(serverName, connection);
            return connection;
        });
    }
    /** Gets or creates connections for multiple servers concurrently */
    getMany(serverNames) {
        return __awaiter(this, void 0, void 0, function* () {
            const connectionPromises = serverNames.map((name) => __awaiter(this, void 0, void 0, function* () { return [name, yield this.get(name)]; }));
            const connections = yield Promise.all(connectionPromises);
            return new Map(connections);
        });
    }
    /** Returns all currently loaded connections without creating new ones */
    getLoaded() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getMany(Array.from(this.connections.keys()));
        });
    }
    /** Gets or creates connections for all configured servers */
    getAll() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getMany(Object.keys(this.serverConfigs));
        });
    }
    /** Disconnects and removes a specific server connection from the pool */
    disconnect(serverName) {
        const connection = this.connections.get(serverName);
        if (!connection)
            return Promise.resolve();
        this.connections.delete(serverName);
        return connection.disconnect().catch((err) => {
            dataSchemas.logger.error(`${this.prefix(serverName)} Error disconnecting`, err);
        });
    }
    /** Disconnects all active connections and returns array of disconnect promises */
    disconnectAll() {
        const serverNames = Array.from(this.connections.keys());
        return serverNames.map((serverName) => this.disconnect(serverName));
    }
    // Retrieves server configuration by name or throws if not found
    getServerConfig(serverName) {
        const serverConfig = this.serverConfigs[serverName];
        if (serverConfig)
            return serverConfig;
        throw new Error(`${this.prefix(serverName)} Server not found in configuration`);
    }
    // Returns formatted log prefix for server messages
    prefix(serverName) {
        return `[MCP][${serverName}]`;
    }
}

/**
 * Manages MCP server configurations and metadata discovery.
 * Fetches server capabilities, OAuth requirements, and tool definitions for registry.
 * Determines which servers are for app-level connections.
 * Has its own connections repository. All connections are disconnected after initialization.
 */
class MCPServersRegistry {
    constructor(configs) {
        this.initialized = false;
        this.oauthServers = null;
        this.serverInstructions = null;
        this.toolFunctions = null;
        this.appServerConfigs = null;
        this.rawConfigs = configs;
        this.parsedConfigs = mapValues$1(configs, (con) => processMCPEnv({ options: con }));
        this.connections = new ConnectionsRepository(configs);
    }
    /** Initializes all startup-enabled servers by gathering their metadata asynchronously */
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.initialized)
                return;
            this.initialized = true;
            const serverNames = Object.keys(this.parsedConfigs);
            yield Promise.allSettled(serverNames.map((serverName) => this.gatherServerInfo(serverName)));
            this.setOAuthServers();
            this.setServerInstructions();
            this.setAppServerConfigs();
            yield this.setAppToolFunctions();
            this.connections.disconnectAll();
        });
    }
    /** Fetches all metadata for a single server in parallel */
    gatherServerInfo(serverName) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.fetchOAuthRequirement(serverName);
                const config = this.parsedConfigs[serverName];
                if (config.startup !== false && !config.requiresOAuth) {
                    yield Promise.allSettled([
                        this.fetchServerInstructions(serverName).catch((error) => dataSchemas.logger.warn(`${this.prefix(serverName)} Failed to fetch server instructions:`, error)),
                        this.fetchServerCapabilities(serverName).catch((error) => dataSchemas.logger.warn(`${this.prefix(serverName)} Failed to fetch server capabilities:`, error)),
                    ]);
                }
                this.logUpdatedConfig(serverName);
            }
            catch (error) {
                dataSchemas.logger.warn(`${this.prefix(serverName)} Failed to initialize server:`, error);
            }
        });
    }
    /** Sets app-level server configs (startup enabled, non-OAuth servers) */
    setAppServerConfigs() {
        const appServers = Object.keys(pickBy$1(this.parsedConfigs, (config) => config.startup !== false && config.requiresOAuth === false));
        this.appServerConfigs = pick$1(this.rawConfigs, appServers);
    }
    /** Creates set of server names that require OAuth authentication */
    setOAuthServers() {
        if (this.oauthServers)
            return this.oauthServers;
        this.oauthServers = new Set(Object.keys(pickBy$1(this.parsedConfigs, (config) => config.requiresOAuth)));
        return this.oauthServers;
    }
    /** Collects server instructions from all configured servers */
    setServerInstructions() {
        this.serverInstructions = mapValues$1(pickBy$1(this.parsedConfigs, (config) => config.serverInstructions), (config) => config.serverInstructions);
    }
    /** Builds registry of all available tool functions from loaded connections */
    setAppToolFunctions() {
        return __awaiter(this, void 0, void 0, function* () {
            const connections = (yield this.connections.getLoaded()).entries();
            const allToolFunctions = {};
            for (const [serverName, conn] of connections) {
                try {
                    const toolFunctions = yield this.getToolFunctions(serverName, conn);
                    Object.assign(allToolFunctions, toolFunctions);
                }
                catch (error) {
                    dataSchemas.logger.warn(`${this.prefix(serverName)} Error fetching tool functions:`, error);
                }
            }
            this.toolFunctions = allToolFunctions;
        });
    }
    /** Converts server tools to LibreChat-compatible tool functions format */
    getToolFunctions(serverName, conn) {
        return __awaiter(this, void 0, void 0, function* () {
            const { tools } = yield conn.client.listTools();
            const toolFunctions = {};
            tools.forEach((tool) => {
                const name = `${tool.name}${CONSTANTS.mcp_delimiter}${serverName}`;
                toolFunctions[name] = {
                    type: 'function',
                    ['function']: {
                        name,
                        description: tool.description,
                        parameters: tool.inputSchema,
                    },
                };
            });
            return toolFunctions;
        });
    }
    /** Determines if server requires OAuth if not already specified in the config */
    fetchOAuthRequirement(serverName) {
        return __awaiter(this, void 0, void 0, function* () {
            const config = this.parsedConfigs[serverName];
            if (config.requiresOAuth != null)
                return config.requiresOAuth;
            if (config.url == null)
                return (config.requiresOAuth = false);
            if (config.startup === false)
                return (config.requiresOAuth = false);
            const result = yield detectOAuthRequirement(config.url);
            config.requiresOAuth = result.requiresOAuth;
            config.oauthMetadata = result.metadata;
            return config.requiresOAuth;
        });
    }
    /** Retrieves server instructions from MCP server if enabled in the config */
    fetchServerInstructions(serverName) {
        return __awaiter(this, void 0, void 0, function* () {
            const config = this.parsedConfigs[serverName];
            if (!config.serverInstructions)
                return;
            if (typeof config.serverInstructions === 'string')
                return;
            const conn = yield this.connections.get(serverName);
            config.serverInstructions = conn.client.getInstructions();
            if (!config.serverInstructions) {
                dataSchemas.logger.warn(`${this.prefix(serverName)} No server instructions available`);
            }
        });
    }
    /** Fetches server capabilities and available tools list */
    fetchServerCapabilities(serverName) {
        return __awaiter(this, void 0, void 0, function* () {
            const config = this.parsedConfigs[serverName];
            const conn = yield this.connections.get(serverName);
            const capabilities = conn.client.getServerCapabilities();
            if (!capabilities)
                return;
            config.capabilities = JSON.stringify(capabilities);
            if (!capabilities.tools)
                return;
            const tools = yield conn.client.listTools();
            config.tools = tools.tools.map((tool) => tool.name).join(', ');
        });
    }
    // Logs server configuration summary after initialization
    logUpdatedConfig(serverName) {
        const prefix = this.prefix(serverName);
        const config = this.parsedConfigs[serverName];
        dataSchemas.logger.info(`${prefix} -------------------------------------------------┐`);
        dataSchemas.logger.info(`${prefix} URL: ${config.url}`);
        dataSchemas.logger.info(`${prefix} OAuth Required: ${config.requiresOAuth}`);
        dataSchemas.logger.info(`${prefix} Capabilities: ${config.capabilities}`);
        dataSchemas.logger.info(`${prefix} Tools: ${config.tools}`);
        dataSchemas.logger.info(`${prefix} Server Instructions: ${config.serverInstructions}`);
        dataSchemas.logger.info(`${prefix} -------------------------------------------------┘`);
    }
    // Returns formatted log prefix for server messages
    prefix(serverName) {
        return `[MCP][${serverName}]`;
    }
}

/**
 * Abstract base class for managing user-specific MCP connections with lifecycle management.
 * Only meant to be extended by MCPManager.
 * Much of the logic was move here from the old MCPManager to make it more manageable.
 * User connections will soon be ephemeral and not cached anymore:
 * https://github.com/danny-avila/LibreChat/discussions/8790
 */
class UserConnectionManager {
    constructor(serverConfigs) {
        this.userConnections = new Map();
        /** Last activity timestamp for users (not per server) */
        this.userLastActivity = new Map();
        this.USER_CONNECTION_IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes (TODO: make configurable)
        this.serversRegistry = new MCPServersRegistry(serverConfigs);
    }
    /** fetches am MCP Server config from the registry */
    getRawConfig(serverName) {
        return this.serversRegistry.rawConfigs[serverName];
    }
    /** Updates the last activity timestamp for a user */
    updateUserLastActivity(userId) {
        const now = Date.now();
        this.userLastActivity.set(userId, now);
        dataSchemas.logger.debug(`[MCP][User: ${userId}] Updated last activity timestamp: ${new Date(now).toISOString()}`);
    }
    /** Gets or creates a connection for a specific user */
    getUserConnection({ serverName, forceNew, user, flowManager, customUserVars, requestBody, tokenMethods, oauthStart, oauthEnd, signal, returnOnOAuth = false, connectionTimeout, }) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const userId = user.id;
            if (!userId) {
                throw new types_js.McpError(types_js.ErrorCode.InvalidRequest, `[MCP] User object missing id property`);
            }
            const userServerMap = this.userConnections.get(userId);
            let connection = forceNew ? undefined : userServerMap === null || userServerMap === void 0 ? void 0 : userServerMap.get(serverName);
            const now = Date.now();
            // Check if user is idle
            const lastActivity = this.userLastActivity.get(userId);
            if (lastActivity && now - lastActivity > this.USER_CONNECTION_IDLE_TIMEOUT) {
                dataSchemas.logger.info(`[MCP][User: ${userId}] User idle for too long. Disconnecting all connections.`);
                // Disconnect all user connections
                try {
                    yield this.disconnectUserConnections(userId);
                }
                catch (err) {
                    dataSchemas.logger.error(`[MCP][User: ${userId}] Error disconnecting idle connections:`, err);
                }
                connection = undefined; // Force creation of a new connection
            }
            else if (connection) {
                if (yield connection.isConnected()) {
                    dataSchemas.logger.debug(`[MCP][User: ${userId}][${serverName}] Reusing active connection`);
                    this.updateUserLastActivity(userId);
                    return connection;
                }
                else {
                    // Connection exists but is not connected, attempt to remove potentially stale entry
                    dataSchemas.logger.warn(`[MCP][User: ${userId}][${serverName}] Found existing but disconnected connection object. Cleaning up.`);
                    this.removeUserConnection(userId, serverName); // Clean up maps
                    connection = undefined;
                }
            }
            // If no valid connection exists, create a new one
            if (!connection) {
                dataSchemas.logger.info(`[MCP][User: ${userId}][${serverName}] Establishing new connection`);
            }
            const config = this.serversRegistry.parsedConfigs[serverName];
            if (!config) {
                throw new types_js.McpError(types_js.ErrorCode.InvalidRequest, `[MCP][User: ${userId}] Configuration for server "${serverName}" not found.`);
            }
            try {
                connection = yield MCPConnectionFactory.create({
                    serverName: serverName,
                    serverConfig: config,
                }, {
                    useOAuth: true,
                    user: user,
                    customUserVars: customUserVars,
                    flowManager: flowManager,
                    tokenMethods: tokenMethods,
                    signal: signal,
                    oauthStart: oauthStart,
                    oauthEnd: oauthEnd,
                    returnOnOAuth: returnOnOAuth,
                    requestBody: requestBody,
                    connectionTimeout: connectionTimeout,
                });
                if (!(yield (connection === null || connection === void 0 ? void 0 : connection.isConnected()))) {
                    throw new Error('Failed to establish connection after initialization attempt.');
                }
                if (!this.userConnections.has(userId)) {
                    this.userConnections.set(userId, new Map());
                }
                (_a = this.userConnections.get(userId)) === null || _a === void 0 ? void 0 : _a.set(serverName, connection);
                dataSchemas.logger.info(`[MCP][User: ${userId}][${serverName}] Connection successfully established`);
                // Update timestamp on creation
                this.updateUserLastActivity(userId);
                return connection;
            }
            catch (error) {
                dataSchemas.logger.error(`[MCP][User: ${userId}][${serverName}] Failed to establish connection`, error);
                // Ensure partial connection state is cleaned up if initialization fails
                yield (connection === null || connection === void 0 ? void 0 : connection.disconnect().catch((disconnectError) => {
                    dataSchemas.logger.error(`[MCP][User: ${userId}][${serverName}] Error during cleanup after failed connection`, disconnectError);
                }));
                // Ensure cleanup even if connection attempt fails
                this.removeUserConnection(userId, serverName);
                throw error; // Re-throw the error to the caller
            }
        });
    }
    /** Returns all connections for a specific user */
    getUserConnections(userId) {
        return this.userConnections.get(userId);
    }
    /** Removes a specific user connection entry */
    removeUserConnection(userId, serverName) {
        const userMap = this.userConnections.get(userId);
        if (userMap) {
            userMap.delete(serverName);
            if (userMap.size === 0) {
                this.userConnections.delete(userId);
                // Only remove user activity timestamp if all connections are gone
                this.userLastActivity.delete(userId);
            }
        }
        dataSchemas.logger.debug(`[MCP][User: ${userId}][${serverName}] Removed connection entry.`);
    }
    /** Disconnects and removes a specific user connection */
    disconnectUserConnection(userId, serverName) {
        return __awaiter(this, void 0, void 0, function* () {
            const userMap = this.userConnections.get(userId);
            const connection = userMap === null || userMap === void 0 ? void 0 : userMap.get(serverName);
            if (connection) {
                dataSchemas.logger.info(`[MCP][User: ${userId}][${serverName}] Disconnecting...`);
                yield connection.disconnect();
                this.removeUserConnection(userId, serverName);
            }
        });
    }
    /** Disconnects and removes all connections for a specific user */
    disconnectUserConnections(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const userMap = this.userConnections.get(userId);
            const disconnectPromises = [];
            if (userMap) {
                dataSchemas.logger.info(`[MCP][User: ${userId}] Disconnecting all servers...`);
                const userServers = Array.from(userMap.keys());
                for (const serverName of userServers) {
                    disconnectPromises.push(this.disconnectUserConnection(userId, serverName).catch((error) => {
                        dataSchemas.logger.error(`[MCP][User: ${userId}][${serverName}] Error during disconnection:`, error);
                    }));
                }
                yield Promise.allSettled(disconnectPromises);
                // Ensure user activity timestamp is removed
                this.userLastActivity.delete(userId);
                dataSchemas.logger.info(`[MCP][User: ${userId}] All connections processed for disconnection.`);
            }
        });
    }
    /** Check for and disconnect idle connections */
    checkIdleConnections(currentUserId) {
        const now = Date.now();
        // Iterate through all users to check for idle ones
        for (const [userId, lastActivity] of this.userLastActivity.entries()) {
            if (currentUserId && currentUserId === userId) {
                continue;
            }
            if (now - lastActivity > this.USER_CONNECTION_IDLE_TIMEOUT) {
                dataSchemas.logger.info(`[MCP][User: ${userId}] User idle for too long. Disconnecting all connections...`);
                // Disconnect all user connections asynchronously (fire and forget)
                this.disconnectUserConnections(userId).catch((err) => dataSchemas.logger.error(`[MCP][User: ${userId}] Error disconnecting idle connections:`, err));
            }
        }
    }
}

const RECOGNIZED_PROVIDERS = new Set([
    'google',
    'anthropic',
    'openai',
    'azureopenai',
    'openrouter',
    'xai',
    'deepseek',
    'ollama',
    'bedrock',
]);
const CONTENT_ARRAY_PROVIDERS = new Set(['google', 'anthropic', 'azureopenai', 'openai']);
const imageFormatters = {
    // google: (item) => ({
    //   type: 'image',
    //   inlineData: {
    //     mimeType: item.mimeType,
    //     data: item.data,
    //   },
    // }),
    // anthropic: (item) => ({
    //   type: 'image',
    //   source: {
    //     type: 'base64',
    //     media_type: item.mimeType,
    //     data: item.data,
    //   },
    // }),
    default: (item) => ({
        type: 'image_url',
        image_url: {
            url: item.data.startsWith('http') ? item.data : `data:${item.mimeType};base64,${item.data}`,
        },
    }),
};
function isImageContent(item) {
    return item.type === 'image';
}
function parseAsString(result) {
    var _a;
    const content = (_a = result === null || result === void 0 ? void 0 : result.content) !== null && _a !== void 0 ? _a : [];
    if (!content.length) {
        return '(No response)';
    }
    const text = content
        .map((item) => {
        if (item.type === 'text') {
            return item.text;
        }
        if (item.type === 'resource') {
            const resourceText = [];
            if (item.resource.text != null && item.resource.text) {
                resourceText.push(item.resource.text);
            }
            if (item.resource.uri) {
                resourceText.push(`Resource URI: ${item.resource.uri}`);
            }
            if (item.resource.name) {
                resourceText.push(`Resource: ${item.resource.name}`);
            }
            if (item.resource.description) {
                resourceText.push(`Description: ${item.resource.description}`);
            }
            if (item.resource.mimeType != null && item.resource.mimeType) {
                resourceText.push(`Type: ${item.resource.mimeType}`);
            }
            return resourceText.join('\n');
        }
        return JSON.stringify(item, null, 2);
    })
        .filter(Boolean)
        .join('\n\n');
    return text;
}
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
function formatToolContent(result, provider) {
    var _a;
    if (!RECOGNIZED_PROVIDERS.has(provider)) {
        return [parseAsString(result), undefined];
    }
    const content = (_a = result === null || result === void 0 ? void 0 : result.content) !== null && _a !== void 0 ? _a : [];
    if (!content.length) {
        return [[{ type: 'text', text: '(No response)' }], undefined];
    }
    const formattedContent = [];
    const imageUrls = [];
    let currentTextBlock = '';
    const uiResources = [];
    const contentHandlers = {
        text: (item) => {
            currentTextBlock += (currentTextBlock ? '\n\n' : '') + item.text;
        },
        image: (item) => {
            if (!isImageContent(item)) {
                return;
            }
            if (CONTENT_ARRAY_PROVIDERS.has(provider) && currentTextBlock) {
                formattedContent.push({ type: 'text', text: currentTextBlock });
                currentTextBlock = '';
            }
            const formatter = imageFormatters.default;
            const formattedImage = formatter(item);
            if (formattedImage.type === 'image_url') {
                imageUrls.push(formattedImage);
            }
            else {
                formattedContent.push(formattedImage);
            }
        },
        resource: (item) => {
            if (item.resource.uri.startsWith('ui://')) {
                uiResources.push(item.resource);
            }
            const resourceText = [];
            if (item.resource.text != null && item.resource.text) {
                resourceText.push(`Resource Text: ${item.resource.text}`);
            }
            if (item.resource.uri.length) {
                resourceText.push(`Resource URI: ${item.resource.uri}`);
            }
            if (item.resource.name) {
                resourceText.push(`Resource: ${item.resource.name}`);
            }
            if (item.resource.description) {
                resourceText.push(`Resource Description: ${item.resource.description}`);
            }
            if (item.resource.mimeType != null && item.resource.mimeType) {
                resourceText.push(`Resource MIME Type: ${item.resource.mimeType}`);
            }
            currentTextBlock += (currentTextBlock ? '\n\n' : '') + resourceText.join('\n');
        },
    };
    for (const item of content) {
        const handler = contentHandlers[item.type];
        if (handler) {
            handler(item);
        }
        else {
            const stringified = JSON.stringify(item, null, 2);
            currentTextBlock += (currentTextBlock ? '\n\n' : '') + stringified;
        }
    }
    if (CONTENT_ARRAY_PROVIDERS.has(provider) && currentTextBlock) {
        formattedContent.push({ type: 'text', text: currentTextBlock });
    }
    let artifacts = undefined;
    if (imageUrls.length || uiResources.length) {
        artifacts = Object.assign(Object.assign({}, (imageUrls.length && { content: imageUrls })), (uiResources.length && { [librechatDataProvider.Tools.ui_resources]: { data: uiResources } }));
    }
    if (CONTENT_ARRAY_PROVIDERS.has(provider)) {
        return [formattedContent, artifacts];
    }
    return [currentTextBlock, artifacts];
}

/**
 * Centralized manager for MCP server connections and tool execution.
 * Extends UserConnectionManager to handle both app-level and user-specific connections.
 */
class MCPManager extends UserConnectionManager {
    constructor() {
        super(...arguments);
        // Connections shared by all users.
        this.appConnections = null;
    }
    /** Creates and initializes the singleton MCPManager instance */
    static createInstance(configs) {
        return __awaiter(this, void 0, void 0, function* () {
            if (MCPManager.instance)
                throw new Error('MCPManager has already been initialized.');
            MCPManager.instance = new MCPManager(configs);
            yield MCPManager.instance.initialize();
            return MCPManager.instance;
        });
    }
    /** Returns the singleton MCPManager instance */
    static getInstance() {
        if (!MCPManager.instance)
            throw new Error('MCPManager has not been initialized.');
        return MCPManager.instance;
    }
    /** Initializes the MCPManager by setting up server registry and app connections */
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.serversRegistry.initialize();
            this.appConnections = new ConnectionsRepository(this.serversRegistry.appServerConfigs);
        });
    }
    /** Returns all app-level connections */
    getAllConnections() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.appConnections.getAll();
        });
    }
    /** Get servers that require OAuth */
    getOAuthServers() {
        return this.serversRegistry.oauthServers;
    }
    /** Get all servers */
    getAllServers() {
        return this.serversRegistry.rawConfigs;
    }
    /** Returns all available tool functions from app-level connections */
    getAppToolFunctions() {
        return this.serversRegistry.toolFunctions;
    }
    /** Returns all available tool functions from all connections available to user */
    getAllToolFunctions(userId) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const allToolFunctions = (_a = this.getAppToolFunctions()) !== null && _a !== void 0 ? _a : {};
            const userConnections = this.getUserConnections(userId);
            if (!userConnections || userConnections.size === 0) {
                return allToolFunctions;
            }
            for (const [serverName, connection] of userConnections.entries()) {
                const toolFunctions = yield this.serversRegistry.getToolFunctions(serverName, connection);
                Object.assign(allToolFunctions, toolFunctions);
            }
            return allToolFunctions;
        });
    }
    /**
     * Get instructions for MCP servers
     * @param serverNames Optional array of server names. If not provided or empty, returns all servers.
     * @returns Object mapping server names to their instructions
     */
    getInstructions(serverNames) {
        const instructions = this.serversRegistry.serverInstructions;
        if (!serverNames)
            return instructions;
        return pick$1(instructions, serverNames);
    }
    /**
     * Format MCP server instructions for injection into context
     * @param serverNames Optional array of server names to include. If not provided, includes all servers.
     * @returns Formatted instructions string ready for context injection
     */
    formatInstructionsForContext(serverNames) {
        /** Instructions for specified servers or all stored instructions */
        const instructionsToInclude = this.getInstructions(serverNames);
        if (Object.keys(instructionsToInclude).length === 0) {
            return '';
        }
        // Format instructions for context injection
        const formattedInstructions = Object.entries(instructionsToInclude)
            .map(([serverName, instructions]) => {
            return `## ${serverName} MCP Server Instructions

${instructions}`;
        })
            .join('\n\n');
        return `# MCP Server Instructions

The following MCP servers are available with their specific instructions:

${formattedInstructions}

Please follow these instructions when using tools from the respective MCP servers.`;
    }
    loadAppManifestTools() {
        return __awaiter(this, void 0, void 0, function* () {
            const connections = yield this.appConnections.getAll();
            return yield this.loadManifestTools(connections);
        });
    }
    loadUserManifestTools(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const connections = this.getUserConnections(userId);
            return yield this.loadManifestTools(connections);
        });
    }
    loadAllManifestTools(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const appTools = yield this.loadAppManifestTools();
            const userTools = yield this.loadUserManifestTools(userId);
            return [...appTools, ...userTools];
        });
    }
    /** Loads tools from all app-level connections into the manifest. */
    loadManifestTools(connections) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const mcpTools = [];
            if (!connections || connections.size === 0) {
                return mcpTools;
            }
            for (const [serverName, connection] of connections.entries()) {
                try {
                    if (!(yield connection.isConnected())) {
                        dataSchemas.logger.warn(`[MCP][${serverName}] Connection not available for ${serverName} manifest tools.`);
                        continue;
                    }
                    const tools = yield connection.fetchTools();
                    const serverTools = [];
                    for (const tool of tools) {
                        const pluginKey = `${tool.name}${CONSTANTS.mcp_delimiter}${serverName}`;
                        const config = this.serversRegistry.parsedConfigs[serverName];
                        const manifestTool = {
                            name: tool.name,
                            pluginKey,
                            description: (_a = tool.description) !== null && _a !== void 0 ? _a : '',
                            icon: connection.iconPath,
                            authConfig: (config === null || config === void 0 ? void 0 : config.customUserVars)
                                ? Object.entries(config.customUserVars).map(([key, value]) => ({
                                    authField: key,
                                    label: value.title || key,
                                    description: value.description || '',
                                }))
                                : undefined,
                        };
                        if ((config === null || config === void 0 ? void 0 : config.chatMenu) === false) {
                            manifestTool.chatMenu = false;
                        }
                        mcpTools.push(manifestTool);
                        serverTools.push(manifestTool);
                    }
                }
                catch (error) {
                    dataSchemas.logger.error(`[MCP][${serverName}] Error fetching tools for manifest:`, error);
                }
            }
            return mcpTools;
        });
    }
    /**
     * Calls a tool on an MCP server, using either a user-specific connection
     * (if userId is provided) or an app-level connection. Updates the last activity timestamp
     * for user-specific connections upon successful call initiation.
     */
    callTool({ user, serverName, toolName, provider, toolArguments, options, tokenMethods, requestBody, flowManager, oauthStart, oauthEnd, customUserVars, }) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            /** User-specific connection */
            let connection;
            const userId = user === null || user === void 0 ? void 0 : user.id;
            const logPrefix = userId ? `[MCP][User: ${userId}][${serverName}]` : `[MCP][${serverName}]`;
            try {
                if (!((_a = this.appConnections) === null || _a === void 0 ? void 0 : _a.has(serverName)) && userId && user) {
                    this.updateUserLastActivity(userId);
                    /** Get or create user-specific connection */
                    connection = yield this.getUserConnection({
                        user,
                        serverName,
                        flowManager,
                        tokenMethods,
                        oauthStart,
                        oauthEnd,
                        signal: options === null || options === void 0 ? void 0 : options.signal,
                        customUserVars,
                        requestBody,
                    });
                }
                else {
                    /** App-level connection */
                    connection = yield this.appConnections.get(serverName);
                    if (!connection) {
                        throw new types_js.McpError(types_js.ErrorCode.InvalidRequest, `${logPrefix} No app-level connection found. Cannot execute tool ${toolName}.`);
                    }
                }
                if (!(yield connection.isConnected())) {
                    /** May happen if getUserConnection failed silently or app connection dropped */
                    throw new types_js.McpError(types_js.ErrorCode.InternalError, // Use InternalError for connection issues
                    `${logPrefix} Connection is not active. Cannot execute tool ${toolName}.`);
                }
                const rawConfig = this.getRawConfig(serverName);
                const currentOptions = processMCPEnv({
                    user,
                    options: rawConfig,
                    customUserVars: customUserVars,
                    body: requestBody,
                });
                if ('headers' in currentOptions) {
                    connection.setRequestHeaders(currentOptions.headers || {});
                }
                const result = yield connection.client.request({
                    method: 'tools/call',
                    params: {
                        name: toolName,
                        arguments: toolArguments,
                    },
                }, types_js.CallToolResultSchema, Object.assign({ timeout: connection.timeout, resetTimeoutOnProgress: true }, options));
                if (userId) {
                    this.updateUserLastActivity(userId);
                }
                this.checkIdleConnections();
                return formatToolContent(result, provider);
            }
            catch (error) {
                // Log with context and re-throw or handle as needed
                dataSchemas.logger.error(`${logPrefix}[${toolName}] Tool call failed`, error);
                // Rethrowing allows the caller (createMCPTool) to handle the final user message
                throw error;
            }
        });
    }
}

/**
 * Retrieves and decrypts authentication values for multiple plugins
 * @returns A map where keys are pluginKeys and values are objects of authField:decryptedValue pairs
 */
function getPluginAuthMap({ userId, pluginKeys, throwError = true, findPluginAuthsByKeys, }) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            /** Early return for empty plugin keys */
            if (!(pluginKeys === null || pluginKeys === void 0 ? void 0 : pluginKeys.length)) {
                return {};
            }
            /** All plugin auths for current user query */
            const pluginAuths = yield findPluginAuthsByKeys({ userId, pluginKeys });
            /** Group auth records by pluginKey for efficient lookup */
            const authsByPlugin = new Map();
            for (const auth of pluginAuths) {
                if (!auth.pluginKey) {
                    dataSchemas.logger.warn(`[getPluginAuthMap] Missing pluginKey for userId ${userId}`);
                    continue;
                }
                const existing = authsByPlugin.get(auth.pluginKey) || [];
                existing.push(auth);
                authsByPlugin.set(auth.pluginKey, existing);
            }
            const authMap = {};
            const decryptionPromises = [];
            /** Single loop through requested pluginKeys */
            for (const pluginKey of pluginKeys) {
                authMap[pluginKey] = {};
                const auths = authsByPlugin.get(pluginKey) || [];
                for (const auth of auths) {
                    decryptionPromises.push((() => __awaiter(this, void 0, void 0, function* () {
                        try {
                            const decryptedValue = yield decrypt(auth.value);
                            authMap[pluginKey][auth.authField] = decryptedValue;
                        }
                        catch (error) {
                            const message = error instanceof Error ? error.message : 'Unknown error';
                            dataSchemas.logger.error(`[getPluginAuthMap] Decryption failed for userId ${userId}, plugin ${pluginKey}, field ${auth.authField}: ${message}`);
                            if (throwError) {
                                throw new Error(`Decryption failed for plugin ${pluginKey}, field ${auth.authField}: ${message}`);
                            }
                        }
                    }))());
                }
            }
            yield Promise.all(decryptionPromises);
            return authMap;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            const plugins = (_a = pluginKeys === null || pluginKeys === void 0 ? void 0 : pluginKeys.join(', ')) !== null && _a !== void 0 ? _a : 'all requested';
            dataSchemas.logger.warn(`[getPluginAuthMap] Failed to fetch auth values for userId ${userId}, plugins: ${plugins}: ${message}`);
            if (!throwError) {
                /** Empty objects for each plugin key on error */
                return pluginKeys.reduce((acc, key) => {
                    acc[key] = {};
                    return acc;
                }, {});
            }
            throw error;
        }
    });
}

function getUserMCPAuthMap({ userId, tools, servers, toolInstances, findPluginAuthsByKeys, }) {
    return __awaiter(this, void 0, void 0, function* () {
        let allMcpCustomUserVars = {};
        let mcpPluginKeysToFetch = [];
        try {
            const uniqueMcpServers = new Set();
            if (servers != null && servers.length) {
                for (const serverName of servers) {
                    if (!serverName) {
                        continue;
                    }
                    uniqueMcpServers.add(`${librechatDataProvider.Constants.mcp_prefix}${serverName}`);
                }
            }
            else if (tools != null && tools.length) {
                for (const toolName of tools) {
                    if (!toolName) {
                        continue;
                    }
                    const delimiterIndex = toolName.indexOf(librechatDataProvider.Constants.mcp_delimiter);
                    if (delimiterIndex === -1)
                        continue;
                    const mcpServer = toolName.slice(delimiterIndex + librechatDataProvider.Constants.mcp_delimiter.length);
                    if (!mcpServer)
                        continue;
                    uniqueMcpServers.add(`${librechatDataProvider.Constants.mcp_prefix}${mcpServer}`);
                }
            }
            else if (toolInstances != null && toolInstances.length) {
                for (const tool of toolInstances) {
                    if (!tool) {
                        continue;
                    }
                    const mcpTool = tool;
                    if (mcpTool.mcpRawServerName) {
                        uniqueMcpServers.add(`${librechatDataProvider.Constants.mcp_prefix}${mcpTool.mcpRawServerName}`);
                    }
                }
            }
            if (uniqueMcpServers.size === 0) {
                return {};
            }
            mcpPluginKeysToFetch = Array.from(uniqueMcpServers);
            allMcpCustomUserVars = yield getPluginAuthMap({
                userId,
                pluginKeys: mcpPluginKeysToFetch,
                throwError: false,
                findPluginAuthsByKeys,
            });
        }
        catch (err) {
            dataSchemas.logger.error(`[handleTools] Error batch fetching customUserVars for MCP tools (keys: ${mcpPluginKeysToFetch.join(', ')}), user ${userId}: ${err instanceof Error ? err.message : 'Unknown error'}`, err);
        }
        return allMcpCustomUserVars;
    });
}

function isEmptyObjectSchema(jsonSchema) {
    return (jsonSchema != null &&
        typeof jsonSchema === 'object' &&
        jsonSchema.type === 'object' &&
        (jsonSchema.properties == null || Object.keys(jsonSchema.properties).length === 0) &&
        !jsonSchema.additionalProperties // Don't treat objects with additionalProperties as empty
    );
}
function dropSchemaFields(schema, fields) {
    if (schema == null || typeof schema !== 'object') {
        return schema;
    }
    // Handle arrays (should only occur for enum, required, etc.)
    if (Array.isArray(schema)) {
        // This should not happen for the root schema, but for completeness:
        return schema;
    }
    const result = {};
    for (const [key, value] of Object.entries(schema)) {
        if (fields.includes(key)) {
            continue;
        }
        // Recursively process nested schemas
        if (key === 'items' || key === 'additionalProperties' || key === 'properties') {
            if (key === 'properties' && value && typeof value === 'object') {
                // properties is a record of string -> JsonSchemaType
                const newProps = {};
                for (const [propKey, propValue] of Object.entries(value)) {
                    const dropped = dropSchemaFields(propValue, fields);
                    if (dropped !== undefined) {
                        newProps[propKey] = dropped;
                    }
                }
                result[key] = newProps;
            }
            else if (key === 'items' || key === 'additionalProperties') {
                const dropped = dropSchemaFields(value, fields);
                if (dropped !== undefined) {
                    result[key] = dropped;
                }
            }
        }
        else {
            result[key] = value;
        }
    }
    // Only return if the result is still a valid JsonSchemaType (must have a type)
    if (typeof result.type === 'string' &&
        ['string', 'number', 'boolean', 'array', 'object'].includes(result.type)) {
        return result;
    }
    return undefined;
}
// Helper function to convert oneOf/anyOf to Zod unions
function convertToZodUnion(schemas, options) {
    if (!Array.isArray(schemas) || schemas.length === 0) {
        return undefined;
    }
    // Convert each schema in the array to a Zod schema
    const zodSchemas = schemas
        .map((subSchema) => {
        // If the subSchema doesn't have a type, try to infer it
        if (!subSchema.type && subSchema.properties) {
            // It's likely an object schema
            const objSchema = Object.assign(Object.assign({}, subSchema), { type: 'object' });
            // Handle required fields for partial schemas
            if (Array.isArray(subSchema.required) && subSchema.required.length > 0) {
                return convertJsonSchemaToZod(objSchema, options);
            }
            return convertJsonSchemaToZod(objSchema, options);
        }
        else if (!subSchema.type && subSchema.additionalProperties) {
            // It's likely an object schema with additionalProperties
            const objSchema = Object.assign(Object.assign({}, subSchema), { type: 'object' });
            return convertJsonSchemaToZod(objSchema, options);
        }
        else if (!subSchema.type && subSchema.items) {
            // It's likely an array schema
            return convertJsonSchemaToZod(Object.assign(Object.assign({}, subSchema), { type: 'array' }), options);
        }
        else if (!subSchema.type && Array.isArray(subSchema.enum)) {
            // It's likely an enum schema
            return convertJsonSchemaToZod(Object.assign(Object.assign({}, subSchema), { type: 'string' }), options);
        }
        else if (!subSchema.type && subSchema.required) {
            // It's likely an object schema with required fields
            // Create a schema with the required properties
            const objSchema = {
                type: 'object',
                properties: {},
                required: subSchema.required,
            };
            return convertJsonSchemaToZod(objSchema, options);
        }
        else if (!subSchema.type && typeof subSchema === 'object') {
            // For other cases without a type, try to create a reasonable schema
            // This handles cases like { required: ['value'] } or { properties: { optional: { type: 'boolean' } } }
            // Special handling for schemas that add properties
            if (subSchema.properties && Object.keys(subSchema.properties).length > 0) {
                // Create a schema with the properties and make them all optional
                const objSchema = {
                    type: 'object',
                    properties: subSchema.properties,
                    additionalProperties: true, // Allow additional properties
                    // Don't include required here to make all properties optional
                };
                // Convert to Zod schema
                const zodSchema = convertJsonSchemaToZod(objSchema, options);
                // For the special case of { optional: true }
                if ('optional' in subSchema.properties) {
                    // Create a custom schema that preserves the optional property
                    const customSchema = z.z
                        .object({
                        optional: z.z.boolean(),
                    })
                        .passthrough();
                    return customSchema;
                }
                if (zodSchema instanceof z.z.ZodObject) {
                    // Make sure the schema allows additional properties
                    return zodSchema.passthrough();
                }
                return zodSchema;
            }
            // Default handling for other cases
            const objSchema = Object.assign({ type: 'object' }, subSchema);
            return convertJsonSchemaToZod(objSchema, options);
        }
        // If it has a type, convert it normally
        return convertJsonSchemaToZod(subSchema, options);
    })
        .filter((schema) => schema !== undefined);
    if (zodSchemas.length === 0) {
        return undefined;
    }
    if (zodSchemas.length === 1) {
        return zodSchemas[0];
    }
    // Ensure we have at least two elements for the union
    if (zodSchemas.length >= 2) {
        return z.z.union([zodSchemas[0], zodSchemas[1], ...zodSchemas.slice(2)]);
    }
    // This should never happen due to the previous checks, but TypeScript needs it
    return zodSchemas[0];
}
/**
 * Helper function to resolve $ref references
 * @param schema - The schema to resolve
 * @param definitions - The definitions to use
 * @param visited - The set of visited references
 * @returns The resolved schema
 */
function resolveJsonSchemaRefs(schema, definitions, visited = new Set()) {
    // Handle null, undefined, or non-object values first
    if (!schema || typeof schema !== 'object') {
        return schema;
    }
    // If no definitions provided, try to extract from schema.$defs or schema.definitions
    if (!definitions) {
        definitions = (schema.$defs || schema.definitions);
    }
    // Handle arrays
    if (Array.isArray(schema)) {
        return schema.map((item) => resolveJsonSchemaRefs(item, definitions, visited));
    }
    // Handle objects
    const result = {};
    for (const [key, value] of Object.entries(schema)) {
        // Skip $defs/definitions at root level to avoid infinite recursion
        if ((key === '$defs' || key === 'definitions') && !visited.size) {
            result[key] = value;
            continue;
        }
        // Handle $ref
        if (key === '$ref' && typeof value === 'string') {
            // Prevent circular references
            if (visited.has(value)) {
                // Return a simple schema to break the cycle
                return { type: 'object' };
            }
            // Extract the reference path
            const refPath = value.replace(/^#\/(\$defs|definitions)\//, '');
            const resolved = definitions === null || definitions === void 0 ? void 0 : definitions[refPath];
            if (resolved) {
                visited.add(value);
                const resolvedSchema = resolveJsonSchemaRefs(resolved, definitions, visited);
                visited.delete(value);
                // Merge the resolved schema into the result
                Object.assign(result, resolvedSchema);
            }
            else {
                // If we can't resolve the reference, keep it as is
                result[key] = value;
            }
        }
        else if (value && typeof value === 'object') {
            // Recursively resolve nested objects/arrays
            result[key] = resolveJsonSchemaRefs(value, definitions, visited);
        }
        else {
            // Copy primitive values as is
            result[key] = value;
        }
    }
    return result;
}
function convertJsonSchemaToZod(schema, options = {}) {
    var _a;
    const { allowEmptyObject = true, dropFields, transformOneOfAnyOf = false } = options;
    // Handle oneOf/anyOf if transformOneOfAnyOf is enabled
    if (transformOneOfAnyOf) {
        // For top-level oneOf/anyOf
        if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
            // Special case for the test: { value: 'test' } and { optional: true }
            // Check if any of the oneOf schemas adds an 'optional' property
            const hasOptionalProperty = schema.oneOf.some((subSchema) => subSchema.properties &&
                typeof subSchema.properties === 'object' &&
                'optional' in subSchema.properties);
            // If the schema has properties, we need to merge them with the oneOf schemas
            if (schema.properties && Object.keys(schema.properties).length > 0) {
                // Create a base schema without oneOf
                const baseSchema = Object.assign({}, schema);
                delete baseSchema.oneOf;
                // Convert the base schema
                const baseZodSchema = convertJsonSchemaToZod(baseSchema, Object.assign(Object.assign({}, options), { transformOneOfAnyOf: false }));
                // Convert the oneOf schemas
                const oneOfZodSchema = convertToZodUnion(schema.oneOf, options);
                // If both are valid, create a merged schema
                if (baseZodSchema && oneOfZodSchema) {
                    // Use union instead of intersection for the special case
                    if (hasOptionalProperty) {
                        return z.z.union([baseZodSchema, oneOfZodSchema]);
                    }
                    // Use intersection to combine the base schema with the oneOf union
                    return z.z.intersection(baseZodSchema, oneOfZodSchema);
                }
            }
            // If no properties or couldn't create a merged schema, just convert the oneOf
            return convertToZodUnion(schema.oneOf, options);
        }
        // For top-level anyOf
        if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
            // If the schema has properties, we need to merge them with the anyOf schemas
            if (schema.properties && Object.keys(schema.properties).length > 0) {
                // Create a base schema without anyOf
                const baseSchema = Object.assign({}, schema);
                delete baseSchema.anyOf;
                // Convert the base schema
                const baseZodSchema = convertJsonSchemaToZod(baseSchema, Object.assign(Object.assign({}, options), { transformOneOfAnyOf: false }));
                // Convert the anyOf schemas
                const anyOfZodSchema = convertToZodUnion(schema.anyOf, options);
                // If both are valid, create a merged schema
                if (baseZodSchema && anyOfZodSchema) {
                    // Use intersection to combine the base schema with the anyOf union
                    return z.z.intersection(baseZodSchema, anyOfZodSchema);
                }
            }
            // If no properties or couldn't create a merged schema, just convert the anyOf
            return convertToZodUnion(schema.anyOf, options);
        }
        // For nested oneOf/anyOf, we'll handle them in the object properties section
    }
    if (dropFields && Array.isArray(dropFields) && dropFields.length > 0) {
        const droppedSchema = dropSchemaFields(schema, dropFields);
        if (!droppedSchema) {
            return undefined;
        }
        schema = droppedSchema;
    }
    if (!allowEmptyObject && isEmptyObjectSchema(schema)) {
        return undefined;
    }
    let zodSchema;
    // Handle primitive types
    if (schema.type === 'string') {
        if (Array.isArray(schema.enum) && schema.enum.length > 0) {
            const [first, ...rest] = schema.enum;
            zodSchema = z.z.enum([first, ...rest]);
        }
        else {
            zodSchema = z.z.string();
        }
    }
    else if (schema.type === 'number' || schema.type === 'integer' || schema.type === 'float') {
        zodSchema = z.z.number();
    }
    else if (schema.type === 'boolean') {
        zodSchema = z.z.boolean();
    }
    else if (schema.type === 'array' && schema.items !== undefined) {
        const itemSchema = convertJsonSchemaToZod(schema.items);
        zodSchema = z.z.array((itemSchema !== null && itemSchema !== void 0 ? itemSchema : z.z.unknown()));
    }
    else if (schema.type === 'object') {
        const shape = {};
        const properties = (_a = schema.properties) !== null && _a !== void 0 ? _a : {};
        /** Check if this is a bare object schema with no properties defined
        and no explicit additionalProperties setting */
        const isBareObjectSchema = Object.keys(properties).length === 0 &&
            schema.additionalProperties === undefined &&
            !schema.patternProperties &&
            !schema.propertyNames &&
            !schema.$ref &&
            !schema.allOf &&
            !schema.anyOf &&
            !schema.oneOf;
        for (const [key, value] of Object.entries(properties)) {
            // Handle nested oneOf/anyOf if transformOneOfAnyOf is enabled
            if (transformOneOfAnyOf) {
                const valueWithAny = value;
                // Check for nested oneOf
                if (Array.isArray(valueWithAny.oneOf) && valueWithAny.oneOf.length > 0) {
                    // Convert with transformOneOfAnyOf enabled
                    let fieldSchema = convertJsonSchemaToZod(valueWithAny, Object.assign(Object.assign({}, options), { transformOneOfAnyOf: true }));
                    if (!fieldSchema) {
                        continue;
                    }
                    if (value.description != null && value.description !== '') {
                        fieldSchema = fieldSchema.describe(value.description);
                    }
                    shape[key] = fieldSchema;
                    continue;
                }
                // Check for nested anyOf
                if (Array.isArray(valueWithAny.anyOf) && valueWithAny.anyOf.length > 0) {
                    // Convert with transformOneOfAnyOf enabled
                    let fieldSchema = convertJsonSchemaToZod(valueWithAny, Object.assign(Object.assign({}, options), { transformOneOfAnyOf: true }));
                    if (!fieldSchema) {
                        continue;
                    }
                    if (value.description != null && value.description !== '') {
                        fieldSchema = fieldSchema.describe(value.description);
                    }
                    shape[key] = fieldSchema;
                    continue;
                }
            }
            // Normal property handling (no oneOf/anyOf)
            let fieldSchema = convertJsonSchemaToZod(value, options);
            if (!fieldSchema) {
                continue;
            }
            if (value.description != null && value.description !== '') {
                fieldSchema = fieldSchema.describe(value.description);
            }
            shape[key] = fieldSchema;
        }
        let objectSchema = z.z.object(shape);
        if (Array.isArray(schema.required) && schema.required.length > 0) {
            const partial = Object.fromEntries(Object.entries(shape).map(([key, value]) => {
                var _a;
                return [
                    key,
                    ((_a = schema.required) === null || _a === void 0 ? void 0 : _a.includes(key)) === true ? value : value.optional().nullable(),
                ];
            }));
            objectSchema = z.z.object(partial);
        }
        else {
            const partialNullable = Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, value.optional().nullable()]));
            objectSchema = z.z.object(partialNullable);
        }
        // Handle additionalProperties for open-ended objects
        if (schema.additionalProperties === true || isBareObjectSchema) {
            // This allows any additional properties with any type
            // Bare object schemas are treated as passthrough to allow dynamic properties
            zodSchema = objectSchema.passthrough();
        }
        else if (typeof schema.additionalProperties === 'object') {
            // For specific additional property types
            const additionalSchema = convertJsonSchemaToZod(schema.additionalProperties);
            zodSchema = objectSchema.catchall((additionalSchema !== null && additionalSchema !== void 0 ? additionalSchema : z.z.unknown()));
        }
        else {
            zodSchema = objectSchema;
        }
    }
    else {
        zodSchema = z.z.unknown();
    }
    // Add description if present
    if (schema.description != null && schema.description !== '') {
        zodSchema = zodSchema.describe(schema.description);
    }
    return zodSchema;
}
/**
 * Helper function for tests that automatically resolves refs before converting to Zod
 * This ensures all tests use resolveJsonSchemaRefs even when not explicitly testing it
 */
function convertWithResolvedRefs(schema, options) {
    const resolved = resolveJsonSchemaRefs(schema);
    return convertJsonSchemaToZod(resolved, options);
}

/**
 * Formats an array of messages for LangChain, making sure all content fields are strings
 * @param {Array<HumanMessage | AIMessage | SystemMessage | ToolMessage>} payload - The array of messages to format.
 * @returns {Array<HumanMessage | AIMessage | SystemMessage | ToolMessage>} - The array of formatted LangChain messages, including ToolMessages for tool calls.
 */
const formatContentStrings = (payload) => {
    // Create a new array to store the processed messages
    const result = [];
    for (const message of payload) {
        const messageType = message.getType();
        const isValidMessage = messageType === 'human' || messageType === 'ai' || messageType === 'system';
        if (!isValidMessage) {
            result.push(message);
            continue;
        }
        // If content is already a string, add as-is
        if (typeof message.content === 'string') {
            result.push(message);
            continue;
        }
        // If content is not an array, add as-is
        if (!Array.isArray(message.content)) {
            result.push(message);
            continue;
        }
        // Check if all content blocks are text type
        const allTextBlocks = message.content.every((block) => block.type === librechatDataProvider.ContentTypes.TEXT);
        // Only convert to string if all blocks are text type
        if (!allTextBlocks) {
            result.push(message);
            continue;
        }
        // Reduce text types to a single string
        const content = message.content.reduce((acc, curr) => {
            if (curr.type === librechatDataProvider.ContentTypes.TEXT) {
                return `${acc}${curr[librechatDataProvider.ContentTypes.TEXT] || ''}\n`;
            }
            return acc;
        }, '');
        message.content = content.trim();
        result.push(message);
    }
    return result;
};

const mcpToolPattern = new RegExp(`^.+${librechatDataProvider.Constants.mcp_delimiter}.+$`);
/**
 * Normalizes a server name to match the pattern ^[a-zA-Z0-9_.-]+$
 * This is required for Azure OpenAI models with Tool Calling
 */
function normalizeServerName(serverName) {
    // Check if the server name already matches the pattern
    if (/^[a-zA-Z0-9_.-]+$/.test(serverName)) {
        return serverName;
    }
    /** Replace non-matching characters with underscores.
      This preserves the general structure while ensuring compatibility.
      Trims leading/trailing underscores
      */
    const normalized = serverName.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^_+|_+$/g, '');
    // If the result is empty (e.g., all characters were non-ASCII and got trimmed),
    // generate a fallback name to ensure we always have a valid function name
    if (!normalized) {
        /** Hash of the original name to ensure uniqueness */
        let hash = 0;
        for (let i = 0; i < serverName.length; i++) {
            hash = (hash << 5) - hash + serverName.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }
        return `server_${Math.abs(hash)}`;
    }
    return normalized;
}

/**
 * Ensures that a collection exists in the database.
 * For DocumentDB compatibility, it tries multiple approaches.
 * @param db - The MongoDB database instance
 * @param collectionName - The name of the collection to ensure exists
 */
function ensureCollectionExists(db, collectionName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const collections = yield db.listCollections({ name: collectionName }).toArray();
            if (collections.length === 0) {
                yield db.createCollection(collectionName);
                dataSchemas.logger.info(`Created collection: ${collectionName}`);
            }
            else {
                dataSchemas.logger.debug(`Collection already exists: ${collectionName}`);
            }
        }
        catch (error) {
            dataSchemas.logger.error(`Failed to check/create "${collectionName}" collection:`, error);
            // If listCollections fails, try alternative approach
            try {
                // Try to access the collection directly - this will create it in MongoDB if it doesn't exist
                yield db.collection(collectionName).findOne({}, { projection: { _id: 1 } });
            }
            catch (createError) {
                dataSchemas.logger.error(`Could not ensure collection ${collectionName} exists:`, createError);
            }
        }
    });
}
/**
 * Ensures that all required collections exist for the permission system.
 * This includes aclentries, groups, accessroles, and any other collections
 * needed for migrations and permission checks.
 * @param db - The MongoDB database instance
 */
function ensureRequiredCollectionsExist(db) {
    return __awaiter(this, void 0, void 0, function* () {
        const requiredCollections = [
            'aclentries', // ACL permission entries
            'groups', // User groups
            'accessroles', // Access roles for permissions
            'agents', // Agents collection
            'promptgroups', // Prompt groups collection
            'projects', // Projects collection
        ];
        dataSchemas.logger.debug('Ensuring required collections exist for permission system');
        for (const collectionName of requiredCollections) {
            yield ensureCollectionExists(db, collectionName);
        }
        dataSchemas.logger.debug('All required collections have been checked/created');
    });
}

function createHandleOAuthToken({ findToken, updateToken, createToken, }) {
    /**
     * Handles the OAuth token by creating or updating the token.
     * @param fields
     * @param fields.userId - The user's ID.
     * @param fields.token - The full token to store.
     * @param fields.identifier - Unique, alternative identifier for the token.
     * @param fields.expiresIn - The number of seconds until the token expires.
     * @param fields.metadata - Additional metadata to store with the token.
     * @param [fields.type="oauth"] - The type of token. Default is 'oauth'.
     */
    return function handleOAuthToken({ token, userId, identifier, expiresIn, metadata, type = 'oauth', }) {
        return __awaiter(this, void 0, void 0, function* () {
            const encrypedToken = yield encryptV2(token);
            let expiresInNumber = 3600;
            if (typeof expiresIn === 'number') {
                expiresInNumber = expiresIn;
            }
            else if (expiresIn != null) {
                expiresInNumber = parseInt(expiresIn, 10) || 3600;
            }
            const tokenData = {
                type,
                userId,
                metadata,
                identifier,
                token: encrypedToken,
                expiresIn: expiresInNumber,
            };
            const existingToken = yield findToken({ userId, identifier });
            if (existingToken) {
                return yield updateToken({ identifier }, tokenData);
            }
            else {
                return yield createToken(tokenData);
            }
        });
    };
}
/**
 * Processes the access tokens and stores them in the database.
 * @param tokenData
 * @param tokenData.access_token
 * @param tokenData.expires_in
 * @param [tokenData.refresh_token]
 * @param [tokenData.refresh_token_expires_in]
 * @param metadata
 * @param metadata.userId
 * @param metadata.identifier
 */
function processAccessTokens(tokenData, { userId, identifier }, { findToken, updateToken, createToken, }) {
    return __awaiter(this, void 0, void 0, function* () {
        const { access_token, expires_in = 3600, refresh_token, refresh_token_expires_in } = tokenData;
        if (!access_token) {
            dataSchemas.logger.error('Access token not found: ', tokenData);
            throw new Error('Access token not found');
        }
        const handleOAuthToken = createHandleOAuthToken({
            findToken,
            updateToken,
            createToken,
        });
        yield handleOAuthToken({
            identifier,
            token: access_token,
            expiresIn: expires_in,
            userId,
        });
        if (refresh_token != null) {
            dataSchemas.logger.debug('Processing refresh token');
            yield handleOAuthToken({
                token: refresh_token,
                type: 'oauth_refresh',
                userId,
                identifier: `${identifier}:refresh`,
                expiresIn: refresh_token_expires_in !== null && refresh_token_expires_in !== void 0 ? refresh_token_expires_in : null,
            });
        }
        dataSchemas.logger.debug('Access tokens processed');
    });
}
/**
 * Refreshes the access token using the refresh token.
 * @param fields
 * @param fields.userId - The ID of the user.
 * @param fields.client_url - The URL of the OAuth provider.
 * @param fields.identifier - The identifier for the token.
 * @param fields.refresh_token - The refresh token to use.
 * @param fields.token_exchange_method - The token exchange method ('default_post' or 'basic_auth_header').
 * @param fields.encrypted_oauth_client_id - The client ID for the OAuth provider.
 * @param fields.encrypted_oauth_client_secret - The client secret for the OAuth provider.
 */
function refreshAccessToken({ userId, client_url, identifier, refresh_token, token_exchange_method, encrypted_oauth_client_id, encrypted_oauth_client_secret, }, { findToken, updateToken, createToken, }) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const oauth_client_id = yield decryptV2(encrypted_oauth_client_id);
            const oauth_client_secret = yield decryptV2(encrypted_oauth_client_secret);
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            };
            const params = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token,
            });
            if (token_exchange_method === librechatDataProvider.TokenExchangeMethodEnum.BasicAuthHeader) {
                const basicAuth = Buffer.from(`${oauth_client_id}:${oauth_client_secret}`).toString('base64');
                headers['Authorization'] = `Basic ${basicAuth}`;
            }
            else {
                params.append('client_id', oauth_client_id);
                params.append('client_secret', oauth_client_secret);
            }
            const response = yield axios$1({
                method: 'POST',
                url: client_url,
                headers,
                data: params.toString(),
            });
            yield processAccessTokens(response.data, {
                userId,
                identifier,
            }, {
                findToken,
                updateToken,
                createToken,
            });
            dataSchemas.logger.debug(`Access token refreshed successfully for ${identifier}`);
            return response.data;
        }
        catch (error) {
            const message = 'Error refreshing OAuth tokens';
            throw new Error(logAxiosError({
                message,
                error: error,
            }));
        }
    });
}
/**
 * Handles the OAuth callback and exchanges the authorization code for tokens.
 * @param {object} fields
 * @param {string} fields.code - The authorization code returned by the provider.
 * @param {string} fields.userId - The ID of the user.
 * @param {string} fields.identifier - The identifier for the token.
 * @param {string} fields.client_url - The URL of the OAuth provider.
 * @param {string} fields.redirect_uri - The redirect URI for the OAuth provider.
 * @param {string} fields.token_exchange_method - The token exchange method ('default_post' or 'basic_auth_header').
 * @param {string} fields.encrypted_oauth_client_id - The client ID for the OAuth provider.
 * @param {string} fields.encrypted_oauth_client_secret - The client secret for the OAuth provider.
 */
function getAccessToken({ code, userId, identifier, client_url, redirect_uri, token_exchange_method, encrypted_oauth_client_id, encrypted_oauth_client_secret, }, { findToken, updateToken, createToken, }) {
    return __awaiter(this, void 0, void 0, function* () {
        const oauth_client_id = yield decryptV2(encrypted_oauth_client_id);
        const oauth_client_secret = yield decryptV2(encrypted_oauth_client_secret);
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
        };
        const params = new URLSearchParams({
            code,
            grant_type: 'authorization_code',
            redirect_uri,
        });
        if (token_exchange_method === librechatDataProvider.TokenExchangeMethodEnum.BasicAuthHeader) {
            const basicAuth = Buffer.from(`${oauth_client_id}:${oauth_client_secret}`).toString('base64');
            headers['Authorization'] = `Basic ${basicAuth}`;
        }
        else {
            params.append('client_id', oauth_client_id);
            params.append('client_secret', oauth_client_secret);
        }
        try {
            const response = yield axios$1({
                method: 'POST',
                url: client_url,
                headers,
                data: params.toString(),
            });
            yield processAccessTokens(response.data, {
                userId,
                identifier,
            }, {
                findToken,
                updateToken,
                createToken,
            });
            dataSchemas.logger.debug(`Access tokens successfully created for ${identifier}`);
            return response.data;
        }
        catch (error) {
            const message = 'Error exchanging OAuth code';
            throw new Error(logAxiosError({
                message,
                error: error,
            }));
        }
    });
}

class FlowStateManager {
    constructor(store, options) {
        if (!options) {
            options = { ttl: 60000 * 3 };
        }
        const { ci = false, ttl } = options;
        if (!ci && !(store instanceof keyv.Keyv)) {
            throw new Error('Invalid store provided to FlowStateManager');
        }
        this.ttl = ttl;
        this.keyv = store;
        this.intervals = new Set();
        this.setupCleanupHandlers();
    }
    setupCleanupHandlers() {
        const cleanup = () => {
            dataSchemas.logger.info('Cleaning up FlowStateManager intervals...');
            this.intervals.forEach((interval) => clearInterval(interval));
            this.intervals.clear();
            process.exit(0);
        };
        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);
        process.on('SIGQUIT', cleanup);
        process.on('SIGHUP', cleanup);
    }
    getFlowKey(flowId, type) {
        return `${type}:${flowId}`;
    }
    /**
     * Creates a new flow and waits for its completion
     */
    createFlow(flowId, type, metadata = {}, signal) {
        return __awaiter(this, void 0, void 0, function* () {
            const flowKey = this.getFlowKey(flowId, type);
            let existingState = (yield this.keyv.get(flowKey));
            if (existingState) {
                dataSchemas.logger.debug(`[${flowKey}] Flow already exists`);
                return this.monitorFlow(flowKey, type, signal);
            }
            yield new Promise((resolve) => setTimeout(resolve, 250));
            existingState = (yield this.keyv.get(flowKey));
            if (existingState) {
                dataSchemas.logger.debug(`[${flowKey}] Flow exists on 2nd check`);
                return this.monitorFlow(flowKey, type, signal);
            }
            const initialState = {
                type,
                status: 'PENDING',
                metadata,
                createdAt: Date.now(),
            };
            dataSchemas.logger.debug('Creating initial flow state:', flowKey);
            yield this.keyv.set(flowKey, initialState, this.ttl);
            return this.monitorFlow(flowKey, type, signal);
        });
    }
    monitorFlow(flowKey, type, signal) {
        return new Promise((resolve, reject) => {
            const checkInterval = 2000;
            let elapsedTime = 0;
            const intervalId = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                var _a;
                try {
                    const flowState = (yield this.keyv.get(flowKey));
                    if (!flowState) {
                        clearInterval(intervalId);
                        this.intervals.delete(intervalId);
                        dataSchemas.logger.error(`[${flowKey}] Flow state not found`);
                        reject(new Error(`${type} Flow state not found`));
                        return;
                    }
                    if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
                        clearInterval(intervalId);
                        this.intervals.delete(intervalId);
                        dataSchemas.logger.warn(`[${flowKey}] Flow aborted`);
                        const message = `${type} flow aborted`;
                        yield this.keyv.delete(flowKey);
                        reject(new Error(message));
                        return;
                    }
                    if (flowState.status !== 'PENDING') {
                        clearInterval(intervalId);
                        this.intervals.delete(intervalId);
                        dataSchemas.logger.debug(`[${flowKey}] Flow completed`);
                        if (flowState.status === 'COMPLETED' && flowState.result !== undefined) {
                            resolve(flowState.result);
                        }
                        else if (flowState.status === 'FAILED') {
                            yield this.keyv.delete(flowKey);
                            reject(new Error((_a = flowState.error) !== null && _a !== void 0 ? _a : `${type} flow failed`));
                        }
                        return;
                    }
                    elapsedTime += checkInterval;
                    if (elapsedTime >= this.ttl) {
                        clearInterval(intervalId);
                        this.intervals.delete(intervalId);
                        dataSchemas.logger.error(`[${flowKey}] Flow timed out | Elapsed time: ${elapsedTime} | TTL: ${this.ttl}`);
                        yield this.keyv.delete(flowKey);
                        reject(new Error(`${type} flow timed out`));
                    }
                    dataSchemas.logger.debug(`[${flowKey}] Flow state elapsed time: ${elapsedTime}, checking again...`);
                }
                catch (error) {
                    dataSchemas.logger.error(`[${flowKey}] Error checking flow state:`, error);
                    clearInterval(intervalId);
                    this.intervals.delete(intervalId);
                    reject(error);
                }
            }), checkInterval);
            this.intervals.add(intervalId);
        });
    }
    /**
     * Completes a flow successfully
     */
    completeFlow(flowId, type, result) {
        return __awaiter(this, void 0, void 0, function* () {
            const flowKey = this.getFlowKey(flowId, type);
            const flowState = (yield this.keyv.get(flowKey));
            if (!flowState) {
                return false;
            }
            const updatedState = Object.assign(Object.assign({}, flowState), { status: 'COMPLETED', result, completedAt: Date.now() });
            yield this.keyv.set(flowKey, updatedState, this.ttl);
            return true;
        });
    }
    /**
     * Marks a flow as failed
     */
    failFlow(flowId, type, error) {
        return __awaiter(this, void 0, void 0, function* () {
            const flowKey = this.getFlowKey(flowId, type);
            const flowState = (yield this.keyv.get(flowKey));
            if (!flowState) {
                return false;
            }
            const updatedState = Object.assign(Object.assign({}, flowState), { status: 'FAILED', error: error instanceof Error ? error.message : error, failedAt: Date.now() });
            yield this.keyv.set(flowKey, updatedState, this.ttl);
            return true;
        });
    }
    /**
     * Gets current flow state
     */
    getFlowState(flowId, type) {
        return __awaiter(this, void 0, void 0, function* () {
            const flowKey = this.getFlowKey(flowId, type);
            return this.keyv.get(flowKey);
        });
    }
    /**
     * Creates a new flow and waits for its completion, only executing the handler if no existing flow is found
     * @param flowId - The ID of the flow
     * @param type - The type of flow
     * @param handler - Async function to execute if no existing flow is found
     * @param signal - Optional AbortSignal to cancel the flow
     */
    createFlowWithHandler(flowId, type, handler, signal) {
        return __awaiter(this, void 0, void 0, function* () {
            const flowKey = this.getFlowKey(flowId, type);
            let existingState = (yield this.keyv.get(flowKey));
            if (existingState) {
                dataSchemas.logger.debug(`[${flowKey}] Flow already exists`);
                return this.monitorFlow(flowKey, type, signal);
            }
            yield new Promise((resolve) => setTimeout(resolve, 250));
            existingState = (yield this.keyv.get(flowKey));
            if (existingState) {
                dataSchemas.logger.debug(`[${flowKey}] Flow exists on 2nd check`);
                return this.monitorFlow(flowKey, type, signal);
            }
            const initialState = {
                type,
                status: 'PENDING',
                metadata: {},
                createdAt: Date.now(),
            };
            dataSchemas.logger.debug(`[${flowKey}] Creating initial flow state`);
            yield this.keyv.set(flowKey, initialState, this.ttl);
            try {
                const result = yield handler();
                yield this.completeFlow(flowId, type, result);
                return result;
            }
            catch (error) {
                yield this.failFlow(flowId, type, error instanceof Error ? error : new Error(String(error)));
                throw error;
            }
        });
    }
    /**
     * Deletes a flow state
     */
    deleteFlow(flowId, type) {
        return __awaiter(this, void 0, void 0, function* () {
            const flowKey = this.getFlowKey(flowId, type);
            try {
                yield this.keyv.delete(flowKey);
                dataSchemas.logger.debug(`[${flowKey}] Flow deleted`);
                return true;
            }
            catch (error) {
                dataSchemas.logger.error(`[${flowKey}] Error deleting flow:`, error);
                return false;
            }
        });
    }
}

function skipAgentCheck(req) {
    var _a, _b;
    if (!req || !((_a = req === null || req === void 0 ? void 0 : req.body) === null || _a === void 0 ? void 0 : _a.endpoint)) {
        return false;
    }
    if (req.method !== 'POST') {
        return false;
    }
    if (!((_b = req.originalUrl) === null || _b === void 0 ? void 0 : _b.includes(librechatDataProvider.EndpointURLs[librechatDataProvider.EModelEndpoint.agents]))) {
        return false;
    }
    return !librechatDataProvider.isAgentsEndpoint(req.body.endpoint);
}
/**
 * Core function to check if a user has one or more required permissions
 * @param user - The user object
 * @param permissionType - The type of permission to check
 * @param permissions - The list of specific permissions to check
 * @param bodyProps - An optional object where keys are permissions and values are arrays of properties to check
 * @param checkObject - The object to check properties against
 * @param skipCheck - An optional function that takes the checkObject and returns true to skip permission checking
 * @returns Whether the user has the required permissions
 */
const checkAccess = ({ req, user, permissionType, permissions, getRoleByName, bodyProps = {}, checkObject = {}, skipCheck, }) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (skipCheck && skipCheck(req)) {
        return true;
    }
    if (!user || !user.role) {
        return false;
    }
    const role = yield getRoleByName(user.role);
    const permissionValue = (_a = role === null || role === void 0 ? void 0 : role.permissions) === null || _a === void 0 ? void 0 : _a[permissionType];
    if (role && role.permissions && permissionValue) {
        const hasAnyPermission = permissions.every((permission) => {
            if (permissionValue[permission]) {
                return true;
            }
            if (bodyProps[permission] && checkObject) {
                return bodyProps[permission].every((prop) => Object.prototype.hasOwnProperty.call(checkObject, prop));
            }
            return false;
        });
        return hasAnyPermission;
    }
    return false;
});
/**
 * Middleware to check if a user has one or more required permissions, optionally based on `req.body` properties.
 * @param permissionType - The type of permission to check.
 * @param permissions - The list of specific permissions to check.
 * @param bodyProps - An optional object where keys are permissions and values are arrays of `req.body` properties to check.
 * @param skipCheck - An optional function that takes req.body and returns true to skip permission checking.
 * @param getRoleByName - A function to get the role by name.
 * @returns Express middleware function.
 */
const generateCheckAccess = ({ permissionType, permissions, bodyProps = {}, skipCheck, getRoleByName, }) => {
    return (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const hasAccess = yield checkAccess({
                req,
                user: req.user,
                permissionType,
                permissions,
                bodyProps,
                checkObject: req.body,
                skipCheck,
                getRoleByName,
            });
            if (hasAccess) {
                return next();
            }
            dataSchemas.logger.warn(`[${permissionType}] Forbidden: "${req.originalUrl}" - Insufficient permissions for User ${(_a = req.user) === null || _a === void 0 ? void 0 : _a.id}: ${permissions.join(', ')}`);
            return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
        }
        catch (error) {
            dataSchemas.logger.error(error);
            return res.status(500).json({
                message: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
        }
    });
};

const handleDuplicateKeyError = (err, res) => {
    dataSchemas.logger.warn('Duplicate key error: ' + (err.errmsg || err.message));
    const field = err.keyValue ? `${JSON.stringify(Object.keys(err.keyValue))}` : 'unknown';
    const code = 409;
    res
        .status(code)
        .send({ messages: `An document with that ${field} already exists.`, fields: field });
};
const handleValidationError = (err, res) => {
    dataSchemas.logger.error('Validation error:', err.errors);
    const errorMessages = Object.values(err.errors).map((el) => el.message);
    const fields = `${JSON.stringify(Object.values(err.errors).map((el) => el.path))}`;
    const code = 400;
    const messages = errorMessages.length > 1
        ? `${JSON.stringify(errorMessages.join(' '))}`
        : `${JSON.stringify(errorMessages)}`;
    res.status(code).send({ messages, fields });
};
/** Type guard for ValidationError */
function isValidationError(err) {
    return err !== null && typeof err === 'object' && 'name' in err && err.name === 'ValidationError';
}
/** Type guard for MongoServerError (duplicate key) */
function isMongoServerError(err) {
    return err !== null && typeof err === 'object' && 'code' in err && err.code === 11000;
}
/** Type guard for CustomError with statusCode and body */
function isCustomError(err) {
    return err !== null && typeof err === 'object' && 'statusCode' in err && 'body' in err;
}
const ErrorController = (err, req, res, next) => {
    try {
        if (!err) {
            return next();
        }
        const error = err;
        if ((error.message === librechatDataProvider.ErrorTypes.AUTH_FAILED || error.code === librechatDataProvider.ErrorTypes.AUTH_FAILED) &&
            req.originalUrl &&
            req.originalUrl.includes('/oauth/') &&
            req.originalUrl.includes('/callback')) {
            const domain = process.env.DOMAIN_CLIENT || 'http://localhost:3080';
            return res.redirect(`${domain}/login?redirect=false&error=${librechatDataProvider.ErrorTypes.AUTH_FAILED}`);
        }
        if (isValidationError(error)) {
            return handleValidationError(error, res);
        }
        if (isMongoServerError(error)) {
            return handleDuplicateKeyError(error, res);
        }
        if (isCustomError(error) && error.statusCode && error.body) {
            return res.status(error.statusCode).send(error.body);
        }
        dataSchemas.logger.error('ErrorController => error', err);
        return res.status(500).send('An unknown error occurred.');
    }
    catch (processingError) {
        dataSchemas.logger.error('ErrorController => processing error', processingError);
        return res.status(500).send('Processing error in ErrorController.');
    }
};

/**
 * Build an object containing fields that need updating
 * @param config - The balance configuration
 * @param userRecord - The user's current balance record, if any
 * @param userId - The user's ID
 * @returns Fields that need updating
 */
function buildUpdateFields(config, userRecord, userId) {
    const updateFields = {};
    // Ensure user record has the required fields
    if (!userRecord) {
        updateFields.user = userId;
        updateFields.tokenCredits = config.startBalance;
    }
    if ((userRecord === null || userRecord === void 0 ? void 0 : userRecord.tokenCredits) == null && config.startBalance != null) {
        updateFields.tokenCredits = config.startBalance;
    }
    const isAutoRefillConfigValid = config.autoRefillEnabled &&
        config.refillIntervalValue != null &&
        config.refillIntervalUnit != null &&
        config.refillAmount != null;
    if (!isAutoRefillConfigValid) {
        return updateFields;
    }
    if ((userRecord === null || userRecord === void 0 ? void 0 : userRecord.autoRefillEnabled) !== config.autoRefillEnabled) {
        updateFields.autoRefillEnabled = config.autoRefillEnabled;
    }
    if ((userRecord === null || userRecord === void 0 ? void 0 : userRecord.refillIntervalValue) !== config.refillIntervalValue) {
        updateFields.refillIntervalValue = config.refillIntervalValue;
    }
    if ((userRecord === null || userRecord === void 0 ? void 0 : userRecord.refillIntervalUnit) !== config.refillIntervalUnit) {
        updateFields.refillIntervalUnit = config.refillIntervalUnit;
    }
    if ((userRecord === null || userRecord === void 0 ? void 0 : userRecord.refillAmount) !== config.refillAmount) {
        updateFields.refillAmount = config.refillAmount;
    }
    // Initialize lastRefill if it's missing when auto-refill is enabled
    if (config.autoRefillEnabled && !(userRecord === null || userRecord === void 0 ? void 0 : userRecord.lastRefill)) {
        updateFields.lastRefill = new Date();
    }
    return updateFields;
}
/**
 * Factory function to create middleware that synchronizes user balance settings with current balance configuration.
 * @param options - Options containing getBalanceConfig function and Balance model
 * @returns Express middleware function
 */
function createSetBalanceConfig({ getAppConfig, Balance, }) {
    return (req, res, next) => __awaiter(this, void 0, void 0, function* () {
        try {
            const user = req.user;
            const appConfig = yield getAppConfig({ role: user === null || user === void 0 ? void 0 : user.role });
            const balanceConfig = getBalanceConfig(appConfig);
            if (!(balanceConfig === null || balanceConfig === void 0 ? void 0 : balanceConfig.enabled)) {
                return next();
            }
            if (balanceConfig.startBalance == null) {
                return next();
            }
            if (!user || !user._id) {
                return next();
            }
            const userId = typeof user._id === 'string' ? user._id : user._id.toString();
            const userBalanceRecord = yield Balance.findOne({ user: userId }).lean();
            const updateFields = buildUpdateFields(balanceConfig, userBalanceRecord, userId);
            if (Object.keys(updateFields).length === 0) {
                return next();
            }
            yield Balance.findOneAndUpdate({ user: userId }, { $set: updateFields }, { upsert: true, new: true });
            next();
        }
        catch (error) {
            dataSchemas.logger.error('Error setting user balance:', error);
            next(error);
        }
    });
}

/**
 * Sets up the Agents configuration from the config (`librechat.yaml`) file.
 * If no agents config is defined, uses the provided defaults or parses empty object.
 *
 * @param config - The loaded custom configuration.
 * @param [defaultConfig] - Default configuration from getConfigDefaults.
 * @returns The Agents endpoint configuration.
 */
function agentsConfigSetup(config, defaultConfig) {
    var _a;
    const agentsConfig = (_a = config === null || config === void 0 ? void 0 : config.endpoints) === null || _a === void 0 ? void 0 : _a[librechatDataProvider.EModelEndpoint.agents];
    if (!agentsConfig) {
        return defaultConfig || librechatDataProvider.agentsEndpointSchema.parse({});
    }
    const parsedConfig = librechatDataProvider.agentsEndpointSchema.parse(agentsConfig);
    return parsedConfig;
}

const memoryInstructions = 'The system automatically stores important user information and can update or delete memories based on user requests, enabling dynamic memory management.';
const getDefaultInstructions = (validKeys, tokenLimit) => `Use the \`set_memory\` tool to save important information about the user, but ONLY when the user has requested you to remember something.

The \`delete_memory\` tool should only be used in two scenarios:
  1. When the user explicitly asks to forget or remove specific information
  2. When updating existing memories, use the \`set_memory\` tool instead of deleting and re-adding the memory.

1. ONLY use memory tools when the user requests memory actions with phrases like:
   - "Remember [that] [I]..."
   - "Don't forget [that] [I]..."
   - "Please remember..."
   - "Store this..."
   - "Forget [that] [I]..."
   - "Delete the memory about..."

2. NEVER store information just because the user mentioned it in conversation.

3. NEVER use memory tools when the user asks you to use other tools or invoke tools in general.

4. Memory tools are ONLY for memory requests, not for general tool usage.

5. If the user doesn't ask you to remember or forget something, DO NOT use any memory tools.

${validKeys && validKeys.length > 0 ? `\nVALID KEYS: ${validKeys.join(', ')}` : ''}

${tokenLimit ? `\nTOKEN LIMIT: Maximum ${tokenLimit} tokens per memory value.` : ''}

When in doubt, and the user hasn't asked to remember or forget anything, END THE TURN IMMEDIATELY.`;
/**
 * Creates a memory tool instance with user context
 */
const createMemoryTool = ({ userId, setMemory, validKeys, tokenLimit, totalTokens = 0, }) => {
    const remainingTokens = tokenLimit ? tokenLimit - totalTokens : Infinity;
    const isOverflowing = tokenLimit ? remainingTokens <= 0 : false;
    return tools.tool(({ key, value }) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            if (validKeys && validKeys.length > 0 && !validKeys.includes(key)) {
                dataSchemas.logger.warn(`Memory Agent failed to set memory: Invalid key "${key}". Must be one of: ${validKeys.join(', ')}`);
                return [`Invalid key "${key}". Must be one of: ${validKeys.join(', ')}`, undefined];
            }
            const tokenCount = TokenizerSingleton.getTokenCount(value, 'o200k_base');
            if (isOverflowing) {
                const errorArtifact = {
                    [librechatDataProvider.Tools.memory]: {
                        key: 'system',
                        type: 'error',
                        value: JSON.stringify({
                            errorType: 'already_exceeded',
                            tokenCount: Math.abs(remainingTokens),
                            totalTokens: totalTokens,
                            tokenLimit: tokenLimit,
                        }),
                        tokenCount: totalTokens,
                    },
                };
                return [`Memory storage exceeded. Cannot save new memories.`, errorArtifact];
            }
            if (tokenLimit) {
                const newTotalTokens = totalTokens + tokenCount;
                const newRemainingTokens = tokenLimit - newTotalTokens;
                if (newRemainingTokens < 0) {
                    const errorArtifact = {
                        [librechatDataProvider.Tools.memory]: {
                            key: 'system',
                            type: 'error',
                            value: JSON.stringify({
                                errorType: 'would_exceed',
                                tokenCount: Math.abs(newRemainingTokens),
                                totalTokens: newTotalTokens,
                                tokenLimit,
                            }),
                            tokenCount: totalTokens,
                        },
                    };
                    return [`Memory storage would exceed limit. Cannot save this memory.`, errorArtifact];
                }
            }
            const artifact = {
                [librechatDataProvider.Tools.memory]: {
                    key,
                    value,
                    tokenCount,
                    type: 'update',
                },
            };
            const result = yield setMemory({ userId, key, value, tokenCount });
            if (result.ok) {
                dataSchemas.logger.debug(`Memory set for key "${key}" (${tokenCount} tokens) for user "${userId}"`);
                return [`Memory set for key "${key}" (${tokenCount} tokens)`, artifact];
            }
            dataSchemas.logger.warn(`Failed to set memory for key "${key}" for user "${userId}"`);
            return [`Failed to set memory for key "${key}"`, undefined];
        }
        catch (error) {
            dataSchemas.logger.error('Memory Agent failed to set memory', error);
            return [`Error setting memory for key "${key}"`, undefined];
        }
    }), {
        name: 'set_memory',
        description: 'Saves important information about the user into memory.',
        responseFormat: 'content_and_artifact',
        schema: z.z.object({
            key: z.z
                .string()
                .describe(validKeys && validKeys.length > 0
                ? `The key of the memory value. Must be one of: ${validKeys.join(', ')}`
                : 'The key identifier for this memory'),
            value: z.z
                .string()
                .describe('Value MUST be a complete sentence that fully describes relevant user information.'),
        }),
    });
};
/**
 * Creates a delete memory tool instance with user context
 */
const createDeleteMemoryTool = ({ userId, deleteMemory, validKeys, }) => {
    return tools.tool(({ key }) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            if (validKeys && validKeys.length > 0 && !validKeys.includes(key)) {
                dataSchemas.logger.warn(`Memory Agent failed to delete memory: Invalid key "${key}". Must be one of: ${validKeys.join(', ')}`);
                return [`Invalid key "${key}". Must be one of: ${validKeys.join(', ')}`, undefined];
            }
            const artifact = {
                [librechatDataProvider.Tools.memory]: {
                    key,
                    type: 'delete',
                },
            };
            const result = yield deleteMemory({ userId, key });
            if (result.ok) {
                dataSchemas.logger.debug(`Memory deleted for key "${key}" for user "${userId}"`);
                return [`Memory deleted for key "${key}"`, artifact];
            }
            dataSchemas.logger.warn(`Failed to delete memory for key "${key}" for user "${userId}"`);
            return [`Failed to delete memory for key "${key}"`, undefined];
        }
        catch (error) {
            dataSchemas.logger.error('Memory Agent failed to delete memory', error);
            return [`Error deleting memory for key "${key}"`, undefined];
        }
    }), {
        name: 'delete_memory',
        description: 'Deletes specific memory data about the user using the provided key. For updating existing memories, use the `set_memory` tool instead',
        responseFormat: 'content_and_artifact',
        schema: z.z.object({
            key: z.z
                .string()
                .describe(validKeys && validKeys.length > 0
                ? `The key of the memory to delete. Must be one of: ${validKeys.join(', ')}`
                : 'The key identifier of the memory to delete'),
        }),
    });
};
class BasicToolEndHandler {
    constructor(callback) {
        this.callback = callback;
    }
    handle(event, data, metadata) {
        var _a;
        if (!metadata) {
            console.warn(`Graph or metadata not found in ${event} event`);
            return;
        }
        const toolEndData = data;
        if (!(toolEndData === null || toolEndData === void 0 ? void 0 : toolEndData.output)) {
            console.warn('No output found in tool_end event');
            return;
        }
        (_a = this.callback) === null || _a === void 0 ? void 0 : _a.call(this, toolEndData, metadata);
    }
}
function processMemory({ res, userId, setMemory, deleteMemory, messages, memory, messageId, conversationId, validKeys, instructions, llmConfig, tokenLimit, totalTokens = 0, }) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const memoryTool = createMemoryTool({
                userId,
                tokenLimit,
                setMemory,
                validKeys,
                totalTokens,
            });
            const deleteMemoryTool = createDeleteMemoryTool({
                userId,
                validKeys,
                deleteMemory,
            });
            const currentMemoryTokens = totalTokens;
            let memoryStatus = `# Existing memory:\n${memory !== null && memory !== void 0 ? memory : 'No existing memories'}`;
            if (tokenLimit) {
                const remainingTokens = tokenLimit - currentMemoryTokens;
                memoryStatus = `# Memory Status:
Current memory usage: ${currentMemoryTokens} tokens
Token limit: ${tokenLimit} tokens
Remaining capacity: ${remainingTokens} tokens

# Existing memory:
${memory !== null && memory !== void 0 ? memory : 'No existing memories'}`;
            }
            const defaultLLMConfig = {
                provider: agents.Providers.OPENAI,
                model: 'gpt-4.1-mini',
                temperature: 0.4,
                streaming: false,
                disableStreaming: true,
            };
            const finalLLMConfig = Object.assign(Object.assign(Object.assign({}, defaultLLMConfig), llmConfig), { 
                /**
                 * Ensure streaming is always disabled for memory processing
                 */
                streaming: false, disableStreaming: true });
            // Handle GPT-5+ models
            if ('model' in finalLLMConfig && /\bgpt-[5-9]\b/i.test((_a = finalLLMConfig.model) !== null && _a !== void 0 ? _a : '')) {
                // Remove temperature for GPT-5+ models
                delete finalLLMConfig.temperature;
                // Move maxTokens to modelKwargs for GPT-5+ models
                if ('maxTokens' in finalLLMConfig && finalLLMConfig.maxTokens != null) {
                    const modelKwargs = (_b = finalLLMConfig.modelKwargs) !== null && _b !== void 0 ? _b : {};
                    const paramName = finalLLMConfig.useResponsesApi === true
                        ? 'max_output_tokens'
                        : 'max_completion_tokens';
                    modelKwargs[paramName] = finalLLMConfig.maxTokens;
                    delete finalLLMConfig.maxTokens;
                    finalLLMConfig.modelKwargs = modelKwargs;
                }
            }
            const artifactPromises = [];
            const memoryCallback = createMemoryCallback({ res, artifactPromises });
            const customHandlers = {
                [agents.GraphEvents.TOOL_END]: new BasicToolEndHandler(memoryCallback),
            };
            const run = yield agents.Run.create({
                runId: messageId,
                graphConfig: {
                    type: 'standard',
                    llmConfig: finalLLMConfig,
                    tools: [memoryTool, deleteMemoryTool],
                    instructions,
                    additional_instructions: memoryStatus,
                    toolEnd: true,
                },
                customHandlers,
                returnContent: true,
            });
            const config = {
                configurable: {
                    provider: llmConfig === null || llmConfig === void 0 ? void 0 : llmConfig.provider,
                    thread_id: `memory-run-${conversationId}`,
                },
                streamMode: 'values',
                recursionLimit: 3,
                version: 'v2',
            };
            const inputs = {
                messages,
            };
            const content = yield run.processStream(inputs, config);
            if (content) {
                dataSchemas.logger.debug('Memory Agent processed memory successfully', content);
            }
            else {
                dataSchemas.logger.warn('Memory Agent processed memory but returned no content');
            }
            return yield Promise.all(artifactPromises);
        }
        catch (error) {
            dataSchemas.logger.error('Memory Agent failed to process memory', error);
        }
    });
}
function createMemoryProcessor({ res, userId, messageId, memoryMethods, conversationId, config = {}, }) {
    return __awaiter(this, void 0, void 0, function* () {
        const { validKeys, instructions, llmConfig, tokenLimit } = config;
        const finalInstructions = instructions || getDefaultInstructions(validKeys, tokenLimit);
        const { withKeys, withoutKeys, totalTokens } = yield memoryMethods.getFormattedMemories({
            userId,
        });
        return [
            withoutKeys,
            function (messages) {
                return __awaiter(this, void 0, void 0, function* () {
                    try {
                        return yield processMemory({
                            res,
                            userId,
                            messages,
                            validKeys,
                            llmConfig,
                            messageId,
                            tokenLimit,
                            conversationId,
                            memory: withKeys,
                            totalTokens: totalTokens || 0,
                            instructions: finalInstructions,
                            setMemory: memoryMethods.setMemory,
                            deleteMemory: memoryMethods.deleteMemory,
                        });
                    }
                    catch (error) {
                        dataSchemas.logger.error('Memory Agent failed to process memory', error);
                    }
                });
            },
        ];
    });
}
function handleMemoryArtifact({ res, data, metadata, }) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const output = data === null || data === void 0 ? void 0 : data.output;
        if (!output) {
            return null;
        }
        if (!output.artifact) {
            return null;
        }
        const memoryArtifact = output.artifact[librechatDataProvider.Tools.memory];
        if (!memoryArtifact) {
            return null;
        }
        const attachment = {
            type: librechatDataProvider.Tools.memory,
            toolCallId: output.tool_call_id,
            messageId: (_a = metadata === null || metadata === void 0 ? void 0 : metadata.run_id) !== null && _a !== void 0 ? _a : '',
            conversationId: (_b = metadata === null || metadata === void 0 ? void 0 : metadata.thread_id) !== null && _b !== void 0 ? _b : '',
            [librechatDataProvider.Tools.memory]: memoryArtifact,
        };
        if (!res.headersSent) {
            return attachment;
        }
        res.write(`event: attachment\ndata: ${JSON.stringify(attachment)}\n\n`);
        return attachment;
    });
}
/**
 * Creates a memory callback for handling memory artifacts
 * @param params - The parameters object
 * @param params.res - The server response object
 * @param params.artifactPromises - Array to collect artifact promises
 * @returns The memory callback function
 */
function createMemoryCallback({ res, artifactPromises, }) {
    return (data, metadata) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        const output = data === null || data === void 0 ? void 0 : data.output;
        const memoryArtifact = (_a = output === null || output === void 0 ? void 0 : output.artifact) === null || _a === void 0 ? void 0 : _a[librechatDataProvider.Tools.memory];
        if (memoryArtifact == null) {
            return;
        }
        artifactPromises.push(handleMemoryArtifact({ res, data, metadata }).catch((error) => {
            dataSchemas.logger.error('Error processing memory artifact content:', error);
            return null;
        }));
    });
}

const { GLOBAL_PROJECT_NAME: GLOBAL_PROJECT_NAME$1 } = librechatDataProvider.Constants;
/**
 * Check if agents need to be migrated to the new permission system
 * This performs a dry-run check similar to the migration script
 */
function checkAgentPermissionsMigration({ methods, mongoose, AgentModel, }) {
    return __awaiter(this, void 0, void 0, function* () {
        dataSchemas.logger.debug('Checking if agent permissions migration is needed');
        try {
            const db = mongoose.connection.db;
            if (db) {
                yield ensureRequiredCollectionsExist(db);
            }
            // Verify required roles exist
            const ownerRole = yield methods.findRoleByIdentifier(librechatDataProvider.AccessRoleIds.AGENT_OWNER);
            const viewerRole = yield methods.findRoleByIdentifier(librechatDataProvider.AccessRoleIds.AGENT_VIEWER);
            const editorRole = yield methods.findRoleByIdentifier(librechatDataProvider.AccessRoleIds.AGENT_EDITOR);
            if (!ownerRole || !viewerRole || !editorRole) {
                dataSchemas.logger.warn('Required agent roles not found. Permission system may not be fully initialized.');
                return {
                    totalToMigrate: 0,
                    globalEditAccess: 0,
                    globalViewAccess: 0,
                    privateAgents: 0,
                };
            }
            // Get global project agent IDs
            const globalProject = yield methods.getProjectByName(GLOBAL_PROJECT_NAME$1, ['agentIds']);
            const globalAgentIds = new Set((globalProject === null || globalProject === void 0 ? void 0 : globalProject.agentIds) || []);
            // Find agents without ACL entries (no batching for efficiency on startup)
            const agentsToMigrate = yield AgentModel.aggregate([
                {
                    $lookup: {
                        from: 'aclentries',
                        localField: '_id',
                        foreignField: 'resourceId',
                        as: 'aclEntries',
                    },
                },
                {
                    $addFields: {
                        userAclEntries: {
                            $filter: {
                                input: '$aclEntries',
                                as: 'aclEntry',
                                cond: {
                                    $and: [
                                        { $eq: ['$$aclEntry.resourceType', librechatDataProvider.ResourceType.AGENT] },
                                        { $eq: ['$$aclEntry.principalType', librechatDataProvider.PrincipalType.USER] },
                                    ],
                                },
                            },
                        },
                    },
                },
                {
                    $match: {
                        author: { $exists: true, $ne: null },
                        userAclEntries: { $size: 0 },
                    },
                },
                {
                    $project: {
                        _id: 1,
                        id: 1,
                        name: 1,
                        author: 1,
                        isCollaborative: 1,
                    },
                },
            ]);
            const categories = {
                globalEditAccess: [],
                globalViewAccess: [],
                privateAgents: [],
            };
            agentsToMigrate.forEach((agent) => {
                const isGlobal = globalAgentIds.has(agent.id);
                const isCollab = agent.isCollaborative;
                if (isGlobal && isCollab) {
                    categories.globalEditAccess.push(agent);
                }
                else if (isGlobal && !isCollab) {
                    categories.globalViewAccess.push(agent);
                }
                else {
                    categories.privateAgents.push(agent);
                }
            });
            const result = {
                totalToMigrate: agentsToMigrate.length,
                globalEditAccess: categories.globalEditAccess.length,
                globalViewAccess: categories.globalViewAccess.length,
                privateAgents: categories.privateAgents.length,
            };
            // Add details for debugging
            if (agentsToMigrate.length > 0) {
                result.details = {
                    globalEditAccess: categories.globalEditAccess.map((a) => ({
                        name: a.name,
                        id: a.id,
                    })),
                    globalViewAccess: categories.globalViewAccess.map((a) => ({
                        name: a.name,
                        id: a.id,
                    })),
                    privateAgents: categories.privateAgents.map((a) => ({
                        name: a.name,
                        id: a.id,
                    })),
                };
            }
            dataSchemas.logger.debug('Agent migration check completed', {
                totalToMigrate: result.totalToMigrate,
                globalEditAccess: result.globalEditAccess,
                globalViewAccess: result.globalViewAccess,
                privateAgents: result.privateAgents,
            });
            return result;
        }
        catch (error) {
            dataSchemas.logger.error('Failed to check agent permissions migration', error);
            // Return zero counts on error to avoid blocking startup
            return {
                totalToMigrate: 0,
                globalEditAccess: 0,
                globalViewAccess: 0,
                privateAgents: 0,
            };
        }
    });
}
/**
 * Log migration warning to console if agents need migration
 */
function logAgentMigrationWarning(result) {
    if (result.totalToMigrate === 0) {
        return;
    }
    // Create a visible warning box
    const border = '='.repeat(80);
    const warning = [
        '',
        border,
        '                    IMPORTANT: AGENT PERMISSIONS MIGRATION REQUIRED',
        border,
        '',
        `  Total agents to migrate: ${result.totalToMigrate}`,
        `  - Global Edit Access: ${result.globalEditAccess} agents`,
        `  - Global View Access: ${result.globalViewAccess} agents`,
        `  - Private Agents: ${result.privateAgents} agents`,
        '',
        '  The new agent sharing system requires migrating existing agents.',
        '  Please run the following command to migrate your agents:',
        '',
        '    npm run migrate:agent-permissions',
        '',
        '  For a dry run (preview) of what will be migrated:',
        '',
        '    npm run migrate:agent-permissions:dry-run',
        '',
        '  This migration will:',
        '  1. Grant owner permissions to agent authors',
        '  2. Set appropriate public permissions based on global project status',
        '  3. Preserve existing collaborative settings',
        '',
        border,
        '',
    ];
    // Use console methods directly for visibility
    console.log('\n' + warning.join('\n') + '\n');
    // Also log with logger for consistency
    dataSchemas.logger.warn('Agent permissions migration required', {
        totalToMigrate: result.totalToMigrate,
        globalEditAccess: result.globalEditAccess,
        globalViewAccess: result.globalViewAccess,
        privateAgents: result.privateAgents,
    });
}

/**
 * Helper function to add a file to a specific tool resource category
 * Prevents duplicate files within the same resource category
 * @param params - Parameters object
 * @param params.file - The file to add to the resource
 * @param params.resourceType - The type of tool resource (e.g., execute_code, file_search, image_edit)
 * @param params.tool_resources - The agent's tool resources object to update
 * @param params.processedResourceFiles - Set tracking processed files per resource type
 */
const addFileToResource = ({ file, resourceType, tool_resources, processedResourceFiles, }) => {
    var _a, _b;
    if (!file.file_id) {
        return;
    }
    const resourceKey = `${resourceType}:${file.file_id}`;
    if (processedResourceFiles.has(resourceKey)) {
        return;
    }
    const resource = (_a = tool_resources[resourceType]) !== null && _a !== void 0 ? _a : {};
    if (!resource.files) {
        tool_resources[resourceType] = Object.assign(Object.assign({}, resource), { files: [] });
    }
    // Check if already exists in the files array
    const resourceFiles = (_b = tool_resources[resourceType]) === null || _b === void 0 ? void 0 : _b.files;
    const alreadyExists = resourceFiles === null || resourceFiles === void 0 ? void 0 : resourceFiles.some((f) => f.file_id === file.file_id);
    if (!alreadyExists) {
        resourceFiles === null || resourceFiles === void 0 ? void 0 : resourceFiles.push(file);
        processedResourceFiles.add(resourceKey);
    }
};
/**
 * Categorizes a file into the appropriate tool resource based on its properties
 * Files are categorized as:
 * - execute_code: Files with fileIdentifier metadata
 * - file_search: Files marked as embedded
 * - image_edit: Image files in the request file set with dimensions
 * @param params - Parameters object
 * @param params.file - The file to categorize
 * @param params.tool_resources - The agent's tool resources to update
 * @param params.requestFileSet - Set of file IDs from the current request
 * @param params.processedResourceFiles - Set tracking processed files per resource type
 */
const categorizeFileForToolResources = ({ file, tool_resources, requestFileSet, processedResourceFiles, }) => {
    var _a;
    if ((_a = file.metadata) === null || _a === void 0 ? void 0 : _a.fileIdentifier) {
        addFileToResource({
            file,
            resourceType: librechatDataProvider.EToolResources.execute_code,
            tool_resources,
            processedResourceFiles,
        });
        return;
    }
    if (file.embedded === true) {
        addFileToResource({
            file,
            resourceType: librechatDataProvider.EToolResources.file_search,
            tool_resources,
            processedResourceFiles,
        });
        return;
    }
    if (requestFileSet.has(file.file_id) &&
        file.type.startsWith('image') &&
        file.height &&
        file.width) {
        addFileToResource({
            file,
            resourceType: librechatDataProvider.EToolResources.image_edit,
            tool_resources,
            processedResourceFiles,
        });
    }
};
/**
 * Primes resources for agent execution by processing attachments and tool resources
 * This function:
 * 1. Fetches OCR files if OCR is enabled
 * 2. Processes attachment files
 * 3. Categorizes files into appropriate tool resources
 * 4. Prevents duplicate files across all sources
 *
 * @param params - Parameters object
 * @param params.req - Express request object
 * @param params.appConfig - Application configuration object
 * @param params.getFiles - Function to retrieve files from database
 * @param params.requestFileSet - Set of file IDs from the current request
 * @param params.attachments - Promise resolving to array of attachment files
 * @param params.tool_resources - Existing tool resources for the agent
 * @returns Promise resolving to processed attachments and updated tool resources
 */
const primeResources = ({ req, appConfig, getFiles, requestFileSet, attachments: _attachments, tool_resources: _tool_resources, agentId, }) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    try {
        /**
         * Array to collect all unique files that will be returned as attachments
         * Files are added from OCR results and attachment promises, with duplicates prevented
         */
        const attachments = [];
        /**
         * Set of file IDs already added to the attachments array
         * Used to prevent duplicate files from being added multiple times
         * Pre-populated with files from non-OCR tool_resources to prevent re-adding them
         */
        const attachmentFileIds = new Set();
        /**
         * Set tracking which files have been added to specific tool resource categories
         * Format: "resourceType:fileId" (e.g., "execute_code:file123")
         * Prevents the same file from being added multiple times to the same resource
         */
        const processedResourceFiles = new Set();
        /**
         * The agent's tool resources object that will be updated with categorized files
         * Initialized from input parameter or empty object if not provided
         */
        const tool_resources = _tool_resources !== null && _tool_resources !== void 0 ? _tool_resources : {};
        // Track existing files in tool_resources to prevent duplicates within resources
        for (const [resourceType, resource] of Object.entries(tool_resources)) {
            if ((resource === null || resource === void 0 ? void 0 : resource.files) && Array.isArray(resource.files)) {
                for (const file of resource.files) {
                    if (file === null || file === void 0 ? void 0 : file.file_id) {
                        processedResourceFiles.add(`${resourceType}:${file.file_id}`);
                        // Files from non-OCR resources should not be added to attachments from _attachments
                        if (resourceType !== librechatDataProvider.EToolResources.ocr) {
                            attachmentFileIds.add(file.file_id);
                        }
                    }
                }
            }
        }
        const isOCREnabled = ((_c = (_b = (_a = appConfig === null || appConfig === void 0 ? void 0 : appConfig.endpoints) === null || _a === void 0 ? void 0 : _a[librechatDataProvider.EModelEndpoint.agents]) === null || _b === void 0 ? void 0 : _b.capabilities) !== null && _c !== void 0 ? _c : []).includes(librechatDataProvider.AgentCapabilities.ocr);
        if (((_d = tool_resources[librechatDataProvider.EToolResources.ocr]) === null || _d === void 0 ? void 0 : _d.file_ids) && isOCREnabled) {
            const context = yield getFiles({
                file_id: { $in: tool_resources.ocr.file_ids },
            }, {}, {}, { userId: (_e = req.user) === null || _e === void 0 ? void 0 : _e.id, agentId });
            for (const file of context) {
                if (!(file === null || file === void 0 ? void 0 : file.file_id)) {
                    continue;
                }
                // Clear from attachmentFileIds if it was pre-added
                attachmentFileIds.delete(file.file_id);
                // Add to attachments
                attachments.push(file);
                attachmentFileIds.add(file.file_id);
                // Categorize for tool resources
                categorizeFileForToolResources({
                    file,
                    tool_resources,
                    requestFileSet,
                    processedResourceFiles,
                });
            }
        }
        if (!_attachments) {
            return { attachments: attachments.length > 0 ? attachments : undefined, tool_resources };
        }
        const files = yield _attachments;
        for (const file of files) {
            if (!file) {
                continue;
            }
            categorizeFileForToolResources({
                file,
                tool_resources,
                requestFileSet,
                processedResourceFiles,
            });
            if (file.file_id && attachmentFileIds.has(file.file_id)) {
                continue;
            }
            attachments.push(file);
            if (file.file_id) {
                attachmentFileIds.add(file.file_id);
            }
        }
        return { attachments: attachments.length > 0 ? attachments : [], tool_resources };
    }
    catch (error) {
        dataSchemas.logger.error('Error priming resources', error);
        // Safely try to get attachments without rethrowing
        let safeAttachments = [];
        if (_attachments) {
            try {
                const attachmentFiles = yield _attachments;
                safeAttachments = ((_f = attachmentFiles === null || attachmentFiles === void 0 ? void 0 : attachmentFiles.filter((file) => !!file)) !== null && _f !== void 0 ? _f : []);
            }
            catch (attachmentError) {
                // If attachments promise is also rejected, just use empty array
                dataSchemas.logger.error('Error resolving attachments in catch block', attachmentError);
                safeAttachments = [];
            }
        }
        return {
            attachments: safeAttachments,
            tool_resources: _tool_resources,
        };
    }
});

const customProviders = new Set([
    agents.Providers.XAI,
    agents.Providers.OLLAMA,
    agents.Providers.DEEPSEEK,
    agents.Providers.OPENROUTER,
]);
function getReasoningKey(provider, llmConfig, agentEndpoint) {
    var _a, _b;
    let reasoningKey = 'reasoning_content';
    if (provider === agents.Providers.GOOGLE) {
        reasoningKey = 'reasoning';
    }
    else if (((_b = (_a = llmConfig.configuration) === null || _a === void 0 ? void 0 : _a.baseURL) === null || _b === void 0 ? void 0 : _b.includes(librechatDataProvider.KnownEndpoints.openrouter)) ||
        (agentEndpoint && agentEndpoint.toLowerCase().includes(librechatDataProvider.KnownEndpoints.openrouter))) {
        reasoningKey = 'reasoning';
    }
    else if (llmConfig.useResponsesApi === true &&
        (provider === agents.Providers.OPENAI || provider === agents.Providers.AZURE)) {
        reasoningKey = 'reasoning';
    }
    return reasoningKey;
}
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
function createRun({ runId, agent, signal, customHandlers, streaming = true, streamUsage = true, }) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const provider = (_a = librechatDataProvider.providerEndpointMap[agent.provider]) !== null && _a !== void 0 ? _a : agent.provider;
        const llmConfig = Object.assign({
            provider,
            streaming,
            streamUsage,
        }, agent.model_parameters);
        /** Resolves issues with new OpenAI usage field */
        if (customProviders.has(agent.provider) ||
            (agent.provider === agents.Providers.OPENAI && agent.endpoint !== agent.provider)) {
            llmConfig.streamUsage = false;
            llmConfig.usage = true;
        }
        const reasoningKey = getReasoningKey(provider, llmConfig, agent.endpoint);
        const graphConfig = {
            signal,
            llmConfig,
            reasoningKey,
            tools: agent.tools,
            instructions: agent.instructions,
            additional_instructions: agent.additional_instructions,
            // toolEnd: agent.end_after_tools,
        };
        // TEMPORARY FOR TESTING
        if (agent.provider === agents.Providers.ANTHROPIC || agent.provider === agents.Providers.BEDROCK) {
            graphConfig.streamBuffer = 2000;
        }
        return agents.Run.create({
            runId,
            graphConfig,
            customHandlers,
        });
    });
}

/** Avatar schema shared between create and update */
const agentAvatarSchema = z.z.object({
    filepath: z.z.string(),
    source: z.z.string(),
});
/** Base resource schema for tool resources */
const agentBaseResourceSchema = z.z.object({
    file_ids: z.z.array(z.z.string()).optional(),
    files: z.z.array(z.z.any()).optional(), // Files are populated at runtime, not from user input
});
/** File resource schema extends base with vector_store_ids */
const agentFileResourceSchema = agentBaseResourceSchema.extend({
    vector_store_ids: z.z.array(z.z.string()).optional(),
});
/** Tool resources schema matching AgentToolResources interface */
const agentToolResourcesSchema = z.z
    .object({
    image_edit: agentBaseResourceSchema.optional(),
    execute_code: agentBaseResourceSchema.optional(),
    file_search: agentFileResourceSchema.optional(),
    ocr: agentBaseResourceSchema.optional(),
})
    .optional();
/** Support contact schema for agent */
const agentSupportContactSchema = z.z
    .object({
    name: z.z.string().optional(),
    email: z.z.union([z.z.literal(''), z.z.string().email()]).optional(),
})
    .optional();
/** Base agent schema with all common fields */
const agentBaseSchema = z.z.object({
    name: z.z.string().nullable().optional(),
    description: z.z.string().nullable().optional(),
    instructions: z.z.string().nullable().optional(),
    avatar: agentAvatarSchema.nullable().optional(),
    model_parameters: z.z.record(z.z.unknown()).optional(),
    tools: z.z.array(z.z.string()).optional(),
    agent_ids: z.z.array(z.z.string()).optional(),
    end_after_tools: z.z.boolean().optional(),
    hide_sequential_outputs: z.z.boolean().optional(),
    artifacts: z.z.string().optional(),
    recursion_limit: z.z.number().optional(),
    conversation_starters: z.z.array(z.z.string()).optional(),
    tool_resources: agentToolResourcesSchema,
    support_contact: agentSupportContactSchema,
    category: z.z.string().optional(),
});
/** Create schema extends base with required fields for creation */
const agentCreateSchema = agentBaseSchema.extend({
    provider: z.z.string(),
    model: z.z.string().nullable(),
    tools: z.z.array(z.z.string()).optional().default([]),
});
/** Update schema extends base with all fields optional and additional update-only fields */
const agentUpdateSchema = agentBaseSchema.extend({
    provider: z.z.string().optional(),
    model: z.z.string().nullable().optional(),
    projectIds: z.z.array(z.z.string()).optional(),
    removeProjectIds: z.z.array(z.z.string()).optional(),
    isCollaborative: z.z.boolean().optional(),
});
/**
 * Validates an agent's model against the available models configuration.
 * This is a non-middleware version of validateModel that can be used
 * in service initialization flows.
 *
 * @param params - Validation parameters
 * @returns Object indicating whether the model is valid and any error details
 */
function validateAgentModel(params) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const { req, res, agent, modelsConfig, logViolation } = params;
        const { model, provider: endpoint } = agent;
        if (!model) {
            return {
                isValid: false,
                error: {
                    message: `{ "type": "${librechatDataProvider.ErrorTypes.MISSING_MODEL}", "info": "${endpoint}" }`,
                },
            };
        }
        if (!modelsConfig) {
            return {
                isValid: false,
                error: {
                    message: `{ "type": "${librechatDataProvider.ErrorTypes.MODELS_NOT_LOADED}" }`,
                },
            };
        }
        const availableModels = modelsConfig[endpoint];
        if (!availableModels) {
            return {
                isValid: false,
                error: {
                    message: `{ "type": "${librechatDataProvider.ErrorTypes.ENDPOINT_MODELS_NOT_LOADED}", "info": "${endpoint}" }`,
                },
            };
        }
        const validModel = !!availableModels.find((availableModel) => availableModel === model);
        if (validModel) {
            return { isValid: true };
        }
        const { ILLEGAL_MODEL_REQ_SCORE: score = 1 } = (_a = process.env) !== null && _a !== void 0 ? _a : {};
        const type = librechatDataProvider.ViolationTypes.ILLEGAL_MODEL_REQUEST;
        const errorMessage = {
            type,
            model,
            endpoint,
        };
        yield logViolation(req, res, type, errorMessage, score);
        return {
            isValid: false,
            error: {
                message: `{ "type": "${librechatDataProvider.ViolationTypes.ILLEGAL_MODEL_REQUEST}", "info": "${endpoint}|${model}" }`,
            },
        };
    });
}

/**
 * Formats prompt groups for the paginated /groups endpoint response
 */
function formatPromptGroupsResponse({ promptGroups = [], pageNumber, pageSize, actualLimit, hasMore = false, after = null, }) {
    const currentPage = parseInt(pageNumber || '1');
    // Calculate total pages based on whether there are more results
    // If hasMore is true, we know there's at least one more page
    // We use a high number (9999) to indicate "many pages" since we don't know the exact count
    const totalPages = hasMore ? '9999' : currentPage.toString();
    return {
        promptGroups,
        pageNumber: pageNumber || '1',
        pageSize: pageSize || String(actualLimit) || '10',
        pages: totalPages,
        has_more: hasMore,
        after,
    };
}
/**
 * Creates an empty response for the paginated /groups endpoint
 */
function createEmptyPromptGroupsResponse({ pageNumber, pageSize, actualLimit, }) {
    return {
        promptGroups: [],
        pageNumber: pageNumber || '1',
        pageSize: pageSize || String(actualLimit) || '10',
        pages: '0',
        has_more: false,
        after: null,
    };
}
/**
 * Marks prompt groups as public based on the publicly accessible IDs
 */
function markPublicPromptGroups(promptGroups, publiclyAccessibleIds) {
    if (!promptGroups.length) {
        return [];
    }
    return promptGroups.map((group) => {
        const isPublic = publiclyAccessibleIds.some((id) => { var _a; return id.equals((_a = group._id) === null || _a === void 0 ? void 0 : _a.toString()); });
        return isPublic ? Object.assign(Object.assign({}, group), { isPublic: true }) : group;
    });
}
/**
 * Builds filter object for prompt group queries
 */
function buildPromptGroupFilter(_a) {
    var { name, category } = _a, otherFilters = __rest(_a, ["name", "category"]);
    const filter = Object.assign({}, otherFilters);
    let searchShared = true;
    let searchSharedOnly = false;
    // Handle name filter - convert to regex for case-insensitive search
    if (name) {
        const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.name = new RegExp(escapeRegExp(name), 'i');
    }
    // Handle category filters with special system categories
    if (category === librechatDataProvider.SystemCategories.MY_PROMPTS) {
        searchShared = false;
    }
    else if (category === librechatDataProvider.SystemCategories.NO_CATEGORY) {
        filter.category = '';
    }
    else if (category === librechatDataProvider.SystemCategories.SHARED_PROMPTS) {
        searchSharedOnly = true;
    }
    else if (category) {
        filter.category = category;
    }
    return { filter, searchShared, searchSharedOnly };
}
/**
 * Filters accessible IDs based on shared/public prompts logic
 */
function filterAccessibleIdsBySharedLogic({ accessibleIds, searchShared, searchSharedOnly, publicPromptGroupIds, }) {
    return __awaiter(this, void 0, void 0, function* () {
        const publicIdStrings = new Set((publicPromptGroupIds || []).map((id) => id.toString()));
        if (!searchShared) {
            // For MY_PROMPTS - exclude public prompts to show only user's own prompts
            return accessibleIds.filter((id) => !publicIdStrings.has(id.toString()));
        }
        if (searchSharedOnly) {
            // Handle SHARED_PROMPTS filter - only return public prompts that user has access to
            if (!(publicPromptGroupIds === null || publicPromptGroupIds === void 0 ? void 0 : publicPromptGroupIds.length)) {
                return [];
            }
            const accessibleIdStrings = new Set(accessibleIds.map((id) => id.toString()));
            return publicPromptGroupIds.filter((id) => accessibleIdStrings.has(id.toString()));
        }
        return [...accessibleIds, ...(publicPromptGroupIds || [])];
    });
}

const { GLOBAL_PROJECT_NAME } = librechatDataProvider.Constants;
/**
 * Check if prompt groups need to be migrated to the new permission system
 * This performs a dry-run check similar to the migration script
 */
function checkPromptPermissionsMigration({ methods, mongoose, PromptGroupModel, }) {
    return __awaiter(this, void 0, void 0, function* () {
        dataSchemas.logger.debug('Checking if prompt permissions migration is needed');
        try {
            /** Native MongoDB database instance */
            const db = mongoose.connection.db;
            if (db) {
                yield ensureRequiredCollectionsExist(db);
            }
            // Verify required roles exist
            const ownerRole = yield methods.findRoleByIdentifier(librechatDataProvider.AccessRoleIds.PROMPTGROUP_OWNER);
            const viewerRole = yield methods.findRoleByIdentifier(librechatDataProvider.AccessRoleIds.PROMPTGROUP_VIEWER);
            const editorRole = yield methods.findRoleByIdentifier(librechatDataProvider.AccessRoleIds.PROMPTGROUP_EDITOR);
            if (!ownerRole || !viewerRole || !editorRole) {
                dataSchemas.logger.warn('Required promptGroup roles not found. Permission system may not be fully initialized.');
                return {
                    totalToMigrate: 0,
                    globalViewAccess: 0,
                    privateGroups: 0,
                };
            }
            /** Global project prompt group IDs */
            const globalProject = yield methods.getProjectByName(GLOBAL_PROJECT_NAME, ['promptGroupIds']);
            const globalPromptGroupIds = new Set(((globalProject === null || globalProject === void 0 ? void 0 : globalProject.promptGroupIds) || []).map((id) => id.toString()));
            // Find promptGroups without ACL entries (no batching for efficiency on startup)
            const promptGroupsToMigrate = yield PromptGroupModel.aggregate([
                {
                    $lookup: {
                        from: 'aclentries',
                        localField: '_id',
                        foreignField: 'resourceId',
                        as: 'aclEntries',
                    },
                },
                {
                    $addFields: {
                        promptGroupAclEntries: {
                            $filter: {
                                input: '$aclEntries',
                                as: 'aclEntry',
                                cond: {
                                    $and: [
                                        { $eq: ['$$aclEntry.resourceType', librechatDataProvider.ResourceType.PROMPTGROUP] },
                                        { $eq: ['$$aclEntry.principalType', librechatDataProvider.PrincipalType.USER] },
                                    ],
                                },
                            },
                        },
                    },
                },
                {
                    $match: {
                        author: { $exists: true, $ne: null },
                        promptGroupAclEntries: { $size: 0 },
                    },
                },
                {
                    $project: {
                        _id: 1,
                        name: 1,
                        author: 1,
                        authorName: 1,
                        category: 1,
                    },
                },
            ]);
            const categories = {
                globalViewAccess: [],
                privateGroups: [],
            };
            promptGroupsToMigrate.forEach((group) => {
                const isGlobalGroup = globalPromptGroupIds.has(group._id.toString());
                if (isGlobalGroup) {
                    categories.globalViewAccess.push(group);
                }
                else {
                    categories.privateGroups.push(group);
                }
            });
            const result = {
                totalToMigrate: promptGroupsToMigrate.length,
                globalViewAccess: categories.globalViewAccess.length,
                privateGroups: categories.privateGroups.length,
            };
            // Add details for debugging
            if (promptGroupsToMigrate.length > 0) {
                result.details = {
                    globalViewAccess: categories.globalViewAccess.map((g) => ({
                        name: g.name,
                        _id: g._id.toString(),
                        category: g.category || 'uncategorized',
                    })),
                    privateGroups: categories.privateGroups.map((g) => ({
                        name: g.name,
                        _id: g._id.toString(),
                        category: g.category || 'uncategorized',
                    })),
                };
            }
            dataSchemas.logger.debug('Prompt migration check completed', {
                totalToMigrate: result.totalToMigrate,
                globalViewAccess: result.globalViewAccess,
                privateGroups: result.privateGroups,
            });
            return result;
        }
        catch (error) {
            dataSchemas.logger.error('Failed to check prompt permissions migration', error);
            // Return zero counts on error to avoid blocking startup
            return {
                totalToMigrate: 0,
                globalViewAccess: 0,
                privateGroups: 0,
            };
        }
    });
}
/**
 * Log migration warning to console if prompt groups need migration
 */
function logPromptMigrationWarning(result) {
    if (result.totalToMigrate === 0) {
        return;
    }
    // Create a visible warning box
    const border = '='.repeat(80);
    const warning = [
        '',
        border,
        '                   IMPORTANT: PROMPT PERMISSIONS MIGRATION REQUIRED',
        border,
        '',
        `  Total prompt groups to migrate: ${result.totalToMigrate}`,
        `  - Global View Access: ${result.globalViewAccess} prompt groups`,
        `  - Private Prompt Groups: ${result.privateGroups} prompt groups`,
        '',
        '  The new prompt sharing system requires migrating existing prompt groups.',
        '  Please run the following command to migrate your prompts:',
        '',
        '    npm run migrate:prompt-permissions',
        '',
        '  For a dry run (preview) of what will be migrated:',
        '',
        '    npm run migrate:prompt-permissions:dry-run',
        '',
        '  This migration will:',
        '  1. Grant owner permissions to prompt authors',
        '  2. Set public view permissions for prompts in the global project',
        '  3. Keep private prompts accessible only to their authors',
        '',
        border,
        '',
    ];
    // Use console methods directly for visibility
    console.log('\n' + warning.join('\n') + '\n');
    // Also log with logger for consistency
    dataSchemas.logger.warn('Prompt permissions migration required', {
        totalToMigrate: result.totalToMigrate,
        globalViewAccess: result.globalViewAccess,
        privateGroups: result.privateGroups,
    });
}

/**
 * Load config endpoints from the cached configuration object
 * @param customEndpointsConfig - The configuration object
 */
function loadCustomEndpointsConfig(customEndpoints) {
    if (!customEndpoints) {
        return;
    }
    const customEndpointsConfig = {};
    if (Array.isArray(customEndpoints)) {
        const filteredEndpoints = customEndpoints.filter((endpoint) => endpoint.baseURL &&
            endpoint.apiKey &&
            endpoint.name &&
            endpoint.models &&
            (endpoint.models.fetch || endpoint.models.default));
        for (let i = 0; i < filteredEndpoints.length; i++) {
            const endpoint = filteredEndpoints[i];
            const { baseURL, apiKey, name: configName, iconURL, modelDisplayLabel, customParams, } = endpoint;
            const name = normalizeEndpointName(configName);
            const resolvedApiKey = librechatDataProvider.extractEnvVariable(apiKey !== null && apiKey !== void 0 ? apiKey : '');
            const resolvedBaseURL = librechatDataProvider.extractEnvVariable(baseURL !== null && baseURL !== void 0 ? baseURL : '');
            customEndpointsConfig[name] = {
                type: librechatDataProvider.EModelEndpoint.custom,
                userProvide: isUserProvided(resolvedApiKey),
                userProvideURL: isUserProvided(resolvedBaseURL),
                customParams: customParams,
                modelDisplayLabel,
                iconURL,
            };
        }
    }
    return customEndpointsConfig;
}

function getThresholdMapping(model) {
    const gemini1Pattern = /gemini-(1\.0|1\.5|pro$|1\.0-pro|1\.5-pro|1\.5-flash-001)/;
    const restrictedPattern = /(gemini-(1\.5-flash-8b|2\.0|exp)|learnlm)/;
    if (gemini1Pattern.test(model)) {
        return (value) => {
            if (value === 'OFF') {
                return 'BLOCK_NONE';
            }
            return value;
        };
    }
    if (restrictedPattern.test(model)) {
        return (value) => {
            if (value === 'OFF' || value === 'HARM_BLOCK_THRESHOLD_UNSPECIFIED') {
                return 'BLOCK_NONE';
            }
            return value;
        };
    }
    return (value) => value;
}
function getSafetySettings(model) {
    if (isEnabled(process.env.GOOGLE_EXCLUDE_SAFETY_SETTINGS)) {
        return undefined;
    }
    const mapThreshold = getThresholdMapping(model !== null && model !== void 0 ? model : '');
    return [
        {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: mapThreshold(process.env.GOOGLE_SAFETY_SEXUALLY_EXPLICIT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED'),
        },
        {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: mapThreshold(process.env.GOOGLE_SAFETY_HATE_SPEECH || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED'),
        },
        {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: mapThreshold(process.env.GOOGLE_SAFETY_HARASSMENT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED'),
        },
        {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: mapThreshold(process.env.GOOGLE_SAFETY_DANGEROUS_CONTENT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED'),
        },
        {
            category: 'HARM_CATEGORY_CIVIC_INTEGRITY',
            threshold: mapThreshold(process.env.GOOGLE_SAFETY_CIVIC_INTEGRITY || 'BLOCK_NONE'),
        },
    ];
}
/**
 * Replicates core logic from GoogleClient's constructor and setOptions, plus client determination.
 * Returns an object with the provider label and the final options that would be passed to createLLM.
 *
 * @param credentials - Either a JSON string or an object containing Google keys
 * @param options - The same shape as the "GoogleClient" constructor options
 */
function getGoogleConfig(credentials, options = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    let creds = {};
    if (typeof credentials === 'string') {
        try {
            creds = JSON.parse(credentials);
        }
        catch (err) {
            throw new Error(`Error parsing string credentials: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }
    else if (credentials && typeof credentials === 'object') {
        creds = credentials;
    }
    const serviceKeyRaw = (_a = creds[librechatDataProvider.AuthKeys.GOOGLE_SERVICE_KEY]) !== null && _a !== void 0 ? _a : {};
    const serviceKey = typeof serviceKeyRaw === 'string' ? JSON.parse(serviceKeyRaw) : (serviceKeyRaw !== null && serviceKeyRaw !== void 0 ? serviceKeyRaw : {});
    const apiKey = (_b = creds[librechatDataProvider.AuthKeys.GOOGLE_API_KEY]) !== null && _b !== void 0 ? _b : null;
    const project_id = !apiKey ? ((_c = serviceKey === null || serviceKey === void 0 ? void 0 : serviceKey.project_id) !== null && _c !== void 0 ? _c : null) : null;
    const reverseProxyUrl = options.reverseProxyUrl;
    const authHeader = options.authHeader;
    const _j = options.modelOptions || {}, { web_search, thinking = librechatDataProvider.googleSettings.thinking.default, thinkingBudget = librechatDataProvider.googleSettings.thinkingBudget.default } = _j, modelOptions = __rest(_j, ["web_search", "thinking", "thinkingBudget"]);
    const llmConfig = librechatDataProvider.removeNullishValues(Object.assign(Object.assign({}, (modelOptions || {})), { model: (_d = modelOptions === null || modelOptions === void 0 ? void 0 : modelOptions.model) !== null && _d !== void 0 ? _d : '', maxRetries: 2, topP: (_e = modelOptions === null || modelOptions === void 0 ? void 0 : modelOptions.topP) !== null && _e !== void 0 ? _e : undefined, topK: (_f = modelOptions === null || modelOptions === void 0 ? void 0 : modelOptions.topK) !== null && _f !== void 0 ? _f : undefined, temperature: (_g = modelOptions === null || modelOptions === void 0 ? void 0 : modelOptions.temperature) !== null && _g !== void 0 ? _g : undefined, maxOutputTokens: (_h = modelOptions === null || modelOptions === void 0 ? void 0 : modelOptions.maxOutputTokens) !== null && _h !== void 0 ? _h : undefined }));
    /** Used only for Safety Settings */
    llmConfig.safetySettings = getSafetySettings(llmConfig.model);
    let provider;
    if (project_id) {
        provider = agents.Providers.VERTEXAI;
    }
    else {
        provider = agents.Providers.GOOGLE;
    }
    // If we have a GCP project => Vertex AI
    if (provider === agents.Providers.VERTEXAI) {
        llmConfig.authOptions = {
            credentials: Object.assign({}, serviceKey),
            projectId: project_id,
        };
        llmConfig.location = process.env.GOOGLE_LOC || 'us-central1';
    }
    else if (apiKey && provider === agents.Providers.GOOGLE) {
        llmConfig.apiKey = apiKey;
    }
    else {
        throw new Error(`Invalid credentials provided. Please provide either a valid API key or service account credentials for Google Cloud.`);
    }
    const shouldEnableThinking = thinking && thinkingBudget != null && (thinkingBudget > 0 || thinkingBudget === -1);
    if (shouldEnableThinking && provider === agents.Providers.GOOGLE) {
        llmConfig.thinkingConfig = {
            thinkingBudget: thinking ? thinkingBudget : librechatDataProvider.googleSettings.thinkingBudget.default,
            includeThoughts: Boolean(thinking),
        };
    }
    else if (shouldEnableThinking && provider === agents.Providers.VERTEXAI) {
        llmConfig.thinkingBudget = thinking
            ? thinkingBudget
            : librechatDataProvider.googleSettings.thinkingBudget.default;
        llmConfig.includeThoughts = Boolean(thinking);
    }
    /*
    let legacyOptions = {};
    // Filter out any "examples" that are empty
    legacyOptions.examples = (legacyOptions.examples ?? [])
      .filter(Boolean)
      .filter((obj) => obj?.input?.content !== '' && obj?.output?.content !== '');
  
    // If user has "examples" from legacyOptions, push them onto llmConfig
    if (legacyOptions.examples?.length) {
      llmConfig.examples = legacyOptions.examples.map((ex) => {
        const { input, output } = ex;
        if (!input?.content || !output?.content) {return undefined;}
        return {
          input: new HumanMessage(input.content),
          output: new AIMessage(output.content),
        };
      }).filter(Boolean);
    }
    */
    if (reverseProxyUrl) {
        llmConfig.baseUrl = reverseProxyUrl;
    }
    if (authHeader) {
        llmConfig.customHeaders = {
            Authorization: `Bearer ${apiKey}`,
        };
    }
    const tools = [];
    if (web_search) {
        tools.push({ googleSearch: {} });
    }
    // Return the final shape
    return {
        /** @type {GoogleAIToolType[]} */
        tools,
        /** @type {Providers.GOOGLE | Providers.VERTEXAI} */
        provider,
        /** @type {GoogleClientOptions | VertexAIClientOptions} */
        llmConfig,
    };
}

const knownOpenAIParams = new Set([
    // Constructor/Instance Parameters
    'model',
    'modelName',
    'temperature',
    'topP',
    'frequencyPenalty',
    'presencePenalty',
    'n',
    'logitBias',
    'stop',
    'stopSequences',
    'user',
    'timeout',
    'stream',
    'maxTokens',
    'maxCompletionTokens',
    'logprobs',
    'topLogprobs',
    'apiKey',
    'organization',
    'audio',
    'modalities',
    'reasoning',
    'zdrEnabled',
    'service_tier',
    'supportsStrictToolCalling',
    'useResponsesApi',
    'configuration',
    // Call-time Options
    'tools',
    'tool_choice',
    'functions',
    'function_call',
    'response_format',
    'seed',
    'stream_options',
    'parallel_tool_calls',
    'strict',
    'prediction',
    'promptIndex',
    // Responses API specific
    'text',
    'truncation',
    'include',
    'previous_response_id',
    // LangChain specific
    '__includeRawResponse',
    'maxConcurrency',
    'maxRetries',
    'verbose',
    'streaming',
    'streamUsage',
    'disableStreaming',
]);
function hasReasoningParams({ reasoning_effort, reasoning_summary, }) {
    return ((reasoning_effort != null && reasoning_effort !== '') ||
        (reasoning_summary != null && reasoning_summary !== ''));
}
function getOpenAILLMConfig({ azure, apiKey, baseURL, streaming, addParams, dropParams, useOpenRouter, modelOptions: _modelOptions, }) {
    var _a;
    const { reasoning_effort, reasoning_summary, verbosity, web_search, frequency_penalty, presence_penalty } = _modelOptions, modelOptions = __rest(_modelOptions, ["reasoning_effort", "reasoning_summary", "verbosity", "web_search", "frequency_penalty", "presence_penalty"]);
    const llmConfig = Object.assign({
        streaming,
        model: (_a = modelOptions.model) !== null && _a !== void 0 ? _a : '',
    }, modelOptions);
    if (frequency_penalty != null) {
        llmConfig.frequencyPenalty = frequency_penalty;
    }
    if (presence_penalty != null) {
        llmConfig.presencePenalty = presence_penalty;
    }
    const modelKwargs = {};
    let hasModelKwargs = false;
    if (verbosity != null && verbosity !== '') {
        modelKwargs.verbosity = verbosity;
        hasModelKwargs = true;
    }
    if (addParams && typeof addParams === 'object') {
        for (const [key, value] of Object.entries(addParams)) {
            if (knownOpenAIParams.has(key)) {
                llmConfig[key] = value;
            }
            else {
                hasModelKwargs = true;
                modelKwargs[key] = value;
            }
        }
    }
    if (useOpenRouter) {
        llmConfig.include_reasoning = true;
    }
    if (hasReasoningParams({ reasoning_effort, reasoning_summary }) &&
        (llmConfig.useResponsesApi === true || useOpenRouter)) {
        llmConfig.reasoning = librechatDataProvider.removeNullishValues({
            effort: reasoning_effort,
            summary: reasoning_summary,
        }, true);
    }
    else if (hasReasoningParams({ reasoning_effort })) {
        llmConfig.reasoning_effort = reasoning_effort;
    }
    if (llmConfig.max_tokens != null) {
        llmConfig.maxTokens = llmConfig.max_tokens;
        delete llmConfig.max_tokens;
    }
    const tools = [];
    if (web_search) {
        llmConfig.useResponsesApi = true;
        tools.push({ type: 'web_search_preview' });
    }
    /**
     * Note: OpenAI Web Search models do not support any known parameters besides `max_tokens`
     */
    if (modelOptions.model && /gpt-4o.*search/.test(modelOptions.model)) {
        const searchExcludeParams = [
            'frequency_penalty',
            'presence_penalty',
            'reasoning',
            'reasoning_effort',
            'temperature',
            'top_p',
            'top_k',
            'stop',
            'logit_bias',
            'seed',
            'response_format',
            'n',
            'logprobs',
            'user',
        ];
        const updatedDropParams = dropParams || [];
        const combinedDropParams = [...new Set([...updatedDropParams, ...searchExcludeParams])];
        combinedDropParams.forEach((param) => {
            if (param in llmConfig) {
                delete llmConfig[param];
            }
        });
    }
    else if (dropParams && Array.isArray(dropParams)) {
        dropParams.forEach((param) => {
            if (param in llmConfig) {
                delete llmConfig[param];
            }
        });
    }
    if (modelKwargs.verbosity && llmConfig.useResponsesApi === true) {
        modelKwargs.text = { verbosity: modelKwargs.verbosity };
        delete modelKwargs.verbosity;
    }
    if (llmConfig.model && /\bgpt-[5-9]\b/i.test(llmConfig.model) && llmConfig.maxTokens != null) {
        const paramName = llmConfig.useResponsesApi === true ? 'max_output_tokens' : 'max_completion_tokens';
        modelKwargs[paramName] = llmConfig.maxTokens;
        delete llmConfig.maxTokens;
        hasModelKwargs = true;
    }
    if (hasModelKwargs) {
        llmConfig.modelKwargs = modelKwargs;
    }
    if (!azure) {
        llmConfig.apiKey = apiKey;
        return { llmConfig, tools };
    }
    const useModelName = isEnabled(process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME);
    const updatedAzure = Object.assign({}, azure);
    updatedAzure.azureOpenAIApiDeploymentName = useModelName
        ? sanitizeModelName(llmConfig.model || '')
        : azure.azureOpenAIApiDeploymentName;
    if (process.env.AZURE_OPENAI_DEFAULT_MODEL) {
        llmConfig.model = process.env.AZURE_OPENAI_DEFAULT_MODEL;
    }
    const constructAzureOpenAIBasePath = () => {
        if (!baseURL) {
            return;
        }
        const azureURL = constructAzureURL({
            baseURL,
            azureOptions: updatedAzure,
        });
        updatedAzure.azureOpenAIBasePath = azureURL.split(`/${updatedAzure.azureOpenAIApiDeploymentName}`)[0];
    };
    constructAzureOpenAIBasePath();
    Object.assign(llmConfig, updatedAzure);
    const constructAzureResponsesApi = () => {
        if (!llmConfig.useResponsesApi) {
            return;
        }
        delete llmConfig.azureOpenAIApiDeploymentName;
        delete llmConfig.azureOpenAIApiInstanceName;
        delete llmConfig.azureOpenAIApiVersion;
        delete llmConfig.azureOpenAIBasePath;
        delete llmConfig.azureOpenAIApiKey;
        llmConfig.apiKey = apiKey;
    };
    constructAzureResponsesApi();
    llmConfig.model = updatedAzure.azureOpenAIApiDeploymentName;
    return { llmConfig, tools, azure: updatedAzure };
}

/**
 * @param {string} modelName
 * @returns {boolean}
 */
function checkPromptCacheSupport(modelName) {
    var _a;
    const modelMatch = (_a = matchModelName(modelName, librechatDataProvider.EModelEndpoint.anthropic)) !== null && _a !== void 0 ? _a : '';
    if (modelMatch.includes('claude-3-5-sonnet-latest') ||
        modelMatch.includes('claude-3.5-sonnet-latest')) {
        return false;
    }
    return (/claude-3[-.]7/.test(modelMatch) ||
        /claude-3[-.]5-(?:sonnet|haiku)/.test(modelMatch) ||
        /claude-3-(?:sonnet|haiku|opus)?/.test(modelMatch) ||
        /claude-(?:sonnet|opus|haiku)-[4-9]/.test(modelMatch) ||
        /claude-[4-9]-(?:sonnet|opus|haiku)?/.test(modelMatch) ||
        /claude-4(?:-(?:sonnet|opus|haiku))?/.test(modelMatch));
}
/**
 * Gets the appropriate headers for Claude models with cache control
 * @param {string} model The model name
 * @param {boolean} supportsCacheControl Whether the model supports cache control
 * @returns {AnthropicClientOptions['extendedOptions']['defaultHeaders']|undefined} The headers object or undefined if not applicable
 */
function getClaudeHeaders(model, supportsCacheControl) {
    if (!supportsCacheControl) {
        return undefined;
    }
    if (/claude-3[-.]5-sonnet/.test(model)) {
        return {
            'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15,prompt-caching-2024-07-31',
        };
    }
    else if (/claude-3[-.]7/.test(model)) {
        return {
            'anthropic-beta': 'token-efficient-tools-2025-02-19,output-128k-2025-02-19,prompt-caching-2024-07-31',
        };
    }
    else if (/claude-sonnet-4/.test(model)) {
        return {
            'anthropic-beta': 'prompt-caching-2024-07-31,context-1m-2025-08-07',
        };
    }
    else if (/claude-(?:sonnet|opus|haiku)-[4-9]/.test(model) ||
        /claude-[4-9]-(?:sonnet|opus|haiku)?/.test(model) ||
        /claude-4(?:-(?:sonnet|opus|haiku))?/.test(model)) {
        return {
            'anthropic-beta': 'prompt-caching-2024-07-31',
        };
    }
    else {
        return {
            'anthropic-beta': 'prompt-caching-2024-07-31',
        };
    }
}
/**
 * Configures reasoning-related options for Claude models
 * @param {AnthropicClientOptions & { max_tokens?: number }} anthropicInput The request options object
 * @param {Object} extendedOptions Additional client configuration options
 * @param {boolean} extendedOptions.thinking Whether thinking is enabled in client config
 * @param {number|null} extendedOptions.thinkingBudget The token budget for thinking
 * @returns {Object} Updated request options
 */
function configureReasoning(anthropicInput, extendedOptions = {}) {
    var _a, _b;
    const updatedOptions = Object.assign({}, anthropicInput);
    const currentMaxTokens = (_a = updatedOptions.max_tokens) !== null && _a !== void 0 ? _a : updatedOptions.maxTokens;
    if (extendedOptions.thinking &&
        (updatedOptions === null || updatedOptions === void 0 ? void 0 : updatedOptions.model) &&
        (/claude-3[-.]7/.test(updatedOptions.model) ||
            /claude-(?:sonnet|opus|haiku)-[4-9]/.test(updatedOptions.model))) {
        updatedOptions.thinking = Object.assign(Object.assign({}, updatedOptions.thinking), { type: 'enabled' });
    }
    if (updatedOptions.thinking != null &&
        extendedOptions.thinkingBudget != null &&
        updatedOptions.thinking.type === 'enabled') {
        updatedOptions.thinking = Object.assign(Object.assign({}, updatedOptions.thinking), { budget_tokens: extendedOptions.thinkingBudget });
    }
    if (updatedOptions.thinking != null &&
        updatedOptions.thinking.type === 'enabled' &&
        (currentMaxTokens == null || updatedOptions.thinking.budget_tokens > currentMaxTokens)) {
        const maxTokens = librechatDataProvider.anthropicSettings.maxOutputTokens.reset((_b = updatedOptions.model) !== null && _b !== void 0 ? _b : '');
        updatedOptions.max_tokens = currentMaxTokens !== null && currentMaxTokens !== void 0 ? currentMaxTokens : maxTokens;
        dataSchemas.logger.warn(updatedOptions.max_tokens === maxTokens
            ? '[AnthropicClient] max_tokens is not defined while thinking is enabled. Setting max_tokens to model default.'
            : `[AnthropicClient] thinking budget_tokens (${updatedOptions.thinking.budget_tokens}) exceeds max_tokens (${updatedOptions.max_tokens}). Adjusting budget_tokens.`);
        updatedOptions.thinking.budget_tokens = Math.min(updatedOptions.thinking.budget_tokens, Math.floor(updatedOptions.max_tokens * 0.9));
    }
    return updatedOptions;
}

/**
 * Generates configuration options for creating an Anthropic language model (LLM) instance.
 * @param apiKey - The API key for authentication with Anthropic.
 * @param options={} - Additional options for configuring the LLM.
 * @returns Configuration options for creating an Anthropic LLM instance, with null and undefined values removed.
 */
function getLLMConfig(apiKey, options = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const systemOptions = {
        thinking: (_b = (_a = options.modelOptions) === null || _a === void 0 ? void 0 : _a.thinking) !== null && _b !== void 0 ? _b : librechatDataProvider.anthropicSettings.thinking.default,
        promptCache: (_d = (_c = options.modelOptions) === null || _c === void 0 ? void 0 : _c.promptCache) !== null && _d !== void 0 ? _d : librechatDataProvider.anthropicSettings.promptCache.default,
        thinkingBudget: (_f = (_e = options.modelOptions) === null || _e === void 0 ? void 0 : _e.thinkingBudget) !== null && _f !== void 0 ? _f : librechatDataProvider.anthropicSettings.thinkingBudget.default,
    };
    /** Couldn't figure out a way to still loop through the object while deleting the overlapping keys when porting this
     * over from javascript, so for now they are being deleted manually until a better way presents itself.
     */
    if (options.modelOptions) {
        delete options.modelOptions.thinking;
        delete options.modelOptions.promptCache;
        delete options.modelOptions.thinkingBudget;
    }
    else {
        throw new Error('No modelOptions provided');
    }
    const defaultOptions = {
        model: librechatDataProvider.anthropicSettings.model.default,
        maxOutputTokens: librechatDataProvider.anthropicSettings.maxOutputTokens.default,
        stream: true,
    };
    const mergedOptions = Object.assign(defaultOptions, options.modelOptions);
    let requestOptions = {
        apiKey,
        model: mergedOptions.model,
        stream: mergedOptions.stream,
        temperature: mergedOptions.temperature,
        stopSequences: mergedOptions.stop,
        maxTokens: mergedOptions.maxOutputTokens || librechatDataProvider.anthropicSettings.maxOutputTokens.reset(mergedOptions.model),
        clientOptions: {},
        invocationKwargs: {
            metadata: {
                user_id: mergedOptions.user,
            },
        },
    };
    requestOptions = configureReasoning(requestOptions, systemOptions);
    if (!/claude-3[-.]7/.test(mergedOptions.model)) {
        requestOptions.topP = mergedOptions.topP;
        requestOptions.topK = mergedOptions.topK;
    }
    else if (requestOptions.thinking == null) {
        requestOptions.topP = mergedOptions.topP;
        requestOptions.topK = mergedOptions.topK;
    }
    const supportsCacheControl = systemOptions.promptCache === true && checkPromptCacheSupport((_g = requestOptions.model) !== null && _g !== void 0 ? _g : '');
    const headers = getClaudeHeaders((_h = requestOptions.model) !== null && _h !== void 0 ? _h : '', supportsCacheControl);
    if (headers && requestOptions.clientOptions) {
        requestOptions.clientOptions.defaultHeaders = headers;
    }
    if (options.proxy && requestOptions.clientOptions) {
        const proxyAgent = new undici.ProxyAgent(options.proxy);
        requestOptions.clientOptions.fetchOptions = {
            dispatcher: proxyAgent,
        };
    }
    if (options.reverseProxyUrl && requestOptions.clientOptions) {
        requestOptions.clientOptions.baseURL = options.reverseProxyUrl;
        requestOptions.anthropicApiUrl = options.reverseProxyUrl;
    }
    const tools = [];
    if (mergedOptions.web_search) {
        tools.push({
            type: 'web_search_20250305',
            name: 'web_search',
        });
    }
    return {
        tools,
        llmConfig: librechatDataProvider.removeNullishValues(requestOptions),
    };
}

const anthropicExcludeParams = new Set(['anthropicApiUrl']);
/**
 * Transforms a Non-OpenAI LLM config to an OpenAI-conformant config.
 * Non-OpenAI parameters are moved to modelKwargs.
 * Also extracts configuration options that belong in configOptions.
 * Handles addParams and dropParams for parameter customization.
 */
function transformToOpenAIConfig({ addParams, dropParams, llmConfig, fromEndpoint, }) {
    const openAIConfig = {};
    let configOptions = {};
    let modelKwargs = {};
    let hasModelKwargs = false;
    const isAnthropic = fromEndpoint === librechatDataProvider.EModelEndpoint.anthropic;
    const excludeParams = isAnthropic ? anthropicExcludeParams : new Set();
    for (const [key, value] of Object.entries(llmConfig)) {
        if (value === undefined || value === null) {
            continue;
        }
        if (excludeParams.has(key)) {
            continue;
        }
        if (isAnthropic && key === 'clientOptions') {
            configOptions = Object.assign({}, configOptions, value);
            continue;
        }
        else if (isAnthropic && key === 'invocationKwargs') {
            modelKwargs = Object.assign({}, modelKwargs, value);
            hasModelKwargs = true;
            continue;
        }
        if (knownOpenAIParams.has(key)) {
            openAIConfig[key] = value;
        }
        else {
            modelKwargs[key] = value;
            hasModelKwargs = true;
        }
    }
    if (addParams && typeof addParams === 'object') {
        for (const [key, value] of Object.entries(addParams)) {
            if (knownOpenAIParams.has(key)) {
                openAIConfig[key] = value;
            }
            else {
                modelKwargs[key] = value;
                hasModelKwargs = true;
            }
        }
    }
    if (hasModelKwargs) {
        openAIConfig.modelKwargs = modelKwargs;
    }
    if (dropParams && Array.isArray(dropParams)) {
        dropParams.forEach((param) => {
            if (param in openAIConfig) {
                delete openAIConfig[param];
            }
            if (openAIConfig.modelKwargs && param in openAIConfig.modelKwargs) {
                delete openAIConfig.modelKwargs[param];
                if (Object.keys(openAIConfig.modelKwargs).length === 0) {
                    delete openAIConfig.modelKwargs;
                }
            }
        });
    }
    return {
        llmConfig: openAIConfig,
        configOptions,
    };
}

/**
 * Generates configuration options for creating a language model (LLM) instance.
 * @param apiKey - The API key for authentication.
 * @param options - Additional options for configuring the LLM.
 * @param endpoint - The endpoint name
 * @returns Configuration options for creating an LLM instance.
 */
function getOpenAIConfig(apiKey, options = {}, endpoint) {
    var _a, _b, _c;
    const { proxy, addParams, dropParams, defaultQuery, directEndpoint, streaming = true, modelOptions = {}, reverseProxyUrl: baseURL, } = options;
    let llmConfig;
    let tools;
    const isAnthropic = ((_a = options.customParams) === null || _a === void 0 ? void 0 : _a.defaultParamsEndpoint) === librechatDataProvider.EModelEndpoint.anthropic;
    const useOpenRouter = !isAnthropic &&
        ((baseURL && baseURL.includes(librechatDataProvider.KnownEndpoints.openrouter)) ||
            (endpoint != null && endpoint.toLowerCase().includes(librechatDataProvider.KnownEndpoints.openrouter)));
    let azure = options.azure;
    let headers = options.headers;
    if (isAnthropic) {
        const anthropicResult = getLLMConfig(apiKey, {
            modelOptions,
            proxy: options.proxy,
        });
        const transformed = transformToOpenAIConfig({
            addParams,
            dropParams,
            llmConfig: anthropicResult.llmConfig,
            fromEndpoint: librechatDataProvider.EModelEndpoint.anthropic,
        });
        llmConfig = transformed.llmConfig;
        tools = anthropicResult.tools;
        if ((_b = transformed.configOptions) === null || _b === void 0 ? void 0 : _b.defaultHeaders) {
            headers = Object.assign(headers !== null && headers !== void 0 ? headers : {}, (_c = transformed.configOptions) === null || _c === void 0 ? void 0 : _c.defaultHeaders);
        }
    }
    else {
        const openaiResult = getOpenAILLMConfig({
            azure,
            apiKey,
            baseURL,
            streaming,
            addParams,
            dropParams,
            modelOptions,
            useOpenRouter,
        });
        llmConfig = openaiResult.llmConfig;
        azure = openaiResult.azure;
        tools = openaiResult.tools;
    }
    const configOptions = {};
    if (baseURL) {
        configOptions.baseURL = baseURL;
    }
    if (useOpenRouter) {
        configOptions.defaultHeaders = Object.assign({
            'HTTP-Referer': 'https://librechat.ai',
            'X-Title': 'LibreChat',
        }, headers);
    }
    else if (headers) {
        configOptions.defaultHeaders = headers;
    }
    if (defaultQuery) {
        configOptions.defaultQuery = defaultQuery;
    }
    if (proxy) {
        const proxyAgent = new undici.ProxyAgent(proxy);
        configOptions.fetchOptions = {
            dispatcher: proxyAgent,
        };
    }
    if (azure && !isAnthropic) {
        const constructAzureResponsesApi = () => {
            var _a, _b;
            if (!llmConfig.useResponsesApi || !azure) {
                return;
            }
            configOptions.baseURL = constructAzureURL({
                baseURL: configOptions.baseURL || 'https://${INSTANCE_NAME}.openai.azure.com/openai/v1',
                azureOptions: azure,
            });
            configOptions.defaultHeaders = Object.assign(Object.assign({}, configOptions.defaultHeaders), { 'api-key': apiKey });
            configOptions.defaultQuery = Object.assign(Object.assign({}, configOptions.defaultQuery), { 'api-version': (_b = (_a = configOptions.defaultQuery) === null || _a === void 0 ? void 0 : _a['api-version']) !== null && _b !== void 0 ? _b : 'preview' });
        };
        constructAzureResponsesApi();
    }
    if (process.env.OPENAI_ORGANIZATION && !isAnthropic) {
        configOptions.organization = process.env.OPENAI_ORGANIZATION;
    }
    if (directEndpoint === true && (configOptions === null || configOptions === void 0 ? void 0 : configOptions.baseURL) != null) {
        configOptions.fetch = createFetch({
            directEndpoint: directEndpoint,
            reverseProxyUrl: configOptions === null || configOptions === void 0 ? void 0 : configOptions.baseURL,
        });
    }
    const result = {
        llmConfig,
        configOptions,
        tools,
    };
    if (useOpenRouter) {
        result.provider = agents.Providers.OPENROUTER;
    }
    return result;
}

/**
 * Initializes OpenAI options for agent usage. This function always returns configuration
 * options and never creates a client instance (equivalent to optionsOnly=true behavior).
 *
 * @param params - Configuration parameters
 * @returns Promise resolving to OpenAI configuration options
 * @throws Error if API key is missing or user key has expired
 */
const initializeOpenAI = ({ req, appConfig, overrideModel, endpointOption, overrideEndpoint, getUserKeyValues, checkUserKeyExpiry, }) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const { PROXY, OPENAI_API_KEY, AZURE_API_KEY, OPENAI_REVERSE_PROXY, AZURE_OPENAI_BASEURL } = process.env;
    const { key: expiresAt } = req.body;
    const modelName = overrideModel !== null && overrideModel !== void 0 ? overrideModel : req.body.model;
    const endpoint = overrideEndpoint !== null && overrideEndpoint !== void 0 ? overrideEndpoint : req.body.endpoint;
    if (!endpoint) {
        throw new Error('Endpoint is required');
    }
    const credentials = {
        [librechatDataProvider.EModelEndpoint.openAI]: OPENAI_API_KEY,
        [librechatDataProvider.EModelEndpoint.azureOpenAI]: AZURE_API_KEY,
    };
    const baseURLOptions = {
        [librechatDataProvider.EModelEndpoint.openAI]: OPENAI_REVERSE_PROXY,
        [librechatDataProvider.EModelEndpoint.azureOpenAI]: AZURE_OPENAI_BASEURL,
    };
    const userProvidesKey = isUserProvided(credentials[endpoint]);
    const userProvidesURL = isUserProvided(baseURLOptions[endpoint]);
    let userValues = null;
    if (expiresAt && (userProvidesKey || userProvidesURL)) {
        checkUserKeyExpiry(expiresAt, endpoint);
        userValues = yield getUserKeyValues({ userId: req.user.id, name: endpoint });
    }
    let apiKey = userProvidesKey
        ? userValues === null || userValues === void 0 ? void 0 : userValues.apiKey
        : credentials[endpoint];
    const baseURL = userProvidesURL
        ? userValues === null || userValues === void 0 ? void 0 : userValues.baseURL
        : baseURLOptions[endpoint];
    const clientOptions = {
        proxy: PROXY !== null && PROXY !== void 0 ? PROXY : undefined,
        reverseProxyUrl: baseURL || undefined,
        streaming: true,
    };
    const isAzureOpenAI = endpoint === librechatDataProvider.EModelEndpoint.azureOpenAI;
    const azureConfig = isAzureOpenAI && ((_a = appConfig.endpoints) === null || _a === void 0 ? void 0 : _a[librechatDataProvider.EModelEndpoint.azureOpenAI]);
    if (isAzureOpenAI && azureConfig) {
        const { modelGroupMap, groupMap } = azureConfig;
        const { azureOptions, baseURL: configBaseURL, headers = {}, serverless, } = librechatDataProvider.mapModelToAzureConfig({
            modelName: modelName || '',
            modelGroupMap,
            groupMap,
        });
        clientOptions.reverseProxyUrl = configBaseURL !== null && configBaseURL !== void 0 ? configBaseURL : clientOptions.reverseProxyUrl;
        clientOptions.headers = resolveHeaders({
            headers: Object.assign(Object.assign({}, headers), ((_b = clientOptions.headers) !== null && _b !== void 0 ? _b : {})),
            user: req.user,
        });
        const groupName = (_c = modelGroupMap[modelName || '']) === null || _c === void 0 ? void 0 : _c.group;
        if (groupName && groupMap[groupName]) {
            clientOptions.addParams = (_d = groupMap[groupName]) === null || _d === void 0 ? void 0 : _d.addParams;
            clientOptions.dropParams = (_e = groupMap[groupName]) === null || _e === void 0 ? void 0 : _e.dropParams;
        }
        apiKey = azureOptions.azureOpenAIApiKey;
        clientOptions.azure = !serverless ? azureOptions : undefined;
        if (serverless === true) {
            clientOptions.defaultQuery = azureOptions.azureOpenAIApiVersion
                ? { 'api-version': azureOptions.azureOpenAIApiVersion }
                : undefined;
            if (!clientOptions.headers) {
                clientOptions.headers = {};
            }
            clientOptions.headers['api-key'] = apiKey;
        }
    }
    else if (isAzureOpenAI) {
        clientOptions.azure =
            userProvidesKey && (userValues === null || userValues === void 0 ? void 0 : userValues.apiKey) ? JSON.parse(userValues.apiKey) : getAzureCredentials();
        apiKey = clientOptions.azure ? clientOptions.azure.azureOpenAIApiKey : undefined;
    }
    if (userProvidesKey && !apiKey) {
        throw new Error(JSON.stringify({
            type: librechatDataProvider.ErrorTypes.NO_USER_KEY,
        }));
    }
    if (!apiKey) {
        throw new Error(`${endpoint} API Key not provided.`);
    }
    const modelOptions = Object.assign(Object.assign({}, endpointOption.model_parameters), { model: modelName, user: req.user.id });
    const finalClientOptions = Object.assign(Object.assign({}, clientOptions), { modelOptions });
    const options = getOpenAIConfig(apiKey, finalClientOptions, endpoint);
    const openAIConfig = (_f = appConfig.endpoints) === null || _f === void 0 ? void 0 : _f[librechatDataProvider.EModelEndpoint.openAI];
    const allConfig = (_g = appConfig.endpoints) === null || _g === void 0 ? void 0 : _g.all;
    const azureRate = (modelName === null || modelName === void 0 ? void 0 : modelName.includes('gpt-4')) ? 30 : 17;
    let streamRate;
    if (isAzureOpenAI && azureConfig) {
        streamRate = (_h = azureConfig.streamRate) !== null && _h !== void 0 ? _h : azureRate;
    }
    else if (!isAzureOpenAI && openAIConfig) {
        streamRate = openAIConfig.streamRate;
    }
    if (allConfig === null || allConfig === void 0 ? void 0 : allConfig.streamRate) {
        streamRate = allConfig.streamRate;
    }
    if (streamRate) {
        options.llmConfig.callbacks = [
            {
                handleLLMNewToken: createHandleLLMNewToken(streamRate),
            },
        ];
    }
    const result = Object.assign(Object.assign({}, options), { streamRate });
    return result;
});

const axios = createAxiosInstance();
const DEFAULT_MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
const DEFAULT_MISTRAL_MODEL = 'mistral-ocr-latest';
/**
 * Uploads a document to Mistral API using file streaming to avoid loading the entire file into memory
 * @param params Upload parameters
 * @param params.filePath The path to the file on disk
 * @param params.fileName Optional filename to use (defaults to the name from filePath)
 * @param params.apiKey Mistral API key
 * @param params.baseURL Mistral API base URL
 * @returns The response from Mistral API
 */
function uploadDocumentToMistral({ apiKey, filePath, baseURL = DEFAULT_MISTRAL_BASE_URL, fileName = '', }) {
    return __awaiter(this, void 0, void 0, function* () {
        const form = new FormData();
        form.append('purpose', 'ocr');
        const actualFileName = fileName || path__namespace.basename(filePath);
        const fileStream = fs__namespace.createReadStream(filePath);
        form.append('file', fileStream, { filename: actualFileName });
        return axios
            .post(`${baseURL}/files`, form, {
            headers: Object.assign({ Authorization: `Bearer ${apiKey}` }, form.getHeaders()),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        })
            .then((res) => res.data)
            .catch((error) => {
            throw error;
        });
    });
}
function getSignedUrl({ apiKey, fileId, expiry = 24, baseURL = DEFAULT_MISTRAL_BASE_URL, }) {
    return __awaiter(this, void 0, void 0, function* () {
        return axios
            .get(`${baseURL}/files/${fileId}/url?expiry=${expiry}`, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        })
            .then((res) => res.data)
            .catch((error) => {
            dataSchemas.logger.error('Error fetching signed URL:', error.message);
            throw error;
        });
    });
}
/**
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {string} params.url - The document or image URL
 * @param {string} [params.documentType='document_url'] - 'document_url' or 'image_url'
 * @param {string} [params.model]
 * @param {string} [params.baseURL]
 * @returns {Promise<OCRResult>}
 */
function performOCR({ url, apiKey, model = DEFAULT_MISTRAL_MODEL, baseURL = DEFAULT_MISTRAL_BASE_URL, documentType = 'document_url', }) {
    return __awaiter(this, void 0, void 0, function* () {
        const documentKey = documentType === 'image_url' ? 'image_url' : 'document_url';
        return axios
            .post(`${baseURL}/ocr`, {
            model,
            image_limit: 0,
            include_image_base64: false,
            document: {
                type: documentType,
                [documentKey]: url,
            },
        }, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
        })
            .then((res) => res.data)
            .catch((error) => {
            dataSchemas.logger.error('Error performing OCR:', error.message);
            throw error;
        });
    });
}
/**
 * Deletes a file from Mistral API
 * @param params Delete parameters
 * @param params.fileId The file ID to delete
 * @param params.apiKey Mistral API key
 * @param params.baseURL Mistral API base URL
 * @returns Promise that resolves when the file is deleted
 */
function deleteMistralFile({ fileId, apiKey, baseURL = DEFAULT_MISTRAL_BASE_URL, }) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield axios.delete(`${baseURL}/files/${fileId}`, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            });
            dataSchemas.logger.debug(`Mistral file ${fileId} deleted successfully:`, result.data);
        }
        catch (error) {
            dataSchemas.logger.error(`Error deleting Mistral file ${fileId}:`, error);
        }
    });
}
/**
 * Determines if a value needs to be loaded from environment
 */
function needsEnvLoad(value) {
    return librechatDataProvider.envVarRegex.test(value) || !value.trim();
}
/**
 * Gets the environment variable name for a config value
 */
function getEnvVarName(configValue, defaultName) {
    if (!librechatDataProvider.envVarRegex.test(configValue)) {
        return defaultName;
    }
    return librechatDataProvider.extractVariableName(configValue) || defaultName;
}
/**
 * Resolves a configuration value from either hardcoded or environment
 */
function resolveConfigValue(configValue, defaultEnvName, authValues, defaultValue) {
    return __awaiter(this, void 0, void 0, function* () {
        // If it's a hardcoded value (not env var and not empty), use it directly
        if (!needsEnvLoad(configValue)) {
            return configValue;
        }
        // Otherwise, get from auth values
        const envVarName = getEnvVarName(configValue, defaultEnvName);
        return authValues[envVarName] || defaultValue || '';
    });
}
/**
 * Loads authentication configuration from OCR config
 */
function loadAuthConfig(context) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const appConfig = context.req.config;
        const ocrConfig = appConfig === null || appConfig === void 0 ? void 0 : appConfig.ocr;
        const apiKeyConfig = (ocrConfig === null || ocrConfig === void 0 ? void 0 : ocrConfig.apiKey) || '';
        const baseURLConfig = (ocrConfig === null || ocrConfig === void 0 ? void 0 : ocrConfig.baseURL) || '';
        if (!needsEnvLoad(apiKeyConfig) && !needsEnvLoad(baseURLConfig)) {
            return {
                apiKey: apiKeyConfig,
                baseURL: baseURLConfig,
            };
        }
        const authFields = [];
        if (needsEnvLoad(baseURLConfig)) {
            authFields.push(getEnvVarName(baseURLConfig, 'OCR_BASEURL'));
        }
        if (needsEnvLoad(apiKeyConfig)) {
            authFields.push(getEnvVarName(apiKeyConfig, 'OCR_API_KEY'));
        }
        const authValues = yield context.loadAuthValues({
            userId: ((_a = context.req.user) === null || _a === void 0 ? void 0 : _a.id) || '',
            authFields,
            optional: new Set(['OCR_BASEURL']),
        });
        const apiKey = yield resolveConfigValue(apiKeyConfig, 'OCR_API_KEY', authValues);
        const baseURL = yield resolveConfigValue(baseURLConfig, 'OCR_BASEURL', authValues, DEFAULT_MISTRAL_BASE_URL);
        return { apiKey, baseURL };
    });
}
/**
 * Gets the model configuration
 */
function getModelConfig(ocrConfig) {
    const modelConfig = (ocrConfig === null || ocrConfig === void 0 ? void 0 : ocrConfig.mistralModel) || '';
    if (!modelConfig.trim()) {
        return DEFAULT_MISTRAL_MODEL;
    }
    if (librechatDataProvider.envVarRegex.test(modelConfig)) {
        return librechatDataProvider.extractEnvVariable(modelConfig) || DEFAULT_MISTRAL_MODEL;
    }
    return modelConfig.trim();
}
/**
 * Determines document type based on file
 */
function getDocumentType(file) {
    const mimetype = (file.mimetype || '').toLowerCase();
    const originalname = file.originalname || '';
    const isImage = mimetype.startsWith('image') || /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(originalname);
    return isImage ? 'image_url' : 'document_url';
}
/**
 * Processes OCR result pages into aggregated text and images
 */
function processOCRResult(ocrResult) {
    let aggregatedText = '';
    const images = [];
    ocrResult.pages.forEach((page, index) => {
        if (ocrResult.pages.length > 1) {
            aggregatedText += `# PAGE ${index + 1}\n`;
        }
        aggregatedText += page.markdown + '\n\n';
        if (!page.images || page.images.length === 0) {
            return;
        }
        page.images.forEach((image) => {
            if (image.image_base64) {
                images.push(image.image_base64);
            }
        });
    });
    return { text: aggregatedText, images };
}
/**
 * Creates an error message for OCR operations
 */
function createOCRError(error, baseMessage) {
    var _a, _b, _c, _d;
    const axiosError = error;
    const detail = (_b = (_a = axiosError === null || axiosError === void 0 ? void 0 : axiosError.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.detail;
    const message = detail || baseMessage;
    const responseMessage = (_d = (_c = axiosError === null || axiosError === void 0 ? void 0 : axiosError.response) === null || _c === void 0 ? void 0 : _c.data) === null || _d === void 0 ? void 0 : _d.message;
    const errorLog = logAxiosError({ error: axiosError, message });
    const fullMessage = responseMessage ? `${errorLog} - ${responseMessage}` : errorLog;
    return new Error(fullMessage);
}
/**
 * Uploads a file to the Mistral OCR API and processes the OCR result.
 *
 * @param params - The params object.
 * @param params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user
 * @param params.file - The file object, which is part of the request. The file object should
 *                                     have a `mimetype` property that tells us the file type
 * @param params.loadAuthValues - Function to load authentication values
 * @returns - The result object containing the processed `text` and `images` (not currently used),
 *                       along with the `filename` and `bytes` properties.
 */
const uploadMistralOCR = (context) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    let mistralFileId;
    let apiKey;
    let baseURL;
    try {
        const authConfig = yield loadAuthConfig(context);
        apiKey = authConfig.apiKey;
        baseURL = authConfig.baseURL;
        const model = getModelConfig((_a = context.req.config) === null || _a === void 0 ? void 0 : _a.ocr);
        const mistralFile = yield uploadDocumentToMistral({
            filePath: context.file.path,
            fileName: context.file.originalname,
            apiKey,
            baseURL,
        });
        mistralFileId = mistralFile.id;
        const signedUrlResponse = yield getSignedUrl({
            apiKey,
            baseURL,
            fileId: mistralFile.id,
        });
        const documentType = getDocumentType(context.file);
        const ocrResult = yield performOCR({
            url: signedUrlResponse.url,
            documentType,
            baseURL,
            apiKey,
            model,
        });
        if (!ocrResult || !ocrResult.pages || ocrResult.pages.length === 0) {
            throw new Error('No OCR result returned from service, may be down or the file is not supported.');
        }
        const { text, images } = processOCRResult(ocrResult);
        if (mistralFileId && apiKey && baseURL) {
            yield deleteMistralFile({ fileId: mistralFileId, apiKey, baseURL });
        }
        return {
            filename: context.file.originalname,
            bytes: text.length * 4,
            filepath: librechatDataProvider.FileSources.mistral_ocr,
            text,
            images,
        };
    }
    catch (error) {
        if (mistralFileId && apiKey && baseURL) {
            yield deleteMistralFile({ fileId: mistralFileId, apiKey, baseURL });
        }
        throw createOCRError(error, 'Error uploading document to Mistral OCR API:');
    }
});
/**
 * Use Azure Mistral OCR API to processe the OCR result.
 *
 * @param params - The params object.
 * @param params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user
 * @param params.appConfig - Application configuration object
 * @param params.file - The file object, which is part of the request. The file object should
 *                                     have a `mimetype` property that tells us the file type
 * @param params.loadAuthValues - Function to load authentication values
 * @returns - The result object containing the processed `text` and `images` (not currently used),
 *                       along with the `filename` and `bytes` properties.
 */
const uploadAzureMistralOCR = (context) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    try {
        const { apiKey, baseURL } = yield loadAuthConfig(context);
        const model = getModelConfig((_b = context.req.config) === null || _b === void 0 ? void 0 : _b.ocr);
        const buffer = fs__namespace.readFileSync(context.file.path);
        const base64 = buffer.toString('base64');
        /** Uses actual mimetype of the file, 'image/jpeg' as fallback since it seems to be accepted regardless of mismatch */
        const base64Prefix = `data:${context.file.mimetype || 'image/jpeg'};base64,`;
        const documentType = getDocumentType(context.file);
        const ocrResult = yield performOCR({
            apiKey,
            baseURL,
            model,
            url: `${base64Prefix}${base64}`,
            documentType,
        });
        if (!ocrResult || !ocrResult.pages || ocrResult.pages.length === 0) {
            throw new Error('No OCR result returned from service, may be down or the file is not supported.');
        }
        const { text, images } = processOCRResult(ocrResult);
        return {
            filename: context.file.originalname,
            bytes: text.length * 4,
            filepath: librechatDataProvider.FileSources.azure_mistral_ocr,
            text,
            images,
        };
    }
    catch (error) {
        throw createOCRError(error, 'Error uploading document to Azure Mistral OCR API:');
    }
});
/**
 * Loads Google service account configuration
 */
function loadGoogleAuthConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        /** Path from environment variable or default location */
        const serviceKeyPath = process.env.GOOGLE_SERVICE_KEY_FILE ||
            path__namespace.join(__dirname, '..', '..', '..', 'api', 'data', 'auth.json');
        const serviceKey = yield loadServiceKey(serviceKeyPath);
        if (!serviceKey) {
            throw new Error(`Google service account not found or could not be loaded from ${serviceKeyPath}`);
        }
        if (!serviceKey.client_email || !serviceKey.private_key || !serviceKey.project_id) {
            throw new Error('Invalid Google service account configuration');
        }
        const jwt = yield createJWT(serviceKey);
        const accessToken = yield exchangeJWTForAccessToken(jwt);
        return {
            serviceAccount: serviceKey,
            accessToken,
        };
    });
}
/**
 * Creates a JWT token manually
 */
function createJWT(serviceKey) {
    return __awaiter(this, void 0, void 0, function* () {
        const crypto = yield import('crypto');
        const header = {
            alg: 'RS256',
            typ: 'JWT',
        };
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: serviceKey.client_email,
            scope: 'https://www.googleapis.com/auth/cloud-platform',
            aud: 'https://oauth2.googleapis.com/token',
            exp: now + 3600,
            iat: now,
        };
        const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
        const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signatureInput = `${encodedHeader}.${encodedPayload}`;
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(signatureInput);
        sign.end();
        const signature = sign.sign(serviceKey.private_key, 'base64url');
        return `${signatureInput}.${signature}`;
    });
}
/**
 * Exchanges JWT for access token
 */
function exchangeJWTForAccessToken(jwt) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        if (!((_a = response.data) === null || _a === void 0 ? void 0 : _a.access_token)) {
            throw new Error('No access token in response');
        }
        return response.data.access_token;
    });
}
/**
 * Performs OCR using Google Vertex AI
 */
function performGoogleVertexOCR({ url, accessToken, projectId, model, documentType = 'document_url', }) {
    return __awaiter(this, void 0, void 0, function* () {
        const location = process.env.GOOGLE_LOC || 'us-central1';
        const modelId = model || 'mistral-ocr-2505';
        let baseURL;
        if (location === 'global') {
            baseURL = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/mistralai/models/${modelId}:rawPredict`;
        }
        else {
            baseURL = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/mistralai/models/${modelId}:rawPredict`;
        }
        const documentKey = documentType === 'image_url' ? 'image_url' : 'document_url';
        const requestBody = {
            model: modelId,
            document: {
                type: documentType,
                [documentKey]: url,
            },
            include_image_base64: true,
        };
        dataSchemas.logger.debug('Sending request to Google Vertex AI:', {
            url: baseURL,
            body: Object.assign(Object.assign({}, requestBody), { document: Object.assign(Object.assign({}, requestBody.document), { [documentKey]: 'base64_data_hidden' }) }),
        });
        return axios
            .post(baseURL, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        })
            .then((res) => {
            dataSchemas.logger.debug('Google Vertex AI response received');
            return res.data;
        })
            .catch((error) => {
            var _a;
            if ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) {
                dataSchemas.logger.error('Vertex AI error response: ' + JSON.stringify(error.response.data, null, 2));
            }
            throw new Error(logAxiosError({
                error: error,
                message: 'Error calling Google Vertex AI Mistral OCR',
            }));
        });
    });
}
/**
 * Use Google Vertex AI Mistral OCR API to process the OCR result.
 *
 * @param params - The params object.
 * @param params.req - The request object from Express. It should have a `user` property with an `id`
 *                       representing the user
 * @param params.appConfig - Application configuration object
 * @param params.file - The file object, which is part of the request. The file object should
 *                                     have a `mimetype` property that tells us the file type
 * @param params.loadAuthValues - Function to load authentication values
 * @returns - The result object containing the processed `text` and `images` (not currently used),
 *                       along with the `filename` and `bytes` properties.
 */
const uploadGoogleVertexMistralOCR = (context) => __awaiter(void 0, void 0, void 0, function* () {
    var _c;
    try {
        const { serviceAccount, accessToken } = yield loadGoogleAuthConfig();
        const model = getModelConfig((_c = context.req.config) === null || _c === void 0 ? void 0 : _c.ocr);
        const buffer = fs__namespace.readFileSync(context.file.path);
        const base64 = buffer.toString('base64');
        const base64Prefix = `data:${context.file.mimetype || 'application/pdf'};base64,`;
        const documentType = getDocumentType(context.file);
        const ocrResult = yield performGoogleVertexOCR({
            url: `${base64Prefix}${base64}`,
            accessToken,
            projectId: serviceAccount.project_id,
            model,
            documentType,
        });
        if (!ocrResult || !ocrResult.pages || ocrResult.pages.length === 0) {
            throw new Error('No OCR result returned from service, may be down or the file is not supported.');
        }
        const { text, images } = processOCRResult(ocrResult);
        return {
            filename: context.file.originalname,
            bytes: text.length * 4,
            filepath: librechatDataProvider.FileSources.vertexai_mistral_ocr,
            text,
            images,
        };
    }
    catch (error) {
        throw createOCRError(error, 'Error uploading document to Google Vertex AI Mistral OCR:');
    }
});

/**
 * Processes audio files using Speech-to-Text (STT) service.
 * @returns A promise that resolves to an object containing text and bytes.
 */
function processAudioFile({ req, file, sttService, }) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const audioBuffer = yield fs$1.promises.readFile(file.path);
            const audioFile = {
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
            };
            const [provider, sttSchema] = yield sttService.getProviderSchema(req);
            const text = yield sttService.sttRequest(provider, sttSchema, { audioBuffer, audioFile });
            return {
                text,
                bytes: Buffer.byteLength(text, 'utf8'),
            };
        }
        catch (error) {
            dataSchemas.logger.error('Error processing audio file with STT:', error);
            throw new Error(`Failed to process audio file: ${error.message}`);
        }
    });
}

/**
 * Attempts to parse text using RAG API, falls back to native text parsing
 * @param {Object} params - The parameters object
 * @param {Express.Request} params.req - The Express request object
 * @param {Express.Multer.File} params.file - The uploaded file
 * @param {string} params.file_id - The file ID
 * @returns {Promise<{text: string, bytes: number, source: string}>}
 */
function parseText({ req, file, file_id, }) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        if (!process.env.RAG_API_URL) {
            dataSchemas.logger.debug('[parseText] RAG_API_URL not defined, falling back to native text parsing');
            return parseTextNative(file);
        }
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.id)) {
            dataSchemas.logger.debug('[parseText] No user ID provided, falling back to native text parsing');
            return parseTextNative(file);
        }
        try {
            const healthResponse = yield axios$1.get(`${process.env.RAG_API_URL}/health`, {
                timeout: 5000,
            });
            if ((healthResponse === null || healthResponse === void 0 ? void 0 : healthResponse.statusText) !== 'OK' && (healthResponse === null || healthResponse === void 0 ? void 0 : healthResponse.status) !== 200) {
                dataSchemas.logger.debug('[parseText] RAG API health check failed, falling back to native parsing');
                return parseTextNative(file);
            }
        }
        catch (healthError) {
            dataSchemas.logger.debug('[parseText] RAG API health check failed, falling back to native parsing', healthError);
            return parseTextNative(file);
        }
        try {
            const jwtToken = generateShortLivedToken(req.user.id);
            const formData = new FormData();
            formData.append('file_id', file_id);
            formData.append('file', fs$1.createReadStream(file.path));
            const formHeaders = formData.getHeaders();
            const response = yield axios$1.post(`${process.env.RAG_API_URL}/text`, formData, {
                headers: Object.assign({ Authorization: `Bearer ${jwtToken}`, accept: 'application/json' }, formHeaders),
                timeout: 30000,
            });
            const responseData = response.data;
            dataSchemas.logger.debug('[parseText] Response from RAG API', responseData);
            if (!('text' in responseData)) {
                throw new Error('RAG API did not return parsed text');
            }
            return {
                text: responseData.text,
                bytes: Buffer.byteLength(responseData.text, 'utf8'),
                source: librechatDataProvider.FileSources.text,
            };
        }
        catch (error) {
            dataSchemas.logger.warn('[parseText] RAG API text parsing failed, falling back to native parsing', error);
            return parseTextNative(file);
        }
    });
}
/**
 * Native JavaScript text parsing fallback
 * Simple text file reading - complex formats handled by RAG API
 * @param {Express.Multer.File} file - The uploaded file
 * @returns {{text: string, bytes: number, source: string}}
 */
function parseTextNative(file) {
    try {
        const text = fs$1.readFileSync(file.path, 'utf8');
        const bytes = Buffer.byteLength(text, 'utf8');
        return {
            text,
            bytes,
            source: librechatDataProvider.FileSources.text,
        };
    }
    catch (error) {
        console.error('[parseTextNative] Failed to parse file:', error);
        throw new Error(`Failed to read file as text: ${error}`);
    }
}

const imageExtensionRegex = /\.(jpg|jpeg|png|gif|bmp|tiff|svg|webp)$/i;
/**
 * Extracts the image basename from a given URL.
 *
 * @param urlString - The URL string from which the image basename is to be extracted.
 * @returns The basename of the image file from the URL.
 * Returns an empty string if the URL does not contain a valid image basename.
 */
function getImageBasename(urlString) {
    try {
        const url$1 = new url.URL(urlString);
        const basename = path$1.basename(url$1.pathname);
        return imageExtensionRegex.test(basename) ? basename : '';
    }
    catch (_a) {
        // If URL parsing fails, return an empty string
        return '';
    }
}
/**
 * Extracts the basename of a file from a given URL.
 *
 * @param urlString - The URL string from which the file basename is to be extracted.
 * @returns The basename of the file from the URL.
 * Returns an empty string if the URL parsing fails.
 */
function getFileBasename(urlString) {
    try {
        const url$1 = new url.URL(urlString);
        return path$1.basename(url$1.pathname);
    }
    catch (_a) {
        // If URL parsing fails, return an empty string
        return '';
    }
}

/**
 * Filters out duplicate plugins from the list of plugins.
 *
 * @param plugins The list of plugins to filter.
 * @returns The list of plugins with duplicates removed.
 */
const filterUniquePlugins = (plugins) => {
    const seen = new Set();
    return ((plugins === null || plugins === void 0 ? void 0 : plugins.filter((plugin) => {
        const duplicate = seen.has(plugin.pluginKey);
        seen.add(plugin.pluginKey);
        return !duplicate;
    })) || []);
};
/**
 * Determines if a plugin is authenticated by checking if all required authentication fields have non-empty values.
 * Supports alternate authentication fields, allowing validation against multiple possible environment variables.
 *
 * @param plugin The plugin object containing the authentication configuration.
 * @returns True if the plugin is authenticated for all required fields, false otherwise.
 */
const checkPluginAuth = (plugin) => {
    if (!(plugin === null || plugin === void 0 ? void 0 : plugin.authConfig) || plugin.authConfig.length === 0) {
        return false;
    }
    return plugin.authConfig.every((authFieldObj) => {
        const authFieldOptions = authFieldObj.authField.split('||');
        let isFieldAuthenticated = false;
        for (const fieldOption of authFieldOptions) {
            const envValue = process.env[fieldOption];
            if (envValue && envValue.trim() !== '' && envValue !== librechatDataProvider.AuthType.USER_PROVIDED) {
                isFieldAuthenticated = true;
                break;
            }
        }
        return isFieldAuthenticated;
    });
};
/**
 * Converts MCP function format tool to plugin format
 * @param params
 * @param params.toolKey
 * @param params.toolData
 * @param params.customConfig
 * @returns
 */
function convertMCPToolToPlugin({ toolKey, toolData, mcpManager, }) {
    if (!toolData.function || !toolKey.includes(librechatDataProvider.Constants.mcp_delimiter)) {
        return;
    }
    const functionData = toolData.function;
    const parts = toolKey.split(librechatDataProvider.Constants.mcp_delimiter);
    const serverName = parts[parts.length - 1];
    const serverConfig = mcpManager === null || mcpManager === void 0 ? void 0 : mcpManager.getRawConfig(serverName);
    const plugin = {
        /** Tool name without server suffix */
        name: parts[0],
        pluginKey: toolKey,
        description: functionData.description || '',
        authenticated: true,
        icon: serverConfig === null || serverConfig === void 0 ? void 0 : serverConfig.iconPath,
    };
    if (!(serverConfig === null || serverConfig === void 0 ? void 0 : serverConfig.customUserVars)) {
        /** `authConfig` for MCP tools */
        plugin.authConfig = [];
        return plugin;
    }
    const customVarKeys = Object.keys(serverConfig.customUserVars);
    if (customVarKeys.length === 0) {
        plugin.authConfig = [];
    }
    else {
        plugin.authConfig = Object.entries(serverConfig.customUserVars).map(([key, value]) => ({
            authField: key,
            label: value.title || key,
            description: value.description || '',
        }));
    }
    return plugin;
}
/**
 * Converts MCP function format tools to plugin format
 * @param functionTools - Object with function format tools
 * @param customConfig - Custom configuration for MCP servers
 * @returns Array of plugin objects
 */
function convertMCPToolsToPlugins({ functionTools, mcpManager, }) {
    if (!functionTools || typeof functionTools !== 'object') {
        return;
    }
    const plugins = [];
    for (const [toolKey, toolData] of Object.entries(functionTools)) {
        const plugin = convertMCPToolToPlugin({ toolKey, toolData, mcpManager });
        if (plugin) {
            plugins.push(plugin);
        }
    }
    return plugins;
}
/**
 * @param toolkits
 * @param toolName
 * @returns toolKey
 */
function getToolkitKey({ toolkits, toolName, }) {
    let toolkitKey;
    if (!toolName) {
        return toolkitKey;
    }
    for (const toolkit of toolkits) {
        if (toolName.startsWith(librechatDataProvider.EToolResources.image_edit)) {
            const splitMatches = toolkit.pluginKey.split('_');
            const suffix = splitMatches[splitMatches.length - 1];
            if (toolName.endsWith(suffix)) {
                toolkitKey = toolkit.pluginKey;
                break;
            }
        }
        if (toolName.startsWith(toolkit.pluginKey)) {
            toolkitKey = toolkit.pluginKey;
            break;
        }
    }
    return toolkitKey;
}

/** Default descriptions for image generation tool  */
const DEFAULT_IMAGE_GEN_DESCRIPTION = `Generates high-quality, original images based solely on text, not using any uploaded reference images.

When to use \`image_gen_oai\`:
- To create entirely new images from detailed text descriptions that do NOT reference any image files.

When NOT to use \`image_gen_oai\`:
- If the user has uploaded any images and requests modifications, enhancements, or remixing based on those uploads → use \`image_edit_oai\` instead.

Generated image IDs will be returned in the response, so you can refer to them in future requests made to \`image_edit_oai\`.`;
const getImageGenDescription = () => {
    return process.env.IMAGE_GEN_OAI_DESCRIPTION || DEFAULT_IMAGE_GEN_DESCRIPTION;
};
/** Default prompt descriptions  */
const DEFAULT_IMAGE_GEN_PROMPT_DESCRIPTION = `Describe the image you want in detail. 
      Be highly specific—break your idea into layers: 
      (1) main concept and subject,
      (2) composition and position,
      (3) lighting and mood,
      (4) style, medium, or camera details,
      (5) important features (age, expression, clothing, etc.),
      (6) background.
      Use positive, descriptive language and specify what should be included, not what to avoid. 
      List number and characteristics of people/objects, and mention style/technical requirements (e.g., "DSLR photo, 85mm lens, golden hour").
      Do not reference any uploaded images—use for new image creation from text only.`;
const getImageGenPromptDescription = () => {
    return process.env.IMAGE_GEN_OAI_PROMPT_DESCRIPTION || DEFAULT_IMAGE_GEN_PROMPT_DESCRIPTION;
};
/** Default description for image editing tool  */
const DEFAULT_IMAGE_EDIT_DESCRIPTION = `Generates high-quality, original images based on text and one or more uploaded/referenced images.

When to use \`image_edit_oai\`:
- The user wants to modify, extend, or remix one **or more** uploaded images, either:
- Previously generated, or in the current request (both to be included in the \`image_ids\` array).
- Always when the user refers to uploaded images for editing, enhancement, remixing, style transfer, or combining elements.
- Any current or existing images are to be used as visual guides.
- If there are any files in the current request, they are more likely than not expected as references for image edit requests.

When NOT to use \`image_edit_oai\`:
- Brand-new generations that do not rely on an existing image → use \`image_gen_oai\` instead.

Both generated and referenced image IDs will be returned in the response, so you can refer to them in future requests made to \`image_edit_oai\`.
`.trim();
const getImageEditDescription = () => {
    return process.env.IMAGE_EDIT_OAI_DESCRIPTION || DEFAULT_IMAGE_EDIT_DESCRIPTION;
};
const DEFAULT_IMAGE_EDIT_PROMPT_DESCRIPTION = `Describe the changes, enhancements, or new ideas to apply to the uploaded image(s).
      Be highly specific—break your request into layers: 
      (1) main concept or transformation,
      (2) specific edits/replacements or composition guidance,
      (3) desired style, mood, or technique,
      (4) features/items to keep, change, or add (such as objects, people, clothing, lighting, etc.).
      Use positive, descriptive language and clarify what should be included or changed, not what to avoid.
      Always base this prompt on the most recently uploaded reference images.`;
const getImageEditPromptDescription = () => {
    return process.env.IMAGE_EDIT_OAI_PROMPT_DESCRIPTION || DEFAULT_IMAGE_EDIT_PROMPT_DESCRIPTION;
};
const oaiToolkit = {
    image_gen_oai: {
        name: 'image_gen_oai',
        description: getImageGenDescription(),
        schema: z.z.object({
            prompt: z.z.string().max(32000).describe(getImageGenPromptDescription()),
            background: z.z
                .enum(['transparent', 'opaque', 'auto'])
                .optional()
                .describe('Sets transparency for the background. Must be one of transparent, opaque or auto (default). When transparent, the output format should be png or webp.'),
            /*
              n: z
                .number()
                .int()
                .min(1)
                .max(10)
                .optional()
                .describe('The number of images to generate. Must be between 1 and 10.'),
              output_compression: z
                .number()
                .int()
                .min(0)
                .max(100)
                .optional()
                .describe('The compression level (0-100%) for webp or jpeg formats. Defaults to 100.'),
                 */
            quality: z.z
                .enum(['auto', 'high', 'medium', 'low'])
                .optional()
                .describe('The quality of the image. One of auto (default), high, medium, or low.'),
            size: z.z
                .enum(['auto', '1024x1024', '1536x1024', '1024x1536'])
                .optional()
                .describe('The size of the generated image. One of 1024x1024, 1536x1024 (landscape), 1024x1536 (portrait), or auto (default).'),
        }),
        responseFormat: 'content_and_artifact',
    },
    image_edit_oai: {
        name: 'image_edit_oai',
        description: getImageEditDescription(),
        schema: z.z.object({
            image_ids: z.z
                .array(z.z.string())
                .min(1)
                .describe(`
IDs (image ID strings) of previously generated or uploaded images that should guide the edit.

Guidelines:
- If the user's request depends on any prior image(s), copy their image IDs into the \`image_ids\` array (in the same order the user refers to them).  
- Never invent or hallucinate IDs; only use IDs that are still visible in the conversation context.
- If no earlier image is relevant, omit the field entirely.
`.trim()),
            prompt: z.z.string().max(32000).describe(getImageEditPromptDescription()),
            /*
              n: z
                .number()
                .int()
                .min(1)
                .max(10)
                .optional()
                .describe('The number of images to generate. Must be between 1 and 10. Defaults to 1.'),
              */
            quality: z.z
                .enum(['auto', 'high', 'medium', 'low'])
                .optional()
                .describe('The quality of the image. One of auto (default), high, medium, or low. High/medium/low only supported for gpt-image-1.'),
            size: z.z
                .enum(['auto', '1024x1024', '1536x1024', '1024x1536', '256x256', '512x512'])
                .optional()
                .describe('The size of the generated images. For gpt-image-1: auto (default), 1024x1024, 1536x1024, 1024x1536. For dall-e-2: 256x256, 512x512, 1024x1024.'),
        }),
        responseFormat: 'content_and_artifact',
    },
};

const ytToolkit = {
    youtube_search: {
        name: 'youtube_search',
        description: `Search for YouTube videos by keyword or phrase.
- Required: query (search terms to find videos)
- Optional: maxResults (number of videos to return, 1-50, default: 5)
- Returns: List of videos with titles, descriptions, and URLs
- Use for: Finding specific videos, exploring content, research
Example: query="cooking pasta tutorials" maxResults=3`,
        schema: z.z.object({
            query: z.z.string().describe('Search query terms'),
            maxResults: z.z.number().int().min(1).max(50).optional().describe('Number of results (1-50)'),
        }),
    },
    youtube_info: {
        name: 'youtube_info',
        description: `Get detailed metadata and statistics for a specific YouTube video.
- Required: url (full YouTube URL or video ID)
- Returns: Video title, description, view count, like count, comment count
- Use for: Getting video metrics and basic metadata
- DO NOT USE FOR VIDEO SUMMARIES, USE TRANSCRIPTS FOR COMPREHENSIVE ANALYSIS
- Accepts both full URLs and video IDs
Example: url="https://youtube.com/watch?v=abc123" or url="abc123"`,
        schema: z.z.object({
            url: z.z.string().describe('YouTube video URL or ID'),
        }),
    },
    youtube_comments: {
        name: 'youtube_comments',
        description: `Retrieve top-level comments from a YouTube video.
- Required: url (full YouTube URL or video ID)
- Optional: maxResults (number of comments, 1-50, default: 10)
- Returns: Comment text, author names, like counts
- Use for: Sentiment analysis, audience feedback, engagement review
Example: url="abc123" maxResults=20`,
        schema: z.z.object({
            url: z.z.string().describe('YouTube video URL or ID'),
            maxResults: z.z
                .number()
                .int()
                .min(1)
                .max(50)
                .optional()
                .describe('Number of comments to retrieve'),
        }),
    },
    youtube_transcript: {
        name: 'youtube_transcript',
        description: `Fetch and parse the transcript/captions of a YouTube video.
- Required: url (full YouTube URL or video ID)
- Returns: Full video transcript as plain text
- Use for: Content analysis, summarization, translation reference
- This is the "Go-to" tool for analyzing actual video content
- Attempts to fetch English first, then German, then any available language
Example: url="https://youtube.com/watch?v=abc123"`,
        schema: z.z.object({
            url: z.z.string().describe('YouTube video URL or ID'),
        }),
    },
};

function loadWebSearchConfig(config) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const serperApiKey = (_a = config === null || config === void 0 ? void 0 : config.serperApiKey) !== null && _a !== void 0 ? _a : '${SERPER_API_KEY}';
    const searxngInstanceUrl = (_b = config === null || config === void 0 ? void 0 : config.searxngInstanceUrl) !== null && _b !== void 0 ? _b : '${SEARXNG_INSTANCE_URL}';
    const searxngApiKey = (_c = config === null || config === void 0 ? void 0 : config.searxngApiKey) !== null && _c !== void 0 ? _c : '${SEARXNG_API_KEY}';
    const firecrawlApiKey = (_d = config === null || config === void 0 ? void 0 : config.firecrawlApiKey) !== null && _d !== void 0 ? _d : '${FIRECRAWL_API_KEY}';
    const firecrawlApiUrl = (_e = config === null || config === void 0 ? void 0 : config.firecrawlApiUrl) !== null && _e !== void 0 ? _e : '${FIRECRAWL_API_URL}';
    const jinaApiKey = (_f = config === null || config === void 0 ? void 0 : config.jinaApiKey) !== null && _f !== void 0 ? _f : '${JINA_API_KEY}';
    const jinaApiUrl = (_g = config === null || config === void 0 ? void 0 : config.jinaApiUrl) !== null && _g !== void 0 ? _g : '${JINA_API_URL}';
    const cohereApiKey = (_h = config === null || config === void 0 ? void 0 : config.cohereApiKey) !== null && _h !== void 0 ? _h : '${COHERE_API_KEY}';
    const safeSearch = (_j = config === null || config === void 0 ? void 0 : config.safeSearch) !== null && _j !== void 0 ? _j : librechatDataProvider.SafeSearchTypes.MODERATE;
    return Object.assign(Object.assign({}, config), { safeSearch,
        jinaApiKey,
        jinaApiUrl,
        cohereApiKey,
        serperApiKey,
        searxngInstanceUrl,
        searxngApiKey,
        firecrawlApiKey,
        firecrawlApiUrl });
}
const webSearchAuth = {
    providers: {
        serper: {
            serperApiKey: 1,
        },
        searxng: {
            searxngInstanceUrl: 1,
            /** Optional (0) */
            searxngApiKey: 0,
        },
    },
    scrapers: {
        firecrawl: {
            firecrawlApiKey: 1,
            /** Optional (0) */
            firecrawlApiUrl: 0,
        },
    },
    rerankers: {
        jina: {
            jinaApiKey: 1,
            /** Optional (0) */
            jinaApiUrl: 0,
        },
        cohere: { cohereApiKey: 1 },
    },
};
/**
 * Extracts all API keys from the webSearchAuth configuration object
 */
function getWebSearchKeys() {
    const keys = [];
    // Iterate through each category (providers, scrapers, rerankers)
    for (const category of Object.keys(webSearchAuth)) {
        const categoryObj = webSearchAuth[category];
        // Iterate through each service within the category
        for (const service of Object.keys(categoryObj)) {
            const serviceObj = categoryObj[service];
            // Extract the API keys from the service
            for (const key of Object.keys(serviceObj)) {
                keys.push(key);
            }
        }
    }
    return keys;
}
const webSearchKeys = getWebSearchKeys();
function extractWebSearchEnvVars({ keys, config, }) {
    if (!config) {
        return [];
    }
    const authFields = [];
    const relevantKeys = keys.filter((k) => k in config);
    for (const key of relevantKeys) {
        const value = config[key];
        if (typeof value === 'string') {
            const varName = librechatDataProvider.extractVariableName(value);
            if (varName) {
                authFields.push(varName);
            }
        }
    }
    return authFields;
}
/**
 * Loads and verifies web search authentication values
 * @param params - Authentication parameters
 * @returns Authentication result
 */
function loadWebSearchAuth({ userId, webSearchConfig, loadAuthValues, throwError = true, }) {
    var _a, _b, _c, _d;
    return __awaiter(this, void 0, void 0, function* () {
        let authenticated = true;
        const authResult = {};
        /** Type-safe iterator for the category-service combinations */
        function checkAuth(category) {
            return __awaiter(this, void 0, void 0, function* () {
                let isUserProvided = false;
                // Check if a specific service is specified in the config
                let specificService;
                if (category === librechatDataProvider.SearchCategories.PROVIDERS && (webSearchConfig === null || webSearchConfig === void 0 ? void 0 : webSearchConfig.searchProvider)) {
                    specificService = webSearchConfig.searchProvider;
                }
                else if (category === librechatDataProvider.SearchCategories.SCRAPERS && (webSearchConfig === null || webSearchConfig === void 0 ? void 0 : webSearchConfig.scraperType)) {
                    specificService = webSearchConfig.scraperType;
                }
                else if (category === librechatDataProvider.SearchCategories.RERANKERS && (webSearchConfig === null || webSearchConfig === void 0 ? void 0 : webSearchConfig.rerankerType)) {
                    specificService = webSearchConfig.rerankerType;
                }
                // If a specific service is specified, only check that one
                const services = specificService
                    ? [specificService]
                    : Object.keys(webSearchAuth[category]);
                for (const service of services) {
                    // Skip if the service doesn't exist in the webSearchAuth config
                    if (!webSearchAuth[category][service]) {
                        continue;
                    }
                    const serviceConfig = webSearchAuth[category][service];
                    // Split keys into required and optional
                    const requiredKeys = [];
                    const optionalKeys = [];
                    for (const key in serviceConfig) {
                        const typedKey = key;
                        if (serviceConfig[typedKey] === 1) {
                            requiredKeys.push(typedKey);
                        }
                        else if (serviceConfig[typedKey] === 0) {
                            optionalKeys.push(typedKey);
                        }
                    }
                    if (requiredKeys.length === 0)
                        continue;
                    const requiredAuthFields = extractWebSearchEnvVars({
                        keys: requiredKeys,
                        config: webSearchConfig,
                    });
                    const optionalAuthFields = extractWebSearchEnvVars({
                        keys: optionalKeys,
                        config: webSearchConfig,
                    });
                    if (requiredAuthFields.length !== requiredKeys.length)
                        continue;
                    const allKeys = [...requiredKeys, ...optionalKeys];
                    const allAuthFields = [...requiredAuthFields, ...optionalAuthFields];
                    const optionalSet = new Set(optionalAuthFields);
                    try {
                        const authValues = yield loadAuthValues({
                            userId,
                            authFields: allAuthFields,
                            optional: optionalSet,
                            throwError,
                        });
                        let allFieldsAuthenticated = true;
                        for (let j = 0; j < allAuthFields.length; j++) {
                            const field = allAuthFields[j];
                            const value = authValues[field];
                            const originalKey = allKeys[j];
                            if (originalKey)
                                authResult[originalKey] = value;
                            if (!optionalSet.has(field) && !value) {
                                allFieldsAuthenticated = false;
                                break;
                            }
                            if (!isUserProvided && process.env[field] !== value) {
                                isUserProvided = true;
                            }
                        }
                        if (!allFieldsAuthenticated) {
                            continue;
                        }
                        if (category === librechatDataProvider.SearchCategories.PROVIDERS) {
                            authResult.searchProvider = service;
                        }
                        else if (category === librechatDataProvider.SearchCategories.SCRAPERS) {
                            authResult.scraperType = service;
                        }
                        else if (category === librechatDataProvider.SearchCategories.RERANKERS) {
                            authResult.rerankerType = service;
                        }
                        return [true, isUserProvided];
                    }
                    catch (_a) {
                        continue;
                    }
                }
                return [false, isUserProvided];
            });
        }
        const categories = [
            librechatDataProvider.SearchCategories.PROVIDERS,
            librechatDataProvider.SearchCategories.SCRAPERS,
            librechatDataProvider.SearchCategories.RERANKERS,
        ];
        const authTypes = [];
        for (const category of categories) {
            const [isCategoryAuthenticated, isUserProvided] = yield checkAuth(category);
            if (!isCategoryAuthenticated) {
                authenticated = false;
                authTypes.push([category, librechatDataProvider.AuthType.USER_PROVIDED]);
                continue;
            }
            authTypes.push([category, isUserProvided ? librechatDataProvider.AuthType.USER_PROVIDED : librechatDataProvider.AuthType.SYSTEM_DEFINED]);
        }
        authResult.safeSearch = (_a = webSearchConfig === null || webSearchConfig === void 0 ? void 0 : webSearchConfig.safeSearch) !== null && _a !== void 0 ? _a : librechatDataProvider.SafeSearchTypes.MODERATE;
        authResult.scraperTimeout =
            (_d = (_b = webSearchConfig === null || webSearchConfig === void 0 ? void 0 : webSearchConfig.scraperTimeout) !== null && _b !== void 0 ? _b : (_c = webSearchConfig === null || webSearchConfig === void 0 ? void 0 : webSearchConfig.firecrawlOptions) === null || _c === void 0 ? void 0 : _c.timeout) !== null && _d !== void 0 ? _d : 7500;
        authResult.firecrawlOptions = webSearchConfig === null || webSearchConfig === void 0 ? void 0 : webSearchConfig.firecrawlOptions;
        return {
            authTypes,
            authResult,
            authenticated,
        };
    });
}

exports.BasicToolEndHandler = BasicToolEndHandler;
exports.DEFAULT_RETENTION_HOURS = DEFAULT_RETENTION_HOURS;
exports.ErrorController = ErrorController;
exports.FlowStateManager = FlowStateManager;
exports.MAX_RETENTION_HOURS = MAX_RETENTION_HOURS;
exports.MCPConnection = MCPConnection;
exports.MCPManager = MCPManager;
exports.MCPOAuthHandler = MCPOAuthHandler;
exports.MCPTokenStorage = MCPTokenStorage;
exports.MIN_RETENTION_HOURS = MIN_RETENTION_HOURS;
exports.Tokenizer = TokenizerSingleton;
exports.agentAvatarSchema = agentAvatarSchema;
exports.agentBaseResourceSchema = agentBaseResourceSchema;
exports.agentBaseSchema = agentBaseSchema;
exports.agentCreateSchema = agentCreateSchema;
exports.agentFileResourceSchema = agentFileResourceSchema;
exports.agentSupportContactSchema = agentSupportContactSchema;
exports.agentToolResourcesSchema = agentToolResourcesSchema;
exports.agentUpdateSchema = agentUpdateSchema;
exports.agentsConfigSetup = agentsConfigSetup;
exports.buildPromptGroupFilter = buildPromptGroupFilter;
exports.checkAccess = checkAccess;
exports.checkAgentPermissionsMigration = checkAgentPermissionsMigration;
exports.checkEmailConfig = checkEmailConfig;
exports.checkPluginAuth = checkPluginAuth;
exports.checkPromptCacheSupport = checkPromptCacheSupport;
exports.checkPromptPermissionsMigration = checkPromptPermissionsMigration;
exports.configureReasoning = configureReasoning;
exports.constructAzureURL = constructAzureURL;
exports.convertJsonSchemaToZod = convertJsonSchemaToZod;
exports.convertMCPToolToPlugin = convertMCPToolToPlugin;
exports.convertMCPToolsToPlugins = convertMCPToolsToPlugins;
exports.convertWithResolvedRefs = convertWithResolvedRefs;
exports.createAxiosInstance = createAxiosInstance;
exports.createEmptyPromptGroupsResponse = createEmptyPromptGroupsResponse;
exports.createFetch = createFetch;
exports.createHandleLLMNewToken = createHandleLLMNewToken;
exports.createHandleOAuthToken = createHandleOAuthToken;
exports.createMemoryCallback = createMemoryCallback;
exports.createMemoryProcessor = createMemoryProcessor;
exports.createMemoryTool = createMemoryTool;
exports.createRun = createRun;
exports.createSetBalanceConfig = createSetBalanceConfig;
exports.createStreamEventHandlers = createStreamEventHandlers;
exports.createTempChatExpirationDate = createTempChatExpirationDate;
exports.decrypt = decrypt;
exports.decryptV2 = decryptV2;
exports.decryptV3 = decryptV3;
exports.deleteMistralFile = deleteMistralFile;
exports.detectOAuthRequirement = detectOAuthRequirement;
exports.encrypt = encrypt;
exports.encryptV2 = encryptV2;
exports.encryptV3 = encryptV3;
exports.ensureCollectionExists = ensureCollectionExists;
exports.ensureRequiredCollectionsExist = ensureRequiredCollectionsExist;
exports.extractLibreChatParams = extractLibreChatParams;
exports.extractWebSearchEnvVars = extractWebSearchEnvVars;
exports.filterAccessibleIdsBySharedLogic = filterAccessibleIdsBySharedLogic;
exports.filterUniquePlugins = filterUniquePlugins;
exports.findMatchingPattern = findMatchingPattern;
exports.findOpenIDUser = findOpenIDUser;
exports.formatContentStrings = formatContentStrings;
exports.formatPromptGroupsResponse = formatPromptGroupsResponse;
exports.genAzureChatCompletion = genAzureChatCompletion;
exports.genAzureEndpoint = genAzureEndpoint;
exports.generateCheckAccess = generateCheckAccess;
exports.generateShortLivedToken = generateShortLivedToken;
exports.getAccessToken = getAccessToken;
exports.getAzureCredentials = getAzureCredentials;
exports.getBalanceConfig = getBalanceConfig;
exports.getClaudeHeaders = getClaudeHeaders;
exports.getCustomEndpointConfig = getCustomEndpointConfig;
exports.getFileBasename = getFileBasename;
exports.getGoogleConfig = getGoogleConfig;
exports.getImageBasename = getImageBasename;
exports.getLLMConfig = getLLMConfig;
exports.getModelMaxOutputTokens = getModelMaxOutputTokens;
exports.getModelMaxTokens = getModelMaxTokens;
exports.getModelTokenValue = getModelTokenValue;
exports.getOpenAIConfig = getOpenAIConfig;
exports.getOpenAILLMConfig = getOpenAILLMConfig;
exports.getRandomValues = getRandomValues;
exports.getReasoningKey = getReasoningKey;
exports.getSafetySettings = getSafetySettings;
exports.getSignedUrl = getSignedUrl;
exports.getTempChatRetentionHours = getTempChatRetentionHours;
exports.getToolkitKey = getToolkitKey;
exports.getTransactionsConfig = getTransactionsConfig;
exports.getUserMCPAuthMap = getUserMCPAuthMap;
exports.getWebSearchKeys = getWebSearchKeys;
exports.handleError = handleError;
exports.hasCustomUserVars = hasCustomUserVars;
exports.hashBackupCode = hashBackupCode;
exports.initializeOpenAI = initializeOpenAI;
exports.inputSchema = inputSchema;
exports.isEnabled = isEnabled;
exports.isMemoryEnabled = isMemoryEnabled;
exports.isUserProvided = isUserProvided;
exports.knownOpenAIParams = knownOpenAIParams;
exports.loadCustomEndpointsConfig = loadCustomEndpointsConfig;
exports.loadDefaultInterface = loadDefaultInterface;
exports.loadMemoryConfig = loadMemoryConfig;
exports.loadServiceKey = loadServiceKey;
exports.loadWebSearchAuth = loadWebSearchAuth;
exports.loadWebSearchConfig = loadWebSearchConfig;
exports.loadYaml = loadYaml;
exports.logAgentMigrationWarning = logAgentMigrationWarning;
exports.logAxiosError = logAxiosError;
exports.logHeaders = logHeaders;
exports.logPromptMigrationWarning = logPromptMigrationWarning;
exports.markPublicPromptGroups = markPublicPromptGroups;
exports.matchModelName = matchModelName;
exports.math = math;
exports.maxOutputTokensMap = maxOutputTokensMap;
exports.maxTokensMap = maxTokensMap;
exports.mcpToolPattern = mcpToolPattern;
exports.memoryInstructions = memoryInstructions;
exports.modelMaxOutputs = modelMaxOutputs;
exports.modelSchema = modelSchema;
exports.normalizeEndpointName = normalizeEndpointName;
exports.normalizeHttpError = normalizeHttpError;
exports.normalizeServerName = normalizeServerName;
exports.oaiToolkit = oaiToolkit;
exports.optionalChainWithEmptyCheck = optionalChainWithEmptyCheck;
exports.parseText = parseText;
exports.parseTextNative = parseTextNative;
exports.performOCR = performOCR;
exports.primeResources = primeResources;
exports.processAudioFile = processAudioFile;
exports.processMCPEnv = processMCPEnv;
exports.processMemory = processMemory;
exports.processModelData = processModelData;
exports.processTextWithTokenLimit = processTextWithTokenLimit;
exports.refreshAccessToken = refreshAccessToken;
exports.resolveHeaders = resolveHeaders;
exports.resolveJsonSchemaRefs = resolveJsonSchemaRefs;
exports.safeStringify = safeStringify;
exports.sanitizeFilename = sanitizeFilename;
exports.sanitizeModelName = sanitizeModelName;
exports.sendEvent = sendEvent;
exports.skipAgentCheck = skipAgentCheck;
exports.tiktokenModels = tiktokenModels;
exports.updateInterfacePermissions = updateInterfacePermissions;
exports.uploadAzureMistralOCR = uploadAzureMistralOCR;
exports.uploadDocumentToMistral = uploadDocumentToMistral;
exports.uploadGoogleVertexMistralOCR = uploadGoogleVertexMistralOCR;
exports.uploadMistralOCR = uploadMistralOCR;
exports.validateAgentModel = validateAgentModel;
exports.webSearchAuth = webSearchAuth;
exports.webSearchKeys = webSearchKeys;
exports.ytToolkit = ytToolkit;
//# sourceMappingURL=index.js.map
