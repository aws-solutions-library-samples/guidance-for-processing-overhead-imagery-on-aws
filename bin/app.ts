#!/usr/bin/env node

/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import "source-map-support/register";

import { App } from "aws-cdk-lib";

import targetAccount from "../lib/accounts/target_account.json";
import { MRAppContainerStack } from "../lib/osml-stacks/model_runner/mr-app-container";
import { MRAutoScalingStack } from "../lib/osml-stacks/model_runner/mr-autoscaling";
import { MRDataplaneStack } from "../lib/osml-stacks/model_runner/mr-dataplane";
import { MRImageryStack } from "../lib/osml-stacks/model_runner/mr-imagery";
import { MRModelContainerStack } from "../lib/osml-stacks/model_runner/mr-model-container";
import { MRModelEndpointsStack } from "../lib/osml-stacks/model_runner/mr-model-endpoints";
import { MRMonitoringStack } from "../lib/osml-stacks/model_runner/mr-monitoring";
import { MRRolesStack } from "../lib/osml-stacks/model_runner/mr-roles";
import { MRSyncStack } from "../lib/osml-stacks/model_runner/mr-sync";
import { MRVpcStack } from "../lib/osml-stacks/model_runner/mr-vpc";

// set up the default CDK app
const app = new App();

const targetEnv = {
  account: targetAccount.id,
  region: targetAccount.region
};

// deploy model runner's vpc resources
const vpcStack = new MRVpcStack(app, `${targetAccount.name}-MRVpc`, {
  env: targetEnv,
  account: targetAccount,
  description: "Guidance for Overhead Imagery Inference on AWS (SO9240)"
});

// deploy the required roles for model runner
const rolesStack = new MRRolesStack(app, `${targetAccount.name}-MRRoles`, {
  env: targetEnv,
  account: targetAccount,
  description: "Guidance for Overhead Imagery Inference on AWS (SO9240)"
});

// deploy the required roles for model runner
const mrAppContainerStack = new MRAppContainerStack(
  app,
  `${targetAccount.name}-MRAppContainer`,
  {
    env: targetEnv,
    account: targetAccount,
    osmlVpc: vpcStack.resources,
    description: "Guidance for Overhead Imagery Inference on AWS (SO9240)"
  }
);

// deploy model runner's data plane resources
const dataplaneStack = new MRDataplaneStack(
  app,
  `${targetAccount.name}-MRDataplane`,
  {
    env: targetEnv,
    account: targetAccount,
    description: "Guidance for Overhead Imagery Inference on AWS (SO9240)",
    taskRole: rolesStack.mrTaskRole.role,
    osmlVpc: vpcStack.resources,
    mrContainerImage: mrAppContainerStack.resources.containerImage
  }
);
dataplaneStack.addDependency(mrAppContainerStack);
dataplaneStack.addDependency(rolesStack);
dataplaneStack.addDependency(vpcStack);

if (targetAccount.enableAutoscaling) {
  // deploy autoscaling for the model runner service
  const autoscalingStack = new MRAutoScalingStack(
    app,
    `${targetAccount.name}-MRAutoscaling`,
    {
      env: targetEnv,
      account: targetAccount,
      mrDataplane: dataplaneStack.resources
    }
  );
  autoscalingStack.addDependency(dataplaneStack);
}

if (targetAccount.enableTesting) {
  // deploy the required roles for model runner
  const modelContainerStack = new MRModelContainerStack(
    app,
    `${targetAccount.name}-MRModelContainer`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      description: "Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );

  // deploy model endpoints for model runner
  const modelEndpointsStack = new MRModelEndpointsStack(
    app,
    `${targetAccount.name}-MRModelEndpoints`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      mrSmRole: rolesStack.mrSmRole,
      modelContainerUri: modelContainerStack.resources.containerUri,
      modelContainerImage: modelContainerStack.resources.containerImage
    }
  );
  modelEndpointsStack.addDependency(modelContainerStack);
  modelEndpointsStack.addDependency(vpcStack);
  modelEndpointsStack.addDependency(rolesStack);

  // deploy output syncs for model runner
  const syncStack = new MRSyncStack(app, `${targetAccount.name}-MRSync`, {
    env: targetEnv,
    account: targetAccount
  });

  // deploy test imagery for model runner
  const imageryStack = new MRImageryStack(
    app,
    `${targetAccount.name}-MRImagery`,
    {
      env: targetEnv,
      account: targetAccount,
      vpc: vpcStack.resources.vpc
    }
  );
  imageryStack.addDependency(vpcStack);
}

if (targetAccount.enableMonitoring) {
  // deploy a monitoring dashboard model runner
  // updates your target model accordingly if you
  // wish to monitor it with this dashboard
  const monitoringStack = new MRMonitoringStack(
    app,
    `${targetAccount.name}-MRMonitoring`,
    {
      env: {
        account: targetAccount.id,
        region: targetAccount.region
      },
      account: targetAccount,
      description: "Guidance for Overhead Imagery Inference on AWS (SO9240)",
      mrDataplane: dataplaneStack.resources,
      targetModel: "aircraft"
    }
  );
  monitoringStack.addDependency(dataplaneStack);
}

// build the cdk app deployment
app.synth();
