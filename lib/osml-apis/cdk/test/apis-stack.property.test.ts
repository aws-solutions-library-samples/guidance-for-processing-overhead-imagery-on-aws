/**
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

/**
 * Property-based tests for OSMLApisStack conditional integration deployment.
 *
 * These tests verify Property 4 from the design document:
 * "For any deployment configuration, integrations are deployed if and only if
 * their corresponding configuration values are provided."
 */

import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import {
  type Arbitrary,
  array,
  assert,
  constant,
  constantFrom,
  option,
  property,
  record,
  string,
  tuple
} from "fast-check";

import { OSMLApisStack } from "../lib/apis-stack";
import {
  createTestDeploymentConfig,
  createTestEnvironment
} from "./test-utils";

// Counter for unique stack IDs - use prefix to avoid collision with unit tests
let propTestCounter = 0;

/**
 * Arbitrary for generating valid URLs
 */
const urlArb: Arbitrary<string> = constantFrom(
  "http://internal-tile-server-alb.us-west-2.elb.amazonaws.com",
  "http://internal-geo-agents-alb.us-west-2.elb.amazonaws.com",
  "https://api.example.com",
  "http://localhost:8080"
);

/**
 * Arbitrary for generating valid Lambda ARNs
 */
const lambdaArnArb: Arbitrary<string> = tuple(
  constantFrom("us-east-1", "us-west-2", "eu-west-1"),
  string({
    minLength: 12,
    maxLength: 12,
    unit: constantFrom("0", "1", "2", "3", "4", "5", "6", "7", "8", "9")
  }),
  string({
    minLength: 1,
    maxLength: 20,
    unit: constantFrom(
      ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split(
        ""
      )
    )
  })
).map(
  ([region, account, name]) =>
    `arn:aws:lambda:${region}:${account}:function:${name}`
);

/**
 * Arbitrary for generating valid ALB ARNs
 */
const albArnArb: Arbitrary<string> = constantFrom(
  "arn:aws:elasticloadbalancing:us-west-2:123456789012:loadbalancer/app/tile-server/abc123",
  "arn:aws:elasticloadbalancing:us-west-2:123456789012:loadbalancer/app/geo-agents/def456"
);

/**
 * Arbitrary for generating optional integration configurations.
 * VPC Link integrations (Tile Server, Geo Agents) require both a URL and an ALB ARN.
 * Uses flattened dataplaneConfig structure with UPPER_SNAKE_CASE property names.
 */
const integrationsConfigArb = record({
  TILE_SERVER_URL: option(urlArb, { nil: undefined }),
  TILE_SERVER_ALB_ARN: option(albArnArb, { nil: undefined }),
  DATA_INTAKE_LAMBDA_ARN: option(lambdaArnArb, { nil: undefined }),
  GEO_AGENTS_MCP_URL: option(urlArb, { nil: undefined }),
  GEO_AGENTS_ALB_ARN: option(albArnArb, { nil: undefined }),
  CORS_ALLOWED_ORIGINS: option(array(constant("https://example.com")), {
    nil: undefined
  })
});

/**
 * Helper to create a test stack with the given integrations config.
 * Creates a fresh App and VPC for each test to avoid CDK synthesis conflicts.
 */
function createTestStack(integrationsConfig: {
  TILE_SERVER_URL?: string;
  TILE_SERVER_ALB_ARN?: string;
  DATA_INTAKE_LAMBDA_ARN?: string;
  GEO_AGENTS_MCP_URL?: string;
  GEO_AGENTS_ALB_ARN?: string;
  CORS_ALLOWED_ORIGINS?: string[];
}): { stack: OSMLApisStack; template: Template } {
  const uniqueId = `prop-${++propTestCounter}`;
  const env = createTestEnvironment();

  // Create fresh App for each test
  const app = new App();

  // Create VPC stack
  const vpcStack = new Stack(app, `VpcStack${uniqueId}`, { env });
  const vpc = new Vpc(vpcStack, "TestVpc", { maxAzs: 2 });
  const securityGroup = new SecurityGroup(vpcStack, "TestSG", {
    vpc,
    allowAllOutbound: true
  });
  const selectedSubnets = vpc.selectSubnets({ subnetType: undefined });

  const deployment = createTestDeploymentConfig({
    dataplaneConfig: {
      authConfig: {
        authority: "https://keycloak.example.com/realms/osml",
        audience: "osml-client"
      },
      ...integrationsConfig
    }
  });

  deployment.projectName = `test-prop-${uniqueId}`;

  const stack = new OSMLApisStack(app, `TestApisStack${uniqueId}`, {
    env,
    deployment,
    vpc,
    selectedSubnets,
    securityGroup,
    skipBundling: true
  });

  const template = Template.fromStack(stack);
  return { stack, template };
}

