/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Environment, Stack, StackProps } from "aws-cdk-lib";
import {
  MEHTTPRole,
  MESMEndpoint,
  MESMEndpointConfig,
  MESMRole,
  METestEndpoints,
  OSMLContainer,
  OSMLContainerConfig,
  OSMLVpc
} from "osml-cdk-constructs";

import { appConfig } from "../../bin/app_config";
import { OSMLRolesStack } from "./roles";
import { OSMLVpcStack } from "./vpc";

export interface CustomModelEndpointStackProps extends StackProps {
  readonly env: Environment;
  readonly osmlVpc: OSMLVpc;
  readonly meSMRole?: MESMRole;
  readonly meHTTPRole?: MEHTTPRole;
}

export class CustomModelEndpointStack extends Stack {
  public resources: METestEndpoints;

  /**
   * Constructor for the model runner testing cdk stack
   * @param parent the parent cdk app object
   * @param name the name of the stack to be created in the parent app object.
   * @param props the properties required to create the stack.
   * @returns the created MRModelEndpointsStack object
   */
  constructor(parent: App, name: string, props: CustomModelEndpointStackProps) {
    super(parent, name, {
      terminationProtection: appConfig.account.prodLike,
      ...props
    });

    // Create a new role
    const role = new MESMRole(this, "CustomSMEndpointRole", {
      account: appConfig.account,
      roleName: "CustomSMEndpointRole"
    }).role;

    // Build the custom model container to use for the SageMaker endpoint
    const modelContainer = new OSMLContainer(
      this,
      "OSMLCustomSMEndpointContainer",
      {
        account: appConfig.account,
        osmlVpc: props.osmlVpc,
        buildFromSource: appConfig.customModelEndpoints.buildFromSource,
        config: new OSMLContainerConfig(
          appConfig.customModelEndpoints.containerConfig
        )
      }
    );

    // Build a SageMaker endpoint to host the custom model
    new MESMEndpoint(this, "OSMLCustomModelEndpoint", {
      ecrContainerUri: modelContainer.containerUri,
      modelName: appConfig.customModelEndpoints.modelName,
      roleArn: role.roleArn,
      instanceType: appConfig.customModelEndpoints.instance_type,
      subnetIds: props.osmlVpc.selectedSubnets.subnetIds,
      config: new MESMEndpointConfig(
        appConfig.customModelEndpoints.endpointConfig
      )
    });
  }
}

/**
 * Deploys all necessary stacks for a customer to deploy a custom model onto a SageMaker endpoint.
 *
 * @param vpcStack An instance of `OSMLVpcStack` representing the VPC configuration to be used by model runner.
 * @param osmlRolesStack An instance of `OSMLRolesStack` to be used by other stacks for role configurations.
 */
export function deployCustomModelEndpoint(
  vpcStack: OSMLVpcStack,
  osmlRolesStack: OSMLRolesStack | undefined = undefined
) {
  // Deploy test model endpoints to host the model container.
  const customModelEndpointsStack = new CustomModelEndpointStack(
    appConfig.app,
    `${appConfig.projectName}-Custom-ModelEndpoint`,
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
  customModelEndpointsStack.addDependency(vpcStack);

  if (osmlRolesStack) {
    customModelEndpointsStack.addDependency(osmlRolesStack);
  }
}
