// =====================================================
// WebEcho - Main Orchestrator
// =====================================================

import type { CrawlConfig } from "../config/types.js";
import type { CrawlResult } from "../types/index.js";
import type { ProgressReporter } from "../cli/progress.js";
import { BrowserEngine } from "../browser/engine.js";
import { NetworkInterceptor } from "../network/interceptor.js";
import { Crawler, checkRobotsTxt } from "../crawler/crawler.js";
import { StorageManager } from "../storage/manager.js";
import { HtmlRewriter } from "../rewriter/html.js";
import type { RewriteContext } from "../types/index.js";

// ==================== WebEcho Main Class ====================

/**
 * Main orchestrator for the WebEcho crawler (browser-based).
 *
 * Coordinates all modules:
 * - Browser Engine (Playwright)
 * - Network Interceptor
 * - Crawler (queue management)
 * - Storage Manager (file operations)
 * - Rewriters (HTML/CSS)
 */
export class WebEcho {
  private config: CrawlConfig;
  private progress: ProgressReporter;
  private storage: StorageManager;
  private interceptor: NetworkInterceptor;
  private rewriter: HtmlRewriter;
  private browser: BrowserEngine | null = null;
  private crawler: Crawler | null = null;

  constructor(config: CrawlConfig, progress: ProgressReporter) {
    this.config = config;
    this.progress = progress;

    // Create rewrite context first (needed by StorageManager)
    const rewriteContext: RewriteContext = {
      baseUrl: config.baseUrl,
      outputDir: config.outputDir,
      assetMap: new Map(),
      pageMap: new Map(),
    };

    // Initialize modules
    this.storage = new StorageManager(config.outputDir, rewriteContext);
    this.interceptor = new NetworkInterceptor();
    this.rewriter = new HtmlRewriter(rewriteContext);
  }

  // ==================== Main Execution ====================

  /**
   * Run the crawler
   */
  async run(): Promise<CrawlResult> {
    // Check robots.txt
    if (this.config.respectRobots) {
      await checkRobotsTxt(this.config.baseUrl, "WebEcho");
    }

    // Initialize browser
    this.progress.browserLaunch();
    this.browser = new BrowserEngine(this.config.browser, this.interceptor);
    await this.browser.launch();

    try {
      // Handle authentication if configured
      await this.handleAuthentication();

      // Initialize crawler
      this.crawler = new Crawler(
        this.config,
        this.browser,
        this.storage,
        this.interceptor,
        this.rewriter,
        this.progress
      );

      // Run crawl
      const result = await this.crawler.crawl(this.config.baseUrl);

      // After ALL pages and assets are downloaded, do final rewrite pass
      // This ensures cross-references between files are properly resolved
      if (this.config.captureAssets) {
        this.progress.assetRewriteStart();
        await this.storage.rewriteCssFiles();
        await this.storage.rewriteJsFiles();
        this.progress.assetRewriteComplete();
      }

      // Generate manifest
      if (this.config.generateManifest) {
        const manifest = await this.storage.generateManifest(this.config.baseUrl);
        await this.storage.writeManifest(manifest);
      }

      return result;
    } finally {
      // Always cleanup, even if error occurs
      await this.cleanup();
    }
  }

  // ==================== Authentication ====================

  private async handleAuthentication(): Promise<void> {
    if (!this.browser) return;

    const auth = this.config.auth;

    switch (auth.type) {
      case "basic":
        // Basic auth is handled at request level
        // Would need to add credentials to browser context
        break;

      case "bearer":
        if (auth.credentials?.token) {
          await this.browser.setBearerToken(auth.credentials.token);
        }
        break;

      case "cookie":
        if (auth.credentials?.cookies) {
          await this.browser.setCookies(auth.credentials.cookies);
        }
        break;

      case "form":
        if (
          auth.credentials?.username &&
          auth.credentials?.password
        ) {
          await this.browser.performFormLogin(
            this.config.baseUrl,
            auth.credentials.username,
            auth.credentials.password,
            {}
          );
        }
        break;
    }
  }

  // ==================== Cleanup ====================

  private async cleanup(): Promise<void> {
    if (this.browser) {
      this.progress.browserClose();
      await this.browser.close();
      this.browser = null;
    }
  }

  // ==================== Getters ====================

  getStorage(): StorageManager {
    return this.storage;
  }

  getInterceptor(): NetworkInterceptor {
    return this.interceptor;
  }

  getRewriter(): HtmlRewriter {
    return this.rewriter;
  }
}
