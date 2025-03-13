import React, { createContext, useContext, useEffect, useState } from "react";
import {
  addSheetToHyperFormula,
  calculateCellValue,
  getSheetIdByName,
  hyperformulaInstance,
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
  const existingNames = sheets.map(sheet => sheet.name);
  let index = 1;
  let name = `Sheet ${index}`;
  
  while (existingNames.includes(name)) {
    index++;
    name = `Sheet ${index}`;
  }
  
  return name;
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
    const newSheetName = generateSheetName(sheets);
    
    // Check if we have a hidden first sheet we can reuse
    const sheetNames = hyperformulaInstance.getSheetNames();
    const firstSheetName = sheetNames[0];
    
    let hyperFormulaId: number;
    
    try {
      // If the first sheet name starts with "_Unused_", it means it was hidden (not actually removed)
      // and we can reuse it instead of adding a new one
      if (firstSheetName && firstSheetName.startsWith('_Unused_') && 
          !sheets.some(sheet => sheet.hyperFormulaId === 0)) {
        // Reuse the first sheet by renaming it
        hyperformulaInstance.renameSheet(0, newSheetName);
        hyperFormulaId = 0;
        
        // Clear any existing content
        hyperformulaInstance.clearSheet(0);
      } else {
        // Add a new sheet to HyperFormula
        const newSheetId = hyperformulaInstance.addSheet(newSheetName);
        hyperFormulaId = Number(newSheetId);
        
        // Ensure it's a valid number
        if (isNaN(hyperFormulaId)) {
          console.error("Invalid hyperFormulaId after adding sheet:", newSheetId);
          const sheetId = hyperformulaInstance.getSheetId(newSheetName);
          if (sheetId !== undefined) {
            hyperFormulaId = sheetId;
          } else {
            // Fallback to a default value if we can't get a valid ID
            console.error("Could not get valid sheet ID for new sheet, using fallback");
            hyperFormulaId = sheets.length; // Use the current number of sheets as a fallback
          }
        }
      }
      
      console.log(`Added new sheet: ${newSheetName} with HyperFormula ID: ${hyperFormulaId}`);
      
      // Initialize with empty data to ensure it doesn't inherit data from other sheets
      const emptyData = [["", ""], ["", ""]];
      hyperformulaInstance.setSheetContent(hyperFormulaId, emptyData);
      
      const newSheet: Sheet = {
        id: generateId(),
        name: newSheetName,
        data: emptyData,
        hyperFormulaId: hyperFormulaId
      };
      
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
      // Use HyperFormula's renameSheet method
      hyperformulaInstance.renameSheet(sheetToRename.hyperFormulaId, newName);
      
      // Update our state
      setSheets(prev => 
        prev.map(sheet => 
          sheet.id === sheetId 
            ? { ...sheet, name: newName } 
            : sheet
        )
      );
    } catch (error) {
      console.error("Error renaming sheet:", error);
    }
  };

  const setActiveSheet = (sheetId: string) => {
    setActiveSheetId(sheetId);
  };

  const clearSheet = (sheetId: string) => {
    // Find the sheet to clear
    const sheetToClear = sheets.find(sheet => sheet.id === sheetId);
    if (!sheetToClear || sheetToClear.hyperFormulaId === undefined) return;
    
    try {
      // Check if the sheet exists in HyperFormula
      const sheetNames = hyperformulaInstance.getSheetNames();
      const sheetExists = sheetToClear.hyperFormulaId < sheetNames.length;
      
      if (sheetExists) {
        // Use HyperFormula's clearSheet method
        const changes = hyperformulaInstance.clearSheet(sheetToClear.hyperFormulaId);
        console.log("Sheet cleared with changes:", changes);
        
        // Update our state with empty data
        setSheets(prev => 
          prev.map(sheet => 
            sheet.id === sheetId 
              ? { ...sheet, data: [["", ""], ["", ""]] } 
              : sheet
          )
        );
      } else {
        console.error("Attempted to clear a sheet that doesn't exist in HyperFormula:", sheetToClear);
      }
    } catch (error) {
      console.error("Error clearing sheet:", error);
    }
  };

  const updateSheetData = (sheetId: string, data: any[][]) => {
    // Find the sheet to update
    const sheetToUpdate = sheets.find(sheet => sheet.id === sheetId);
    if (!sheetToUpdate || sheetToUpdate.hyperFormulaId === undefined) return;
    
    try {
      // Check if the sheet exists in HyperFormula
      const sheetNames = hyperformulaInstance.getSheetNames();
      const sheetExists = sheetToUpdate.hyperFormulaId < sheetNames.length;
      
      if (sheetExists) {
        // Use HyperFormula's setSheetContent method
        console.log(`Updating sheet ${sheetToUpdate.name} (ID: ${sheetId}, HyperFormula ID: ${sheetToUpdate.hyperFormulaId}) with data:`, data);
        
        // Important: We need to explicitly set the sheet content for this specific sheet
        // to prevent data from being synced between sheets
        const changes = hyperformulaInstance.setSheetContent(sheetToUpdate.hyperFormulaId, data);
        console.log("Sheet updated with changes:", changes);
        
        // Update our state
        setSheets(prev => {
          const updatedSheets = prev.map(sheet => {
            if (sheet.id === sheetId) {
              return { ...sheet, data };
            }
            return sheet;
          });
          return updatedSheets;
        });
      } else {
        console.error("Attempted to update a sheet that doesn't exist in HyperFormula:", sheetToUpdate);
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
