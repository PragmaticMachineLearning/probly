/**
 * Utilities for managing large spreadsheet data within LLM context windows
 */

// Maximum number of cells to include in full context
const MAX_CELLS_FULL_CONTEXT = 500;
// Maximum number of rows to include in a sample
const MAX_SAMPLE_ROWS = 10;
// Maximum number of columns to include in a sample
const MAX_SAMPLE_COLS = 10;

interface SpreadsheetStats {
  rowCount: number;
  colCount: number;
  nonEmptyCellCount: number;
  dataTypes: Record<string, string[]>;
  columnNames?: string[];
  hasHeaders: boolean;
}

/**
 * Determines if a spreadsheet is too large for full context inclusion
 */
export function isSpreadsheetTooLarge(data: any[][]): boolean {
  if (!data || !Array.isArray(data)) return false;
  
  // Count non-empty cells
  let nonEmptyCellCount = 0;
  const rowCount = data.length;
  let maxColCount = 0;
  
  for (const row of data) {
    maxColCount = Math.max(maxColCount, row.length);
    for (const cell of row) {
      if (cell !== null && cell !== undefined && cell !== "") {
        nonEmptyCellCount++;
      }
    }
  }
  
  return nonEmptyCellCount > MAX_CELLS_FULL_CONTEXT;
}

/**
 * Infers if the first row contains headers
 */
function inferHeaders(data: any[][]): boolean {
  if (!data || data.length < 2) return false;
  
  const firstRow = data[0];
  const secondRow = data[1];
  
  // Check if first row has different types than second row
  let differentTypes = 0;
  let stringCount = 0;
  
  for (let i = 0; i < Math.min(firstRow.length, secondRow.length); i++) {
    if (typeof firstRow[i] === 'string' && firstRow[i] !== '') {
      stringCount++;
    }
    
    if (typeof firstRow[i] !== typeof secondRow[i]) {
      differentTypes++;
    }
  }
  
  // If most cells in first row are strings and types differ from second row
  return stringCount > firstRow.length * 0.7 || differentTypes > firstRow.length * 0.5;
}

/**
 * Analyzes spreadsheet to extract statistics and structure information
 */
export function analyzeSpreadsheet(data: any[][]): SpreadsheetStats {
  if (!data || !Array.isArray(data)) {
    return {
      rowCount: 0,
      colCount: 0,
      nonEmptyCellCount: 0,
      dataTypes: {},
      hasHeaders: false
    };
  }
  
  const rowCount = data.length;
  let maxColCount = 0;
  let nonEmptyCellCount = 0;
  const dataTypes: Record<string, string[]> = {};
  
  // Determine if first row likely contains headers
  const hasHeaders = inferHeaders(data);
  
  // Extract column names if headers exist
  const columnNames = hasHeaders ? data[0].map(header => 
    header !== null && header !== undefined ? String(header) : '') : undefined;
  
  // Analyze each column
  for (let col = 0; col < 100; col++) { // Limit to 100 columns for performance
    dataTypes[col] = [];
    let hasColumn = false;
    
    for (let row = hasHeaders ? 1 : 0; row < data.length; row++) {
      if (data[row] && col < data[row].length) {
        hasColumn = true;
        maxColCount = Math.max(maxColCount, col + 1);
        
        const cell = data[row][col];
        if (cell !== null && cell !== undefined && cell !== "") {
          nonEmptyCellCount++;
          
          // Track data type
          const type = typeof cell;
          if (!dataTypes[col].includes(type)) {
            dataTypes[col].push(type);
          }
        }
      }
    }
    
    // Stop if we've gone past the end of all rows
    if (!hasColumn) break;
  }
  
  return {
    rowCount,
    colCount: maxColCount,
    nonEmptyCellCount,
    dataTypes,
    columnNames,
    hasHeaders
  };
}

/**
 * Extracts a representative sample from the spreadsheet
 */
