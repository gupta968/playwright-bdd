import { FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Global setup runs before ANY tests start
 * Cleans up old report files to ensure fresh data
 */
async function globalSetup(config: FullConfig) {
 
  const detailedReportPath = path.join(process.cwd(), 'detailed-test-report.json');
  if (fs.existsSync(detailedReportPath)) {
    fs.unlinkSync(detailedReportPath);
    console.log('🗑️  Deleted old detailed-test-report.json');
  }
  
  
  console.log('✅ Global setup completed - Ready for fresh test run');
  console.log('');
}

export default globalSetup;