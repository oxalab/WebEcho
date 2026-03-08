// =====================================================
// WebEcho - CSS URL Rewriter
// =====================================================

import type { RewriteContext } from "../types/index.js";

// ==================== CSS Rewriter ====================

/**
 * Rewrites URLs in CSS content to local paths.
 *
 * Handles:
 * - url() declarations
 * - @import statements
 * - font-face src
 * - background-image
 * - content property
 */
export class CssRewriter {
  private context: RewriteContext;

  constructor(context: RewriteContext) {
    this.context = context;
  }

  /**
   * Rewrite all URLs in CSS content
   */
  rewrite(css: string): string {
    // Rewrite url() declarations
    let result = this.rewriteUrlDeclarations(css);

    // Rewrite @import statements
    result = this.rewriteImportStatements(result);

    return result;
  }

  // ==================== URL Declaration Rewriter ====================

  /**
   * Rewrite url() declarations in CSS
   *
   * Patterns to match:
   * - url('http://example.com/image.png')
   * - url("http://example.com/image.png")
   * - url(http://example.com/image.png)
   */
  private rewriteUrlDeclarations(css: string): string {
    // Match url(...) declarations
    const urlPattern = /url\(['"]?([^'"()]+)['"]?\)/gi;

    return css.replace(urlPattern, (match, url) => {
      // Skip data URLs, empty URLs
      if (this.shouldSkipUrl(url)) {
        return match;
      }

      const rewritten = this.rewriteAssetUrl(url);

      // Preserve original quote style
      if (match.includes('"')) {
        return `url("${rewritten}")`;
      } else if (match.includes("'")) {
        return `url('${rewritten}')`;
      }
      return `url(${rewritten})`;
    });
  }

  /**
   * Rewrite @import statements
   */
  private rewriteImportStatements(css: string): string {
    // Match @import with url() or string
    // @import url('style.css');
    // @import "style.css";
    const importPattern = /@import\s+(?:url\(['"]?([^'"()]+)['"]?\)|['"]([^'"]+)['"])/gi;

    return css.replace(importPattern, (match, url1, url2) => {
      const url = url1 || url2;

      if (this.shouldSkipUrl(url)) {
        return match;
      }

      const rewritten = this.rewriteAssetUrl(url);

      // Preserve original format
      if (url1) {
        // Was url() format
        if (match.includes('"')) {
          return `@import url("${rewritten}");`;
        } else if (match.includes("'")) {
          return `@import url('${rewritten}');`;
        }
        return `@import url(${rewritten});`;
      } else {
        // Was string format
        if (match.includes('"')) {
          return `@import "${rewritten}";`;
        }
        return `@import '${rewritten}';`;
      }
    });
  }

  // ==================== URL Rewriting ====================

  /**
   * Rewrite an asset URL in CSS
   */
  private rewriteAssetUrl(url: string): string {
    // Resolve relative URLs against base
    const absolute = this.resolveUrl(url);

    // Check asset map
    const mappedPath = this.context.assetMap.get(absolute);

    if (mappedPath) {
      return this.makeRelative(mappedPath);
    }

    // Return relative path from current location
    return this.makeRelativeFromAssets(url);
  }

  /**
   * Resolve URL against base URL
   */
  private resolveUrl(url: string): string {
    try {
      return new URL(url, this.context.baseUrl).href;
    } catch {
      return url;
    }
  }

  /**
   * Make path relative to assets directory
   */
  private makeRelativeFromAssets(url: string): string {
    // For CSS files, assets are typically in ../assets/
    // or ./assets/ depending on structure
    const filename = this.getFilename(url);
    return `../assets/${this.categorizeUrl(url)}/${filename}`;
  }

  /**
   * Make path relative
   */
  private makeRelative(path: string): string {
    if (path.startsWith("/")) {
      return path.slice(1);
    }
    return path;
  }

  /**
   * Get filename from URL
   */
  private getFilename(url: string): string {
    const parts = url.split("/");
    const last = parts[parts.length - 1];

    // Remove query string and hash
    return last.split(/[?#]/)[0] || "file";
  }

  /**
   * Categorize URL by type for asset directory
   */
  private categorizeUrl(url: string): string {
    const ext = url.split(".").pop()?.toLowerCase();

    const categoryMap: Record<string, string> = {
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

    return categoryMap[ext ?? ""] || "img";
  }

  /**
   * Check if URL should be skipped
   */
  private shouldSkipUrl(url: string): boolean {
    return (
      url.startsWith("data:") ||
      url.startsWith("about:") ||
      url === "" ||
      url.startsWith("#")
    );
  }

  // ==================== Update Context ====================

  updateContext(updates: Partial<RewriteContext>): void {
    this.context = { ...this.context, ...updates };
  }
}

// ==================== CSS URL Extractor ====================

/**
 * Extract all URLs from CSS content
 *
 * Useful for discovering assets referenced in stylesheets
 */
export function extractCssUrls(css: string): string[] {
  const urls: string[] = [];

  // Extract url() declarations
  const urlPattern = /url\(['"]?([^'"()]+)['"]?\)/gi;
  let match;

  while ((match = urlPattern.exec(css)) !== null) {
    const url = match[1];
    if (!url.startsWith("data:") && !url.startsWith("about:")) {
      urls.push(url);
    }
  }

  // Extract @import statements
  const importPattern = /@import\s+(?:url\(['"]?([^'"()]+)['"]?\)|['"]([^'"]+)['"])/gi;

  while ((match = importPattern.exec(css)) !== null) {
    const url = match[1] || match[2];
    if (url && !url.startsWith("data:") && !url.startsWith("about:")) {
      urls.push(url);
    }
  }

  // Deduplicate
  return [...new Set(urls)];
}
