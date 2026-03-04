#!/usr/bin/env node
/** Copyright 2023-2026 Amazon.com, Inc. or its affiliates. */

import "source-map-support/register";

import { App } from "aws-cdk-lib";

import { OSMLNetworkStack } from "../lib/network-stack";
import { loadDeploymentConfig } from "./deployment/load-deployment";

const deployment = loadDeploymentConfig();

console.log(
  `Using environment from deployment.json: projectName=${deployment.projectName}, region=${deployment.account.region}`
);

const app = new App();

// Create the OSML Network stack using projectName for stack name
new OSMLNetworkStack(app, deployment.projectName, {
  deployment: deployment,
  env: {
    account: deployment.account.id,
    region: deployment.account.region
  },
  description: "OSML VPC, Network infrastructure for OversightML (SO9240)"
});

app.synth();
