#!/usr/bin/env node

/*
 * Copyright 2023 Amazon.com, Inc. or its affiliates.
 */

import "source-map-support/register";

import { App } from "aws-cdk-lib";

import targetAccount from "../lib/accounts/target_account.json";
import { MRDataplaneStack } from "../lib/osml-stacks/model_runner/dataplane";
import {MRRolesStack} from "../lib/osml-stacks/model_runner/roles";

// set up the default CDK app
const app = new App();

// deploy model runner's data plane resources
const mrRolesStack = new MRRolesStack(app, `${targetAccount.name}-Roles`, {
  env: {
    account: targetAccount.id,
    region: targetAccount.region
  },
  account: targetAccount,
  description : "Roles for OSML"
});

// deploy model runner's data plane resources
new MRDataplaneStack(app, `${targetAccount.name}-Dataplane`, {
  env: {
    account: targetAccount.id,
    region: targetAccount.region
  },
  account: targetAccount,
  description : "Guidance for Overhead Imagery Inference on AWS (SO9240)",
  mrSmRole: mrRolesStack.mrSmRole,
  mrTaskRole: mrRolesStack.mrTaskRole
});

// build the cdk app deployment
app.synth();
