import React, { createContext, useContext, useEffect, useState } from "react";
import {
  addSheetToHyperFormula,
  calculateCellValue,
  clearHyperFormulaSheet,
  hyperformulaInstance,
  renameHyperFormulaSheet,
  setActiveHyperFormulaSheet,
  updateHyperFormulaSheetData
} from "@/lib/file/spreadsheet/config";

import { CellUpdate } from "@/types/api";

// Define sheet interface
export interface Sheet {
  id: string;
  name: string;
  data: any[][];
  hyperFormulaId?: number; // Reference to HyperFormula sheet ID
}

interface SpreadsheetContextType {
  setFormula: (target: string, formula: string) => void;
  setFormulas: (updates: CellUpdate[]) => void;
  formulaQueue: Map<string, string>;
  clearFormula: (target: string) => void;
  setChartData: (chartData: any) => void;
  cellValues: Map<string, any>;
  setCellValues: (updates: Map<string, any>) => void;
  clearCellValues: (target: string) => void;
  // Sheet management properties
  sheets: Sheet[];
  activeSheetId: string;
  addSheet: () => void;
  removeSheet: (sheetId: string) => void;
  renameSheet: (sheetId: string, newName: string) => void;
  setActiveSheet: (sheetId: string) => void;
  clearSheet: (sheetId: string) => void;
  updateSheetData: (sheetId: string, data: any[][]) => void;
  getActiveSheetData: () => any[][];
  getActiveSheetName: () => string;
  getSheetByName: (name: string) => Sheet | undefined;
}

const SpreadsheetContext = createContext<SpreadsheetContextType | undefined>(
  undefined,
);

export const useSpreadsheet = () => {
  const context = useContext(SpreadsheetContext);
  if (!context) {
    throw new Error("useSpreadsheet must be used within a SpreadsheetProvider");
  }
  return context;
};

