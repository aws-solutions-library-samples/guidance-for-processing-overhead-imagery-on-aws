#!/usr/bin/env node

/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import * as path from "path"
import { App, Aspects, Environment } from "aws-cdk-lib";
import { Role } from "aws-cdk-lib/aws-iam";
import { AwsSolutionsChecks, NIST80053R5Checks } from "cdk-nag";

import targetAccount from "../lib/accounts/target_account.json";
import { deployDataIntake } from "./deploy-data-intake";
import { deployModelRuner } from "./deploy-model-runner";
import { deployModelRunnerExamples } from './deploy-model-runner-examples';
import { deployRoles } from "./deploy-roles";
import { deployTileServer } from "./deploy-tile-server";
import { deployDataCatalog } from "./deploy-data-catalog";
import { deployVpc } from "./deploy-vpc";

// Determine if the ENV instructs to globally build from source.
const buildFromSource = process.env.BUILD_FROM_SOURCE?.toLowerCase() === "true";

// Get the location of the OversightML source code repositories. This defaults
// to the "lib" directory assuming the necessary code has been checked out as
// submodules.
const locationOfCode = process.env.BUILD_FROM_SOURCE_PATH || "lib";

// Determine if we want to run CDK-Nag at Application Level
const runCDKNagOnAppLevel = process.env.RUN_CDK_NAG?.toLowerCase() === "true";

// Determine if we want to use manually created roles.
const useCustomizedRoles = process.env.USE_MANUAL_ROLES?.toLowerCase() === "true";

// Initialize the default CDK application.
const app = new App();

if (useCustomizedRoles) {
  // This will tell CDK to generate a report of the Roles and policies that it would create, without actually creating
  // them. The application developer can hand this report to the authority in charge of creating IAM Roles, wait for
  // them to come back with physical Role names, and plug those into the application by updating this statement.
  Role.customizeRoles(app)

  // This statement will cause the cdk synth command to throw an error until the customizeRoles call has been updated
  // to include the names of manually generated roles. Ex:
  // Role.customizeRoles(app, {
  //   usePrecreatedRoles: {
  //     'Construct/Path/For/Example/Role': 'externally-created-role-name',
  //   },
  // });

  // For more information see the "Using the Customize Roles feature to generate a report and supply role names"
  // section of the CDK Security and Safety Dev Guide here:
  // https://github.com/aws/aws-cdk/wiki/Security-And-Safety-Dev-Guide#using-the-customize-roles-feature-to-generate-a-report-and-supply-role-names.
}

// Define the target AWS environment using account details from the configuration.
const targetEnv: Environment = {
  account: targetAccount.id,
  region: targetAccount.region
};


// Deploy required OSML networking infrastructure.
const vpcStack = deployVpc(app, targetEnv, targetAccount);

if (targetAccount.deployModelRunner) {
  // Deploy an optional role stack to build if we are deploying model runner.
  const mrRolesStack = deployRoles(app, targetEnv, targetAccount);

  // Deploy the model runner application within the initialized VPC.
  deployModelRuner(
    app,
    targetEnv,
    targetAccount,
    vpcStack,
    mrRolesStack,
    {
      MR_DEFAULT_CONTAINER: "awsosml/osml-model-runner:latest",
      MR_CONTAINER_BUILD_PATH: path.join(locationOfCode, "osml-model-runner"),
      MR_CONTAINER_BUILD_TARGET: "model_runner",
      MR_CONTAINER_REPOSITORY: "model-runner-container"
    },
    buildFromSource
  );

  // Deploy sample models, imagery, and kinesis endpoints for use by model runner
  if (targetAccount.deployModelRunnerExamples) {
    deployModelRunnerExamples(
      app,
      targetEnv,
      targetAccount,
      vpcStack,
      mrRolesStack,
      {
        ME_DEFAULT_CONTAINER: "awsosml/osml-models:latest",
        ME_CONTAINER_BUILD_PATH: path.join(locationOfCode, "osml-models"),
        ME_CONTAINER_BUILD_TARGET: "osml_model",
        ME_CONTAINER_REPOSITORY: "model-container"
      },
      buildFromSource
    );
  }
}

// Deploy the tile server application within the same VPC.
if (targetAccount.deployTileServer) {
  deployTileServer(
    app,
    targetEnv,
    targetAccount,
    vpcStack,
    {
      TS_CONTAINER: "awsosml/osml-tile-server:latest",
      TS_BUILD_PATH: path.join(locationOfCode, "osml-tile-server"),
      TS_BUILD_TARGET: "osml_tile_server",
      TS_REPOSITORY: "tile-server-container"
    },
    {
      TS_TEST_CONTAINER: "awsosml/osml-tile-server-test:latest",
      TS_TEST_BUILD_PATH: path.join(locationOfCode, "osml-tile-server-test"),
      TS_TEST_BUILD_TARGET: "osml_tile_server_test",
      TS_TEST_REPOSITORY: "tile-server-test-container"
    },
    path.join(locationOfCode, "osml-tile-server/src/aws/osml/tile_server/lambda"),
    buildFromSource
  );
}

// Deploy the image intake application within the same VPC.
if (targetAccount.deployDataIntake) {
  deployDataIntake(
    app,
    targetEnv,
    targetAccount,
    vpcStack,
    {
      DI_CONTAINER: "awsosml/osml-data-intake:latest",
      DI_BUILD_PATH: path.join(locationOfCode, "osml-data-intake"),
      DI_BUILD_TARGET: "osml_data_intake",
      DI_REPOSITORY: "data-intake-container"
    },
    buildFromSource
  );
}

// Deploy Stac Catalog within the same VPC
if (targetAccount.deployDataCatalog) {
  deployDataCatalog(
    app,
    targetEnv,
    targetAccount,
    vpcStack,
    {
      DC_CONTAINER: "awsosml/osml-data-catalog:latest",
      DC_BUILD_PATH: path.join(locationOfCode, "osml-cdk-constructs/lib/osml/data_catalog"),
      DC_BUILD_TARGET: "osml_data_catalog",
      DC_REPOSITORY: "data-catalog-container"
    });
}

// Comply CDK constructs with AWS Recommended Security & NIST Security
if (runCDKNagOnAppLevel && targetAccount.prodLike) {
  Aspects.of(app).add(new AwsSolutionsChecks());
  Aspects.of(app).add(new NIST80053R5Checks());
}

// Finalize the CDK app deployment by synthesizing the CloudFormation templates.
app.synth();
