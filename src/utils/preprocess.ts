/**
 * Parse a cell reference (e.g., "A1") into row and column indices
 * @param cellRef - Cell reference in A1 notation
 * @returns Object with row and col indices (0-based)
 */
export function parseCellReference(cellRef: string): {
  row: number;
  col: number;
} {
  const match = cellRef.match(/([A-Z]+)([0-9]+)/);
  if (!match) {
    throw new Error(`Invalid cell reference: ${cellRef}`);
  }

  const colRef = match[1];
  const rowRef = parseInt(match[2], 10);

  // Convert column letter to number (A=0, B=1, etc.)
  let colNum = 0;
  for (let i = 0; i < colRef.length; i++) {
    colNum = colNum * 26 + colRef.charCodeAt(i) - 64;
  }

  // Return 0-based indices
  return { row: rowRef - 1, col: colNum - 1 };
}

/**
 * Parse a range reference (e.g., "A1:C10") into start and end coordinates
 * @param rangeRef - Range reference in A1 notation
 * @returns Object with start and end coordinates
 */
export function parseRangeReference(rangeRef: string): {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
} {
  const [startRef, endRef] = rangeRef.split(":");
  if (!startRef || !endRef) {
    throw new Error(`Invalid range reference: ${rangeRef}`);
  }

  const start = parseCellReference(startRef);
  const end = parseCellReference(endRef);

  return {
    startRow: start.row,
    startCol: start.col,
    endRow: end.row,
    endCol: end.col,
  };
}

/**
 * Extract data from a specific range in a sheet
 * @param data - Full sheet data
 * @param range - Range in A1 notation (e.g., "A1:C10")
 * @returns Extracted data from the specified range
 */
export function extractRangeFromData(data: any[][], range: string): any[][] {
  if (!data || !data.length) {
    return [[""]];
  }

  const { startRow, startCol, endRow, endCol } = parseRangeReference(range);

  // Extract the range
  const result: any[][] = [];
  for (let r = startRow; r <= endRow; r++) {
    if (r >= data.length) break;

    const row: any[] = [];
    for (let c = startCol; c <= endCol; c++) {
      if (!data[r] || c >= data[r].length) {
        row.push("");
      } else {
        row.push(data[r][c]);
      }
    }
    result.push(row);
  }

  return result;
}

/**
 * Extract data from a specific column
 * @param data - Full sheet data
 * @param colRef - Column reference (e.g., "A")
 * @returns Column data as an array
 */
export function extractColumnData(data: any[][], colRef: string): any[] {
  if (!data || !data.length) {
    return [""];
  }

  // Convert column letter to index
  let colNum = 0;
  for (let i = 0; i < colRef.length; i++) {
    colNum = colNum * 26 + colRef.charCodeAt(i) - 64;
  }
  const colIndex = colNum - 1;

  // Extract the column data
  return data.map((row) => row[colIndex] || "");
}

/**
 * Extract data from a specific row
 * @param data - Full sheet data
 * @param rowNum - Row number (1-based)
 * @returns Row data as an array
 */
export function extractRowData(data: any[][], rowNum: number): any[] {
  if (!data || !data.length) {
    return [""];
  }

  const rowIndex = rowNum - 1;
  if (rowIndex < 0 || rowIndex >= data.length) {
    return [""];
  }

  return data[rowIndex] || [""];
}

/**
 * Extract a table by looking for headers and data
 * @param data - Full sheet data
 * @param startCell - Top-left cell of the table in A1 notation
 * @param hasHeaders - Whether the table has headers
 * @returns Table data including headers
 */
