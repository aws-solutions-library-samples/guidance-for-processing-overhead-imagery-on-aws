/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import {
  MEHTTPRole,
  MESMRole,
  METestEndpoints,
  METestEndpointsConfig,
  OSMLVpc
} from "osml-cdk-constructs";

import { appConfig } from "../../bin/app_config";
import { OSMLRolesStack } from "./roles";
import { OSMLVpcStack } from "./vpc";

export interface TestModelEndpointsStackProps extends StackProps {
  readonly env: Environment;
  readonly osmlVpc: OSMLVpc;
  readonly meSMRole?: MESMRole;
  readonly meHTTPRole?: MEHTTPRole;
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
      smRole: props.meSMRole?.role,
      httpEndpointRole: props.meHTTPRole?.role,
      config: appConfig.testModelEndpoints?.config
        ? new METestEndpointsConfig(appConfig.testModelEndpoints.config)
        : undefined
    });
  }
}

/**
 * Deploys all necessary stacks for the OversightML Model Runner application within the specified AWS CDK application.
 * This includes roles, container stacks, data planes, auto-scaling configurations, model endpoints,
 * output sinks, and monitoring dashboards tailored to the target environment.
 *
 * @param vpcStack An instance of `OSMLVpcStack` representing the VPC configuration to be used by model runner.
 * @param osmlRolesStack An instance of `OSMLRolesStack` to be used by other stacks for role configurations.
 */
export function deployTestModelEndpoints(
  vpcStack: OSMLVpcStack,
  osmlRolesStack: OSMLRolesStack | undefined = undefined
) {
  // Deploy test model endpoints to host the model container.
  const modelEndpointsStack = new TestModelEndpointsStack(
    appConfig.app,
    `${appConfig.projectName}-Test-ModelEndpoints`,
    {
      env: {
        account: appConfig.account.id,
        region: appConfig.account.region
      },
      osmlVpc: vpcStack.resources,
      meSMRole: osmlRolesStack?.meSMRole,
      meHTTPRole: osmlRolesStack?.httpEndpointRole,
      description:
        "Model Endpoint, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );
  modelEndpointsStack.addDependency(vpcStack);

  if (osmlRolesStack) {
    modelEndpointsStack.addDependency(osmlRolesStack);
  }
}
