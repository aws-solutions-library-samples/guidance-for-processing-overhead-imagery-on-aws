/*
 * Copyright 2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { DIDataplane, DIDataplaneConfig, OSMLVpc } from "osml-cdk-constructs";

import { appConfig } from "../../bin/app_config";
import { OSMLVpcStack } from "./vpc";

export interface DataIntakeStackProps extends StackProps {
  readonly env: Environment;
  readonly osmlVpc: OSMLVpc;
}

export class DataIntakeStack extends Stack {
  public resources: DIDataplane;
  /**
   * Constructor for the Data Intake dataplane cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   */
  constructor(parent: App, name: string, props: DataIntakeStackProps) {
    super(parent, name, {
      terminationProtection: appConfig.account.prodLike,
      ...props
    });

    this.resources = new DIDataplane(this, "DIDataplane", {
      account: appConfig.account,
      osmlVpc: props.osmlVpc,
      config: appConfig.dataIntake?.config
        ? new DIDataplaneConfig(appConfig.dataIntake.config)
        : undefined
    });
  }
}

/**
 * Deploys all the necessary infrastructure for the data intake service.
 * This includes the base lambda container and the dataplane to support its operation.
 *
 * @param vpcStack The VPC to deploy the data intake service into.
 */
export function deployDataIntake(vpcStack: OSMLVpcStack): DataIntakeStack {
  return new DataIntakeStack(
    appConfig.app,
    `${appConfig.projectName}-DataIntake`,
    {
      env: {
        account: appConfig.account.id,
        region: appConfig.account.region
      },
      osmlVpc: vpcStack.resources,
      description:
        "OSML Data Intake, Guidance for Processing Overhead Imagery on AWS (SO9240)"
    }
  );
}
