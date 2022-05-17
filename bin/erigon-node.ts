#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ErigonEBSNodeStack } from "../lib/erigon-node-stack";
import { StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { aws_ec2 as ec2 } from "aws-cdk-lib";

export class ErigonNodesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const CLOUDFLARE_KEY = process.env.CLOUDFLARE_KEY;
    const BASICAUTH_USERNAME = process.env.BASICAUTH_USERNAME;
    const BASICAUTH_HASHED_PASSWORD = process.env.BASICAUTH_HASHED_PASSWORD;
    
    if (CLOUDFLARE_KEY === undefined) {
      throw new Error("CLOUDFLARE_KEY is not defined");
    }
    
    if (BASICAUTH_USERNAME === undefined) {
      throw new Error("BASICAUTH_USERNAME is not defined");
    }
    
    if (BASICAUTH_HASHED_PASSWORD === undefined) {
      throw new Error("BASICAUTH_HASHED_PASSWORD is not defined");
    }

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      subnetConfiguration: [
        { cidrMask: 23, name: 'Public', subnetType: ec2.SubnetType.PUBLIC }
      ]
    })

    new ErigonEBSNodeStack(this, "ErigonEBSNodeStack", {
      ...props,
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.I3EN, ec2.InstanceSize.XLARGE2),
      cloudflareKey: CLOUDFLARE_KEY,
      basicAuthUsername: BASICAUTH_USERNAME,
      basicAuthPassword: BASICAUTH_HASHED_PASSWORD,
    });
  }
}

const app = new cdk.App();

new ErigonNodesStack(app, "ErigonNodeStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
