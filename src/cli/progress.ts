import type { CrawlResult, CrawlStats } from "../types/index.js";

/**
 * Progress Reporter
 * NOTE: ora (spinner) causes issues with Playwright browser navigation
 * Using simple console output instead
 */

export class ProgressReporter {
    private quiet: boolean;
    private verbose: boolean;
    private startTime: number = 0;
    private currentStatus: string = "";

    /**
     * Statistics Tracking
     */
    private stats: {
        pagesQueued: number;
        pagesVisited: number;
        pagesSucceeded: number;
        pagesFailed: number;
        assetsQueued: number;
        assetsDownloaded: number;
        assetsFailed: number;
    } = {
        pagesQueued: 0,
        pagesVisited: 0,
        pagesSucceeded: 0,
        pagesFailed: 0,
        assetsQueued: 0,
        assetsDownloaded: 0,
        assetsFailed: 0,
    };

    constructor(quiet: boolean, verbose: boolean) {
        this.quiet = quiet;
        this.verbose = verbose;
    }

    /**
     * Lifecycle
     */
    start(message: string): void {
        this.startTime = Date.now();
        this.log(`[START] ${message}`);
    }

    complete(result: CrawlResult): void {
        const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
        this.log(`[COMPLETE] Completed in ${duration}s`);
        if (!this.quiet) {
            this.printSummary(result);
        }
    }

    error(error: Error) {
        console.error(`[ERROR] ${error.message}`);
        if (!this.quiet) {
            console.error(error);
        }
    }

    /**
     * Page Events
     * @Functions
     * pageQueued, pageVisitStart, pageVisitSuccess, pageVisitFailed
     */

    pageQueued(url: string, total: number): void {
        this.stats.pagesQueued++;
        this.updateStatus(`Queueing: ${this.stats.pagesQueued} pages`);
        this.verboseLog(`[QUEUE] ${url}`);
    }

    pageVisitStart(url: string): void {
        this.stats.pagesVisited++;
        // Don't update status during navigation - can interfere with browser
        this.verboseLog(`[VISIT] ${url}`);
    }

    pageVisitSuccess(url: string, assetsFound: number): void {
        this.stats.pagesSucceeded++;
        this.verboseLog(`[OK] ${url} (${assetsFound} assets)`);
    }

    pageVisitFailed(url: string, error: string): void {
        this.stats.pagesFailed++;
        this.verboseLog(`[FAIL] ${url} - ${error}`, true);
    }

    /**
     * Asset Events
     */
    assetQueued(url: string): void {
        this.stats.assetsQueued++;
    }

    assetDownloadStart(url: string): void {
        if (this.verbose) {
            this.updateStatus(`Downloading: ${this.stats.assetsDownloaded}/${this.stats.assetsQueued} assets`);
        }
    }

    assetDownloadSuccess(url: string, size: number): void {
        this.stats.assetsDownloaded++;
        this.verboseLog(`[ASSET] ${url} (${formatBytes(size)})`);
    }

    assetDownloadFailed(url: string, error: string): void {
        this.stats.assetsFailed++;
        this.verboseLog(`[ASSET FAIL] ${url} - ${error}`, true);
    }

    assetSkipped(url: string, reason: "duplicate" | "type" | "size"): void {
        this.verboseLog(`[SKIP] ${url} (${reason})`);
    }

    /**
     * Rewrite Events
     */
    assetRewriteStart(): void {
        this.log("[REWRITE] Rewriting asset URLs in CSS and JS files...");
    }

    assetRewriteComplete(): void {
        this.verboseLog("[REWRITE] Complete");
    }

    /**
     * Network Events
     */
    networkRequest(url: string, method: string): void {
        this.verboseLog(`[REQ] ${method} ${url}`);
    }

    networkResponse(url: string, status: number, size: number): void {
        this.verboseLog(`[RES] ${status} ${url} (${formatBytes(size)})`);
    }

    /**
     * Browser Events
     */
    browserLaunch(): void {
        this.verboseLog("[BROWSER] Launching...");
    }

    browserClose(): void {
        this.verboseLog("[BROWSER] Closed");
    }

    spaNavigation(url: string): void {
        this.verboseLog(`[SPA] Navigated to ${url}`);
    }

    /**
     * Helper Methods
     */
    private updateStatus(text: string): void {
        if (this.quiet) return;
        // Clear previous line and write new status
        if (this.currentStatus) {
            process.stdout.write("\r" + " ".repeat(this.currentStatus.length) + "\r");
        }
        process.stdout.write(`\r${text}`);
        this.currentStatus = text;
    }
    
    private verboseLog(message: string, isError = false): void {
        if (this.verbose) {
          const logMethod = isError ? console.error : console.log;
          logMethod(message);
        }
    }
    
    private log(message: string): void {
        if (!this.quiet) {
          console.log(message);
        }
    }

    private printSummary(result: CrawlResult): void {
        console.log("\n" + "=".repeat(50));
        console.log("CRAWL SUMMARY");
        console.log("=".repeat(50));

        console.log("\nPages:");
        console.log(`  Total:      ${result.stats.pagesTotal}`);
        console.log(`  Successful: ${result.stats.pagesSuccessful}`);
        console.log(`  Failed:     ${result.stats.pagesFailed}`);

        console.log("\nAssets:");
        console.log(`  Total:      ${result.stats.assetsTotal}`);
        console.log(`  Successful: ${result.stats.assetsSuccessful}`);
        console.log(`  Failed:     ${result.stats.assetsFailed}`);

        console.log("\nData:");
        console.log(`  Downloaded: ${formatBytes(result.stats.bytesDownloaded)}`);
        console.log(`  Duration:   ${result.duration.toFixed(2)}s`);

        // Get the main HTML file path (index.html or first page)
        const mainPage = result.pages.find(p => p.localPath.endsWith('index.html')) || result.pages[0];
        if (mainPage) {
            const absolutePath = this.getAbsolutePath(mainPage.localPath);
            console.log("\n" + "▶".repeat(25));
            console.log(`  OPEN: ${absolutePath}`);
            console.log("▶".repeat(25));
        }

        console.log("\n" + "=".repeat(50) + "\n");
    }

    /**
     * Convert relative path to absolute file:// URL for clicking
     */
    private getAbsolutePath(relativePath: string): string {
        // On Windows, convert to absolute path with file:// protocol for clicking
        if (process.platform === 'win32') {
            const absolute = relativePath.startsWith('/')
                ? relativePath
                : `/${relativePath}`;
            // Replace / with \ for Windows paths, but keep file:/// prefix
            return `file:///${absolute.replace(/\//g, '\\')}`;
        }
        // Unix-like systems
        const cwd = process.cwd();
        const absolute = relativePath.startsWith('/')
            ? relativePath
            : `${cwd}/${relativePath}`;
        return `file://${absolute}`;
    }

    /**
     * Getters
     */
    getStats() {
        return { ...this.stats };
    }
}

/**
 * Utility Function
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
  
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}