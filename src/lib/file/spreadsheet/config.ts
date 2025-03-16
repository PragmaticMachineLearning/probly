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
    afterChange: (changes: any) => {}
  };
};

/**
 * Generate a sheet name based on existing sheets
 * @param existingNames Array of existing sheet names
 * @returns A new unique sheet name
 */
const generateSheetName = (existingNames: string[]): string => {
  // Find the highest sheet number by extracting numbers from sheet names
  let highestNumber = 0;
  
  existingNames.forEach(name => {
    // Match "Sheet X" pattern where X is a number
    const match = name.match(/^Sheet\s+(\d+)$/);
    if (match && match[1]) {
      const sheetNumber = parseInt(match[1], 10);
      if (!isNaN(sheetNumber) && sheetNumber > highestNumber) {
        highestNumber = sheetNumber;
      }
    }
  });
  
  // Use the next number after the highest existing number
  const nextNumber = highestNumber + 1;
  return `Sheet ${nextNumber}`;
};

/**
 * Add a new sheet to HyperFormula
 * @param sheetName Optional name for the new sheet. If not provided, a name will be generated.
 * @param data Optional initial data for the sheet
 * @param existingSheetNames Optional array of existing sheet names to avoid duplicates
 * @returns An object containing the hyperFormulaId and the sheet name
 */
const addSheetToHyperFormula = (
  sheetName?: string, 
  data: any[][] = [["", ""], ["", ""]], 
  existingSheetNames?: string[]
): { hyperFormulaId: number; sheetName: string } => {
  try {
    // Generate a sheet name if not provided
    const finalSheetName = sheetName || 
      (existingSheetNames ? generateSheetName(existingSheetNames) : 
      generateSheetName(hyperformulaInstance.getSheetNames()));
    
    let hyperFormulaId: number;
    
    // Check if we have a hidden first sheet we can reuse
    const sheetNames = hyperformulaInstance.getSheetNames();
    const firstSheetName = sheetNames[0];
    
    // If the first sheet name starts with "_Unused_", it means it was hidden (not actually removed)
    // and we can reuse it instead of adding a new one
    if (firstSheetName && firstSheetName.startsWith('_Unused_')) {
      // Reuse the first sheet by renaming it
      hyperformulaInstance.renameSheet(0, finalSheetName);
      hyperFormulaId = 0;
      
      // Clear any existing content
      hyperformulaInstance.clearSheet(0);
    } else {
      // Add a new sheet to HyperFormula
      const newSheetId = hyperformulaInstance.addSheet(finalSheetName);
      hyperFormulaId = Number(newSheetId);
      
      // Ensure it's a valid number
      if (isNaN(hyperFormulaId)) {
        console.error("Invalid hyperFormulaId after adding sheet:", newSheetId);
        const sheetId = hyperformulaInstance.getSheetId(finalSheetName);
        if (sheetId !== undefined) {
          hyperFormulaId = sheetId;
        } else {
          // Fallback to a default value if we can't get a valid ID
          console.error("Could not get valid sheet ID for new sheet, using fallback");
          hyperFormulaId = hyperformulaInstance.countSheets() - 1; // Use the current number of sheets minus 1 as a fallback
        }
      }
    }
    
    console.log(`Added new sheet: ${finalSheetName} with HyperFormula ID: ${hyperFormulaId}`);
    
    // Initialize with the provided data or empty data
    hyperformulaInstance.setSheetContent(hyperFormulaId, data);
    
    return { hyperFormulaId, sheetName: finalSheetName };
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
    // Validate the sheet ID
    const sheetNames = hyperformulaInstance.getSheetNames();
    if (sheetId < 0 || sheetId >= sheetNames.length) {
      console.error(`Invalid sheet ID: ${sheetId}. Using default sheet 0.`);
      return 0;
    }
    
    // HyperFormula doesn't have a direct "active sheet" concept
    // but we can use this for tracking purposes
    console.log(`Setting active sheet to ID: ${sheetId}, Name: ${sheetNames[sheetId]}`);
    return sheetId;
  } catch (error) {
    console.error("Error setting active sheet in HyperFormula:", error);
    return 0; // Return default sheet ID on error
  }
};

