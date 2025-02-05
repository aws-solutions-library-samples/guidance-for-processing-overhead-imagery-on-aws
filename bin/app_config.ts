/*
 * Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
 */

import { App, Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks, NIST80053R5Checks } from "cdk-nag";
import {
  OSMLAccount,
  OSMLAuth
} from "osml-cdk-constructs";

interface ComponentConfig {
  /**
   * Whether to deploy the selected component.
   */
  deploy: boolean;

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
   * A global permission boundary policy to apply to all
   * roles in the application.
   */
  boundaryPolicy: string;

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
    // Set the base App
    this.app = app;

    // Read in all our cdk context configurations
    this.projectName = this.getContextValue("projectName", "Project Name");
    this.account = this.getContextValue("account", "Deployment Account ID");
    this.vpc = this.getContextValue("vpc", "Importing VPC", true);
    this.modelRunner = this.getContextValue(
      "modelRunner",
      "Deploying Model Runner",
      true
    );
    this.tileServer = this.getContextValue(
      "tileServer",
      "Deploying Tile Server",
      true
    );
    this.dataIntake = this.getContextValue(
      "dataIntake",
      "Deploying Data Intake",
      true
    );
    this.dataCatalog = this.getContextValue(
      "dataCatalog",
      "Deploying Data Catalog",
      true
    );
    this.customModelEndpoints = this.getContextValue(
      "customModelEndpoints",
      "Deploying Custom Model Endpoints",
      true
    );
    this.auth = this.getContextValue("auth", "Deploying Auth", true);
    this.testModelEndpoints = this.getContextValue(
      "testModelEndpoints",
      "Deploying Test Model Endpoints",
      true
    );
    this.testImagery = this.getContextValue(
      "testImagery",
      "Deploying Test Imagery",
      true
    );
    this.boundaryPolicy = this.getContextValue(
      "@aws:cdk:permissionsBoundary",
      "Applied Permissions Boundary",
      true
    );
    this.runCdkNag = process.env.RUN_CDK_NAG?.toLowerCase() === "true";

    // Apply CDK Nag configurations to the application.
    this.applyCdkNagChecks();
  }

  /**
   * Retrieves the context value for a given key.
   *
   * @param key - The context key to retrieve.
   * @param display - Information about the context value to display.
   * @param optional - Whether the context key is optional.
   * @returns The context value.
   * @throws Will throw an error if the context key is not found and is not optional.
   */
  private getContextValue<T>(
    key: string,
    display: string,
    optional: boolean = false
  ): T {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const value: unknown = this.app.node.tryGetContext(key);

    if (value === undefined && !optional) {
      throw new Error(`Context value for key "${key}" is not defined.`);
    }

    let formattedValue: string;

    if (typeof value === "object" && !Array.isArray(value)) {
      const objValue = value as Record<string, unknown>;

      formattedValue = Object.entries(objValue)
        .map(([k, v]) => `  - ${k}: ${String(v)}`)
        .join("\n");

      formattedValue = `\n${formattedValue}`;
    } else {
      formattedValue = `\n  - ${JSON.stringify(value)}`;
    }

    if (value != undefined || value != null){
      console.log(`✅ "${display}":${formattedValue}`);
    }

    return value as T;
  }

  /**
   * Enables CDK-Nag security compliance checks if configured.
   *
   * This method applies `AwsSolutionsChecks` and `NIST80053R5Checks` aspects
   * to the application, enforcing AWS security best practices and compliance with
   * the NIST 800-53 Rev. 5 security framework.
   *
   * If `runCdkNag` is `false`, this method logs a warning but does not apply checks.
   */
  private applyCdkNagChecks(): void {
    if (this.runCdkNag) {
      console.log("🔒 Enabling CDK-Nag Security Compliance Checks...");
      Aspects.of(this.app).add(new AwsSolutionsChecks());
      Aspects.of(this.app).add(new NIST80053R5Checks());
    } else {
      console.log("⚠️ CDK-Nag Security Checks Disabled.");
    }
  }
}

// Initialize the default CDK application and configure it
export const appConfig = new AppConfig(new App());
