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

// Add a function to add a new sheet to HyperFormula
const addSheetToHyperFormula = (sheetName: string, data?: any[][]) => {
  const sheetId = hyperformulaInstance.addSheet(sheetName);
  
  if (data && data.length > 0) {
    // Set the data for the new sheet
    hyperformulaInstance.setSheetContent(Number(sheetId), data);
  }
  
  return sheetId;
};

// Function to switch active sheet in HyperFormula
const setActiveHyperFormulaSheet = (sheetId: number) => {
  // HyperFormula doesn't have a concept of "active sheet" for calculations,
  // but we can use this for tracking purposes
  return sheetId;
};

// Function to update sheet data in HyperFormula
const updateHyperFormulaSheetData = (sheetId: number, data: any[][]) => {
  hyperformulaInstance.setSheetContent(Number(sheetId), data);
};

// Function to get sheet ID by name
const getSheetIdByName = (sheetName: string): number => {
  const sheetNames = hyperformulaInstance.getSheetNames();
  const sheetIndex = sheetNames.indexOf(sheetName);
  return sheetIndex >= 0 ? sheetIndex : 0; // Return 0 (first sheet) if not found
};

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
};
