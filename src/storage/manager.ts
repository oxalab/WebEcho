import type { Page, Asset, DownloadedAsset, CapturedPage, FileManifest, StorageStats, RewriteContext } from "../types/index.js";
import type { HtmlRewriter } from "../rewriter/html.js";
import { createHash, createFilename } from "./deduplication.js";
import { CssRewriter } from "../rewriter/css.js";
import { JsRewriter } from "../rewriter/js.js";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Storage Manager

/**
 * Manages files system operation for storing crawled content
 *
 * Features:
 * - Directory structure creation
 * - Asset deduplication via hash
 * - URL-to-path mapping
 * - CSS URL rewriting
 * - JS URL rewriting (for Next.js, SPA bundles)
 * - Manifest Generation
 */

export class StorageManager {
    private outputDir: string;
    private assetsDir: string;
    private assetMap: Map<string, string> = new Map();
    private pageMap: Map<string, string> = new Map();
    private hashSet: Set<string> = new Set();
    private rewriteContext: RewriteContext;
    private cssRewriter: CssRewriter;
    private jsRewriter: JsRewriter;
    private stats: StorageStats = {
        filesCreated: 0,
        totalSize: 0,
        duplicatesSkipped: 0,
    };

    constructor(outputDir: string, rewriteContext: RewriteContext) {
        this.outputDir = outputDir;
        this.assetsDir = join(outputDir, "assets");
        this.rewriteContext = rewriteContext;
        this.cssRewriter = new CssRewriter(rewriteContext);
        this.jsRewriter = new JsRewriter(rewriteContext);
    }

    private pages: CapturedPage[] = [];
    private assets: DownloadedAsset[] = [];

    // Intialization
    async init(): Promise<void> {
        await this.ensureDir(this.outputDir);
        await this.ensureDir(this.assetsDir);
        // Create asset subdirectories
        await this.ensureDir(join(this.assetsDir, "css"));
        await this.ensureDir(join(this.assetsDir, "js"));
        await this.ensureDir(join(this.assetsDir, "img"));
        await this.ensureDir(join(this.assetsDir, "fonts"));
        await this.ensureDir(join(this.assetsDir, "api"));
        await this.ensureDir(join(this.assetsDir, "media"));
    }

    // Pages Storage

    /**
     * Store a page with rewritten URLs
     */
    async storePage(page: Page, rewriter: HtmlRewriter): Promise<void> {
        const localPath = await this.getPagePath(page.url.original);
        rewriter.updateContext({
            baseUrl: page.url.original,
            outputDir: this.outputDir,
            assetMap: this.assetMap,
            pageMap: this.pageMap,
        });

        // Rewrite HTML
        const rewrittenHtml = rewriter.rewrite(page.html);
        const dir = localPath.split("/").slice(0, -1).join("/");
        await this.ensureDir(join(this.outputDir, dir));

        const filePath = join(this.outputDir, localPath);
        await writeFile(filePath, rewrittenHtml, "utf-8");

        this.stats.filesCreated++;
        this.stats.totalSize += rewrittenHtml.length;

        this.pageMap.set(page.url.original, localPath);

        this.pages.push({
            url: page.url,
            html: page.html,
            links: page.links,
            spaRoutes: page.spaRoutes,
            title: page.title,
            timestamp: page.timestamp,
            localPath,
            assets: [],
        });
    }

    /**
     * Get local path for a page URL
     */
    private async getPagePath(url: string): Promise<string> {
        try {
            const parsed = new URL(url);
            const pathname = parsed.pathname;

            if(pathname === "/" || pathname === ""){
                return "index.html";
            }
            if(pathname.endsWith(".html")){
                return pathname.slice(1);
            }
            return `${pathname.slice(1)}/index.html`;
        } catch {
            // Invalid URL, use hash-based filename (async import)
            const { createUrlHash } = await import("./deduplication.js");
            const hash = await createUrlHash(url);
            return `pages/${hash}.html`;
        }
    }

    // Asset Storage
    /**
     * Store an asset with deduplication
     */
    async storeAsset(asset: Asset): Promise<DownloadedAsset>{
        const existing = this.assetMap.get(asset.url);
        if(existing){
            const storedAsset = this.assets.find((a) => a.url === asset.url);
            if(storedAsset){
                return storedAsset;
            }
        }
        const hash = asset.hash ?? await createHash(asset.content ?? "");
        if(this.hashSet.has(hash)){
            this.stats.duplicatesSkipped++;
            const existingAsset = this.assets.find((a) => a.hash === hash);
            if(existingAsset){
                this.assetMap.set(asset.url, existingAsset.localPath);
                return existingAsset;
            }
        }

        const localPath = this.getAssetPath(asset.url, asset.type, hash);

        if(asset.content){
            let buffer = Buffer.isBuffer(asset.content)
                ? asset.content
                : Buffer.from(asset.content);

            // Don't rewrite CSS during download - will be rewritten after all assets are downloaded
            // This ensures all referenced assets (fonts, etc.) are in the assetMap

            const filePath = join(this.outputDir, localPath);
            await writeFile(filePath, buffer);
        }

        this.hashSet.add(hash);
        this.stats.filesCreated++;
        this.stats.totalSize += asset.size;

        const downloaded: DownloadedAsset = {
            ...asset,
            localPath,
            hash,
            downloadedAt: new Date(),
        };

        this.assets.push(downloaded);
        this.assetMap.set(asset.url, localPath);
        return downloaded;
    }
    /**
     * Get local path for an asset URL
     */
    private getAssetPath(url: string, type: string, hash: string): string {
        // Get extension from URL
        const ext = this.getExtension(url);

        // Determine subdirectory
        const subdir = this.getTypeSubdir(type);

        // Use hash filename
        const filename = ext ? `${hash}.${ext}` : hash;

        // Use forward slashes for web compatibility (not system path separators)
        return `assets/${subdir}/${filename}`;
    }

