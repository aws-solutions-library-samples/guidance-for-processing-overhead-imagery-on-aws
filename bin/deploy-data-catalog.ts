/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment } from "aws-cdk-lib";
import { ITopic } from "aws-cdk-lib/aws-sns";
import { OSMLAccount } from "osml-cdk-constructs";

import { DCDataplaneStack } from "../lib/osml-stacks/data-catalog/dc-dataplane";
import { DCIngestContainerStack } from "../lib/osml-stacks/data-catalog/dc-ingest-container";
import { DCStacContainerStack } from "../lib/osml-stacks/data-catalog/dc-stac-container";
import { OSMLVpcStack } from "../lib/osml-stacks/osml-vpc";

/**
 * Deploys all the necessary infrastructure for the data Catalog service. This includes the base lambda container and the
 * dataplane to support its operation.

 *
 * @param app The CDK `App` instance where the stack will be deployed.
 * @param targetEnv The target deployment environment for the stack, specifying the AWS account and region to deploy to.
 * @param targetAccount Provides additional details of the target AWS account specific to the OversightML setup.
 * @param vpcStack Provides the VPC OSML is deployed into.
 * @param ingestTopic Provides an ingest topic to subscribe the stac catalog to.
 * @param buildFromSource Whether to build the container from source.
 * @returns An instance of OSMLVpcStack, representing the deployed VPC and networking infrastructure within the AWS CDK application.
 */
export function deployDataCatalog(
  app: App,
  targetEnv: Environment,
  targetAccount: OSMLAccount,
  vpcStack: OSMLVpcStack,
  ingestTopic: ITopic | undefined = undefined,
  buildFromSource: boolean | undefined = undefined
) {
  // Deploy the ECR container mirror for the Lambda Docker image
  const dcIngestContainerStack = new DCIngestContainerStack(
    app,
    `${targetAccount.name}-DCIngestContainer`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      buildFromSource: buildFromSource,
      description:
        "Data Catalog Container, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );
  dcIngestContainerStack.addDependency(vpcStack);

  // Deploy the ECR container mirror for the Lambda Docker image
  const dcStacContainerStack = new DCStacContainerStack(
    app,
    `${targetAccount.name}-DCStacContainer`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      buildFromSource: buildFromSource,
      description:
        "Data Catalog Container, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );
  dcStacContainerStack.addDependency(vpcStack);

  // Deploy the dataplane for the STAC catalog service
  const dataplaneStack = new DCDataplaneStack(
    app,
    `${targetAccount.name}-DCDataplane`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      stacCode: dcStacContainerStack.resources.dockerImageCode,
      ingestCode: dcIngestContainerStack.resources.dockerImageCode,
      ingestTopic: ingestTopic,
      description:
        "Data Catalog Dataplane, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );
  dataplaneStack.addDependency(dcIngestContainerStack);
  dataplaneStack.addDependency(dcStacContainerStack);
}
