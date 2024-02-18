import { App, Environment } from "aws-cdk-lib";
import { OSMLAccount } from "osml-cdk-constructs";

import { OSMLRolesStack } from "../lib/osml-stacks/osml-roles";

/**
 * Deploys the roles stack for the OversightML environment within the specified AWS CDK application.
 *
 * @param app The CDK `App` instance where the stack will be deployed.
 * @param targetEnv The target deployment environment for the stack, specifying the AWS account and region to deploy to.
 * @param targetAccount Provides additional details of the target AWS account specific to the OversightML setup.
 * @returns An instance of OSMLRolesStack, representing the deployed roles stack within the AWS CDK application.
 */
export function deployRoles(
  app: App,
  targetEnv: Environment,
  targetAccount: OSMLAccount
): OSMLRolesStack {
  return new OSMLRolesStack(app, `${targetAccount.name}-OSMLRoles`, {
    env: targetEnv,
    account: targetAccount,
    description: "Guidance for Overhead Imagery Inference on AWS (SO9240)"
  });
}