    private getTypeSubdir(type: string): string {
        const subdirMap: Record<string, string> = {
        css: "css",
        js: "js",
        image: "img",
        font: "fonts",
        api: "api",
        media: "media",
        document: "documents",
        };

        return subdirMap[type] ?? "other";
    }

    private getExtension(url: string): string {
        // Parse URL properly to get the pathname
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            // Get the last segment of the path
            const filename = pathname.split("/").pop() ?? "";
            // Extract extension from filename (if any)
            const parts = filename.split(".");
            if (parts.length > 1) {
                return parts.pop()?.toLowerCase() ?? "";
            }
            return "";
        } catch {
            // Fallback for invalid URLs
            const cleanUrl = url.split(/[?#]/)[0] ?? "";
            const filename = cleanUrl.split("/").pop() ?? "";
            const parts = filename.split(".");
            if (parts.length > 1) {
                return parts.pop()?.toLowerCase() ?? "";
            }
            return "";
        }
    }

    // Queries

    /**
     * Check if asset has been stored
     */
    async hasAsset(url: string): Promise<boolean>{
        return this.assetMap.has(url);
    }

    /**
     * Get Asset Count
     */
    async getAssetCount(): Promise<number> {
        return this.assets.length;
    }

    /**
     * Rewrite CSS files with current assetMap (call after all assets downloaded)
     * This fixes font URLs and other asset references in CSS
     */
    async rewriteCssFiles(): Promise<void> {
        const cssAssets = this.assets.filter(a => a.type === 'css');
        const { readFile, writeFile } = await import('node:fs/promises');

        for (const cssAsset of cssAssets) {
            const filePath = join(this.outputDir, cssAsset.localPath);
            try {
                const content = await readFile(filePath, 'utf-8');
                // Update CSS rewriter with current assetMap
                this.cssRewriter.updateContext({ assetMap: this.assetMap });
                const rewritten = this.cssRewriter.rewrite(content);
                await writeFile(filePath, rewritten, 'utf-8');
            } catch (error) {
                // File might not exist or other error, skip
                console.warn(`Failed to rewrite CSS file ${cssAsset.localPath}:`, (error as Error).message);
            }
        }
    }

    /**
     * Rewrite JS files with current assetMap (call after all assets downloaded)
     * This fixes:
     * - Next.js /_next/static/ and /_next/data/ paths
     * - Relative imports in bundled code
     * - Dynamic import() paths
     * - fetch() URLs for same-origin requests
     */
    async rewriteJsFiles(): Promise<void> {
        const jsAssets = this.assets.filter(a => a.type === 'js');
        const { readFile, writeFile } = await import('node:fs/promises');

        for (const jsAsset of jsAssets) {
            const filePath = join(this.outputDir, jsAsset.localPath);
            try {
                const content = await readFile(filePath, 'utf-8');
                // Update JS rewriter with current assetMap
                this.jsRewriter.updateContext({
                    assetMap: this.assetMap,
                    baseUrl: this.rewriteContext.baseUrl,
                    outputDir: this.outputDir,
                    pageMap: this.pageMap,
                });
                // Pass the original URL to help resolve relative paths
                const rewritten = this.jsRewriter.rewrite(content, jsAsset.url);
                await writeFile(filePath, rewritten, 'utf-8');
            } catch (error) {
                // File might not exist or other error, skip
                console.warn(`Failed to rewrite JS file ${jsAsset.localPath}:`, (error as Error).message);
            }
        }
    }

    /**
     * Get all captured pages
     */
    async getCapturedPages(): Promise<CapturedPage[]> {
        return this.pages;
    }

    /**
     * Get all downloaded assets
     */
    async getDownloadedAssets(): Promise<DownloadedAsset[]> {
        return this.assets;
    }

    /**
     * Get storage stats
     */
    getStats(): StorageStats {
        return { ...this.stats};
    }

    /**
     * Get asset map (for rewriter)
     */
    getAssetMap(): Map<string, string>{
        return new Map(this.assetMap);
    }

    /**
     * Get page map (for rewriter)
     */
    getPageMap(): Map<string, string> {
        return new Map(this.pageMap);
    }

    // Manifest

    /**
     * Generate file manifest
     */
    async generateManifest(baseUrl: string): Promise<FileManifest> {
        return {
            version: "1.0",
            baseUrl,
            generatedAt: new Date().toISOString(),
            pages: this.pages.map((p) => ({
                url: p.url.original,
                path: p.localPath
            })),
            assets: this.assets.map((a) => ({
                url: a.url,
                path: a.localPath,
                hash: a.hash,
            })),
        };
    }

    /**
     * Write manifest to a file
     */
    async writeManifest(manifest: FileManifest): Promise<void> {
        const manifestPath = join(this.outputDir, "webecho-manifest.json");
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    }

    // Utility
    private async ensureDir(path: string): Promise<void> {
        if(!existsSync(path)){
            await mkdir(path, {recursive: true});
        }
    }

    /**
     * Clean output directory
     */
    async clean(): Promise<void> {
        // Note: This would use rm -rf equivalent
        // Implementation depends on whether you want full deletion
        // For safety, could require user confirmation
    }
}
