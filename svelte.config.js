import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: [
        vitePreprocess(),
    ],
    onwarn: (warning, handler) => {
        if (warning.code === 'css_unused_selector') {
            return;
        }
        if (warning.code && warning.code.startsWith('a11y_')) {
            return;
        }
        handler(warning);
    },
    kit: {},
};

export default config;
