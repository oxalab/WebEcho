@echo off
:: WebEcho CLI wrapper for Windows
:: Uses npx tsx to run TypeScript
npx tsx "%~dp0\..\src\index.ts" %*