describe("OSMLApisStack Property Tests", () => {
  /**
   * **Feature: osml-apis, Property 1: Authorizer Deployment Invariant**
   */
  describe("Property 1: Authorizer Deployment Invariant", () => {
    it("should always deploy the authorizer Lambda function for any valid configuration", () => {
      assert(
        property(integrationsConfigArb, (integrationsConfig) => {
          const { stack, template } = createTestStack(integrationsConfig);

          expect(stack.authorizerFunction).toBeDefined();
          expect(stack.authorizerFunction.functionArn).toBeDefined();
          template.resourceCountIs("AWS::Lambda::Function", 1);
          template.hasResourceProperties("AWS::Lambda::Function", {
            Handler: "lambda_function.lambda_handler"
          });
        }),
        { numRuns: 25 }
      );
    });

    it("should always output the authorizer function ARN for any valid configuration", () => {
      assert(
        property(integrationsConfigArb, (integrationsConfig) => {
          const { template } = createTestStack(integrationsConfig);

          template.hasOutput("AuthorizerFunctionArn", {
            Description: "Lambda Authorizer Function ARN"
          });
        }),
        { numRuns: 25 }
      );
    });

    it("should configure the authorizer with environment variables for any valid configuration", () => {
      assert(
        property(integrationsConfigArb, (integrationsConfig) => {
          const { template } = createTestStack(integrationsConfig);

          template.hasResourceProperties("AWS::Lambda::Function", {
            Environment: {
              Variables: {
                AUTHORITY: "https://keycloak.example.com/realms/osml",
                AUDIENCE: "osml-client"
              }
            }
          });
        }),
        { numRuns: 25 }
      );
    });

    it("should deploy the authorizer in VPC for any valid configuration", () => {
      assert(
        property(integrationsConfigArb, (integrationsConfig) => {
          const { stack } = createTestStack(integrationsConfig);

          expect(stack.authorizerFunction.connections).toBeDefined();
        }),
        { numRuns: 25 }
      );
    });
  });

  /**
   * **Feature: osml-apis, Property 4: Conditional Integration Deployment**
   */
  describe("Property 4: Conditional Integration Deployment", () => {
    it("should deploy integrations if and only if their config values are provided", () => {
      assert(
        property(integrationsConfigArb, (integrationsConfig) => {
          const { stack } = createTestStack(integrationsConfig);

          let expectedIntegrationCount = 0;
          // VPC Link integrations require both URL and ALB ARN
          if (
            integrationsConfig.TILE_SERVER_URL &&
            integrationsConfig.TILE_SERVER_ALB_ARN
          )
            expectedIntegrationCount++;
          if (integrationsConfig.DATA_INTAKE_LAMBDA_ARN)
            expectedIntegrationCount++;
          if (
            integrationsConfig.GEO_AGENTS_MCP_URL &&
            integrationsConfig.GEO_AGENTS_ALB_ARN
          )
            expectedIntegrationCount++;

          if (
            integrationsConfig.TILE_SERVER_URL &&
            integrationsConfig.TILE_SERVER_ALB_ARN
          ) {
            expect(stack.tileServerIntegration).toBeDefined();
            expect(stack.tileServerIntegration?.effectiveUrl).toBeDefined();
          } else {
            expect(stack.tileServerIntegration).toBeUndefined();
          }

          if (integrationsConfig.DATA_INTAKE_LAMBDA_ARN) {
            expect(stack.dataIntakeIntegration).toBeDefined();
            expect(stack.dataIntakeIntegration?.effectiveUrl).toBeDefined();
          } else {
            expect(stack.dataIntakeIntegration).toBeUndefined();
          }

          if (
            integrationsConfig.GEO_AGENTS_MCP_URL &&
            integrationsConfig.GEO_AGENTS_ALB_ARN
          ) {
            expect(stack.geoAgentsMcpIntegration).toBeDefined();
            expect(stack.geoAgentsMcpIntegration?.effectiveUrl).toBeDefined();
          } else {
            expect(stack.geoAgentsMcpIntegration).toBeUndefined();
          }

          let actualIntegrationCount = 0;
          if (stack.tileServerIntegration) actualIntegrationCount++;
          if (stack.dataIntakeIntegration) actualIntegrationCount++;
          if (stack.geoAgentsMcpIntegration) actualIntegrationCount++;

          expect(actualIntegrationCount).toBe(expectedIntegrationCount);
        }),
        { numRuns: 25 }
      );
    });

    it("should always deploy the authorizer function regardless of integrations", () => {
      assert(
        property(integrationsConfigArb, (integrationsConfig) => {
          const { stack } = createTestStack(integrationsConfig);

          expect(stack.authorizerFunction).toBeDefined();
          expect(stack.authorizerFunction.functionArn).toBeDefined();
        }),
        { numRuns: 25 }
      );
    });

    it("should deploy no integrations when no URLs/ARNs are provided", () => {
      const { stack } = createTestStack({});

      expect(stack.tileServerIntegration).toBeUndefined();
      expect(stack.dataIntakeIntegration).toBeUndefined();
      expect(stack.geoAgentsMcpIntegration).toBeUndefined();
      expect(stack.authorizerFunction).toBeDefined();
    });

    it("should deploy all integrations when all URLs/ARNs are provided", () => {
      const { stack } = createTestStack({
        TILE_SERVER_URL:
          "http://internal-tile-server-alb.us-west-2.elb.amazonaws.com",
        TILE_SERVER_ALB_ARN:
          "arn:aws:elasticloadbalancing:us-west-2:123456789012:loadbalancer/app/tile-server/abc123",
        DATA_INTAKE_LAMBDA_ARN:
          "arn:aws:lambda:us-west-2:123456789012:function:stac-api",
        GEO_AGENTS_MCP_URL:
          "http://internal-geo-agents-alb.us-west-2.elb.amazonaws.com",
        GEO_AGENTS_ALB_ARN:
          "arn:aws:elasticloadbalancing:us-west-2:123456789012:loadbalancer/app/geo-agents/def456"
      });

      expect(stack.tileServerIntegration).toBeDefined();
      expect(stack.dataIntakeIntegration).toBeDefined();
      expect(stack.geoAgentsMcpIntegration).toBeDefined();
      expect(stack.authorizerFunction).toBeDefined();
    });

    it("should deploy only Tile Server integration when only TILE_SERVER_URL and ALB_ARN are provided", () => {
      assert(
        property(urlArb, (TILE_SERVER_URL) => {
          const { stack } = createTestStack({
            TILE_SERVER_URL,
            TILE_SERVER_ALB_ARN:
              "arn:aws:elasticloadbalancing:us-west-2:123456789012:loadbalancer/app/tile-server/abc123"
          });

          expect(stack.tileServerIntegration).toBeDefined();
          expect(stack.dataIntakeIntegration).toBeUndefined();
          expect(stack.geoAgentsMcpIntegration).toBeUndefined();
        }),
        { numRuns: 10 }
      );
    });

    it("should deploy only Data Intake integration when only DATA_INTAKE_LAMBDA_ARN is provided", () => {
      assert(
        property(lambdaArnArb, (DATA_INTAKE_LAMBDA_ARN) => {
          const { stack } = createTestStack({ DATA_INTAKE_LAMBDA_ARN });

          expect(stack.tileServerIntegration).toBeUndefined();
          expect(stack.dataIntakeIntegration).toBeDefined();
          expect(stack.geoAgentsMcpIntegration).toBeUndefined();
        }),
        { numRuns: 10 }
      );
    });

    it("should deploy only Geo Agents MCP integration when only GEO_AGENTS_MCP_URL and ALB_ARN are provided", () => {
      assert(
        property(urlArb, (GEO_AGENTS_MCP_URL) => {
          const { stack } = createTestStack({
            GEO_AGENTS_MCP_URL,
            GEO_AGENTS_ALB_ARN:
              "arn:aws:elasticloadbalancing:us-west-2:123456789012:loadbalancer/app/geo-agents/def456"
          });

          expect(stack.tileServerIntegration).toBeUndefined();
          expect(stack.dataIntakeIntegration).toBeUndefined();
          expect(stack.geoAgentsMcpIntegration).toBeDefined();
        }),
        { numRuns: 10 }
      );
    });
  });

  /**
   * **Feature: osml-apis, Property 6: Stack Outputs Match Deployed Integrations**
   */
  describe("Property 6: Stack Outputs Match Deployed Integrations", () => {
    it("should always output AuthorizerFunctionArn for any valid configuration", () => {
      assert(
        property(integrationsConfigArb, (integrationsConfig) => {
          const { template } = createTestStack(integrationsConfig);

          template.hasOutput("AuthorizerFunctionArn", {
            Description: "Lambda Authorizer Function ARN"
          });
        }),
        { numRuns: 25 }
      );
    });

    it("should output TileServerApiUrl if and only if TILE_SERVER_URL and ALB_ARN are provided", () => {
      assert(
        property(integrationsConfigArb, (integrationsConfig) => {
          const { template } = createTestStack(integrationsConfig);
          const outputs = template.findOutputs("*");

          if (
            integrationsConfig.TILE_SERVER_URL &&
            integrationsConfig.TILE_SERVER_ALB_ARN
          ) {
            expect(outputs).toHaveProperty("TileServerApiUrl");
          } else {
            expect(outputs).not.toHaveProperty("TileServerApiUrl");
          }
        }),
        { numRuns: 25 }
      );
    });

    it("should output DataIntakeApiUrl if and only if DATA_INTAKE_LAMBDA_ARN is provided", () => {
      assert(
        property(integrationsConfigArb, (integrationsConfig) => {
          const { template } = createTestStack(integrationsConfig);
          const outputs = template.findOutputs("*");

          if (integrationsConfig.DATA_INTAKE_LAMBDA_ARN) {
            expect(outputs).toHaveProperty("DataIntakeApiUrl");
          } else {
            expect(outputs).not.toHaveProperty("DataIntakeApiUrl");
          }
        }),
        { numRuns: 25 }
      );
    });

    it("should output GeoAgentsMcpApiUrl if and only if GEO_AGENTS_MCP_URL and ALB_ARN are provided", () => {
      assert(
        property(integrationsConfigArb, (integrationsConfig) => {
          const { template } = createTestStack(integrationsConfig);
          const outputs = template.findOutputs("*");

          if (
            integrationsConfig.GEO_AGENTS_MCP_URL &&
            integrationsConfig.GEO_AGENTS_ALB_ARN
          ) {
            expect(outputs).toHaveProperty("GeoAgentsMcpApiUrl");
          } else {
            expect(outputs).not.toHaveProperty("GeoAgentsMcpApiUrl");
          }
        }),
        { numRuns: 25 }
      );
    });

    it("should have outputs that exactly match the deployed integrations", () => {
      assert(
        property(integrationsConfigArb, (integrationsConfig) => {
          const { template } = createTestStack(integrationsConfig);
          const outputs = template.findOutputs("*");

          expect(outputs).toHaveProperty("AuthorizerFunctionArn");

          if (
            integrationsConfig.TILE_SERVER_URL &&
            integrationsConfig.TILE_SERVER_ALB_ARN
          ) {
            expect(outputs).toHaveProperty("TileServerApiUrl");
          } else {
            expect(outputs).not.toHaveProperty("TileServerApiUrl");
          }

          if (integrationsConfig.DATA_INTAKE_LAMBDA_ARN) {
            expect(outputs).toHaveProperty("DataIntakeApiUrl");
          } else {
            expect(outputs).not.toHaveProperty("DataIntakeApiUrl");
          }

          if (
            integrationsConfig.GEO_AGENTS_MCP_URL &&
            integrationsConfig.GEO_AGENTS_ALB_ARN
          ) {
            expect(outputs).toHaveProperty("GeoAgentsMcpApiUrl");
          } else {
            expect(outputs).not.toHaveProperty("GeoAgentsMcpApiUrl");
          }
        }),
        { numRuns: 25 }
      );
    });

    it("should output only AuthorizerFunctionArn when no integrations are configured", () => {
      const { template } = createTestStack({});
      const outputs = template.findOutputs("*");

      expect(Object.keys(outputs)).toHaveLength(1);
      expect(outputs).toHaveProperty("AuthorizerFunctionArn");
      expect(outputs).not.toHaveProperty("TileServerApiUrl");
      expect(outputs).not.toHaveProperty("DataIntakeApiUrl");
      expect(outputs).not.toHaveProperty("GeoAgentsMcpApiUrl");
    });

    it("should output all API URLs when all integrations are configured", () => {
      const { template } = createTestStack({
        TILE_SERVER_URL:
          "http://internal-tile-server-alb.us-west-2.elb.amazonaws.com",
        TILE_SERVER_ALB_ARN:
          "arn:aws:elasticloadbalancing:us-west-2:123456789012:loadbalancer/app/tile-server/abc123",
        DATA_INTAKE_LAMBDA_ARN:
          "arn:aws:lambda:us-west-2:123456789012:function:stac-api",
        GEO_AGENTS_MCP_URL:
          "http://internal-geo-agents-alb.us-west-2.elb.amazonaws.com",
        GEO_AGENTS_ALB_ARN:
          "arn:aws:elasticloadbalancing:us-west-2:123456789012:loadbalancer/app/geo-agents/def456"
      });
      const outputs = template.findOutputs("*");

      expect(outputs).toHaveProperty("AuthorizerFunctionArn");
      expect(outputs).toHaveProperty("TileServerApiUrl");
      expect(outputs).toHaveProperty("DataIntakeApiUrl");
      expect(outputs).toHaveProperty("GeoAgentsMcpApiUrl");
    });
  });
});
