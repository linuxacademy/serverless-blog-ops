SHELL = /bin/bash
deploy: GITHUB_USER = $(shell shyaml get-value GitHub.username < config.yaml)
deploy: GITHUB_PASSWORD= $(shell shyaml get-value GitHub.password < config.yaml)
deploy: CODE_S3_BUCKET= $(shell shyaml get-value AWS.S3.packageBucket < config.yaml)
deploy: SITE_S3_BUCKET= $(shell shyaml get-value AWS.S3.siteBucket < config.yaml)
deploy: STACK_NAME= $(shell shyaml get-value AWS.CloudFormation.stackName < config.yaml)
deploy:
	mkdir -p build
	rsync -a --exclude '**/node_modules' handlers build/
	curl -L https://github.com/spf13/hugo/releases/download/v0.19/hugo_0.19_Linux-64bit.tar.gz | tar -xz
	mkdir -p build/handlers/generateBlog/bin
	mv hugo_0.19_linux_amd64/hugo_0.19_linux_amd64 build/handlers/generateBlog/bin/hugo
	rm -rf hugo_0.19_linux_amd64
	cd build/handlers/generateBlog; npm install --production
	aws cloudformation package --template-file blog.yaml --s3-bucket $(CODE_S3_BUCKET) --output-template-file serverless-output.yaml
	aws cloudformation deploy --template-file serverless-output.yaml --stack-name $(STACK_NAME) --capabilities CAPABILITY_IAM --parameter-overrides GitHubUsername=$(GITHUB_USER) GitHubPassword=$(GITHUB_PASSWORD)

dependencies:
	if ! which aws; then \
		echo "Please install the AWS CLI. See https://aws.amazon.com/cli/"; \
		exit; \
	fi
	if ! which shyaml; then \
		pip install shyaml; \
	fi
