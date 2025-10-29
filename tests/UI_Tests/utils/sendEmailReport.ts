import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";

interface DetailedTestResult {
  testId: string;
  title: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'flaky' | 'interrupted';
  duration: number;
  retries: number;
  isFlaky?: boolean;
  errors: Array<{
    message: string;
    stack?: string;
    location?: { file: string; line: number; column: number };
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
  flaky?: number;
  interrupted?: number;
  total: number;
  duration: number;
}

interface DetailedReport {
  summary: {
    status: string;
    startTime: string;
    duration: number;
    totalTests: number;
    executed?: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky?: number;
    interrupted?: number;
    notRun?: number;
  };
  suites: SuiteResult[];
  config?: {
    workers?: number;
    projects?: string[];
  };
}

export async function sendEmailReport() {
   // Try to use detailed report first (from custom reporter)
  const detailedReportPath = path.join(process.cwd(), "detailed-test-report.json");
  const basicReportPath = path.join(process.cwd(), "test-results.json");
  
  let emailBody: string;
  let subject: string;
  
  if (fs.existsSync(detailedReportPath)) {
    console.log("✅ Using detailed test report (comprehensive data)");
    const report: DetailedReport = JSON.parse(fs.readFileSync(detailedReportPath, "utf-8"));
    emailBody = generateUltimateEmailHTML(report);
    
    const date = new Date(report.summary.startTime).toLocaleDateString();
    subject = `Solution Builder Test Report - ${date}`;
  } else if (fs.existsSync(basicReportPath)) {
    console.log("⚠️ Detailed report not found, using basic test-results.json");
    emailBody = generateBasicEmailHTML(basicReportPath);
    subject = `Solution Builder Test Report - ${new Date().toLocaleDateString()}`;
  } else {
    console.error("❌ No test results found!");
    return;
  }
  
  await sendEmail(subject, emailBody);
}

// Generate grid matrix rows for all tests
function generateTestMatrixRows(suites: SuiteResult[]): string {
  let rowNumber = 1;
  const rows: string[] = [];
  
  // Group tests by test case ID (file name)
  const testCaseMap = new Map<string, {
    testCaseId: string;
    tests: DetailedTestResult[];
    totalDuration: number;
    overallStatus: string;
  }>();
  
  suites.forEach(suite => {
    suite.tests.forEach(test => {
      // Extract test case ID from file name (e.g., RIPA-14860 from the file path)
      const fileNameMatch = test.file.match(/RIPA-\d+/);
      const testCaseId = fileNameMatch ? fileNameMatch[0] : suite.suiteName || 'Unknown';
      
      if (!testCaseMap.has(testCaseId)) {
        testCaseMap.set(testCaseId, {
          testCaseId,
          tests: [],
          totalDuration: 0,
          overallStatus: 'passed'
        });
      }
      
      const testCase = testCaseMap.get(testCaseId)!;
      testCase.tests.push(test);
      testCase.totalDuration += test.duration;
      
      // Update overall status (failed takes precedence)
      if (test.status === 'failed') {
        testCase.overallStatus = 'failed';
      } else if (test.status === 'skipped' && testCase.overallStatus !== 'failed') {
        testCase.overallStatus = 'skipped';
      }
    });
  });
  
  // Generate rows for each test case
  testCaseMap.forEach((testCase) => {
    const statusColor = getStatusColor(testCase.overallStatus);
    const statusIcon = getStatusIcon(testCase.overallStatus);
    const statusText = testCase.overallStatus.toUpperCase();
    const durationText = (testCase.totalDuration / 1000).toFixed(2) + 's';
    
    // Count scenarios
    const totalScenarios = testCase.tests.length;
    const passedScenarios = testCase.tests.filter(t => t.status === 'passed').length;
    const failedScenarios = testCase.tests.filter(t => t.status === 'failed').length;
    const skippedScenarios = testCase.tests.filter(t => t.status === 'skipped').length;
    
    const scenarioText = `${totalScenarios} scenarios (${passedScenarios} passed, ${failedScenarios} failed, ${skippedScenarios} skipped)`;
    
    // Alternate row colors for better readability
    const rowBg = rowNumber % 2 === 0 ? '#f8f9fa' : '#ffffff';
    
    rows.push(`
      <tr style="background: ${rowBg}; transition: all 0.2s ease;" onmouseover="this.style.background='#e3f2fd'" onmouseout="this.style.background='${rowBg}'">
        <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #495057; text-align: center;">${rowNumber}</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; font-weight: 600; color: #212529; font-size: 14px;">${escapeHtml(testCase.testCaseId)}</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; text-align: center;">
          <span style="display: inline-block; padding: 6px 16px; border-radius: 20px; background: ${statusColor}; color: white; font-weight: 700; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            ${statusIcon} ${statusText}
          </span>
        </td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; text-align: center; font-weight: 600; color: #6c757d; font-family: monospace;">${durationText}</td>
        <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; color: #6c757d; font-size: 13px;">${escapeHtml(scenarioText)}</td>
      </tr>
    `);
    rowNumber++;
  });
  
  if (rows.length === 0) {
    return `<tr><td colspan="5" style="padding: 20px; text-align: center; color: #6c757d;">No tests found</td></tr>`;
  }
  
  return rows.join('');
}

// Get status color for badges
function getStatusColor(status: string): string {
  switch (status) {
    case 'passed': return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    case 'failed': return 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    case 'skipped': return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
    case 'timedOut': return 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)';
    case 'flaky': return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
    case 'interrupted': return 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)';
    default: return 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
  }
}

