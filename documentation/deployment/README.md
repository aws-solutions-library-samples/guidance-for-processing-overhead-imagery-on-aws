# Guide to Deploying OSML

This guide provides step-by-step instructions to:
1. Provision the required IAM role using the provided CloudFormation template.
2. Provision a SageMaker Notebook Instance with the created Role. 
3. Bootstrap the notebook instance with required dependencies.
4. Configure and deploy OSML into your account.

---

## 1: Provision the SageMaker Role

### Option 1: Using the AWS Management Console
1. **Upload the CloudFormation Template**:
    - Navigate to the AWS Management Console.
    - Go to **CloudFormation** (Search for "CloudFormation" in the AWS Services search bar).

2. **Create a New Stack**:
    - Click **Create stack** and select **Upload a template file**.
    - Upload the `OSMLOpsRole-template.yaml` file.
    - Click **Next**.

3. **Configure Stack Details**:
    - **Stack Name**: Enter a unique name for the stack (e.g., `OSMLOpsRoleStack`).
    - **Parameters**: No additional parameters are required for this template.

4. **Review and Create**:
    - Review the stack configuration.
    - Acknowledge the capabilities to create IAM resources.
    - Click **Create stack**.

5. **Wait for the Stack to Complete**:
    - Wait for the stack status to change to `CREATE_COMPLETE`.
    - Note the **RoleArn** from the stack’s outputs. This will be the ARN of the provisioned role.

---

### Option 2: Using the AWS CLI

1. **Ensure AWS CLI is Installed and Configured**:
    - Install the AWS CLI if it's not already installed ([Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html)).
    - Verify your credentials and default region are configured:
      ```bash
      aws configure
      ```

2. **Validate the CloudFormation Template**:
    - Before creating the stack, validate the template to ensure there are no syntax errors:
      ```bash
      aws cloudformation validate-template --template-body file://OSMLOpsRole-template.yaml
      ```

3. **Create the CloudFormation Stack**:
    - Run the following command to create the stack:
      ```bash
      aws cloudformation create-stack \
        --stack-name OSMLOpsRoleStack \
        --template-body file://OSMLOpsRole-template.yaml \
        --capabilities CAPABILITY_NAMED_IAM
      ```

4. **Monitor the Stack Creation**:
    - Use the following command to track the stack's status:
      ```bash
      aws cloudformation describe-stacks --stack-name OSMLOpsRoleStack
      ```

5. **Retrieve the Role ARN**:
    - Once the stack status is `CREATE_COMPLETE`, retrieve the role ARN with:
      ```bash
      aws cloudformation describe-stacks \
        --stack-name OSMLOpsRoleStack \
        --query "Stacks[0].Outputs[?OutputKey=='RoleArn'].OutputValue" \
        --output text
      ```

---

