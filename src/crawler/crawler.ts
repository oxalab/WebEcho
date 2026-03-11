// =====================================================
// WebEcho - Main Crawler
// =====================================================

import type {
  CrawlContext,
  CrawlResult,
  CrawlStats,
  Page,
  PageUrl,
  Asset,
} from "../types/index.js";
import type { CrawlConfig } from "../config/types.js";
import type { BrowserEngine } from "../browser/engine.js";
import type { StorageManager } from "../storage/manager.js";
import type { NetworkInterceptor } from "../network/interceptor.js";
import type { HtmlRewriter } from "../rewriter/html.js";
import type { ProgressReporter } from "../cli/progress.js";
import pLimit from "p-limit";
import { UrlQueue, parsePageUrl, isSameDomain, shouldCrawl } from "./queue.js";
import { CrawlError, NetworkError, ParseError } from "../types/index.js";

type Limit = ReturnType<typeof pLimit>;

// ============= Main Crawler ================

/**
 * Orchestrates the crawling process:
 * 1. Manage URL queue
 * 2. Launch Browser
 * 3. Navigate to pages
 * 4. Extract links and assets
 * 5. Store results
 */
export class Crawler {
  private config: CrawlConfig;
  private browser: BrowserEngine;
  private storage: StorageManager;
  private interceptor: NetworkInterceptor;
  private rewriter: HtmlRewriter;
  private progress: ProgressReporter;
  private queue: UrlQueue;
  private limit: Limit;

  constructor(
    config: CrawlConfig,
    browser: BrowserEngine,
    storage: StorageManager,
    interceptor: NetworkInterceptor,
    rewriter: HtmlRewriter,
    progress: ProgressReporter
  ) {
    this.config = config;
    this.browser = browser;
    this.storage = storage;
    this.interceptor = interceptor;
    this.rewriter = rewriter;
    this.progress = progress;
    this.queue = new UrlQueue(config.maxDepth, config.maxPages);
    this.limit = pLimit(config.concurrency);
  }

  // Main Execution

  async crawl(initiateUrl: string): Promise<CrawlResult> {
    const startTime = Date.now();
    await this.storage.init();

    const startUrl = parsePageUrl(initiateUrl, this.config.baseUrl, 0);
    this.queue.add(startUrl);

    // Collect all task promises to properly await them
    const taskPromises: Promise<void>[] = [];

    while (!this.queue.isEmpty()) {
      const item = this.queue.next();
      if (!item) break;

      // Queue task and collect its promise
      taskPromises.push(this.limit(() => this.processPage(item.url)));
    }

    // Wait for ALL tasks to complete
    await Promise.all(taskPromises);

    const duration = (Date.now() - startTime) / 1000;
    return {
      pages: await this.storage.getCapturedPages(),
      assets: await this.storage.getDownloadedAssets(),
      stats: this.buildStats(),
      duration,
    };
  }

  // ================ Page Processing =============

  private async processPage(pageUrl: PageUrl): Promise<void> {
    const url = pageUrl.original;
    try {
      this.progress.pageVisitStart(url);

      const result = await this.browser.navigate(url);
      if (result.statusCode >= 400) {
        throw new NetworkError(`HTTP ${result.statusCode}`, url);
      }

      const links = await this.browser.extractLinks(this.config.baseUrl);
      for (const link of links) {
        if (this.config.sameDomainOnly && !isSameDomain(link, this.config.baseUrl)) {
          continue;
        }

        if (!shouldCrawl(link, this.config.include, this.config.exclude)) {
          continue;
        }
        const parsedLink = parsePageUrl(link, this.config.baseUrl, pageUrl.depth + 1, url);
        if (this.queue.add(parsedLink)) {
          this.progress.pageQueued(link, this.queue.size());
        }
      }

      const assets = this.interceptor.getAssets();

      console.log(`[Crawler] Found ${assets.length} assets from interceptor`);
      console.log(`[Crawler] captureAssets: ${this.config.captureAssets}`);

      // Download assets FIRST so we know their local paths for rewriting
      if (this.config.captureAssets) {
        await this.downloadAssets(assets, url);
        // Note: CSS and JS rewriting is done once after all pages are crawled
        // This ensures all cross-references are resolved correctly
      }

      const page: Page = {
        url: pageUrl,
        html: result.html,
        assets,
        links,
        spaRoutes: await this.browser.getSpaNavigations(),
        title: result.title,
        timestamp: new Date(),
      };
      await this.storage.storePage(page, this.rewriter);

      this.progress.pageVisitSuccess(url, assets.length);
    } catch (error) {
      this.progress.pageVisitFailed(url, (error as Error).message);
      throw new CrawlError(
        `Failed to crawl ${url}`,
        url,
        "CRAWL_ERROR",
        error
      );
    }
  }

