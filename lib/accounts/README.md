# TARGET ACCOUNT

**DO NOT UPDATE THE target_account_template.json FILE DIRECTLY**
The **target_account_template.json** is a template for setting up your own commercial account to deploy into. Copy this file
into the `lib/accounts` directory with the name **target_account.json** and configure it there. Once you have the file
in place rebuild your project to generate stack targets for your account.

```
{
  id: "INSERT YOUR ACCOUNT ID", // amazon account id
  name: "INSERT YOUR ALIAS", // alias to tag your stacks with
  region: "INSERT YOUR REGION", // region you want to deploy into
  prodLike: false, // if you want to retain resources and enable stack termination protections set to true
  deployModelRuner: false, // enable deploying model runner
  deployTileServer: false // enable deploying tile server
}
```

# TARGET AUTHENTICATION

**DO NOT UPDATE THE target_auth_template.json FILE DIRECTLY**
The **target_auth_template.json** is a template json file for setting up your own identity provider (IdP) for tile server authentication. Copy this file into the `lib/accounts` directory with the name **target_auth.json** and configure it there. Once you have your configuration in place, ensure you have added `enableAuths: true` to `target_account.json`. Then, rebuild the project and deploy it.

```
{
    "clientId": "<your client id IdP>",
    "clientSecret": "<your client IdP secret>",
    "authority": "<your issuer IdP url>",
    "certificateArn": "<your certificate arn>",
    "domainName": "<your domain name>",
}
```
