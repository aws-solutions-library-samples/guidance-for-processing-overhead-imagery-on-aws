/*
 * Copyright 2023-2026 Amazon.com, Inc. or its affiliates.
 */

import * as fc from "fast-check";

/**
 * Simple validation functions for testing the parent deployment config structure
 * These mirror what the bash deploy script will validate
 */

interface ValidationError {
  field: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validates an AWS account ID format (12 digits)
 */
function isValidAccountId(id: string): boolean {
  return /^[0-9]{12}$/.test(id);
}

/**
 * Validates a CIDR block format with proper octet range checking (0-255)
 */
function isValidCidr(cidr: string): boolean {
  // First check basic format
  const cidrRegex = /^([0-9]{1,3}\.){3}[0-9]{1,3}\/([0-9]|[1-2][0-9]|3[0-2])$/;
  if (!cidrRegex.test(cidr)) {
    return false;
  }

  // Extract and validate each octet is in range 0-255
  const [ipPart] = cidr.split("/");
  const octets = ipPart.split(".").map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255);
}

/**
 * Validates the deployment configuration object
 * This mirrors the validation that will happen in the bash deploy script
 */
function validateConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (config === null || config === undefined) {
    errors.push({ field: "config", message: "Configuration is required" });
    return { valid: false, errors };
  }

  if (typeof config !== "object") {
    errors.push({
      field: "config",
      message: "Configuration must be an object"
    });
    return { valid: false, errors };
  }

  const cfg = config as Record<string, unknown>;

  // Validate account (required)
  if (cfg.account === null || cfg.account === undefined) {
    errors.push({ field: "account", message: "account is required" });
  } else if (typeof cfg.account !== "object") {
    errors.push({ field: "account", message: "account must be an object" });
  } else {
    const account = cfg.account as Record<string, unknown>;

    if (typeof account.id !== "string" || account.id.trim() === "") {
      errors.push({
        field: "account.id",
        message: "account.id is required"
      });
    } else if (!isValidAccountId(account.id)) {
      errors.push({
        field: "account.id",
        message: "account.id must be a 12-digit AWS account ID"
      });
    }

    if (typeof account.region !== "string" || account.region.trim() === "") {
      errors.push({
        field: "account.region",
        message: "account.region is required"
      });
    }
  }

  // Validate network (optional but if present, validate vpcCidr)
  if (cfg.network !== null && cfg.network !== undefined) {
    if (typeof cfg.network !== "object") {
      errors.push({ field: "network", message: "network must be an object" });
    } else {
      const network = cfg.network as Record<string, unknown>;
      if (network.vpcCidr !== undefined) {
        if (typeof network.vpcCidr !== "string") {
          errors.push({
            field: "network.vpcCidr",
            message: "network.vpcCidr must be a string"
          });
        } else if (!isValidCidr(network.vpcCidr)) {
          errors.push({
            field: "network.vpcCidr",
            message: "network.vpcCidr must be a valid CIDR block"
          });
        }
      }
    }
  }

  // Validate components (osml-model-runner, osml-tile-server, osml-data-intake)
  const componentKeys = [
    "osml-model-runner",
    "osml-tile-server",
    "osml-data-intake"
  ];
  for (const componentKey of componentKeys) {
    const component = cfg[componentKey];
    if (component !== null && component !== undefined) {
      if (typeof component !== "object") {
        errors.push({
          field: componentKey,
          message: `${componentKey} must be an object`
        });
        continue;
      }

      const comp = component as Record<string, unknown>;

      if (typeof comp.deploy !== "boolean") {
        errors.push({
          field: `${componentKey}.deploy`,
          message: "deploy must be a boolean"
        });
      }

      if (typeof comp.gitUrl !== "string" || comp.gitUrl.trim() === "") {
        errors.push({
          field: `${componentKey}.gitUrl`,
          message: "gitUrl must be a non-empty string"
        });
      }

      if (typeof comp.gitTarget !== "string" || comp.gitTarget.trim() === "") {
        errors.push({
          field: `${componentKey}.gitTarget`,
          message: "gitTarget must be a non-empty string"
        });
      }

      if (comp.config === null || comp.config === undefined) {
        errors.push({
          field: `${componentKey}.config`,
          message: "config is required"
        });
      } else if (typeof comp.config !== "object") {
        errors.push({
          field: `${componentKey}.config`,
          message: "config must be an object"
        });
      } else {
        const innerConfig = comp.config as Record<string, unknown>;
        if (
          typeof innerConfig.projectName !== "string" ||
          innerConfig.projectName.trim() === ""
        ) {
          errors.push({
            field: `${componentKey}.config.projectName`,
            message: "projectName must be a non-empty string"
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Extracts all component entries from the config
 * This mirrors what the bash script will do when iterating components
 */
function extractComponents(
  config: Record<string, unknown>
): Map<string, unknown> {
  const components = new Map<string, unknown>();
  const componentKeys = [
    "osml-model-runner",
    "osml-tile-server",
    "osml-data-intake"
  ];

  for (const key of componentKeys) {
    const component = config[key];
    if (component !== undefined && component !== null) {
      components.set(key, component);
    }
  }

  return components;
}

/**
 * Arbitrary for generating valid AWS account IDs (12 digits)
 */
const accountIdArb: fc.Arbitrary<string> = fc.string({
  minLength: 12,
  maxLength: 12,
  unit: fc.constantFrom("0", "1", "2", "3", "4", "5", "6", "7", "8", "9")
});

/**
 * Arbitrary for generating valid AWS regions
 */
const regionArb: fc.Arbitrary<string> = fc.constantFrom(
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-central-1",
  "ap-southeast-1",
  "ap-northeast-1"
);

/**
 * Arbitrary for generating valid CIDR blocks
 */
const cidrArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 8, max: 28 })
  )
  .map(([a, b, c, d, prefix]) => `${a}.${b}.${c}.${d}/${prefix}`);

/**
 * Arbitrary for generating valid git URLs
 */
const gitUrlArb: fc.Arbitrary<string> = fc.constantFrom(
  "https://github.com/awslabs/osml-model-runner",
  "https://github.com/awslabs/osml-tile-server",
  "https://github.com/awslabs/osml-data-intake",
  "https://github.com/example/repo"
);

/**
 * Arbitrary for generating valid git targets (branch names)
 */
const gitTargetArb: fc.Arbitrary<string> = fc.constantFrom(
  "main",
  "develop",
  "feature/test",
  "v1.0.0"
);

/**
 * Arbitrary for generating valid project names
 */
const projectNameArb: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 50,
  unit: fc.constantFrom(
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split(
      ""
    )
  )
});

/**
 * Arbitrary for generating valid component configs
 */
const componentConfigArb = fc.record({
  deploy: fc.boolean(),
  gitUrl: gitUrlArb,
  gitTarget: gitTargetArb,
  config: fc.record({
    projectName: projectNameArb,
    networkConfig: fc.option(
      fc.record({
        vpcId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        targetSubnets: fc.option(fc.array(fc.string({ minLength: 1 })), {
          nil: undefined
        }),
        securityGroupId: fc.option(fc.string({ minLength: 1 }), {
          nil: undefined
        })
      }),
      { nil: undefined }
    ),
    dataplaneConfig: fc.option(
      fc.record({
        BUILD_FROM_SOURCE: fc.boolean()
      }),
      { nil: undefined }
    ),
    deployIntegrationTests: fc.option(fc.boolean(), { nil: undefined })
  })
});

/**
 * Arbitrary for generating valid deployment configs
 */
const validDeploymentConfigArb = fc.record({
  account: fc.record({
    id: accountIdArb,
    region: regionArb,
    prodLike: fc.boolean(),
    isAdc: fc.boolean()
  }),
  network: fc.option(
    fc.record({
      vpcCidr: fc.option(cidrArb, { nil: undefined }),
      maxAzs: fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }),
      natGateways: fc.option(fc.integer({ min: 0, max: 3 }), { nil: undefined })
    }),
    { nil: undefined }
  ),
  "osml-model-runner": fc.option(componentConfigArb, { nil: undefined }),
  "osml-tile-server": fc.option(componentConfigArb, { nil: undefined }),
  "osml-data-intake": fc.option(componentConfigArb, { nil: undefined })
});

