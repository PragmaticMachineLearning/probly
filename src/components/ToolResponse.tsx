import { BarChart, Check, Table, X } from 'lucide-react';

import { CellUpdate } from '@/types/api';
import React from 'react';

interface ToolResponseProps {
  response: string;
  updates?: CellUpdate[];
  chartData?: any;
  analysis?: {
    goal: string;
    output: string;
    error?: string;
  };
  status: 'pending' | 'accepted' | 'rejected' | null;
  onAccept: () => void;
  onReject: () => void;
}

const ToolResponse: React.FC<ToolResponseProps> = ({
  response,
  updates,
  chartData,
  status,
  onAccept,
  onReject,
}) => {
  // Extract the main text response (without the tool-specific parts)
  const mainResponse = response.split('\n\n')[0];
  
  // Determine which tool was used
  const hasSpreadsheetUpdates = !!updates && updates.length > 0;
  const hasChartData = !!chartData;
  // const hasAnalysis = !!analysis; - Not needed anymore
  
  // Add state for chart expansion
  const [chartExpanded, setChartExpanded] = React.useState(false);
  
  // Function to create a mini spreadsheet visualization
  const renderMiniSpreadsheet = (updates: CellUpdate[]) => {
    if (!updates || updates.length === 0) return null;
    
    const [expanded, setExpanded] = React.useState(false);
    
    // Extract column and row information from cell references
    const cellInfo = updates.map(update => {
      try {
        if (!update?.target || typeof update.target !== 'string') {
          console.warn('Invalid update target:', update);
          return null;
        }
        
        const match = update.target.match(/([A-Z]+)(\d+)/);
        if (!match) {
          console.warn('Invalid cell reference format:', update.target);
          return null;
        }
        
        const col = match[1];
        const row = parseInt(match[2]);
        if (isNaN(row)) {
          console.warn('Invalid row number:', match[2]);
          return null;
        }
        
        return { col, row, formula: update.formula || '', target: update.target };
      } catch (error) {
        console.error('Error processing cell update:', error, update);
        return null;
      }
    }).filter(Boolean) as { col: string; row: number; formula: string; target: string }[];
    
    if (cellInfo.length === 0) return null;
    
    // Find the range of rows and columns
    const minRow = Math.min(...cellInfo.map(cell => cell.row));
    const maxRow = Math.max(...cellInfo.map(cell => cell.row));
    
    // Get unique columns in alphabetical order
    const uniqueCols = Array.from(new Set(cellInfo.map(cell => cell.col)))
      .sort((a, b) => a.localeCompare(b));
    
    // Determine display range based on expanded state
    const displayMinRow = minRow;
    const displayMaxRow = expanded ? maxRow : Math.min(minRow + 4, maxRow);
    
    // Determine columns to show - show all columns if there are 5 or fewer
    const colsToShow = expanded || uniqueCols.length <= 5 
      ? uniqueCols 
      : uniqueCols.slice(0, 5);
    
    // Determine if we need an expand button
    const needsExpand = maxRow - minRow + 1 > 5 || uniqueCols.length > 5;
    
    // Create a map of updates for quick lookup
    const updateMap = new Map();
    cellInfo.forEach(cell => {
      updateMap.set(cell.target, cell.formula);
    });
    
    return (
      <div className="space-y-2">
        <div className="overflow-x-auto max-w-full">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="p-1 bg-gray-100 border border-gray-300"></th>
                {colsToShow.map(col => (
                  <th key={col} className="p-1 bg-gray-100 border border-gray-300 font-medium text-center w-16">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: displayMaxRow - displayMinRow + 1 }, (_, i) => displayMinRow + i).map(row => (
                <tr key={row}>
                  <td className="p-1 bg-gray-100 border border-gray-300 font-medium text-center">
                    {row}
                  </td>
                  {colsToShow.map(col => {
                    const cellRef = `${col}${row}`;
                    const hasUpdate = updateMap.has(cellRef);
                    const cellValue = updateMap.get(cellRef) || '';
                    
                    return (
                      <td 
                        key={cellRef} 
                        className={`p-1 border border-gray-300 font-mono text-xs ${hasUpdate ? 'bg-blue-50' : ''}`}
                        title={cellValue}
                      >
                        <div className="truncate max-w-[120px]">
                          {hasUpdate ? cellValue : ''}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {needsExpand && (
          <button 
            onClick={() => setExpanded(!expanded)} 
            className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            {expanded ? "Show less" : `Show more`}
          </button>
        )}
      </div>
    );
  };
  
  return (
    <div className="space-y-3">
      {/* Main response text */}
      <div className="whitespace-pre-wrap">{mainResponse}</div>
      
      {/* Tool-specific response */}
      {(hasSpreadsheetUpdates || hasChartData) && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          {/* Spreadsheet Updates */}
          {hasSpreadsheetUpdates && (
            <div className="bg-blue-50 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 text-blue-700 font-medium mb-2">
                <Table size={16} />
                <span>Spreadsheet Updates ({updates.length})</span>
              </div>
              <div className="overflow-auto">
                {renderMiniSpreadsheet(updates)}
              </div>
            </div>
          )}
          
          {/* Chart Data */}
          {hasChartData && (
            <div className="bg-purple-50 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 text-purple-700 font-medium mb-2">
                <BarChart size={16} />
                <span>Chart: {chartData.options.title}</span>
              </div>
              <div className="text-xs">
                <div className="mb-1"><span className="font-medium">Type:</span> {chartData.type}</div>
                <div className="mb-1"><span className="font-medium">Data:</span> {chartData.options.data.length} rows</div>
                <div className="bg-purple-100 p-2 rounded max-h-32 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {chartData.options.data[0]?.map((header: any, i: number) => (
                          <th key={i} className="p-1 text-left">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.options.data.slice(1, chartExpanded ? chartData.options.data.length : 5).map((row: any[], i: number) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} className="p-1">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {chartData.options.data.length > 5 && (
                    <button
                      onClick={() => setChartExpanded(!chartExpanded)}
                      className="text-xs text-purple-600 mt-1 text-center block w-full hover:text-purple-800 transition-colors"
                    >
                      {chartExpanded ? "Show less" : `+${chartData.options.data.length - 5} more rows`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Action Buttons */}
          {status === 'pending' && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={onAccept}
                className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-full text-xs flex items-center gap-1.5 transition-colors duration-200 group"
              >
                <Check size={14} className="group-hover:scale-110 transition-transform duration-200" />
                Apply Changes
              </button>
              <button
                onClick={onReject}
                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs flex items-center gap-1.5 transition-colors duration-200 group"
              >
                <X size={14} className="group-hover:scale-110 transition-transform duration-200" />
                Reject
              </button>
            </div>
          )}
          
          {/* Status Indicators */}
          {status === 'accepted' && (
            <div className="mt-2 text-green-500 text-xs flex items-center gap-1 animate-fadeIn">
              <Check size={14} />
              Changes Applied
            </div>
          )}
          {status === 'rejected' && (
            <div className="mt-2 text-red-500 text-xs flex items-center gap-1 animate-fadeIn">
              <X size={14} />
              Changes Rejected
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolResponse;