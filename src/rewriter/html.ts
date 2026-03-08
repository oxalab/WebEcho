import * as cheerio from "cheerio";
import type { RewriteContext } from "../types/index.js";
import { CssRewriter } from "./css.js";

// HTML Rewriter

/**
 * Rewrites all URLS in HTML to local paths
 *
 * Handles:
 * ⇒ href attributes (links, stylesheets)
 * ⇒ src attributes (images, scripts, iframes)
 * ⇒ srcset attributes (responsive images)
 * ⇒ style attributes (inline CSS)
 * ⇒ data attributes (sometimes contain URLs)
 * ⇒ meta tags (refresh, OG Tags)
 */

export class HtmlRewriter {
    private context: RewriteContext;
    private cssRewriter?: CssRewriter;

    constructor(context: RewriteContext){
        this.context = context;
    }

    /**
     * Rewrite all URLs in HTML content
     */
    rewrite(html: string): string {
        const $ = cheerio.load(html);

        this.rewriteLinks($);
        this.rewriteImages($);
        this.rewriteScripts($);
        this.rewriteStylesheets($);
        this.rewriteIframes($);
        this.rewriteMetaTags($);
        this.rewriteStyleAttributes($);
        this.rewriteDataAttributes($);
        this.rewriteSrcsetAttributes($);

        this.injectBaseTag($);
        return $.html();
    }

    // Attribute ReWrites
    private rewriteLinks($: cheerio.CheerioAPI): void {
        $("a[href]").each((_, el) => {
          const $el = $(el);
          const href = $el.attr("href");

          if (href) {
            const rewritten = this.rewriteUrl(href);
            $el.attr("href", rewritten);
          }
        });
    }

    private rewriteImages($: cheerio.CheerioAPI): void {
        $("img[src]").each((_, el) => {
          const $el = $(el);
          const src = $el.attr("src");

          if (src) {
            const rewritten = this.rewriteAssetUrl(src);
            $el.attr("src", rewritten);
          }
        });

        // Also handle picture source elements
        $("picture source[srcset]").each((_, el) => {
            const $el = $(el);
            const srcset = $el.attr("srcset");

            if (srcset) {
                $el.attr("srcset", this.rewriteSrcsetValue(srcset));
            }
        });
    }

    private rewriteScripts($: cheerio.CheerioAPI): void {
        $("script[src]").each((_, el) => {
          const $el = $(el);
          const src = $el.attr("src");

          if (src) {
            const rewritten = this.rewriteAssetUrl(src);
            $el.attr("src", rewritten);
          }
        });
    }

    private rewriteStylesheets($: cheerio.CheerioAPI): void {
        $("link[rel='stylesheet']").each((_, el) => {
          const $el = $(el);
          const href = $el.attr("href");

          if (href) {
            const rewritten = this.rewriteAssetUrl(href);
            $el.attr("href", rewritten);
          }
        });

        // Also handle preload, prefetch links
        $("link[rel='preload'], link[rel='prefetch']").each((_, el) => {
            const $el = $(el);
            const href = $el.attr("href");

            if (href) {
                const rewritten = this.rewriteAssetUrl(href);
                $el.attr("href", rewritten);
            }
        });
    }

    private rewriteIframes($: cheerio.CheerioAPI): void {
        $("iframe[src], frame[src]").each((_, el) => {
          const $el = $(el);
          const src = $el.attr("src");

          if (src) {
            const rewritten = this.rewriteUrl(src);
            $el.attr("src", rewritten);
          }
        });
    }

    private rewriteMetaTags($: cheerio.CheerioAPI): void {
        // Meta refresh
        $("meta[http-equiv='refresh']").each((_, el) => {
          const $el = $(el);
          const content = $el.attr("content");

          if (content) {
            const rewritten = this.rewriteMetaRefresh(content);
            $el.attr("content", rewritten);
          }
        });

        // Open Graph tags
        $("meta[property^='og:']").each((_, el) => {
          const $el = $(el);
          const property = $el.attr("property");
          const content = $el.attr("content");

          // Rewrite og:image, og:video, og:audio
          if (content && (property === "og:image" || property === "og:video" || property === "og:audio")) {
            const rewritten = this.rewriteAssetUrl(content);
            $el.attr("content", rewritten);
          }
        });

        // Twitter card tags
        $("meta[name^='twitter:']").each((_, el) => {
          const $el = $(el);
          const name = $el.attr("name");
          const content = $el.attr("content");

          // Rewrite twitter:image, twitter:player
          if (content && (name === "twitter:image" || name === "twitter:player")) {
            const rewritten = this.rewriteAssetUrl(content);
            $el.attr("content", rewritten);
          }
        });
    }

