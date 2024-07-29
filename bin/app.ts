#!/usr/bin/env node

/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks, NIST80053R5Checks } from "cdk-nag";

import { deployCustomModelEndpoint } from "../lib/osml-stacks/custom_model_endpoint";
import { deployDataCatalog } from "../lib/osml-stacks/data_catalog";
import { deployDataIntake } from "../lib/osml-stacks/data_intake";
import { deployModelRunner } from "../lib/osml-stacks/model_runner";
import { deployRoles } from "../lib/osml-stacks/roles";
import { deployTestImagery } from "../lib/osml-stacks/test_imagery";
import { deployTestModelEndpoints } from "../lib/osml-stacks/test_model_endpoints";
import { deployTileServer } from "../lib/osml-stacks/tile_server";
import { deployVpc } from "../lib/osml-stacks/vpc";
import { appConfig } from "./app_config";

let osmlRolesStack = undefined;
let diDataplaneStack = undefined;

// Deploy an optional role stack
if (appConfig.modelRunner?.deploy) {
  osmlRolesStack = deployRoles();
}

// Deploy required OSML networking infrastructure.
const vpcStack = deployVpc(osmlRolesStack);

// Deploy the model runner component
if (appConfig.modelRunner?.deploy) {
  deployModelRunner(vpcStack, osmlRolesStack);
}

// Deploy the tile server component
if (appConfig.tileServer?.deploy) {
  deployTileServer(vpcStack);
}

// Deploy the data intake component.
if (appConfig.dataIntake?.deploy) {
  diDataplaneStack = deployDataIntake(vpcStack);
}

// Deploy the STAC component
if (appConfig.dataCatalog?.deploy) {
  deployDataCatalog(vpcStack, diDataplaneStack?.resources.stacTopic);
}

// Deploy test model endpoints
if (appConfig.testModelEndpoints?.deploy) {
  deployTestModelEndpoints(vpcStack, osmlRolesStack);
}

// Deploy test imagery
if (appConfig.testImagery?.deploy) {
  deployTestImagery(vpcStack);
}

// Deploy custom model endpoint
if (appConfig.customModelEndpoints?.deploy) {
  deployCustomModelEndpoint(vpcStack);
}

// Comply CDK constructs with AWS Recommended Security & NIST Security
if (appConfig.runCdkNag) {
  Aspects.of(appConfig.app).add(new AwsSolutionsChecks());
  Aspects.of(appConfig.app).add(new NIST80053R5Checks());
}

// Finalize the CDK app deployment by synthesizing the CloudFormation templates.
appConfig.app.synth();