function generateUltimateEmailHTML(report: DetailedReport): string {
  const { summary, suites } = report;
  
  // Calculate test case statistics (group by test case ID, not individual scenarios)
  const testCaseMap = new Map<string, {
    testCaseId: string;
    tests: DetailedTestResult[];
    overallStatus: string;
  }>();
  
  suites.forEach(suite => {
    suite.tests.forEach(test => {
      // Extract test case ID from file name (e.g., RIPA-14860)
      const fileNameMatch = test.file.match(/RIPA-\d+/);
      const testCaseId = fileNameMatch ? fileNameMatch[0] : suite.suiteName || 'Unknown';
      
      if (!testCaseMap.has(testCaseId)) {
        testCaseMap.set(testCaseId, {
          testCaseId,
          tests: [],
          overallStatus: 'passed'
        });
      }
      
      const testCase = testCaseMap.get(testCaseId)!;
      testCase.tests.push(test);
      
      // Update overall status (failed takes precedence)
      if (test.status === 'failed') {
        testCase.overallStatus = 'failed';
      } else if (test.status === 'skipped' && testCase.overallStatus !== 'failed') {
        testCase.overallStatus = 'skipped';
      }
    });
  });
  
  // Count test cases by status
  const totalTestCases = testCaseMap.size;
  const passedTestCases = Array.from(testCaseMap.values()).filter(tc => tc.overallStatus === 'passed').length;
  const failedTestCases = Array.from(testCaseMap.values()).filter(tc => tc.overallStatus === 'failed').length;
  const skippedTestCases = Array.from(testCaseMap.values()).filter(tc => tc.overallStatus === 'skipped').length;
  
  // Calculate start and end times
  const startTime = new Date(summary.startTime);
  const endTime = new Date(startTime.getTime() + summary.duration);
  
  const executionDate = startTime.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  const startTimeFormatted = startTime.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  
  const endTimeFormatted = endTime.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  
  const durationInSeconds = (summary.duration / 1000).toFixed(2);
  const passRate = totalTestCases > 0 
    ? ((passedTestCases / totalTestCases) * 100).toFixed(1) 
    : '0';
  const overallStatusColor = failedTestCases > 0 ? '#dc3545' : '#28a745';
  const overallStatusIcon = '📊'; // Changed to neutral report icon
  const overallStatus = failedTestCases > 0 ? 'FAILED' : 'PASSED';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Execution Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 20px;
      line-height: 1.6;
    }
    
    .email-container {
      max-width: 1200px;
      margin: 0 auto;
      background: #adb5bd;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
      animation: slideIn 0.5s ease-out;
    }
    
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 25px 40px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    
    .header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 120"><path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" opacity=".25" fill="%23ffffff"/><path d="M0,0V15.81C13,36.92,27.64,56.86,47.69,72.05,99.41,111.27,165,111,224.58,91.58c31.15-10.15,60.09-26.07,89.67-39.8,40.92-19,84.73-46,130.83-49.67,36.26-2.85,70.9,9.42,98.6,31.56,31.77,25.39,62.32,62,103.63,73,40.44,10.79,81.35-6.69,119.13-24.28s75.16-39,116.92-43.05c59.73-5.85,113.28,22.88,168.9,38.84,30.2,8.66,59,6.17,87.09-7.5,22.43-10.89,48-26.93,60.65-49.24V0Z" opacity=".5" fill="%23ffffff"/><path d="M0,0V5.63C149.93,59,314.09,71.32,475.83,42.57c43-7.64,84.23-20.12,127.61-26.46,59-8.63,112.48,12.24,165.56,35.4C827.93,77.22,886,95.24,951.2,90c86.53-7,172.46-45.71,248.8-84.81V0Z" fill="%23ffffff"/></svg>') no-repeat center bottom;
      background-size: cover;
      opacity: 0.1;
    }
    
    .header h1 {
      font-size: 42px;
      font-weight: 800;
      margin-bottom: 8px;
      text-shadow: 0 2px 10px rgba(0,0,0,0.2);
      position: relative;
      z-index: 1;
    }
    
    .header .subtitle {
      font-size: 18px;
      opacity: 0.95;
      font-weight: 500;
      margin-bottom: 5px;
      position: relative;
      z-index: 1;
    }
    
    .header .date {
      font-size: 14px;
      opacity: 0.85;
      margin-top: 5px;
      font-weight: 400;
      position: relative;
      z-index: 1;
    }
    
    .status-banner {
      padding: 30px;
      text-align: center;
      background: ${overallStatusColor};
      color: white;
      font-size: 32px;
      font-weight: 800;
      letter-spacing: 3px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.2);
      border-bottom: 5px solid rgba(0,0,0,0.1);
    }
    
    .summary {
      padding: 30px 40px;
      background: linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%);
      border-bottom: 1px solid #e9ecef;
    }
    
    .summary-card {
      display: none;
    }
    
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border: 2px solid #dee2e6;
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    
    .summary-table thead th {
      background: #f8f9fa;
      color: #000000;
      padding: 15px 20px;
      text-align: center;
      font-weight: 700;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1px;
      border: 1px solid #dee2e6;
    }
    
    .summary-table tbody tr {
      background: white;
    }
    
    .summary-table tbody tr:hover {
      background: #f8f9fa;
    }
    
    .summary-table tbody td {
      padding: 20px;
      text-align: center;
      font-size: 28px;
      font-weight: 800;
      border: 1px solid #dee2e6;
    }
    
    .summary-table tr.stat-total td { border-color: #007bff; }
    .summary-table tr.stat-passed td { border-color: #28a745; }
    .summary-table tr.stat-failed td { border-color: #dc3545; }
    .summary-table tr.stat-skipped td { border-color: #ffc107; }
    .summary-table tr.stat-duration td { border-color: #17a2b8; }
    .summary-table tr.stat-pass-rate td { border-color: ${overallStatusColor}; }
    
    .stat-total { color: #007bff !important; }
    .stat-passed { color: #28a745 !important; }
    .stat-failed { color: #dc3545 !important; }
    .stat-skipped { color: #ffc107 !important; }
    .stat-duration { color: #17a2b8 !important; }
    .stat-pass-rate { color: ${overallStatusColor} !important; }
    
    .summary-card.total { --card-color: #007bff; --card-color-light: #66b3ff; }
    .summary-card.passed { --card-color: #28a745; --card-color-light: #85e89d; }
    .summary-card.failed { --card-color: #dc3545; --card-color-light: #ff6b7f; }
    .summary-card.skipped { --card-color: #ffc107; --card-color-light: #ffe066; }
    .summary-card.flaky { --card-color: #fd7e14; --card-color-light: #ffb366; }
    .summary-card.not-run { --card-color: #6c757d; --card-color-light: #adb5bd; }
    .summary-card.duration { --card-color: #17a2b8; --card-color-light: #7fd3e0; }
    .summary-card.pass-rate { --card-color: ${overallStatusColor}; }
    
    .content {
      padding: 40px;
    }
    
    .controls {
      text-align: right;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .controls h2 {
      color: #343a40;
      font-size: 24px;
      font-weight: 700;
    }
    
    .btn {
      padding: 12px 24px;
      margin-left: 10px;
      cursor: pointer;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.3s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .btn-secondary {
      background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
      color: white;
    }
    
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    
    .suite {
      margin-bottom: 25px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 15px rgba(0,0,0,0.08);
      transition: all 0.3s ease;
    }
    
    .suite:hover {
      box-shadow: 0 6px 20px rgba(0,0,0,0.12);
    }
    
    .suite-header {
      background: linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%);
      color: #000000;
      padding: 20px 25px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.3s ease;
      border: 1px solid #ced4da;
    }
    
    .suite-header:hover {
      background: linear-gradient(135deg, #dee2e6 0%, #ced4da 100%);
    }
    
    .suite-header .suite-name {
      font-weight: 700;
      font-size: 17px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: #000000;
    }
    
    .suite-header .suite-stats {
      font-size: 14px;
      display: flex;
      gap: 20px;
      font-weight: 500;
      color: #000000;
    }
    
    .suite-header .stat {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: rgba(0,0,0,0.05);
      border-radius: 6px;
      color: #000000;
    }
    
    .suite-content {
      display: none;
      background: #f8f9fa;
    }
    
    .suite-content.expanded {
      display: block;
      animation: fadeIn 0.3s ease-out;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    .test {
      border-bottom: 1px solid #dee2e6;
      background: white;
    }
    
    .test:last-child {
      border-bottom: none;
    }
    
    .test-header {
      padding: 18px 25px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: background-color 0.2s ease;
    }
    
    .test-header:hover {
      background: linear-gradient(to right, #f8f9fa 0%, #ffffff 100%);
    }
    
    .test-header .test-title {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 600;
      color: #212529;
    }
    
    .test-header .test-meta {
      display: flex;
      gap: 15px;
      align-items: center;
    }
    
    .status-badge {
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .status-badge.passed {
      background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
      color: #155724;
      border: 1px solid #28a745;
    }
    
    .status-badge.failed {
      background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%);
      color: #721c24;
      border: 1px solid #dc3545;
    }
    
    .status-badge.skipped {
      background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
      color: #856404;
      border: 1px solid #ffc107;
    }
    
    .status-badge.flaky {
      background: linear-gradient(135deg, #ffe5d9 0%, #ffd4b3 100%);
      color: #c05621;
      border: 1px solid #fd7e14;
    }
    
    .status-badge.interrupted {
      background: linear-gradient(135deg, #e2e3e5 0%, #d6d8db 100%);
      color: #383d41;
      border: 1px solid #6c757d;
    }
    
    .status-badge.timedOut {
      background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%);
      color: #721c24;
      border: 1px solid #dc3545;
    }
    
    .test-details {
      display: none;
      padding: 25px;
      background: linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%);
      border-top: 3px solid #e9ecef;
    }
    
    .test-details.expanded {
      display: block;
      animation: slideDown 0.3s ease-out;
    }
    
    @keyframes slideDown {
      from {
        opacity: 0;
        max-height: 0;
      }
      to {
        opacity: 1;
        max-height: 5000px;
      }
    }
    
    .section {
      margin-bottom: 25px;
      background: white;
      padding: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    
    .section-title {
      font-weight: 700;
      font-size: 15px;
      color: #343a40;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 3px solid #667eea;
      text-transform: uppercase;
      letter-spacing: 1px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .error-box {
      background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%);
      border: 2px solid #dc3545;
      border-left: 6px solid #dc3545;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 15px;
      box-shadow: 0 4px 12px rgba(220,53,69,0.15);
    }
    
    .error-message {
      color: #dc3545;
      font-weight: 800;
      margin-bottom: 12px;
      font-size: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .error-stack {
      background: #2d2d2d;
      color: #ff6b7f;
      padding: 15px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
      max-height: 400px;
      overflow-y: auto;
      border: 1px solid #dc3545;
    }
    
    .steps-list {
      max-height: 500px;
      overflow-y: auto;
    }
    
    .step {
      padding: 12px 16px;
      margin-bottom: 8px;
      border-left: 4px solid #28a745;
      background: linear-gradient(to right, #f0fff4 0%, #ffffff 100%);
      font-family: 'Courier New', monospace;
      font-size: 13px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.2s ease;
    }
    
    .step:hover {
      transform: translateX(5px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    
    .step.error {
      border-left-color: #dc3545;
      background: linear-gradient(to right, #fff5f5 0%, #ffffff 100%);
    }
    
    .step .step-duration {
      color: #6c757d;
      font-size: 11px;
      font-weight: 600;
      background: #e9ecef;
      padding: 3px 8px;
      border-radius: 4px;
    }
    
    .logs {
      background: #2d2d2d;
      color: #f8f8f2;
      padding: 20px;
      border-radius: 10px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      max-height: 500px;
      overflow-y: auto;
      line-height: 1.6;
      box-shadow: inset 0 2px 8px rgba(0,0,0,0.3);
    }
    
    .log-line {
      margin-bottom: 4px;
      padding: 2px 0;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    
    .info-item {
      background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid #667eea;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    
    .info-item .info-label {
      font-weight: 700;
      color: #495057;
      font-size: 12px;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .info-item .info-value {
      color: #212529;
      font-size: 14px;
      font-weight: 600;
    }
    
    .attachments-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 15px;
    }
    
    .attachment {
      background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
      padding: 15px;
      border-radius: 10px;
      border: 2px solid #e9ecef;
      transition: all 0.3s ease;
    }
    
    .attachment:hover {
      border-color: #667eea;
      transform: translateY(-3px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    
    .attachment .attachment-name {
      font-weight: 700;
      color: #667eea;
      margin-bottom: 8px;
      font-size: 14px;
    }
    
    .attachment .attachment-type {
      color: #6c757d;
      font-size: 12px;
      background: #e9ecef;
      padding: 4px 8px;
      border-radius: 4px;
      display: inline-block;
    }
    
    .footer {
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      padding: 40px 30px;
      text-align: center;
      color: #6c757d;
      font-size: 14px;
      border-top: 3px solid #667eea;
    }
    
    .footer strong {
      color: #343a40;
      font-size: 16px;
      display: block;
      margin-bottom: 10px;
    }
    
    .toggle-icon {
      transition: transform 0.3s ease;
      display: inline-block;
      font-size: 14px;
    }
    
    .toggle-icon.rotated {
      transform: rotate(180deg);
    }
    
    @media print {
      body { background: white; }
      .suite-content, .test-details { display: block !important; }
      .btn { display: none; }
    }
    
    @media (max-width: 768px) {
      .summary {
        grid-template-columns: repeat(2, 1fr);
      }
      .header h1 {
        font-size: 28px;
      }
      .status-banner {
        font-size: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>Solution Builder Automation</h1>
      <p class="subtitle">Comprehensive Test Execution Report</p>
      <p class="date">📅 ${executionDate}</p>
    </div>
    
    <div class="status-banner">
      ${overallStatusIcon} TEST REPORT SUMMARY
    </div>
    
    <div class="summary">
      <table class="summary-table">
        <thead>
          <tr>
            <th>Total Test Cases</th>
            <th>Passed</th>
            <th>Failed</th>
            <th>Skipped</th>
            ${(summary.flaky || 0) > 0 ? `<th>Flaky</th>` : ''}
            ${(summary.notRun || 0) > 0 ? `<th>Not Run</th>` : ''}
            <th>Duration</th>
            <th>Pass Rate</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="stat-total">${totalTestCases}</td>
            <td class="stat-passed">${passedTestCases}</td>
            <td class="stat-failed">${failedTestCases}</td>
            <td class="stat-skipped">${skippedTestCases}</td>
            ${(summary.flaky || 0) > 0 ? `<td style="color: #fd7e14; font-weight: 800;">${summary.flaky}</td>` : ''}
            ${(summary.notRun || 0) > 0 ? `<td style="color: #6c757d; font-weight: 800;">${summary.notRun}</td>` : ''}
            <td class="stat-duration">${durationInSeconds}s</td>
            <td class="stat-pass-rate">${passRate}%</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <!-- Execution Timeline Section - Horizontal Table Format -->
    <div style="padding: 30px 40px; background: linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%); border-bottom: 1px solid #e9ecef;">
      <h3 style="color: #343a40; font-size: 20px; font-weight: 700; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 24px;">⏱️</span> Execution Timeline
      </h3>
      <table style="width: 100%; border-collapse: collapse; background: white; border: 2px solid #dee2e6; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 15px 20px; text-align: center; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border: 1px solid #dee2e6; color: #000000;">🚀 Start Time</th>
            <th style="padding: 15px 20px; text-align: center; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border: 1px solid #dee2e6; color: #000000;">🏁 End Time</th>
            <th style="padding: 15px 20px; text-align: center; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border: 1px solid #dee2e6; color: #000000;">⏳ Total Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: white;">
            <td style="padding: 20px; text-align: center; font-size: 18px; font-weight: 700; color: #0d47a1; border: 1px solid #dee2e6; border-color: #2196f3;">${startTimeFormatted}</td>
            <td style="padding: 20px; text-align: center; font-size: 18px; font-weight: 700; color: #4a148c; border: 1px solid #dee2e6; border-color: #9c27b0;">${endTimeFormatted}</td>
            <td style="padding: 20px; text-align: center; font-size: 18px; font-weight: 700; color: #1b5e20; border: 1px solid #dee2e6; border-color: #4caf50;">${durationInSeconds}s</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <div class="content">
      <!-- Test Cases Results Table -->
      <div style="margin-bottom: 40px;">
        <h2 style="color: #212529; font-size: 24px; font-weight: 700; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 28px;">📊</span> Test Cases Results
        </h2>
        <div style="overflow-x: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border-radius: 12px;">
          <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden;">
            <thead>
              <tr style="background: #f8f9fa; color: #000000;">
                <th style="padding: 16px 20px; text-align: center; font-weight: 700; font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase;">#</th>
                <th style="padding: 16px 20px; text-align: left; font-weight: 700; font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase;">Test Case ID</th>
                <th style="padding: 16px 20px; text-align: center; font-weight: 700; font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase;">Status</th>
                <th style="padding: 16px 20px; text-align: center; font-weight: 700; font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase;">Duration</th>
                <th style="padding: 16px 20px; text-align: left; font-weight: 700; font-size: 14px; letter-spacing: 0.5px; text-transform: uppercase;">Scenarios</th>
              </tr>
            </thead>
            <tbody>
              ${generateTestMatrixRows(suites)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <strong>🏢 System Test Team - Honeywell</strong>
      <p>This is an automated test execution report generated by Playwright</p>
      <p style="margin-top: 15px; font-size: 12px; opacity: 0.8;">
        Report generated at ${new Date().toLocaleString()} • Powered by Ultimate Email Reporter v3.0
      </p>
    </div>
  </div>
</body>
</html>`;
}

function generateUltimateSuiteHTML(suite: SuiteResult, suiteIndex: number): string {
  return `
    <div class="suite">
      <div class="suite-header" onclick="toggleSuite(${suiteIndex})">
        <div class="suite-name">
          <span class="toggle-icon" id="suite-icon-${suiteIndex}">▼</span>
          <span>📁 ${escapeHtml(suite.suiteName || suite.file)}</span>
        </div>
        <div class="suite-stats">
          <span class="stat">📊 ${suite.total}</span>
          <span class="stat">✅ ${suite.passed}</span>
          <span class="stat">❌ ${suite.failed}</span>
          ${suite.skipped > 0 ? `<span class="stat">⏭️ ${suite.skipped}</span>` : ''}
          ${(suite.flaky || 0) > 0 ? `<span class="stat">🔄 ${suite.flaky}</span>` : ''}
          ${(suite.interrupted || 0) > 0 ? `<span class="stat">⛔ ${suite.interrupted}</span>` : ''}
          <span class="stat">⏱️ ${(suite.duration / 1000).toFixed(2)}s</span>
        </div>
      </div>
      <div class="suite-content" id="suite-${suiteIndex}">
        ${suite.tests.map((test, testIndex) => generateUltimateTestHTML(test, suiteIndex, testIndex)).join('')}
      </div>
    </div>
  `;
}

function generateUltimateTestHTML(test: DetailedTestResult, suiteIndex: number, testIndex: number): string {
  const testId = `${suiteIndex}-${testIndex}`;
  const statusIcon = getStatusIcon(test.status);
  const durationInSeconds = (test.duration / 1000).toFixed(2);
  
  return `
    <div class="test">
      <div class="test-header" onclick="toggleTest('${testId}')">
        <div class="test-title">
          <span class="toggle-icon" id="test-icon-${testId}">▼</span>
          <span>${statusIcon} ${escapeHtml(test.title)}</span>
        </div>
        <div class="test-meta">
          ${test.retries > 0 ? `<span style="font-size: 12px; color: #ffc107; font-weight: 600;">🔄 Retry ${test.retries}</span>` : ''}
          <span style="font-size: 13px; color: #6c757d; font-weight: 600;">⏱️ ${durationInSeconds}s</span>
          <span class="status-badge ${test.status}">${test.status}</span>
        </div>
      </div>
      <div class="test-details" id="test-${testId}">
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">📄 Test File</div>
            <div class="info-value">${escapeHtml(test.file)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">⏱️ Duration</div>
            <div class="info-value">${durationInSeconds} seconds</div>
          </div>
          <div class="info-item">
            <div class="info-label">🔄 Retry Count</div>
            <div class="info-value">${test.retries}</div>
          </div>
          <div class="info-item">
            <div class="info-label">📊 Status</div>
            <div class="info-value">${statusIcon} ${test.status.toUpperCase()}</div>
          </div>
        </div>
        
        ${test.errors.length > 0 ? generateUltimateErrorsHTML(test.errors) : ''}
        ${test.steps.length > 0 ? generateUltimateStepsHTML(test.steps) : ''}
        ${test.stdout.length > 0 ? generateUltimateLogsHTML('📋 Standard Output', test.stdout) : ''}
        ${test.stderr.length > 0 ? generateUltimateLogsHTML('🔴 Error Output', test.stderr, true) : ''}
        ${test.attachments.length > 0 ? generateUltimateAttachmentsHTML(test.attachments) : ''}
      </div>
    </div>
  `;
}

function generateUltimateErrorsHTML(errors: Array<{ message: string; stack?: string; location?: any }>): string {
  return `
    <div class="section">
      <div class="section-title">❌ ERRORS DETECTED</div>
      ${errors.map(error => `
        <div class="error-box">
          <div class="error-message">
            <span>🚫</span>
            <span>${escapeHtml(error.message)}</span>
          </div>
          ${error.location ? `
            <div style="font-size: 13px; color: #6c757d; margin-bottom: 12px; font-weight: 600;">
              📍 Location: <code style="background: #e9ecef; padding: 2px 6px; border-radius: 4px;">${escapeHtml(error.location.file)}:${error.location.line}:${error.location.column}</code>
            </div>
          ` : ''}
          ${error.stack ? `<div class="error-stack">${escapeHtml(error.stack)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function generateUltimateStepsHTML(steps: Array<{ title: string; category: string; duration: number; error?: string }>): string {
  return `
    <div class="section">
      <div class="section-title">📝 Test Steps Execution (${steps.length} steps)</div>
      <div class="steps-list">
        ${steps.map(step => `
          <div class="step ${step.error ? 'error' : ''}">
            <span>
              ${step.error ? '❌' : '✅'} ${escapeHtml(step.title)}
              ${step.error ? `<div style="color: #dc3545; font-size: 11px; margin-top: 5px; font-weight: 600;">⚠️ Error: ${escapeHtml(step.error)}</div>` : ''}
            </span>
            <span class="step-duration">${(step.duration / 1000).toFixed(2)}s</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function generateUltimateLogsHTML(title: string, logs: string[], isError: boolean = false): string {
  return `
    <div class="section">
      <div class="section-title">${title} (${logs.length} lines)</div>
      <div class="logs">
        ${logs.map(log => `<div class="log-line">${escapeHtml(log)}</div>`).join('')}
      </div>
    </div>
  `;
}

function generateUltimateAttachmentsHTML(attachments: Array<{ name: string; contentType: string; path?: string }>): string {
  return `
    <div class="section">
      <div class="section-title">📎 Attachments (${attachments.length} files)</div>
      <div class="attachments-grid">
        ${attachments.map(att => `
          <div class="attachment">
            <div class="attachment-name">📄 ${escapeHtml(att.name)}</div>
            <div class="attachment-type">${escapeHtml(att.contentType)}</div>
            ${att.path ? `<div style="font-size: 11px; color: #6c757d; margin-top: 8px; word-break: break-all;">${escapeHtml(att.path)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function generateBasicEmailHTML(reportPath: string): string {
  console.log("📊 Generating basic email from test-results.json");
  const jsonReport = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  
  const testResults = jsonReport.suites.map((suite: any) => {
    const scenarios = suite.specs?.map((spec: any) => ({
      feature: spec.title,
      status: spec.tests?.every((test: any) =>
        test.results?.every((result: any) => result.status === "passed")
      ) ? "passed" : "failed",
    })) || [];

    return {
      feature: suite.title,
      total: scenarios.length,
      passed: scenarios.filter((s: any) => s.status === "passed").length,
      failed: scenarios.filter((s: any) => s.status === "failed").length,
      scenarios,
    };
  });

  const totalTests = testResults.reduce((acc: number, r: any) => acc + r.total, 0);
  const totalPassed = testResults.reduce((acc: number, r: any) => acc + r.passed, 0);
  const totalFailed = testResults.reduce((acc: number, r: any) => acc + r.failed, 0);
  const passRate = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : '0';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1000px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
    h1 { color: #667eea; text-align: center; }
    .summary { display: flex; justify-content: space-around; margin: 30px 0; }
    .summary-item { text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px; }
    .summary-item .number { font-size: 36px; font-weight: bold; }
    .passed { color: #28a745; }
    .failed { color: #dc3545; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #667eea; color: white; }
    tr:nth-child(even) { background-color: #f9f9f9; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Solution Builder Test Report</h1>
    <div class="summary">
      <div class="summary-item">
        <div class="number">${totalTests}</div>
        <div>Total Test Cases</div>
      </div>
      <div class="summary-item">
        <div class="number passed">${totalPassed}</div>
        <div>Passed (${passRate}%)</div>
      </div>
      <div class="summary-item">
        <div class="number failed">${totalFailed}</div>
        <div>Failed</div>
      </div>
    </div>
    <table>
      <thead>
        <tr><th>Test Case</th><th>Total</th><th>Passed</th><th>Failed</th></tr>
      </thead>
      <tbody>
        ${testResults.map((r: any) => `
          <tr>
            <td>${escapeHtml(r.feature)}</td>
            <td>${r.total}</td>
            <td class="passed">${r.passed}</td>
            <td class="failed">${r.failed}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p style="margin-top: 30px; text-align: center; color: #6c757d;">
      <strong>System Test Team - Honeywell</strong><br>
      Report generated at ${new Date().toLocaleString()}
    </p>
  </div>
</body>
</html>`;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'passed': return '✅';
    case 'failed': return '❌';
    case 'skipped': return '⏭️';
    case 'timedOut': return '⏰';
    case 'flaky': return '🔄';
    case 'interrupted': return '⛔';
    default: return '❓';
  }
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

async function sendEmail(subject: string, emailBody: string) {
  console.log("📤 Sending email via SMTP...");
  
   let transporter = nodemailer.createTransport({
        host: 'WEBMAIL.HONEYWELL.COM',
        port: 25,
        secure: false,
    });

  const attachments = [];
  const htmlReportPath = path.join(process.cwd(), "playwright-report", "index.html");
  if (fs.existsSync(htmlReportPath)) {
    attachments.push({
      filename: "Playwright_Detailed_Report.html",
      content: fs.readFileSync(htmlReportPath, "utf-8"),
      contentType: "text/html",
    });
    console.log("📎 Attached Playwright HTML report");
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || "fcstestautomation@honeywell.com",
    to: process.env.EMAIL_RECIPIENTS || "nagendragupta.tunuguntla@honeywell.com",
    subject: subject,
    html: emailBody,
    attachments,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ EMAIL SENT SUCCESSFULLY!");
    console.log(`📧 Recipients: ${mailOptions.to}`);
    console.log(`📋 Subject: ${subject}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } catch (error) {
    console.error("❌ Failed to send email:", error);
    throw error;
  }
}