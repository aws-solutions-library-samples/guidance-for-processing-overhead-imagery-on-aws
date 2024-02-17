#!/usr/bin/env node

/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import "source-map-support/register";

import { App, Environment } from "aws-cdk-lib";
import { Vpc } from "aws-cdk-lib/aws-ec2";

import targetAccount from "../lib/accounts/target_account.json";
import { MRRolesStack } from "../lib/osml-stacks/model_runner/mr-roles";
import { OSMLVpcStack } from "../lib/osml-stacks/osml-vpc";
import { deployModelRuner } from "./deploy-model-runner";
import { deployTileServer } from "./deploy-tile-server";

// Initialize the default CDK application.
const app = new App();

// Define the target AWS environment using account details from the configuration.
const targetEnv: Environment = {
  account: targetAccount.id,
  region: targetAccount.region
};

let vpcStack = undefined;

// Deploy the model runner application within the initialized VPC.
if (targetAccount.deployModelRunner) {
  // Deploy the required roles for the model runner application.
  const mrRoleStack = new MRRolesStack(app, `${targetAccount.name}-MRRoles`, {
    env: targetEnv,
    account: targetAccount,
    description: "Guidance for Overhead Imagery Inference on AWS (SO9240)"
  });

  // Deploy the Virtual Private Cloud (VPC) resources for OversightML
  vpcStack = createVpcStack();

  vpcStack.addDependency(mrRoleStack);

  deployModelRuner(app, targetEnv, targetAccount, vpcStack, mrRoleStack, true);
}

// Deploy the tile server application within the same VPC.
if (targetAccount.deployTileServer) {
  if (!vpcStack) {
    vpcStack = createVpcStack();
  }

  deployTileServer(app, targetEnv, targetAccount, vpcStack, true);
}

// Finalize the CDK app deployment by synthesizing the CloudFormation templates.
app.synth();

export function createVpcStack() {
  // Deploy the Virtual Private Cloud (VPC) resources for OversightML
  const vpcStack = new OSMLVpcStack(app, `${targetAccount.name}-OSMLVpc`, {
    env: targetEnv,
    account: targetAccount,
    description: "Guidance for Overhead Imagery Inference on AWS (SO9240)"
  });
  return vpcStack;
}
