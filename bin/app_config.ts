/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App } from "aws-cdk-lib";
import { OSMLAccount, OSMLAuth } from "osml-cdk-constructs";

interface ComponentConfig {
  /**
   * Whether to deploy the selected component.
   */
  deploy: boolean;

  /**
   * Only used for components with container assets that can be built from local files.
   */
  buildFromSource?: boolean;

  /**
   * Configuration options for the component.
   */
  config?: { [key: string]: unknown };
}

interface CustomEndpointConfig extends ComponentConfig {
  /**
   * The name to assign the SageMaker endpoint.
   */
  modelName: string;

  /**
   * The instance type to use for hosting the SageMaker model.
   */
  instance_type: string;

  /**
   * The configuration class for the OSMLContainer construct to use.
   */
  containerConfig: { [key: string]: unknown };

  /**
   * The configuration class for the MESMEndpoint construct to use.
   */
  endpointConfig: { [key: string]: unknown };
}

/**
 * Configuration class for the CDK application.
 */
export class AppConfig {
  /**
   * The CDK application instance.
   */
  app: App;

  /**
   * The name of the project.
   */
  projectName: string;

  /**
   * The AWS account configuration.
   */
  account: OSMLAccount;

  /**
   * Configuration for the VPC component.
   */
  vpc: ComponentConfig;

  /**
   * Configuration for the model runner component.
   */
  modelRunner: ComponentConfig;

  /**
   * Configuration for the tile server component.
   */
  tileServer: ComponentConfig;

  /**
   * Configuration for the data intake component.
   */
  dataIntake: ComponentConfig;

  /**
   * Configuration for the data catalog component.
   */
  dataCatalog: ComponentConfig;

  /**
   * Configuration for the custom model endpoints component.
   */
  customModelEndpoints: CustomEndpointConfig;

  /**
   * The authentication configuration.
   */
  auth: OSMLAuth;

  /**
   * Configuration for the test model endpoints component.
   */
  testModelEndpoints: ComponentConfig;

  /**
   * Configuration for the test imagery component.
   */
  testImagery: ComponentConfig;

  /**
   * Flag indicating whether to run CDK Nag.
   */
  runCdkNag: boolean;

  /**
   * Constructs a new AppConfig instance.
   *
   * @param app - The CDK application instance.
   */
  constructor(app: App) {
    this.app = app;
    this.projectName = this.getContextValue("projectName");
    this.account = this.getContextValue("account");
    this.vpc = this.getContextValue("vpc", true);
    this.modelRunner = this.getContextValue("modelRunner", true);
    this.tileServer = this.getContextValue("tileServer", true);
    this.dataIntake = this.getContextValue("dataIntake", true);
    this.dataCatalog = this.getContextValue("dataCatalog", true);
    this.customModelEndpoints = this.getContextValue(
      "customModelEndpoints",
      true
    );
    this.auth = this.getContextValue("auth", true);
    this.testModelEndpoints = this.getContextValue("testModelEndpoints", true);
    this.testImagery = this.getContextValue("testImagery", true);
    this.runCdkNag = process.env.RUN_CDK_NAG?.toLowerCase() === "true";
  }

  /**
   * Retrieves the context value for a given key.
   *
   * @param key - The context key to retrieve.
   * @param optional - Whether the context key is optional.
   * @returns The context value.
   * @throws Will throw an error if the context key is not found and is not optional.
   */
  private getContextValue<T>(key: string, optional: boolean = false): T {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const value = this.app.node.tryGetContext(key);
    if (value === undefined && !optional) {
      throw new Error(`Context value for key "${key}" is not defined.`);
    }
    return value as T;
  }
}

// Initialize the default CDK application and configure it
export const appConfig = new AppConfig(new App());
