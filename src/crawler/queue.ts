import type { PageUrl, QueueItem } from "../types/index.js";

// =============== URL Queue =================

/**
 * Priority queue for managing URLs to crawl.
 * 
 * Features:
 * - Priorirty-based ordering
 * - Deduplication
 * - Depth Tracking
 * - Retry Support
 */

export class UrlQueue {
    private queue: QueueItem[] = [];
    private visited: Set<string> = new Set();
    private queued: Set<string> = new Set();
    private maxDepth: number;
    private maxPages: number;

    constructor(maxDepth: number, maxPages: number) {
        this.maxDepth = maxDepth;
        this.maxPages = maxPages;
    }

    // ================ Queue Operations =================

    /**
     * Add a URL to the queue
     */
    add(url: PageUrl, priority: number = 0): boolean {
        if(url.depth > this.maxDepth){
            return false;
        }

        if(this.queue.length + this.visited.size >= this.maxPages){
            return false;
        }
        const normalized = this.normalize(url.original);
        if(this.visited.has(normalized) || this.queued.has(normalized)){
            return false;
        }
        this.queue.push({
            url,
            priority,
            retryCount: 0,
        });
        this.queued.add(normalized);
        this.sort();
        return true;
    }

    /**
     * Add multiple URLs
     */
    addMany(urls: PageUrl[], priority: number = 0): number {
        let added = 0;
        for (const url of urls){ 
            if(this.add(url, priority)){
                added++;
            }
        }
        return added;
    }

    /**
     * Get next URL from queue
     */
    next(): QueueItem | undefined {
        const item = this.queue.shift();
        if (item) {
            const normalized = this.normalize(item.url.original);
            this.queued.delete(normalized);
            this.visited.add(normalized);
        }
        return item;
    }

    /**
     * Re-add a URL for retry
     */
    retry(item: QueueItem): boolean {
        if(item.retryCount >= 3){
            return false;
        }
        item.retryCount++;
        item.priority = Math.max(0, item.priority - 1);
        this.queue.push(item);
        this.sort();
        return true;
    }

    // ================ State Queries ==================

    /**
     * Check if URL has been visited
     */
    isVisited(url: string): boolean {
        return this.visited.has(this.normalize(url));
    }

    /**
     * Check if queue is empty
     */
    isEmpty(): boolean {
        return this.queue.length === 0;
    }

    /**
     * Get queue size
     */
    size(): number {
        return this.queue.length;
    }

    /**
     * Get visited count
     */
    visitedCount(): number {
        return this.visited.size;
    }

    // ==========Stats============
    getStats(): {
        queued: number;
        visited: number;
        total: number;
    } {
        return {
            queued: this.queue.length,
            visited: this.visited.size,
            total: this.queue.length + this.visited.size,
        };
    }

    // =========== Reset ===============

    /**
     * Clear all state
     */
    reset(): void {
        this.queue = [];
        this.visited.clear();
        this.queued.clear();
    }

    // ============= Private Methods =================

    private normalize(url: string): string {
        let normalized = url.split(/[?#]/)[0];
        normalized = normalized?.replace(/\/$/, "") || "";
        return normalized.toLowerCase();
    }

    private sort(): void {
        this.queue.sort((a, b) => {
            if(a.priority !== b.priority){
                return b.priority - a.priority;
            }
            return a.priority - b.url.depth;
        });
    }
}


// ============== URL Parser ==================

/**
 * Parse a URL into a PageURL object
 */
export function parsePageUrl (
    url: string,
    baseUrl: string, 
    depth: number,
    parentId?: string
): PageUrl {
    let absolute = url;
    if(!url.startsWith("http://") && !url.startsWith("https://")){
        if(url.startsWith("/")){
            const base = new URL(baseUrl);
            absolute = `${base.protocol}//${base.host}${url}`;
        }else{
            absolute = new URL(url, baseUrl).href;
        }
    }
    const parsed = new URL(absolute);
    return {
        original: absolute,
        normalized: normalizeUrl(absolute),
        protocol: parsed.protocol.replace(":", ""),
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? "443" : "80"),
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        depth,
        parentId,
    };
}

/**
 * Normalize URL for comparison
 */
export function normalizeUrl(url: string): string {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/$/, "") || "/";
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}`;
}

/**
 * Check if URL is same domain as base
 */
export function isSameDomain(url: string, baseUrl: string): boolean {
    try {
        const u1 = new URL(url);
        const u2 = new URL(baseUrl);
        return u1.hostname === u2.hostname;
    } catch (error) {
        return false;
    }
}

/**
 * Check if URL should be crawled based on filters
 */
export function shouldCrawl(
    url: string,
    include: RegExp[],
    exclude: RegExp[]
): boolean {
    // If include patterns exist, URL must match one
    if (include.length > 0) {
      const matches = include.some((pattern) => pattern.test(url));
      if (!matches) return false;
    }
  
    // URL must not match any exclude patterns
    const excluded = exclude.some((pattern) => pattern.test(url));
    if (excluded) return false;
  
    return true;
}