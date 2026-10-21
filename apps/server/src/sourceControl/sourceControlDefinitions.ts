import * as AzureDevOpsDriver from "@satslab/source-control-azure-devops/server/driver";
import * as BitbucketDriver from "@satslab/source-control-bitbucket/server/driver";
import { builtInSourceControlDefinitions } from "@satslab/source-control-definitions/registry";
import * as ForgejoDriver from "@satslab/source-control-forgejo/server/driver";
import * as GitCafeDriver from "@satslab/source-control-gitcafe/server/driver";
import * as GitHubDriver from "@satslab/source-control-github/server/driver";
import * as GitLabDriver from "@satslab/source-control-gitlab/server/driver";

/** In the shared registry's order, which is the order hosts are listed and probed in. */
export const BUILT_IN_SOURCE_CONTROL_DRIVER_LIST = [
  GitHubDriver.driver,
  GitLabDriver.driver,
  GitCafeDriver.driver,
  ForgejoDriver.driver,
  BitbucketDriver.driver,
  AzureDevOpsDriver.driver,
] as const;

export const sourceControlDefinitions = builtInSourceControlDefinitions;
