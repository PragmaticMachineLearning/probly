export interface PackageData {
  name: string;
  version: string;
}

export interface PyodideInterface {
  loadPackagesFromImports(code: string): Promise<PackageData[]>;
  runPython(code: string): any;
  runPythonAsync(code: string): Promise<any>;
  setStdout(options: { batched: (s: string) => void }): void;
  setStderr(options: { batched: (s: string) => void }): void;
  globals: any;
}

declare global {
  interface Window {
    loadPyodide(options?: { indexURL?: string }): Promise<PyodideInterface>;
  }
  
  // Make loadPyodide available globally in browser environments
  const loadPyodide: (options?: { indexURL?: string }) => Promise<PyodideInterface>;
}

