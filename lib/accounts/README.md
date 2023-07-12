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
  enableAutoscaling: true, // enable autoscaling on the ECS cluster
  enableMonitoring: true, // enable monitoring and dashboards for the service
  enableTesting: true // deploy testing resources to validate MR is working correctly
}
```
