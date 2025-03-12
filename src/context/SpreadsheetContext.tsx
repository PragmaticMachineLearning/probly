import React, { createContext, useContext, useEffect, useState } from "react";
import {
  addSheetToHyperFormula,
  calculateCellValue,
  getSheetIdByName,
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
    // Add sheet to HyperFormula
    const hyperFormulaId = addSheetToHyperFormula(newSheetName);
    
    const newSheet: Sheet = {
      id: generateId(),
      name: newSheetName,
      data: [["", ""], ["", ""]],
      hyperFormulaId: Number(hyperFormulaId) // Ensure it's a number
    };
    
    setSheets(prev => [...prev, newSheet]);
    setActiveSheetId(newSheet.id);
  };

  const removeSheet = (sheetId: string) => {
    // Don't allow removing the last sheet
    if (sheets.length <= 1) return;
    
    setSheets(prev => prev.filter(sheet => sheet.id !== sheetId));
    
    // If we're removing the active sheet, switch to another one
    if (activeSheetId === sheetId) {
      const remainingSheets = sheets.filter(sheet => sheet.id !== sheetId);
      setActiveSheetId(remainingSheets[0].id);
    }
    
    // Note: We're not removing the sheet from HyperFormula as it doesn't support sheet removal
    // In a production app, you might want to handle this differently
  };

  const renameSheet = (sheetId: string, newName: string) => {
    setSheets(prev => 
      prev.map(sheet => 
        sheet.id === sheetId 
          ? { ...sheet, name: newName } 
          : sheet
      )
    );
    
    // Note: HyperFormula doesn't support sheet renaming directly
    // In a production app, you might want to handle this differently
  };

  const setActiveSheet = (sheetId: string) => {
    setActiveSheetId(sheetId);
  };

  const updateSheetData = (sheetId: string, data: any[][]) => {
    setSheets(prev => {
      const updatedSheets = prev.map(sheet => {
        if (sheet.id === sheetId) {
          // Update HyperFormula sheet data
          if (sheet.hyperFormulaId !== undefined) {
            updateHyperFormulaSheetData(sheet.hyperFormulaId, data);
          }
          return { ...sheet, data };
        }
        return sheet;
      });
      return updatedSheets;
    });
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
