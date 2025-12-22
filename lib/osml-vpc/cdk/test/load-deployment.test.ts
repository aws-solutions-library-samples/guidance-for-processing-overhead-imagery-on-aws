/** Copyright 2023-2026 Amazon.com, Inc. or its affiliates. */

/**
 * Unit tests for loadDeploymentConfig function.
 */

// Mock fs module before importing the function under test
jest.mock("fs", () => {
  const actualFs = jest.requireActual<typeof import("fs")>("fs");
  return {
    ...actualFs,
    existsSync: jest.fn(),
    readFileSync: jest.fn()
  };
});

import { existsSync, readFileSync } from "fs";

import { loadDeploymentConfig } from "../bin/deployment/load-deployment";

describe("loadDeploymentConfig", () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    (existsSync as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("loads valid deployment configuration", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        id: "123456789012",
        region: "us-west-2"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.account.id).toBe("123456789012");
    expect(result.account.region).toBe("us-west-2");
    expect(result.account.prodLike).toBe(false);
    expect(result.account.isAdc).toBe(false);
  });

  test("throws error when deployment.json is missing", () => {
    (existsSync as jest.Mock).mockReturnValue(false);

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing deployment.json file/);
  });

  test("throws error when JSON is invalid", () => {
    (readFileSync as jest.Mock).mockReturnValue("{ invalid json }");

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid JSON format/);
  });

  test("validates required projectName field", () => {
    const config = {
      account: {
        id: "123456789012",
        region: "us-west-2"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing required field: projectName/);
  });

  test("validates required account.id field", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        region: "us-west-2"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing required field: account.id/);
  });

  test("validates account ID format (must be 12 digits)", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        id: "12345",
        region: "us-west-2"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid AWS account ID format/);
  });

  test("validates required account.region field", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        id: "123456789012"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Missing required field: account.region/);
  });

  test("validates region format", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        id: "123456789012",
        region: "invalid_region_123"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid AWS region format/);
  });

  test("loads prodLike and isAdc flags", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: true,
        isAdc: true
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.account.prodLike).toBe(true);
    expect(result.account.isAdc).toBe(true);
  });

  test("defaults prodLike and isAdc to false when not specified", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        id: "123456789012",
        region: "us-west-2"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.account.prodLike).toBe(false);
    expect(result.account.isAdc).toBe(false);
  });

  test("validates VPC ID format when provided", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      networkConfig: {
        vpcId: "invalid-vpc-id"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid VPC ID format/);
  });

  // Security group validation removed - components create their own security groups

  test("requires targetSubnets when vpcId is provided", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      networkConfig: {
        vpcId: "vpc-0a1b2c3d4e5f67890"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/targetSubnets must also be specified/);
  });

  test("validates targetSubnets is array when provided", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      networkConfig: {
        vpcId: "vpc-0a1b2c3d4e5f67890",
        targetSubnets: "not-an-array"
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/must be an array/);
  });

  test("validates subnet ID format", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      networkConfig: {
        vpcId: "vpc-0a1b2c3d4e5f67890",
        targetSubnets: ["invalid-subnet-id"]
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    expect(() => {
      loadDeploymentConfig();
    }).toThrow(/Invalid Subnet ID format/);
  });

  test("loads networkConfig with valid VPC configuration (modern 17-char format)", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      networkConfig: {
        vpcId: "vpc-0a1b2c3d4e5f67890",
        targetSubnets: ["subnet-0a1b2c3d4e5f67890", "subnet-1234567890abcdef0"]
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.networkConfig).toBeDefined();
    expect(result.networkConfig?.VPC_ID).toBe("vpc-0a1b2c3d4e5f67890");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.networkConfig as any)?.TARGET_SUBNETS).toEqual([
      "subnet-0a1b2c3d4e5f67890",
      "subnet-1234567890abcdef0"
    ]);
    // SECURITY_GROUP_ID is not set when securityGroupId is not provided in config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.networkConfig as any)?.SECURITY_GROUP_ID).toBeUndefined();
  });

  test("loads networkConfig with valid VPC configuration (legacy 8-char format)", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      networkConfig: {
        vpcId: "vpc-12345678",
        targetSubnets: ["subnet-12345678", "subnet-87654321"]
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.networkConfig).toBeDefined();
    expect(result.networkConfig?.VPC_ID).toBe("vpc-12345678");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.networkConfig as any)?.TARGET_SUBNETS).toEqual([
      "subnet-12345678",
      "subnet-87654321"
    ]);
    // SECURITY_GROUP_ID is not set when securityGroupId is not provided in config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.networkConfig as any)?.SECURITY_GROUP_ID).toBeUndefined();
  });

  test("trims whitespace from string fields", () => {
    const config = {
      projectName: "OSML-VPC",
      account: {
        id: "  123456789012  ",
        region: "  us-west-2  "
      }
    };

    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));

    const result = loadDeploymentConfig();

    expect(result.account.id).toBe("123456789012");
    expect(result.account.region).toBe("us-west-2");
  });
});
