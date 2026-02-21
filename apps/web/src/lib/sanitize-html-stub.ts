/**
 * Browser stub for sanitize-html.
 *
 * sanitize-html depends on Node.js built-ins (path, fs, postcss) and cannot
 * run in the browser. This stub satisfies the import so Vite can bundle
 * @qoomb/validators from source. The real sanitizeHtml function is only ever
 * called server-side (in tRPC procedures); it is never invoked in client code.
 */
const sanitizeHtml = (input: string): string => input;
export default sanitizeHtml;
