/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment } from "aws-cdk-lib";
import { OSMLAccount } from "osml-cdk-constructs";

import { DIContainerStack } from "../lib/osml-stacks/data_intake/di-container";
import { DIDataplaneStack } from "../lib/osml-stacks/data_intake/di-dataplane";
import { OSMLVpcStack } from "../lib/osml-stacks/osml-vpc";

/**
 * Deploys the image handler service.

 *
 * @param app The CDK `App` instance where the stack will be deployed.
 * @param targetEnv The target deployment environment for the stack, specifying the AWS account and region to deploy to.
 * @param targetAccount Provides additional details of the target AWS account specific to the OversightML setup.
 * to have a dependency on it, ensuring the necessary roles and permissions are in place before setting up the VPC.
 * @param vpcStack Provides the VPC OSML is deployed into.
 * @param buildFromSource Whether to build the container from source.
 * @returns An instance of OSMLVpcStack, representing the deployed VPC and networking infrastructure within the AWS CDK application.
 */
export function deployDataIntake(
  app: App,
  targetEnv: Environment,
  targetAccount: OSMLAccount,
  vpcStack: OSMLVpcStack,
  buildFromSource: boolean = true,
) {
  const containerStack = new DIContainerStack(
    app,
    `${targetAccount.name}-DIContainer`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      buildFromSource: buildFromSource
    }
  );

  containerStack.addDependency(vpcStack);

  // Deploy the Virtual Private Cloud (VPC) resources for OversightML
  const dataplaneStack = new DIDataplaneStack(
    app,
    `${targetAccount.name}-DIDataplane`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      dockerImageCode: containerStack.resources.dockerImageCode,
      description: "Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );

  dataplaneStack.addDependency(vpcStack);
  dataplaneStack.addDependency(containerStack);
}