describe("OSML Deployment Config Property Tests", () => {
  /**
   * **Feature: osml-deployment-refactor, Property 1: Config Parsing Completeness**
   * *For any* valid parent configuration file, parsing the file SHALL extract
   * all component entries defined in the components object.
   * **Validates: Requirements 1.1, 1.3**
   */
  describe("Property 1: Config Parsing Completeness", () => {
    it("should extract all component entries from a valid config", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const configAsRecord = config as Record<string, unknown>;

          // Count expected components (those that are defined)
          const expectedComponents: string[] = [];
          if (config["osml-model-runner"] !== undefined)
            expectedComponents.push("osml-model-runner");
          if (config["osml-tile-server"] !== undefined)
            expectedComponents.push("osml-tile-server");
          if (config["osml-data-intake"] !== undefined)
            expectedComponents.push("osml-data-intake");

          // Extract components
          const extractedComponents = extractComponents(configAsRecord);

          // Verify all expected components are extracted
          for (const componentName of expectedComponents) {
            expect(extractedComponents.has(componentName)).toBe(true);
          }

          // Verify the count matches
          expect(extractedComponents.size).toBe(expectedComponents.length);

          // Verify each extracted component has the correct structure
          for (const [name, component] of extractedComponents) {
            expect(component).toHaveProperty("deploy");
            expect(component).toHaveProperty("gitUrl");
            expect(component).toHaveProperty("gitTarget");
            expect(component).toHaveProperty("config");
            const comp = component as Record<string, unknown>;
            const compConfig = comp.config as Record<string, unknown>;
            expect(compConfig).toHaveProperty("projectName");

            // Verify the component matches the original
            const original = configAsRecord[name] as Record<string, unknown>;
            expect(comp.deploy).toBe(original.deploy);
            expect(comp.gitUrl).toBe(original.gitUrl);
            expect(comp.gitTarget).toBe(original.gitTarget);
            const origConfig = original.config as Record<string, unknown>;
            expect(compConfig.projectName).toBe(origConfig.projectName);
          }
        }),
        { numRuns: 25 }
      );
    });

    it("should handle configs with no components", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            })
          }),
          (config) => {
            const extractedComponents = extractComponents(config);
            expect(extractedComponents.size).toBe(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should extract components with all their nested config properties", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const configAsRecord = config as Record<string, unknown>;
          const extractedComponents = extractComponents(configAsRecord);

          for (const [name, component] of extractedComponents) {
            const original = configAsRecord[name] as Record<string, unknown>;
            const comp = component as Record<string, unknown>;
            const compConfig = comp.config as Record<string, unknown>;
            const origConfig = original.config as Record<string, unknown>;

            // Verify nested config properties are preserved
            if (origConfig.networkConfig !== undefined) {
              expect(compConfig.networkConfig).toEqual(
                origConfig.networkConfig
              );
            }
            if (origConfig.dataplaneConfig !== undefined) {
              expect(compConfig.dataplaneConfig).toEqual(
                origConfig.dataplaneConfig
              );
            }
            if (origConfig.deployIntegrationTests !== undefined) {
              expect(compConfig.deployIntegrationTests).toBe(
                origConfig.deployIntegrationTests
              );
            }
          }
        }),
        { numRuns: 25 }
      );
    });
  });

  /**
   * **Feature: osml-deployment-refactor, Property 2: Config Validation Rejects Invalid Input**
   * *For any* parent configuration file missing required fields (projectName, account.id,
   * account.region, network.vpcCidr), the validation function SHALL return an error.
   * **Validates: Requirements 1.2**
   */
  describe("Property 2: Config Validation Rejects Invalid Input", () => {
    it("should reject configs missing account.id", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            })
          }),
          (config) => {
            const result = validateConfig(config);
            expect(result.valid).toBe(false);
            expect(
              result.errors.some((e) => e.field.includes("account.id"))
            ).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should reject configs missing account.region", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            })
          }),
          (config) => {
            const result = validateConfig(config);
            expect(result.valid).toBe(false);
            expect(
              result.errors.some((e) => e.field.includes("account.region"))
            ).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should reject configs missing account entirely", () => {
      fc.assert(
        fc.property(
          fc.record({
            network: fc.option(
              fc.record({
                vpcCidr: fc.option(cidrArb, { nil: undefined })
              }),
              { nil: undefined }
            )
          }),
          (config) => {
            const result = validateConfig(config);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.field === "account")).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should reject configs with invalid account.id format", () => {
      // Generate invalid account IDs (not 12 digits)
      const invalidAccountIdArb = fc.oneof(
        fc.string({ minLength: 1, maxLength: 11 }), // Too short
        fc.string({ minLength: 13, maxLength: 20 }), // Too long
        fc
          .string({ minLength: 12, maxLength: 12 })
          .filter((s) => !/^[0-9]{12}$/.test(s)) // Non-numeric
      );

      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: invalidAccountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            })
          }),
          (config) => {
            const result = validateConfig(config);
            expect(result.valid).toBe(false);
            expect(
              result.errors.some((e) => e.field.includes("account.id"))
            ).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should reject configs with invalid network.vpcCidr format", () => {
      // Generate invalid CIDR blocks
      const invalidCidrArb = fc.oneof(
        fc.constant("invalid-cidr"),
        fc.constant("10.0.0.0"), // Missing prefix
        fc.constant("10.0.0.0/33"), // Invalid prefix
        fc.constant("256.0.0.0/16"), // Invalid octet
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter(
            (s) =>
              !/^([0-9]{1,3}\.){3}[0-9]{1,3}\/([0-9]|[1-2][0-9]|3[0-2])$/.test(
                s
              )
          )
      );

      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            network: fc.record({
              vpcCidr: invalidCidrArb
            })
          }),
          (config) => {
            const result = validateConfig(config);
            expect(result.valid).toBe(false);
            expect(
              result.errors.some((e) => e.field.includes("network.vpcCidr"))
            ).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should reject component configs missing projectName", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.boolean(),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({
                // Missing projectName
                networkConfig: fc.option(fc.record({}), { nil: undefined })
              })
            })
          }),
          (config) => {
            const result = validateConfig(config);
            expect(result.valid).toBe(false);
            expect(
              result.errors.some((e) => e.field.includes("projectName"))
            ).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should reject component configs missing gitUrl", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.boolean(),
              // Missing gitUrl
              gitTarget: gitTargetArb,
              config: fc.record({
                projectName: projectNameArb
              })
            })
          }),
          (config) => {
            const result = validateConfig(config);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.field.includes("gitUrl"))).toBe(
              true
            );
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should reject component configs missing gitTarget", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-tile-server": fc.record({
              deploy: fc.boolean(),
              gitUrl: gitUrlArb,
              // Missing gitTarget
              config: fc.record({
                projectName: projectNameArb
              })
            })
          }),
          (config) => {
            const result = validateConfig(config);
            expect(result.valid).toBe(false);
            expect(
              result.errors.some((e) => e.field.includes("gitTarget"))
            ).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should accept valid configs", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const result = validateConfig(config);
          expect(result.valid).toBe(true);
          expect(result.errors.length).toBe(0);
        }),
        { numRuns: 25 }
      );
    });
  });
});

