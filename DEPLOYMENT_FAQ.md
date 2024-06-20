## Deployment Frequently Asked Questions (FAQ)

**Q: How can I deploy into an existing VPC?**  
To deploy any of the applications into an existing VPC you need to update the 
target_account.json file to include the ID of the VPC you want to reuse. This ID can be
found on the AWS console by looking at VPC Dashboard -> Your VPCs and then using the `VPC ID`
field from the appropriate VPC. Once that ID is known it can be added to the 
configuration file as shown below. Note that these updates must be made before you synthesize 
the CDK resources in preparation for deployment. (i.e. before cdk synth or npm run synth is run)

**_Example: lib/accounts/target_account.json referencing a preexisting VPC ID_**
```json
{
  "id": "1234567890123",
  "name": "OSML",
  "region": "us-west-2",
  "prodLike": false,
  "vpcId": "vpc-0000000000000000",
  ...
}
```

**Q: How can I apply a permissions boundary?**
Assuming a Permissions Boundary was created with the name cdk-permissions-boundary, bootstrap the environment 
specifying the --custom-permissions-boundary flag to attach the permissions boundary to the CFN Execution Role.
```shell
cdk bootstrap --custom-permissions-boundary cdk-permissions-boundary
```
Once the permissions boundary has been created and enforced, CDK applications will not be able to create any IAM Roles
or Users unless the permissions boundary is attached to the Role or User being created. To satisfy this condition we
can tell CDK to apply the permissions boundary to the entire application.  

**_Example: cdk.json updated to apply permissions boundary globally._**
```json
{
  "context": {
     "@aws-cdk/core:permissionsBoundary": {
       "name": "cdk-permissions-boundary"
     }
  }
}
```
For additional details see [CDK Security and Safety Dev Guide: Permissions Boundaries and SCPs](https://github.com/aws/aws-cdk/wiki/Security-And-Safety-Dev-Guide#permissions-boundaries-and-scps).

**Q: How can I deploy just the ModelRunner / TileServer / etc. application?**  
To deploy a single application you need to edit the target_account.json file to enable the deployment
options for the applications you want to deploy, resynthesize the CDK stacks, and then run the deployment. 
Note that some applications have optional test / demonstration components that can be used to validate that
your installation was successful.

**_Example: lib/accounts/target_account.json showing deployment of ModelRunner and examples._**
```json
{
  "id": "1234567890123",
  "name": "OSML",
  "region": "us-west-2",
  "prodLike": false,
  "deployModelRunner": true,
  "deployModelRunnerExamples": true,
  "deployTileServer": false,
  "deployDataIntake": false,
  "deployDataCatalog": false
}
```
**_Example: shell commands to deploy after updates to target_account.json_**
```shell
npm run synth
npm run deploy
```

**Q: How can I deploy with pre-built Docker containers that are in my local docker registry?**  
If the `BUILD_FROM_SOURCE` environment variable is set to `false` the CDK will attempt to deploy the pre-built
containers with tags matching the values of the various `*_DEFAULT_CONTAINER` options found in `bin/app.ts`. By 
default, the CDK constructs will pull the latest images released by the [awsosml user on DockerHub](https://hub.docker.com/u/awsosml).
By editing the `bin/app.ts` you can change those tags to reference the pre-build containers in your local registry.

**_Example: bin/app.ts updated to use a locally patched version of the ModelRunner container._**
```typescript
deployModelRuner(
  app,
  targetEnv,
  targetAccount,
  vpcStack,
  mrRolesStack,
  {
    MR_DEFAULT_CONTAINER: "local-osml-model-runner:20240101T000000",
    MR_CONTAINER_BUILD_PATH: path.join(locationOfCode, "osml-model-runner"),
    MR_CONTAINER_BUILD_TARGET: "model_runner",
    MR_CONTAINER_REPOSITORY: "model-runner-container"
  },
  buildFromSource
);
```

**_Example: shell commands to deploy after updating app.ts to point at new default container_**
```shell
export BUILD_FROM_SOURCE=false
npm run synth
npm run deploy
```