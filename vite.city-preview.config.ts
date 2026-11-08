import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const repositoryRoot=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({root:resolve(repositoryRoot,'preview/city-sandbox'),base:'./',publicDir:false,plugins:[vue()],define:{__VUE_OPTIONS_API__:false,__VUE_PROD_DEVTOOLS__:false,__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:false},build:{outDir:resolve(repositoryRoot,'dist/city-sandbox'),emptyOutDir:true,sourcemap:false}});
