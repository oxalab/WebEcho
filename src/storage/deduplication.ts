import type { Asset } from "../types/index.js";

// Hash Functions

/**
 * Create a SHA-256 hash of content
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
 * Create a full SHA-256 hash
 */
export async function createFullHash(content: Buffer | string): Promise<string> {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(buffer));
    const hashArray = new Uint8Array(hashBuffer);
    const hashHex = Array.from(hashArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return hashHex;
}

/**
 * Create a hash from a URL
 * Useful for creating unique identifiers for URLs
 */
export async function createUrlHash(url: string): Promise<string> {
    const buffer = Buffer.from(url);
    const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(buffer));
    const hashArray = new Uint8Array(hashBuffer);
    const hashHex = Array.from(hashArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return hashHex.slice(0, 12);
}

// Filename generations

/**
 * Create a filename from asset URL and hash
 * Preserves original extension for content-type detection
 */
export function createFilename(url: string, hash: string): string {
    const ext = getExtension(url);
    if(!ext){
        if(url.includes("font") || url.includes("woff")){
            return `${hash}.woff`;
        }
        return hash;
    }
    return `${hash}.${ext}`
}

/**
 * Create a page filename from URL
 * Preserves path structure but replaces special chars
 */
export async function createPagePath(url: string): Promise<string> {
    try {
        const parsed = new URL(url);
        let path = parsed.pathname;
        path = path.slice(1);
        if(!path || path === "/"){
            return "index.html";
        }
        if(path.endsWith(".html") || path.endsWith(".htm")){
            return path;
        }
        if(!path.endsWith("/")){
            path += "/";
        }
        return `${path}index.html`
    } catch (error) {
        const hash = await createUrlHash(url);
        return `pages/${hash}.html`;
    }
}

// URL Utilities

/**
 * Extract file extension from URL
 */
export function getExtension(url: string): string {
    const cleanUrl = url.split(/[?#]/)[0];
    const parts = cleanUrl?.split(".");
    if (!parts || parts.length < 2) return "";
    const ext = parts[parts.length - 1]?.toLowerCase() ?? "";
    if (!/^[a-z]{1,6}$/.test(ext)) {
        return "";
    }
    return ext;
}

/**
 * Get asset type from extension URL
 */
export function getAssetType(url: string, mimeType?: string): string {
    if (mimeType) {
        if (mimeType.includes("css")) return "css";
        if (mimeType.includes("javascript")) return "js";
        if (mimeType.includes("image")) return "image";
        if (mimeType.includes("font")) return "font";
        if (mimeType.includes("json")) return "api";
    }
    // Try extension
    const ext = getExtension(url);

    const typeMap: Record<string, string> = {
        css: "css",
        js: "css",
        mjs: "js",
        png: "image",
        jpg: "image",
        jpeg: "image",
        gif: "image",
        svg: "image",
        webp: "image",
        ico: "image",
        woff: "font",
        woff2: "font",
        ttf: "font",
        otf: "font",
        eot: "font",
        json: "api",
    };

    return typeMap[ext] ?? "other";
}

// Deduplication Cache
/**
 * Simple in-memory cache for cache deduplication
 */
export class DeduplicationCache {
    private urlHashes: Map<string, string> = new Map();
    private contentHashes: Map<string, Set<string>> = new Map();
    private size = 0;
    private totalBytes = 0;

    /**
     * Check if URL has been seen
     */
    hasUrl(url: string): boolean {
        return this.urlHashes.has(url);
    }

    /**
     * Check if content hash has been seen
     */
    hasHash(hash: string): boolean {
        return this.contentHashes.has(hash);
    }

    /**
     * Get hash for URL
     */
    getHash(url: string): string | undefined {
        return this.urlHashes.get(url);
    }

    /**
     * Get all URLs with same content hash
     */
    getUrlsByHash(hash: string): string[] {
        return Array.from(this.contentHashes.get(hash) ?? []);
    }

    add(url: string, hash: string, size: number): boolean {
        if(this.urlHashes.has(url)){
            return false;
        }

        const isNewHash = !this.contentHashes.has(hash);
        this.urlHashes.set(url, hash);

        if(!this.contentHashes.has(hash)){
            this.contentHashes.set(hash, new Set());
        }
        const hashSet = this.contentHashes.get(hash);
        if (hashSet) {
            hashSet.add(url);
        }
        this.size++;
        if(isNewHash){
            this.totalBytes += size;
        }
        return isNewHash;
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        uniqueUrls: number;
        uniqueContent: number;
        duplicates: number;
        totalBytes: number;
        savedBytes: number;
    } {
        const uniqueContent = this.contentHashes.size;
        const duplicates = this.size - uniqueContent;

        // Calcuate saved bytes
        let savedBytes = 0;
        for(const [hash, urls] of this.contentHashes){
            if(urls.size > 1){
                savedBytes += (urls.size - 1) * 1024;
            }
        }

        return {
            uniqueUrls: this.size,
            uniqueContent,
            duplicates,
            totalBytes: this.totalBytes,
            savedBytes
        };
    }

    /**
     * Clear Cache
     */
    clear(): void{
        this.urlHashes.clear();
        this.contentHashes.clear();
        this.size = 0;
        this.totalBytes = 0;
    }
}
