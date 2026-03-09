// =====================================================
// WebEcho - Browser Engine
// =====================================================

import { chromium, type Page, type Browser, type BrowserContext } from "playwright";
import type {
  BrowserConfig,
  NavigationResult,
  NetworkResponse,
  NetworkRequest,
  AssetType,
} from "../types/index.js";
import type { NetworkInterceptor } from "../network/interceptor.js";
import { SpaNavigationHandler } from "./navigation.js";

// ==================== Browser Engine ====================

/**
 * Manages Playwright browser instance for crawling.
 *
 * Features:
 * - Page navigation with wait conditions
 * - SPA navigation tracking
 * - Network request/response interception
 * - Link extraction
 * - Authentication handling
 */
export class BrowserEngine {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private interceptor: NetworkInterceptor;
  private navigationHandler: SpaNavigationHandler;
  private config: BrowserConfig;

  constructor(config: BrowserConfig, interceptor: NetworkInterceptor) {
    this.config = config;
    this.interceptor = interceptor;
    this.navigationHandler = new SpaNavigationHandler();
  }

  // ==================== Lifecycle ====================

  /**
   * Launch the browser and setup interception
   */
  async launch(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.config.headless,
    });

    this.context = await this.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: this.config.viewport ?? { width: 1920, height: 1080 },
    });

    this.page = await this.context.newPage();

    // Setup network interception
    await this.setupNetworkInterception();

    // Setup SPA navigation tracking
    await this.setupSpaTracking();
  }

  /**
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    await this.page?.close();
    await this.context?.close();
    await this.browser?.close();
  }

  // ==================== Navigation ====================

  /**
   * Navigate to a URL and return the page content
   */
  async navigate(url: string): Promise<NavigationResult> {
    if (!this.page) {
      throw new Error("Browser not launched. Call launch() first.");
    }

    const startTime = Date.now();

    try {
      // Clear previous SPA navigations
      this.navigationHandler.clear();

      // Navigate to URL
      const response = await this.page.goto(url, {
        waitUntil: "networkidle",
        timeout: this.config.timeout,
      });

      // Wait for optional selector
      if (this.config.waitForSelector) {
        await this.page.waitForSelector(this.config.waitForSelector, {
          timeout: this.config.timeout,
        });
      }

      // Wait for idle time (for SPA hydration)
      if (this.config.waitForIdle) {
        await this.page.waitForTimeout(this.config.waitForIdle);
      }

      // Get final URL (after redirects)
      const finalUrl = this.page.url();

      // Get HTML content
      const html = await this.page.content();

      // Get page title
      const title = await this.page.title();

      // Get status code
      const statusCode = response?.status() ?? 0;

      // Collect SPA navigations that occurred
      const spaRoutes = this.navigationHandler.getNavigations();
      for (const route of spaRoutes) {
        this.navigationHandler.clear();
        this.navigationHandler.record({
          type: "pushState",
          url: route,
          timestamp: Date.now(),
        });
      }

      return {
        url: finalUrl,
        html,
        statusCode,
        title,
      };

    } catch (error) {
      throw new Error(`Navigation failed for ${url}: ${(error as Error).message}`);
    }
  }

  // ==================== SPA Navigation ====================

  /**
   * Inject script to track SPA router events
   */
  async setupSpaTracking(): Promise<void> {
    if (!this.page) return;

    // Inject tracking script as string to avoid TypeScript checking browser globals
    const trackingScript = String.raw`
      (function() {
        if (window.__webechoSPASetup) return;
        window.__webechoSPASetup = true;

        // Initialize navigation storage
        window.__spaNavigations = window.__spaNavigations || [];

        // Track pushState
        const originalPushState = history.pushState;
        history.pushState = function(...args) {
          originalPushState.apply(this, args);
          const url = args[2] || location.href;
          window.__spaNavigations.push(url);
          window.dispatchEvent(new CustomEvent("spapushstate", { detail: { url } }));
        };

        // Track replaceState
        const originalReplaceState = history.replaceState;
        history.replaceState = function(...args) {
          originalReplaceState.apply(this, args);
          const url = args[2] || location.href;
          window.__spaNavigations.push(url);
          window.dispatchEvent(new CustomEvent("spareplacestate", { detail: { url } }));
        };

        // Track popstate (back/forward buttons)
        window.addEventListener('popstate', function() {
          window.__spaNavigations.push(location.href);
        });
      })();
    `;

    // Add init script to run on every page navigation
    await this.page.addInitScript(trackingScript);
  }

  /**
   * Get all SPA navigation URLs discovered
   */
  async getSpaNavigations(): Promise<string[]> {
    if (!this.page) return [];

    try {
      const navigations = await this.page.evaluate("window.__spaNavigations || []") as string[];
      // Also get from handler
      const handlerNavs = this.navigationHandler.getNavigations();
       return [...new Set([...navigations, ...handlerNavs])];
    } catch {
      return this.navigationHandler.getNavigations();
    }
  }

  // ==================== Link Extraction ====================

  /**
   * Extract all links from the current page
   */
  async extractLinks(baseUrl: string): Promise<string[]> {
    if (!this.page) return [];

    // Use $$eval with explicit any to avoid DOM type requirements
    const links = await this.page.$$eval(
      "a[href]",
      (anchors: any, base: string) => {
        return anchors
          .map((a: any) => a.href)
          .filter((href: string) => href.startsWith(base) || href.startsWith("/"));
      },
      baseUrl
    );

    // Also get SPA routes
    const spaRoutes = await this.getSpaNavigations();

    return [...new Set([...links, ...spaRoutes])];
  }

  // ==================== Authentication ====================

  /**
   * Set cookies for the session
   */
  async setCookies(cookies: Array<{ name: string; value: string; domain?: string }>): Promise<void> {
    if (!this.context) {
      throw new Error("Browser context not available");
    }
    await this.context.addCookies(cookies as any);
  }

  /**
   * Set Bearer token for requests
   */
  async setBearerToken(token: string): Promise<void> {
    if (!this.page) {
      throw new Error("Browser page not available");
    }
    await this.page.setExtraHTTPHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  /**
   * Perform form-based login
   */
  async performFormLogin(
    loginUrl: string,
    username: string,
    password: string,
    selectors: {
      usernameField?: string;
      passwordField?: string;
      submitButton?: string;
    }
  ): Promise<void> {
    await this.navigate(loginUrl);

    if (!this.page) {
      throw new Error("Browser page not available");
    }

    const usernameSelector = selectors.usernameField ?? "input[type='text'], input[type='email'], input[name*='user'], input[name*='email']";
    const passwordSelector = selectors.passwordField ?? "input[type='password']";
    const submitSelector = selectors.submitButton ?? "button[type='submit'], input[type='submit']";

    await this.page.fill(usernameSelector, username);
    await this.page.fill(passwordSelector, password);
    await this.page.click(submitSelector);

    // Wait for navigation after login
    await this.page.waitForLoadState("networkidle", {
      timeout: this.config.timeout,
    });
  }

  // ==================== Network Interception ====================

  /**
   * Setup network request/response interception
   */
  private async setupNetworkInterception(): Promise<void> {
    if (!this.page) return;

    // Counter for generating unique request IDs
    let requestId = 0;

    this.page.on("request", async (request) => {
      const networkRequest: NetworkRequest = {
        id: `req-${requestId++}-${request.method()}-${request.url().slice(0, 50)}`,
        url: request.url(),
        method: request.method(),
        type: this.determineAssetType("", request.url()),
        mimeType: request.headers()["content-type"] ?? "",
        headers: request.headers(),
        timestamp: new Date(),
      };

      this.interceptor.handleRequest(networkRequest);
    });

    this.page.on("response", async (response) => {
      const request = response.request();
      const url = request.url();
      const statusCode = response.status();
      const headers = response.headers();
      const now = Date.now();

      // Determine asset type
      const contentType = headers["content-type"] ?? "";
      const assetType = this.determineAssetType(contentType, url);

      // Get body for relevant asset types
      let body: Buffer | undefined;
      if (this.shouldCaptureBody(assetType, statusCode)) {
        try {
          const buffer = await response.body();
          body = Buffer.from(buffer);
        } catch {
          // Body not available or too large
        }
      }

      const networkResponse: NetworkResponse = {
        id: `res-${requestId++}-${request.method()}-${url.slice(0, 50)}`,
        url,
        method: request.method(),
        type: assetType,
        mimeType: contentType,
        statusCode,
        size: body?.length ?? 0,
        headers,
        body,
        timestamp: new Date(now),
        timing: {
          startTime: now,
          endTime: now,
          duration: 0,
        },
      };

      await this.interceptor.handleResponse(networkResponse);
    });
  }

  /**
   * Determine asset type from content type or URL
   */
  private determineAssetType(contentType: string, url: string): AssetType {
    // Check content type first
    if (contentType.includes("html")) return "html";
    if (contentType.includes("css")) return "css";
    if (contentType.includes("javascript")) return "js";
    if (contentType.includes("json")) return "api";
    if (contentType.includes("image/")) return "image";
    if (contentType.includes("font")) return "font";
    if (contentType.includes("video/") || contentType.includes("audio/")) return "media";

    // Fallback to URL extension
    const ext = url.split(".").pop()?.toLowerCase();
    if (ext === "css") return "css";
    if (ext === "js") return "js";
    if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"].includes(ext ?? "")) return "image";
    if (["woff", "woff2", "ttf", "otf", "eot"].includes(ext ?? "")) return "font";
    if (["mp4", "webm", "ogg", "mp3", "wav"].includes(ext ?? "")) return "media";

    return "unknown";
  }

  /**
   * Check if we should capture the response body
   */
  private shouldCaptureBody(type: AssetType, statusCode: number): boolean {
    // Don't capture error responses
    if (statusCode >= 400) return false;

    // Don't capture HTML (handled separately via page.content())
    if (type === "html") return false;

    // Capture these types
    return ["css", "js", "image", "font", "api", "media"].includes(type);
  }

  // ==================== Utilities ====================

  /**
   * Execute JavaScript in the page context
   */
  async executeScript<T>(script: string): Promise<T> {
    if (!this.page) {
      throw new Error("Browser page not available");
    }
    return await this.page.evaluate(script) as T;
  }

  /**
   * Take a screenshot of the current page
   */
  async getScreenshot(): Promise<Buffer> {
    if (!this.page) {
      throw new Error("Browser page not available");
    }
    return await this.page.screenshot() as Buffer;
  }

  /**
   * Get the current URL
   */
  getCurrentUrl(): string {
    return this.page?.url() ?? "";
  }
}
