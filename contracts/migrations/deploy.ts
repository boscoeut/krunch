// Migrations are an early feature. Currently, they're nothing more than this
// single deploy script that's invoked from the CLI, injecting a provider
// configured from the workspace's Anchor.toml.


module.exports = async function (provider) {
  console.log("migration script invoked")
  // Configure client to use the provider.
 

};
