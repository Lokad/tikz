// The shared policy's optional region ownership is undefined for shipped paths.
// JSON omits that property. Restore its in-memory identity without changing limits.
export function readPathLabelPrimaryPolicies(bundle){
 const policies=bundle.json('policies.json');
 for(const policy of Object.values(policies))for(const region of policy.regions)
  if(!Object.hasOwn(region,'nodeId'))region.nodeId=undefined;
 return policies;
}