export function sampleSpreadsheet(data: any[][]): any[][] {
  if (!data || !Array.isArray(data) || data.length === 0) return [[]];
  
  const hasHeaders = inferHeaders(data);
  const rowCount = data.length;
  let maxColCount = 0;
  
  // Find max column count
  for (const row of data) {
    maxColCount = Math.max(maxColCount, row.length);
  }
  
  // Limit columns
  const colCount = Math.min(maxColCount, MAX_SAMPLE_COLS);
  
  // Create sample with headers if present
  const sample: any[][] = [];
  
  // Always include headers if they exist
  if (hasHeaders) {
    sample.push(data[0].slice(0, colCount));
  }
  
  // Calculate how many rows to sample
  const dataRowCount = hasHeaders ? rowCount - 1 : rowCount;
  const sampleRowCount = Math.min(dataRowCount, MAX_SAMPLE_ROWS);
  
  if (sampleRowCount <= 3) {
    // If very few rows, include all
    for (let i = hasHeaders ? 1 : 0; i < rowCount; i++) {
      sample.push(data[i].slice(0, colCount));
    }
  } else {
    // Include first 2 rows
    for (let i = hasHeaders ? 1 : 0; i < Math.min(hasHeaders ? 3 : 2, rowCount); i++) {
      sample.push(data[i].slice(0, colCount));
    }
    
    // Include evenly spaced middle rows
    if (dataRowCount > 5) {
      const step = Math.floor(dataRowCount / (sampleRowCount - 4));
      for (let i = 0; i < Math.min(sampleRowCount - 4, dataRowCount - 4); i++) {
        const rowIndex = (hasHeaders ? 1 : 0) + 2 + (i * step);
        if (rowIndex < rowCount) {
          sample.push(data[rowIndex].slice(0, colCount));
        }
      }
    }
    
    // Include last 2 rows
    for (let i = Math.max(hasHeaders ? 1 : 0, rowCount - 2); i < rowCount; i++) {
      sample.push(data[i].slice(0, colCount));
    }
  }
  
  return sample;
}

/**
 * Creates a compact representation of spreadsheet data for LLM context
 */
export function createSpreadsheetContext(data: any[][]): string {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return "Empty spreadsheet";
  }
  
  // Check if spreadsheet is too large for full context
  if (isSpreadsheetTooLarge(data)) {
    // Get statistics and sample
    const stats = analyzeSpreadsheet(data);
    const sample = sampleSpreadsheet(data);
    
    // Format column information
    let columnInfo = '';
    if (stats.hasHeaders && stats.columnNames) {
      columnInfo = 'Column headers: ' + stats.columnNames.map((name, index) => 
        `${index+1}:${name}`).join(', ') + '\n\n';
    } else {
      // Create summary of column data types
      columnInfo = 'Column data types:\n';
      Object.entries(stats.dataTypes).forEach(([col, types]) => {
        if (types.length > 0) {
          columnInfo += `Column ${parseInt(col)+1}: ${types.join('/')}\n`;
        }
      });
      columnInfo += '\n';
    }
    
    // Create summary text
    const summary = `LARGE SPREADSHEET SUMMARY:
Total rows: ${stats.rowCount}
Total columns: ${stats.colCount}
Non-empty cells: ${stats.nonEmptyCellCount}
${stats.hasHeaders ? 'First row contains headers' : 'No headers detected'}

${columnInfo}
REPRESENTATIVE SAMPLE (${sample.length} rows x ${sample[0]?.length || 0} columns):
`;
    
    // Format sample as CSV
    const sampleText = sample.map(row => 
      row.map(cell => 
        cell === null || cell === undefined ? '' : 
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : String(cell)
      ).join(',')
    ).join('\n');
    
    return summary + sampleText;
  } else {
    // For smaller spreadsheets, use the existing formatting function
    return "SPREADSHEET DATA:\n" + data.map(row => 
      row.map(cell => 
        cell === null || cell === undefined ? '' : 
        typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : String(cell)
      ).join(',')
    ).join('\n');
  }
} 