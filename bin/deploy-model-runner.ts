import { App, Environment } from "aws-cdk-lib";
import { OSMLAccount } from "osml-cdk-constructs";

import { MRAutoScalingStack } from "../lib/osml-stacks/model_runner/mr-autoscaling";
import { MRContainerStack } from "../lib/osml-stacks/model_runner/mr-container";
import { MRDataplaneStack } from "../lib/osml-stacks/model_runner/mr-dataplane";
import { MRImageryStack } from "../lib/osml-stacks/model_runner/mr-imagery";
import { MRModelContainerStack } from "../lib/osml-stacks/model_runner/mr-model-container";
import { MRModelEndpointsStack } from "../lib/osml-stacks/model_runner/mr-model-endpoints";
import { MRMonitoringStack } from "../lib/osml-stacks/model_runner/mr-monitoring";
import { MRRolesStack } from "../lib/osml-stacks/model_runner/mr-roles";
import { MRSyncStack } from "../lib/osml-stacks/model_runner/mr-sync";
import { OSMLVpcStack } from "../lib/osml-stacks/osml-vpc";

/**
 * Deploys all necessary stacks for the OversightML Model Runner application within the specified AWS CDK application.
 * This includes roles, container stacks, data planes, auto-scaling configurations, model endpoints,
 * synchronization mechanisms, and monitoring dashboards tailored to the target environment.
 *
 * @param app The CDK `App` instance where the stacks will be deployed.
 * @param targetEnv The target deployment environment, including account and region.
 * @param targetAccount Details of the target AWS account where the stacks are deployed, including configurations for autoscaling and testing.
 * @param vpcStack An instance of `OSMLVpcStack` to be used by other stacks for network configurations.
 * @param buildFromSource Whether or not to build the model runner container from source
 */
export function deployModelRuner(
  app: App,
  targetEnv: Environment,
  targetAccount: OSMLAccount,
  vpcStack: OSMLVpcStack,
  buildFromSource: boolean = false
) {
  // Deploy the required roles for the model runner application.
  const mrRoleStack = new MRRolesStack(app, `${targetAccount.name}-MRRoles`, {
    env: targetEnv,
    account: targetAccount,
    description: "Guidance for Overhead Imagery Inference on AWS (SO9240)"
  });
  vpcStack.addDependency(mrRoleStack);

  // Deploy container stack for the model runner application.
  const mrContainerStack = new MRContainerStack(
    app,
    `${targetAccount.name}-MRContainer`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      buildFromSource: buildFromSource,
      description: "Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );

  // Deploy the data plane resources for the model runner.
  const mrDataplaneStack = new MRDataplaneStack(
    app,
    `${targetAccount.name}-MRDataplane`,
    {
      env: targetEnv,
      account: targetAccount,
      description: "Guidance for Overhead Imagery Inference on AWS (SO9240)",
      taskRole: mrRoleStack.mrTaskRole.role,
      osmlVpc: vpcStack.resources,
      mrContainerImage: mrContainerStack.resources.containerImage
    }
  );
  mrDataplaneStack.addDependency(vpcStack);
  mrDataplaneStack.addDependency(mrContainerStack);

  // Deployment for auto-scaling configuration for model runner
  const mrAutoScalingStack = new MRAutoScalingStack(
    app,
    `${targetAccount.name}-MRAutoscaling`,
    {
      env: targetEnv,
      account: targetAccount,
      mrDataplane: mrDataplaneStack.resources
    }
  );
  mrAutoScalingStack.addDependency(mrDataplaneStack);

  // Deploy test model container for model runner testing.
  const modelContainerStack = new MRModelContainerStack(
    app,
    `${targetAccount.name}-MRModelContainer`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      buildFromSource: buildFromSource,
      description: "Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );

  // Deploy test model endpoints to host the model container.
  const modelEndpointsStack = new MRModelEndpointsStack(
    app,
    `${targetAccount.name}-MRModelEndpoints`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      mrSmRole: mrRoleStack.mrSmRole,
      modelContainerUri: modelContainerStack.resources.containerUri,
      modelContainerImage: modelContainerStack.resources.containerImage
    }
  );
  modelEndpointsStack.addDependency(vpcStack);
  modelEndpointsStack.addDependency(modelContainerStack);

  // Output syncs for writing model runner results
  const syncStack = new MRSyncStack(app, `${targetAccount.name}-MRSync`, {
    env: targetEnv,
    account: targetAccount
  });

  // Testing imagery to use for validating model runner
  const imageryStack = new MRImageryStack(
    app,
    `${targetAccount.name}-MRImagery`,
    {
      env: targetEnv,
      account: targetAccount,
      vpc: vpcStack.resources.vpc
    }
  );
  imageryStack.addDependency(syncStack);
  imageryStack.addDependency(vpcStack);

  // Deploy a monitoring dashboard for the model runner.
  const monitoringStack = new MRMonitoringStack(
    app,
    `${targetAccount.name}-MRMonitoring`,
    {
      env: {
        account: targetAccount.id,
        region: targetAccount.region
      },
      account: targetAccount,
      description: "Guidance for Overhead Imagery Inference on AWS (SO9240)",
      mrDataplane: mrDataplaneStack.resources,
      targetModel: "aircraft"
    }
  );
  monitoringStack.addDependency(mrDataplaneStack);
  monitoringStack.addDependency(modelEndpointsStack);
}
