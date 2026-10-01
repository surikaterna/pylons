export const coreRuntimeConsumer = `import {createRuntime,createVersionOwnership} from "@pylons/core";
import {parseResolvedPlan} from "@pylons/contracts";
const assert=value=>{if(!value)throw new Error("core-consumer-failed")};
const scope={hostId:"host",tenantId:"tenant"};
const definition={schemaVersion:1,identity:{pluginId:"fixture",name:"fixture",definitionVersion:"v"},extensions:[],contributions:[],dependencies:[]};
const ref={pluginId:"fixture",definitionVersion:"v"};
const parsed=parseResolvedPlan({schemaVersion:1,inventory:{schemaVersion:1,scope,revision:"r",validity:{freshUntil:100,authorizedUntil:100},installations:[{definition:ref,enabled:true,selectedExtensions:[],operatorBindings:[]}]},definitions:[definition],configs:[{schemaVersion:1,scope,revision:"r",definition:ref,values:{}}],provenance:{sourceId:"fixture",revision:"r",authorizationId:"verified"}});
assert(parsed.success);let loads=0;
const runtime=createRuntime({context:{scope,authorizationId:"verified"},host:"cli",hostContractVersion:"v",source:{async read(){return {success:true,data:parsed.data}}},loader:{async load(){loads++;return {success:false,error:{code:"load-failed"}}}},policy:{async evaluate(){return {kind:"allow"}}},authority:{async authorize(){return {kind:"deny"}}},clock:{now:()=>0,schedule:()=>({dispose(){}})},observer:{observe(){}},diagnostics:{write(){}},bounds:{source:100,policy:100,load:100,activation:100,invocation:100,replacement:100,cleanup:100},supportedContributionKinds:[],securityStartupCapabilities:[],hostCapabilities:[],versionOwnership:createVersionOwnership()});
assert((await runtime.refresh()).success);assert(runtime.metadata().length===1);assert(loads===0);
assert((await runtime.shutdown()).success);
`;

export const coreTypeConsumer = `import {createRuntime,type RuntimeOptions,type InvocationAuthority} from "@pylons/core";
import type {InvocationContext} from "@pylons/contracts";
const authority:InvocationAuthority={async authorize(request){const context:InvocationContext=request.invocation;return context.principal.subjectId ? {kind:"allow"} : {kind:"deny"}}};
declare const options:RuntimeOptions;
const runtime=createRuntime({...options,authority});
// @ts-expect-error authoritative per-call decision is required
const unsafeAuthority:InvocationAuthority={};
// @ts-expect-error raw provider handles are not public
runtime.provider;
export {runtime,unsafeAuthority};
`;
