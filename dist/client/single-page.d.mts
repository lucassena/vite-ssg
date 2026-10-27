import { Component } from 'vue';
import { V as ViteSSGContext, a as ViteSSGClientOptions } from '../shared/vite-ssg.BreG4VMo.mjs';
export { R as RouterOptions, b as ViteSSGOptions } from '../shared/vite-ssg.BreG4VMo.mjs';
import '@unhead/vue';
import 'beasties';
import 'vue-router';

declare function ViteSSG(App: Component, fn?: (context: ViteSSGContext<false>) => Promise<void> | void, options?: ViteSSGClientOptions): () => Promise<ViteSSGContext<false>>;

export { ViteSSG, ViteSSGClientOptions, ViteSSGContext };
