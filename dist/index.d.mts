import { Component } from 'vue';
import { R as RouterOptions, V as ViteSSGContext, a as ViteSSGClientOptions } from './shared/vite-ssg.BreG4VMo.mjs';
export { b as ViteSSGOptions } from './shared/vite-ssg.BreG4VMo.mjs';
import '@unhead/vue';
import 'beasties';
import 'vue-router';

declare function ViteSSG(App: Component, routerOptions: RouterOptions, fn?: (context: ViteSSGContext<true>) => Promise<void> | void, options?: ViteSSGClientOptions): (routePath?: string) => Promise<ViteSSGContext<true>>;

export { RouterOptions, ViteSSG, ViteSSGClientOptions, ViteSSGContext };
