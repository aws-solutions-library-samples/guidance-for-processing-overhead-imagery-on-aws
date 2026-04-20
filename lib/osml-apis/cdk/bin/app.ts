#!/usr/bin/env node

/**
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

/**
 * @file Entry point for the OSML APIs CDK application.
 *
 * This file bootstraps the CDK app, loads deployment configuration,
 * and instantiates the NetworkStack and OSMLApisStack with validated parameters.
 *
 * Requirements addressed:
 * - 1.2: Configured as a Phase 3 component in the deployment configuration
 * - 1.3: Declares dependencies on osml-vpc and amazon-mission-solutions-auth-server
 */

import { App } from "aws-cdk-lib";

import { OSMLApisStack } from "../lib/apis-stack";
import { NetworkStack } from "../lib/network-stack";
import { loadDeploymentConfig } from "./deployment/load-deployment";

/**
 * Load and validate deployment configuration from deployment.json.
 *
 * This includes:
 * - Project name
 * - AWS account ID and region
 * - Auth configuration (authority, audience)
 * - Integration configuration (tileServerUrl, dataIntakeLambdaArn, geoAgentsMcpUrl)
 * - Network configuration (VPC_ID, TARGET_SUBNETS, SECURITY_GROUP_ID)
 */
const deployment = loadDeploymentConfig();

console.log(
  `Using environment from deployment.json: projectName=${deployment.projectName}, region=${deployment.account.region}`
);

const app = new App();

// -----------------------------------------------------------------------------
// Deploy the Network Stack
// -----------------------------------------------------------------------------

/**
 * The NetworkStack handles VPC lookup and security group resolution.
 * It imports an existing VPC based on the VPC_ID in the deployment configuration.
 *
 * This stack must be deployed first as the OSMLApisStack depends on it
 * for VPC, subnet, and security group references.
 */
const networkStack = new NetworkStack(
  app,
  `${deployment.projectName}-Network`,
  {
    env: {
      account: deployment.account.id,
      region: deployment.account.region
    },
    deployment: deployment,
    description: "OSML APIs, Network infrastructure (SO9240)"
  }
);

// -----------------------------------------------------------------------------
// Deploy the OSML APIs Stack
// -----------------------------------------------------------------------------

/**
 * The OSMLApisStack creates:
 * - A shared Lambda authorizer for JWT validation (always deployed)
 * - Conditional API Gateway integrations based on configuration:
 *   - Tile Server integration (if tileServerUrl is provided)
 *   - Data Intake integration (if dataIntakeLambdaArn is provided)
 *   - Geo Agents integration (if geoAgentsMcpUrl is provided)
 *
 * Stack outputs include:
 * - AuthorizerFunctionArn (always)
 * - TileServerApiUrl (conditional)
 * - DataIntakeApiUrl (conditional)
 * - GeoAgentsApiUrl (conditional)
 */
const apisStack = new OSMLApisStack(
  app,
  `${deployment.projectName}-Dataplane`,
  {
    env: {
      account: deployment.account.id,
      region: deployment.account.region
    },
    deployment: deployment,
    vpc: networkStack.network.vpc,
    selectedSubnets: networkStack.network.selectedSubnets,
    securityGroup: networkStack.network.securityGroup,
    description:
      "OSML APIs, Unified API Gateway layer with JWT authentication (SO9240)"
  }
);

// Establish dependency: APIs stack depends on API Network stack
apisStack.node.addDependency(networkStack);
