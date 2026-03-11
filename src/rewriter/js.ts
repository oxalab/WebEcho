// =====================================================
// WebEcho - JavaScript URL Rewriter
// =====================================================

import type { RewriteContext } from "../types/index.js";

// ==================== JS Rewriter ====================

/**
 * Rewrites URLs in JavaScript bundles to local paths.
 *
 * This is a BEST-EFFORT rewriter. JavaScript is too complex
 * to parse perfectly without a full AST, but we can handle
 * the most common patterns found in modern web apps.
 *
 * Handles:
 * - Dynamic imports: import("./path.js")
 * - fetch() calls
 * - XMLHttpRequest URLs
 * - Template literals with URLs
 * - String literals containing same-origin URLs
 * - Next.js specific patterns (/_next/, /_next/data/)
 * - Relative path imports in bundled code
 *
 * Does NOT handle (intentionally - too risky):
 * - Computed URLs (variables, expressions)
 * - Multi-step string concatenation
 * - URLs constructed at runtime
 */
export class JsRewriter {
  private context: RewriteContext;
  private baseUrlObj: URL;

  // Track which file we're currently rewriting (for relative path resolution)
  private currentJsPath: string = "";

  constructor(context: RewriteContext) {
    this.context = context;
    this.baseUrlObj = new URL(context.baseUrl);
  }

  /**
   * Rewrite all URLs in JavaScript content
   */
  rewrite(js: string, jsPath: string = ""): string {
    this.currentJsPath = jsPath;

    let result = js;

    // Order matters - more specific patterns first
    result = this.rewriteNextDataPaths(result);
    result = this.rewriteNextStaticPaths(result);
    result = this.rewriteDynamicImports(result);
    result = this.rewriteFetchCalls(result);
    result = this.rewriteXhrCalls(result);
    result = this.rewriteTemplateLiterals(result);
    result = this.rewriteStringLiterals(result);

    return result;
  }

  // ==================== Next.js Specific Patterns ====================