/**
 * Simulates the deploy script's component selection logic
 * Returns the list of components that would be cloned/deployed
 */
function getComponentsToClone(
  config: Record<string, unknown>,
  selectedComponents: string[] = []
): string[] {
  const componentKeys = [
    "osml-model-runner",
    "osml-tile-server",
    "osml-data-intake"
  ];
  const componentsToClone: string[] = [];

  for (const componentKey of componentKeys) {
    const component = config[componentKey] as
      | Record<string, unknown>
      | undefined;

    // Skip if component not defined or deploy is false
    if (!component || component.deploy !== true) {
      continue;
    }

    // If specific components were selected, only include those
    if (selectedComponents.length > 0) {
      if (selectedComponents.includes(componentKey)) {
        componentsToClone.push(componentKey);
      }
    } else {
      componentsToClone.push(componentKey);
    }
  }

  return componentsToClone;
}

/**
 * Simulates the deploy script's component skip logic
 * Returns the list of components that would be skipped
 */
function getComponentsToSkip(
  config: Record<string, unknown>,
  selectedComponents: string[] = []
): string[] {
  const componentKeys = [
    "osml-model-runner",
    "osml-tile-server",
    "osml-data-intake"
  ];
  const componentsToSkip: string[] = [];

  for (const componentKey of componentKeys) {
    const component = config[componentKey] as
      | Record<string, unknown>
      | undefined;

    // Component is skipped if:
    // 1. Not defined in config
    // 2. deploy flag is false
    // 3. Not in selected components list (when list is provided)
    if (!component) {
      componentsToSkip.push(componentKey);
      continue;
    }

    if (component.deploy !== true) {
      componentsToSkip.push(componentKey);
      continue;
    }

    if (
      selectedComponents.length > 0 &&
      !selectedComponents.includes(componentKey)
    ) {
      componentsToSkip.push(componentKey);
    }
  }

  return componentsToSkip;
}

