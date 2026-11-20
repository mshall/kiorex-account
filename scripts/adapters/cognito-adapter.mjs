/**
 * The ONLY place in kiorex-account that touches the AWS SDK for the demo seed (Q10 Part B): a thin Cognito adapter.
 * The SDK is imported lazily so the planning/guard code (and its tests) run without AWS or credentials.
 */
export async function createCognitoAdapter({ region = "eu-central-1", profile } = {}) {
  const sdk = await import("@aws-sdk/client-cognito-identity-provider");
  let credentials;
  if (profile) {
    const { fromIni } = await import("@aws-sdk/credential-providers").catch(() => ({ fromIni: undefined }));
    if (fromIni) credentials = fromIni({ profile });
    else process.env.AWS_PROFILE = profile; // default provider chain picks the profile up
  }
  const client = new sdk.CognitoIdentityProviderClient({ region, ...(credentials ? { credentials } : {}) });
  const notFound = (e) => e?.name === "UserNotFoundException";
  return {
    async describePool(userPoolId) {
      const r = await client.send(new sdk.DescribeUserPoolCommand({ UserPoolId: userPoolId }));
      return { name: r.UserPool?.Name ?? "", tags: r.UserPool?.UserPoolTags ?? {}, deletionProtection: r.UserPool?.DeletionProtection };
    },
    async getUser(userPoolId, username) {
      try {
        const r = await client.send(new sdk.AdminGetUserCommand({ UserPoolId: userPoolId, Username: username }));
        return { sub: r.UserAttributes?.find((a) => a.Name === "sub")?.Value ?? null };
      } catch (e) {
        if (notFound(e)) return null;
        throw e;
      }
    },
    async createUser(userPoolId, username, attributes) {
      const r = await client.send(new sdk.AdminCreateUserCommand({
        UserPoolId: userPoolId, Username: username, MessageAction: "SUPPRESS",
        UserAttributes: Object.entries(attributes).map(([Name, Value]) => ({ Name, Value })),
      }));
      return { sub: r.User?.Attributes?.find((a) => a.Name === "sub")?.Value ?? null };
    },
    async setPermanentPassword(userPoolId, username, password) {
      await client.send(new sdk.AdminSetUserPasswordCommand({ UserPoolId: userPoolId, Username: username, Password: password, Permanent: true }));
    },
    async updateAttributes(userPoolId, username, attributes) {
      await client.send(new sdk.AdminUpdateUserAttributesCommand({ UserPoolId: userPoolId, Username: username, UserAttributes: Object.entries(attributes).map(([Name, Value]) => ({ Name, Value })) }));
    },
    async deleteUser(userPoolId, username) {
      await client.send(new sdk.AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username }));
    },
  };
}
