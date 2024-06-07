/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment } from "aws-cdk-lib";
import { OSMLAccount } from "osml-cdk-constructs";

import { DCContainerStack } from "../lib/osml-stacks/data-catalog/dc-container";
import { DCDataplaneStack } from "../lib/osml-stacks/data-catalog/dc-dataplane";
import { OSMLVpcStack } from "../lib/osml-stacks/osml-vpc";

/**
 * Deploys all the necessary infrastructure for the data Catalog service. This includes the base lambda container and the
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
export function deployDataCatalog(
  app: App,
  targetEnv: Environment,
  targetAccount: OSMLAccount,
  vpcStack: OSMLVpcStack
) {
  // Deploy the ECR container mirror for the Lambda Docker image
  const containerStack = new DCContainerStack(
    app,
    `${targetAccount.name}-DCContainer`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      description:
        "Data Catalog Container, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );

  containerStack.addDependency(vpcStack);

  // Deploy the dataplane for the STAC catalog service
  const dataplaneStack = new DCDataplaneStack(
    app,
    `${targetAccount.name}-DCDataplane`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      dockerImageCode: containerStack.resources.dockerImageCode,
      description:
        "Data Catalog Dataplane, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );

  dataplaneStack.addDependency(containerStack);
}
