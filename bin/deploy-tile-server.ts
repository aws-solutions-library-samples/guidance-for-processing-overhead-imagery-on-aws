import { App, Environment } from "aws-cdk-lib";
import { OSMLAccount } from "osml-cdk-constructs";

import { OSMLVpcStack } from "../lib/osml-stacks/osml-vpc";
import { TSContainerStack } from "../lib/osml-stacks/tile_server/ts-container";
import { TSDataplaneStack } from "../lib/osml-stacks/tile_server/ts-dataplane";

/**
 * Initializes and deploys the infrastructure required for operating a tile server.
 * This involves setting up a container for the tile server and configuring the necessary
 * data plane resources for operation. It uses AWS CDK for infrastructure as code deployment,
 * ensuring that all resources are appropriately configured and interlinked within the specified
 * AWS environment and account.
 *
 * @param app The AWS CDK App reference where the tile server stacks will be deployed.
 * @param targetEnv The targeted deployment environment containing AWS account and region information.
 * @param targetAccount The target AWS account configuration, providing context for the deployment, such as account-specific settings.
 * @param vpcStack An instance of `OSMLVpcStack` representing the VPC configuration to be used by the tile server for network-related settings.
 * @param buildFromSource Whether or not to build the model runner container from source
 */
export function deployTileServer(
  app: App,
  targetEnv: Environment,
  targetAccount: OSMLAccount,
  vpcStack: OSMLVpcStack,
  buildFromSource: boolean = false
) {
  // Deploy the container stack for the tile server, which includes the Docker container
  // configuration and other related settings required for the tile server's operation.
  const tileServerContainerStack = new TSContainerStack(
    app,
    `${targetAccount.name}-TSContainer`,
    {
      env: targetEnv,
      account: targetAccount,
      osmlVpc: vpcStack.resources,
      buildFromSource: buildFromSource,
      description:
        "Deployment configuration for the Tile Server container, Guidance for Overhead Imagery Inference on AWS (SO9240)"
    }
  );

  // Deploy the data plane stack for the tile server. This stack is responsible for the
  // deployment of resources necessary for the tile server's data handling capabilities,
  // including networking and compute resources to manage tile data efficiently.
  const tsDataplaneStack = new TSDataplaneStack(
    app,
    `${targetAccount.name}-TSDataplane`,
    {
      env: targetEnv,
      account: targetAccount,
      description:
        "Deployment configuration for the Tile Server's data plane, Guidance for Overhead Imagery Inference on AWS (SO9240)",
      osmlVpc: vpcStack.resources,
      containerImage: tileServerContainerStack.resources.containerImage
    }
  );

  // Establish a deployment dependency to ensure the tile server container stack
  // is fully deployed before initiating the deployment of the data plane stack.
  tsDataplaneStack.addDependency(tileServerContainerStack);
}
