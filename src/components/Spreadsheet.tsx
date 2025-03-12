import "handsontable/dist/handsontable.full.min.css";

import * as XLSX from "xlsx";

import { Edit2, PlusCircle, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import Handsontable from "handsontable";
import SpreadsheetEChart from "./SpreadsheetEChart";
import SpreadsheetToolbar from "./SpreadsheetToolbar";
import { excelCellToRowCol } from "@/lib/file/spreadsheet/utils";
import { fileExport } from "@/lib/file/export";
import { fileImport } from "@/lib/file/import";
import { getInitialConfig } from "@/lib/file/spreadsheet/config";
import { useSpreadsheet } from "@/context/SpreadsheetContext";

interface SpreadsheetProps {
  onDataChange?: (data: any[][]) => void;
  initialData?: any[][];
}

export interface SpreadsheetRef {
  handleImport: (file: File) => Promise<void>;
  handleExport: () => void;
}

interface ChartInfo {
  data: any[][];
  title?: string;
  type?: string;
  position: { top: number; left: number; width: number; height: number };
}

const Spreadsheet = forwardRef<SpreadsheetRef, SpreadsheetProps>(
  ({ onDataChange, initialData }, ref) => {
    const spreadsheetRef = useRef<HTMLDivElement>(null);
    const hotInstanceRef = useRef<any>(null);
    const { 
      formulaQueue, 
      clearFormula, 
      setFormulas,
      // Sheet management
      sheets,
      activeSheetId,
      addSheet,
      removeSheet,
      renameSheet,
      setActiveSheet,
      updateSheetData,
      getActiveSheetData
    } = useSpreadsheet();
    
    const [currentData, setCurrentData] = useState(
      initialData || getActiveSheetData() || [["", ""], ["", ""]]
    );
    const [charts, setCharts] = useState<ChartInfo[]>([]);
    const [hiddenCharts, setHiddenCharts] = useState<number[]>([]);
    const [showChartPanel, setShowChartPanel] = useState(false);
    const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
    const [newSheetName, setNewSheetName] = useState("");

    const handleImport = async (file: File) => {
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer);
        
        // Create a new sheet for each sheet in the workbook
        const importedSheets = workbook.SheetNames.map((sheetName, index) => {
          const worksheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
          }) as any[][];
          
          return {
            id: `imported_${Date.now()}_${index}`,
            name: sheetName,
            data: data
          };
        });
        
        // Update the current sheet with the first imported sheet
        if (importedSheets.length > 0 && hotInstanceRef.current) {
          const firstSheetData = importedSheets[0].data;
          hotInstanceRef.current.updateSettings(
            {
              data: firstSheetData,
            },
            false,
          );
          
          // Update the context with all imported sheets
          importedSheets.forEach((sheet, index) => {
            if (index === 0) {
              // Update the active sheet
              updateSheetData(activeSheetId, sheet.data);
              if (onDataChange) {
                onDataChange(sheet.data);
              }
            } else {
              // Add additional sheets
              addSheet();
              updateSheetData(sheets[sheets.length - 1].id, sheet.data);
            }
          });
        }
      } catch (error) {
        console.error("Error importing spreadsheet:", error);
        alert("Error importing file. Please try again.");
      }
    };

    const handleExport = async () => {
      try {
        // Create a workbook with all sheets
        const workbook = XLSX.utils.book_new();
        
        // Add each sheet to the workbook
        sheets.forEach(sheet => {
          const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
          XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
        });
        
        // Export the workbook
        XLSX.writeFile(workbook, "spreadsheet.xlsx");
      } catch (error) {
        console.error("Error exporting spreadsheet:", error);
        alert("Error exporting file. Please try again.");
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        handleImport,
        handleExport,
      }),
      [],
    );

    useEffect(() => {
      formulaQueue.forEach((formula, target) => {
        if (hotInstanceRef.current) {
          try {
            const { row, col } = excelCellToRowCol(target);
            hotInstanceRef.current.setDataAtCell(row, col, formula);
            const newData = hotInstanceRef.current.getData();
            setCurrentData(newData);
            updateSheetData(activeSheetId, newData);
            clearFormula(target);
          } catch (error) {
            console.error("Error setting formula:", error);
          }
        }
      });
    }, [formulaQueue, clearFormula, activeSheetId, updateSheetData]);

    // Initialize Handsontable when component mounts
    useEffect(() => {
      if (spreadsheetRef.current && !hotInstanceRef.current) {
        try {
          const config = getInitialConfig(currentData);
          // Create a new instance with the config
          hotInstanceRef.current = new Handsontable(
            spreadsheetRef.current,
            config
          );
          
          // Add the afterChange hook after instance creation
          hotInstanceRef.current.addHook('afterChange', (changes: any) => {
            if (changes) {
              const currentData = hotInstanceRef.current?.getData();
              if (currentData) {
                updateSheetData(activeSheetId, currentData);
                if (onDataChange) {
                  onDataChange(currentData);
                }
              }
            }
          });
        } catch (error) {
          console.error("Error initializing spreadsheet:", error);
        }
      }

      return () => {
        if (hotInstanceRef.current) {
          hotInstanceRef.current.destroy();
          hotInstanceRef.current = null;
        }
      };
    }, []);

    // Update Handsontable when active sheet changes
    useEffect(() => {
      const activeSheetData = getActiveSheetData();
      setCurrentData(activeSheetData);
      
      if (hotInstanceRef.current) {
        hotInstanceRef.current.updateSettings({ data: activeSheetData }, false);
      }
    }, [activeSheetId, getActiveSheetData]);

    // Update Handsontable when currentData changes
    useEffect(() => {
      if (hotInstanceRef.current && currentData) {
        hotInstanceRef.current.updateSettings({ data: currentData }, false);
      }
    }, [currentData]);

    useEffect(() => {
      formulaQueue.forEach((data, target) => {
        if (target === "chart") {
          try {
            const parsedData = JSON.parse(data);
            console.log("Parsed chart data:", parsedData);
            
            // Calculate a better position for the chart
            const chartWidth = 550;
            const chartHeight = 400;
            
            // Default position if we can't determine a better one
            let chartPosition = {
              top: 100,
              left: 100,
              width: chartWidth,
              height: chartHeight
            };
            
            // If we have a hot instance, try to position the chart better
            if (hotInstanceRef.current && spreadsheetRef.current) {
              // Get the current viewport dimensions
              const viewportWidth = spreadsheetRef.current.clientWidth || 800;
              const viewportHeight = spreadsheetRef.current.clientHeight || 600;
              
              // Position the chart in the center of the visible area
              chartPosition = {
                top: Math.max(50, (viewportHeight - chartHeight) / 3),
                left: Math.max(50, (viewportWidth - chartWidth) / 2),
                width: chartWidth,
                height: chartHeight
              };
            }
            
            // Ensure we have valid chart data
            let chartData = parsedData.options.data;
            
            // Validate chart data format
            if (chartData && Array.isArray(chartData) && chartData.length > 0) {
              // Create a new chart with calculated position
              const newChart: ChartInfo = {
                data: chartData,
                title: parsedData.options.title || "Chart",
                type: parsedData.type || "bar",
                position: chartPosition
              };
              
              setCharts(prevCharts => [...prevCharts, newChart]);
            } else {
              console.error("Invalid chart data format:", chartData);
            }
            
            clearFormula(target);
          } catch (error) {
            console.error("Error setting chart data:", error);
          }
        }
      });
    }, [formulaQueue, clearFormula]);

    const toggleChartVisibility = (index: number) => {
      console.log(`Toggling visibility for chart ${index}`);
      console.log(`Current hidden charts: ${hiddenCharts}`);
      
      setHiddenCharts(prev => {
        const newHiddenCharts = prev.includes(index)
          ? prev.filter(i => i !== index) // Remove from hidden (show it)
          : [...prev, index];             // Add to hidden (hide it)
        
        console.log(`New hidden charts: ${newHiddenCharts}`);
        return newHiddenCharts;
      });
    };

    const deleteChart = (index: number) => {
      setCharts(prevCharts => prevCharts.filter((_, i) => i !== index));
      setHiddenCharts(prev => prev.filter(i => i !== index));
    };

    const handleSheetClick = (sheetId: string) => {
      setActiveSheet(sheetId);
    };

    const handleAddSheet = () => {
      addSheet();
    };

    const handleRemoveSheet = (e: React.MouseEvent, sheetId: string) => {
      e.stopPropagation();
      if (sheets.length > 1) {
        removeSheet(sheetId);
      }
    };

    const startEditingSheet = (e: React.MouseEvent, sheetId: string) => {
      e.stopPropagation();
      const sheet = sheets.find(s => s.id === sheetId);
      if (sheet) {
        setEditingSheetId(sheetId);
        setNewSheetName(sheet.name);
      }
    };

    const handleSheetNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setNewSheetName(e.target.value);
    };

    const handleSheetNameSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (editingSheetId && newSheetName.trim()) {
        renameSheet(editingSheetId, newSheetName.trim());
        setEditingSheetId(null);
      }
    };

    const handleSheetNameBlur = () => {
      if (editingSheetId && newSheetName.trim()) {
        renameSheet(editingSheetId, newSheetName.trim());
      }
      setEditingSheetId(null);
    };

    return (
      <div className="h-full flex flex-col">
        <SpreadsheetToolbar
          onImport={async () => {
            fileImport().then((file: any) => {
              if (file) {
                handleImport(file);
              }
            });
          }}
          onExport={handleExport}
          onChart={() => setShowChartPanel(prev => !prev)}
        />
        
        <div className="relative flex-1">
          <div ref={spreadsheetRef} className="w-full h-full" />
          
          {/* Render visible charts as overlays */}
          {charts.map((chart, index) => (
            !hiddenCharts.includes(index) && (
              <SpreadsheetEChart
                key={index}
                data={chart.data}
                title={chart.title}
                type={chart.type}
                position={chart.position}
                onClose={() => toggleChartVisibility(index)}
              />
            )
          ))}
          
          {/* Chart management panel */}
          {showChartPanel && (
            <div className="absolute top-2 left-2 bg-white p-3 rounded-lg shadow-md border border-gray-200 z-50 w-64">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium text-sm">Chart Manager</h3>
                <button 
                  onClick={() => setShowChartPanel(false)}
                  className="text-xs p-1 hover:bg-gray-100 rounded"
                >
                  ✕
                </button>
              </div>
              {charts.length > 0 ? (
                <div className="max-h-60 overflow-y-auto">
                  {charts.map((chart, index) => (
                    <div key={index} className="flex items-center justify-between py-1 border-b border-gray-100">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={!hiddenCharts.includes(index)}
                          onChange={() => toggleChartVisibility(index)}
                          className="mr-2"
                        />
                        <span className="text-xs truncate max-w-[150px]">
                          {chart.title || `Chart ${index + 1}`}
                        </span>
                      </div>
                      <button
                        onClick={() => deleteChart(index)}
                        className="text-xs text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                        title="Delete chart"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500 py-2">
                  No charts available, ask Probly to create one.
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Sheet tabs - moved to bottom */}
        <div className="flex items-center border-t border-gray-200 bg-gray-50 px-2 overflow-x-auto">
          {sheets.map(sheet => (
            <div 
              key={sheet.id}
              className={`flex items-center px-3 py-1.5 mr-1 cursor-pointer ${
                activeSheetId === sheet.id 
                  ? 'bg-white border-t border-l border-r border-gray-200 rounded-t-md -mt-px' 
                  : 'bg-gray-100 hover:bg-gray-200 rounded-t-md mt-1'
              }`}
              onClick={() => handleSheetClick(sheet.id)}
            >
              {editingSheetId === sheet.id ? (
                <form onSubmit={handleSheetNameSubmit}>
                  <input
                    type="text"
                    value={newSheetName}
                    onChange={handleSheetNameChange}
                    onBlur={handleSheetNameBlur}
                    autoFocus
                    className="w-24 px-1 py-0.5 text-sm border border-blue-400 rounded"
                    onClick={e => e.stopPropagation()}
                  />
                </form>
              ) : (
                <>
                  <span className="text-sm truncate max-w-[100px]">{sheet.name}</span>
                  <button 
                    className="ml-2 p-1 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-200"
                    onClick={(e) => startEditingSheet(e, sheet.id)}
                    title="Rename sheet"
                  >
                    <Edit2 size={12} />
                  </button>
                  {sheets.length > 1 && (
                    <button 
                      className="ml-1 p-1 text-gray-500 hover:text-red-500 rounded-full hover:bg-gray-200"
                      onClick={(e) => handleRemoveSheet(e, sheet.id)}
                      title="Remove sheet"
                    >
                      <X size={12} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <button 
            className="flex items-center px-3 py-1.5 text-sm text-blue-600 hover:bg-gray-100 rounded-md mt-1"
            onClick={handleAddSheet}
            title="Add new sheet"
          >
            <PlusCircle size={16} className="mr-1" />
            <span>New</span>
          </button>
        </div>
      </div>
    );
  },
);

Spreadsheet.displayName = "Spreadsheet";

export default Spreadsheet;
