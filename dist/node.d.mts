import { InlineConfig } from 'vite';
import { b as ViteSSGOptions } from './shared/vite-ssg.BreG4VMo.mjs';
import '@unhead/vue';
import 'beasties';
import 'vue';
import 'vue-router';

declare function build(ssgOptions?: Partial<ViteSSGOptions>, viteConfig?: InlineConfig): Promise<void>;

export { build };
