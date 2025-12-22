/*
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

/**
 * Test utilities for CDK unit tests.
 */

import { App, Environment, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { SynthesisMessage } from "aws-cdk-lib/cx-api";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

import { DeploymentConfig } from "../bin/deployment/load-deployment";
import { DataplaneConfig } from "../lib/constructs/types";

/**
 * Creates a test deployment configuration.
 *
 * @param overrides - Optional properties to override defaults
 * @returns A test deployment configuration
 */
export function createTestDeploymentConfig(
  overrides?: Partial<DeploymentConfig>
): DeploymentConfig {
  return {
    projectName: "test-project",
    account: {
      id: "123456789012",
      region: "us-west-2",
      prodLike: false,
      isAdc: false,
      ...overrides?.account
    },
    networkConfig: overrides?.networkConfig,
    dataplaneConfig:
      overrides?.dataplaneConfig ??
      new DataplaneConfig({
        authConfig: {
          authority: "https://keycloak.example.com/realms/osml",
          audience: "osml-client"
        }
      })
  };
}

/**
 * Creates a test CDK app.
 *
 * @returns A test CDK app instance
 */
export function createTestApp(): App {
  return new App();
}

/**
 * Creates a test environment configuration.
 *
 * @param overrides - Optional properties to override defaults
 * @returns A test environment configuration
 */
export function createTestEnvironment(
  overrides?: Partial<Environment>
): Environment {
  return {
    account: "123456789012",
    region: "us-west-2",
    ...overrides
  };
}

/**
 * Creates a test VPC in a stack.
 *
 * @param stack - The stack to create the VPC in
 * @param id - The ID for the VPC construct
 * @returns The created VPC
 */
export function createTestVpc(stack: Stack, id: string = "TestVpc"): Vpc {
  return new Vpc(stack, id, {
    maxAzs: 2
  });
}

/**
 * Interface for NAG findings.
 */
export interface NagFinding {
  resource: string;
  details: string;
  rule: string;
}

/**
 * Interface for suppressed NAG violations.
 */
export interface SuppressedNagViolation {
  rule: string;
  resource: string;
  reason: string;
  appliesTo?: string[];
  stackName?: string;
}

/**
 * Interface for CDK template Resource structure.
 */
interface CdkTemplateResource {
  Metadata?: {
    cdk_nag?: {
      rules_to_suppress?: NagSuppressionRule[];
    };
  };
}

/**
 * Interface for NAG suppression rule in CDK template metadata.
 */
interface NagSuppressionRule {
  id?: string;
  reason?: string;
  applies_to?: string[];
}

/**
 * Interface for CDK template JSON structure.
 */
interface CdkTemplate {
  Resources?: Record<string, CdkTemplateResource>;
}

/**
 * Extracts suppressed NAG violations from the stack template metadata.
 *
 * @param stack - The stack to extract suppressions from
 * @returns Array of suppressed violations
 */
export function extractSuppressedViolations(
  stack: Stack
): SuppressedNagViolation[] {
  const template = Template.fromStack(stack);
  const templateJson = template.toJSON() as CdkTemplate;
  const suppressed: SuppressedNagViolation[] = [];

  // cdk-nag stores suppressions in metadata under Resources
  if (!templateJson.Resources) {
    return suppressed;
  }

  for (const [resourceId, resource] of Object.entries(templateJson.Resources)) {
    const nagMetadata = resource?.Metadata?.cdk_nag;
    if (!nagMetadata) {
      continue;
    }

    const rulesToSuppress = nagMetadata.rules_to_suppress || [];
    if (Array.isArray(rulesToSuppress)) {
      for (const suppression of rulesToSuppress) {
        suppressed.push({
          rule: suppression.id || "",
          resource: resourceId,
          reason: suppression.reason || "",
          appliesTo: suppression.applies_to,
          stackName: stack.stackName
        });
      }
    }
  }

  return suppressed;
}

/**
 * Writes suppressed violations report to a file.
 *
 * @param stacks - Array of stacks to extract suppressed violations from
 * @param outputPath - Path to the output file (defaults to cdk-nag-suppressions-report.txt)
 */
export function writeSuppressedViolationsReport(
  stacks: Stack[],
  outputPath?: string
): void {
  const reportPath =
    outputPath || join(process.cwd(), "cdk-nag-suppressions-report.txt");

  // Collect all suppressed violations from all stacks
  const violationsByStack = new Map<string, SuppressedNagViolation[]>();
  for (const stack of stacks) {
    const violations = extractSuppressedViolations(stack);
    const stackName = stack.stackName;
    if (!violationsByStack.has(stackName)) {
      violationsByStack.set(stackName, []);
    }
    violationsByStack.get(stackName)!.push(...violations);
  }

  // Generate report content
  const lines = generateReportLines(violationsByStack);

  // Write to file
  const reportContent = lines.join("\n");
  writeFileSync(reportPath, reportContent, "utf-8");
  process.stdout.write(
    `\nSuppressed violations report written to: ${reportPath}\n`
  );
}

/**
 * Generates a formatted NAG compliance report for a stack.
 *
 * @param stack - The stack to generate the report for
 * @param errors - Array of error findings
 * @param warnings - Array of warning findings
 */
export function generateNagReport(
  stack: Stack,
  errors: SynthesisMessage[],
  warnings: SynthesisMessage[]
): void {
  const formatFindings = (findings: SynthesisMessage[]): NagFinding[] => {
    const regex = /(AwsSolutions-[A-Za-z0-9]+)\[([^\]]+)]:\s*(.+)/;
    return findings.map((finding) => {
      const data =
        typeof finding.entry.data === "string"
          ? finding.entry.data
          : JSON.stringify(finding.entry.data);
      const match = data.match(regex);
      if (!match) {
        return {
          rule: "",
          resource: "",
          details: ""
        };
      }
      return {
        rule: match[1],
        resource: match[2],
        details: match[3]
      };
    });
  };

  const errorFindings = formatFindings(errors);
  const warningFindings = formatFindings(warnings);
  const suppressedViolations = extractSuppressedViolations(stack);

  // Also append to the global suppressed violations file
  appendStackSuppressionsToReport(stack, suppressedViolations);

  // Generate the report
  process.stdout.write(
    "\n================== CDK-NAG Compliance Report ==================\n"
  );
  process.stdout.write(`Stack: ${stack.stackName}\n`);
  process.stdout.write(`Generated: ${new Date().toISOString()}\n`);
  process.stdout.write("\n=============== Summary ===============\n");
  process.stdout.write(`Total Errors: ${errorFindings.length}\n`);
  process.stdout.write(`Total Warnings: ${warningFindings.length}\n`);
  process.stdout.write(`Total Suppressed: ${suppressedViolations.length}\n`);

  if (errorFindings.length > 0) {
    process.stdout.write("\n=============== Errors ===============\n");
    errorFindings.forEach((finding) => {
      process.stdout.write(`\n${finding.resource}\n`);
      process.stdout.write(`${finding.rule}\n`);
      process.stdout.write(`${finding.details}\n`);
    });
  }

  if (warningFindings.length > 0) {
    process.stdout.write("\n=============== Warnings ===============\n");
    warningFindings.forEach((finding) => {
      process.stdout.write(`\n${finding.resource}\n`);
      process.stdout.write(`${finding.rule}\n`);
      process.stdout.write(`${finding.details}\n`);
    });
  }

  if (suppressedViolations.length > 0) {
    process.stdout.write(
      "\n=============== Suppressed Violations ===============\n"
    );
    suppressedViolations.forEach((violation) => {
      process.stdout.write(`\nResource: ${violation.resource}\n`);
      process.stdout.write(`Rule: ${violation.rule}\n`);
      if (violation.appliesTo && violation.appliesTo.length > 0) {
        process.stdout.write(`Applies To: ${violation.appliesTo.join(", ")}\n`);
      }
      process.stdout.write(`Reason: ${violation.reason}\n`);
    });
  }
  process.stdout.write("\n");
}