  /**
   * Rewrite Next.js App Router data paths
   * Pattern: /_next/data/[build-id]/[path].json
   */
  private rewriteNextDataPaths(js: string): string {
    // Match /_next/data/...json URLs in strings
    // These are typically in fetch calls or hardcoded
    const nextDataPattern = /(["'`])(\/_next\/data\/[^"'`]+\.json)(\1)/g;

    return js.replace(nextDataPattern, (match, quote, url) => {
      const rewritten = this.rewriteAssetUrl(url);
      return `${quote}${rewritten}${quote}`;
    });
  }

  /**
   * Rewrite Next.js static asset paths
   * Pattern: /_next/static/chunks/..., /_next/static/media/..., etc.
   */
  private rewriteNextStaticPaths(js: string): string {
    // Match /_next/static/ URLs in various contexts
    // This handles both absolute paths and relative paths from _next bundles
    const patterns = [
      // Absolute paths in quotes: "/_next/static/chunks/main.js"
      /(["'`])(\/_next\/static\/[^"'`]+)(\1)/g,
      // Relative paths from within _next: "./chunks/foo.js" or "../chunks/foo.js"
      /(["'`])(\.\.\/(?:chunks|media|css|static)\/[^"'`]+)(\1)/g,
    ];

    let result = js;
    for (const pattern of patterns) {
      result = result.replace(pattern, (match, quote, url) => {
        const resolved = this.resolveNextJsPath(url);
        const rewritten = this.rewriteAssetUrl(resolved);
        return `${quote}${rewritten}${quote}`;
      });
    }

    return result;
  }

  /**
   * Resolve Next.js relative paths to absolute URLs
   * Handles: ./chunks/foo.js -> https://site.com/_next/static/chunks/foo.js
   */
  private resolveNextJsPath(path: string): string {
    // If it starts with /, it's already absolute (on the origin)
    if (path.startsWith("/")) {
      return new URL(path, this.baseUrlObj.origin).href;
    }

    // Relative path - resolve against current JS file's location
    if (this.currentJsPath) {
      const currentUrl = new URL(this.currentJsPath, this.baseUrlObj.href);
      const basePath = currentUrl.pathname.substring(0, currentUrl.pathname.lastIndexOf("/"));
      return new URL(path, `${this.baseUrlObj.origin}${basePath}/`).href;
    }

    // Fallback: assume we're in _next/static/
    return new URL(path, `${this.baseUrlObj.origin}/_next/static/`).href;
  }

  // ==================== Dynamic Import Patterns ====================

  /**
   * Rewrite dynamic imports
   * Pattern: import("./path.js") or import('./path.js')
   */
  private rewriteDynamicImports(js: string): string {
    // Match dynamic imports with relative or absolute paths
    // We only match simple string literals, not expressions
    const importPattern = /import\(["']([^"']+)["']\)/g;

    return js.replace(importPattern, (match, url) => {
      const rewritten = this.rewriteAssetUrl(url);
      return `import("${rewritten}")`;
    });
  }

  // ==================== Fetch/AJAX Patterns ====================

  /**
   * Rewrite fetch() call URLs
   * Pattern: fetch("/api/data") or fetch("https://site.com/api")
   */
  private rewriteFetchCalls(js: string): string {
    // Match fetch with string URL
    // This is conservative - only matches simple string literals
    const fetchPattern = /fetch\(["']([^"']+)["']\)/g;

    return js.replace(fetchPattern, (match, url) => {
      // Only rewrite same-origin URLs
      if (this.isSameOrigin(url)) {
        const rewritten = this.rewriteAssetUrl(url);
        return `fetch("${rewritten}")`;
      }
      return match;
    });
  }

  /**
   * Rewrite XMLHttpRequest open() calls
   * Pattern: xhr.open("GET", "/api/data")
   */
  private rewriteXhrCalls(js: string): string {
    // Match xhr.open("METHOD", "/path")
    const xhrPattern = /\.open\(["'](?:GET|POST|PUT|DELETE|PATCH)["'],\s*["']([^"']+)["']\)/g;

    return js.replace(xhrPattern, (match, url) => {
      if (this.isSameOrigin(url)) {
        const rewritten = this.rewriteAssetUrl(url);
        return match.replace(url, rewritten);
      }
      return match;
    });
  }

  // ==================== Template Literal Patterns ====================

  /**
   * Rewrite URLs in template literals
   * Pattern: `https://site.com/api/${id}` -> `/assets/api/${id}`
   *
   * This only handles simple cases where the base URL is a literal
   */
  private rewriteTemplateLiterals(js: string): string {
    // Match template literals that start with http:// or https:// or /
    // and end before a ${ or `
    const templatePattern = /`((?:https?:\/\/[^$\`]+)|(?:\/[^$\`]+))`/g;

    return js.replace(templatePattern, (match, url) => {
      // Only rewrite same-origin URLs
      if (this.isSameOrigin(url)) {
        const rewritten = this.rewriteAssetUrl(url);
        return `\`${rewritten}\``;
      }
      return match;
    });
  }

  // ==================== String Literal Patterns ====================

  /**
   * Rewrite URLs in string literals (conservative)
   *
   * This is the most aggressive pattern and runs last.
   * Only rewrites strings that:
   * 1. Start with / (absolute paths)
   * 2. Are in our asset map
   * 3. Don't look like function calls or selectors
   */
  private rewriteStringLiterals(js: string): string {
    // Match string literals with absolute paths
    // Exclude patterns that look like CSS selectors, JSON keys, etc.
    const stringPattern = /(["'])(\/[^"'\s\)\}]+)(\1)/g;

    return js.replace(stringPattern, (match, quote, url) => {
      // Skip if it looks like a CSS selector
      if (this.looksLikeSelector(url)) {
        return match;
      }

      // Check if it's in our asset map
      const normalized = this.normalizeUrl(url);
      if (this.context.assetMap.has(normalized)) {
        const rewritten = this.rewriteAssetUrl(url);
        return `${quote}${rewritten}${quote}`;
      }

      return match;
    });
  }

  // ==================== URL Rewriting Helpers ====================

  /**
   * Rewrite an asset URL using the asset map
   */
  private rewriteAssetUrl(url: string): string {
    const normalized = this.normalizeUrl(url);
    let mappedPath = this.context.assetMap.get(normalized);

    // Try with/without www prefix (redirect handling)
    if (!mappedPath) {
      mappedPath = this.context.assetMap.get(this.withAlternateWww(normalized));
    }

    if (mappedPath) {
      return this.makeRelative(mappedPath);
    }

    // Not in asset map - return relative path for same-origin URLs
    if (this.isSameOrigin(url)) {
      // For same-origin URLs not in map, try to preserve structure
      const urlObj = new URL(normalized);
      return urlObj.pathname;
    }

    return url;
  }

  /**
   * Get alternate URL with www prefix added/removed
   */
  private withAlternateWww(url: string): string {
    try {
      const u = new URL(url);
      if (u.hostname.startsWith('www.')) {
        u.hostname = u.hostname.slice(4);
      } else {
        u.hostname = 'www.' + u.hostname;
      }
      return u.href;
    } catch {
      return url;
    }
  }

  /**
   * Normalize URL for consistent lookup
   */
  private normalizeUrl(url: string): string {
    try {
      if (url.startsWith("/")) {
        return new URL(url, this.baseUrlObj.origin).href;
      }
      return new URL(url, this.baseUrlObj.href).href;
    } catch {
      return url;
    }
  }

  /**
   * Check if URL is same-origin as base URL
   */
  private isSameOrigin(url: string): boolean {
    try {
      if (url.startsWith("/")) {
        return true; // Relative paths are same-origin
      }
      const u = new URL(url, this.baseUrlObj.href);
      return u.origin === this.baseUrlObj.origin;
    } catch {
      return false;
    }
  }

  /**
   * Make path relative to current location
   * For JS files in assets/js/, we need ../ to get to assets root
   */
  private makeRelative(path: string): string {
    // Remove leading slash
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;

    // If path is already in assets/, calculate relative from assets/js/
    if (cleanPath.startsWith("assets/")) {
      const depth = cleanPath.split("/").length - 1; // How deep is the target
      const ups = "../".repeat(depth); // Go up that many levels
      return ups + cleanPath.split("/").slice(depth).join("/");
    }

    // Default: use relative from root
    return `../${cleanPath}`;
  }

  /**
   * Check if a URL string looks like a CSS selector
   */
  private looksLikeSelector(str: string): boolean {
    // CSS selector patterns
    const selectorPatterns = [
      /^#[\w-]+/, // #id
      /^\.[\w-]+/, // .class
      /^\[/, // [attr]
      /^:/, // :pseudo
      /^[a-z][a-z0-9]*\[/i, // tag[attr]
    ];

    return selectorPatterns.some((pattern) => pattern.test(str));
  }

  // ==================== Context Updates ====================

  updateContext(updates: Partial<RewriteContext>): void {
    this.context = { ...this.context, ...updates };
    // Update base URL if it changed
    if (updates.baseUrl) {
      this.baseUrlObj = new URL(updates.baseUrl);
    }
  }
}

// ==================== JS URL Extractor ====================

/**
 * Extract all URLs from JavaScript content
 *
 * Useful for discovering assets referenced in JS bundles
 */
export function extractJsUrls(js: string): string[] {
  const urls: Set<string> = new Set();

  // Extract from dynamic imports
  const importPattern = /import\(["']([^"']+)["']\)/g;
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(js)) !== null) {
    if (match[1]) urls.add(match[1]);
  }

  // Extract from fetch calls
  const fetchPattern = /fetch\(["']([^"']+)["']\)/g;
  while ((match = fetchPattern.exec(js)) !== null) {
    if (match[1]) urls.add(match[1]);
  }

  // Extract from template literals
  const templatePattern = /`((?:https?:\/\/[^$\`]+)|(?:\/[^$\`]+))`/g;
  while ((match = templatePattern.exec(js)) !== null) {
    if (match[1]) urls.add(match[1]);
  }

  // Extract from string literals with / paths
  const stringPattern = /(["'])(\/[^"'\s\)\}]+)(\1)/g;
  while ((match = stringPattern.exec(js)) !== null) {
    if (match[2]) urls.add(match[2]);
  }

  return Array.from(urls);
}