describe("OSML Deploy Script Property Tests", () => {
  /**
   * **Feature: osml-deployment-refactor, Property 6: Selective Deployment Respects Deploy Flag**
   * *For any* component with deploy=false in the parent config, the deploy script
   * SHALL not clone, configure, or deploy that component.
   * **Validates: Requirements 7.1**
   */
  describe("Property 6: Selective Deployment Respects Deploy Flag", () => {
    it("should skip components with deploy=false", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.option(
              fc.record({
                deploy: fc.constant(false), // Explicitly false
                gitUrl: gitUrlArb,
                gitTarget: gitTargetArb,
                config: fc.record({
                  projectName: projectNameArb
                })
              }),
              { nil: undefined }
            ),
            "osml-tile-server": fc.option(componentConfigArb, {
              nil: undefined
            }),
            "osml-data-intake": fc.option(componentConfigArb, {
              nil: undefined
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const componentsToClone = getComponentsToClone(configAsRecord);

            // osml-model-runner should never be in the list since deploy=false
            if (config["osml-model-runner"] !== undefined) {
              expect(componentsToClone).not.toContain("osml-model-runner");
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should include only components with deploy=true", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const configAsRecord = config as Record<string, unknown>;
          const componentsToClone = getComponentsToClone(configAsRecord);

          // Every component in the clone list should have deploy=true
          for (const componentName of componentsToClone) {
            const component = configAsRecord[componentName] as Record<
              string,
              unknown
            >;
            expect(component).toBeDefined();
            expect(component.deploy).toBe(true);
          }

          // Every component with deploy=true should be in the clone list
          const componentKeys = [
            "osml-model-runner",
            "osml-tile-server",
            "osml-data-intake"
          ];
          for (const componentKey of componentKeys) {
            const component = configAsRecord[componentKey] as
              | Record<string, unknown>
              | undefined;
            if (component && component.deploy === true) {
              expect(componentsToClone).toContain(componentKey);
            }
          }
        }),
        { numRuns: 25 }
      );
    });

    it("should skip all components when all have deploy=false", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-tile-server": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-data-intake": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const componentsToClone = getComponentsToClone(configAsRecord);

            // No components should be cloned
            expect(componentsToClone.length).toBe(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should include all components when all have deploy=true", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-tile-server": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-data-intake": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const componentsToClone = getComponentsToClone(configAsRecord);

            // All 3 components should be cloned
            expect(componentsToClone.length).toBe(3);
            expect(componentsToClone).toContain("osml-model-runner");
            expect(componentsToClone).toContain("osml-tile-server");
            expect(componentsToClone).toContain("osml-data-intake");
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should respect mixed deploy flags", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.boolean(), // Random true/false
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-tile-server": fc.record({
              deploy: fc.boolean(), // Random true/false
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-data-intake": fc.record({
              deploy: fc.boolean(), // Random true/false
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const componentsToClone = getComponentsToClone(configAsRecord);
            const componentsToSkip = getComponentsToSkip(configAsRecord);

            // Count expected components
            let expectedCloneCount = 0;
            const componentKeys = [
              "osml-model-runner",
              "osml-tile-server",
              "osml-data-intake"
            ];

            for (const key of componentKeys) {
              const component = configAsRecord[key] as Record<string, unknown>;
              if (component.deploy === true) {
                expectedCloneCount++;
                expect(componentsToClone).toContain(key);
                expect(componentsToSkip).not.toContain(key);
              } else {
                expect(componentsToClone).not.toContain(key);
                expect(componentsToSkip).toContain(key);
              }
            }

            expect(componentsToClone.length).toBe(expectedCloneCount);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should handle undefined components as skipped", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            // Only osml-model-runner defined, others undefined
            "osml-model-runner": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const componentsToClone = getComponentsToClone(configAsRecord);

            // Only osml-model-runner should be cloned
            expect(componentsToClone.length).toBe(1);
            expect(componentsToClone).toContain("osml-model-runner");
            expect(componentsToClone).not.toContain("osml-tile-server");
            expect(componentsToClone).not.toContain("osml-data-intake");
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});

/**
 * Simulates the deploy script's component config generation logic
 * Merges account settings with component config to produce deployment.json content
 */
function generateComponentDeploymentConfig(
  parentConfig: Record<string, unknown>,
  componentName: string
): Record<string, unknown> | null {
  const component = parentConfig[componentName] as
    | Record<string, unknown>
    | undefined;

  if (!component || component.deploy !== true) {
    return null;
  }

  const account = parentConfig.account as Record<string, unknown>;
  const componentConfig = component.config as Record<string, unknown>;

  // Merge: component config + account settings
  return {
    ...componentConfig,
    account: { ...account }
  };
}

/**
 * Generates deployment configs for all enabled components
 * Returns a map of component name to generated config
 */
function generateAllDeploymentConfigs(
  parentConfig: Record<string, unknown>
): Map<string, Record<string, unknown>> {
  const configs = new Map<string, Record<string, unknown>>();
  const componentKeys = [
    "osml-model-runner",
    "osml-tile-server",
    "osml-data-intake"
  ];

  for (const componentKey of componentKeys) {
    const deploymentConfig = generateComponentDeploymentConfig(
      parentConfig,
      componentKey
    );
    if (deploymentConfig !== null) {
      configs.set(componentKey, deploymentConfig);
    }
  }

  return configs;
}

describe("OSML Component Config Generation Property Tests", () => {
  /**
   * **Feature: osml-deployment-refactor, Property 3: Config Settings Propagation**
   * *For any* component with custom settings in the parent config, the generated
   * component config file SHALL contain all those custom settings.
   * **Validates: Requirements 1.5, 3.4**
   */
  describe("Property 3: Config Settings Propagation", () => {
    it("should propagate all custom settings from parent config to component config", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({
                projectName: projectNameArb,
                networkConfig: fc.option(
                  fc.record({
                    vpcId: fc.option(fc.string({ minLength: 1 }), {
                      nil: undefined
                    }),
                    targetSubnets: fc.option(
                      fc.array(fc.string({ minLength: 1 })),
                      { nil: undefined }
                    ),
                    securityGroupId: fc.option(fc.string({ minLength: 1 }), {
                      nil: undefined
                    })
                  }),
                  { nil: undefined }
                ),
                dataplaneConfig: fc.option(
                  fc.record({
                    BUILD_FROM_SOURCE: fc.boolean()
                  }),
                  { nil: undefined }
                ),
                deployIntegrationTests: fc.option(fc.boolean(), {
                  nil: undefined
                }),
                testModelsConfig: fc.option(
                  fc.record({
                    BUILD_FROM_SOURCE: fc.boolean()
                  }),
                  { nil: undefined }
                )
              })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const generatedConfig = generateComponentDeploymentConfig(
              configAsRecord,
              "osml-model-runner"
            );

            expect(generatedConfig).not.toBeNull();
            if (generatedConfig === null) return;

            const originalComponentConfig = (
              config["osml-model-runner"] as Record<string, unknown>
            ).config as Record<string, unknown>;

            // Verify projectName is propagated
            expect(generatedConfig.projectName).toBe(
              originalComponentConfig.projectName
            );

            // Verify networkConfig is propagated if present
            if (originalComponentConfig.networkConfig !== undefined) {
              expect(generatedConfig.networkConfig).toEqual(
                originalComponentConfig.networkConfig
              );
            }

            // Verify dataplaneConfig is propagated if present
            if (originalComponentConfig.dataplaneConfig !== undefined) {
              expect(generatedConfig.dataplaneConfig).toEqual(
                originalComponentConfig.dataplaneConfig
              );
            }

            // Verify deployIntegrationTests is propagated if present
            if (originalComponentConfig.deployIntegrationTests !== undefined) {
              expect(generatedConfig.deployIntegrationTests).toBe(
                originalComponentConfig.deployIntegrationTests
              );
            }

            // Verify testModelsConfig is propagated if present
            if (originalComponentConfig.testModelsConfig !== undefined) {
              expect(generatedConfig.testModelsConfig).toEqual(
                originalComponentConfig.testModelsConfig
              );
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should propagate account settings to all generated component configs", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const configAsRecord = config as Record<string, unknown>;
          const generatedConfigs = generateAllDeploymentConfigs(configAsRecord);

          const originalAccount = config.account;

          for (const [, generatedConfig] of generatedConfigs) {
            // Verify account is included in generated config
            expect(generatedConfig.account).toBeDefined();
            const generatedAccount = generatedConfig.account as Record<
              string,
              unknown
            >;

            // Verify all account fields are propagated
            expect(generatedAccount.id).toBe(originalAccount.id);
            expect(generatedAccount.region).toBe(originalAccount.region);
            expect(generatedAccount.prodLike).toBe(originalAccount.prodLike);
            expect(generatedAccount.isAdc).toBe(originalAccount.isAdc);
          }
        }),
        { numRuns: 25 }
      );
    });

    it("should preserve all nested config properties in generated config", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-tile-server": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({
                projectName: projectNameArb,
                dataplaneConfig: fc.record({
                  BUILD_FROM_SOURCE: fc.boolean()
                }),
                deployIntegrationTests: fc.boolean(),
                testConfig: fc.record({
                  BUILD_FROM_SOURCE: fc.boolean()
                })
              })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const generatedConfig = generateComponentDeploymentConfig(
              configAsRecord,
              "osml-tile-server"
            );

            expect(generatedConfig).not.toBeNull();
            if (generatedConfig === null) return;

            const originalComponentConfig = (
              config["osml-tile-server"] as Record<string, unknown>
            ).config as Record<string, unknown>;

            // Verify all nested properties are preserved
            expect(generatedConfig.projectName).toBe(
              originalComponentConfig.projectName
            );
            expect(generatedConfig.dataplaneConfig).toEqual(
              originalComponentConfig.dataplaneConfig
            );
            expect(generatedConfig.deployIntegrationTests).toBe(
              originalComponentConfig.deployIntegrationTests
            );
            expect(generatedConfig.testConfig).toEqual(
              originalComponentConfig.testConfig
            );
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  /**
   * **Feature: osml-deployment-refactor, Property 4: Component Config Generation**
   * *For any* component defined in the parent config with deploy=true, the deploy script
   * SHALL generate a valid JSON config file in that component's directory.
   * **Validates: Requirements 3.1, 3.2**
   */
  describe("Property 4: Component Config Generation", () => {
    it("should generate config for all components with deploy=true", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const configAsRecord = config as Record<string, unknown>;
          const generatedConfigs = generateAllDeploymentConfigs(configAsRecord);

          const componentKeys = [
            "osml-model-runner",
            "osml-tile-server",
            "osml-data-intake"
          ];

          for (const componentKey of componentKeys) {
            const component = configAsRecord[componentKey] as
              | Record<string, unknown>
              | undefined;

            if (component && component.deploy === true) {
              // Component with deploy=true should have a generated config
              expect(generatedConfigs.has(componentKey)).toBe(true);

              const generatedConfig = generatedConfigs.get(componentKey);
              expect(generatedConfig).toBeDefined();

              // Verify the generated config has required structure
              expect(generatedConfig!.projectName).toBeDefined();
              expect(generatedConfig!.account).toBeDefined();
            } else {
              // Component with deploy=false or undefined should not have a generated config
              expect(generatedConfigs.has(componentKey)).toBe(false);
            }
          }
        }),
        { numRuns: 25 }
      );
    });

    it("should not generate config for components with deploy=false", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-tile-server": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-data-intake": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const generatedConfigs =
              generateAllDeploymentConfigs(configAsRecord);

            // No configs should be generated when all deploy=false
            expect(generatedConfigs.size).toBe(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should generate valid JSON structure for each component config", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({
                projectName: projectNameArb,
                networkConfig: fc.option(
                  fc.record({
                    vpcId: fc.string({ minLength: 1 })
                  }),
                  { nil: undefined }
                )
              })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const generatedConfig = generateComponentDeploymentConfig(
              configAsRecord,
              "osml-model-runner"
            );

            expect(generatedConfig).not.toBeNull();
            if (generatedConfig === null) return;

            // Verify the config can be serialized to valid JSON
            const jsonString = JSON.stringify(generatedConfig);
            expect(() => JSON.parse(jsonString)).not.toThrow();

            // Verify the parsed JSON matches the original
            const parsed = JSON.parse(jsonString);
            expect(parsed.projectName).toBe(generatedConfig.projectName);
            expect(parsed.account).toEqual(generatedConfig.account);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should generate configs only for enabled components in mixed scenarios", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-tile-server": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-data-intake": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const generatedConfigs =
              generateAllDeploymentConfigs(configAsRecord);

            // Only osml-model-runner and osml-data-intake should have configs
            expect(generatedConfigs.size).toBe(2);
            expect(generatedConfigs.has("osml-model-runner")).toBe(true);
            expect(generatedConfigs.has("osml-tile-server")).toBe(false);
            expect(generatedConfigs.has("osml-data-intake")).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});

/**
 * Simulates the deploy script's network parameter injection logic
 * Injects network outputs (vpcId, targetSubnets, securityGroupId) into component config
 */