/**
 * File path for storing suppressed violations data temporarily.
 */
const TEMP_SUPPRESSIONS_FILE = join(
  process.cwd(),
  ".cdk-nag-suppressions-temp.json"
);

/**
 * Width of separator lines in reports.
 */
const REPORT_SEPARATOR_WIDTH = 80;

/**
 * Global collection of suppressed violations across all stacks.
 * Used to aggregate violations for the final report file.
 */
let globalSuppressedViolations: Map<string, SuppressedNagViolation[]> =
  new Map();

/**
 * Reads suppressed violations from the temporary file.
 *
 * @returns Map of stack names to their suppressed violations
 */
function readTempSuppressionsFile(): Map<string, SuppressedNagViolation[]> {
  try {
    if (!existsSync(TEMP_SUPPRESSIONS_FILE)) {
      return new Map();
    }
    const content = readFileSync(TEMP_SUPPRESSIONS_FILE, "utf-8");
    const parsed = JSON.parse(content) as Record<
      string,
      SuppressedNagViolation[]
    >;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

/**
 * Writes suppressed violations to the temporary file.
 *
 * @param data - Map of stack names to their suppressed violations
 */
function writeTempSuppressionsFile(
  data: Map<string, SuppressedNagViolation[]>
): void {
  try {
    const jsonContent = JSON.stringify(Object.fromEntries(data), null, 2);
    writeFileSync(TEMP_SUPPRESSIONS_FILE, jsonContent, "utf-8");
  } catch (error) {
    // Ignore file write errors - not critical
    console.warn("Failed to write temporary suppressions file:", error);
  }
}

/**
 * Appends suppressed violations from a stack to the global collection
 * and also writes to a temporary file for cross-process aggregation.
 *
 * @param stack - The stack containing the violations
 * @param violations - Array of suppressed violations from the stack
 */
function appendStackSuppressionsToReport(
  stack: Stack,
  violations: SuppressedNagViolation[]
): void {
  const stackName = stack.stackName;
  if (!globalSuppressedViolations.has(stackName)) {
    globalSuppressedViolations.set(stackName, []);
  }
  globalSuppressedViolations.get(stackName)!.push(...violations);

  // Also write to a temporary file for aggregation across test processes
  const existingData = readTempSuppressionsFile();
  if (!existingData.has(stackName)) {
    existingData.set(stackName, []);
  }
  existingData.get(stackName)!.push(...violations);
  writeTempSuppressionsFile(existingData);
}

/**
 * Groups violations by rule.
 *
 * @param violations - Array of violations to group
 * @returns Map of rule names to their violations
 */
function groupViolationsByRule(
  violations: SuppressedNagViolation[]
): Map<string, SuppressedNagViolation[]> {
  const grouped = new Map<string, SuppressedNagViolation[]>();
  for (const violation of violations) {
    if (!grouped.has(violation.rule)) {
      grouped.set(violation.rule, []);
    }
    grouped.get(violation.rule)!.push(violation);
  }
  return grouped;
}

/**
 * Generates report content lines from suppressed violations.
 *
 * @param violationsByStack - Map of stack names to their violations
 * @returns Array of report content lines
 */
function generateReportLines(
  violationsByStack: Map<string, SuppressedNagViolation[]>
): string[] {
  const allViolations: SuppressedNagViolation[] = [];
  for (const violations of violationsByStack.values()) {
    allViolations.push(...violations);
  }

  const lines: string[] = [];
  lines.push("=".repeat(REPORT_SEPARATOR_WIDTH));
  lines.push("CDK-NAG Suppressed Violations Report");
  lines.push("=".repeat(REPORT_SEPARATOR_WIDTH));
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total Stacks: ${violationsByStack.size}`);
  lines.push(`Total Suppressed Violations: ${allViolations.length}`);
  lines.push("");

  // Group by rule for summary
  const violationsByRule = new Map<string, number>();
  for (const violation of allViolations) {
    const count = violationsByRule.get(violation.rule) || 0;
    violationsByRule.set(violation.rule, count + 1);
  }

  lines.push("=".repeat(REPORT_SEPARATOR_WIDTH));
  lines.push("Summary by Rule");
  lines.push("=".repeat(REPORT_SEPARATOR_WIDTH));
  const sortedRules = Array.from(violationsByRule.entries()).sort(
    (a, b) => b[1] - a[1]
  );
  for (const [rule, count] of sortedRules) {
    lines.push(`${rule}: ${count} suppression(s)`);
  }
  lines.push("");

  // Detailed report by stack
  for (const [stackName, violations] of Array.from(
    violationsByStack.entries()
  ).sort()) {
    lines.push("=".repeat(REPORT_SEPARATOR_WIDTH));
    lines.push(`Stack: ${stackName}`);
    lines.push(`Total Suppressed Violations: ${violations.length}`);
    lines.push("=".repeat(REPORT_SEPARATOR_WIDTH));
    lines.push("");

    const violationsByRuleInStack = groupViolationsByRule(violations);

    for (const [rule, ruleViolations] of Array.from(
      violationsByRuleInStack.entries()
    ).sort()) {
      lines.push(`Rule: ${rule}`);
      lines.push(`  Count: ${ruleViolations.length}`);
      lines.push("");

      for (const violation of ruleViolations) {
        lines.push(`  Resource: ${violation.resource}`);
        if (violation.appliesTo && violation.appliesTo.length > 0) {
          lines.push(`    Applies To: ${violation.appliesTo.join(", ")}`);
        }
        lines.push(`    Reason: ${violation.reason}`);
        lines.push("");
      }
    }
    lines.push("");
  }

  return lines;
}

/**
 * Cleans up the temporary suppressions file.
 */
function cleanupTempSuppressionsFile(): void {
  try {
    if (existsSync(TEMP_SUPPRESSIONS_FILE)) {
      unlinkSync(TEMP_SUPPRESSIONS_FILE);
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Generates and writes the final suppressed violations report file.
 * Should be called after all tests have run to generate the complete report.
 *
 * @param outputPath - Optional path to the output file
 */
export function generateFinalSuppressedViolationsReport(
  outputPath?: string
): void {
  // Try to load from temporary file first (for cross-process aggregation)
  const tempData = readTempSuppressionsFile();
  if (tempData.size > 0) {
    globalSuppressedViolations = tempData;
  }

  const allViolations: SuppressedNagViolation[] = [];
  for (const violations of globalSuppressedViolations.values()) {
    allViolations.push(...violations);
  }

  if (allViolations.length === 0) {
    process.stdout.write("\nNo suppressed violations found to report.\n");
    cleanupTempSuppressionsFile();
    return;
  }

  const reportPath =
    outputPath || join(process.cwd(), "cdk-nag-suppressions-report.txt");

  // Generate report content
  const lines = generateReportLines(globalSuppressedViolations);

  // Write to file
  const reportContent = lines.join("\n");
  writeFileSync(reportPath, reportContent, "utf-8");
  process.stdout.write(
    `\nSuppressed violations report written to: ${reportPath}\n`
  );

  // Clean up temp file after successful report generation
  cleanupTempSuppressionsFile();
}

/**
 * Jest global teardown hook to generate the final suppressed violations report.
 * This default export allows Jest to directly use this file as the globalTeardown.
 */
export default function teardown(): void {
  generateFinalSuppressedViolationsReport();
}
