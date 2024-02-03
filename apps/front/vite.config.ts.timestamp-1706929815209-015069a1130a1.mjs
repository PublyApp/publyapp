// vite.config.ts
import { unstable_vitePlugin as remix } from "file:///C:/Users/radan/Documents/Dev/Aktiveo/aktiveo-platform/node_modules/.pnpm/@remix-run+dev@2.5.1_@remix-run+serve@2.5.1_typescript@5.3.3_vite@5.0.12/node_modules/@remix-run/dev/dist/index.js";
import { remixDevTools } from "file:///C:/Users/radan/Documents/Dev/Aktiveo/aktiveo-platform/node_modules/.pnpm/remix-development-tools@3.7.4_@remix-run+react@2.5.1_@types+react-dom@18.2.18_@types+react@18_hr3ig32cz6yo5bbpvkjvdrrad4/node_modules/remix-development-tools/dist/vite.js";
import { defineConfig } from "file:///C:/Users/radan/Documents/Dev/Aktiveo/aktiveo-platform/node_modules/.pnpm/vite@5.0.12/node_modules/vite/dist/node/index.js";
import { cjsInterop } from "file:///C:/Users/radan/Documents/Dev/Aktiveo/aktiveo-platform/node_modules/.pnpm/vite-plugin-cjs-interop@2.0.3/node_modules/vite-plugin-cjs-interop/dist/index.js";
import tsconfigPaths from "file:///C:/Users/radan/Documents/Dev/Aktiveo/aktiveo-platform/node_modules/.pnpm/vite-tsconfig-paths@4.3.1_typescript@5.3.3_vite@5.0.12/node_modules/vite-tsconfig-paths/dist/index.mjs";
var vite_config_default = defineConfig({
  plugins: [
    remixDevTools(),
    remix(),
    // {
    // ignoredRouteFiles: ['**/.*'],
    // serverModuleFormat: 'esm',
    // }
    tsconfigPaths(),
    // nodePolyfills(),
    cjsInterop({
      dependencies: [
        "react-lazy-load-image-component"
        // -- Parse --
        // 'parse',
        // 'parse/node',
      ]
    })
    // commonjs({
    // 	// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
    // 	filter(id) {
    // 		// `node_modules` is exclude by default, so we need to include it explicitly
    // 		// https://github.com/vite-plugin/vite-plugin-commonjs/blob/v0.7.0/src/index.ts#L125-L127
    // 		if (id.includes('node_modules/parse')) {
    // 			return true;
    // 		}
    // 		return false;
    // 	},
    // }),
  ],
  server: {
    port: 6181
  }
  // build: {
  // 	sourcemap: true,
  // 	commonjsOptions: {
  // 		transformMixedEsModules: true,
  // 		// defaultIsModuleExports: true,
  // 	},
  // },
  // resolve: {
  // 	alias: {
  // 		'parse/node': path.resolve(__dirname, './node_modules/parse/parse.min.js'),
  // 		parse: path.resolve(__dirname, './node_modules/parse/dist/parse.min.js'),
  // 	},
  // },
  // ssr: {
  // 	external: ['parse', 'parse/node'],
  // },
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxyYWRhblxcXFxEb2N1bWVudHNcXFxcRGV2XFxcXEFrdGl2ZW9cXFxcYWt0aXZlby1wbGF0Zm9ybVxcXFxhcHBzXFxcXGZyb250XCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxyYWRhblxcXFxEb2N1bWVudHNcXFxcRGV2XFxcXEFrdGl2ZW9cXFxcYWt0aXZlby1wbGF0Zm9ybVxcXFxhcHBzXFxcXGZyb250XFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9yYWRhbi9Eb2N1bWVudHMvRGV2L0FrdGl2ZW8vYWt0aXZlby1wbGF0Zm9ybS9hcHBzL2Zyb250L3ZpdGUuY29uZmlnLnRzXCI7LyogZXNsaW50LWRpc2FibGUgaW1wb3J0L25vLWV4dHJhbmVvdXMtZGVwZW5kZW5jaWVzICovXG4vLyBpbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcblxuaW1wb3J0IHsgdW5zdGFibGVfdml0ZVBsdWdpbiBhcyByZW1peCB9IGZyb20gJ0ByZW1peC1ydW4vZGV2JztcbmltcG9ydCB7IHJlbWl4RGV2VG9vbHMgfSBmcm9tICdyZW1peC1kZXZlbG9wbWVudC10b29scy92aXRlJztcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IHsgY2pzSW50ZXJvcCB9IGZyb20gJ3ZpdGUtcGx1Z2luLWNqcy1pbnRlcm9wJztcbmltcG9ydCB0c2NvbmZpZ1BhdGhzIGZyb20gJ3ZpdGUtdHNjb25maWctcGF0aHMnO1xuXG4vLyBpbXBvcnQgY29tbW9uanMgZnJvbSAndml0ZS1wbHVnaW4tY29tbW9uanMnO1xuLy8gaW1wb3J0IHsgbm9kZVBvbHlmaWxscyB9IGZyb20gJ3ZpdGUtcGx1Z2luLW5vZGUtcG9seWZpbGxzJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcblx0cGx1Z2luczogW1xuXHRcdHJlbWl4RGV2VG9vbHMoKSxcblx0XHRyZW1peCgpLFxuXHRcdC8vIHtcblx0XHQvLyBpZ25vcmVkUm91dGVGaWxlczogWycqKi8uKiddLFxuXHRcdC8vIHNlcnZlck1vZHVsZUZvcm1hdDogJ2VzbScsXG5cdFx0Ly8gfVxuXHRcdHRzY29uZmlnUGF0aHMoKSxcblx0XHQvLyBub2RlUG9seWZpbGxzKCksXG5cdFx0Y2pzSW50ZXJvcCh7XG5cdFx0XHRkZXBlbmRlbmNpZXM6IFtcblx0XHRcdFx0J3JlYWN0LWxhenktbG9hZC1pbWFnZS1jb21wb25lbnQnLFxuXHRcdFx0XHQvLyAtLSBQYXJzZSAtLVxuXHRcdFx0XHQvLyAncGFyc2UnLFxuXHRcdFx0XHQvLyAncGFyc2Uvbm9kZScsXG5cdFx0XHRdLFxuXHRcdH0pLFxuXHRcdC8vIGNvbW1vbmpzKHtcblx0XHQvLyBcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBwcmVmZXItYXJyb3cvcHJlZmVyLWFycm93LWZ1bmN0aW9uc1xuXHRcdC8vIFx0ZmlsdGVyKGlkKSB7XG5cdFx0Ly8gXHRcdC8vIGBub2RlX21vZHVsZXNgIGlzIGV4Y2x1ZGUgYnkgZGVmYXVsdCwgc28gd2UgbmVlZCB0byBpbmNsdWRlIGl0IGV4cGxpY2l0bHlcblx0XHQvLyBcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL3ZpdGUtcGx1Z2luL3ZpdGUtcGx1Z2luLWNvbW1vbmpzL2Jsb2IvdjAuNy4wL3NyYy9pbmRleC50cyNMMTI1LUwxMjdcblx0XHQvLyBcdFx0aWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMvcGFyc2UnKSkge1xuXHRcdC8vIFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdC8vIFx0XHR9XG5cblx0XHQvLyBcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdC8vIFx0fSxcblx0XHQvLyB9KSxcblx0XSxcblx0c2VydmVyOiB7XG5cdFx0cG9ydDogNjE4MSxcblx0fSxcblx0Ly8gYnVpbGQ6IHtcblx0Ly8gXHRzb3VyY2VtYXA6IHRydWUsXG5cdC8vIFx0Y29tbW9uanNPcHRpb25zOiB7XG5cdC8vIFx0XHR0cmFuc2Zvcm1NaXhlZEVzTW9kdWxlczogdHJ1ZSxcblx0Ly8gXHRcdC8vIGRlZmF1bHRJc01vZHVsZUV4cG9ydHM6IHRydWUsXG5cdC8vIFx0fSxcblx0Ly8gfSxcblx0Ly8gcmVzb2x2ZToge1xuXHQvLyBcdGFsaWFzOiB7XG5cdC8vIFx0XHQncGFyc2Uvbm9kZSc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL25vZGVfbW9kdWxlcy9wYXJzZS9wYXJzZS5taW4uanMnKSxcblx0Ly8gXHRcdHBhcnNlOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi9ub2RlX21vZHVsZXMvcGFyc2UvZGlzdC9wYXJzZS5taW4uanMnKSxcblx0Ly8gXHR9LFxuXHQvLyB9LFxuXHQvLyBzc3I6IHtcblx0Ly8gXHRleHRlcm5hbDogWydwYXJzZScsICdwYXJzZS9ub2RlJ10sXG5cdC8vIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFHQSxTQUFTLHVCQUF1QixhQUFhO0FBQzdDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsa0JBQWtCO0FBQzNCLE9BQU8sbUJBQW1CO0FBSzFCLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzNCLFNBQVM7QUFBQSxJQUNSLGNBQWM7QUFBQSxJQUNkLE1BQU07QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBS04sY0FBYztBQUFBO0FBQUEsSUFFZCxXQUFXO0FBQUEsTUFDVixjQUFjO0FBQUEsUUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BSUQ7QUFBQSxJQUNELENBQUM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFhRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ1AsTUFBTTtBQUFBLEVBQ1A7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQWlCRCxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
