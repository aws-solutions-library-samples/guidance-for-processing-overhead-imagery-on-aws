/*
 * Copyright 2023-2025 Amazon.com, Inc. or its affiliates.
 */

/**
 * Unified Jest configuration for the guidance-for-processing-overhead-imagery repo.
 *
 * This config runs tests from:
 * - <rootDir>/test - Root-level tests (deployment config validation)
 * - <rootDir>/lib/osml-vpc/cdk/test - VPC infrastructure tests
 * - <rootDir>/lib/osml-apis/cdk/test - APIs stack tests
 *
 * Other components in lib/ are cloned from external repos and have their own test setups.
 */

module.exports = {
  testEnvironment: "node",

  // Test roots - only include tests that are part of THIS repo
  roots: [
    "<rootDir>/test",
    "<rootDir>/lib/osml-vpc/cdk/test",
    "<rootDir>/lib/osml-apis/cdk/test"
  ],

  // Match test files - exclude empty or utility files
  testMatch: ["**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/cdk.out/", "/dist/"],

  // TypeScript transformation - uses isolatedModules from tsconfig.json
  transform: {
    "^.+\\.tsx?$": "ts-jest"
  },

  // Module resolution - ignore cloned repos and build artifacts
  modulePathIgnorePatterns: [
    "/node_modules/",
    "/cdk.out/",
    "/dist/",
    "/.tox/",
    // Ignore everything in lib/ EXCEPT osml-vpc and osml-apis
    "<rootDir>/lib/(?!(osml-vpc|osml-apis)(/|$))"
  ],

  // Memory optimization settings
  maxWorkers: 1, // Run tests sequentially to reduce memory pressure
  workerIdleMemoryLimit: "512MB", // Restart worker if memory exceeds this limit

  // Test execution settings
  testTimeout: 30000, // 30s timeout for property-based tests
  verbose: false, // Reduce output noise

  // Clear mocks between tests to prevent state leakage
  clearMocks: true,
  restoreMocks: true
};
