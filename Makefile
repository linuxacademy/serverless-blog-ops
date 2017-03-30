#  Copyright 2017 Linux Academy
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#  http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

SHELL = /bin/bash
deploy: dependencies
deploy: GITHUB_USER = $(shell shyaml get-value GitHub.username < config.yaml)
deploy: GITHUB_PASSWORD= $(shell shyaml get-value GitHub.password < config.yaml)
deploy: CODE_S3_BUCKET= $(shell shyaml get-value AWS.S3.packageBucket < config.yaml)
deploy: SITE_S3_BUCKET= $(shell shyaml get-value AWS.S3.siteBucket < config.yaml) deploy: STACK_NAME= $(shell shyaml get-value AWS.CloudFormation.stackName < config.yaml)
deploy:
	mkdir -p build
	rsync -a --exclude '**/node_modules' handlers build/
	curl -L https://github.com/spf13/hugo/releases/download/v0.19/hugo_0.19_Linux-64bit.tar.gz | tar -xz
	mkdir -p build/handlers/generateBlog/bin
	mv hugo_0.19_linux_amd64/hugo_0.19_linux_amd64 build/handlers/generateBlog/bin/hugo
	rm -rf hugo_0.19_linux_amd64
	cd build/handlers/generateBlog; npm install --production
	aws cloudformation package --template-file blog.yaml --s3-bucket $(CODE_S3_BUCKET) --output-template-file serverless-output.yaml
	aws cloudformation deploy --template-file serverless-output.yaml --stack-name $(STACK_NAME) --capabilities CAPABILITY_IAM --parameter-overrides GitHubUsername=$(GITHUB_USER) GitHubPassword=$(GITHUB_PASSWORD) SiteBucket=$(SITE_S3_BUCKET)

dependencies:
	if ! which aws; then \
		echo "Please install the AWS CLI. See https://aws.amazon.com/cli/"; \
		exit; \
	fi
	if ! which shyaml; then \
		pip install shyaml; \
	fi

testrun: ENDPOINT = $(shell shyaml get-value AWS.APIGateway.endpoint < config.yaml)
testrun: API_KEY = $(shell shyaml get-value AWS.APIGateway.apiKey < config.yaml)
testrun:
	curl -v -H 'x-api-key: $(API_KEY)' -H 'Content-type: application/json' -X POST --data @handlers/generateBlog/test/body.json $(ENDPOINT)
