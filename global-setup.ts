import { FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Global setup runs before ANY tests start
 * Cleans up old report files to ensure fresh data
 */
async function globalSetup(config: FullConfig) {
 
  // Delete old detailed report if exists
  const detailedReportPath = path.join(process.cwd(), 'detailed-test-report.json');
  if (fs.existsSync(detailedReportPath)) {
    fs.unlinkSync(detailedReportPath);
    console.log('🗑️  Deleted old detailed-test-report.json');
  }
  
  // DO NOT delete test-results.json here - it will be overwritten by JSON reporter
  // The JSON reporter writes AFTER globalTeardown, so we can't rely on it being fresh
  
  console.log('✅ Global setup completed - Ready for fresh test run');
  console.log('');
}

export default globalSetup;