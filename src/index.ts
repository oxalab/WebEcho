// =====================================================
// WebEcho - CLI Entry Point
// =====================================================

/**
 * WebEcho - Developer-grade website replication engine
 *
 * Usage:
 *   bun run index.ts clone <url> [output] [options]
 *
 * Examples:
 *   bun run index.ts clone https://example.com
 *   bun run index.ts clone https://example.com ./my-clone
 *   bun run index.ts clone https://example.com ./my-clone --depth 2 --max-pages 50
 */

import { createCli } from "./cli/commands.js";

// ==================== Main Entry ====================

async function main(): Promise<void> {
  const program = createCli();

  // Parse and execute
  await program.parseAsync(process.argv);
}

// ==================== Error Handling ====================

process.on("unhandledRejection", (error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\nInterrupted by user");
  process.exit(0);
});

// ==================== Run ====================

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
