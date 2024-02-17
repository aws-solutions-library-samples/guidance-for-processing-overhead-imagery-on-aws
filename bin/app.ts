#!/usr/bin/env node

/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import "source-map-support/register";

import { App, Environment } from "aws-cdk-lib";

import targetAccount from "../lib/accounts/target_account.json";
import { deployModelRuner } from "./deploy-model-runner";
import { deployRoles } from "./deploy-roles";
import { deployTileServer } from "./deploy-tile-server";
import { deployVpc } from "./deploy-vpc";

// Initialize the default CDK application.
const app = new App();

// Define the target AWS environment using account details from the configuration.
const targetEnv: Environment = {
  account: targetAccount.id,
  region: targetAccount.region
};

// Deploy an optional role sstack to build if we are deploying model runner.
let osmlRolesStack = undefined;
if (targetAccount.deployModelRunner) {
  osmlRolesStack = deployRoles(app, targetEnv, targetAccount);
}

// Deploy required OSML networking infrastructure.
const vpcStack = deployVpc(app, targetEnv, targetAccount, osmlRolesStack);

// Deploy the model runner application within the initialized VPC.
if (targetAccount.deployModelRunner) {
  deployModelRuner(app, targetEnv, targetAccount, vpcStack, osmlRolesStack);
}

// Deploy the tile server application within the same VPC.
if (targetAccount.deployTileServer) {
  deployTileServer(app, targetEnv, targetAccount, vpcStack);
}

// Finalize the CDK app deployment by synthesizing the CloudFormation templates.
app.synth();