    private rewriteStyleAttributes($: cheerio.CheerioAPI): void {
        $("[style]").each((_, el) => {
          const $el = $(el);
          const style = $el.attr("style");

          if (style) {
            const rewritten = this.rewriteInlineCss(style);
            $el.attr("style", rewritten);
          }
        });
    }

    private rewriteDataAttributes($: cheerio.CheerioAPI): void {
        // Common data attributes that contain URLs
        const urlDataAttrs = [
          "data-bg",
          "data-background",
          "data-src",
          "data-href",
          "data-url",
          "data-image",
        ];

        for (const attr of urlDataAttrs) {
          $(`[${attr}]`).each((_, el) => {
            const $el = $(el);
            const value = $el.attr(attr);

            if (value && (value.startsWith("http") || value.startsWith("/"))) {
              const rewritten = this.rewriteAssetUrl(value);
              $el.attr(attr, rewritten);
            }
          });
        }
    }

    private rewriteSrcsetAttributes($: cheerio.CheerioAPI): void {
        $("[srcset]").each((_, el) => {
          const $el = $(el);
          const srcset = $el.attr("srcset");

          if (srcset) {
            $el.attr("srcset", this.rewriteSrcsetValue(srcset));
          }
        });
    }

    private injectBaseTag($: cheerio.CheerioAPI): void {
        // Only inject if no base tag exists
        if ($("base").length === 0) {
          const baseTag = `<base href="./">`;
          $("head").prepend(baseTag);
        }
    }

    // ==================== URL Rewriting Helpers ====================

    /**
     * Rewrite a page URL (for links)
     */
    private rewriteUrl(url: string): string {
        // Skip anchors, javascript, mailto, tel
        if (this.isNonHttpUrl(url)) {
          return url;
        }

        // Check if this is a page URL (in our page map)
        const mappedPath = this.context.pageMap.get(this.normalizeUrl(url));
        if (mappedPath) {
          return this.makeRelative(mappedPath);
        }

        // External URL - keep as is (or make absolute)
        return this.isSameOrigin(url)
          ? url
          : url;
    }

    /**
     * Rewrite an asset URL (images, scripts, etc.)
     */
    private rewriteAssetUrl(url: string): string {
        // Skip non-http URLs
        if (this.isNonHttpUrl(url)) {
          return url;
        }

        // Check asset map
        const mappedPath = this.context.assetMap.get(url);
        if (mappedPath) {
          return this.makeRelative(mappedPath);
        }

        // Not found - keep original or make relative
        return url;
    }

    /**
     * Rewrite srcset attribute value
     */
    private rewriteSrcsetValue(srcset: string): string {
        // Parse srcset: "url1 1x, url2 2x, url3"
        return srcset
          .split(",")
          .map((part) => {
            const [url, descriptor] = part.trim().split(/\s+/);
            const rewritten = this.rewriteAssetUrl(url!);
            return descriptor ? `${rewritten} ${descriptor}` : rewritten;
          })
          .join(", ");
    }

    /**
     * Rewrite meta refresh content
     */
    private rewriteMetaRefresh(content: string): string {
        // Format: "5; url=http://example.com"
        const match = content.match(/(\d+);\s*url=(.+)/i);

        if (match) {
          const [, delay, url] = match;
          const rewritten = this.rewriteUrl(url!);
          return `${delay}; url=${rewritten}`;
        }

        return content;
    }

    /**
     * Rewrite inline CSS
     */
    private rewriteInlineCss(css: string): string {
        if (!this.cssRewriter) {
            this.cssRewriter = new CssRewriter(this.context);
        }
        return this.cssRewriter.rewrite(css);
    }

    // ==================== Utility Methods ====================

    private isNonHttpUrl(url: string): boolean {
        return (
          url.startsWith("#") ||
          url.startsWith("javascript:") ||
          url.startsWith("mailto:") ||
          url.startsWith("tel:") ||
          url.startsWith("data:")
        );
    }

    private isSameOrigin(url: string): boolean {
        try {
          const u = new URL(url);
          const base = new URL(this.context.baseUrl);
          return u.origin === base.origin;
        } catch {
          return false;
        }
    }

    private normalizeUrl(url: string): string {
        try {
          const u = new URL(url, this.context.baseUrl);
          return u.href;
        } catch {
          return url;
        }
    }

    private makeRelative(path: string): string {
        // Make path relative to current directory
        // For simplicity, return relative path from root
        return path.startsWith("/") ? path.slice(1) : path;
    }

    // ==================== Update Context ====================

    updateContext(updates: Partial<RewriteContext>): void {
        this.context = { ...this.context, ...updates };
    }
}