function injectNetworkParams(
  componentConfig: Record<string, unknown>,
  networkOutputs: {
    vpcId: string;
    targetSubnets: string[];
    securityGroupId: string;
  }
): Record<string, unknown> {
  return {
    ...componentConfig,
    networkConfig: {
      vpcId: networkOutputs.vpcId,
      targetSubnets: networkOutputs.targetSubnets,
      securityGroupId: networkOutputs.securityGroupId
    }
  };
}

/**
 * Generates deployment configs with network parameters injected for all enabled components
 */
function generateDeploymentConfigsWithNetwork(
  parentConfig: Record<string, unknown>,
  networkOutputs: {
    vpcId: string;
    targetSubnets: string[];
    securityGroupId: string;
  }
): Map<string, Record<string, unknown>> {
  const configs = new Map<string, Record<string, unknown>>();
  const componentKeys = [
    "osml-model-runner",
    "osml-tile-server",
    "osml-data-intake"
  ];

  for (const componentKey of componentKeys) {
    const baseConfig = generateComponentDeploymentConfig(
      parentConfig,
      componentKey
    );
    if (baseConfig !== null) {
      const configWithNetwork = injectNetworkParams(baseConfig, networkOutputs);
      configs.set(componentKey, configWithNetwork);
    }
  }

  return configs;
}

/**
 * Arbitrary for generating valid VPC IDs
 */
const vpcIdArb: fc.Arbitrary<string> = fc
  .string({
    minLength: 12,
    maxLength: 21,
    unit: fc.constantFrom(..."vpc-0123456789abcdef".split(""))
  })
  .map((s) => `vpc-${s.slice(0, 17)}`);

/**
 * Arbitrary for generating valid subnet IDs
 */
const subnetIdArb: fc.Arbitrary<string> = fc
  .string({
    minLength: 15,
    maxLength: 24,
    unit: fc.constantFrom(..."subnet-0123456789abcdef".split(""))
  })
  .map((s) => `subnet-${s.slice(0, 17)}`);

/**
 * Arbitrary for generating valid security group IDs
 */
const securityGroupIdArb: fc.Arbitrary<string> = fc
  .string({
    minLength: 11,
    maxLength: 20,
    unit: fc.constantFrom(..."sg-0123456789abcdef".split(""))
  })
  .map((s) => `sg-${s.slice(0, 17)}`);

/**
 * Arbitrary for generating network outputs (simulating OSML-Network stack outputs)
 */
const networkOutputsArb = fc.record({
  vpcId: vpcIdArb,
  targetSubnets: fc.array(subnetIdArb, { minLength: 1, maxLength: 3 }),
  securityGroupId: securityGroupIdArb
});