// Helper to generate unique IDs
const generateId = () => `sheet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Helper to generate default sheet names
const generateSheetName = (sheets: Sheet[]) => {
  // Extract all numeric sheet names (e.g., "Sheet 1", "Sheet 2")
  const existingNames = sheets.map(sheet => sheet.name);
  
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
  const newSheetName = `Sheet ${nextNumber}`;
  
  return newSheetName;
};

export const SpreadsheetProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [formulaQueue, setFormulaQueue] = useState<Map<string, string>>(
    new Map(),
  );
  const [cellValues, setCellValuesState] = useState<Map<string, any>>(
    new Map(),
  );
  const [evaluatedValues, setEvaluatedValues] = useState<Map<string, any>>(
    new Map(),
  );
  
  // Initialize with a default sheet
  const [sheets, setSheets] = useState<Sheet[]>(() => {
    // Create first sheet and register with HyperFormula
    const hyperFormulaId = 0; // First sheet in HyperFormula is 0
    const defaultSheet: Sheet = {
      id: generateId(),
      name: "Sheet 1",
      data: [["", ""], ["", ""]],
      hyperFormulaId
    };
    return [defaultSheet];
  });
  
  const [activeSheetId, setActiveSheetId] = useState<string>(() => sheets[0].id);

  useEffect(() => {
    const nextEvaluatedValues = new Map(evaluatedValues);
    formulaQueue.forEach((formula, target) => {
      // Get the active sheet's HyperFormula ID
      const activeSheet = sheets.find(sheet => sheet.id === activeSheetId);
      const hyperFormulaId = activeSheet?.hyperFormulaId || 0;
      
      const calculatedValue = calculateCellValue(formula, target, cellValues, hyperFormulaId);
      nextEvaluatedValues.set(target, calculatedValue);
    });
    setEvaluatedValues(nextEvaluatedValues);
  }, [formulaQueue, cellValues, activeSheetId, sheets]);

  const setFormula = (target: string, formula: string) => {
    setFormulaQueue((prev) => {
      const next = new Map(prev);
      next.set(target, formula);
      return next;
    });
  };

  const setFormulas = (updates: CellUpdate[]) => {
    setFormulaQueue((prev) => {
      const next = new Map(prev);
      updates.forEach(({ target, formula, sheetName }) => {
        // If sheetName is provided, we need to handle cross-sheet references
        if (sheetName) {
          // For now, we'll just set the formula as is
          // In a more advanced implementation, we would handle cross-sheet references
          next.set(target, formula);
        } else {
          next.set(target, formula);
        }
      });
      return next;
    });
  };

  const clearFormula = (target: string) => {
    setFormulaQueue((prev) => {
      const next = new Map(prev);
      next.delete(target);
      return next;
    });
  };

  const setChartData = (chartData: any) => {
    setFormulaQueue((prev) => {
      const next = new Map(prev);
      next.set("chart", JSON.stringify(chartData));
      return next;
    });
  };

  const setCellValues = (updates: Map<string, any>) => {
    setCellValuesState((prev) => {
      const next = new Map(prev);
      updates.forEach((value, key) => {
        next.set(key, value);
      });
      return next;
    });
  };

  const clearCellValues = (target: string) => {
    setCellValuesState((prev) => {
      const next = new Map(prev);
      next.delete(target);
      return next;
    });
  };

  // Sheet management functions
  const addSheet = () => {
    try {
      // Get existing sheet names for generating a unique name
      const existingSheetNames = sheets.map(sheet => sheet.name);
      
      // Use the enhanced addSheetToHyperFormula function from config.ts
      const { hyperFormulaId, sheetName } = addSheetToHyperFormula(
        undefined, // Let the function generate a name
        [["", ""], ["", ""]], // Empty data
        existingSheetNames
      );
      
      // Create a new sheet with the returned information
      const newSheet: Sheet = {
        id: generateId(),
        name: sheetName,
        data: [["", ""], ["", ""]],
        hyperFormulaId
      };
      
      // Update state
      setSheets(prev => [...prev, newSheet]);
      setActiveSheetId(newSheet.id);
    } catch (error) {
      console.error("Error adding sheet:", error);
    }
  };

  const removeSheet = (sheetId: string) => {
    // Don't allow removing the last sheet
    if (sheets.length <= 1) return;
    
    // Find the sheet to remove
    const sheetToRemove = sheets.find(sheet => sheet.id === sheetId);
    if (!sheetToRemove) return;
    
    try {
      // Get the index of the sheet we're removing
      const sheetIndex = sheets.findIndex(sheet => sheet.id === sheetId);
      
      // If we're removing the active sheet, switch to another one first
      if (activeSheetId === sheetId) {
        // Find a new sheet to make active (prefer the one before, otherwise the one after)
        const newActiveIndex = sheetIndex > 0 ? sheetIndex - 1 : sheetIndex + 1;
        setActiveSheetId(sheets[newActiveIndex].id);
      }
      
      // Check if the hyperFormulaId is valid
      if (sheetToRemove.hyperFormulaId !== undefined && 
          !isNaN(sheetToRemove.hyperFormulaId) && 
          sheetToRemove.hyperFormulaId >= 0) {
        
        // Special handling for HyperFormula sheet removal
        // HyperFormula doesn't allow removing sheet 0 (the first sheet)
        if (sheetToRemove.hyperFormulaId === 0) {
          // If we're trying to remove the first sheet, we need to:
          // 1. Clear it instead of removing it
          hyperformulaInstance.clearSheet(0);
          
          // 2. If there are other sheets, rename this one to indicate it's unused
          if (sheets.length > 1) {
            // Use a unique unused name that won't conflict with our naming scheme
            const unusedName = `_Unused_${Date.now()}`;
            hyperformulaInstance.renameSheet(0, unusedName);
            
            // Update our state to reflect this sheet is now "removed" (but actually just hidden)
            setSheets(prev => prev.filter(sheet => sheet.id !== sheetId));
          }
        } else {
          // For non-first sheets, we can remove them normally
          hyperformulaInstance.removeSheet(sheetToRemove.hyperFormulaId);
          
          // Update our state
          setSheets(prev => prev.filter(sheet => sheet.id !== sheetId));
        }
      } else {
        // If the hyperFormulaId is invalid, just remove it from our state
        console.log("Sheet has invalid hyperFormulaId, removing from state only:", sheetToRemove);
        setSheets(prev => prev.filter(sheet => sheet.id !== sheetId));
      }
    } catch (error) {
      console.error("Error removing sheet:", error);
      // Even if there's an error with HyperFormula, still remove from our state
      setSheets(prev => prev.filter(sheet => sheet.id !== sheetId));
    }
  };

  const renameSheet = (sheetId: string, newName: string) => {
    // Find the sheet to rename
    const sheetToRename = sheets.find(sheet => sheet.id === sheetId);
    if (!sheetToRename || sheetToRename.hyperFormulaId === undefined) return;
    
    try {
      // Get existing sheet names for uniqueness check
      const existingSheetNames = sheets
        .filter(sheet => sheet.id !== sheetId) // Exclude the current sheet
        .map(sheet => sheet.name);
      
      // Use the enhanced renameHyperFormulaSheet function from config.ts
      const finalName = renameHyperFormulaSheet(
        sheetToRename.hyperFormulaId,
        newName,
        existingSheetNames
      );
      
      if (finalName) {
        // Update our state with the potentially modified name
        setSheets(prev => 
          prev.map(sheet => 
            sheet.id === sheetId 
              ? { ...sheet, name: finalName } 
              : sheet
          )
        );
      }
    } catch (error) {
      console.error("Error renaming sheet:", error);
    }
  };

  const setActiveSheet = (sheetId: string) => {
    // Find the sheet to activate
    const sheetToActivate = sheets.find(sheet => sheet.id === sheetId);
    if (!sheetToActivate || sheetToActivate.hyperFormulaId === undefined) return;
    
    try {
      // Use the enhanced setActiveHyperFormulaSheet function from config.ts
      setActiveHyperFormulaSheet(sheetToActivate.hyperFormulaId);
      
      // Update our state
      setActiveSheetId(sheetId);
    } catch (error) {
      console.error("Error setting active sheet:", error);
    }
  };

  const clearSheet = (sheetId: string) => {
    // Find the sheet to clear
    const sheetToClear = sheets.find(sheet => sheet.id === sheetId);
    if (!sheetToClear || sheetToClear.hyperFormulaId === undefined) return;
    
    try {
      // Use the enhanced clearHyperFormulaSheet function from config.ts
      clearHyperFormulaSheet(sheetToClear.hyperFormulaId);
      
      // Update our state with empty data
      setSheets(prev => 
        prev.map(sheet => 
          sheet.id === sheetId 
            ? { ...sheet, data: [["", ""], ["", ""]] } 
            : sheet
        )
      );
    } catch (error) {
      console.error("Error clearing sheet:", error);
    }
  };

  const updateSheetData = (sheetId: string, data: any[][]) => {
    // Find the sheet to update
    const sheetToUpdate = sheets.find(sheet => sheet.id === sheetId);
    if (!sheetToUpdate || sheetToUpdate.hyperFormulaId === undefined) return;
    
    try {
      // Use the enhanced updateHyperFormulaSheetData function from config.ts
      const changes = updateHyperFormulaSheetData(sheetToUpdate.hyperFormulaId, data);
      
      if (changes !== null) {
        // Update our state with the new data
        setSheets(prev => 
          prev.map(sheet => 
            sheet.id === sheetId 
              ? { ...sheet, data } 
              : sheet
          )
        );
      }
    } catch (error) {
      console.error("Error updating sheet data:", error);
    }
  };

  const getActiveSheetData = () => {
    const activeSheet = sheets.find(sheet => sheet.id === activeSheetId);
    return activeSheet?.data || [["", ""], ["", ""]];
  };

  const getActiveSheetName = () => {
    const activeSheet = sheets.find(sheet => sheet.id === activeSheetId);
    return activeSheet?.name || "Sheet 1";
  };

  const getSheetByName = (name: string) => {
    return sheets.find(sheet => sheet.name === name);
  };

  return (
    <SpreadsheetContext.Provider
      value={{
        setFormula,
        setFormulas,
        formulaQueue,
        clearFormula,
        setChartData,
        cellValues: evaluatedValues,
        setCellValues,
        clearCellValues,
        // Sheet management
        sheets,
        activeSheetId,
        addSheet,
        removeSheet,
        renameSheet,
        setActiveSheet,
        clearSheet,
        updateSheetData,
        getActiveSheetData,
        getActiveSheetName,
        getSheetByName,
      }}
    >
      {children}
    </SpreadsheetContext.Provider>
  );
};

export default SpreadsheetContext;
