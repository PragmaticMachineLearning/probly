import * as XLSX from "xlsx";

import { HyperFormula } from "hyperformula";

// Helper function to convert HyperFormula cell address to string format
const cellAddressToString = (address: any) => {
  if (typeof address !== "object" || address === null) {
    return null;
  }

  return XLSX.utils.encode_cell({
    r: address.row,
    c: address.col,
  });
};

// Create a persistent HyperFormula instance outside of the function scope
const hyperformulaInstance = HyperFormula.buildEmpty({
  licenseKey: "gpl-v3",
  // Enable multiple sheets support
  maxRows: 1000,
  maxColumns: 100,
  useColumnIndex: true,
});

// Initialize with a default sheet
if (hyperformulaInstance.getSheetNames().length === 0) {
  hyperformulaInstance.addSheet("Sheet 1");
}

const getInitialConfig = (data: any[][]) => {
  return {
    data,
    rowHeaders: true,
    colHeaders: true,
    width: "100%",
    height: "100%",
    licenseKey: "non-commercial-and-evaluation",
    formulas: {
      engine: hyperformulaInstance,
    },
    minRows: 50,
    minCols: 26,
    autoColumnSize: true,
    autoRowSize: true,
    manualColumnResize: true,
    manualRowResize: true,
    manualRowMove: true,
    colWidths: 150,
    contextMenu: true,
    comments: true,
    fillHandle: true,
    persistentState: true,
    headerTooltips: true,
    mergeCells: true,
    columnSorting: true,
    search: true,
    selectionMode: "multiple",
    cells(row: number, col: number) {
      const cellProperties: any = {};
      return cellProperties;
    },
    observeDomVisibility: true,
    observeChanges: true,
  };
};

/**
 * Add a new sheet to HyperFormula
 * @param sheetName The name of the new sheet
 * @param data Optional initial data for the sheet
 * @returns The ID of the newly created sheet
 */
const addSheetToHyperFormula = (sheetName: string, data?: any[][]): number => {
  try {
    // Use HyperFormula's addSheet method
    const sheetId = hyperformulaInstance.addSheet(sheetName);
    
    if (data && data.length > 0) {
      // Set the data for the new sheet
      hyperformulaInstance.setSheetContent(Number(sheetId), data);
    }
    
    return Number(sheetId);
  } catch (error) {
    console.error("Error adding sheet to HyperFormula:", error);
    throw error;
  }
};

/**
 * Set the active sheet in HyperFormula
 * @param sheetId The ID of the sheet to set as active
 * @returns The ID of the active sheet
 */
const setActiveHyperFormulaSheet = (sheetId: number): number => {
  try {
    // HyperFormula doesn't have a direct "active sheet" concept
    // but we can use this for tracking purposes
    return sheetId;
  } catch (error) {
    console.error("Error setting active sheet in HyperFormula:", error);
    throw error;
  }
};

/**
 * Update the content of a sheet in HyperFormula
 * @param sheetId The ID of the sheet to update
 * @param data The new data for the sheet
 * @returns The changes made to the sheet
 */
const updateHyperFormulaSheetData = (sheetId: number, data: any[][]): any => {
  try {
    // Use HyperFormula's setSheetContent method
    const changes = hyperformulaInstance.setSheetContent(sheetId, data);
    return changes;
  } catch (error) {
    console.error("Error updating sheet data in HyperFormula:", error);
    throw error;
  }
};

/**
 * Get the ID of a sheet by its name
 * @param sheetName The name of the sheet
 * @returns The ID of the sheet, or 0 if not found
 */
const getSheetIdByName = (sheetName: string): number => {
  try {
    const sheetNames = hyperformulaInstance.getSheetNames();
    const sheetIndex = sheetNames.indexOf(sheetName);
    return sheetIndex >= 0 ? sheetIndex : 0; // Return 0 (first sheet) if not found
  } catch (error) {
    console.error("Error getting sheet ID by name:", error);
    return 0;
  }
};

/**
 * Clear the content of a sheet in HyperFormula
 * @param sheetId The ID of the sheet to clear
 * @returns The changes made to the sheet
 */
const clearHyperFormulaSheet = (sheetId: number): any => {
  try {
    // Use HyperFormula's clearSheet method
    const changes = hyperformulaInstance.clearSheet(sheetId);
    return changes;
  } catch (error) {
    console.error("Error clearing sheet in HyperFormula:", error);
    throw error;
  }
};

/**
 * Rename a sheet in HyperFormula
 * @param sheetId The ID of the sheet to rename
 * @param newName The new name for the sheet
 * @returns void
 */
const renameHyperFormulaSheet = (sheetId: number, newName: string): void => {
  try {
    // Use HyperFormula's renameSheet method
    hyperformulaInstance.renameSheet(sheetId, newName);
  } catch (error) {
    console.error("Error renaming sheet in HyperFormula:", error);
    throw error;
  }
};

/**
 * Calculate the value of a cell using HyperFormula
 * @param formula The formula to calculate
 * @param cellRef The cell reference (e.g., "A1")
 * @param cellValues A map of cell values
 * @param sheetId The ID of the sheet containing the cell
 * @returns The calculated value
 */
const calculateCellValue = (
  formula: string,
  cellRef: string,
  cellValues: Map<string, any>,
  sheetId: number = 0
) => {
  try {
    if (formula.startsWith("=")) {
      const cellAddress = XLSX.utils.decode_cell(cellRef);

      // Retrieve the cell value from the map if exists
      const existingValue = cellValues.get(cellRef);
      if (existingValue) {
        // set up data in hyperformula if the value is already provided, rather than attempting to perform an evaluation
        hyperformulaInstance.setCellContents({
          col: cellAddress.c,
          row: cellAddress.r,
          sheet: sheetId
        }, existingValue);
      }

      // Calculate using HyperFormula
      const calculatedValue = hyperformulaInstance.getCellValue({
        col: cellAddress.c,
        row: cellAddress.r,
        sheet: sheetId
      });
      return calculatedValue;
    }
    return formula; // If it's not a formula, just return the string
  } catch (e) {
    console.error("Error calculating value:", e);
    return "#ERROR";
  }
};

export {
  calculateCellValue,
  hyperformulaInstance,
  getInitialConfig,
  cellAddressToString,
  addSheetToHyperFormula,
  setActiveHyperFormulaSheet,
  updateHyperFormulaSheetData,
  getSheetIdByName,
  clearHyperFormulaSheet,
  renameHyperFormulaSheet,
};
