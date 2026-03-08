import type { Page, Asset, DownloadedAsset, CapturedPage, FileManifest, StorageStats } from "../types/index.js";
import type { HtmlRewriter } from "../rewriter/html.js";
import { createHash, createFilename } from "./deduplication.js";
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
 * - Manifest Generation
 */

export class StorageManager {
    private outputDir: string;
    private assetsDir: string;
    private assetMap: Map<string, string> = new Map();
    private pageMap: Map<string, string> = new Map();
    private hashSet: Set<string> = new Set();
    private stats: StorageStats = {
        filesCreated: 0,
        totalSize: 0,
        duplicatesSkipped: 0,
    };
    private pages: CapturedPage[] = [];
    private assets: DownloadedAsset[] = [];

    constructor(outputDir: string){
        this.outputDir = outputDir;
        this.assetsDir = join(outputDir, "assets");
    }

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
        const localPath = this.getPagePath(page.url.original);
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
            ...page,
            localPath,
            assets: [],
        });
    }

    /**
     * Get local path for a page URL
     */
    private getPagePath(url: string): string {
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
            // Invalid URL, use hash-based filename
            return `pages/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`;
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
            const buffer = Buffer.isBuffer(asset.content)
                ? asset.content
                : Buffer.from(asset.content);

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

        return join("assets", subdir, filename);
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
        const cleanUrl = url.split(/[?#]/)[0];
        const ext = cleanUrl!.split(".").pop()?.toLowerCase();
        return ext ?? "";
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
