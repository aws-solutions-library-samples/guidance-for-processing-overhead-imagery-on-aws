#!/usr/bin/env node

/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Aspects, Environment } from "aws-cdk-lib";
import { AwsSolutionsChecks, NIST80053R5Checks } from "cdk-nag";

import targetAccount from "../lib/accounts/target_account.json";
import { deployDataIntake } from "./deploy-data-intake";
import { deployModelRuner } from "./deploy-model-runner";
import { deployRoles } from "./deploy-roles";
import { deployTileServer } from "./deploy-tile-server";
import { deployDataCatalog } from "./deploy-data-catalog";
import { deployVpc } from "./deploy-vpc";

// Determine if the ENV instructs to globally build from source.
const buildFromSource = process.env.BUILD_FROM_SOURCE?.toLowerCase() === "true";

// Determine if we want to run CDK-Nag at Application Level
const runCDKNagOnAppLevel = process.env.RUN_CDK_NAG?.toLowerCase() === "true";

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
  deployModelRuner(
    app,
    targetEnv,
    targetAccount,
    vpcStack,
    osmlRolesStack,
    buildFromSource
  );
}

// Deploy the tile server application within the same VPC.
if (targetAccount.deployTileServer) {
  deployTileServer(app, targetEnv, targetAccount, vpcStack, buildFromSource);
}

// Deploy the image intake application within the same VPC.
if (targetAccount.deployDataIntake) {
  deployDataIntake(app, targetEnv, targetAccount, vpcStack, buildFromSource);
}

// Deploy Stac Catalog within the same VPC
if (targetAccount.deployDataCatalog) {
  deployDataCatalog(app, targetEnv, targetAccount, vpcStack);
}

// Comply CDK constructs with AWS Recommended Security & NIST Security
if (runCDKNagOnAppLevel && targetAccount.prodLike) {
  Aspects.of(app).add(new AwsSolutionsChecks());
  Aspects.of(app).add(new NIST80053R5Checks());
}

// Finalize the CDK app deployment by synthesizing the CloudFormation templates.
app.synth();
