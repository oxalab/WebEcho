// =====================================================
// WebEcho - Simple HTTP Crawler (No Browser)
// =====================================================

import type { CrawlResult, CrawlStats, Page, PageUrl, Asset } from "../types/index.js";
import type { CrawlConfig as CrawlConfigType } from "../config/types.js";
import { parsePageUrl } from "./queue.js";
import * as cheerio from "cheerio";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

/**
 * Simple HTTP crawler using fetch + Cheerio
 * No browser required - works for static sites
 */
export class HttpCrawler {
  private config: CrawlConfigType;
  private visited: Set<string> = new Set();
  private queue: PageUrl[] = [];
  private pages: Page[] = [];
  private assets: Asset[] = [];
  private startTime: number = 0;
  private outputDir: string;
  private downloadedAssets: Map<string, { localPath: string; size: number }> = new Map();

  constructor(config: CrawlConfigType) {
    this.config = config;
    this.outputDir = config.outputDir;
  }

  async crawl(baseUrl: string): Promise<CrawlResult> {
    this.startTime = Date.now();
    const startUrl = parsePageUrl(baseUrl, baseUrl, 0);
    this.queue.push(startUrl);

    await this.ensureOutputDir();
    await this.ensureAssetDirs();

    let pageSuccessCount = 0;
    let pageFailCount = 0;
    let assetSuccessCount = 0;
    let assetFailCount = 0;
    let totalBytes = 0;

    while (this.queue.length > 0 && this.visited.size < this.config.maxPages) {
      const pageUrl = this.queue.shift()!;
      const result = await this.processPage(pageUrl);
      if (result.success) pageSuccessCount++;
      else pageFailCount++;
      totalBytes += result.bytes;
    }

    // Download assets
    console.log(`\n[ASSETS] Downloading ${this.assets.length} assets...`);
    for (const asset of this.assets.slice(0, this.config.maxAssets)) {
      const result = await this.downloadAsset(asset);
      if (result.success) assetSuccessCount++;
      else assetFailCount++;
      totalBytes += result.bytes;
    }

    // Extract and download fonts from CSS files
    console.log(`\n[FONTS] Extracting font URLs from CSS...`);
    const fontUrls = await this.extractFontsFromCss();
    console.log(`[FONTS] Found ${fontUrls.length} fonts, downloading...`);
    for (const fontUrl of fontUrls) {
      const fontAsset: Asset = { url: fontUrl, type: "font", mimeType: "", size: 0 };
      const result = await this.downloadAsset(fontAsset);
      if (result.success) assetSuccessCount++;
      else assetFailCount++;
      totalBytes += result.bytes;
    }

    // Rewrite CSS files to use local font paths
    if (fontUrls.length > 0) {
      console.log(`[FONTS] Rewriting CSS files with local font paths...`);
      await this.rewriteCssFonts();
    }

    // Write manifest
    await this.writeManifest();

    const duration = (Date.now() - this.startTime) / 1000;
    return {
      pages: [],
      assets: [],
      stats: {
        pagesTotal: this.pages.length,
        pagesSuccessful: pageSuccessCount,
        pagesFailed: pageFailCount,
        assetsTotal: this.assets.length,
        assetsSuccessful: assetSuccessCount,
        assetsFailed: assetFailCount,
        bytesDownloaded: totalBytes,
      },
      duration,
    };
  }

