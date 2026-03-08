import ora, { type Ora } from "ora";
import type { CrawlResult, CrawlStats } from "../types";

/**
 * Progress Reporter
 */

export class ProgressReporter {
    private spinner: Ora | null;
    private quiet: boolean;
    private verbose: boolean;
    private startTime: number = 0;

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
        this.spinner = quiet ? null : ora();
    }

    /**
     * Lifecycle
     */
    start(message: string): void {
        this.startTime = Date.now();
        this.spinner?.start(message);
        this.log(`[START] ${message}`);
    }

    complete(result: CrawlResult): void {
        const duration = ((Date.now() - this.startTime) /1000).toFixed(2);
        this.spinner?.succeed(`Completed in ${duration}`);
        if(!this.quiet){
            this.printSummary(result);
        }
    }
    
    error(error: Error){
        this.spinner?.fail(error.message);
        console.error(error)
    }

    /**
     * Page Events
     * @Functions
     * pageQueued, pageVisitStart, pageVisitSuccess, pageVisitFailed
     */

    pageQueued(url: string, total: number): void {
        this.stats.pagesQueued++;
        this.updateSpinner(`Queueing pages: ${this.stats.pagesQueued}`);
        this.verboseLog(`[QUEUE] ${url}`);
    }
    
    pageVisitStart(url: string): void {
        this.stats.pagesVisited++;
        this.updateSpinner(`Crawling: ${this.stats.pagesVisited}/${this.stats.pagesQueued} pages`);
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

    assetDownloadStart(url: string): void{
        if(this.verbose){
            this.updateSpinner(`Downloading: ${this.stats.assetsDownloaded}/${this.stats.assetsQueued} assets`);
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
     * Network Events
     */
    networkRequest(url: string, method: string): void {
        this.verboseLog(`[REQ] ${method} ${url}`);
    }
    
    networkResponse(url: string, status: number, size: number): void {
        this.verboseLog(`[RES] ${status} ${url} (${formatBytes(size)})`);
    }

    /**
     * Broswer Events
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
    private updateSpinner(text: string): void {
        if (this.spinner && !this.spinner.isSpinning) {
          this.spinner.start();
        }
        this.spinner!.text = text;
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
    
        console.log("\nOutput:");
        console.log(`  Directory: ${result.pages[0]?.localPath.split("/").slice(0, -1).join("/") || "N/A"}`);
    
        console.log("\n" + "=".repeat(50) + "\n");
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