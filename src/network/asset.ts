import type { Asset, NetworkResponse } from "../types/index.js";
import { determineAssetType, getMimeType } from "./interceptor.js";

// ==================== Content Validation ====================

/**
 * Validate that the file content matches the expected MIME type.
 * This catches cases where servers return HTML (404 pages, redirects) instead of the actual asset.
 */
function isValidContent(body: Buffer, mimeType: string, url: string): boolean {
    const header = body.slice(0, 16).toString("ascii", 0, Math.min(16, body.length));

    // Check if it's HTML (error page, redirect, hotlink protection)
    const isHtml = header.startsWith("<!") || header.startsWith("<html") || header.startsWith("<HTML");

    if (isHtml) {
        // HTML is only valid for text/html content type
        if (mimeType.includes("html")) return true;

        // For fonts, CSS, JS, images - HTML is invalid
        const invalidTypes = ["font", "css", "javascript", "image", "svg"];
        if (invalidTypes.some(t => mimeType.includes(t))) {
            return false;
        }

        // Check by file extension too
        const ext = url.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase() || "";
        if (["woff", "woff2", "ttf", "otf", "eot", "css", "js", "svg", "png", "jpg", "jpeg", "gif", "webp", "ico"].includes(ext)) {
            return false;
        }
    }

    // Validate font file signatures
    if (mimeType.includes("font") || url.match(/\.(woff|woff2|ttf|otf|eot)(?:$|[?#])/i)) {
        return isValidFontFile(body);
    }

    // Validate image file signatures
    if (mimeType.includes("image/") || url.match(/\.(png|jpg|jpeg|gif|webp|ico)(?:$|[?#])/i)) {
        return isValidImageFile(body);
    }

    return true;
}

/**
 * Check if buffer is a valid font file by checking magic bytes
 */
function isValidFontFile(buffer: Buffer): boolean {
    if (buffer.length < 4) return false;

    // WOFF: wOFF (0x774F4646)
    if (buffer[0] === 0x77 && buffer[1] === 0x4F && buffer[2] === 0x46 && buffer[3] === 0x46) return true;

    // WOFF2: wOF2 (0x774F4632)
    if (buffer[0] === 0x77 && buffer[1] === 0x4F && buffer[2] === 0x46 && buffer[3] === 0x32) return true;

    // TrueType/OpenType: 0x00010000 or OTTO
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const sfntVersion = view.getUint32(0, false);

    // 0x00010000 = TrueType
    // 0x4F54544F = "OTTO" (CFF font)
    // 0x74727565 = "true" (v1.0)
    // 0x74746366 = "ttcf" (TrueType Collection)
    return [0x00010000, 0x4F54544F, 0x74727565, 0x74746366].includes(sfntVersion);
}

/**
 * Check if buffer is a valid image file by checking magic bytes
 */
function isValidImageFile(buffer: Buffer): boolean {
    if (buffer.length < 8) return false;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;

    // GIF: GIF87a or GIF89a
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 &&
        buffer[3] === 0x38 && (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61) return true;

    // WebP: RIFF....WEBP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;

    // ICO: 00 00 01 00 or 00 00 02 00
    if (buffer[0] === 0x00 && buffer[1] === 0x00 &&
        (buffer[2] === 0x01 || buffer[2] === 0x02) && buffer[3] === 0x00) return true;

    // SVG (starts with <svg or <?xml)
    const header = buffer.slice(0, 100).toString("ascii", 0, Math.min(100, buffer.length));
    if (header.includes("<svg") || header.includes("<?xml")) return true;

    return false;
}

// ==================== Asset Factory ====================

/**
 * Create an Asset from NetworkResponse
 */
export async function createAsset(response: NetworkResponse): Promise<Asset | null> {
    // Validate that the content matches the expected type
    if (response.body) {
        const buffer = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body);
        if (!isValidContent(buffer, response.mimeType, response.url)) {
            console.warn(`[Asset] Invalid content for ${response.url} (expected ${response.mimeType}, got HTML or other)`);
            return null;
        }
    }

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