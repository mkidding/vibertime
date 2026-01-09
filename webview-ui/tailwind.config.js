/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                vscode: {
                    bg: 'var(--vscode-editor-background)',
                    fg: 'var(--vscode-editor-foreground)',
                }
            }
        },
    },
    plugins: [],
}
