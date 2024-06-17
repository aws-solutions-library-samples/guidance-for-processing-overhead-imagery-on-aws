/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment } from "aws-cdk-lib";
import { OSMLAccount, MEContainerConfig } from "osml-cdk-constructs";

import { MRModelEndpointsStack } from "../lib/osml-stacks/model_runner_examples/mr-endpoints";
import { MRImageryStack } from "../lib/osml-stacks/model_runner_examples/mr-imagery";
import { MRModelContainerStack } from "../lib/osml-stacks/model_runner_examples/mr-model-container";
import { MRSyncStack } from "../lib/osml-stacks/model_runner_examples/mr-sync";
import { OSMLRolesStack } from "../lib/osml-stacks/osml-roles";
import { OSMLVpcStack } from "../lib/osml-stacks/osml-vpc";

/**
 * Deploys all necessary stacks for the OversightML Model Runner application within the specified AWS CDK application.
 * This includes roles, container stacks, data planes, auto-scaling configurations, model endpoints,
 * synchronization mechanisms, and monitoring dashboards tailored to the target environment.
 *
 * @param app The CDK `App` instance where the stacks will be deployed.
 * @param targetEnv The target deployment environment, including account and region.
 * @param targetAccount Details of the target AWS account where the stacks are deployed, including configurations for autoscaling and testing.
 * @param vpcStack An instance of `OSMLVpcStack` to be used by other stacks for network configurations.
 * @param osmlRolesStack An instance of `OSMLRolesStack` to be used by other stacks for roles configurations.
 * @param containerConfig Provides configuration options for the application container.
 * @param buildFromSource Whether or not to build the model runner container from source
 */
export function deployModelRunnerExamples(
  app: App,
  targetEnv: Environment,
  targetAccount: OSMLAccount,
  vpcStack: OSMLVpcStack,
  osmlRolesStack: OSMLRolesStack | undefined,
  containerConfig: MEContainerConfig,
  buildFromSource: boolean = false
) {

  // Deploy test model container for model runner testing.
  const modelContainerStack = new MRModelContainerStack(
    app,
    `${targetAccount.name}-MRModelContainer`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      buildFromSource: buildFromSource,
      config: containerConfig,
      description:
        "Model Container, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );

  // Deploy test model endpoints to host the model container.
  const modelEndpointsStack = new MRModelEndpointsStack(
    app,
    `${targetAccount.name}-MRModelEndpoints`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      meSMRole: osmlRolesStack?.meSMRole,
      meHTTPRole: osmlRolesStack?.httpEndpointRole,
      containerUri: modelContainerStack.resources.containerUri,
      containerImage: modelContainerStack.resources.containerImage,
      description:
        "Model Endpoint, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );
  modelEndpointsStack.addDependency(vpcStack);
  modelEndpointsStack.addDependency(modelContainerStack);

  if (osmlRolesStack) {
    modelEndpointsStack.addDependency(osmlRolesStack);
  }

  // Output syncs for writing model runner results
  const syncStack = new MRSyncStack(app, `${targetAccount.name}-MRSync`, {
    env: targetEnv,
    account: targetAccount,
    description:
      "Model Runner Sync, Guidance for Overhead Imagery Inference on AWS (SO9240)"
  });

  // Testing imagery to use for validating model runner
  const imageryStack = new MRImageryStack(
    app,
    `${targetAccount.name}-MRImagery`,
    {
      env: targetEnv,
      account: targetAccount,
      vpc: vpcStack.resources.vpc,
      description:
        "Model Runner Imagery, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );
  imageryStack.addDependency(syncStack);
  imageryStack.addDependency(vpcStack);
}
