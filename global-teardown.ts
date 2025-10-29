import { sendEmailReport } from './tests/UI_Tests/utils/sendEmailReport';
import fs from 'fs';
import path from 'path';

/**
 * Global teardown runs after ALL tests complete
 * Waits for custom reporter to finish, then sends email
 */
export default async function globalTeardown() {
   try {
    // Wait for custom reporter to write detailed-test-report.json
    const detailedReportPath = path.join(process.cwd(), 'detailed-test-report.json');
    let attempts = 0;
    const maxAttempts = 20; // Wait up to 10 seconds
    
    console.log('⏳ Waiting for custom reporter to generate detailed report...');
    console.log('');
    
    while (!fs.existsSync(detailedReportPath) && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    if (!fs.existsSync(detailedReportPath)) {
      console.warn('⚠️  Warning: detailed-test-report.json not found after waiting');
      console.warn('   Email will use basic test-results.json instead');
      console.log('');
    } else {
      console.log('✅ Detailed report found!');
      console.log('');
    }
    
    // Send email report
    console.log('📧 Sending email report...');
    await sendEmailReport();
    
    console.log('');
    console.log('✅ Global teardown completed successfully');
    console.log('');
  } catch (error) {
    console.error('❌ Error during global teardown:', error);
    // Don't throw - we don't want email failure to fail the test run
  }
}