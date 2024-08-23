/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { IRole } from "aws-cdk-lib/aws-iam";
import {
  METestEndpoints,
  METestEndpointsConfig,
  OSMLVpc
} from "osml-cdk-constructs";

import { appConfig } from "../../bin/app_config";
import { OSMLVpcStack } from "./vpc";

export interface TestModelEndpointsStackProps extends StackProps {
  readonly env: Environment;
  readonly osmlVpc: OSMLVpc;
  readonly smRole?: IRole;
}

export class TestModelEndpointsStack extends Stack {
  public resources: METestEndpoints;

  /**
   * Constructor for the model runner testing cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created MRModelEndpointsStack object
   */
  constructor(parent: App, name: string, props: TestModelEndpointsStackProps) {
    super(parent, name, {
      terminationProtection: appConfig.account.prodLike,
      ...props
    });

    // Create required model runner testing endpoints
    this.resources = new METestEndpoints(this, "MREndpoints", {
      account: appConfig.account,
      osmlVpc: props.osmlVpc,
      smRole: props.smRole,
      config: appConfig.testModelEndpoints?.config
        ? new METestEndpointsConfig(appConfig.testModelEndpoints.config)
        : undefined
    });
  }
}

/**
 * Deploys all necessary stacks for the OversightML Test Model Endpoints within the specified AWS CDK application.
 * This includes roles, container stacks, data planes, auto-scaling configurations, and test model endpoints.
 *
 * @param vpcStack An instance of `OSMLVpcStack` representing the VPC configuration to be used by the test model endpoints.
 * @param smRole A role to use for provisioning the SMTestEndpoints.
 */
export function deployTestModelEndpoints(
  vpcStack: OSMLVpcStack,
  smRole: IRole | undefined = undefined
): TestModelEndpointsStack {
  // Deploy test model endpoints to host the model container.
  const modelEndpointsStack = new TestModelEndpointsStack(
    appConfig.app,
    `${appConfig.projectName}-Test-ModelEndpoints`,
    {
      env: {
        account: appConfig.account.id,
        region: appConfig.account.region
      },
      smRole: smRole,
      osmlVpc: vpcStack.resources,
      description:
        "OSML Test Model Endpoints, Guidance for Processing Overhead Imagery on AWS (SO9240)"
    }
  );
  modelEndpointsStack.addDependency(vpcStack);

  return modelEndpointsStack;
}