  // =================== Asset Download ====================

  private async downloadAssets(assets: Asset[], pageUrl: string): Promise<void> {
    console.log(`[downloadAssets] Total assets: ${assets.length}`);
    console.log(`[downloadAssets] Config assetTypes:`, Array.from(this.config.assetTypes));
    console.log(`[downloadAssets] Asset types in assets:`, assets.map(a => ({ url: a.url, type: a.type })));

    const filteredAssets = assets.filter((asset) =>
      this.config.assetTypes.has(asset.type)
    );

    console.log(`[downloadAssets] Filtered to: ${filteredAssets.length} assets`);

    const remainingAssets = this.config.maxAssets - (await this.storage.getAssetCount());
    const toDownload = filteredAssets.slice(0, remainingAssets);

    console.log(`[downloadAssets] toDownload length: ${toDownload.length}`);

    for (const asset of toDownload) {
      try {
        console.log(`[downloadAssets] Processing: ${asset.url} (${asset.type})`);
        this.progress.assetDownloadStart(asset.url);
        if (await this.storage.hasAsset(asset.url)) {
          this.progress.assetSkipped(asset.url, "duplicate");
          continue;
        }
        const downloaded = await this.storage.storeAsset(asset);
        console.log(`[downloadAssets] Stored: ${downloaded.localPath}`);
        this.progress.assetDownloadSuccess(asset.url, downloaded.size);
      } catch (error) {
        console.log(`[downloadAssets] Error: ${(error as Error).message}`);
        this.progress.assetDownloadFailed(asset.url, (error as Error).message);
      }
    }
  }

  // ============= Stats ==============
  private buildStats(): CrawlStats {
    return {
      pagesTotal: this.queue.visitedCount(),
      pagesSuccessful: this.queue.visitedCount(),
      pagesFailed: 0,
      assetsTotal: 0,
      assetsSuccessful: 0,
      assetsFailed: 0,
      bytesDownloaded: 0,
    };
  }
}

// ============= Robots.txt Handler ================

/**
 * Check if URL is allowed by robots.txt
 */
export async function checkRobotsTxt(
  baseUrl: string,
  userAgent: string = "*"
): Promise<(url: string) => boolean> {
  try {
    const robotUrl = new URL("/robots.txt", baseUrl).href;
    const response = await fetch(robotUrl);
    if (!response.ok) {
      return () => true;
    }

    const text = await response.text();
    const rules = parseRobotsTxt(text, userAgent);
    return (url: string) => {
      const path = new URL(url).pathname;
      return isAllowedByRules(path, rules);
    };
  } catch {
    return () => true;
  }
}

/**
 * Parse robots.txt content
 */
function parseRobotsTxt(
  content: string,
  userAgent: string
): { allow: string[]; disallow: string[] } {
  const rules: { allow: string[]; disallow: string[] } = { allow: [], disallow: [] };
  let currentAgent = "";
  let isMatchingAgent = false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [key, ...valueParts] = trimmed.split(":");
    const value = valueParts.join(":").trim().toLowerCase();

    if (key?.toLowerCase() === "user-agent") {
      currentAgent = value;
      isMatchingAgent = value === "*" || value === userAgent.toLowerCase();
    } else if (isMatchingAgent) {
      if (key?.toLowerCase() === "allow") {
        rules.allow.push(value);
      } else if (key?.toLowerCase() === "disallow") {
        rules.disallow.push(value);
      }
    }
  }
  return rules;
}

/**
 * Check if path is allowed by rules
 */
function isAllowedByRules(
  path: string,
  rules: { allow: string[]; disallow: string[] }
): boolean {
  // Check disallow first
  for (const pattern of rules.disallow) {
    if (pattern === "" || pattern === "/") continue;
    if (pathMatchesPattern(path, pattern)) {
      // Check if there's a matching allow rule (more specific)
      for (const allowPattern of rules.allow) {
        if (pathMatchesPattern(path, allowPattern)) {
          return true;
        }
      }
      return false;
    }
  }

  return true;
}

/**
 * Check if path matches robots.txt pattern
 */
function pathMatchesPattern(path: string, pattern: string): boolean {
  // Convert robots.txt pattern to regex
  // * matches any sequence
  // $ matches end of string
  const regex = pattern.replace(/\*/g, ".*").replace(/\$/g, "$");

  return new RegExp(`^${regex}`).test(path);
}
