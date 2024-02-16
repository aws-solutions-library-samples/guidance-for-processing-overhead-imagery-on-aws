#!/usr/bin/env node

/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import "source-map-support/register";

import { App, Environment } from "aws-cdk-lib";

import targetAccount from "../lib/accounts/target_account.json";
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

// Deploy the Virtual Private Cloud (VPC) resources for OversightML
const vpcStack = new OSMLVpcStack(app, `${targetAccount.name}-OSMLVpc`, {
  env: targetEnv,
  account: targetAccount,
  description: "Guidance for Overhead Imagery Inference on AWS (SO9240)"
});

// Deploy the model runner application within the initialized VPC.
if (targetAccount.deployModelRunner) {
  deployModelRuner(
    app,
    targetEnv,
    targetAccount,
    vpcStack,
    true
  );
}

// Deploy the tile server application within the same VPC.
if (targetAccount.deployTileServer) {
  deployTileServer(
    app,
    targetEnv,
    targetAccount,
    vpcStack,
    true
  );
}

// Finalize the CDK app deployment by synthesizing the CloudFormation templates.
app.synth();