  private async processPage(pageUrl: PageUrl): Promise<{ success: boolean; bytes: number }> {
    const url = pageUrl.original;
    if (this.visited.has(url)) return { success: false, bytes: 0 };
    this.visited.add(url);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.config.browser.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(this.config.browser.timeout || 30000),
      });

      if (!response.ok) {
        console.warn(`[FAIL] ${url} returned ${response.status}`);
        return { success: false, bytes: 0 };
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract title
      const title = $("title").text() || "";

      // Extract links
      const links: string[] = [];
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          try {
            const absolute = new URL(href, url).href;
            if (this.shouldCrawl(absolute)) {
              links.push(absolute);
              // Add to queue if within depth limit
              if (pageUrl.depth < this.config.maxDepth) {
                const parsed = parsePageUrl(absolute, this.config.baseUrl, pageUrl.depth + 1, url);
                if (!this.visited.has(absolute) && !this.queue.some(q => q.original === absolute)) {
                  this.queue.push(parsed);
                }
              }
            }
          } catch {
            // Invalid URL, skip
          }
        }
      });

      // Extract assets
      const assets: Asset[] = [];

      // CSS
      $("link[rel='stylesheet']").each((_, el) => {
        const href = $(el).attr("href");
        if (href) this.addAsset(assets, href, url, "css");
      });

      // JS
      $("script[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src) this.addAsset(assets, src, url, "js");
      });

      // Images
      $("img[src]").each((_, el) => {
        const src = $(el).attr("src");
        if (src) this.addAsset(assets, src, url, "image");
      });

      // Favicon
      $("link[rel*='icon']").each((_, el) => {
        const href = $(el).attr("href");
        if (href) this.addAsset(assets, href, url, "image");
      });

      const page: Page = {
        url: pageUrl,
        html,
        assets,
        links: links.filter((l, i, a) => a.indexOf(l) === i),
        spaRoutes: [],
        title,
        timestamp: new Date(),
      };

      this.pages.push(page);
      this.assets.push(...assets);

      // Save the page with rewritten URLs
      const bytes = await this.savePage(page);
      console.log(`[OK] ${url} (${assets.length} assets, ${links.length} links, ${bytes} bytes)`);

      return { success: true, bytes };

    } catch (error) {
      console.warn(`[FAIL] ${url} - ${(error as Error).message}`);
      return { success: false, bytes: 0 };
    }
  }

  private addAsset(assets: Asset[], url: string, base: string, type: string): void {
    try {
      const absolute = new URL(url, base).href;
      if (assets.some(a => a.url === absolute)) return;

      assets.push({
        url: absolute,
        type: type as any,
        mimeType: "",
        size: 0,
      });
    } catch {
      // Invalid URL
    }
  }

  private async downloadAsset(asset: Asset): Promise<{ success: boolean; bytes: number }> {
    const url = asset.url;

    // Check if already downloaded
    if (this.downloadedAssets.has(url)) {
      return { success: true, bytes: 0 };
    }

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.config.browser.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        return { success: false, bytes: 0 };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const localPath = this.getAssetLocalPath(url);
      const webPath = this.getWebAssetPath(url); // Use forward slashes for HTML
      const fullPath = join(this.outputDir, ...localPath.split("/"));

      // Ensure directory exists
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      await writeFile(fullPath, buffer);

      this.downloadedAssets.set(url, { localPath: webPath, size: buffer.length });
      console.log(`[ASSET] ${url} -> ${webPath} (${buffer.length} bytes)`);

      return { success: true, bytes: buffer.length };

    } catch (error) {
      console.warn(`[ASSET FAIL] ${url} - ${(error as Error).message}`);
      return { success: false, bytes: 0 };
    }
  }

  private async savePage(page: Page): Promise<number> {
    // Rewrite HTML with local asset paths
    const $ = cheerio.load(page.html);

    // Rewrite CSS links
    $("link[rel='stylesheet']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const webPath = this.getWebAssetPath(new URL(href, page.url.original).href);
        $(el).attr("href", webPath);
      }
    });

    // Rewrite JS scripts
    $("script[src]").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        const webPath = this.getWebAssetPath(new URL(src, page.url.original).href);
        $(el).attr("src", webPath);
      }
    });

    // Rewrite images
    $("img[src]").each((_, el) => {
      const src = $(el).attr("src");
      if (src) {
        const webPath = this.getWebAssetPath(new URL(src, page.url.original).href);
        $(el).attr("src", webPath);
      }
    });

    // Rewrite favicon
    $("link[rel*='icon']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const webPath = this.getWebAssetPath(new URL(href, page.url.original).href);
        $(el).attr("href", webPath);
      }
    });

    // Rewrite links to other pages
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        try {
          const absolute = new URL(href, page.url.original).href;
          const localPath = this.getPageLocalPath(absolute);
          $(el).attr("href", localPath);
        } catch {
          // Keep original if invalid URL
        }
      }
    });

    const rewrittenHtml = $.html();
    const localPath = this.getPageLocalPath(page.url.original);
    const fullPath = join(this.outputDir, ...localPath.split("/"));

    // Ensure directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(fullPath, rewrittenHtml, "utf-8");

    return rewrittenHtml.length;
  }

  private getPageLocalPath(url: string): string {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;

      if (pathname === "/" || pathname === "") {
        return "index.html";
      }
      if (pathname.endsWith(".html") || pathname.endsWith(".htm")) {
        return pathname.slice(1);
      }
      return `${pathname.slice(1)}/index.html`;
    } catch {
      // Invalid URL, use hash-based filename
      return `pages/${this.hashUrl(url)}.html`;
    }
  }

  // Get web path (with forward slashes) for use in HTML
  private getWebAssetPath(url: string): string {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      const ext = pathname.split(".").pop()?.toLowerCase() || "";
      const hash = this.hashUrl(url);
      const subdir = this.getAssetSubdir(url);
      return `assets/${subdir}/${hash}.${ext}`;
    } catch {
      return `assets/other/${this.hashUrl(url)}`;
    }
  }

  // Get filesystem path (with platform-specific separators)
  private getAssetLocalPath(url: string): string {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      const ext = pathname.split(".").pop()?.toLowerCase() || "";
      const hash = this.hashUrl(url);
      const subdir = this.getAssetSubdir(url);
      return `assets/${subdir}/${hash}.${ext}`;
    } catch {
      return `assets/other/${this.hashUrl(url)}`;
    }
  }

  // Create a consistent hash from URL
  private hashUrl(url: string): string {
    return createHash("sha256").update(url).digest("hex").slice(0, 16);
  }

  private getAssetSubdir(url: string): string {
    const ext = url.split(".").pop()?.toLowerCase() || "";
    const subdirMap: Record<string, string> = {
      css: "css",
      js: "js",
      mjs: "js",
      png: "img",
      jpg: "img",
      jpeg: "img",
      gif: "img",
      svg: "img",
      webp: "img",
      ico: "img",
      woff: "fonts",
      woff2: "fonts",
      ttf: "fonts",
      otf: "fonts",
      eot: "fonts",
    };
    return subdirMap[ext] || "other";
  }

  private shouldCrawl(url: string): boolean {
    try {
      const parsed = new URL(url);

      // Check same domain
      if (this.config.sameDomainOnly) {
        const base = new URL(this.config.baseUrl);
        if (parsed.hostname !== base.hostname) return false;
      }

      // Check include patterns
      if (this.config.include.length > 0) {
        if (!this.config.include.some((pattern: RegExp) => pattern.test(url))) return false;
      }

      // Check exclude patterns
      if (this.config.exclude.some((pattern: RegExp) => pattern.test(url))) return false;

      return true;
    } catch {
      return false;
    }
  }

  private async ensureOutputDir(): Promise<void> {
    if (!existsSync(this.outputDir)) {
      await mkdir(this.outputDir, { recursive: true });
    }
  }

  private async ensureAssetDirs(): Promise<void> {
    const subdirs = ["assets/css", "assets/js", "assets/img", "assets/fonts", "assets/other"];
    for (const subdir of subdirs) {
      const dir = join(this.outputDir, subdir);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
    }
  }

  private async writeManifest(): Promise<void> {
    const manifest = {
      version: "1.0",
      baseUrl: this.config.baseUrl,
      generatedAt: new Date().toISOString(),
      pages: this.pages.map((p) => ({
        url: p.url.original,
        path: this.getPageLocalPath(p.url.original),
      })),
      assets: Array.from(this.downloadedAssets.entries()).map(([url, info]) => ({
        url,
        path: info.localPath,
        size: info.size,
      })),
    };

    const manifestPath = join(this.outputDir, "webecho-manifest.json");
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  }

  /**
   * Extract font URLs from downloaded CSS files
   */
  private async extractFontsFromCss(): Promise<string[]> {
    const fontUrls: Set<string> = new Set();
    const cssDir = join(this.outputDir, "assets", "css");

    // Check if CSS directory exists
    if (!existsSync(cssDir)) {
      return [];
    }

    // Read all CSS files
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(cssDir);

    for (const file of files) {
      if (!file.endsWith(".css")) continue;

      const cssPath = join(cssDir, file);
      try {
        const { readFile } = await import("node:fs/promises");
        const cssContent = await readFile(cssPath, "utf-8");

        // Extract font URLs from @font-face rules
        // Matches: url("..."), url('...'), url(...)
        const urlRegex = /@font-face\s*{[^}]*src:\s*[^;}]*url\(['"]?([^'")\s]+)['"]?\)/gi;
        let match;
        while ((match = urlRegex.exec(cssContent)) !== null) {
          const fontUrl = match[1];
          if (!fontUrl) continue;

          // Skip data: URLs and absolute URLs from other domains
          if (!fontUrl.startsWith("data:") && !fontUrl.startsWith("http://") && !fontUrl.startsWith("https://")) {
            // Relative URL - resolve against one of our CSS asset URLs
            for (const [assetUrl] of this.downloadedAssets) {
              if (assetUrl.endsWith(".css")) {
                try {
                  const absolute = new URL(fontUrl, assetUrl).href;
                  // Only add if same domain
                  if (this.shouldCrawl(absolute)) {
                    fontUrls.add(absolute);
                  }
                } catch {
                  // Invalid URL, skip
                }
              }
            }
          } else if (fontUrl.startsWith("http://") || fontUrl.startsWith("https://")) {
            // Absolute URL - check same domain
            if (this.shouldCrawl(fontUrl)) {
              fontUrls.add(fontUrl);
            }
          }
        }

        // Also look for url() patterns outside @font-face (some CSS has direct font references)
        const directUrlRegex = /url\(['"]?([^'")\s]+\.(?:woff2?|ttf|otf|eot))['"]?\)/gi;
        while ((match = directUrlRegex.exec(cssContent)) !== null) {
          const fontUrl = match[1];
          if (!fontUrl) continue;

          if (!fontUrl.startsWith("data:")) {
            if (fontUrl.startsWith("http://") || fontUrl.startsWith("https://")) {
              if (this.shouldCrawl(fontUrl)) {
                fontUrls.add(fontUrl);
              }
            }
          }
        }

      } catch (error) {
        console.warn(`[WARN] Could not read CSS file ${cssPath}`);
      }
    }

    return Array.from(fontUrls);
  }

  /**
   * Rewrite CSS files to use local font paths
   */
  private async rewriteCssFonts(): Promise<void> {
    const cssDir = join(this.outputDir, "assets", "css");
    if (!existsSync(cssDir)) return;

    const { readdir } = await import("node:fs/promises");
    const files = await readdir(cssDir);

    for (const file of files) {
      if (!file.endsWith(".css")) continue;

      const cssPath = join(cssDir, file);
      try {
        const { readFile, writeFile } = await import("node:fs/promises");
        let cssContent = await readFile(cssPath, "utf-8");

        // Find the CSS file's original URL from our downloads
        let cssBaseUrl = "";
        for (const [url, info] of this.downloadedAssets) {
          if (info.localPath.includes(file.replace(".css", ""))) {
            cssBaseUrl = url;
            break;
          }
        }

        // Rewrite font URLs
        const fontExtensions = ["woff2", "woff", "ttf", "otf", "eot"].join("|");
        const fontRegex = new RegExp(`url(['\"]?([^'\"\\s]+)\\.(${fontExtensions})['\"]?)`, "gi");
        cssContent = cssContent.replace(
          fontRegex,
          (match, fullUrl, fontPath, ext) => {
            const fontUrl = fullUrl + "." + ext;
            // Skip data: URLs
            if (fontUrl.startsWith("data:")) return match;

            let absoluteUrl = fontUrl;
            if (!fontUrl.startsWith("http://") && !fontUrl.startsWith("https://") && cssBaseUrl) {
              try {
                absoluteUrl = new URL(fontUrl, cssBaseUrl).href;
              } catch {
                return match;
              }
            }

            // Check if we downloaded this font
            if (this.downloadedAssets.has(absoluteUrl)) {
              const localPath = this.downloadedAssets.get(absoluteUrl)?.localPath || "";
              // Make path relative to CSS file (../fonts/)
              const relativePath = localPath.replace("assets/", "../");
              return `url('${relativePath}')`;
            }

            return match;
          }
        );

        await writeFile(cssPath, cssContent, "utf-8");
      } catch (error) {
        console.warn(`[WARN] Could not rewrite CSS file ${cssPath}`);
      }
    }
  }
}
