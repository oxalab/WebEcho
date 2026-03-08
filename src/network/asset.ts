import type { Asset, NetworkResponse } from "../types/index.js";
import { determineAssetType, getMimeType } from "./interceptor.js";


// Asset Factory

/**
 * Create an Asset from NetworkResponse
 */
export async function createAsset(response: NetworkResponse): Promise<Asset> {
    return {
        url: response.url,
        type: determineAssetType(response.url, response.mimeType),
        mimeType: response.mimeType,
        size: response.size,
        hash: response.body ? await createHash(response.body) : undefined,
        content: response.body,
        headers: response.headers,
        statusCode: response.statusCode,
    };
}

/**
 * Create an Asset from basic info
 */
export async function createBasicAsset(
    url: string,
    content: Buffer | string,
    mimeType?: string
): Promise<Asset> {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);

    return {
        url,
        type: determineAssetType(url, mimeType),
        mimeType: mimeType ?? getMimeType(url),
        size: buffer.length,
        hash: await createHash(buffer),
        content: buffer,
    };
}

// Hash Utility
/**
 * Create a hash for content deduplication
 *
 * Use Bun's built-in crypto for fast hashing
 */
export async function createHash(content: Buffer | string): Promise<string> {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(buffer));
    const hashArray = new Uint8Array(hashBuffer);
    const hashHex = Array.from(hashArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return hashHex.slice(0, 16);
}

/**
 * Create a filename and hash extension
 */
export function createFilename(url: string, hash: string): string {
    const ext = getExtension(url);
    return ext ? `${hash}.${ext}` : hash;
}

/**
 * Get file extension from URL
 */
function getExtension(url: string): string {
    const cleanUrl = url.split(/[?#]/)[0];
    const ext = cleanUrl?.split(".").pop()?.toLowerCase();
    return ext ?? "";
}


// Asset Size Utility

/**
 * Format bytes for human readable output
 */
export function formatBytes(bytes: number): string {
    if(bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes/Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Check if asset size exceeds limit
 */
export function exceedsLimit(bytes: number, maxBytes: number): boolean {
    return bytes > maxBytes;
}

// Asset URL Utilities
/**
 * Make URL absolute based on base URL
 */
export function makeAbsolute(url: string, baseUrl: string): string {
    if(url.startsWith("http://") || url.startsWith("https://")){
        return url;
    }

    if(url.startsWith("//")){
        const base = new URL(baseUrl);
        return `${base.protocol}${url}`;
    }

    const base = new URL(baseUrl);
    return new URL(url, base.origin + base.pathname).href;
}

/**
 * Check if URL is same origin
 */
export function isSameOrigin(url1: string, url2: string): boolean {
    try{
        const u1 = new URL(url1);
        const u2 = new URL(url2);
        return u1.origin === u2.origin;
    } catch {
        return false;
    }
}

/**
 * Remove query string and hash from URL
 */
export function cleanUrl(url: string): string {
    const uri = url.split(/[?#]/)[0];
    return uri!;
}

/**
 * Normalize URL for comparison
 */
export function normalizeUrl(url: string): string {
    let normalized = url.replace(/\/$/, "");
    normalized = normalized.replace(/:80$/, "");
    normalized = normalized.replace(/:443$/, "");
    return normalized;
}