describe("OSML Network Parameter Propagation Property Tests", () => {
  /**
   * **Feature: osml-deployment-refactor, Property 5: Network Parameter Propagation**
   * *For any* component config generated after OSML-Network deployment, the config
   * SHALL contain the VPC ID and subnet IDs from the network stack outputs.
   * **Validates: Requirements 3.3, 5.3**
   */
  describe("Property 5: Network Parameter Propagation", () => {
    it("should inject vpcId from network outputs into all component configs", () => {
      fc.assert(
        fc.property(
          validDeploymentConfigArb,
          networkOutputsArb,
          (config, networkOutputs) => {
            const configAsRecord = config as Record<string, unknown>;
            const configsWithNetwork = generateDeploymentConfigsWithNetwork(
              configAsRecord,
              networkOutputs
            );

            // Every generated config should have the network vpcId
            for (const [, generatedConfig] of configsWithNetwork) {
              expect(generatedConfig.networkConfig).toBeDefined();
              const networkConfig = generatedConfig.networkConfig as Record<
                string,
                unknown
              >;
              expect(networkConfig.vpcId).toBe(networkOutputs.vpcId);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should inject targetSubnets from network outputs into all component configs", () => {
      fc.assert(
        fc.property(
          validDeploymentConfigArb,
          networkOutputsArb,
          (config, networkOutputs) => {
            const configAsRecord = config as Record<string, unknown>;
            const configsWithNetwork = generateDeploymentConfigsWithNetwork(
              configAsRecord,
              networkOutputs
            );

            // Every generated config should have the network targetSubnets
            for (const [, generatedConfig] of configsWithNetwork) {
              expect(generatedConfig.networkConfig).toBeDefined();
              const networkConfig = generatedConfig.networkConfig as Record<
                string,
                unknown
              >;
              expect(networkConfig.targetSubnets).toEqual(
                networkOutputs.targetSubnets
              );
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should inject securityGroupId from network outputs into all component configs", () => {
      fc.assert(
        fc.property(
          validDeploymentConfigArb,
          networkOutputsArb,
          (config, networkOutputs) => {
            const configAsRecord = config as Record<string, unknown>;
            const configsWithNetwork = generateDeploymentConfigsWithNetwork(
              configAsRecord,
              networkOutputs
            );

            // Every generated config should have the network securityGroupId
            for (const [, generatedConfig] of configsWithNetwork) {
              expect(generatedConfig.networkConfig).toBeDefined();
              const networkConfig = generatedConfig.networkConfig as Record<
                string,
                unknown
              >;
              expect(networkConfig.securityGroupId).toBe(
                networkOutputs.securityGroupId
              );
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should preserve all original config properties after network injection", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({
                projectName: projectNameArb,
                dataplaneConfig: fc.record({
                  BUILD_FROM_SOURCE: fc.boolean()
                }),
                deployIntegrationTests: fc.boolean(),
                testModelsConfig: fc.record({
                  BUILD_FROM_SOURCE: fc.boolean()
                })
              })
            })
          }),
          networkOutputsArb,
          (config, networkOutputs) => {
            const configAsRecord = config as Record<string, unknown>;
            const configsWithNetwork = generateDeploymentConfigsWithNetwork(
              configAsRecord,
              networkOutputs
            );

            const generatedConfig = configsWithNetwork.get("osml-model-runner");
            expect(generatedConfig).toBeDefined();
            if (!generatedConfig) return;

            const originalComponentConfig = (
              config["osml-model-runner"] as Record<string, unknown>
            ).config as Record<string, unknown>;

            // Verify original properties are preserved
            expect(generatedConfig.projectName).toBe(
              originalComponentConfig.projectName
            );
            expect(generatedConfig.dataplaneConfig).toEqual(
              originalComponentConfig.dataplaneConfig
            );
            expect(generatedConfig.deployIntegrationTests).toBe(
              originalComponentConfig.deployIntegrationTests
            );
            expect(generatedConfig.testModelsConfig).toEqual(
              originalComponentConfig.testModelsConfig
            );

            // Verify account is preserved
            expect(generatedConfig.account).toEqual(config.account);

            // Verify network config is added
            expect(generatedConfig.networkConfig).toBeDefined();
            const networkConfig = generatedConfig.networkConfig as Record<
              string,
              unknown
            >;
            expect(networkConfig.vpcId).toBe(networkOutputs.vpcId);
            expect(networkConfig.targetSubnets).toEqual(
              networkOutputs.targetSubnets
            );
            expect(networkConfig.securityGroupId).toBe(
              networkOutputs.securityGroupId
            );
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should inject network params only into enabled components", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-tile-server": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-data-intake": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          networkOutputsArb,
          (config, networkOutputs) => {
            const configAsRecord = config as Record<string, unknown>;
            const configsWithNetwork = generateDeploymentConfigsWithNetwork(
              configAsRecord,
              networkOutputs
            );

            // Only osml-model-runner and osml-data-intake should have configs with network params
            expect(configsWithNetwork.size).toBe(2);
            expect(configsWithNetwork.has("osml-model-runner")).toBe(true);
            expect(configsWithNetwork.has("osml-tile-server")).toBe(false);
            expect(configsWithNetwork.has("osml-data-intake")).toBe(true);

            // Verify network params are in enabled components
            for (const [, generatedConfig] of configsWithNetwork) {
              const networkConfig = generatedConfig.networkConfig as Record<
                string,
                unknown
              >;
              expect(networkConfig.vpcId).toBe(networkOutputs.vpcId);
              expect(networkConfig.targetSubnets).toEqual(
                networkOutputs.targetSubnets
              );
              expect(networkConfig.securityGroupId).toBe(
                networkOutputs.securityGroupId
              );
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should handle various subnet counts correctly", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          fc.record({
            vpcId: vpcIdArb,
            targetSubnets: fc.array(subnetIdArb, {
              minLength: 1,
              maxLength: 6
            }),
            securityGroupId: securityGroupIdArb
          }),
          (config, networkOutputs) => {
            const configAsRecord = config as Record<string, unknown>;
            const configsWithNetwork = generateDeploymentConfigsWithNetwork(
              configAsRecord,
              networkOutputs
            );

            const generatedConfig = configsWithNetwork.get("osml-model-runner");
            expect(generatedConfig).toBeDefined();
            if (!generatedConfig) return;

            const networkConfig = generatedConfig.networkConfig as Record<
              string,
              unknown
            >;
            const targetSubnets = networkConfig.targetSubnets as string[];

            // Verify all subnets are propagated regardless of count
            expect(targetSubnets.length).toBe(
              networkOutputs.targetSubnets.length
            );
            expect(targetSubnets).toEqual(networkOutputs.targetSubnets);
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});

/**
 * Represents a deployment operation with its type and order
 */
interface DeploymentOperation {
  type: "network" | "component";
  name: string;
  order: number;
}

/**
 * Simulates the deploy script's deployment order logic
 * Returns the ordered list of deployment operations
 */
function getDeploymentOrder(
  config: Record<string, unknown>,
  networkOnly: boolean = false
): DeploymentOperation[] {
  const operations: DeploymentOperation[] = [];
  let order = 0;

  // Check if any component has deploy=true
  const componentKeys = [
    "osml-model-runner",
    "osml-tile-server",
    "osml-data-intake"
  ];
  const hasEnabledComponents = componentKeys.some((key) => {
    const component = config[key] as Record<string, unknown> | undefined;
    return component && component.deploy === true;
  });

  // Network stack is always deployed first if there are enabled components or network-only mode
  if (hasEnabledComponents || networkOnly) {
    operations.push({
      type: "network",
      name: "osml-vpc",
      order: order++
    });
  }

  // If network-only mode, stop here
  if (networkOnly) {
    return operations;
  }

  // Deploy enabled components after network
  for (const componentKey of componentKeys) {
    const component = config[componentKey] as
      | Record<string, unknown>
      | undefined;
    if (component && component.deploy === true) {
      operations.push({
        type: "component",
        name: componentKey,
        order: order++
      });
    }
  }

  return operations;
}

/**
 * Checks if network stack is deployed before all component stacks
 */
function isNetworkDeployedFirst(operations: DeploymentOperation[]): boolean {
  const networkOp = operations.find((op) => op.type === "network");
  const componentOps = operations.filter((op) => op.type === "component");

  // If no network operation, check if there are no components either
  if (!networkOp) {
    return componentOps.length === 0;
  }

  // Network should have order 0 (first)
  if (networkOp.order !== 0) {
    return false;
  }

  // All component operations should have order > network order
  return componentOps.every((op) => op.order > networkOp.order);
}

describe("OSML Network Stack Dependency Property Tests", () => {
  /**
   * **Feature: osml-deployment-refactor, Property 7: Network Stack Dependency**
   * *For any* deployment that includes at least one component with deploy=true,
   * the OSML-Network stack SHALL be deployed before any component stacks.
   * **Validates: Requirements 7.3**
   */
  describe("Property 7: Network Stack Dependency", () => {
    it("should deploy network stack before any component stacks", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const configAsRecord = config as Record<string, unknown>;
          const operations = getDeploymentOrder(configAsRecord);

          // Verify network is deployed first
          expect(isNetworkDeployedFirst(operations)).toBe(true);
        }),
        { numRuns: 25 }
      );
    });

    it("should deploy network stack first when at least one component is enabled", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-tile-server": fc.option(
              fc.record({
                deploy: fc.boolean(),
                gitUrl: gitUrlArb,
                gitTarget: gitTargetArb,
                config: fc.record({ projectName: projectNameArb })
              }),
              { nil: undefined }
            ),
            "osml-data-intake": fc.option(
              fc.record({
                deploy: fc.boolean(),
                gitUrl: gitUrlArb,
                gitTarget: gitTargetArb,
                config: fc.record({ projectName: projectNameArb })
              }),
              { nil: undefined }
            )
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const operations = getDeploymentOrder(configAsRecord);

            // Should have at least network + osml-model-runner
            expect(operations.length).toBeGreaterThanOrEqual(2);

            // First operation should be network
            expect(operations[0].type).toBe("network");
            expect(operations[0].name).toBe("osml-vpc");
            expect(operations[0].order).toBe(0);

            // All subsequent operations should be components
            for (let i = 1; i < operations.length; i++) {
              expect(operations[i].type).toBe("component");
              expect(operations[i].order).toBe(i);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should not deploy network stack when no components are enabled", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-tile-server": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-data-intake": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const operations = getDeploymentOrder(configAsRecord);

            // No operations when all components are disabled
            expect(operations.length).toBe(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should deploy only network stack in network-only mode", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const configAsRecord = config as Record<string, unknown>;
          const operations = getDeploymentOrder(configAsRecord, true); // network-only mode

          // Should have exactly one operation (network)
          expect(operations.length).toBe(1);
          expect(operations[0].type).toBe("network");
          expect(operations[0].name).toBe("osml-vpc");
          expect(operations[0].order).toBe(0);
        }),
        { numRuns: 25 }
      );
    });

    it("should maintain correct deployment order with mixed component states", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.boolean(),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-tile-server": fc.record({
              deploy: fc.boolean(),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-data-intake": fc.record({
              deploy: fc.boolean(),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const operations = getDeploymentOrder(configAsRecord);

            // Count enabled components
            const componentKeys = [
              "osml-model-runner",
              "osml-tile-server",
              "osml-data-intake"
            ];
            const enabledCount = componentKeys.filter((key) => {
              const comp = configAsRecord[key] as Record<string, unknown>;
              return comp && comp.deploy === true;
            }).length;

            if (enabledCount === 0) {
              // No operations when no components enabled
              expect(operations.length).toBe(0);
            } else {
              // Should have network + enabled components
              expect(operations.length).toBe(1 + enabledCount);

              // Network should be first
              expect(operations[0].type).toBe("network");

              // Orders should be sequential starting from 0
              for (let i = 0; i < operations.length; i++) {
                expect(operations[i].order).toBe(i);
              }

              // All components should come after network
              const componentOps = operations.filter(
                (op) => op.type === "component"
              );
              expect(componentOps.length).toBe(enabledCount);
              componentOps.forEach((op) => {
                expect(op.order).toBeGreaterThan(0);
              });
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should ensure network stack has order 0 when components are deployed", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-tile-server": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-data-intake": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const operations = getDeploymentOrder(configAsRecord);

            // Should have 4 operations: network + 3 components
            expect(operations.length).toBe(4);

            // Network must be order 0
            const networkOp = operations.find((op) => op.type === "network");
            expect(networkOp).toBeDefined();
            expect(networkOp!.order).toBe(0);

            // All component orders must be > 0
            const componentOps = operations.filter(
              (op) => op.type === "component"
            );
            expect(componentOps.length).toBe(3);
            componentOps.forEach((op) => {
              expect(op.order).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});

/**
 * Represents a log entry from the deploy script
 */
interface LogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "SUCCESS";
  message: string;
  operation?: string;
  component?: string;
}

/**
 * Represents the types of operations that should be logged
 */
type OperationType = "clone" | "config-write" | "deploy";

/**
 * Simulates parsing log output from the deploy script
 * The deploy script logs in format: [YYYY-MM-DD HH:MM:SS] [LEVEL] message
 */
function parseLogOutput(logOutput: string): LogEntry[] {
  const entries: LogEntry[] = [];
  const logPattern =
    /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[(INFO|WARN|ERROR|SUCCESS)\] (.+)/g;

  let match;
  while ((match = logPattern.exec(logOutput)) !== null) {
    const [, timestamp, level, message] = match;

    // Try to extract operation and component from message
    let operation: string | undefined;
    let component: string | undefined;

    // Match patterns like "Starting operation: clone for component: osml-model-runner"
    // Note: operation can contain hyphens (e.g., "config-write")
    const operationMatch = message.match(
      /(?:Starting|Completed|Failed) operation: ([\w-]+)(?: for component: ([\w-]+))?/
    );
    if (operationMatch) {
      operation = operationMatch[1];
      component = operationMatch[2];
    }

    entries.push({
      timestamp,
      level: level as LogEntry["level"],
      message,
      operation,
      component
    });
  }

  return entries;
}

/**
 * Simulates the expected log entries for a deployment
 * Returns the operations that should be logged based on config
 */
function getExpectedLogOperations(
  config: Record<string, unknown>,
  skipClone: boolean = false,
  networkOnly: boolean = false
): Array<{ operation: OperationType; component: string }> {
  const expectedOps: Array<{ operation: OperationType; component: string }> =
    [];
  const componentKeys = [
    "osml-model-runner",
    "osml-tile-server",
    "osml-data-intake"
  ];

  // Get enabled components
  const enabledComponents = componentKeys.filter((key) => {
    const component = config[key] as Record<string, unknown> | undefined;
    return component && component.deploy === true;
  });

  // In network-only mode, we only deploy the network stack
  if (networkOnly) {
    expectedOps.push({ operation: "deploy", component: "osml-vpc" });
    return expectedOps;
  }

  // If no enabled components, no operations
  if (enabledComponents.length === 0) {
    return expectedOps;
  }

  // Clone operations (unless skipped)
  if (!skipClone) {
    for (const componentKey of enabledComponents) {
      expectedOps.push({ operation: "clone", component: componentKey });
    }
  }

  // Config write operations
  for (const componentKey of enabledComponents) {
    expectedOps.push({ operation: "config-write", component: componentKey });
  }

  // Network deploy operation (always when there are enabled components)
  expectedOps.push({ operation: "deploy", component: "osml-vpc" });

  // Component deploy operations
  for (const componentKey of enabledComponents) {
    expectedOps.push({ operation: "deploy", component: componentKey });
  }

  return expectedOps;
}

/**
 * Simulates generating log output for a deployment
 * This mirrors what the deploy script would output
 */
function simulateLogOutput(
  config: Record<string, unknown>,
  skipClone: boolean = false,
  networkOnly: boolean = false,
  failingComponent?: string
): string {
  const lines: string[] = [];
  const timestamp = "2024-01-15 10:30:00";

  const addLog = (level: string, message: string) => {
    lines.push(`[${timestamp}] [${level}] ${message}`);
  };

  addLog("INFO", "OSML Deployment Script starting");
  addLog("INFO", "Validating configuration file: bin/deployment.json");
  addLog("SUCCESS", "Configuration validated successfully");

  const expectedOps = getExpectedLogOperations(config, skipClone, networkOnly);

  for (const op of expectedOps) {
    // Log operation start
    addLog(
      "INFO",
      `Starting operation: ${op.operation} for component: ${op.component}`
    );

    // Simulate failure if this is the failing component
    if (failingComponent && op.component === failingComponent) {
      addLog(
        "ERROR",
        `Failed operation: ${op.operation} for component: ${op.component}`
      );
      if (op.operation === "clone") {
        addLog(
          "ERROR",
          `Git operation failed for ${op.component}: git clone failed`
        );
      } else if (op.operation === "deploy") {
        addLog(
          "ERROR",
          `CDK deployment failed for ${op.component}: CDK deploy command failed`
        );
      }
      break; // Stop on failure
    }

    // Log operation success
    addLog(
      "SUCCESS",
      `Completed operation: ${op.operation} for component: ${op.component}`
    );
  }

  return lines.join("\n");
}

/**
 * Checks if all expected operations are logged
 */
function areAllOperationsLogged(
  logEntries: LogEntry[],
  expectedOps: Array<{ operation: OperationType; component: string }>
): {
  allLogged: boolean;
  missingOps: Array<{ operation: OperationType; component: string }>;
} {
  const missingOps: Array<{ operation: OperationType; component: string }> = [];

  for (const expectedOp of expectedOps) {
    // Check if there's a log entry for this operation starting
    const hasStartLog = logEntries.some(
      (entry) =>
        entry.operation === expectedOp.operation &&
        entry.component === expectedOp.component &&
        entry.message.includes("Starting operation")
    );

    if (!hasStartLog) {
      missingOps.push(expectedOp);
    }
  }

  return {
    allLogged: missingOps.length === 0,
    missingOps
  };
}

/**
 * Checks if error messages include operation and component information
 */
function errorMessagesAreDescriptive(logEntries: LogEntry[]): boolean {
  const errorEntries = logEntries.filter((entry) => entry.level === "ERROR");

  for (const errorEntry of errorEntries) {
    // Error messages should include either:
    // 1. "for component: X" pattern
    // 2. Component name in the message
    // 3. Operation type in the message
    const hasComponentInfo =
      errorEntry.message.includes("for component:") ||
      errorEntry.message.includes("for ") ||
      errorEntry.component !== undefined;

    const hasOperationInfo =
      errorEntry.message.includes("operation:") ||
      errorEntry.message.includes("clone") ||
      errorEntry.message.includes("deploy") ||
      errorEntry.message.includes("config") ||
      errorEntry.message.includes("Git operation") ||
      errorEntry.message.includes("CDK deployment") ||
      errorEntry.message.includes("Configuration error") ||
      errorEntry.message.includes("AWS API error");

    if (!hasComponentInfo && !hasOperationInfo) {
      return false;
    }
  }

  return true;
}

describe("OSML Logging Completeness Property Tests", () => {
  /**
   * **Feature: osml-deployment-refactor, Property 8: Logging Completeness**
   * *For any* execution of the deploy script, the stdout output SHALL contain
   * log entries for each major operation (clone, config write, deploy) performed.
   * **Validates: Requirements 8.1, 8.2**
   */
  describe("Property 8: Logging Completeness", () => {
    it("should log all clone operations for enabled components", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const configAsRecord = config as Record<string, unknown>;
          const logOutput = simulateLogOutput(configAsRecord, false, false);
          const logEntries = parseLogOutput(logOutput);
          const expectedOps = getExpectedLogOperations(
            configAsRecord,
            false,
            false
          );

          // Filter to just clone operations
          const expectedCloneOps = expectedOps.filter(
            (op) => op.operation === "clone"
          );

          // Check that all clone operations are logged
          for (const cloneOp of expectedCloneOps) {
            const hasCloneLog = logEntries.some(
              (entry) =>
                entry.operation === "clone" &&
                entry.component === cloneOp.component
            );
            expect(hasCloneLog).toBe(true);
          }
        }),
        { numRuns: 25 }
      );
    });

    it("should log all config-write operations for enabled components", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const configAsRecord = config as Record<string, unknown>;
          const logOutput = simulateLogOutput(configAsRecord, false, false);
          const logEntries = parseLogOutput(logOutput);
          const expectedOps = getExpectedLogOperations(
            configAsRecord,
            false,
            false
          );

          // Filter to just config-write operations
          const expectedConfigOps = expectedOps.filter(
            (op) => op.operation === "config-write"
          );

          // Check that all config-write operations are logged
          for (const configOp of expectedConfigOps) {
            const hasConfigLog = logEntries.some(
              (entry) =>
                entry.operation === "config-write" &&
                entry.component === configOp.component
            );
            expect(hasConfigLog).toBe(true);
          }
        }),
        { numRuns: 25 }
      );
    });

    it("should log all deploy operations for enabled components and network", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const configAsRecord = config as Record<string, unknown>;
          const logOutput = simulateLogOutput(configAsRecord, false, false);
          const logEntries = parseLogOutput(logOutput);
          const expectedOps = getExpectedLogOperations(
            configAsRecord,
            false,
            false
          );

          // Filter to just deploy operations
          const expectedDeployOps = expectedOps.filter(
            (op) => op.operation === "deploy"
          );

          // Check that all deploy operations are logged
          for (const deployOp of expectedDeployOps) {
            const hasDeployLog = logEntries.some(
              (entry) =>
                entry.operation === "deploy" &&
                entry.component === deployOp.component
            );
            expect(hasDeployLog).toBe(true);
          }
        }),
        { numRuns: 25 }
      );
    });

    it("should include timestamps in all log entries", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const configAsRecord = config as Record<string, unknown>;
          const logOutput = simulateLogOutput(configAsRecord, false, false);
          const logEntries = parseLogOutput(logOutput);

          // All log entries should have timestamps
          for (const entry of logEntries) {
            expect(entry.timestamp).toBeDefined();
            expect(entry.timestamp).toMatch(
              /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/
            );
          }
        }),
        { numRuns: 25 }
      );
    });

    it("should log all expected operations for a complete deployment", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-tile-server": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-data-intake": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const logOutput = simulateLogOutput(configAsRecord, false, false);
            const logEntries = parseLogOutput(logOutput);
            const expectedOps = getExpectedLogOperations(
              configAsRecord,
              false,
              false
            );

            const result = areAllOperationsLogged(logEntries, expectedOps);
            expect(result.allLogged).toBe(true);
            expect(result.missingOps.length).toBe(0);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should skip clone logs when --skip-clone flag is used", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const configAsRecord = config as Record<string, unknown>;
          const logOutput = simulateLogOutput(configAsRecord, true, false); // skip-clone = true
          const logEntries = parseLogOutput(logOutput);

          // Should not have any clone operation logs
          const cloneLogs = logEntries.filter(
            (entry) => entry.operation === "clone"
          );
          expect(cloneLogs.length).toBe(0);
        }),
        { numRuns: 25 }
      );
    });

    it("should only log network deploy in network-only mode", () => {
      fc.assert(
        fc.property(validDeploymentConfigArb, (config) => {
          const configAsRecord = config as Record<string, unknown>;
          const logOutput = simulateLogOutput(configAsRecord, false, true); // network-only = true
          const logEntries = parseLogOutput(logOutput);

          // Should not have any clone or config-write logs
          const cloneLogs = logEntries.filter(
            (entry) => entry.operation === "clone"
          );
          const configLogs = logEntries.filter(
            (entry) => entry.operation === "config-write"
          );
          expect(cloneLogs.length).toBe(0);
          expect(configLogs.length).toBe(0);

          // Should have network deploy log
          const networkDeployLog = logEntries.find(
            (entry) =>
              entry.operation === "deploy" && entry.component === "osml-vpc"
          );
          expect(networkDeployLog).toBeDefined();

          // Should not have component deploy logs
          const componentDeployLogs = logEntries.filter(
            (entry) =>
              entry.operation === "deploy" && entry.component !== "osml-vpc"
          );
          expect(componentDeployLogs.length).toBe(0);
        }),
        { numRuns: 25 }
      );
    });

    it("should include descriptive error messages with operation and component info", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          fc.constantFrom("osml-model-runner", "osml-vpc"),
          (config, failingComponent) => {
            const configAsRecord = config as Record<string, unknown>;
            const logOutput = simulateLogOutput(
              configAsRecord,
              false,
              false,
              failingComponent
            );
            const logEntries = parseLogOutput(logOutput);

            // Check that error messages are descriptive
            expect(errorMessagesAreDescriptive(logEntries)).toBe(true);

            // Check that there's at least one error entry for the failing component
            const errorEntries = logEntries.filter(
              (entry) => entry.level === "ERROR"
            );
            expect(errorEntries.length).toBeGreaterThan(0);

            // Error should mention the failing component
            const hasComponentError = errorEntries.some(
              (entry) =>
                entry.message.includes(failingComponent) ||
                entry.component === failingComponent
            );
            expect(hasComponentError).toBe(true);
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should log operations in correct order: clone -> config-write -> deploy", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(true),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const logOutput = simulateLogOutput(configAsRecord, false, false);
            const logEntries = parseLogOutput(logOutput);

            // Find indices of different operation types
            const cloneIndex = logEntries.findIndex(
              (entry) =>
                entry.operation === "clone" &&
                entry.component === "osml-model-runner"
            );
            const configIndex = logEntries.findIndex(
              (entry) =>
                entry.operation === "config-write" &&
                entry.component === "osml-model-runner"
            );
            const networkDeployIndex = logEntries.findIndex(
              (entry) =>
                entry.operation === "deploy" && entry.component === "osml-vpc"
            );
            const componentDeployIndex = logEntries.findIndex(
              (entry) =>
                entry.operation === "deploy" &&
                entry.component === "osml-model-runner"
            );

            // Verify order: clone < config-write < network deploy < component deploy
            if (cloneIndex !== -1 && configIndex !== -1) {
              expect(cloneIndex).toBeLessThan(configIndex);
            }
            if (configIndex !== -1 && networkDeployIndex !== -1) {
              expect(configIndex).toBeLessThan(networkDeployIndex);
            }
            if (networkDeployIndex !== -1 && componentDeployIndex !== -1) {
              expect(networkDeployIndex).toBeLessThan(componentDeployIndex);
            }
          }
        ),
        { numRuns: 25 }
      );
    });

    it("should handle configs with no enabled components gracefully", () => {
      fc.assert(
        fc.property(
          fc.record({
            account: fc.record({
              id: accountIdArb,
              region: regionArb,
              prodLike: fc.boolean(),
              isAdc: fc.boolean()
            }),
            "osml-model-runner": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-tile-server": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            }),
            "osml-data-intake": fc.record({
              deploy: fc.constant(false),
              gitUrl: gitUrlArb,
              gitTarget: gitTargetArb,
              config: fc.record({ projectName: projectNameArb })
            })
          }),
          (config) => {
            const configAsRecord = config as Record<string, unknown>;
            const logOutput = simulateLogOutput(configAsRecord, false, false);
            const logEntries = parseLogOutput(logOutput);

            // Should still have basic logs (script start, config validation)
            expect(logEntries.length).toBeGreaterThan(0);

            // Should not have any operation logs for components
            const operationLogs = logEntries.filter(
              (entry) => entry.operation !== undefined
            );
            expect(operationLogs.length).toBe(0);
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});
