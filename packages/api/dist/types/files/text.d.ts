/// <reference types="multer" />
import type { Request as ServerRequest } from 'express';
/**
 * Attempts to parse text using RAG API, falls back to native text parsing
 * @param {Object} params - The parameters object
 * @param {Express.Request} params.req - The Express request object
 * @param {Express.Multer.File} params.file - The uploaded file
 * @param {string} params.file_id - The file ID
 * @returns {Promise<{text: string, bytes: number, source: string}>}
 */
export declare function parseText({ req, file, file_id, }: {
    req: Pick<ServerRequest, 'user'> & {
        user?: {
            id: string;
        };
    };
    file: Express.Multer.File;
    file_id: string;
}): Promise<{
    text: string;
    bytes: number;
    source: string;
}>;
/**
 * Native JavaScript text parsing fallback
 * Simple text file reading - complex formats handled by RAG API
 * @param {Express.Multer.File} file - The uploaded file
 * @returns {{text: string, bytes: number, source: string}}
 */
export declare function parseTextNative(file: Express.Multer.File): {
    text: string;
    bytes: number;
    source: string;
};
//# sourceMappingURL=text.d.ts.map