export function extractTableData(
  data: any[][],
  startCell: string,
  hasHeaders: boolean = true
): { headers: string[]; data: any[][] } {
  if (!data || !data.length) {
    return { headers: [], data: [[""]] };
  }

  const start = parseCellReference(startCell);

  // Detect table boundaries by looking for empty cells
  let endRow = start.row;
  let endCol = start.col;

  // Find end row
  for (let r = start.row; r < data.length; r++) {
    if (!data[r] || !data[r][start.col] || data[r][start.col] === "") {
      break;
    }
    endRow = r;
  }

  // Find end column
  if (data[start.row]) {
    for (let c = start.col; c < (data[start.row].length || 0); c++) {
      if (!data[start.row][c] || data[start.row][c] === "") {
        break;
      }
      endCol = c;
    }
  }

  // Extract headers and data
  const tableData: any[][] = [];
  let headers: string[] = [];

  if (hasHeaders) {
    // Extract headers
    headers = data[start.row]?.slice(start.col, endCol + 1) || [];

    // Extract data rows (skip header)
    for (let r = start.row + 1; r <= endRow; r++) {
      if (data[r]) {
        tableData.push(data[r].slice(start.col, endCol + 1));
      }
    }
  } else {
    // No headers, generate default ones (A, B, C...)
    headers = Array.from({ length: endCol - start.col + 1 }, (_, i) =>
      String.fromCharCode(65 + i)
    );

    // Extract all rows
    for (let r = start.row; r <= endRow; r++) {
      if (data[r]) {
        tableData.push(data[r].slice(start.col, endCol + 1));
      }
    }
  }

  return { headers, data: tableData };
}

/**
 * Get minimal data structure for initial analysis request
 * Returns column headers and a sample of the data
 * @param data - Full sheet data
 * @returns Minimal data structure with headers and sample rows
 */
export function getMinimalSheetStructure(data: any[][]): any[][] {
  if (!data || !data.length) {
    return [[""]];
  }

  // Get headers (first row) and a few sample rows (max 5)
  const headers = data[0] || [];
  const sampleRows = data.slice(1, Math.min(data.length, 6));

  return [headers, ...sampleRows];
}

/**
 * Get data ranges that match a search term
 * @param data - Full sheet data
 * @param searchTerm - Term to search for
 * @returns Array of ranges in A1 notation that contain the search term
 */
export function findDataRanges(data: any[][], searchTerm: string): string[] {
  if (!data || !data.length) {
    return [];
  }

  const ranges: string[] = [];

  // Convert search term to lowercase for case-insensitive comparison
  const term = searchTerm.toString().toLowerCase();

  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < (data[r]?.length || 0); c++) {
      const cellValue = data[r][c];
      if (cellValue && cellValue.toString().toLowerCase().includes(term)) {
        const colLetter = String.fromCharCode(65 + c);
        ranges.push(`${colLetter}${r + 1}`);
      }
    }
  }

  return ranges;
}

/**
 * Identify the structure of the spreadsheet data
 * @param data - Full sheet data
 * @returns Object describing the data structure
 */
export function analyzeDataStructure(data: any[][]): {
  rowCount: number;
  colCount: number;
  hasHeaders: boolean;
  tables: { range: string; headers: string[] }[];
  columns: { label: string; index: number }[];
} {
  if (!data || !data.length) {
    return {
      rowCount: 0,
      colCount: 0,
      hasHeaders: false,
      tables: [],
      columns: [],
    };
  }

  const rowCount = data.length;
  const colCount = Math.max(...data.map((row) => row.length || 0));

  // Try to detect if first row contains headers
  const hasHeaders =
    data.length > 1 &&
    data[0].some((cell) => typeof cell === "string" && cell !== "");

  // Extract column information
  const columns = hasHeaders
    ? data[0].map((header, idx) => ({
        label: header?.toString() || String.fromCharCode(65 + idx),
        index: idx,
      }))
    : Array.from({ length: colCount }, (_, idx) => ({
        label: String.fromCharCode(65 + idx),
        index: idx,
      }));

  // Try to detect tables (continuous non-empty data)
  const tables: { range: string; headers: string[] }[] = [];
  let inTable = false;
  let tableStart = { row: 0, col: 0 };

  for (let r = hasHeaders ? 1 : 0; r < data.length; r++) {
    if (!inTable && data[r]?.some((cell) => cell !== "")) {
      inTable = true;
      tableStart = { row: r, col: 0 };
    } else if (inTable && !data[r]?.some((cell) => cell !== "")) {
      // End of table
      const endRow = r - 1;
      const colLetter = String.fromCharCode(65 + tableStart.col);
      const startCell = `${colLetter}${tableStart.row + 1}`;
      const endColLetter = String.fromCharCode(65 + colCount - 1);
      const endCell = `${endColLetter}${endRow + 1}`;

      const tableHeaders = hasHeaders
        ? data[0].slice(tableStart.col, colCount)
        : Array.from({ length: colCount }, (_, i) =>
            String.fromCharCode(65 + i)
          );

      tables.push({
        range: `${startCell}:${endCell}`,
        headers: tableHeaders,
      });

      inTable = false;
    }
  }

  // Check if we ended while still in a table
  if (inTable) {
    const endRow = data.length - 1;
    const colLetter = String.fromCharCode(65 + tableStart.col);
    const startCell = `${colLetter}${tableStart.row + 1}`;
    const endColLetter = String.fromCharCode(65 + colCount - 1);
    const endCell = `${endColLetter}${endRow + 1}`;

    const tableHeaders = hasHeaders
      ? data[0].slice(tableStart.col, colCount)
      : Array.from({ length: colCount }, (_, i) => String.fromCharCode(65 + i));

    tables.push({
      range: `${startCell}:${endCell}`,
      headers: tableHeaders,
    });
  }

  return {
    rowCount,
    colCount,
    hasHeaders,
    tables,
    columns,
  };
}

