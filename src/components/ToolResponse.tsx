import { BarChart, Check, ChevronDown, ChevronUp, Loader2, Table, X } from 'lucide-react';

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
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | null;
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
  // Add state for spreadsheet expansion
  const [spreadsheetExpanded, setSpreadsheetExpanded] = React.useState(false);
  
  // Function to create a mini spreadsheet visualization
  const renderMiniSpreadsheet = (updates: CellUpdate[], expanded: boolean, setExpanded: (expanded: boolean) => void) => {
    if (!updates || updates.length === 0) return null;
    
    // Extract column and row information from cell references
    const cellInfo = updates.map(update => {
      const match = update.target.match(/([A-Z]+)(\d+)/);
      if (!match) return null;
      
      const col = match[1];
      const row = parseInt(match[2]);
      return { col, row, formula: update.formula, target: update.target };
    }).filter(Boolean) as { col: string; row: number; formula: string; target: string }[];
    
    if (cellInfo.length === 0) return null;
    
    // Find the range of rows and columns
    const minRow = Math.min(...cellInfo.map(cell => cell.row));
    const maxRow = Math.max(...cellInfo.map(cell => cell.row));
    const minCol = Math.min(...cellInfo.map(cell => cell.col.charCodeAt(0)));
    const maxCol = Math.max(...cellInfo.map(cell => cell.col.charCodeAt(0)));
    
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
    
    // Calculate update range for summary
    const rangeSummary = `${String.fromCharCode(minCol)}${minRow}:${String.fromCharCode(maxCol)}${maxRow}`;
    
    return (
      <div className="space-y-2">
        {/* Update summary */}
        <div className="text-xs text-gray-600 mb-2">
          <span className="font-medium">{updates.length}</span> cells updated in range <span className="font-mono">{rangeSummary}</span>
        </div>
        
        <div className="overflow-x-auto max-w-full">
          <div className={`transition-all duration-300 ease-in-out ${expanded ? 'max-h-[1000px]' : 'max-h-[200px]'} overflow-hidden`}>
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
                          className={`p-1 border border-gray-300 font-mono text-xs ${hasUpdate ? 'bg-[#1A6B4C]/10' : ''}`}
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
        </div>
        
        {needsExpand && (
          <div className="flex justify-between items-center">
            <button 
              onClick={() => setExpanded(!expanded)} 
              className="text-xs text-[#1A6B4C] hover:text-[#1A6B4C]/80 transition-colors flex items-center gap-1"
            >
              {expanded ? (
                <>
                  <span>Show less</span>
                  <ChevronUp size={14} />
                </>
              ) : (
                <>
                  <span>Show more</span>
                  <ChevronDown size={14} />
                </>
              )}
            </button>
            <span className="text-xs text-gray-500">
              {expanded ? "Showing all" : `+${maxRow - displayMaxRow} more rows`}
            </span>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="space-y-3">
      {/* Main response text */}
      <div className="whitespace-pre-wrap">
        {mainResponse}
        {status === 'pending' && (
          <div className="flex items-center gap-2 mt-2 text-[#1A6B4C] text-sm">
            <Loader2 size={16} className="animate-spin" />
            <span>Generating response...</span>
          </div>
        )}
      </div>
      
      {/* Tool-specific response */}
      {(hasSpreadsheetUpdates || hasChartData) && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          {/* Spreadsheet Updates */}
          {hasSpreadsheetUpdates && (
            <div className="bg-[#1A6B4C]/10 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 text-[#1A6B4C] font-medium mb-2">
                <div className="ml-auto flex items-center gap-2">
                 
                </div>
              </div>
              <div className="overflow-auto">
                {renderMiniSpreadsheet(updates, spreadsheetExpanded, setSpreadsheetExpanded)}
              </div>
            </div>
          )}
          
          {/* Chart Data */}
          {hasChartData && (
            <div className="bg-[#1A6B4C]/10 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 text-[#1A6B4C] font-medium mb-2">
                <BarChart size={16} />
                <span>Chart: {chartData.options.title}</span>
              </div>
              <div className="text-xs">
                <div className="mb-1"><span className="font-medium">Type:</span> {chartData.type}</div>
                <div className="mb-1"><span className="font-medium">Data:</span> {chartData.options.data.length} rows</div>
                <div className="bg-[#1A6B4C]/10 p-2 rounded max-h-32 overflow-y-auto">
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
                      className="text-xs text-[#1A6B4C] mt-1 text-center block w-full hover:text-[#1A6B4C]/80 transition-colors"
                    >
                      {chartExpanded ? "Show less" : `+${chartData.options.data.length - 5} more rows`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Action Buttons */}
          {(status === 'pending' || status === 'completed') && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={onAccept}
                className="p-1.5 bg-[#1A6B4C] hover:bg-[#1A6B4C]/80 text-white rounded-full flex items-center justify-center transition-all duration-200 group"
                title="Apply Changes"
              >
                <Check size={16} className="group-hover:scale-110 transition-transform duration-200" />
              </button>
              <button
                onClick={onReject}
                className="p-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded-full flex items-center justify-center transition-all duration-200 group"
                title="Reject Changes"
              >
                <X size={16} className="group-hover:scale-110 transition-transform duration-200" />
              </button>
            </div>
          )}
          
          {/* Status Indicators */}
          {status === 'accepted' && (
            <div className="mt-2 text-[#1A6B4C] text-xs flex items-center gap-1 animate-fadeIn">
              <Check size={14} />
              Changes Applied
            </div>
          )}
          {status === 'rejected' && (
            <div className="mt-2 text-[#1A6B4C] text-xs flex items-center gap-1 animate-fadeIn">
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