/**
 * Generate Email Report from test-results.json
 * This script converts the standard Playwright JSON report to our detailed format
 * and sends the email
 */

import fs from 'fs';
import path from 'path';
import { sendEmailReport } from './utils/sendEmailReport';

interface PlaywrightTestResult {
  status: string;
  duration: number;
  errors: any[];
  stdout?: any[];
  stderr?: any[];
  attachments: any[];
}

interface PlaywrightTest {
  testId?: string;
  title: string;
  results: PlaywrightTestResult[];
  location?: {
    file: string;
    line: number;
    column: number;
  };
}

interface PlaywrightSpec {
  title: string;
  ok: boolean;
  tags: string[];
  tests: PlaywrightTest[];
}

interface PlaywrightSuite {
  title: string;
  file?: string;
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightReport {
  config: any;
  suites: PlaywrightSuite[];
  stats?: {
    startTime: string;
    duration: number;
    expected: number;
    unexpected: number;
    flaky: number;
    skipped: number;
  };
}

function flattenSuites(suite: PlaywrightSuite, allTests: any[] = [], suitePath: string = ''): any[] {
  const currentPath = suitePath ? `${suitePath} › ${suite.title}` : suite.title;
  const fileName = suite.file || 'unknown';
  
  // Handle specs (new Playwright format)
  if (suite.specs && suite.specs.length > 0) {
    suite.specs.forEach(spec => {
      if (spec.tests && spec.tests.length > 0) {
        spec.tests.forEach(test => {
          if (test.results && test.results.length > 0) {
            const lastResult = test.results[test.results.length - 1];
            const isFlaky = test.results.length > 1 && lastResult.status === 'passed';
            
            allTests.push({
              testId: test.testId || '',
              title: spec.title,
              file: fileName,
              suiteName: currentPath,
              status: isFlaky ? 'flaky' : lastResult.status,
              duration: lastResult.duration || 0,
              retries: test.results.length - 1,
              isFlaky: isFlaky,
              errors: lastResult.errors || [],
              steps: [],
              stdout: (lastResult.stdout || []).map((s: any) => s.text || s).filter(Boolean),
              stderr: (lastResult.stderr || []).map((s: any) => s.text || s).filter(Boolean),
              attachments: lastResult.attachments || [],
            });
          }
        });
      }
    });
  }
  
  // Recursively process child suites
  if (suite.suites && suite.suites.length > 0) {
    suite.suites.forEach(childSuite => {
      flattenSuites(childSuite, allTests, currentPath);
    });
  }
  
  return allTests;
}

async function generateDetailedReport() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  GENERATING DETAILED TEST REPORT                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    // Read test-results.json with retry mechanism
    const testResultsPath = path.join(process.cwd(), 'test-results.json');
    
    // Wait for test-results.json to be written (up to 5 seconds)
    let attempts = 0;
    const maxAttempts = 10;
    while (!fs.existsSync(testResultsPath) && attempts < maxAttempts) {
      console.log(`⏳ Waiting for test-results.json... (attempt ${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }
    
    if (!fs.existsSync(testResultsPath)) {
      console.error('❌ test-results.json not found after waiting!');
      console.error('   This might be because no tests were run.');
      console.error('   Skipping email report...');
      process.exit(0); // Exit gracefully instead of error
    }

    const rawData = fs.readFileSync(testResultsPath, 'utf-8');
    const playwrightReport: PlaywrightReport = JSON.parse(rawData);

    console.log('✅ Loaded test-results.json');

    // Flatten all tests from all suites
    const allTests: any[] = [];
    playwrightReport.suites.forEach(suite => {
      flattenSuites(suite, allTests);
    });

    console.log(`📊 Found ${allTests.length} tests`);

    // Group tests by file/suite
    const suiteMap = new Map<string, any>();
    
    allTests.forEach(test => {
      const key = test.file || 'unknown';
      if (!suiteMap.has(key)) {
        suiteMap.set(key, {
          suiteName: test.suiteName || path.basename(key, '.spec.ts'),
          file: key,
          tests: [],
          passed: 0,
          failed: 0,
          skipped: 0,
          flaky: 0,
          interrupted: 0,
          total: 0,
          duration: 0,
        });
      }
      
      const suite = suiteMap.get(key);
      suite.tests.push(test);
      suite.total++;
      suite.duration += test.duration;
      
      if (test.isFlaky) {
        suite.flaky++;
      } else if (test.status === 'passed') {
        suite.passed++;
      } else if (test.status === 'failed') {
        suite.failed++;
      } else if (test.status === 'skipped') {
        suite.skipped++;
      } else if (test.status === 'interrupted' || test.status === 'timedOut') {
        suite.interrupted++;
      }
    });

    const suites = Array.from(suiteMap.values());

    // Calculate summary
    const summary = {
      status: playwrightReport.stats?.unexpected === 0 ? 'passed' : 'failed',
      startTime: playwrightReport.stats?.startTime || new Date().toISOString(),
      duration: playwrightReport.stats?.duration || suites.reduce((acc, s) => acc + s.duration, 0),
      totalTests: allTests.length,
      executed: allTests.length,
      passed: suites.reduce((acc, s) => acc + s.passed, 0),
      failed: suites.reduce((acc, s) => acc + s.failed, 0),
      skipped: suites.reduce((acc, s) => acc + s.skipped, 0),
      flaky: suites.reduce((acc, s) => acc + s.flaky, 0),
      interrupted: suites.reduce((acc, s) => acc + s.interrupted, 0),
      notRun: 0,
    };

    const detailedReport = {
      summary,
      suites,
      config: {
        workers: playwrightReport.config?.workers,
        projects: playwrightReport.config?.projects?.map((p: any) => p.name) || [],
      },
    };

    // Write detailed report
    const detailedReportPath = path.join(process.cwd(), 'detailed-test-report.json');
    fs.writeFileSync(detailedReportPath, JSON.stringify(detailedReport, null, 2), 'utf-8');
    
    console.log('');
    console.log(`✅ Detailed test report saved to: ${detailedReportPath}`);
    console.log(`📊 Total: ${summary.totalTests} | ✅ Passed: ${summary.passed} | ❌ Failed: ${summary.failed} | ⏭️ Skipped: ${summary.skipped} | 🔄 Flaky: ${summary.flaky}`);
    console.log('');

    // Now send the email
    console.log('📧 Sending email report...');
    await sendEmailReport();
    
    console.log('');
    console.log('✅ Email report sent successfully!');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ Error generating report:', error);
    console.error('');
    process.exit(1);
  }
}

generateDetailedReport();