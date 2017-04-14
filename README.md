# serverless-blog-ops

An AWS CloudFormation stack for GitHub webhook-triggered hugo publishing

## Requirements

- Run or have previously run `xcode-select --install`
- [AWS CLI installed and configured with access to an AWS account](https://aws.amazon.com/cli/)

## Config

Copy `config.sample.yaml` to `config.yaml` and replace all the descriptions in parentheses with appropriate values. Keep in mind that S3 bucket names must be unique.

## Usage

### Install the stack

`make`

### Set up GitHub webhook

Note: this process will be automated in a near-future version.

1. Examine the output from the `make` command and find the parameter passed for `GITHUB_SECRET` to the `aws deploy` command.
2. In the AWS console, find the AWS Gateway endpoint, and copy the URL value for the Prod stage.
3. Create a new webhook in the settings for the GitHub repository that contains the hugo source files. Use the `GITHUB_SECRET` as the secret and the copied URL for the webhook endpoint. Only send push events.
