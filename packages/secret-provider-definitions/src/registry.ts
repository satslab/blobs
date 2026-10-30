import { makeSecretProviderDefinitionRegistry } from "@satslab/secret-provider-core/shared/definition";
import * as OnePassword from "@satslab/secret-provider-onepassword/shared/definition";

export const builtInSecretProviderDefinitions = makeSecretProviderDefinitionRegistry([
  OnePassword.definition,
]);
