/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment } from "aws-cdk-lib";
import { OSMLAccount } from "osml-cdk-constructs";

import { OSMLRolesStack } from "../lib/osml-stacks/osml-roles";
import { OSMLVpcStack } from "../lib/osml-stacks/osml-vpc";

/**
 * Deploys the Virtual Private Cloud (VPC) stack for the OversightML applications to operate within.

 *
 * @param app The CDK `App` instance where the stack will be deployed.
 * @param targetEnv The target deployment environment for the stack, specifying the AWS account and region to deploy to.
 * @param targetAccount Provides additional details of the target AWS account specific to the OversightML setup.
 * @param osmlRolesStack An optional instance of `OSMLRolesStack`. If provided, the deployed VPC stack will be configured
 * to have a dependency on it, ensuring the necessary roles and permissions are in place before setting up the VPC.
 * @returns An instance of OSMLVpcStack, representing the deployed VPC and networking infrastructure within the AWS CDK application.
 */
export function deployVpc(
  app: App,
  targetEnv: Environment,
  targetAccount: OSMLAccount,
  osmlRolesStack: OSMLRolesStack | undefined
): OSMLVpcStack {
  // Deploy the Virtual Private Cloud (VPC) resources for OversightML
  const vpcStack = new OSMLVpcStack(app, `${targetAccount.name}-OSMLVpc`, {
    env: targetEnv,
    account: targetAccount,
    description: "Guidance for Overhead Imagery Inference on AWS (SO9240)"
  });
  // If a role stack was provided, make it the VPC dependent on it due to
  if (osmlRolesStack) {
    vpcStack.addDependency(osmlRolesStack);
  }

  return vpcStack;
}