type DataRegion = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  type: "table" | "list" | "scattered";
  hasHeaders: boolean;
  headers?: string[];
  rowCount: number;
  colCount: number;
  density: number;
};

/**
 * Get comprehensive metadata about the spreadsheet structure and data occupancy
 * @param data - Full sheet data
 * @returns Object containing detailed metadata about the spreadsheet
 */
export function getSpreadsheetMetadata(data: any[][]): {
  dimensions: {
    rowCount: number;
    colCount: number;
    usedRowCount: number;
    usedColCount: number;
  };
  dataRegions: DataRegion[];
  columnStats: {
    index: number;
    label: string;
    nonEmptyCount: number;
    dataTypes: Record<string, number>;
    sampleValues: any[];
  }[];
  rowStats: {
    index: number;
    nonEmptyCount: number;
    dataTypes: Record<string, number>;
  }[];
  overallStats: {
    totalCells: number;
    nonEmptyCells: number;
    dataDensity: number;
    dataTypes: Record<string, number>;
  };
} {
  if (!data || !data.length) {
    return {
      dimensions: {
        rowCount: 0,
        colCount: 0,
        usedRowCount: 0,
        usedColCount: 0,
      },
      dataRegions: [],
      columnStats: [],
      rowStats: [],
      overallStats: {
        totalCells: 0,
        nonEmptyCells: 0,
        dataDensity: 0,
        dataTypes: {},
      },
    };
  }

  // Get base structure analysis
  const baseAnalysis = analyzeDataStructure(data);

  // Helper function to determine data type
  const getDataType = (value: any): string => {
    if (value === null || value === undefined || value === "") return "empty";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (value instanceof Date) return "date";
    if (typeof value === "string") {
      // Check for date strings
      if (!isNaN(Date.parse(value))) return "date";
      // Check for number strings
      if (!isNaN(Number(value))) return "number";
      return "string";
    }
    return "other";
  };

  // Calculate dimensions
  const rowCount = baseAnalysis.rowCount;
  const colCount = baseAnalysis.colCount;

  // Find used dimensions
  let usedRowCount = 0;
  let usedColCount = 0;
  const rowHasData = new Array(rowCount).fill(false);
  const colHasData = new Array(colCount).fill(false);

  // Initialize statistics objects
  const columnStats = Array.from({ length: colCount }, (_, i) => ({
    index: i,
    label: baseAnalysis.columns[i]?.label || String.fromCharCode(65 + i),
    nonEmptyCount: 0,
    dataTypes: {} as Record<string, number>,
    sampleValues: [] as any[],
  }));
  const rowStats = Array.from({ length: rowCount }, (_, i) => ({
    index: i,
    nonEmptyCount: 0,
    dataTypes: {} as Record<string, number>,
  }));
  const overallStats = {
    totalCells: rowCount * colCount,
    nonEmptyCells: 0,
    dataDensity: 0,
    dataTypes: {} as Record<string, number>,
  };

  // First pass: collect basic statistics
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const value = data[r]?.[c];
      if (value !== null && value !== undefined && value !== "") {
        const dataType = getDataType(value);

        // Update column stats
        columnStats[c].nonEmptyCount++;
        columnStats[c].dataTypes[dataType] =
          (columnStats[c].dataTypes[dataType] || 0) + 1;
        if (columnStats[c].sampleValues.length < 3) {
          columnStats[c].sampleValues.push(value);
        }

        // Update row stats
        rowStats[r].nonEmptyCount++;
        rowStats[r].dataTypes[dataType] =
          (rowStats[r].dataTypes[dataType] || 0) + 1;

        // Update overall stats
        overallStats.nonEmptyCells++;
        overallStats.dataTypes[dataType] =
          (overallStats.dataTypes[dataType] || 0) + 1;

        // Mark rows and columns as used
        rowHasData[r] = true;
        colHasData[c] = true;
      }
    }
  }

  // Calculate used dimensions
  usedRowCount = rowHasData.filter(Boolean).length;
  usedColCount = colHasData.filter(Boolean).length;
  overallStats.dataDensity =
    (overallStats.nonEmptyCells / overallStats.totalCells) * 100;

  // Convert base analysis tables into data regions
  const dataRegions: DataRegion[] = baseAnalysis.tables.map((table) => {
    const { startRow, startCol, endRow, endCol } = parseRangeReference(
      table.range
    );
    const regionRowCount = endRow - startRow + 1;
    const regionColCount = endCol - startCol + 1;

    // Calculate density for this region
    let nonEmptyCells = 0;
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (
          data[r]?.[c] !== null &&
          data[r]?.[c] !== undefined &&
          data[r]?.[c] !== ""
        ) {
          nonEmptyCells++;
        }
      }
    }
    const density = (nonEmptyCells / (regionRowCount * regionColCount)) * 100;

    return {
      startRow,
      startCol,
      endRow,
      endCol,
      type: "table",
      hasHeaders: baseAnalysis.hasHeaders,
      headers: table.headers,
      rowCount: regionRowCount,
      colCount: regionColCount,
      density,
    };
  });

  // Add any remaining data regions that weren't identified as tables
  const processedCells = new Set<string>();
  dataRegions.forEach((region) => {
    for (let r = region.startRow; r <= region.endRow; r++) {
      for (let c = region.startCol; c <= region.endCol; c++) {
        processedCells.add(`${r},${c}`);
      }
    }
  });

  // Look for unprocessed data regions
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      if (
        !processedCells.has(`${r},${c}`) &&
        data[r]?.[c] !== null &&
        data[r]?.[c] !== undefined &&
        data[r]?.[c] !== ""
      ) {
        // Start of a new region
        let endRow = r;
        let endCol = c;
        let nonEmptyCells = 1;

        // Extend region
        while (
          endRow + 1 < rowCount &&
          data[endRow + 1]?.[c] !== null &&
          data[endRow + 1]?.[c] !== undefined &&
          data[endRow + 1]?.[c] !== ""
        ) {
          endRow++;
          nonEmptyCells++;
        }
        while (
          endCol + 1 < colCount &&
          data[r]?.[endCol + 1] !== null &&
          data[r]?.[endCol + 1] !== undefined &&
          data[r]?.[endCol + 1] !== ""
        ) {
          endCol++;
          nonEmptyCells++;
        }

        // Mark cells as processed
        for (let rr = r; rr <= endRow; rr++) {
          for (let cc = c; cc <= endCol; cc++) {
            processedCells.add(`${rr},${cc}`);
          }
        }

        const regionRowCount = endRow - r + 1;
        const regionColCount = endCol - c + 1;
        const density =
          (nonEmptyCells / (regionRowCount * regionColCount)) * 100;

        // Determine region type
        let regionType: "table" | "list" | "scattered";
        if (regionRowCount > 1 && regionColCount > 1) {
          regionType = "table";
        } else if (regionRowCount > 1) {
          regionType = "list";
        } else {
          regionType = "scattered";
        }

        dataRegions.push({
          startRow: r,
          startCol: c,
          endRow,
          endCol,
          type: regionType,
          hasHeaders: false,
          rowCount: regionRowCount,
          colCount: regionColCount,
          density,
        });
      }
    }
  }

  return {
    dimensions: {
      rowCount,
      colCount,
      usedRowCount,
      usedColCount,
    },
    dataRegions,
    columnStats,
    rowStats,
    overallStats,
  };
}
