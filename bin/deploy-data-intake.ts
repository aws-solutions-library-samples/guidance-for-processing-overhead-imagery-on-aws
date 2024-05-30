/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment } from "aws-cdk-lib";
import { OSMLAccount } from "osml-cdk-constructs";

import { DIContainerStack } from "../lib/osml-stacks/data_intake/di-container";
import { DIDataplaneStack } from "../lib/osml-stacks/data_intake/di-dataplane";
import { DIImageryStack } from "../lib/osml-stacks/data_intake/di-imagery";
import { OSMLVpcStack } from "../lib/osml-stacks/osml-vpc";

/**
 * Deploys all the necessary infrastructure for the data intake service. This includes the base lambda container and the
 * dataplane to support its operation.

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
  buildFromSource: boolean = true
) {
  // Deploy the ECR container mirror for the Lambda Docker image
  const containerStack = new DIContainerStack(
    app,
    `${targetAccount.name}-DIContainer`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      buildFromSource: buildFromSource,
      description:
        "Data Intake Container, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );

  containerStack.addDependency(vpcStack);

  // Deploy the dataplane for the Data Intake service
  const dataplaneStack = new DIDataplaneStack(
    app,
    `${targetAccount.name}-DIDataplane`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      dockerImageCode: containerStack.resources.dockerImageCode,
      description:
        "Data Intake Dataplane, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );

  dataplaneStack.addDependency(vpcStack);
  dataplaneStack.addDependency(containerStack);

  // Deploy the test imagery for the data intake service
  new DIImageryStack(app, `${targetAccount.name}-DIImagery`, {
    env: targetEnv,
    account: targetAccount,
    vpc: vpcStack.resources.vpc,
    description:
      "Data Intake Test Imagery, Guidance for Overhead Imagery Inference on AWS (SO9240)"
  });
}
