# Erigon Node on AWS with CDK

## Prerequisites

Before you start you need to install **AWS CDK CLI** and bootstrap your AWS account:

1. [Prerequisites](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html#getting_started_prerequisites) 
2. [Install AWS CDK Locally](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html#getting_started_install)
3. [Bootstrapping](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html#getting_started_bootstrap)


## Creating the node

To create the node, run:

```
CLOUDFLARE_KEY="<CLOUDFLARE_KEY>" BASICAUTH_USERNAME="erigon" BASICAUTH_HASHED_PASSWORD="<HASHED_PASSWORD>" cdk --profile "<AWS Profile>" deploy --all --require-approval never
```

Environment Variables:

- `CLOUDFLARE_KEY` Your cloudflare API key
- `BASICAUTH_USERNAME` The username you want to use for basic auth
- `BASICAUTH_HASHED_PASSWORD` The hashed password. See [Caddy documentation](https://caddyserver.com/docs/command-line#caddy-hash-password) for more details.


## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
