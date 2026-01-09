export interface VsCodeApi {
    postMessage: (message: unknown) => void;
    getState: () => any;
    setState: (state: any) => void;
}

declare const acquireVsCodeApi: () => VsCodeApi;

class VSCodeWrapper {
    private static _instance: VsCodeApi;

    public static get instance(): VsCodeApi {
        if (!this._instance) {
            try {
                this._instance = acquireVsCodeApi();
            } catch {
                console.warn("VS Code API not available (dev mode)");
                this._instance = {
                    postMessage: (msg: unknown) => console.warn("VS Code Mock Post:", msg),
                    getState: () => ({}),
                    setState: () => { }
                };
            }
        }
        return this._instance;
    }
}

export const vscode = VSCodeWrapper.instance;
