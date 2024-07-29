/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import { IRole } from "aws-cdk-lib/aws-iam";
import { MRDataplane, MRDataplaneConfig, OSMLVpc } from "osml-cdk-constructs";

import { appConfig } from "../../bin/app_config";
import { OSMLRolesStack } from "./roles";
import { OSMLVpcStack } from "./vpc";

export interface ModelRunnerStackProps extends StackProps {
  readonly env: Environment;
  readonly osmlVpc: OSMLVpc;
  readonly taskRole: IRole | undefined;
}

export class ModelRunnerStack extends Stack {
  public resources: MRDataplane;

  /**
   * Constructor for the model runner dataplane cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created MRDataplaneStack object
   */
  constructor(parent: App, name: string, props: ModelRunnerStackProps) {
    super(parent, name, {
      terminationProtection: appConfig.account.prodLike,
      ...props
    });

    // Create the model runner application dataplane
    this.resources = new MRDataplane(this, "MRDataplane", {
      account: appConfig.account,
      taskRole: props.taskRole,
      osmlVpc: props.osmlVpc,
      config: appConfig.modelRunner?.config
        ? new MRDataplaneConfig(appConfig.modelRunner.config)
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
 * @param osmlRolesStack An instance of `OSMLRolesStack` to be used by other stacks for role configurations.
 */
export function deployModelRunner(
  vpcStack: OSMLVpcStack,
  osmlRolesStack: OSMLRolesStack | undefined = undefined
): ModelRunnerStack {
  // Deploy the data plane resources for the model runner.
  const mrDataplaneStack = new ModelRunnerStack(
    appConfig.app,
    `${appConfig.projectName}-ModelRunner`,
    {
      env: {
        account: appConfig.account.id,
        region: appConfig.account.region
      },
      taskRole: osmlRolesStack?.mrTaskRole.role,
      osmlVpc: vpcStack.resources,
      description:
        "OSML Model Runner, Guidance for Processing Overhead Imagery on AWS (SO9240)"
    }
  );
  mrDataplaneStack.addDependency(vpcStack);
  if (osmlRolesStack) {
    mrDataplaneStack.addDependency(osmlRolesStack);
  }

  return mrDataplaneStack;
}
