/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { OSMLTestImagery, OSMLTestImageryConfig } from "osml-cdk-constructs";

import { appConfig } from "../../bin/app_config";
import { OSMLVpcStack } from "./vpc";

export interface OSMLTestImageryStackProps extends StackProps {
  env: Environment;
  vpc: IVpc;
}

export class OSMLTestImageryStack extends Stack {
  public resources: OSMLTestImagery;

  /**
   * Constructor for the model runner test imagery deployment cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created MRImageryStack object
   */
  constructor(parent: App, name: string, props: OSMLTestImageryStackProps) {
    super(parent, name, {
      terminationProtection: appConfig.account.prodLike,
      ...props
    });

    // Create required model runner testing resources
    this.resources = new OSMLTestImagery(this, "OSMLTestImagery", {
      account: appConfig.account,
      vpc: props.vpc,
      config: appConfig.testImagery?.config
        ? new OSMLTestImageryConfig(appConfig.testImagery.config)
        : undefined
    });
  }
}

/**
 * Deploys all necessary stacks for the OversightML Model Runner application within the specified AWS CDK application.
 * This includes roles, container stacks, data planes, auto-scaling configurations, model endpoints,
 * synchronization mechanisms, and monitoring dashboards tailored to the target environment.
 *
 * @param vpcStack An instance of `OSMLVpcStack` representing the VPC configuration to be used by model runner.
 */
export function deployTestImagery(
  vpcStack: OSMLVpcStack
): OSMLTestImageryStack {
  // Testing imagery to use for validating model runner
  const imageryStack = new OSMLTestImageryStack(
    appConfig.app,
    `${appConfig.projectName}-Test-Imagery`,
    {
      env: {
        account: appConfig.account.id,
        region: appConfig.account.region
      },
      vpc: vpcStack.resources.vpc,
      description:
        "OSML Test Imagery, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );
  imageryStack.addDependency(vpcStack);

  return imageryStack;
}
