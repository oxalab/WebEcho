import type { CrawlConfig } from "../config/types";

export interface ParsedUrl {
    original: string;
    normalized: string;
    protocol: string;
    hostname: string;
    port: string;
    pathname: string;
    search: string;
    hash: string;
}

export interface PageUrl extends ParsedUrl{
    depth: number;
    parentId?: string;
}


export type AssetType = 
    | "html"
    | "css"
    | "js"
    | "image"
    | "font"
    | "media"
    | "api"
    | "document"
    | "unknown"

export interface Asset {
    url: string;
    type: AssetType;
    mimeType: string;
    size: number;
    hash?: string;
    content?: Buffer | string;
    headers?: Record<string, string>;
    statusCode?: number;
}

export interface DownloadedAsset extends Asset {
    localPath: string;
    hash: string;
    downloadedAt: Date;
}

// ——————————————— Pages——————————————
export interface Page {
    url: PageUrl;
    html: string;
    assets: Asset[];
    links: string[];
    spaRoutes: string[];
    title?: string;
    timestamp: Date;
} 

export interface CapturedPage extends Page {
    localPath: string;
    assets: DownloadedAsset[];
}

// —————————————————— Network ————————————————————

export interface NetworkRequest {
    id: string;
    url: string;
    method: string;
    type: AssetType;
    mimeType: string;
    headers: Record<string, string>;
    timestamp: Date;
}

export interface NetworkResponse extends NetworkRequest {
    statusCode: number;
    size: number;
    body?: Buffer | string;
    timing?: {
        startTime: number;
        endTime: number;
        duration: number;
    };
}

//——————————————————— Crawler ——————————————————————

export interface CrawlContext {
    baseUrl: string;
    outputDir: string;
    config: CrawlConfig;
    visited: Set<string>;
    queued: Set<string>;
    pages: CapturedPage[];
    startTime: Date;
}

export interface CrawlResult {
    pages: CapturedPage[];
    assets: DownloadedAsset[];
    stats: CrawlStats;
    duration: number;
  }
  
  export interface CrawlStats {
    pagesTotal: number;
    pagesSuccessful: number;
    pagesFailed: number;
    assetsTotal: number;
    assetsSuccessful: number;
    assetsFailed: number;
    bytesDownloaded: number;
  }

  // ==================== Queue ====================

  export interface QueueItem {
    url: PageUrl;
    priority: number;
    retryCount: number;
  }
  
  // ==================== Storage ====================
  
  export interface StorageStats {
    filesCreated: number;
    totalSize: number;
    duplicatesSkipped: number;
  }
  
  export interface FileManifest {
    version: string;
    baseUrl: string;
    generatedAt: string;
    pages: Array<{
      url: string;
      path: string;
    }>;
    assets: Array<{
      url: string;
      path: string;
      hash: string;
    }>;
  }
  
  // ==================== Browser ====================
  
  export interface BrowserConfig {
    headless: boolean;
    userAgent?: string;
    viewport: {
      width: number;
      height: number;
    };
    timeout: number;
    waitForSelector?: string;
    waitForIdle?: number;
  }
  
  export interface NavigationResult {
    url: string;
    html: string;
    statusCode: number;
    title: string;
    screenshot?: Buffer;
  }
  
  export interface SpaNavigationEvent {
    type: "pushState" | "replaceState" | "popstate" | "click";
    url: string;
    timestamp: number;
  }
  
  // ==================== Auth ====================
  
  export interface AuthConfig {
    type?: "basic" | "bearer" | "cookie" | "form" | "none";
    credentials?: {
      username?: string;
      password?: string;
      token?: string;
      cookies?: Array<{ name: string; value: string; domain?: string }>;
    };
    loginUrl?: string;
    loginSelectors?: {
      usernameField?: string;
      passwordField?: string;
      submitButton?: string;
    };
  }
  
  // ==================== Rewriter ====================
  
  export interface RewriteRule {
    pattern: RegExp | string;
    replacement: string;
  }
  
  export interface RewriteContext {
    baseUrl: string;
    outputDir: string;
    assetMap: Map<string, string>;
    pageMap: Map<string, string>;
  }
  
  // ==================== Robots.txt ====================
  
  export interface RobotsRule {
    userAgent: string;
    allow: string[];
    disallow: string[];
    crawlDelay?: number;
  }
  
  // ==================== Errors ====================
  
  export class CrawlError extends Error {
    constructor(
      message: string,
      public url: string,
      public code: string,
      public originalError?: unknown
    ) {
      super(message);
      this.name = "CrawlError";
    }
  }
  
  export class NetworkError extends CrawlError {
    constructor(message: string, url: string, originalError?: unknown) {
      super(message, url, "NETWORK_ERROR", originalError);
      this.name = "NetworkError";
    }
  }
  
  export class ParseError extends CrawlError {
    constructor(message: string, url: string, originalError?: unknown) {
      super(message, url, "PARSE_ERROR", originalError);
      this.name = "ParseError";
    }
  }
  
  export class StorageError extends CrawlError {
    constructor(message: string, url: string, originalError?: unknown) {
      super(message, url, "STORAGE_ERROR", originalError);
      this.name = "StorageError";
    }
  }
  
