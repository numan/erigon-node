import {
  Stack,
  StackProps,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_autoscaling as autoscaling,
  aws_logs as logs,
} from "aws-cdk-lib";
import {
  AwsLogDriverMode,
  ContainerDependencyCondition,
} from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";

export interface ErigonNodeProps extends StackProps {
  readonly instanceType: ec2.InstanceType;
  readonly vpc: ec2.Vpc;
  readonly basicAuthUsername: string;
  readonly basicAuthPassword: string;
  readonly cloudflareKey: string;
}

export class ErigonNodeStack extends Stack {
  constructor(scope: Construct, id: string, props: ErigonNodeProps) {
    super(scope, id, props);

    const cluster = new ecs.Cluster(this, "ErigonCluster", {
      vpc: props.vpc,
    });

    const asgProvider = new ecs.AsgCapacityProvider(
      this,
      "ErigonCapacityProvider",
      {
        autoScalingGroup: new autoscaling.AutoScalingGroup(this, "ErigonAsg", {
          instanceType: props.instanceType,
          vpc: props.vpc,
          machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
          vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
          keyName: "erigon",
        }),
      }
    );

    asgProvider.autoScalingGroup.connections.allowFromAnyIpv4(ec2.Port.tcp(22));
    asgProvider.autoScalingGroup.connections.allowFromAnyIpv4(ec2.Port.tcp(80));
    asgProvider.autoScalingGroup.connections.allowFromAnyIpv4(
      ec2.Port.tcp(443)
    );

    cluster.addAsgCapacityProvider(asgProvider);

    asgProvider.autoScalingGroup.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    const userData = ec2.UserData.forLinux();
    const commands = [
      "sudo mkdir /mnt/erigon-data/",
      "sudo mkfs -t ext4 /dev/nvme1n1",
      "sudo mount -t ext4 /dev/nvme1n1 /mnt/erigon-data",
      "sudo mkdir -p /mnt/erigon-data/ethdata",
      "sudo chown ec2-user:ec2-user /mnt/erigon-data/ethdata",
    ];
    userData.addCommands(...commands);

    asgProvider.autoScalingGroup.addUserData(userData.render());

    const logGroup = new logs.LogGroup(this, "LogGroup", {
      retention: logs.RetentionDays.ONE_WEEK,
    });

    const taskDefinition = new ecs.Ec2TaskDefinition(
      this,
      "ErigonTaskDefinition",
      {
        networkMode: ecs.NetworkMode.BRIDGE,
        volumes: [
          {
            name: "ethdata",
            host: {
              sourcePath: "/mnt/erigon-data/ethdata",
            },
          },
        ],
      }
    );

    const container = taskDefinition.addContainer("ErigonContainer", {
      containerName: "erigon",
      image: ecs.ContainerImage.fromAsset("docker/erigon"),
      memoryReservationMiB: 512,
      logging: new ecs.AwsLogDriver({
        logGroup,
        streamPrefix: "erigon",
        mode: AwsLogDriverMode.NON_BLOCKING,
      }),
      command: [
        "erigon",
        "--private.api.addr",
        "0.0.0.0:9090",
        "--datadir",
        "/data/ethdata",
        "--chain",
        "mainnet",
        "--trustedpeers",
        "enode://c01cd4ad75b3afe03e4dc0e64c66411dca01f5c197707f3c42efb41774e334db0c4a4f872729b2396cf48f326c837f804de1b06e52140ad3cf316b6c30512b93@3.84.43.68:30310,enode://6d27b80e5bb9a7d6053256de855e2afb6dde2ef40faf48cd0fc9163a69f86a010df6592664176dbb425ae4298addd760ea492a5dcc37f52e4dd27a87e03f643f@54.226.35.233:30303",
        "--healthcheck",
      ],
      portMappings: [
        { containerPort: 30303 }, // listener / discovery
        { containerPort: 30303, protocol: ecs.Protocol.UDP }, // discovery
        { containerPort: 9090 }, // gRPC
      ],
      healthCheck: {
        command: [
          "CMD-SHELL",
          "/usr/local/bin/grpc_health_probe -addr 127.0.0.1:9090 || exit 1",
        ],
      },
    });

    container.addMountPoints({
      sourceVolume: "ethdata",
      containerPath: "/data/ethdata",
      readOnly: false,
    });

    const rpcContainer = taskDefinition.addContainer("ErigonRpcContainer", {
      containerName: "erigonrpc",
      image: ecs.ContainerImage.fromRegistry("thorax/erigon:latest"),
      memoryReservationMiB: 512,
      logging: new ecs.AwsLogDriver({
        logGroup,
        streamPrefix: "erigon-rpc",
        mode: ecs.AwsLogDriverMode.NON_BLOCKING,
      }),
      command: [
        "rpcdaemon",
        "--private.api.addr",
        "erigon:9090",
        "--http.addr",
        "0.0.0.0",
        "--http.port",
        "8545",
        "--http.vhosts",
        "*",
        "--http.corsdomain",
        "*",
        "--http.api",
        "eth,debug,net,trace,web3,erigon",
        "--verbosity",
        "3",
        "--trace.maxtraces",
        "10000",
        "--rpc.batch.concurrency",
        "6",
        "--ws"
      ],
      portMappings: [
        { containerPort: 8545 }, // RPC
      ],
    });

    rpcContainer.addContainerDependencies({
      container,
      condition: ContainerDependencyCondition.HEALTHY,
    });

    rpcContainer.addLink(container, "erigon");

    const caddyContainer = taskDefinition.addContainer("CaddyContainer", {
      containerName: "caddy",
      image: ecs.ContainerImage.fromAsset("docker/caddy"),
      logging: new ecs.AwsLogDriver({
        logGroup,
        streamPrefix: "caddy",
        mode: ecs.AwsLogDriverMode.NON_BLOCKING,
      }),
      memoryReservationMiB: 512,
      portMappings: [
        { containerPort: 80, hostPort: 80 },
        { containerPort: 443, hostPort: 443 },
      ],
      environment: {
        BASICAUTH_USERNAME: props.basicAuthUsername,
        BASICAUTH_HASHED_PASSWORD: props.basicAuthPassword,
        CLOUDFLARE_KEY: props.cloudflareKey,
      },
    });

    caddyContainer.addLink(rpcContainer, "erigonrpc");

    new ecs.Ec2Service(this, "ErigonService", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      enableExecuteCommand: true,
    });
  }
}
