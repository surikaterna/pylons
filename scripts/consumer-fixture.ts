export function runtimeConsumer(specifier: string): string {
  return `import {parsePluginDefinition, parseConfigSideband, parseResolvedPlan} from ${JSON.stringify(specifier)};
const assert = (condition) => { if (!condition) throw new Error("Contracts consumer assertion failed"); };
const definition = {schemaVersion:1,identity:{pluginId:"fixture",name:"Fixture",definitionVersion:"definition-1"},contributions:[],extensions:[],dependencies:[]};
const ref = {pluginId:definition.identity.pluginId,definitionVersion:definition.identity.definitionVersion};
const extension={id:"validation",artifactKey:"validation-code",hosts:["server","browser","cli"],hostContractVersion:"1",provides:[{capabilityId:"validation",contractVersion:"1"}],activation:{kind:"startup"},dependencies:[]};
const binding={extensionId:"validation",artifactKey:"validation-code",artifactVersion:"artifact-1",locator:"https://fixture.invalid/plugin.js",integrity:{algorithm:"sha256",digest:"a".repeat(64)},loaderId:"fake"};
const executable=parsePluginDefinition({...definition,extensions:[extension]});assert(executable.success);
const metadata = parsePluginDefinition(definition); assert(metadata.success && metadata.data.extensions.length === 0);
let loads=0, activations=0; const providers=[];
const factory = { async activate(context) { activations++; const provider = { async invoke(input,request) { return {success:true,data:{input,values:context.configuration.values,tenant:context.generation.scope.tenantId,generation:context.generation.generationId,subject:request.principal.subjectId}}; } }; context.providers.register({capabilityId:"validation",contractVersion:"1"},provider); return {success:true,data:{async cleanup(){return {success:true,data:undefined};}}}; } };
const loader = {async load(){loads++; return {success:true,data:factory};}};
assert(loads===0 && activations===0);
const cancellation={cancelled:false,onCancel(){return {dispose(){}};}};
const scope={hostId:"host",tenantId:"a"};
const config=(tenant,minimum)=>parseConfigSideband({schemaVersion:1,scope:{...scope,tenantId:tenant},revision:"r",definition:ref,values:{minimum}});
const plan=parseResolvedPlan({schemaVersion:1,inventory:{schemaVersion:1,scope,revision:"r",validity:{freshUntil:10,authorizedUntil:20},installations:[{definition:ref,enabled:true,selectedExtensions:[],operatorBindings:[]}]},definitions:[definition],configs:[{schemaVersion:1,scope,revision:"r",definition:ref,values:{}}],provenance:{sourceId:"fixture",revision:"r",authorizationId:"verified"}});
assert(plan.success); const loaded=await loader.load({definition:executable.data,extension,host:"server",binding,cancellation});
for (const [tenant,minimum] of [["a",3],["b",8]]) {
const parsed=config(tenant,minimum);assert(parsed.success);
await loaded.data.activate({generation:{scope:{...scope,tenantId:tenant},definition:definition.identity,generationId:tenant,desiredRevision:"r"},host:"server",configuration:parsed.data,cancellation,providers:{register(capability,provider){providers.push(provider);return {success:true,data:{dispose(){}}};}},resources:{own(){}}});
}
const request=subjectId=>({principal:{subjectId},credential:{reference:subjectId+"-credential"},transaction:{id:subjectId+"-transaction"},cancellation});
const resultA=await providers[0].invoke(null,request("alice"));
const resultB=await providers[1].invoke(null,request("bob"));
assert(resultA.data.values.minimum===3 && resultB.data.values.minimum===8 && resultA.data.subject==="alice" && resultB.data.subject==="bob" && resultA.data.generation!==resultB.data.generation);
assert(loads===1 && activations===2);
assert(!parsePluginDefinition({...definition,displayName:"unsupported"}).success);
console.log("Contracts ESM metadata/factory boundary: zero discovery loads; reusable factory; two scopes; request-local identity passed.");
`;
}

export const typeConsumer = `import {parsePluginDefinition, parseResolvedPlan, type PluginDefinition, type PluginFactory, type Cancellation, type JsonValue} from "@pylons/contracts";
const definition: PluginDefinition = {schemaVersion:1,identity:{pluginId:"fixture",name:"Fixture",definitionVersion:"d"},contributions:[],extensions:[],dependencies:[]};
const parsed = parsePluginDefinition(definition);
const cancellation: Cancellation = {cancelled:false,onCancel:()=>({dispose(){}})};
const factory: PluginFactory = {async activate(context) { context.resources.own({async cleanup(){return {success:true,data:undefined};}}); return {success:true,data:{async cleanup(){return {success:true,data:undefined};}}};}};
// @ts-expect-error executable metadata is not JSON
const notJson: JsonValue = () => 1;
// @ts-expect-error schema release is not arbitrary
const wrongVersion: PluginDefinition = {...definition,schemaVersion:2};
// @ts-expect-error neutral cancellation cannot expose AbortSignal
const noSignal = cancellation.signal;
export {parsed,factory,notJson,wrongVersion,noSignal,parseResolvedPlan};
`;