### Notes
- Both methods achieve the same outcome. Use the AWS CLI for automation or scripting and the AWS Management Console for a more guided experience.
- Ensure you have sufficient IAM permissions to create resources via CloudFormation (e.g., `iam:CreateRole`, `cloudformation:CreateStack`).
- For additional details on AWS CLI commands, refer to the [AWS CLI Command Reference](https://docs.aws.amazon.com/cli/latest/reference/).

---

## 2: Provision the SageMaker Notebook Instance

### Steps

1. **Log in to the AWS Management Console**:
    - Navigate to [AWS SageMaker](https://console.aws.amazon.com/sagemaker/).

2. **Open the Notebook Instances Page**:
    - From the SageMaker dashboard, select **Notebook instances** in the left-hand menu.

3. **Create a New Notebook Instance**:
    - Click the **Create notebook instance** button at the top of the page.

4. **Configure the Notebook Instance**:
    - **Notebook instance name**: Enter a unique name (e.g., `osml-notebook`).
    - **Instance type**: Choose an instance type based on your workload (e.g., `ml.t3.medium` for lightweight tasks or `ml.p3.2xlarge` for GPU-based tasks).
    - **IAM role**:
        - Select the role provisioned using the CloudFormation stack (e.g., `OSMLOpsRole`).
    - **Volume size**: Set the storage size (default: 5 GB or more, based on your requirements).

5. **Review and Create**:
    - Click **Create notebook instance**.
    - Wait for the instance status to transition to **InService**.

---

## 3: Bootstrap the Notebook Instance

### Steps

1. **Clone the Repository**:
    - Open a terminal in the SageMaker Notebook instance and clone the repository containing the bootstrap script:
      ```bash
      git clone https://github.com/your-org/guidance-for-processing-overhead-imagery-on-aws.git
      cd guidance-for-processing-overhead-imagery-on-aws
      ```

2. **Run the Bootstrap Script**:
    - Execute the `sm_bootstrap_conda.sh` script to set up the environment:
      ```bash
      npm run sm:boostrap
      ```

3. **Verify the Setup**:
    - After the script finishes, verify the environment setup:
      ```bash
      conda list
      git lfs --version
      cdk --version
      ```

---

## 4. Configuring and Deploying OSML
This guide will help you configure various components of your AWS CDK application using the `cdk.context.json` file.
By following these steps, you can customize the settings for your deployment without making any code updates.
We will use the VPC as a use case example and also demonstrate the Model Runner Dataplane deployment. For a full list
of configuration parameters available for various OSML constructs please refer to the published documentation such as the 
[MRDataplaneConfig](https://aws-solutions-library-samples.github.io/osml-cdk-constructs/classes/MRDataplaneConfig.html).

### Define Configurations in `cdk.context.json`

The `cdk.context.json` file allows you to specify configuration parameters for various components of your application.
Below is an example configuration where we demonstrate renaming the model runner cluster, specifying a custom role to 
import for the model runner ECS task role, specifying a VPC to import, and which subnets to target for deploying into:

```json
{
  "projectName": "OSML",
  "account": {
    "id": "123456789012",
    "region": "us-west-2",
    "prodLike": false
  },
  "modelRunner": {
    "deploy": true,
    "config": {
      "ECS_TASK_ROLE_NAME": "CUSTOM_TASK_ROLE_NAME",
      "MR_CLUSTER_NAME": "TEST_CLUSTER_NAME",
      "BUILD_FROM_SOURCE": true
    }
  },
  "vpc": {
    "config": {
      "VPC_ID": "vpc-12345678",
      "TARGET_SUBNETS": [
        "subnet-12345678",
        "subnet-87654321"
      ]
    }
  }
}
```

#### Configuration Parameters

- `projectName`: The name of the project - this will be used to tag stack names.
- `account`: AWS account configuration.
    - `id`: The target AWS account ID.
    - `region`: The target AWS region.
    - `prodLike`: Whether the environment is production-like - this will effect things like resource retention.
    - `isADC`: Whether the environment is in a special region or not
- `modelRunner`,`tileServer`, `dataIntake`, `dataCatalog`, `vpc`: Component level specifications.
    - `deploy`: Whether to deploy the component.
    - `buildFromSource`: Whether to build the component from source.
    - `config`: Each component has a configuration class that be used to customize its CDK resources.

### Understanding the Configuration Parser

The `ConfigParser` class reads the configuration from the `cdk.context.json` file and makes it available for use in 
your CDK stacks. Ensure your `config-parser.ts` includes the necessary structure to read these configurations.
You do not need to implement this as a customer but a breakdown of how it works is provided her for your understanding;
incase further customization is required.

#### Example `config-parser.ts`

```typescript
import { App } from "aws-cdk-lib";
import { OSMLAccount, OSMLVpcConfig } from "osml-cdk-constructs";

interface ComponentConfig {
  deploy: boolean;
}

export class AppConfig {
  app: App;
  projectName: string;
  account: OSMLAccount;
  vpc: OSMLVpcConfig
  modelRunner: ComponentConfig;
  tileServer: ComponentConfig;
  dataIntake: ComponentConfig;
  dataCatalog: ComponentConfig;
  auth: ComponentConfig;
  runCdkNag: boolean;

  constructor(app: App) {
    this.app = app;
    this.projectName = app.node.getContext("projectName") as string;
    this.account = app.node.getContext("account") as OSMLAccount;
    this.vpc = app.node.getContext("vpc") as OSMLVpcConfig
    this.modelRunner = app.node.getContext("modelRunner") as ComponentConfig;
    this.tileServer = app.node.getContext("tileServer") as ComponentConfig;
    this.dataIntake = app.node.getContext("dataIntake") as ComponentConfig;
    this.dataCatalog = app.node.getContext("dataCatalog") as ComponentConfig;
    this.auth = app.node.tryGetContext("auth") as ComponentConfig;
    this.runCdkNag = process.env.RUN_CDK_NAG?.toLowerCase() === "true";
  }
}

// Initialize the default CDK application and configure it
export const appConfig = new AppConfig(new App());
```

### Using the Configuration in Your CDK Stacks

You can now use the `ConfigParser` to configure your VPC and other components based on the settings provided in the `cdk.context.json` file. Here is an example of how to use it in a CDK stack.

#### Example VPC Stack

```typescript
import { App, Stack, StackProps } from 'aws-cdk-lib';
import { OSMLVpc } from 'osml-cdk-constructs';
import { ConfigParser } from './config-parser';

export interface VpcStackProps extends StackProps {
  readonly config: ConfigParser;
}

export class MyVpcStack extends Stack {
  constructor(scope: App, id: string, props: VpcStackProps) {
    super(scope, id, props);

    new OSMLVpc(this, 'MyVPC', {
      account: props.config.account,
      config: props.config.vpcConfig
    });
  }
}
```

### Custom Model Deployment Configuration Instructions

Follow the steps below to configure and deploy your custom model using the provided configuration classes and AWS CDK constructs.

#### Update the `cdk.context.json` File

Your `cdk.context.json` file contains the configuration details required for deploying your custom model. 
You need to update this file with your specific configuration values. When configuring your custom model deployment, 
you have the flexibility to either provide a URI for an existing container image or specify a build path to construct 
the container from source. If you choose to supply a CONTAINER_URI, the deployment process will import the container
directly from the specified URI, streamlining the setup by utilizing a pre-built image. Alternatively, if you opt to 
build the container from source, you need to specify the CONTAINER_BUILD_PATH and optionally the CONTAINER_BUILD_TARGET. 
This approach allows you to define a custom build process using a Dockerfile located at the build path, giving you the 
ability to customize the container environment precisely to your requirements before deployment. This dual-option 
configuration ensures that you can either leverage existing container images for rapid deployment or construct tailored 
containers from source for more specialized needs. Below is an example of how to structure your `cdk.context.json` file:

```json
{
  "projectName": "your-project-name",
  "account": {
    "accountId": "your-aws-account-id",
    "region": "your-aws-region",
    "prodLike": true
  },
  "customModelEndpoints": {
    "deploy": true,
    "modelName": "your-model-name",
    "instance_type": "ml.m5.large",
    "containerConfig": {
      "CONTAINER_URI": "your-container-uri",
      "CONTAINER_BUILD_PATH": "your-build-path",
      "CONTAINER_BUILD_TARGET": "your-build-target",
      "CONTAINER_REPOSITORY": "your-repository-name",
      "CONTAINER_DOCKERFILE": "Dockerfile",
      "BUILD_FROM_SOURCE": "<true/false>"
    },
    "endpointConfig": {
      "CONTAINER_ENV": {
        "ENV_VAR1": "value1",
        "ENV_VAR2": "value2"
      }
    }
  }
}
```


### Enabling Authentication

Currently, there are two services that supports authentication
- Tile Sever
- Data Catalog

#### Prerequisites

Before enabling authentication, you will need the following:
- OIDC Authentication Server
- Issuer URL (e.g., `https://<URL>/realms/<realm name>`) which is also known as authority
- Client ID

### Setup Instructions
1. Update authentication configuration:
   - Copy this object template into the `auth` property of your `cdk.context.json` such as:
      ```
        auth: {
          "audience": "<your Oauth2/OpenID Connect>",
          "authority": "<your issuer IdP url>"
        }
      ```

2. To validate:
    - Upon successful deployment, go to your AWS Account -> API-GW -> find `<service>Dataplane` (ie: `TSDataplane`) stack > `Outputs` tab, you will see an output similar to:
      ```
      TSDataplaneTileServerRestApiRestApiTileServerRestApiEndpoint<id> | <url>
      ```
    - Then you can invoke the URL using the authentication token! Ensure that sure you are passing `"Authorization: Bearer $TOKEN"` as a header for any curl request you make. For example:

      ```
      curl -X "GET" "<api endpoint>" -H "Authorization: Bearer $TOKEN"
      ```
---

## Summary

By following this guide, you can easily configure various components of your application using the `cdk.context.json` file. 
This approach centralizes your configuration, making it easier to manage and update settings for your application.

For more details on the available configurations and options, refer to the documentation provided by the `osml-cdk-constructs` package.

## Notes
- Remember to stop or delete the notebook instance when not in use to avoid unnecessary charges.

## Additional Resources

- [AWS CloudFormation Documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html)
- [AWS SageMaker Documentation](https://docs.aws.amazon.com/sagemaker/latest/dg/gs-setup-working-env.html)
- [Conda Documentation](https://docs.conda.io/projects/conda/en/latest/)