/**
 * Update the content of a sheet in HyperFormula
 * @param sheetId The ID of the sheet to update
 * @param data The new data for the sheet
 * @returns The changes made to the sheet or null on error
 */
const updateHyperFormulaSheetData = (sheetId: number, data: any[][]): any => {
  try {
    // Validate the sheet ID
    const sheetNames = hyperformulaInstance.getSheetNames();
    if (sheetId < 0 || sheetId >= sheetNames.length) {
      console.error(`Cannot update invalid sheet ID: ${sheetId}`);
      return null;
    }
    
    // Validate data
    if (!Array.isArray(data)) {
      console.error("Invalid data format: data must be an array");
      return null;
    }
    
    // Ensure data is at least a 2x2 grid
    const safeData = data.length > 0 ? data : [["", ""], ["", ""]];
    
    // Ensure all rows are arrays
    const normalizedData = safeData.map(row => 
      Array.isArray(row) ? row : [""]
    );
    
    console.log(`Updating sheet ID: ${sheetId}, Name: ${sheetNames[sheetId]} with data`, 
      normalizedData.length > 10 ? `(${normalizedData.length} rows)` : normalizedData);
    
    // Use HyperFormula's setSheetContent method
    const changes = hyperformulaInstance.setSheetContent(sheetId, normalizedData);
    
    return changes;
  } catch (error) {
    console.error("Error updating sheet data in HyperFormula:", error);
    return null;
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
 * @returns The changes made to the sheet or null on error
 */
const clearHyperFormulaSheet = (sheetId: number): any => {
  try {
    // Validate the sheet ID
    const sheetNames = hyperformulaInstance.getSheetNames();
    if (sheetId < 0 || sheetId >= sheetNames.length) {
      console.error(`Cannot clear invalid sheet ID: ${sheetId}`);
      return null;
    }
    
    console.log(`Clearing sheet ID: ${sheetId}, Name: ${sheetNames[sheetId]}`);
    
    // Use HyperFormula's clearSheet method
    const changes = hyperformulaInstance.clearSheet(sheetId);
    
    // Initialize with empty data to ensure it's properly cleared
    const emptyData = [["", ""], ["", ""]];
    hyperformulaInstance.setSheetContent(sheetId, emptyData);
    
    return changes;
  } catch (error) {
    console.error("Error clearing sheet in HyperFormula:", error);
    return null;
  }
};

/**
 * Rename a sheet in HyperFormula
 * @param sheetId The ID of the sheet to rename
 * @param newName The new name for the sheet
 * @param existingNames Optional array of existing sheet names to avoid duplicates
 * @returns The new name of the sheet or null on error
 */
const renameHyperFormulaSheet = (
  sheetId: number, 
  newName: string,
  existingNames?: string[]
): string | null => {
  try {
    // Validate the sheet ID
    const sheetNames = hyperformulaInstance.getSheetNames();
    if (sheetId < 0 || sheetId >= sheetNames.length) {
      console.error(`Cannot rename invalid sheet ID: ${sheetId}`);
      return null;
    }
    
    // Check if the new name already exists
    if (existingNames && existingNames.includes(newName)) {
      // If name exists, append a number to make it unique
      let counter = 1;
      let uniqueName = `${newName} (${counter})`;
      
      while (existingNames.includes(uniqueName)) {
        counter++;
        uniqueName = `${newName} (${counter})`;
      }
      
      newName = uniqueName;
    }
    
    console.log(`Renaming sheet ID: ${sheetId} from "${sheetNames[sheetId]}" to "${newName}"`);
    
    // Use HyperFormula's renameSheet method
    hyperformulaInstance.renameSheet(sheetId, newName);
    
    return newName;
  } catch (error) {
    console.error("Error renaming sheet in HyperFormula:", error);
    return null;
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
