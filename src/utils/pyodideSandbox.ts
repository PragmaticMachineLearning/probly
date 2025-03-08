import { PackageData, PyodideInterface } from '@/types/pyodide';

interface SandboxResult {
  stdout: string;
  stderr: string;
  result: any;
}

export class PyodideSandbox {
  private pyodide: PyodideInterface | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      if (typeof window !== 'undefined') {
        // Browser environment - use window.loadPyodide
        // @ts-ignore - loadPyodide is loaded from a script tag
        this.pyodide = await window.loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.2/full/'
        });
      } else {
        // Server environment - use the installed pyodide package
        const { loadPyodide } = await import('pyodide');
        this.pyodide = await loadPyodide();
      }
      
      if (!this.pyodide) {
        throw new Error('Failed to initialize Pyodide');
      }
      
      // Initialize Python environment with common data science packages
      await this.pyodide.loadPackagesFromImports(`
        import pandas as pd
        import numpy as np
        import matplotlib.pyplot as plt
        import io
        import base64
      `);
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Pyodide:', error);
      throw error;
    }
  }

  async runDataAnalysis(
    code: string, 
    csvData: string, 
    timeout: number = 5000
  ): Promise<SandboxResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }

    const stdout: string[] = [];
    const stderr: string[] = [];

    this.pyodide.setStdout({ batched: (s: string) => stdout.push(s) });
    this.pyodide.setStderr({ batched: (s: string) => stderr.push(s) });

    try {
      // First, set up the data
      const setupCode = `
import io
import pandas as pd
import numpy as np

# Read the input data
df = pd.read_csv(io.StringIO('''${csvData}'''))
`;
      await this.pyodide.runPython(setupCode);

      // Then run the analysis code
      const result = await Promise.race([
        this.pyodide.runPythonAsync(code),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Analysis timeout')), timeout)
        )
      ]);

      return {
        stdout: stdout.join(''),
        stderr: stderr.join(''),
        result
      };
    } catch (error) {
      return {
        stdout: stdout.join(''),
        stderr: `Error in data analysis: ${(error as Error).message}`,
        result: null
      };
    }
  }

  async destroy(): Promise<void> {
    if (this.pyodide) {
      try {
        // Simple cleanup - just delete our main DataFrame
        await this.pyodide.runPython(`
if 'df' in globals():
    del df
`);
      } catch (error) {
        console.warn('Error during cleanup:', error);
      }
    }
    this.pyodide = null;
    this.initialized = false;
  }
}