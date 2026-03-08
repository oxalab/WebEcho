
import type {
    NetworkRequest,
    NetworkResponse,
    Asset,
    AssetType
} from "../types/index.js";
import { createAsset } from './asset.js';
import * as mime from 'mime-types';

/**
 * Network Interceptor
 * Captures all network requests during page crawl.
 * 
 * This class is called by the Browser Engine when requests
 * and responses occur. It maintains a collection of all
 * captured assets for later downloading.
 */

export class NetworkInterceptor {
    private requests: Map<string, NetworkRequest> = new Map();
    private responses: Map<string, NetworkResponse> = new Map();
    private assets: Map<string, Asset> = new Map();
    private seenUrls: Set<string> = new Set();

    /**
     * Callbacks
     */
    onRequest?: (request: NetworkRequest) => void;
    onResponse?: (response: NetworkResponse) => void;

    // Event Handlers

    /**
     * Called when a network request is initiated
     */
    handleRequest(request: NetworkRequest): void {
        this.requests.set(request.id, request);
        this.onRequest?.(request);
    }
    /**
    * Called when a network response is received
    */
    async handleResponse(response: NetworkResponse): Promise<void> {
        this.responses.set(response.id, response);

        // Create asset from response
        if (this.shouldCapture(response)) {
            const asset = await createAsset(response);
            this.assets.set(asset.url, asset);
        }
        this.onResponse?.(response);
    }

    // Accessors

    /**
     * Get all captured assets
     */
    getAssets(): Asset[] {
        return Array.from(this.assets.values());
    }

    /**
     * Get assets by type
     */
    getAssetsByType(type: AssetType): Asset[] {
        return this.getAssets().filter((asset) => asset.type === type);
    }

    /**
     * Get assets by url
     */
    getAsset(url: string): Asset | undefined {
        return this.assets.get(url);
    }

    /**
     * Check if url has been seen
     */
    hasSeen(url: string): boolean {
        return this.seenUrls.has(url);
    }

    /**
    * Mark URL as seen (for deduplication)
    */
    markSeen(url: string): void {
        this.seenUrls.add(url);
    }

    /**
    * Get all requests
    */
    getRequests(): NetworkRequest[] {
        return Array.from(this.requests.values());
    }

    /**
    * Get all responses
    */
    getResponses(): NetworkResponse[] {
        return Array.from(this.responses.values());
    }

    // Filtering
    /**
     * Check if response should be captured as asset
     */
    private shouldCapture(response: NetworkResponse): boolean {
        if(response.statusCode >= 400){
            return false;
        }

        if(response.url.startsWith("data:") || response.url.startsWith("blob:")){
            return false;
        }

        if(response.url.startsWith("chrome-extension://") || response.url.startsWith("moz-extension://")) {
            return false;
        }
        return true;
    }


    // Reset
    /**
     * Clear all captured data
     */
    reset(): void {
        this.requests.clear();
        this.responses.clear();
        this.assets.clear();
        this.seenUrls.clear();
    }

    /**
     * Get Statistics
     */
    getStats(): {
        requests: number;
        responses: number;
        assets: number;
        uniqueUrls: number;
    } {
        return {
            requests: this.requests.size,
            responses: this.responses.size,
            assets: this.assets.size,
            uniqueUrls: this.seenUrls.size
        };
    }
}


// Asset Type Detector

/**
 * Determines asset type from URL and/or MIME type
 */
export function determineAssetType(
    url: string,
    mimeType?: string,
): AssetType {
    if(mimeType){
        if(mimeType.includes("html")) return "html";
        if(mimeType.includes("css")) return "css";
        if(mimeType.includes("javascript") || mimeType.includes("application/js")) return "js";
        if(mimeType.includes("json")) return "api";
        if(mimeType.includes("image/")) return "image";
        if(mimeType.includes("font/")) return "font";
        if(mimeType.includes("video/") || mimeType.includes("audio/")) return "media";
        if(mimeType.includes("application/pdf")) return "document";
    }

    // Fallback to extension
    const ext = getExtension(url);
    const typeMap: Record<string, AssetType> = {
        html: "html",
        htm: "html",
        css: "css",
        js: "js",
        mjs: "js",
        json: "api",
        png: "image",
        jpg: "image",
        jpeg: "image",
        gif: "image",
        svg: "image",
        webp: "image",
        ico: "image",
        bmp: "image",
        woff: "font",
        woff2: "font",
        ttf: "font",
        otf: "font",
        eot: "font",
        mp4: "media",
        webm: "media",
        ogg: "media",
        mp3: "media",
        wav: "media",
        pdf: "document",
        xml: "document",
    };
    return typeMap[ext] ?? "unknown";
}

/**
 * Extract file extension from URL
 */
function getExtension(url: string): string {
    const cleanUrl = url.split(/[?#]/)[0];
    const ext = cleanUrl?.split(".").pop()?.toLowerCase();
    return ext ?? "";
}

/**
 * Get MIME type from URL
 */
export function getMimeType(url: string): string {
    const ext = getExtension(url);
    const mimeType = mime.lookup(ext);
    return mimeType || "application/octet-stream";
}

/**
/* Check if URL is an image
*/
export function isImage(url: string): boolean {
    const type = determineAssetType(url);
    return type === "image";
}
  
/**
* Check if URL is a font
*/
export function isFont(url: string): boolean {
    const type = determineAssetType(url);
    return type === "font";
}
  
/**
* Check if URL is an API endpoint
*/
export function isApiEndpoint(url: string): boolean {
    return url.includes("/api/") || url.includes("/v1/") || url.includes("/v2/");
}