import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';
import fs from 'fs';
import path from 'path';
import { sendEmailReport } from './sendEmailReport';

interface DetailedTestResult {
  testId: string;
  title: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'flaky' | 'interrupted';
  duration: number;
  retries: number;
  isFlaky: boolean;
  errors: Array<{
    message: string;
    stack?: string;
    location?: {
      file: string;
      line: number;
      column: number;
    };
  }>;
  steps: Array<{
    title: string;
    category: string;
    duration: number;
    error?: string;
  }>;
  stdout: string[];
  stderr: string[];
  attachments: Array<{
    name: string;
    contentType: string;
    path?: string;
  }>;
}

interface SuiteResult {
  suiteName: string;
  file: string;
  tests: DetailedTestResult[];
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  interrupted: number;
  total: number;
  duration: number;
}

class CustomEmailReporter implements Reporter {
  private suites: SuiteResult[] = [];
  private startTime: number = 0;
  private config: FullConfig | undefined;
  private allTests: Set<string> = new Set();
  private executedTests: Set<string> = new Set();

  onBegin(config: FullConfig, suite: Suite) {
    this.startTime = Date.now();
    this.config = config;
    
    // Track all tests that should run
    suite.allTests().forEach(test => {
      this.allTests.add(test.id);
    });
    
    console.log(`Starting test execution with ${suite.allTests().length} tests`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.executedTests.add(test.id);
    
    const suiteName = test.parent.title || 'Unnamed Suite';
    const fileName = test.location.file;

    // Find or create suite result
    let suiteResult = this.suites.find(s => s.file === fileName);
    if (!suiteResult) {
      suiteResult = {
        suiteName,
        file: fileName,
        tests: [],
        passed: 0,
        failed: 0,
        skipped: 0,
        flaky: 0,
        interrupted: 0,
        total: 0,
        duration: 0,
      };
      this.suites.push(suiteResult);
    }

    // Determine if test is flaky (passed after retry)
    const isFlaky = result.retry > 0 && result.status === 'passed';
    
    // Determine test status
    let status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'flaky' | 'interrupted';
    if (result.status === 'skipped') {
      status = 'skipped';
      suiteResult.skipped++;
    } else if (result.status === 'interrupted') {
      status = 'interrupted';
      suiteResult.interrupted++;
    } else if (result.status === 'timedOut') {
      status = 'timedOut';
      suiteResult.failed++;
    } else if (isFlaky) {
      status = 'flaky';
      suiteResult.flaky++;
      suiteResult.passed++; // Flaky tests eventually passed
    } else if (result.status === 'passed') {
      status = 'passed';
      suiteResult.passed++;
    } else {
      status = 'failed';
      suiteResult.failed++;
    }

    // Extract steps
    const steps = this.extractSteps(result.steps);

    // Extract errors
    const errors = result.errors.map(error => ({
      message: error.message || '',
      stack: error.stack,
      location: error.location,
    }));

    // Extract stdout and stderr
    const stdout = result.stdout.map(chunk => 
      typeof chunk === 'string' ? chunk : chunk.toString()
    );
    const stderr = result.stderr.map(chunk => 
      typeof chunk === 'string' ? chunk : chunk.toString()
    );

    // Extract attachments
    const attachments = result.attachments.map(att => ({
      name: att.name,
      contentType: att.contentType,
      path: att.path,
    }));

    const detailedResult: DetailedTestResult = {
      testId: test.id,
      title: test.title,
      file: path.basename(fileName),
      status,
      duration: result.duration,
      retries: result.retry,
      isFlaky,
      errors,
      steps,
      stdout,
      stderr,
      attachments,
    };

    suiteResult.tests.push(detailedResult);
    suiteResult.total++;
    suiteResult.duration += result.duration;
  }

  private extractSteps(steps: TestStep[]): Array<{
    title: string;
    category: string;
    duration: number;
    error?: string;
  }> {
    const extractedSteps: Array<{
      title: string;
      category: string;
      duration: number;
      error?: string;
    }> = [];

    const processStep = (step: TestStep, depth: number = 0) => {
      const indent = '  '.repeat(depth);
      extractedSteps.push({
        title: indent + step.title,
        category: step.category,
        duration: step.duration,
        error: step.error?.message,
      });

      // Process nested steps
      if (step.steps && step.steps.length > 0) {
        step.steps.forEach(childStep => processStep(childStep, depth + 1));
      }
    };

    steps.forEach(step => processStep(step));
    return extractedSteps;
  }

  async onEnd(result: FullResult) {
    const totalDuration = Date.now() - this.startTime;
    
    // Calculate tests that didn't run
    const notRun = this.allTests.size - this.executedTests.size;
    
    const reportData = {
      summary: {
        status: result.status,
        startTime: new Date(this.startTime).toISOString(),
        duration: totalDuration,
        totalTests: this.allTests.size,
        executed: this.executedTests.size,
        passed: this.suites.reduce((acc, s) => acc + s.passed, 0),
        failed: this.suites.reduce((acc, s) => acc + s.failed, 0),
        skipped: this.suites.reduce((acc, s) => acc + s.skipped, 0),
        flaky: this.suites.reduce((acc, s) => acc + s.flaky, 0),
        interrupted: this.suites.reduce((acc, s) => acc + s.interrupted, 0),
        notRun: notRun,
      },
      suites: this.suites,
      config: {
        workers: this.config?.workers,
        projects: this.config?.projects.map(p => p.name),
      },
    };

    // Write detailed report to JSON
    const reportPath = path.join(process.cwd(), 'detailed-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf-8');
    console.log(`\n✅ Detailed test report saved to: ${reportPath}`);
    console.log(`📊 Total: ${reportData.summary.totalTests} | ✅ Passed: ${reportData.summary.passed} | ❌ Failed: ${reportData.summary.failed} | ⏭️ Skipped: ${reportData.summary.skipped} | 🔄 Flaky: ${reportData.summary.flaky} | ⛔ Not Run: ${reportData.summary.notRun}`);
    
    // Send email report immediately after writing the detailed report
    console.log('\n📧 Sending email report from custom reporter...\n');
    try {
      await sendEmailReport();
      console.log('\n✅ Email sent successfully from custom reporter!\n');
    } catch (error) {
      console.error('\n❌ Error sending email from custom reporter:', error, '\n');
    }
  }
}

export default CustomEmailReporter;