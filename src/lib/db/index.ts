import Dexie, { Table } from 'dexie';

import { ChatMessage } from '@/types/api';
import { Sheet } from '@/context/SpreadsheetContext';

// Define the database schema
class SpreadsheetDatabase extends Dexie {
  // Tables
  sheets!: Table<Sheet>;
  cellValues!: Table<{id: string, cell: string, value: any}>;
  formulaQueue!: Table<{id: string, cell: string, formula: string}>;
  chatHistory!: Table<ChatMessage>;
  preferences!: Table<{id: string, key: string, value: any}>;

  constructor() {
    super('ProblySpreadsheetDB');
    
    // Define tables and indexes
    this.version(1).stores({
      sheets: '++id, name, hyperFormulaId', // Primary key is id
      cellValues: '++id, cell', // Store cell values with cell reference as index
      formulaQueue: '++id, cell', // Store formulas with cell reference as index
      chatHistory: '++id, timestamp', // Store chat history with timestamp as index
      preferences: 'id, key' // Store user preferences
    });
  }

  // Helper methods for sheets
  async getAllSheets(): Promise<Sheet[]> {
    return await this.sheets.toArray();
  }

  async getSheetById(id: string): Promise<Sheet | undefined> {
    return await this.sheets.get(id);
  }

  async getSheetByName(name: string): Promise<Sheet | undefined> {
    return await this.sheets.where('name').equals(name).first();
  }

  async addSheet(sheet: Sheet): Promise<string> {
    return await this.sheets.add(sheet);
  }

  async updateSheet(sheet: Sheet): Promise<number> {
    return await this.sheets.update(sheet.id, {
      name: sheet.name,
      data: sheet.data,
      hyperFormulaId: sheet.hyperFormulaId
    });
  }

  async deleteSheet(id: string): Promise<void> {
    await this.sheets.delete(id);
  }

  // Helper methods for cell values
  async getCellValue(cell: string): Promise<any> {
    const record = await this.cellValues.where('cell').equals(cell).first();
    return record?.value;
  }

  async getAllCellValues(): Promise<Map<string, any>> {
    const records = await this.cellValues.toArray();
    const map = new Map<string, any>();
    records.forEach(record => {
      map.set(record.cell, record.value);
    });
    return map;
  }

  async setCellValue(cell: string, value: any): Promise<void> {
    const existing = await this.cellValues.where('cell').equals(cell).first();
    if (existing) {
      await this.cellValues.update(existing.id, { value });
    } else {
      await this.cellValues.add({ id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, cell, value });
    }
  }

  async setCellValues(values: Map<string, any>): Promise<void> {
    await this.transaction('rw', this.cellValues, async () => {
      const promises: Promise<any>[] = [];
      values.forEach((value, cell) => {
        promises.push(this.setCellValue(cell, value));
      });
      await Promise.all(promises);
    });
  }

  async deleteCellValue(cell: string): Promise<void> {
    await this.cellValues.where('cell').equals(cell).delete();
  }

  // Helper methods for formula queue
  async getFormula(cell: string): Promise<string | undefined> {
    const record = await this.formulaQueue.where('cell').equals(cell).first();
    return record?.formula;
  }

  async getAllFormulas(): Promise<Map<string, string>> {
    const records = await this.formulaQueue.toArray();
    const map = new Map<string, string>();
    records.forEach(record => {
      map.set(record.cell, record.formula);
    });
    return map;
  }

  async setFormula(cell: string, formula: string): Promise<void> {
    const existing = await this.formulaQueue.where('cell').equals(cell).first();
    if (existing) {
      await this.formulaQueue.update(existing.id, { formula });
    } else {
      await this.formulaQueue.add({ id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, cell, formula });
    }
  }

  async deleteFormula(cell: string): Promise<void> {
    await this.formulaQueue.where('cell').equals(cell).delete();
  }

  // Helper methods for chat history
  async getChatHistory(): Promise<ChatMessage[]> {
    return await this.chatHistory.orderBy('timestamp').toArray();
  }

  async addChatMessage(message: ChatMessage): Promise<string> {
    return await this.chatHistory.add(message);
  }

  async updateChatMessage(message: ChatMessage): Promise<number> {
    return await this.chatHistory.update(message.id, {
      text: message.text,
      response: message.response,
      timestamp: message.timestamp,
      status: message.status,
      updates: message.updates,
      chartData: message.chartData,
      analysis: message.analysis,
      hasImage: message.hasImage,
      documentImage: message.documentImage
    });
  }

  async clearChatHistory(): Promise<void> {
    await this.chatHistory.clear();
  }

  // Helper methods for preferences
  async getPreference(key: string): Promise<any> {
    const record = await this.preferences.where('key').equals(key).first();
    return record?.value;
  }

  async setPreference(key: string, value: any): Promise<void> {
    const id = `pref_${key}`;
    const existing = await this.preferences.get(id);
    if (existing) {
      await this.preferences.update(id, { value });
    } else {
      await this.preferences.add({ id, key, value });
    }
  }

  // Clear all data for a fresh start
  async clearDatabase(): Promise<void> {
    await this.transaction('rw', [this.sheets, this.cellValues, this.formulaQueue, this.chatHistory, this.preferences], async () => {
      await this.sheets.clear();
      await this.cellValues.clear();
      await this.formulaQueue.clear();
      await this.chatHistory.clear();
      await this.preferences.clear();
    });
  }

  // Special method to clean up duplicate sheets
  async cleanupDuplicateSheets(): Promise<number> {
    try {
      // Get all sheets
      const sheets = await this.sheets.toArray();
      
      // Group sheets by name
      const sheetsByName: Record<string, Sheet[]> = {};
      sheets.forEach(sheet => {
        if (!sheetsByName[sheet.name]) {
          sheetsByName[sheet.name] = [];
        }
        sheetsByName[sheet.name].push(sheet);
      });
      
      // Find duplicate names
      const duplicateNames = Object.keys(sheetsByName).filter(name => 
        sheetsByName[name].length > 1
      );
      
      if (duplicateNames.length === 0) {
        console.log("No duplicate sheets found.");
        return 0;
      }
      
      console.log(`Found ${duplicateNames.length} sheet names with duplicates: ${duplicateNames.join(', ')}`);
      
      // Clean up duplicates - we'll keep the sheet with actual data or the most recent one
      let removedCount = 0;
      
      await this.transaction('rw', this.sheets, async () => {
        for (const name of duplicateNames) {
          const duplicates = sheetsByName[name];
          
          // Find sheet with actual data (non-empty cells)
          const sheetWithData = duplicates.find(sheet => 
            sheet.data && 
            sheet.data.length > 0 && 
            sheet.data.some(row => row.some(cell => cell !== ""))
          );
          
          // If no sheet has data, keep the most recent one (assuming ID is timestamp-based)
          const sheetToKeep = sheetWithData || 
            duplicates.sort((a, b) => b.id.localeCompare(a.id))[0];
          
          // Delete all duplicates except the one to keep
          for (const sheet of duplicates) {
            if (sheet.id !== sheetToKeep.id) {
              await this.sheets.delete(sheet.id);
              removedCount++;
            }
          }
        }
      });
      
      console.log(`Cleaned up ${removedCount} duplicate sheets.`);
      return removedCount;
    } catch (error) {
      console.error("Error cleaning up duplicate sheets:", error);
      return 0;
    }
  }
}

// Create a singleton instance of the database
export const db = new SpreadsheetDatabase();

// Export the database class type for type checking
export type { SpreadsheetDatabase }; 