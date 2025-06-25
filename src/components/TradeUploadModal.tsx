import React, { useState, useCallback, useMemo } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Card,
  CardBody,
  CardHeader,
  Select,
  SelectItem,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Progress,
  Chip,
  Divider,
  ScrollShadow
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Trade } from "../types/trade";
import { generateId } from "../utils/helpers";
import {
  calcAvgEntry,
  calcPositionSize,
  calcAllocation,
  calcSLPercent,
  calcOpenQty,
  calcExitedQty,
  calcAvgExitPrice,
  calcStockMove,
  calcRewardRisk,
  calcHoldingDays,
  calcRealisedAmount,
  calcPFImpact,
  calcRealizedPL_FIFO
} from "../utils/tradeCalculations";

interface TradeUploadModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (trades: Trade[]) => void;
  portfolioSize?: number;
  getPortfolioSize?: (month: string, year: number) => number;
}

interface ParsedData {
  headers: string[];
  rows: any[][];
  fileName: string;
}

interface ColumnMapping {
  [key: string]: string; // Our field -> Their column
}

interface MappingConfidence {
  [key: string]: number; // Our field -> confidence score (0-100)
}

// Fields that should be imported from user data (manual input fields)
const USER_INPUT_FIELDS = [
  { key: 'tradeNo', label: 'Trade No.', required: false },
  { key: 'date', label: 'Date', required: true },
  { key: 'name', label: 'Stock Name', required: true },
  { key: 'setup', label: 'Setup', required: false },
  { key: 'buySell', label: 'Buy/Sell', required: false },
  { key: 'entry', label: 'Entry Price', required: false },
  { key: 'sl', label: 'Stop Loss', required: false },
  { key: 'tsl', label: 'Trailing SL', required: false },
  { key: 'initialQty', label: 'Initial Quantity', required: false },
  { key: 'pyramid1Price', label: 'Pyramid 1 Price', required: false },
  { key: 'pyramid1Qty', label: 'Pyramid 1 Qty', required: false },
  { key: 'pyramid1Date', label: 'Pyramid 1 Date', required: false },
  { key: 'pyramid2Price', label: 'Pyramid 2 Price', required: false },
  { key: 'pyramid2Qty', label: 'Pyramid 2 Qty', required: false },
  { key: 'pyramid2Date', label: 'Pyramid 2 Date', required: false },
  { key: 'exit1Price', label: 'Exit 1 Price', required: false },
  { key: 'exit1Qty', label: 'Exit 1 Qty', required: false },
  { key: 'exit1Date', label: 'Exit 1 Date', required: false },
  { key: 'exit2Price', label: 'Exit 2 Price', required: false },
  { key: 'exit2Qty', label: 'Exit 2 Qty', required: false },
  { key: 'exit2Date', label: 'Exit 2 Date', required: false },
  { key: 'exit3Price', label: 'Exit 3 Price', required: false },
  { key: 'exit3Qty', label: 'Exit 3 Qty', required: false },
  { key: 'exit3Date', label: 'Exit 3 Date', required: false },
  { key: 'planFollowed', label: 'Plan Followed', required: false },
  { key: 'exitTrigger', label: 'Exit Trigger', required: false },
  { key: 'proficiencyGrowthAreas', label: 'Growth Areas', required: false },
  { key: 'notes', label: 'Notes', required: false },
];

// Fields that are auto-populated and should NOT be imported from user data
const AUTO_POPULATED_FIELDS = [
  'cmp',           // Fetched from API
  'avgEntry',      // Calculated from entry + pyramids
  'positionSize',  // Calculated from avgEntry * totalQty
  'allocation',    // Calculated from positionSize / portfolioSize
  'slPercent',     // Calculated from SL vs Entry
  'openQty',       // Calculated from total - exited
  'exitedQty',     // Calculated from exit quantities
  'avgExitPrice',  // Calculated from exit prices/quantities
  'stockMove',     // Calculated from price movement
  'openHeat',      // Calculated from portfolio context
  'rewardRisk',    // Calculated from risk/reward ratio
  'holdingDays',   // Calculated from dates
  'positionStatus', // Calculated from open/exited quantities
  'realisedAmount', // Calculated from exits
  'plRs',          // Calculated using FIFO/accounting method
  'pfImpact',      // Calculated from P/L vs portfolio
  'cummPf',        // Calculated cumulatively across trades
  'unrealizedPL'   // Calculated for open positions
];

// Our trade fields that can be mapped (only user input fields)
const MAPPABLE_FIELDS = USER_INPUT_FIELDS;

// Optimized parsing functions for performance
const parseFlexibleNumber = (value: any): number => {
  if (value === null || value === undefined || value === '') return 0;

  // Fast path for numbers
  if (typeof value === 'number') return value;

  let stringValue = String(value).trim();

  // Handle Excel errors and special values
  if (stringValue === '#DIV/0!' || stringValue === '#N/A' || stringValue === '#ERROR!' ||
      stringValue === '#VALUE!' || stringValue === '#REF!' || stringValue === '#NAME?') {
    return 0;
  }

  // Quick check for simple numbers
  if (/^\d+\.?\d*$/.test(stringValue)) {
    return parseFloat(stringValue);
  }

  // Only do complex cleaning if needed
  stringValue = stringValue
    .replace(/[₹$€£¥,\s%]/g, '') // Remove currency symbols, commas, spaces, percentage
    .replace(/["']/g, '') // Remove quotes
    .replace(/[^\d.-]/g, ''); // Keep only digits, dots, and minus signs

  // Handle decimal comma (European format)
  if (/\d+,\d{1,2}$/.test(stringValue)) {
    stringValue = stringValue.replace(',', '.');
  }

  const parsed = parseFloat(stringValue);
  return isNaN(parsed) ? 0 : parsed;
};

const parseFlexibleDate = (value: any): string | null => {
  if (!value) return null;

  const stringValue = String(value).trim();
  if (!stringValue) return null;

  try {
    // Fast path: try direct Date parsing first
    let date = new Date(stringValue);

    // If direct parsing worked, validate and return
    if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
      return date.toISOString();
    }

    // Handle common CSV date formats only if direct parsing failed
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(stringValue)) {
      const [first, second, year] = stringValue.split('/').map(Number);
      // Assume DD/MM/YYYY if first > 12, otherwise MM/DD/YYYY
      if (first > 12) {
        date = new Date(year, second - 1, first);
      } else {
        date = new Date(year, first - 1, second);
      }
    } else if (/^\d{5}$/.test(stringValue)) {
      // Excel serial date
      const serialDate = parseInt(stringValue);
      date = new Date(1900, 0, serialDate - 1);
    }

    // Final validation
    if (!isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
      return date.toISOString();
    }
  } catch (error) {
    // Silently fail for performance
  }

  return null;
};

export const TradeUploadModal: React.FC<TradeUploadModalProps> = ({
  isOpen,
  onOpenChange,
  onImport,
  portfolioSize = 100000,
  getPortfolioSize
}) => {
  // Upload functionality is now enabled
  const isUploadDisabled = false;
  const [step, setStep] = useState<'upload' | 'dateFormat' | 'mapping' | 'preview' | 'importing'>('upload');
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [mappingConfidence, setMappingConfidence] = useState<MappingConfidence>({});
  const [previewTrades, setPreviewTrades] = useState<Trade[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDateFormat, setSelectedDateFormat] = useState<string>('auto');

  // Date format options
  const dateFormatOptions = [
    { value: 'auto', label: 'Auto-detect (Recommended)', example: 'Various formats', description: 'Let the system automatically detect your date format' },
    { value: 'iso', label: 'ISO Format', example: '2024-01-15', description: 'Year-Month-Day with dashes' },
    { value: 'dmy_slash', label: 'DD/MM/YYYY', example: '15/01/2024', description: 'Day/Month/Year with slashes' },
    { value: 'mdy_slash', label: 'MM/DD/YYYY', example: '01/15/2024', description: 'Month/Day/Year with slashes (US format)' },
    { value: 'dmy_dash', label: 'DD-MM-YYYY', example: '15-01-2024', description: 'Day-Month-Year with dashes' },
    { value: 'dmy_dot', label: 'DD.MM.YYYY', example: '15.01.2024', description: 'Day.Month.Year with dots' },
    { value: 'dmy_text_full', label: 'DD MMM YYYY', example: '24 Jul 2024', description: 'Day Month Year with text month' },
    { value: 'dmy_text_short', label: 'DD MMM YY', example: '24 Jul 24', description: 'Day Month Year (2-digit year) with text month' },
    { value: 'dmy_text_no_year', label: 'DD MMM', example: '24 Jul', description: 'Day Month only (current year assumed)' },
    { value: 'mdy_text_full', label: 'MMM DD, YYYY', example: 'Jul 24, 2024', description: 'Month Day, Year with text month (US format)' },
    { value: 'mdy_text_short', label: 'MMM DD YY', example: 'Jul 24 24', description: 'Month Day Year (2-digit year) with text month' },
  ];

  // Month name mappings for text-based dates
  const monthNames = {
    'jan': 0, 'january': 0,
    'feb': 1, 'february': 1,
    'mar': 2, 'march': 2,
    'apr': 3, 'april': 3,
    'may': 4,
    'jun': 5, 'june': 5,
    'jul': 6, 'july': 6,
    'aug': 7, 'august': 7,
    'sep': 8, 'september': 8, 'sept': 8,
    'oct': 9, 'october': 9,
    'nov': 10, 'november': 10,
    'dec': 11, 'december': 11
  };

  // Robust date parsing function to handle various date formats
  const parseDate = useCallback((dateStr: string, formatHint?: string): string | null => {
    if (!dateStr || typeof dateStr !== 'string') return null;

    const cleanDateStr = String(dateStr).trim();
    if (!cleanDateStr) return null;

    const format = formatHint || selectedDateFormat;

    // If user specified a specific format, try that first
    if (format !== 'auto') {
      try {
        let parsedDate: Date;

        switch (format) {
          case 'iso': {
            // YYYY-MM-DD
            const parts = cleanDateStr.split(/[\/\-\.]/);
            if (parts.length === 3) {
              const [part1, part2, part3] = parts.map(p => parseInt(p, 10));
              parsedDate = new Date(part1, part2 - 1, part3);
            } else {
              parsedDate = new Date(cleanDateStr);
            }
            break;
          }
          case 'dmy_slash':
          case 'dmy_dash':
          case 'dmy_dot': {
            // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
            const parts = cleanDateStr.split(/[\/\-\.]/);
            if (parts.length === 3) {
              const [part1, part2, part3] = parts.map(p => parseInt(p, 10));
              parsedDate = new Date(part3, part2 - 1, part1);
            } else {
              parsedDate = new Date(cleanDateStr);
            }
            break;
          }
          case 'mdy_slash': {
            // MM/DD/YYYY
            const parts = cleanDateStr.split(/[\/\-\.]/);
            if (parts.length === 3) {
              const [part1, part2, part3] = parts.map(p => parseInt(p, 10));
              parsedDate = new Date(part3, part1 - 1, part2);
            } else {
              parsedDate = new Date(cleanDateStr);
            }
            break;
          }
          case 'dmy_text_full': {
            // DD MMM YYYY (e.g., "24 Jul 2024")
            const parts = cleanDateStr.split(/\s+/);
            if (parts.length === 3) {
              const day = parseInt(parts[0], 10);
              const monthName = parts[1].toLowerCase();
              const year = parseInt(parts[2], 10);
              const month = monthNames[monthName as keyof typeof monthNames];
              if (month !== undefined) {
                parsedDate = new Date(year, month, day);
              } else {
                parsedDate = new Date(cleanDateStr);
              }
            } else {
              parsedDate = new Date(cleanDateStr);
            }
            break;
          }
          case 'dmy_text_short': {
            // DD MMM YY (e.g., "24 Jul 24")
            const parts = cleanDateStr.split(/\s+/);
            if (parts.length === 3) {
              const day = parseInt(parts[0], 10);
              const monthName = parts[1].toLowerCase();
              let year = parseInt(parts[2], 10);
              // Convert 2-digit year to 4-digit (assume 2000s for 00-30, 1900s for 31-99)
              if (year <= 30) year += 2000;
              else if (year < 100) year += 1900;
              const month = monthNames[monthName as keyof typeof monthNames];
              if (month !== undefined) {
                parsedDate = new Date(year, month, day);
              } else {
                parsedDate = new Date(cleanDateStr);
              }
            } else {
              parsedDate = new Date(cleanDateStr);
            }
            break;
          }
          case 'dmy_text_no_year': {
            // DD MMM (e.g., "24 Jul") - assume current year
            const parts = cleanDateStr.split(/\s+/);
            if (parts.length === 2) {
              const day = parseInt(parts[0], 10);
              const monthName = parts[1].toLowerCase();
              const year = new Date().getFullYear(); // Use current year
              const month = monthNames[monthName as keyof typeof monthNames];
              if (month !== undefined) {
                parsedDate = new Date(year, month, day);
              } else {
                parsedDate = new Date(cleanDateStr);
              }
            } else {
              parsedDate = new Date(cleanDateStr);
            }
            break;
          }
          case 'mdy_text_full': {
            // MMM DD, YYYY (e.g., "Jul 24, 2024")
            const parts = cleanDateStr.replace(',', '').split(/\s+/);
            if (parts.length === 3) {
              const monthName = parts[0].toLowerCase();
              const day = parseInt(parts[1], 10);
              const year = parseInt(parts[2], 10);
              const month = monthNames[monthName as keyof typeof monthNames];
              if (month !== undefined) {
                parsedDate = new Date(year, month, day);
              } else {
                parsedDate = new Date(cleanDateStr);
              }
            } else {
              parsedDate = new Date(cleanDateStr);
            }
            break;
          }
          case 'mdy_text_short': {
            // MMM DD YY (e.g., "Jul 24 24")
            const parts = cleanDateStr.split(/\s+/);
            if (parts.length === 3) {
              const monthName = parts[0].toLowerCase();
              const day = parseInt(parts[1], 10);
              let year = parseInt(parts[2], 10);
              // Convert 2-digit year to 4-digit
              if (year <= 30) year += 2000;
              else if (year < 100) year += 1900;
              const month = monthNames[monthName as keyof typeof monthNames];
              if (month !== undefined) {
                parsedDate = new Date(year, month, day);
              } else {
                parsedDate = new Date(cleanDateStr);
              }
            } else {
              parsedDate = new Date(cleanDateStr);
            }
            break;
          }
          default:
            parsedDate = new Date(cleanDateStr);
        }

        if (!isNaN(parsedDate.getTime())) {
          return parsedDate.toISOString().split('T')[0];
        }
      } catch (error) {
        }
    }

    // Fallback to auto-detection if specific format fails or auto is selected
    // Try parsing as-is first (for ISO dates)
    let parsedDate = new Date(cleanDateStr);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().split('T')[0];
    }

    // Try text-based date formats first (more specific)
    const textParts = cleanDateStr.split(/\s+/);
    if (textParts.length >= 2) {
      const firstPart = textParts[0];
      const secondPart = textParts[1];

      // Check if second part looks like a month name
      const monthName = secondPart.toLowerCase();
      if (monthNames[monthName as keyof typeof monthNames] !== undefined) {
        const month = monthNames[monthName as keyof typeof monthNames];
        const day = parseInt(firstPart, 10);

        if (textParts.length === 3) {
          // DD MMM YYYY or DD MMM YY
          let year = parseInt(textParts[2], 10);
          if (year <= 30) year += 2000;
          else if (year < 100) year += 1900;

          parsedDate = new Date(year, month, day);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString().split('T')[0];
          }
        } else if (textParts.length === 2) {
          // DD MMM (assume current year)
          const year = new Date().getFullYear();
          parsedDate = new Date(year, month, day);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString().split('T')[0];
          }
        }
      }

      // Check if first part looks like a month name (US format)
      const firstMonthName = firstPart.toLowerCase();
      if (monthNames[firstMonthName as keyof typeof monthNames] !== undefined) {
        const month = monthNames[firstMonthName as keyof typeof monthNames];
        const day = parseInt(secondPart.replace(',', ''), 10);

        if (textParts.length === 3) {
          // MMM DD, YYYY or MMM DD YY
          let year = parseInt(textParts[2], 10);
          if (year <= 30) year += 2000;
          else if (year < 100) year += 1900;

          parsedDate = new Date(year, month, day);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString().split('T')[0];
          }
        }
      }
    }

    // Try numeric date formats
    const parts = cleanDateStr.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const [part1, part2, part3] = parts.map(p => parseInt(p, 10));

      // If year is clearly identifiable (4 digits)
      if (part3 > 1900) {
        // DD/MM/YYYY format (try first - more common internationally)
        parsedDate = new Date(part3, part2 - 1, part1);
        if (!isNaN(parsedDate.getTime()) && part1 <= 31 && part2 <= 12) {
          return parsedDate.toISOString().split('T')[0];
        }

        // MM/DD/YYYY format (US format)
        parsedDate = new Date(part3, part1 - 1, part2);
        if (!isNaN(parsedDate.getTime()) && part2 <= 31 && part1 <= 12) {
          return parsedDate.toISOString().split('T')[0];
        }
      } else if (part1 > 1900) {
        // YYYY/MM/DD format
        parsedDate = new Date(part1, part2 - 1, part3);
        if (!isNaN(parsedDate.getTime()) && part3 <= 31 && part2 <= 12) {
          return parsedDate.toISOString().split('T')[0];
        }
      }
    }

    return null;
  }, [selectedDateFormat]);

  // Function to recalculate all auto-populated fields for a trade
  // NOTE: CMP will be auto-fetched from API when trade name is set, not imported from CSV
  const recalculateTradeFields = useCallback((trade: Trade): Trade => {
    // Get portfolio size for the trade date
    const tradeDate = new Date(trade.date);
    const month = tradeDate.toLocaleString('default', { month: 'short' });
    const year = tradeDate.getFullYear();
    const tradePortfolioSize = getPortfolioSize ? getPortfolioSize(month, year) : portfolioSize;

    // Gather all entry lots (initial + pyramids)
    const allEntries = [
      { price: trade.entry, qty: trade.initialQty },
      ...(trade.pyramid1Price && trade.pyramid1Qty ? [{ price: trade.pyramid1Price, qty: trade.pyramid1Qty }] : []),
      ...(trade.pyramid2Price && trade.pyramid2Qty ? [{ price: trade.pyramid2Price, qty: trade.pyramid2Qty }] : [])
    ].filter(e => e.price > 0 && e.qty > 0);

    // Gather all exit lots with dates
    const allExits = [
      ...(trade.exit1Price && trade.exit1Qty ? [{
        price: trade.exit1Price,
        qty: trade.exit1Qty,
        date: trade.exit1Date || trade.date
      }] : []),
      ...(trade.exit2Price && trade.exit2Qty ? [{
        price: trade.exit2Price,
        qty: trade.exit2Qty,
        date: trade.exit2Date || trade.date
      }] : []),
      ...(trade.exit3Price && trade.exit3Qty ? [{
        price: trade.exit3Price,
        qty: trade.exit3Qty,
        date: trade.exit3Date || trade.date
      }] : [])
    ].filter(e => e.price > 0 && e.qty > 0);

    // Calculate derived values
    const totalInitialQty = allEntries.reduce((sum, e) => sum + e.qty, 0);
    const avgEntry = calcAvgEntry(allEntries);
    const positionSize = calcPositionSize(avgEntry, totalInitialQty);
    const allocation = calcAllocation(positionSize, tradePortfolioSize);
    const slPercent = calcSLPercent(trade.sl, trade.entry);

    const exitedQty = allExits.reduce((sum, e) => sum + e.qty, 0);
    const openQty = Math.max(0, totalInitialQty - exitedQty);
    const avgExitPrice = calcAvgExitPrice(allExits);

    // Determine position status
    let positionStatus: 'Open' | 'Closed' | 'Partial' = trade.positionStatus || 'Open';
    if (exitedQty === 0) {
      positionStatus = 'Open';
    } else if (exitedQty >= totalInitialQty) {
      positionStatus = 'Closed';
    } else {
      positionStatus = 'Partial';
    }

    const stockMove = calcStockMove(
      avgEntry,
      avgExitPrice,
      trade.cmp,
      openQty,
      exitedQty,
      positionStatus,
      trade.buySell
    );

    const rewardRisk = calcRewardRisk(
      trade.cmp || avgExitPrice || trade.entry,
      trade.entry,
      trade.sl,
      positionStatus,
      avgExitPrice,
      openQty,
      exitedQty,
      trade.buySell
    );

    const holdingDays = calcHoldingDays(
      trade.date,
      allExits.length > 0 ? allExits[allExits.length - 1].date : trade.date
    );

    const realisedAmount = calcRealisedAmount(exitedQty, avgExitPrice);

    // Calculate P/L using FIFO method
    const entryLotsForFifo = allEntries.map(e => ({ price: e.price, qty: e.qty }));
    const exitLotsForFifo = allExits.map(e => ({ price: e.price, qty: e.qty }));
    const plRs = exitedQty > 0 ? calcRealizedPL_FIFO(entryLotsForFifo, exitLotsForFifo, trade.buySell as 'Buy' | 'Sell') : 0;

    // Note: PF Impact calculation in upload modal uses entry date portfolio size
    // This is acceptable for initial calculation as accounting method-specific
    // recalculation will happen in the main trade processing pipeline
    const pfImpact = calcPFImpact(plRs, tradePortfolioSize);

    return {
      ...trade,
      avgEntry,
      positionSize,
      allocation,
      slPercent,
      openQty,
      exitedQty,
      avgExitPrice,
      stockMove,
      rewardRisk,
      holdingDays,
      positionStatus,
      realisedAmount,
      plRs,
      pfImpact,
      cummPf: 0, // This would need to be calculated across all trades
      openHeat: 0 // This would need portfolio context
    };
  }, [portfolioSize, getPortfolioSize]);

  // Smart column mapping based on header similarity AND data content validation
  const generateSmartMapping = useCallback((headers: string[]): { mapping: ColumnMapping; confidence: MappingConfidence } => {
    const mapping: ColumnMapping = {};
    const confidence: MappingConfidence = {};

    // Helper function to check if a column has meaningful data
    const hasValidData = (columnIndex: number): boolean => {
      if (!parsedData || columnIndex >= headers.length) return true; // Default to true

      const columnName = headers[columnIndex];

      // For optional fields that are commonly empty, always return true
      const optionalFields = [
        'Setup', 'TSL (₹)', 'CMP (₹)', 'P2 Price (₹)', 'P2 Qty', 'P2 Date',
        'E3 Price (₹)', 'E3 Qty', 'E3 Date', 'Open Qty', 'Exit Trigger',
        'Growth Areas', 'Notes', 'Charts'
      ];

      if (optionalFields.some(field => columnName.includes(field))) {
        console.log(`✅ Allowing empty optional field: ${columnName}`);
        return true;
      }

      // Check first 10 rows to see if column has any data (more thorough check)
      const sampleRows = parsedData.rows.slice(0, 10);
      let nonEmptyCount = 0;

      for (const row of sampleRows) {
        const value = row[columnIndex];
        if (value !== null && value !== undefined && String(value).trim() !== '' &&
            String(value).trim() !== '#DIV/0!' && String(value).trim() !== '#N/A') {
          nonEmptyCount++;
        }
      }

      // Column should have data in at least 1 row to be considered valid (very lenient)
      const isValid = nonEmptyCount >= 1;
      if (!isValid) {
        console.log(`📊 Column ${headers[columnIndex]} has no valid data (${nonEmptyCount}/${sampleRows.length} rows)`);
      }
      return isValid;
    };

    // Helper function to validate if column data matches expected field type
    const validateFieldDataType = (field: string, columnIndex: number): boolean => {
      if (!parsedData || columnIndex >= headers.length) return true; // Default to true if no data

      const columnHeader = headers[columnIndex].toLowerCase();

      // Only prevent very specific wrong mappings that we know cause issues
      if (field === 'cmp' && (columnHeader.includes('r:r') || columnHeader.includes('reward'))) {
        console.log(`🚫 Preventing CMP from mapping to ${headers[columnIndex]} (contains reward/risk)`);
        return false;
      }

      if (field === 'rewardRisk' && (columnHeader.includes('cmp') && !columnHeader.includes('r:r'))) {
        console.log(`🚫 Preventing rewardRisk from mapping to ${headers[columnIndex]} (CMP field)`);
        return false;
      }

      // For all other cases, be extremely permissive
      console.log(`✅ Allowing ${field} to map to ${headers[columnIndex]}`);
      return true;
    };

    // Enhanced similarity mapping - ONLY for user input fields (auto-populated fields excluded)
    // Special handling for ambiguous "Date" columns by considering context
    const similarityMap: { [key: string]: string[] } = {
      'tradeNo': ['trade no', 'trade number', 'trade id', 'id', 'sr no', 'serial', 'trade #', '#', 'trade no.'],
      'date': ['date', 'entry date', 'trade date', 'timestamp', 'entry dt', 'dt'],
      'name': ['name', 'stock', 'symbol', 'stock name', 'company', 'scrip', 'ticker', 'instrument'],
      'setup': ['setup', 'strategy', 'pattern', 'setup type', 'trade setup', 'setup name'],
      'buySell': ['buy/sell', 'buysell', 'side', 'action', 'transaction type', 'buy sell', 'direction', 'buy/ sell'],
      'entry': ['entry', 'entry price', 'buy price', 'price', 'entry rate', 'buy rate', 'entry (₹)'],
      'avgEntry': ['avg entry', 'average entry', 'avg. entry', 'avg entry (₹)', 'average entry price', 'avg entry price'],
      'sl': ['sl', 'stop loss', 'stoploss', 'stop', 'sl price', 'stop price', 'sl (₹)'],
      'tsl': ['tsl', 'trailing sl', 'trailing stop', 'trail sl', 'trailing stop loss', 'tsl (₹)'],
      'cmp': ['cmp', 'current price', 'market price', 'ltp', 'last traded price', 'cmp (₹)', 'current market price'],
      'initialQty': ['qty', 'quantity', 'initial qty', 'shares', 'units', 'volume', 'size', 'initial qty', 'base qty', 'initial qty'],
      'positionSize': ['position size', 'pos size', 'pos. size', 'position value', 'trade size'],
      'allocation': ['allocation', 'allocation %', 'allocation (%)', 'alloc', 'alloc %'],
      'slPercent': ['sl %', 'sl percent', 'stop loss %', 'stop loss percent', 'sl percentage', 'sl%', 'sl per', 'stop loss per', 'stoploss %', 'stoploss percent'],
      'pyramid1Price': ['pyramid 1 price', 'p1 price', 'p-1 price', 'pyramid1 price', 'pyr1 price', 'pyramid-1 price', 'pyramid-1 price (₹)', 'p1 price (₹)'],
      'pyramid1Qty': ['pyramid 1 qty', 'p1 qty', 'p-1 qty', 'pyramid1 qty', 'pyr1 qty', 'p-1\nqty', 'p-1 qty', 'p1 qty'],
      'pyramid1Date': ['pyramid 1 date', 'p1 date', 'p-1 date', 'pyramid1 date', 'pyr1 date', 'p-1\ndate', 'p-1 date', 'p1 date'],
      'pyramid2Price': ['pyramid 2 price', 'p2 price', 'p-2 price', 'pyramid2 price', 'pyr2 price', 'pyramid-2\nprice', 'pyramid-2 price', 'pyramid-2 price (₹)', 'pyramid-2 price', 'p2 price (₹)'],
      'pyramid2Qty': ['pyramid 2 qty', 'p2 qty', 'p-2 qty', 'pyramid2 qty', 'pyr2 qty', 'p-2\nqty', 'p-2 qty', 'p-2 qty', 'p2 qty'],
      'pyramid2Date': ['pyramid 2 date', 'p2 date', 'p-2 date', 'pyramid2 date', 'pyr2 date', 'p-2\ndate', 'p-2 date', 'p-2 date', 'p2 date'],
      'exit1Price': ['exit 1 price', 'e1 price', 'exit1 price', 'sell 1 price', 'exit price', 'exit-1\nprice', 'exit-1 price', 'exit-1 price (₹)', 'e1 price (₹)'],
      'exit1Qty': ['exit 1 qty', 'e1 qty', 'exit1 qty', 'sell 1 qty', 'exit qty', 'exit-1\nqty', 'exit-1 qty', 'e1 qty'],
      'exit1Date': ['exit 1 date', 'e1 date', 'exit1 date', 'sell 1 date', 'exit date', 'e1date', 'e1dt', 'exit1dt', 'first exit date', 'exit date 1'],
      'exit2Price': ['exit 2 price', 'e2 price', 'exit2 price', 'sell 2 price', 'exit-2\nprice', 'exit-2 price', 'exit-2 price (₹)', 'e2 price (₹)'],
      'exit2Qty': ['exit 2 qty', 'e2 qty', 'exit2 qty', 'sell 2 qty', 'exit-2\nqty', 'exit-2 qty', 'e2 qty'],
      'exit2Date': ['exit 2 date', 'e2 date', 'exit2 date', 'sell 2 date', 'e2date', 'e2dt', 'exit2dt', 'second exit date', 'exit date 2'],
      'exit3Price': ['exit 3 price', 'e3 price', 'exit3 price', 'sell 3 price', 'exit-3\nprice', 'exit-3 price', 'exit-3 price (₹)', 'exit-3 price', 'e3 price (₹)'],
      'exit3Qty': ['exit 3 qty', 'e3 qty', 'exit3 qty', 'sell 3 qty', 'exit-3\nqty', 'exit-3 qty', 'exit-3 qty', 'e3 qty'],
      'exit3Date': ['exit 3 date', 'e3 date', 'exit3 date', 'sell 3 date', 'e3date', 'e3dt', 'exit3dt', 'third exit date', 'exit date 3'],
      'openQty': ['open qty', 'open quantity', 'open qty', 'remaining qty', 'balance qty'],
      'exitedQty': ['exited qty', 'exited quantity', 'exited qty', 'sold qty', 'closed qty'],
      'avgExitPrice': ['avg exit', 'average exit', 'avg. exit', 'avg exit price', 'average exit price', 'avg. exit price'],
      'stockMove': ['stock move', 'stock move %', 'stock move (%)', 'price move', 'move %'],
      'openHeat': ['open heat', 'open heat %', 'open heat (%)', 'heat', 'heat %'],
      'rewardRisk': ['r:r', 'reward:risk', 'reward: risk', 'rr', 'risk reward', 'reward risk', 'reward:risk', 'reward : risk'],
      'holdingDays': ['holding days', 'days', 'hold days', 'duration', 'holding period'],
      'positionStatus': ['status', 'position status', 'trade status', 'pos status'],
      'realisedAmount': ['realised amount', 'realized amount', 'realised amt', 'realized amt', 'trade amount'],
      'plRs': ['p/l', 'p/l rs', 'p/l (₹)', 'realized p/l', 'realised p/l', 'realized p/l (₹)', 'profit loss', 'pnl'],
      'pfImpact': ['pf impact', 'pf impact %', 'pf impact (%)', 'portfolio impact', 'portfolio impact %'],
      'cummPf': ['cumm pf', 'cumm. pf', 'cumm pf %', 'cumm. pf (%)', 'cumulative pf', 'cumulative portfolio'],
      'planFollowed': ['plan followed', 'plan followed?', 'followed plan', 'plan \nfollowed?'],
      'exitTrigger': ['exit trigger', 'trigger', 'exit reason', 'exit trigger', 'exit cause', 'reason'],
      'proficiencyGrowthAreas': ['growth areas', 'proficiency', 'improvement areas', 'growth areas', 'areas', 'improvement'],
      'baseDuration': ['base duration', 'duration', 'time frame', 'holding period'],
      'notes': ['notes', 'comments', 'remarks', 'description', 'memo', 'observation', 'note']
    };

    // Function to calculate similarity score between two strings
    const calculateSimilarity = (str1: string, str2: string): number => {
      const s1 = str1.toLowerCase().trim();
      const s2 = str2.toLowerCase().trim();

      // Exact match
      if (s1 === s2) return 100;

      // Contains match
      if (s1.includes(s2) || s2.includes(s1)) return 80;

      // Remove common separators, newlines, special characters, and currency symbols for better matching
      const clean1 = s1.replace(/[-_\s\n\r\/\(\)\.\?:₹%]/g, '');
      const clean2 = s2.replace(/[-_\s\n\r\/\(\)\.\?:₹%]/g, '');
      if (clean1 === clean2) return 95;
      if (clean1.includes(clean2) || clean2.includes(clean1)) return 85;

      // Handle multi-line headers by removing newlines and extra spaces
      const normalized1 = s1.replace(/\s+/g, ' ').replace(/\n/g, ' ');
      const normalized2 = s2.replace(/\s+/g, ' ').replace(/\n/g, ' ');
      if (normalized1 === normalized2) return 90;
      if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return 75;

      // Enhanced word-based matching with better tokenization and abbreviation handling
      const words1 = s1.split(/[-_\s\n\r\/\(\)\.\?:₹%]+/).filter(w => w.length > 0);
      const words2 = s2.split(/[-_\s\n\r\/\(\)\.\?:₹%]+/).filter(w => w.length > 0);

      // Handle common abbreviations and variations
      const normalizeWord = (word: string): string => {
        const abbrevMap: { [key: string]: string } = {
          'qty': 'quantity',
          'avg': 'average',
          'pos': 'position',
          'pf': 'portfolio',
          'cumm': 'cumulative',
          'realised': 'realized',
          'amt': 'amount',
          'rs': 'rupees',
          'sl': 'stoploss',
          'tsl': 'trailingstop',
          'cmp': 'currentprice',
          'pl': 'profitloss',
          'pnl': 'profitloss'
        };
        return abbrevMap[word] || word;
      };

      const normalizedWords1 = words1.map(normalizeWord);
      const normalizedWords2 = words2.map(normalizeWord);

      const commonWords = normalizedWords1.filter(word => normalizedWords2.includes(word));
      if (commonWords.length > 0) {
        const score = (commonWords.length / Math.max(normalizedWords1.length, normalizedWords2.length)) * 70;
        return Math.min(score, 85); // Cap at 85 to ensure exact matches get higher scores
      }

      // Partial word matching for compound words
      let partialMatches = 0;
      for (const word1 of normalizedWords1) {
        for (const word2 of normalizedWords2) {
          if (word1.length > 2 && word2.length > 2) {
            if (word1.includes(word2) || word2.includes(word1)) {
              partialMatches++;
              break;
            }
          }
        }
      }

      if (partialMatches > 0) {
        return (partialMatches / Math.max(normalizedWords1.length, normalizedWords2.length)) * 50;
      }

      return 0;
    };

    // Special context-aware mapping for ambiguous "Date" columns and duplicate "SL" columns
    const mapAmbiguousColumnsWithContext = () => {
      const dateColumns: Array<{header: string, index: number}> = [];
      const slColumns: Array<{header: string, index: number}> = [];

      // Find all "Date" and "SL" columns with their positions
      headers.forEach((header, index) => {
        const cleanHeader = header.toLowerCase().trim();
        if (cleanHeader === 'date') {
          dateColumns.push({ header, index });
        }
        if (cleanHeader === 'sl') {
          slColumns.push({ header, index });
        }
      });

      // Handle multiple "Date" columns
      if (dateColumns.length > 1) {
        dateColumns.forEach((dateCol, arrayIndex) => {
          const colIndex = dateCol.index;

          // Look at previous 2 columns for better context
          const prev1Col = colIndex > 0 ? headers[colIndex - 1]?.toLowerCase().trim() : '';
          const prev2Col = colIndex > 1 ? headers[colIndex - 2]?.toLowerCase().trim() : '';

          // Map based on context and position
          if (arrayIndex === 0 && colIndex < 10) {
            // First "Date" column early in the CSV is likely the main trade date
            if (!mapping['date']) {
              mapping['date'] = dateCol.header;
              confidence['date'] = 95;
            }
          } else {
            // Subsequent "Date" columns - check context with enhanced patterns
            if (prev1Col.includes('qty') && (prev2Col.includes('exit-1') || prev2Col.includes('e1') || prev1Col.includes('exit'))) {
              if (!mapping['exit1Date']) {
                mapping['exit1Date'] = dateCol.header;
                confidence['exit1Date'] = 90;
              }
            } else if (prev1Col.includes('qty') && (prev2Col.includes('exit-2') || prev2Col.includes('e2'))) {
              if (!mapping['exit2Date']) {
                mapping['exit2Date'] = dateCol.header;
                confidence['exit2Date'] = 90;
              }
            } else if (prev1Col.includes('qty') && (prev2Col.includes('exit-3') || prev2Col.includes('e3'))) {
              if (!mapping['exit3Date']) {
                mapping['exit3Date'] = dateCol.header;
                confidence['exit3Date'] = 90;
              }
            } else if (prev1Col.includes('qty') && prev2Col.includes('p-1')) {
              if (!mapping['pyramid1Date']) {
                mapping['pyramid1Date'] = dateCol.header;
                confidence['pyramid1Date'] = 90;
              }
            } else if (prev1Col.includes('qty') && prev2Col.includes('p-2')) {
              if (!mapping['pyramid2Date']) {
                mapping['pyramid2Date'] = dateCol.header;
                confidence['pyramid2Date'] = 90;
              }
            }
            // Enhanced context patterns for your specific CSV format
            else if (prev1Col.includes('e1') && prev1Col.includes('qty')) {
              if (!mapping['exit1Date']) {
                mapping['exit1Date'] = dateCol.header;
                confidence['exit1Date'] = 85;
              }
            } else if (prev1Col.includes('e2') && prev1Col.includes('qty')) {
              if (!mapping['exit2Date']) {
                mapping['exit2Date'] = dateCol.header;
                confidence['exit2Date'] = 85;
              }
            } else if (prev1Col.includes('e3') && prev1Col.includes('qty')) {
              if (!mapping['exit3Date']) {
                mapping['exit3Date'] = dateCol.header;
                confidence['exit3Date'] = 85;
              }
            }
            // Check for exact E1, E2, E3 date patterns
            else if (colIndex > 0 && headers[colIndex - 1]?.toLowerCase().includes('e1')) {
              if (!mapping['exit1Date']) {
                mapping['exit1Date'] = dateCol.header;
                confidence['exit1Date'] = 90;
              }
            } else if (colIndex > 0 && headers[colIndex - 1]?.toLowerCase().includes('e2')) {
              if (!mapping['exit2Date']) {
                mapping['exit2Date'] = dateCol.header;
                confidence['exit2Date'] = 90;
              }
            } else if (colIndex > 0 && headers[colIndex - 1]?.toLowerCase().includes('e3')) {
              if (!mapping['exit3Date']) {
                mapping['exit3Date'] = dateCol.header;
                confidence['exit3Date'] = 90;
              }
            }
            // Fallback: map remaining Date columns to exit dates in order
            else if (arrayIndex === 1 && !mapping['exit1Date']) {
              mapping['exit1Date'] = dateCol.header;
              confidence['exit1Date'] = 75;
            } else if (arrayIndex === 2 && !mapping['exit2Date']) {
              mapping['exit2Date'] = dateCol.header;
              confidence['exit2Date'] = 75;
            } else if (arrayIndex === 3 && !mapping['exit3Date']) {
              mapping['exit3Date'] = dateCol.header;
              confidence['exit3Date'] = 75;
            }
          }
        });
      }

      // Handle multiple "SL" columns - first one is stop loss, second might be something else
      if (slColumns.length > 1) {
        slColumns.forEach((slCol, arrayIndex) => {
          const colIndex = slCol.index;

          // Look at surrounding columns for context
          const prev1Col = colIndex > 0 ? headers[colIndex - 1]?.toLowerCase().trim() : '';
          const next1Col = colIndex < headers.length - 1 ? headers[colIndex + 1]?.toLowerCase().trim() : '';

          if (arrayIndex === 0) {
            // First SL column is likely the actual stop loss
            if (!mapping['sl']) {
              mapping['sl'] = slCol.header;
              confidence['sl'] = 95;
            }
          } else {
            // Subsequent SL columns might be something else - skip or handle differently
            // Don't map subsequent SL columns to avoid confusion
            console.log('Skipping duplicate SL column at index:', colIndex, 'with context:', prev1Col, next1Col);
          }
        });
      }
    };

    // Apply context-aware mapping for ambiguous columns first
    mapAmbiguousColumnsWithContext();

    // Enhanced direct mapping for specific known columns with variations
    const directMappings: { [key: string]: string } = {
      'E1 Date': 'exit1Date',
      'E2 Date': 'exit2Date',
      'E3 Date': 'exit3Date',
      'SL %': 'slPercent',
      // Add common variations
      'Exit 1 Date': 'exit1Date',
      'Exit 2 Date': 'exit2Date',
      'Exit 3 Date': 'exit3Date',
      'Exit1 Date': 'exit1Date',
      'Exit2 Date': 'exit2Date',
      'Exit3 Date': 'exit3Date',
      'E1Date': 'exit1Date',
      'E2Date': 'exit2Date',
      'E3Date': 'exit3Date',
      'SL%': 'slPercent',
      'SL Percent': 'slPercent',
      'SL Per': 'slPercent',
      'Stop Loss %': 'slPercent',
      'Stop Loss Percent': 'slPercent'
    };

    console.log('🔍 Checking direct mappings...');
    Object.entries(directMappings).forEach(([columnName, fieldName]) => {
      // Try exact match first
      let columnIndex = headers.findIndex(h => h === columnName);

      // If exact match fails, try case-insensitive match
      if (columnIndex === -1) {
        columnIndex = headers.findIndex(h => h.toLowerCase().trim() === columnName.toLowerCase().trim());
      }

      // If still not found, try fuzzy matching for close variations
      if (columnIndex === -1) {
        columnIndex = headers.findIndex(h => {
          const cleanHeader = h.toLowerCase().replace(/[-_\s\n\r\/\(\)\.\?:₹%]/g, '');
          const cleanColumn = columnName.toLowerCase().replace(/[-_\s\n\r\/\(\)\.\?:₹%]/g, '');
          return cleanHeader === cleanColumn;
        });
      }

      console.log(`Looking for column "${columnName}" for field "${fieldName}": found at index ${columnIndex}`);

      if (columnIndex !== -1) {
        const actualColumnName = headers[columnIndex];
        const alreadyMappedField = mapping[fieldName];
        const columnAlreadyUsed = Object.values(mapping).includes(actualColumnName);

        console.log(`  - Field "${fieldName}" already mapped: ${alreadyMappedField ? 'YES to ' + alreadyMappedField : 'NO'}`);
        console.log(`  - Column "${actualColumnName}" already used: ${columnAlreadyUsed ? 'YES' : 'NO'}`);

        if (!mapping[fieldName] && !Object.values(mapping).includes(actualColumnName)) {
          mapping[fieldName] = actualColumnName;
          confidence[fieldName] = 100;
          console.log(`🎯 Direct mapping: ${fieldName} → "${actualColumnName}" (100%)`);
        } else {
          console.log(`❌ Skipping direct mapping for ${fieldName} → "${actualColumnName}"`);
        }
      } else {
        console.log(`❌ Column "${columnName}" not found in headers`);
        console.log(`📋 Available headers:`, headers);
      }
    });

    // Priority mapping: Map exact matches first, then similar matches
    const priorityFields = ['cmp', 'rewardRisk', 'setup', 'name']; // Fields that need exact matching first
    const regularFields = Object.keys(similarityMap).filter(field => !priorityFields.includes(field));

    // Process priority fields first with strict matching
    [...priorityFields, ...regularFields].forEach(field => {
      // Skip if already mapped by context-aware function
      if (mapping[field]) return;

      const keywords = similarityMap[field];
      if (!keywords) return;

      let bestMatch = '';
      let bestScore = 0;

      headers.forEach((header, headerIndex) => {
        keywords.forEach(keyword => {
          const score = calculateSimilarity(header, keyword);

          // Use different thresholds for different field types
          let threshold = 60; // Lower default threshold
          if (['setup', 'name', 'exitTrigger', 'proficiencyGrowthAreas', 'notes', 'baseDuration'].includes(field)) {
            threshold = 50; // Very low threshold for text fields
          } else if (['cmp', 'rewardRisk'].includes(field)) {
            threshold = 85; // Moderate threshold for fields that often get confused
          }

          if (score > bestScore && score >= threshold) {
            // Additional validation: check if this column actually has data and matches expected data type
            const hasData = hasValidData(headerIndex);
            const validDataType = validateFieldDataType(field, headerIndex);

            if (hasData && validDataType) {
              bestScore = score;
              bestMatch = header;
            } else {
              console.log(`❌ Skipping mapping for ${field} to ${header} (score: ${score}%) - hasData: ${hasData}, validDataType: ${validDataType}`);
            }
          }
        });
      });

      if (bestMatch && !Object.values(mapping).includes(bestMatch)) {
        mapping[field] = bestMatch;
        confidence[field] = bestScore;
        console.log('✅ Mapped field:', field, 'to column:', bestMatch, 'with confidence:', bestScore);
      } else if (bestMatch && Object.values(mapping).includes(bestMatch)) {
        console.log('⚠️ Column already mapped:', bestMatch, 'skipping field:', field);
      } else {
        console.log('❌ No suitable mapping found for field:', field);
      }
    });

    return { mapping, confidence };
  }, [parsedData]);

  const handleFileUpload = useCallback((file: File) => {
    setError(null); // Clear any previous errors
    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    if (fileExtension === 'csv') {
      Papa.parse(file, {
        complete: (results) => {
          try {
            if (results.errors && results.errors.length > 0) {
              }

            if (results.data && results.data.length > 0) {
              const headers = results.data[0] as string[];
              const rows = results.data.slice(1) as any[][];

              // Filter out completely empty rows and clean headers
              const cleanHeaders = headers
                .filter(h => h && String(h).trim() !== '')
                .map(h => String(h)
                  .replace(/\n/g, ' ') // Replace newlines with spaces
                  .replace(/\r/g, ' ') // Replace carriage returns with spaces
                  .replace(/\s+/g, ' ') // Replace multiple spaces with single space
                  .trim()
                );
              const cleanRows = rows.filter(row => {
                // Keep row if it has at least one non-empty, non-whitespace cell
                return row.some(cell =>
                  cell !== null &&
                  cell !== undefined &&
                  String(cell).trim() !== '' &&
                  String(cell).toLowerCase() !== 'stock name'
                );
              });

              if (cleanHeaders.length === 0) {
                setError('No valid columns found in the CSV file. Please check your file format.');
                return;
              }

              if (cleanRows.length === 0) {
                setError('No valid data rows found in the CSV file. Please check your file content.');
                return;
              }

              setParsedData({
                headers: cleanHeaders,
                rows: cleanRows,
                fileName: file.name
              });

              const smartMapping = generateSmartMapping(cleanHeaders);
              setColumnMapping(smartMapping.mapping);
              setMappingConfidence(smartMapping.confidence);

              // Check if there are any date columns mapped
              const hasDateColumns = Object.keys(smartMapping.mapping).some(key => key.includes('Date') || key === 'date');

              if (hasDateColumns) {
                setStep('dateFormat');
              } else {
                setStep('mapping');
              }
            } else {
              setError('The CSV file appears to be empty or invalid. Please check your file.');
            }
          } catch (error) {
            setError('Failed to process the CSV file. Please check the file format and try again.');
          }
        },
        header: false,
        skipEmptyLines: true,
        transform: (value) => {
          // Minimal cleaning for performance
          if (typeof value === 'string') {
            return value.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          }
          return value;
        },
        dynamicTyping: false, // Disable automatic type conversion for better control
        fastMode: false, // Disable fast mode to properly handle quoted fields with commas
        delimiter: ',', // Explicitly set comma as delimiter
        quoteChar: '"', // Explicitly set quote character
        escapeChar: '"', // Explicitly set escape character
        error: (error) => {
          setError('CSV parsing failed: ' + error.message);
        }
      });
    } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

          if (jsonData.length > 0) {
            const headers = jsonData[0] as string[];
            const rows = jsonData.slice(1);

            // Filter out completely empty rows and clean headers
            const cleanHeaders = headers
              .filter(h => h && String(h).trim() !== '')
              .map(h => String(h)
                .replace(/\n/g, ' ') // Replace newlines with spaces
                .replace(/\r/g, ' ') // Replace carriage returns with spaces
                .replace(/\s+/g, ' ') // Replace multiple spaces with single space
                .trim()
              );
            const cleanRows = rows.filter(row => {
              // Keep row if it has at least one non-empty, non-whitespace cell
              return row.some(cell =>
                cell !== null &&
                cell !== undefined &&
                String(cell).trim() !== '' &&
                String(cell).toLowerCase() !== 'stock name'
              );
            });

            setParsedData({
              headers: cleanHeaders,
              rows: cleanRows,
              fileName: file.name
            });

            const smartMapping = generateSmartMapping(cleanHeaders);
            setColumnMapping(smartMapping.mapping);
            setMappingConfidence(smartMapping.confidence);

            // Check if there are any date columns mapped
            const hasDateColumns = Object.keys(smartMapping.mapping).some(key => key.includes('Date') || key === 'date');

            if (hasDateColumns) {
              setStep('dateFormat');
            } else {
              setStep('mapping');
            }
          }
        } catch (error) {
          setError('Excel parsing failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }, [generateSmartMapping]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    const file = files[0];

    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  // Helper function to check if a trade is completely blank
  const isTradeCompletelyBlank = useCallback((trade: Partial<Trade>) => {
    // Check essential fields that indicate a valid trade
    const essentialFields = [
      'name', 'entry', 'initialQty', 'date'
    ];

    // A trade is considered blank if all essential fields are empty/zero
    return essentialFields.every(field => {
      const value = trade[field as keyof Trade];
      if (typeof value === 'string') {
        return !value || value.trim() === '' || value.toLowerCase() === 'stock name';
      }
      if (typeof value === 'number') {
        return value === 0;
      }
      return !value;
    });
  }, []);

  // Generate preview trades based on mapping - optimized for speed
  const generatePreview = useCallback(() => {
    if (!parsedData) return;

    const trades: Trade[] = [];
    let validTradeCount = 0;

    // Only process first 10 rows for preview to keep it fast
    const previewRows = parsedData.rows.slice(0, 10);

    for (const row of previewRows) {
      if (trades.length >= 5) break;
      const trade: Partial<Trade> = {
        id: generateId(),
        tradeNo: '',
        date: new Date().toISOString(),
        name: '',
        setup: '',
        buySell: 'Buy',
        entry: 0,
        avgEntry: 0,
        sl: 0,
        tsl: 0,
        cmp: 0,
        initialQty: 0,
        pyramid1Price: 0,
        pyramid1Qty: 0,
        pyramid1Date: '',
        pyramid2Price: 0,
        pyramid2Qty: 0,
        pyramid2Date: '',
        positionSize: 0,
        allocation: 0,
        exit1Price: 0,
        exit1Qty: 0,
        exit1Date: '',
        exit2Price: 0,
        exit2Qty: 0,
        exit2Date: '',
        exit3Price: 0,
        exit3Qty: 0,
        exit3Date: '',
        openQty: 0,
        exitedQty: 0,
        avgExitPrice: 0,
        stockMove: 0,
        openHeat: 0,
        rewardRisk: 0,
        holdingDays: 0,
        positionStatus: 'Open',
        realisedAmount: 0,
        plRs: 0,
        pfImpact: 0,
        cummPf: 0,
        planFollowed: true,
        exitTrigger: '',
        proficiencyGrowthAreas: '',
        baseDuration: '',
        slPercent: 0,
        notes: '',
      };

      // Map values based on column mapping
      Object.entries(columnMapping).forEach(([field, column]) => {
        const columnIndex = parsedData.headers.indexOf(column);
        if (columnIndex !== -1 && row[columnIndex] !== undefined) {
          const value = row[columnIndex];

          // Debug logging for first few rows
          if (validTradeCount < 3) {
            console.log(`📊 Row ${validTradeCount + 1}: Mapping ${field} ← "${column}" (index ${columnIndex}) = "${value}"`);
          }

          // Type conversion based on field - ONLY for user input fields
          if (['entry', 'avgEntry', 'sl', 'tsl', 'cmp', 'pyramid1Price', 'pyramid2Price',
               'exit1Price', 'exit2Price', 'exit3Price', 'avgExitPrice', 'realisedAmount', 'plRs'].includes(field)) {
            // Enhanced number parsing for cross-platform compatibility
            const parsedNumber = parseFlexibleNumber(value);
            (trade as any)[field] = parsedNumber;
          } else if (['initialQty', 'pyramid1Qty', 'pyramid2Qty', 'exit1Qty', 'exit2Qty', 'exit3Qty',
                     'openQty', 'exitedQty', 'holdingDays'].includes(field)) {
            // Enhanced quantity parsing for cross-platform compatibility
            const parsedQuantity = parseFlexibleNumber(value);
            (trade as any)[field] = Math.round(parsedQuantity); // Quantities should be whole numbers
          } else if (['slPercent', 'allocation', 'stockMove', 'openHeat', 'pfImpact', 'cummPf', 'positionSize'].includes(field)) {
            // Enhanced percentage/decimal parsing
            const parsedPercent = parseFlexibleNumber(value);
            (trade as any)[field] = parsedPercent;
          } else if (field === 'buySell') {
            // Handle Buy/Sell field - normalize common variations
            const buySellValue = String(value || '').toLowerCase().trim();
            if (buySellValue === 'b' || buySellValue === 'buy' || buySellValue === 'long') {
              (trade as any)[field] = 'Buy';
            } else if (buySellValue === 's' || buySellValue === 'sell' || buySellValue === 'short') {
              (trade as any)[field] = 'Sell';
            } else {
              (trade as any)[field] = 'Buy'; // Default to Buy if unclear
            }
          } else if (field === 'planFollowed') {
            // Handle boolean fields
            const boolValue = String(value || '').toLowerCase();
            (trade as any)[field] = boolValue === 'true' || boolValue === 'yes' || boolValue === '1';
          } else if (field.includes('Date') && value) {
            // Enhanced date parsing with multiple format support
            const parsedDate = parseDate(value);
            (trade as any)[field] = parsedDate || new Date().toISOString().split('T')[0];
          } else if (field === 'positionStatus') {
            // Handle status field - normalize common variations
            const statusValue = String(value || '').toLowerCase().trim();
            if (statusValue === 'open' || statusValue === 'o') {
              (trade as any)[field] = 'Open';
            } else if (statusValue === 'closed' || statusValue === 'c') {
              (trade as any)[field] = 'Closed';
            } else if (statusValue === 'partial' || statusValue === 'p') {
              (trade as any)[field] = 'Partial';
            } else {
              (trade as any)[field] = statusValue || 'Open'; // Default to Open
            }
          } else if (field === 'rewardRisk') {
            // Handle R:R field - parse as decimal
            const rrValue = parseFlexibleNumber(value);
            (trade as any)[field] = rrValue;
          } else if (field === 'setup') {
            // Special handling for setup field - reject numeric values
            const setupValue = String(value || '').trim();
            // If the value looks like a number (price), don't use it for setup
            if (setupValue && !(/^\d+\.?\d*$/.test(setupValue))) {
              (trade as any)[field] = setupValue;
            } else {
              (trade as any)[field] = ''; // Leave empty if it's a numeric value
            }
          } else if (['name', 'exitTrigger', 'proficiencyGrowthAreas', 'notes', 'baseDuration'].includes(field)) {
            // Handle text fields - store as string, trim whitespace
            (trade as any)[field] = String(value || '').trim();
          } else {
            (trade as any)[field] = String(value || '');
          }
        }
      });

      // Only include non-blank trades in preview
      if (!isTradeCompletelyBlank(trade)) {
        validTradeCount++;
        trade.tradeNo = String(validTradeCount);
        trades.push(recalculateTradeFields(trade as Trade));
      }
    }

    setPreviewTrades(trades);
    setStep('preview');
  }, [parsedData, columnMapping, recalculateTradeFields, isTradeCompletelyBlank]);

  const handleImport = useCallback(async () => {
    if (!parsedData) return;

    setStep('importing');
    setImportProgress(0);
    setError(null);

    const trades: Trade[] = [];
    const totalRows = parsedData.rows.length;
    let validTradeCount = 0;
    let skippedBlankTrades = 0;
    let dateParsingErrors: string[] = [];

    // Process in larger chunks for better performance
    const CHUNK_SIZE = 50; // Process 50 trades at a time
    const chunks = [];

    // Split rows into chunks
    for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
      chunks.push(parsedData.rows.slice(i, i + CHUNK_SIZE));
    }

    // Process chunks with yielding to prevent UI freezing
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];

      // Process each row in the chunk
      for (const row of chunk) {

      // Create base trade object
      const trade: Partial<Trade> = {
        id: generateId(),
        tradeNo: '', // Will be set after filtering
        date: new Date().toISOString(),
        name: '',
        setup: '',
        buySell: 'Buy',
        entry: 0,
        avgEntry: 0,
        sl: 0,
        tsl: 0,
        cmp: 0,
        initialQty: 0,
        pyramid1Price: 0,
        pyramid1Qty: 0,
        pyramid1Date: '',
        pyramid2Price: 0,
        pyramid2Qty: 0,
        pyramid2Date: '',
        positionSize: 0,
        allocation: 0,
        exit1Price: 0,
        exit1Qty: 0,
        exit1Date: '',
        exit2Price: 0,
        exit2Qty: 0,
        exit2Date: '',
        exit3Price: 0,
        exit3Qty: 0,
        exit3Date: '',
        openQty: 0,
        exitedQty: 0,
        avgExitPrice: 0,
        stockMove: 0,
        openHeat: 0,
        rewardRisk: 0,
        holdingDays: 0,
        positionStatus: 'Open',
        realisedAmount: 0,
        plRs: 0,
        pfImpact: 0,
        cummPf: 0,
        planFollowed: true,
        exitTrigger: '',
        proficiencyGrowthAreas: '',
        baseDuration: '',
        slPercent: 0,
        notes: '',
      };

      // Map values based on column mapping
      Object.entries(columnMapping).forEach(([field, column]) => {
        const columnIndex = parsedData.headers.indexOf(column);
        if (columnIndex !== -1 && row[columnIndex] !== undefined) {
          const value = row[columnIndex];

          // Type conversion based on field - ONLY for user input fields
          if (['entry', 'avgEntry', 'sl', 'tsl', 'cmp', 'pyramid1Price', 'pyramid2Price',
               'exit1Price', 'exit2Price', 'exit3Price', 'avgExitPrice', 'realisedAmount', 'plRs'].includes(field)) {
            // Enhanced number parsing for cross-platform compatibility
            const parsedNumber = parseFlexibleNumber(value);
            (trade as any)[field] = parsedNumber;
          } else if (['initialQty', 'pyramid1Qty', 'pyramid2Qty', 'exit1Qty', 'exit2Qty', 'exit3Qty',
                     'openQty', 'exitedQty', 'holdingDays'].includes(field)) {
            // Enhanced quantity parsing for cross-platform compatibility
            const parsedQuantity = parseFlexibleNumber(value);
            (trade as any)[field] = Math.round(parsedQuantity); // Quantities should be whole numbers
          } else if (['slPercent', 'allocation', 'stockMove', 'openHeat', 'pfImpact', 'cummPf', 'positionSize'].includes(field)) {
            // Enhanced percentage/decimal parsing
            const parsedPercent = parseFlexibleNumber(value);
            (trade as any)[field] = parsedPercent;
          } else if (field === 'buySell') {
            // Handle Buy/Sell field - normalize common variations
            const buySellValue = String(value || '').toLowerCase().trim();
            if (buySellValue === 'b' || buySellValue === 'buy' || buySellValue === 'long') {
              (trade as any)[field] = 'Buy';
            } else if (buySellValue === 's' || buySellValue === 'sell' || buySellValue === 'short') {
              (trade as any)[field] = 'Sell';
            } else {
              (trade as any)[field] = 'Buy'; // Default to Buy if unclear
            }
          } else if (field === 'planFollowed') {
            // Handle boolean fields
            const boolValue = String(value || '').toLowerCase();
            (trade as any)[field] = boolValue === 'true' || boolValue === 'yes' || boolValue === '1';
          } else if (field.includes('Date') && value) {
            // Enhanced date parsing with multiple format support
            const parsedDate = parseDate(value);
            if (!parsedDate && value) {
              dateParsingErrors.push('Row ' + (validTradeCount + skippedBlankTrades + 1) + ': Invalid date "' + value + '" in ' + field);
            }
            (trade as any)[field] = parsedDate || new Date().toISOString().split('T')[0];
          } else if (field === 'positionStatus') {
            // Handle status field - normalize common variations
            const statusValue = String(value || '').toLowerCase().trim();
            if (statusValue === 'open' || statusValue === 'o') {
              (trade as any)[field] = 'Open';
            } else if (statusValue === 'closed' || statusValue === 'c') {
              (trade as any)[field] = 'Closed';
            } else if (statusValue === 'partial' || statusValue === 'p') {
              (trade as any)[field] = 'Partial';
            } else {
              (trade as any)[field] = statusValue || 'Open'; // Default to Open
            }
          } else if (field === 'rewardRisk') {
            // Handle R:R field - parse as decimal
            const rrValue = parseFlexibleNumber(value);
            (trade as any)[field] = rrValue;
          } else if (field === 'setup') {
            // Special handling for setup field - reject numeric values
            const setupValue = String(value || '').trim();
            // If the value looks like a number (price), don't use it for setup
            if (setupValue && !(/^\d+\.?\d*$/.test(setupValue))) {
              (trade as any)[field] = setupValue;
            } else {
              (trade as any)[field] = ''; // Leave empty if it's a numeric value
            }
          } else if (['name', 'exitTrigger', 'proficiencyGrowthAreas', 'notes', 'baseDuration'].includes(field)) {
            // Handle text fields - store as string, trim whitespace
            (trade as any)[field] = String(value || '').trim();
          } else {
            (trade as any)[field] = String(value || '');
          }
        }
      });

        // Check if trade is completely blank and skip if so
        if (isTradeCompletelyBlank(trade)) {
          skippedBlankTrades++;
        } else {
          // Assign sequential trade number only for valid trades
          validTradeCount++;
          trade.tradeNo = String(validTradeCount);

          // Recalculate all auto-populated fields
          const recalculatedTrade = recalculateTradeFields(trade as Trade);
          trades.push(recalculatedTrade);
        }
      }

      // Update progress after each chunk
      const processedRows = (chunkIndex + 1) * CHUNK_SIZE;
      const progress = Math.min((processedRows / totalRows) * 100, 100);
      setImportProgress(progress);

      // Yield control to browser to prevent freezing
      if (chunkIndex < chunks.length - 1) {
        await new Promise(resolve => {
          if (window.requestIdleCallback) {
            window.requestIdleCallback(resolve);
          } else {
            setTimeout(resolve, 0);
          }
        });
      }
    }

    // Show date parsing warnings if any
    if (dateParsingErrors.length > 0) {
      const errorMessage = 'Import completed with ' + dateParsingErrors.length + ' date parsing warnings. Some dates may have been set to today\'s date. Check the imported trades and update dates as needed.';
      setError(errorMessage);

      // Still proceed with import but show warning
      setTimeout(() => setError(null), 5000); // Clear error after 5 seconds
    }

    // Import trades
    onImport(trades);

    setImportProgress(100);

    // Small delay to show completion before closing
    setTimeout(() => {
      onOpenChange(false);

      // Reset state
      setStep('upload');
      setParsedData(null);
      setColumnMapping({});
      setMappingConfidence({});
      setPreviewTrades([]);
      setImportProgress(0);
    }, 1000);
  }, [parsedData, columnMapping, onImport, onOpenChange, recalculateTradeFields, isTradeCompletelyBlank]);

  const resetModal = useCallback(() => {
    setStep('upload');
    setParsedData(null);
    setColumnMapping({});
    setMappingConfidence({});
    setPreviewTrades([]);
    setImportProgress(0);
    setError(null);
    setSelectedDateFormat('auto');
  }, []);

  // Test function to verify mapping with your exact CSV formats
  const testMappingWithUserFormats = useCallback(() => {
    console.log('🧪 Testing CSV mapping with user formats...');

    // First, show the actual CSV headers if we have real data
    if (parsedData && parsedData.headers) {
      console.log('📋 Actual CSV Headers:');
      parsedData.headers.forEach((header, index) => {
        console.log(`  ${index}: "${header}"`);
      });
      console.log('');
    }

    // Test with your second CSV format (the problematic one)
    const userHeaders2 = [
      "Trade No.", "Date", "Name", "Entry", "Avg Entry", "SL", "TSL", "Buy/ Sell", "CMP", "Setup",
      "Base Duration", "Initial QTY", "Pyramid-1 Price", "P-1 QTY", "P-1 Date", "Pyramid-2 Price",
      "P-2 QTY", "P-2 Date", "Position Size", "Allocation", "SL", "Exit-1 Price", "Exit-1 Qty",
      "Date", "Exit-2 Price", "Exit-2 Qty", "Date", "Exit-3 Price", "Exit-3 Qty", "Date",
      "Open QTY", "Exited Qty", "Avg. Exit Price", "Stock Move", "Open Heat", "Reward: Risk",
      "Holding Days", "Position Status", "Realised Amount", "P/L Rs", "PF Impact", "Cumm pf",
      "Plan Followed?", "Exit Trigger", "Proficiency", "Growth Areas", "Note"
    ];

    // Mock parsedData for testing
    const mockParsedData = {
      headers: userHeaders2,
      rows: [
        ['1', '2024-07-24', 'ELECTCAST', '203', '207', '198.95', '', 'Buy', '', '', '', '54', '210.95', '54', '2024-07-26', '', '', '', '22353', '17.19', '', '214.36', '54', '2024-07-29', '211.75', '54', '2024-07-29', '', '', '', '108', '', '213.06', '2.94', '0', '1.47', '5', 'Closed', '23010', '657', '0.51', '0.51', '', '', '', '', '']
      ],
      fileName: 'test.csv'
    };

    // Create a test version of generateSmartMapping that doesn't depend on parsedData state
    const testGenerateSmartMapping = (testHeaders: string[]) => {
      const mapping: ColumnMapping = {};
      const confidence: MappingConfidence = {};
      const headers = testHeaders;

      // Mock hasValidData function for testing
      const hasValidData = (columnIndex: number): boolean => {
        return columnIndex < headers.length; // Simple mock - assume all columns have data
      };

      // Mock validateFieldDataType function for testing - more realistic
      const validateFieldDataType = (field: string, columnIndex: number): boolean => {
        const columnHeader = headers[columnIndex]?.toLowerCase() || '';

        // Prevent CMP from mapping to R:R columns
        if (field === 'cmp' && (columnHeader.includes('r:r') || columnHeader.includes('reward') || columnHeader.includes('risk'))) {
          return false;
        }

        // Prevent rewardRisk from mapping to CMP columns
        if (field === 'rewardRisk' && (columnHeader.includes('cmp') || columnHeader.includes('current') || columnHeader.includes('market'))) {
          return false;
        }

        return true; // Accept most other mappings for testing
      };

      // Enhanced similarity mapping - same as the real one
      const similarityMap: { [key: string]: string[] } = {
        'tradeNo': ['trade no', 'trade number', 'trade id', 'id', 'sr no', 'serial', 'trade #', '#', 'trade no.'],
        'date': ['date', 'entry date', 'trade date', 'timestamp', 'entry dt', 'dt'],
        'name': ['name', 'stock', 'symbol', 'stock name', 'company', 'scrip', 'ticker', 'instrument'],
        'setup': ['setup', 'strategy', 'pattern', 'setup type', 'trade setup', 'setup name'],
        'buySell': ['buy/sell', 'buysell', 'side', 'action', 'transaction type', 'buy sell', 'direction', 'buy/ sell'],
        'entry': ['entry', 'entry price', 'buy price', 'price', 'entry rate', 'buy rate', 'entry (₹)'],
        'avgEntry': ['avg entry', 'average entry', 'avg. entry', 'avg entry (₹)', 'average entry price', 'avg entry price'],
        'sl': ['sl', 'stop loss', 'stoploss', 'stop', 'sl price', 'stop price', 'sl (₹)'],
        'tsl': ['tsl', 'trailing sl', 'trailing stop', 'trail sl', 'trailing stop loss', 'tsl (₹)'],
        'cmp': ['cmp', 'current price', 'market price', 'ltp', 'last traded price', 'cmp (₹)'],
        'initialQty': ['qty', 'quantity', 'initial qty', 'shares', 'units', 'volume', 'size', 'initial qty', 'base qty', 'initial qty'],
        'positionSize': ['position size', 'pos size', 'pos. size', 'position value', 'trade size'],
        'allocation': ['allocation', 'allocation %', 'allocation (%)', 'alloc', 'alloc %'],
        'slPercent': ['sl %', 'sl percent', 'stop loss %', 'stop loss percent', 'sl percentage'],
        'pyramid1Price': ['pyramid 1 price', 'p1 price', 'p-1 price', 'pyramid1 price', 'pyr1 price', 'pyramid-1 price', 'pyramid-1 price (₹)'],
        'pyramid1Qty': ['pyramid 1 qty', 'p1 qty', 'p-1 qty', 'pyramid1 qty', 'pyr1 qty', 'p-1\nqty', 'p-1 qty'],
        'pyramid1Date': ['pyramid 1 date', 'p1 date', 'p-1 date', 'pyramid1 date', 'pyr1 date', 'p-1\ndate', 'p-1 date'],
        'pyramid2Price': ['pyramid 2 price', 'p2 price', 'p-2 price', 'pyramid2 price', 'pyr2 price', 'pyramid-2\nprice', 'pyramid-2 price', 'pyramid-2 price (₹)'],
        'pyramid2Qty': ['pyramid 2 qty', 'p2 qty', 'p-2 qty', 'pyramid2 qty', 'pyr2 qty', 'p-2\nqty', 'p-2 qty'],
        'pyramid2Date': ['pyramid 2 date', 'p2 date', 'p-2 date', 'pyramid2 date', 'pyr2 date', 'p-2\ndate', 'p-2 date'],
        'exit1Price': ['exit 1 price', 'e1 price', 'exit1 price', 'sell 1 price', 'exit price', 'exit-1\nprice', 'exit-1 price', 'exit-1 price (₹)'],
        'exit1Qty': ['exit 1 qty', 'e1 qty', 'exit1 qty', 'sell 1 qty', 'exit qty', 'exit-1\nqty', 'exit-1 qty'],
        'exit1Date': ['exit 1 date', 'e1 date', 'exit1 date', 'sell 1 date', 'exit date', 'e1 date'],
        'exit2Price': ['exit 2 price', 'e2 price', 'exit2 price', 'sell 2 price', 'exit-2\nprice', 'exit-2 price', 'exit-2 price (₹)'],
        'exit2Qty': ['exit 2 qty', 'e2 qty', 'exit2 qty', 'sell 2 qty', 'exit-2\nqty', 'exit-2 qty'],
        'exit2Date': ['exit 2 date', 'e2 date', 'exit2 date', 'sell 2 date', 'e2 date'],
        'exit3Price': ['exit 3 price', 'e3 price', 'exit3 price', 'sell 3 price', 'exit-3\nprice', 'exit-3 price', 'exit-3 price (₹)'],
        'exit3Qty': ['exit 3 qty', 'e3 qty', 'exit3 qty', 'sell 3 qty', 'exit-3\nqty', 'exit-3 qty'],
        'exit3Date': ['exit 3 date', 'e3 date', 'exit3 date', 'sell 3 date', 'e3 date'],
        'openQty': ['open qty', 'open quantity', 'open qty', 'remaining qty', 'balance qty'],
        'exitedQty': ['exited qty', 'exited quantity', 'exited qty', 'sold qty', 'closed qty'],
        'avgExitPrice': ['avg exit', 'average exit', 'avg. exit', 'avg exit price', 'average exit price', 'avg. exit price'],
        'stockMove': ['stock move', 'stock move %', 'stock move (%)', 'price move', 'move %'],
        'openHeat': ['open heat', 'open heat %', 'open heat (%)', 'heat', 'heat %'],
        'rewardRisk': ['r:r', 'reward:risk', 'reward: risk', 'rr', 'risk reward', 'reward risk'],
        'holdingDays': ['holding days', 'days', 'hold days', 'duration', 'holding period'],
        'positionStatus': ['status', 'position status', 'trade status', 'pos status'],
        'realisedAmount': ['realised amount', 'realized amount', 'realised amt', 'realized amt', 'trade amount'],
        'plRs': ['p/l', 'p/l rs', 'p/l (₹)', 'realized p/l', 'realised p/l', 'realized p/l (₹)', 'profit loss', 'pnl'],
        'pfImpact': ['pf impact', 'pf impact %', 'pf impact (%)', 'portfolio impact', 'portfolio impact %'],
        'cummPf': ['cumm pf', 'cumm. pf', 'cumm pf %', 'cumm. pf (%)', 'cumulative pf', 'cumulative portfolio'],
        'planFollowed': ['plan followed', 'plan followed?', 'followed plan', 'plan \nfollowed?'],
        'exitTrigger': ['exit trigger', 'trigger', 'exit reason', 'exit trigger'],
        'proficiencyGrowthAreas': ['growth areas', 'proficiency', 'improvement areas', 'growth areas'],
        'baseDuration': ['base duration', 'duration', 'time frame', 'holding period'],
        'notes': ['notes', 'comments', 'remarks', 'description', 'memo', 'observation', 'note']
      };

      // Use the same similarity calculation function
      const calculateSimilarity = (str1: string, str2: string): number => {
        const s1 = str1.toLowerCase().trim();
        const s2 = str2.toLowerCase().trim();

        if (s1 === s2) return 100;
        if (s1.includes(s2) || s2.includes(s1)) return 80;

        const clean1 = s1.replace(/[-_\s\n\r\/\(\)\.\?:₹%]/g, '');
        const clean2 = s2.replace(/[-_\s\n\r\/\(\)\.\?:₹%]/g, '');
        if (clean1 === clean2) return 95;
        if (clean1.includes(clean2) || clean2.includes(clean1)) return 85;

        const normalized1 = s1.replace(/\s+/g, ' ').replace(/\n/g, ' ');
        const normalized2 = s2.replace(/\s+/g, ' ').replace(/\n/g, ' ');
        if (normalized1 === normalized2) return 90;
        if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return 75;

        const words1 = s1.split(/[-_\s\n\r\/\(\)\.\?:₹%]+/).filter(w => w.length > 0);
        const words2 = s2.split(/[-_\s\n\r\/\(\)\.\?:₹%]+/).filter(w => w.length > 0);

        const normalizeWord = (word: string): string => {
          const abbrevMap: { [key: string]: string } = {
            'qty': 'quantity', 'avg': 'average', 'pos': 'position', 'pf': 'portfolio',
            'cumm': 'cumulative', 'realised': 'realized', 'amt': 'amount', 'rs': 'rupees',
            'sl': 'stoploss', 'tsl': 'trailingstop', 'cmp': 'currentprice', 'pl': 'profitloss', 'pnl': 'profitloss'
          };
          return abbrevMap[word] || word;
        };

        const normalizedWords1 = words1.map(normalizeWord);
        const normalizedWords2 = words2.map(normalizeWord);

        const commonWords = normalizedWords1.filter(word => normalizedWords2.includes(word));
        if (commonWords.length > 0) {
          const score = (commonWords.length / Math.max(normalizedWords1.length, normalizedWords2.length)) * 70;
          return Math.min(score, 85);
        }

        let partialMatches = 0;
        for (const word1 of normalizedWords1) {
          for (const word2 of normalizedWords2) {
            if (word1.length > 2 && word2.length > 2) {
              if (word1.includes(word2) || word2.includes(word1)) {
                partialMatches++;
                break;
              }
            }
          }
        }

        if (partialMatches > 0) {
          return (partialMatches / Math.max(normalizedWords1.length, normalizedWords2.length)) * 50;
        }

        return 0;
      };

      // Apply mapping logic
      Object.entries(similarityMap).forEach(([field, keywords]) => {
        let bestMatch = '';
        let bestScore = 0;

        headers.forEach((header, headerIndex) => {
          keywords.forEach(keyword => {
            const score = calculateSimilarity(header, keyword);
            if (score > bestScore && score >= 80) {
              if (hasValidData(headerIndex) && validateFieldDataType(field, headerIndex)) {
                bestScore = score;
                bestMatch = header;
              }
            }
          });
        });

        if (bestMatch && !Object.values(mapping).includes(bestMatch)) {
          mapping[field] = bestMatch;
          confidence[field] = bestScore;
        }
      });

      return { mapping, confidence };
    };

    const smartMapping = testGenerateSmartMapping(userHeaders2);

    console.log('📊 Mapping Results for Format 2:');
    console.log('Total mappings:', Object.keys(smartMapping.mapping).length);
    console.log('High confidence mappings (>90%):', Object.entries(smartMapping.confidence).filter(([_, conf]) => conf > 90).length);
    console.log('Medium confidence mappings (70-90%):', Object.entries(smartMapping.confidence).filter(([_, conf]) => conf >= 70 && conf <= 90).length);
    console.log('Low confidence mappings (<70%):', Object.entries(smartMapping.confidence).filter(([_, conf]) => conf < 70).length);

    console.log('📋 Detailed Mappings:');
    Object.entries(smartMapping.mapping).forEach(([field, column]) => {
      const conf = smartMapping.confidence[field] || 0;
      console.log(`  ${field} → "${column}" (${conf}%)`);
    });

    console.log('❌ Unmapped Fields:');
    const allExpectedFields = [
      'tradeNo', 'date', 'name', 'setup', 'buySell', 'entry', 'avgEntry', 'sl', 'tsl', 'cmp',
      'initialQty', 'positionSize', 'allocation', 'slPercent', 'pyramid1Price', 'pyramid1Qty', 'pyramid1Date',
      'pyramid2Price', 'pyramid2Qty', 'pyramid2Date', 'exit1Price', 'exit1Qty', 'exit1Date',
      'exit2Price', 'exit2Qty', 'exit2Date', 'exit3Price', 'exit3Qty', 'exit3Date',
      'openQty', 'exitedQty', 'avgExitPrice', 'stockMove', 'openHeat', 'rewardRisk', 'holdingDays',
      'positionStatus', 'realisedAmount', 'plRs', 'pfImpact', 'cummPf', 'planFollowed',
      'exitTrigger', 'proficiencyGrowthAreas', 'baseDuration', 'notes'
    ];
    const mappedFields = Object.keys(smartMapping.mapping);
    const unmappedFields = allExpectedFields.filter(field => !mappedFields.includes(field));
    unmappedFields.forEach(field => console.log(`  ${field}`));

    return smartMapping;
  }, [generateSmartMapping, parsedData]);

  // Show under development banner if upload is disabled
  if (isUploadDisabled) {
    return (
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="2xl"
        classNames={{
          base: "max-h-[95vh]",
          body: "p-0",
          header: "border-b border-divider/50",
          footer: "border-t border-divider/50"
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-default-100 dark:bg-default-200/20">
                    <Icon icon="lucide:construction" className="text-foreground-600 w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground-800 dark:text-foreground-200">
                    Upload Feature Under Development
                  </h2>
                </div>
              </ModalHeader>

              <ModalBody className="p-8">
                <div className="text-center space-y-6">
                  {/* Main Icon */}
                  <div className="flex justify-center">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-full bg-default-100 dark:bg-default-200/10 flex items-center justify-center">
                        <Icon icon="lucide:upload-cloud" className="w-10 h-10 text-foreground-500" />
                      </div>
                      <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Icon icon="lucide:wrench" className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  </div>

                  {/* Message */}
                  <div className="space-y-3">
                    <h3 className="text-xl font-semibold text-foreground-800 dark:text-foreground-200">
                      We're Working on Something Better
                    </h3>
                    <p className="text-foreground-600 dark:text-foreground-400 leading-relaxed max-w-md mx-auto">
                      Our CSV/Excel upload feature is getting a major upgrade to make your trade importing experience even better.
                    </p>
                  </div>

                  {/* Features Coming Soon */}
                  <div className="bg-default-50 dark:bg-default-100/5 rounded-lg p-6 border border-divider/50">
                    <h4 className="font-medium text-foreground-700 dark:text-foreground-300 mb-4 flex items-center gap-2">
                      <Icon icon="lucide:sparkles" className="w-4 h-4 text-primary" />
                      What's Coming:
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-foreground-600 dark:text-foreground-400">
                      <div className="flex items-center gap-2">
                        <Icon icon="lucide:zap" className="w-3 h-3 text-foreground-500" />
                        Faster processing
                      </div>
                      <div className="flex items-center gap-2">
                        <Icon icon="lucide:shield-check" className="w-3 h-3 text-foreground-500" />
                        Better error handling
                      </div>
                      <div className="flex items-center gap-2">
                        <Icon icon="lucide:brain" className="w-3 h-3 text-foreground-500" />
                        Smarter column mapping
                      </div>
                      <div className="flex items-center gap-2">
                        <Icon icon="lucide:smartphone" className="w-3 h-3 text-foreground-500" />
                        Mobile optimization
                      </div>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="text-center">
                    <p className="text-sm text-foreground-500 dark:text-foreground-500">
                      Expected to be back soon. Thank you for your patience! 🚀
                    </p>
                  </div>
                </div>
              </ModalBody>

              <ModalFooter className="justify-center">
                <Button
                  variant="flat"
                  size="sm"
                  onPress={onClose}
                  className="bg-default-100 hover:bg-default-200 text-foreground-700 dark:bg-default-200/20 dark:hover:bg-default-200/30 dark:text-foreground-300 font-medium px-6 py-2 h-8"
                  startContent={<Icon icon="lucide:check" className="w-3 h-3" />}
                >
                  Got it
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="5xl"
      scrollBehavior="inside"
      onClose={resetModal}
      classNames={{
        base: "max-h-[90vh]",
        body: "p-0",
        header: "border-b border-divider",
        footer: "border-t border-divider"
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <Icon icon="lucide:upload" className="text-xl text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">Import Trade Journal</h2>
                  <p className="text-sm text-foreground-500">
                    Upload your Excel/CSV file and map columns to import trades
                  </p>
                </div>
              </div>

              {/* Progress indicator */}
              <div className="flex items-center gap-2 mt-4">
                {['upload', 'dateFormat', 'mapping', 'preview', 'importing'].map((stepName, index) => (
                  <React.Fragment key={stepName}>
                    <div className={'flex items-center gap-2 ' + (
                      step === stepName ? 'text-primary' :
                      ['upload', 'dateFormat', 'mapping', 'preview', 'importing'].indexOf(step) > index ? 'text-success' : 'text-foreground-400'
                    )}>
                      <div className={'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ' + (
                        step === stepName ? 'bg-primary text-white' :
                        ['upload', 'dateFormat', 'mapping', 'preview', 'importing'].indexOf(step) > index ? 'bg-success text-white' : 'bg-default-200'
                      )}>
                        {['upload', 'dateFormat', 'mapping', 'preview', 'importing'].indexOf(step) > index ?
                          <Icon icon="lucide:check" className="w-3 h-3" /> :
                          index + 1
                        }
                      </div>
                      <span className="text-xs font-medium capitalize">
                        {stepName === 'dateFormat' ? 'Date Format' : stepName}
                      </span>
                    </div>
                    {index < 4 && (
                      <div className={'w-8 h-0.5 ' + (
                        ['upload', 'dateFormat', 'mapping', 'preview', 'importing'].indexOf(step) > index ? 'bg-success' : 'bg-default-200'
                      )} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </ModalHeader>

            <ModalBody className="p-6">
              <AnimatePresence mode="wait">
                {step === 'upload' && (
                  <motion.div
                    key="upload"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <div
                      className={'border-2 border-dashed rounded-lg p-8 text-center transition-colors ' + (
                        dragActive ? 'border-primary bg-primary/5' : 'border-default-300'
                      )}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setDragActive(false);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                    >
                      <Icon icon="lucide:upload-cloud" className="text-4xl text-foreground-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">Upload your trade journal</h3>
                      <p className="text-foreground-500 mb-4">
                        Drag and drop your Excel (.xlsx, .xls) or CSV file here, or click to browse
                      </p>
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="file-upload"
                      />
                      <label htmlFor="file-upload">
                        <Button as="span" color="primary" variant="flat">
                          <Icon icon="lucide:folder-open" className="mr-2" />
                          Choose File
                        </Button>
                      </label>
                    </div>

                    {error && (
                      <Card className="border-danger">
                        <CardBody>
                          <div className="flex items-center gap-2 text-danger">
                            <Icon icon="lucide:alert-circle" />
                            <span className="font-medium">Upload Error</span>
                          </div>
                          <p className="text-sm text-danger mt-2">{error}</p>
                          <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            className="mt-3"
                            onPress={() => setError(null)}
                          >
                            Try Again
                          </Button>
                        </CardBody>
                      </Card>
                    )}

                    <Card>
                      <CardHeader>
                        <Icon icon="lucide:info" className="text-primary mr-2" />
                        <span className="font-medium">Supported Formats</span>
                      </CardHeader>
                      <CardBody className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-medium mb-2">Excel Files (.xlsx, .xls)</h4>
                            <p className="text-sm text-foreground-500">
                              Upload your Excel trade journal. We'll read the first sheet automatically.
                            </p>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">CSV Files (.csv)</h4>
                            <p className="text-sm text-foreground-500">
                              Upload comma-separated values file with trade data. Supports standard CSV format with headers.
                            </p>
                          </div>
                        </div>

                        <Divider className="my-4" />

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">Sample CSV Format</h4>
                            <Button
                              size="sm"
                              variant="flat"
                              color="primary"
                              startContent={<Icon icon="lucide:download" />}
                              onPress={() => {
                                // Create sample CSV content with multiple date formats
                                const sampleCSV = 'Name,Date,Entry,Quantity,Buy/Sell,Status,Exit Price,Exit Quantity,Setup,Notes,Pyramid Date\n' +
'RELIANCE,2024-01-15,2500,10,Buy,Closed,2650,10,Breakout,Good momentum trade,\n' +
'TCS,15/01/2024,3200,5,Buy,Open,,,Support,Waiting for breakout,\n' +
'INFY,17-01-2024,1450,15,Buy,Partial,1520,5,Pullback,Partial exit taken,\n' +
'HDFC,15.01.2024,1800,8,Buy,Closed,1950,8,Reversal,Target achieved,\n' +
'WIPRO,24 Jul 24,1200,12,Buy,Open,,,Breakout,Text date format,25 Jul\n' +
'BHARTI,15 Aug 2024,850,20,Buy,Closed,920,20,Support,Full text date,\n' +
'MARUTI,12 Sep,2800,3,Buy,Open,,,Pullback,Current year assumed,';

                                // Create and download file
                                const blob = new Blob([sampleCSV], { type: 'text/csv' });
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'trade_journal_template.csv';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                window.URL.revokeObjectURL(url);
                              }}
                            >
                              Download Template
                            </Button>
                          </div>
                          <div className="bg-default-100 p-3 rounded-lg text-xs font-mono">
                            <div>Name,Date,Entry,Quantity,Buy/Sell,Status</div>
                            <div>RELIANCE,2024-01-15,2500,10,Buy,Closed</div>
                            <div>TCS,15/01/2024,3200,5,Buy,Open</div>
                            <div>INFY,17-01-2024,1450,15,Buy,Partial</div>
                          </div>

                          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <h5 className="font-medium text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-2">
                              <Icon icon="lucide:calendar" className="w-4 h-4" />
                              Supported Date Formats
                            </h5>
                            <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                              <div>• <strong>Numeric:</strong> 2024-01-15, 15/01/2024, 15-01-2024, 15.01.2024</div>
                              <div>• <strong>Text Month:</strong> 24 Jul 2024, 24 Jul 24, 24 Jul</div>
                              <div>• <strong>US Format:</strong> Jul 24, 2024, Jul 24 24</div>
                              <div>• <strong>Mixed:</strong> Any combination of the above</div>
                              <div className="text-blue-600 dark:text-blue-400 mt-2">
                                <Icon icon="lucide:info" className="w-3 h-3 inline mr-1" />
                                The system will automatically detect and convert your date format
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  </motion.div>
                )}

                {step === 'dateFormat' && parsedData && (
                  <motion.div
                    key="dateFormat"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <Card>
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Icon icon="lucide:calendar" className="text-primary" />
                          <span className="font-medium">Select Date Format</span>
                        </div>
                      </CardHeader>
                      <CardBody>
                        <div className="space-y-4">
                          <p className="text-sm text-foreground-500">
                            We detected date columns in your file. Please select the format your dates are in to ensure accurate parsing.
                          </p>

                          {/* Show sample dates from the file */}
                          {parsedData.rows.length > 0 && (
                            <div className="p-3 bg-default-50 rounded-lg">
                              <h4 className="font-medium text-sm mb-2">Sample dates from your file:</h4>
                              <div className="text-xs text-foreground-600 space-y-1">
                                {parsedData.rows.slice(0, 3).map((row, index) => {
                                  // Find date columns and show sample values
                                  const dateColumns = Object.entries(columnMapping).filter(([key]) => key.includes('Date') || key === 'date');
                                  return dateColumns.map(([field, column]) => {
                                    const columnIndex = parsedData.headers.indexOf(column);
                                    const value = columnIndex !== -1 ? row[columnIndex] : '';
                                    return value ? (
                                      <div key={index + '-' + field} className="font-mono">
                                        {field}: <span className="text-primary">{value}</span>
                                      </div>
                                    ) : null;
                                  });
                                }).flat().filter(Boolean).slice(0, 5)}
                              </div>
                            </div>
                          )}

                          {/* Date format selection */}
                          <div className="space-y-3">
                            {dateFormatOptions.map((option) => (
                              <div
                                key={option.value}
                                className={'p-4 border-2 rounded-lg cursor-pointer transition-all ' + (
                                  selectedDateFormat === option.value
                                    ? 'border-primary bg-primary/5'
                                    : 'border-default-200 hover:border-default-300'
                                )}
                                onClick={() => setSelectedDateFormat(option.value)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={'w-4 h-4 rounded-full border-2 flex items-center justify-center ' + (
                                    selectedDateFormat === option.value
                                      ? 'border-primary bg-primary'
                                      : 'border-default-300'
                                  )}>
                                    {selectedDateFormat === option.value && (
                                      <div className="w-2 h-2 rounded-full bg-white"></div>
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-medium">{option.label}</span>
                                      <code className="text-xs bg-default-100 px-2 py-1 rounded">
                                        {option.example}
                                      </code>
                                    </div>
                                    <p className="text-xs text-foreground-500">{option.description}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="flex items-start gap-2">
                              <Icon icon="lucide:lightbulb" className="w-4 h-4 text-blue-600 mt-0.5" />
                              <div className="text-xs text-blue-700 dark:text-blue-300">
                                <strong>Tip:</strong> If you're unsure, choose "Auto-detect" and we'll try to figure out your date format automatically. You can always re-import if needed.
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  </motion.div>
                )}

                {step === 'mapping' && parsedData && (
                  <motion.div
                    key="mapping"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <Icon icon="lucide:file-text" className="text-primary" />
                            <span className="font-medium">File: {parsedData.fileName}</span>
                          </div>
                          <Chip size="sm" variant="flat" color="success">
                            {parsedData.rows.length} rows detected
                          </Chip>
                        </div>
                      </CardHeader>
                      <CardBody className="pt-0">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-sm text-foreground-500">
                            Map your file columns to our trade journal fields. We've made smart suggestions based on column names.
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="flat"
                              color="primary"
                              startContent={<Icon icon="lucide:zap" />}
                              onPress={() => {
                                if (parsedData) {
                                  const smartMapping = generateSmartMapping(parsedData.headers);
                                  setColumnMapping(smartMapping.mapping);
                                  setMappingConfidence(smartMapping.confidence);
                                }
                              }}
                            >
                              Smart Re-map
                            </Button>
                            <Button
                              size="sm"
                              variant="flat"
                              color="secondary"
                              startContent={<Icon icon="lucide:bug" />}
                              onPress={() => {
                                testMappingWithUserFormats();
                              }}
                            >
                              Debug Mapping
                            </Button>
                          </div>
                        </div>

                        {/* Mapping Summary */}
                        <div className="mb-4 p-3 bg-default-50 rounded-lg">
                          <div className="flex items-center justify-between text-sm">
                            <span>Mapping Progress:</span>
                            <div className="flex gap-4">
                              <span className="text-success">
                                {Object.keys(columnMapping).length} mapped
                              </span>
                              <span className="text-warning">
                                {MAPPABLE_FIELDS.filter(f => f.required && !columnMapping[f.key]).length} required missing
                              </span>
                              <span className="text-default-500">
                                {MAPPABLE_FIELDS.length - Object.keys(columnMapping).length} unmapped
                              </span>
                            </div>
                          </div>
                        </div>

                        <ScrollShadow className="max-h-96">
                          <div className="space-y-3">
                            {MAPPABLE_FIELDS.map((field) => (
                              <div key={field.key} className="flex items-center gap-4">
                                <div className="min-w-[200px]">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{field.label}</span>
                                    {field.required && (
                                      <Chip size="sm" color="danger" variant="flat">Required</Chip>
                                    )}
                                    {mappingConfidence[field.key] && (
                                      <Chip
                                        size="sm"
                                        variant="flat"
                                        color={
                                          mappingConfidence[field.key] >= 90 ? "success" :
                                          mappingConfidence[field.key] >= 70 ? "warning" : "default"
                                        }
                                      >
                                        {mappingConfidence[field.key].toFixed(0)}% match
                                      </Chip>
                                    )}
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <Select
                                    placeholder="Select column or skip"
                                    size="sm"
                                    aria-label={`Map ${field.label} to CSV column`}
                                    selectedKeys={columnMapping[field.key] ?
                                      parsedData.headers.map((header, index) =>
                                        header === columnMapping[field.key] ? `${header}-${index}` : null
                                      ).filter(Boolean) : []}
                                    onSelectionChange={(keys) => {
                                      const selectedKey = Array.from(keys)[0] as string;
                                      if (selectedKey) {
                                        // Extract the original header name from the key format "header-index"
                                        const headerName = selectedKey.replace(/-\d+$/, '');
                                        setColumnMapping(prev => ({
                                          ...prev,
                                          [field.key]: headerName
                                        }));
                                        // Clear confidence when manually changed
                                        setMappingConfidence(prev => {
                                          const newConfidence = { ...prev };
                                          delete newConfidence[field.key];
                                          return newConfidence;
                                        });
                                      } else {
                                        setColumnMapping(prev => {
                                          const newMapping = { ...prev };
                                          delete newMapping[field.key];
                                          return newMapping;
                                        });
                                        setMappingConfidence(prev => {
                                          const newConfidence = { ...prev };
                                          delete newConfidence[field.key];
                                          return newConfidence;
                                        });
                                      }
                                    }}
                                  >
                                    {parsedData.headers.map((header, index) => (
                                      <SelectItem key={`${header}-${index}`}>
                                        {header}
                                      </SelectItem>
                                    ))}
                                  </Select>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollShadow>
                      </CardBody>
                    </Card>
                  </motion.div>
                )}

                {step === 'preview' && previewTrades.length > 0 && (
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <Icon icon="lucide:eye" className="text-primary" />
                            <span className="font-medium">Preview Import</span>
                          </div>
                          <Chip size="sm" variant="flat" color="primary">
                            Showing first 5 rows
                          </Chip>
                        </div>
                      </CardHeader>
                      <CardBody className="pt-0">
                        <div className="mb-4">
                          <p className="text-sm text-foreground-500 mb-2">
                            Review the mapped data before importing. Check if the values look correct.
                          </p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg">
                              <Icon icon="lucide:calculator" className="text-primary" />
                              <span className="text-sm text-primary font-medium">
                                Auto-calculated fields (Avg Entry, Position Size, Allocation %, P/L, etc.) are highlighted in blue
                              </span>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-warning/10 rounded-lg">
                              <Icon icon="lucide:info" className="text-warning" />
                              <span className="text-sm text-warning font-medium">
                                CMP values from CSV will be imported as-is (no auto-fetching)
                              </span>
                            </div>
                          </div>
                        </div>

                        <ScrollShadow className="max-h-96">
                          <Table aria-label="Preview table" className="min-w-full">
                            <TableHeader>
                              <TableColumn>Name</TableColumn>
                              <TableColumn>Date</TableColumn>
                              <TableColumn>Entry</TableColumn>
                              <TableColumn>Avg Entry</TableColumn>
                              <TableColumn>Qty</TableColumn>
                              <TableColumn>Position Size</TableColumn>
                              <TableColumn>Allocation %</TableColumn>
                              <TableColumn>Status</TableColumn>
                              <TableColumn>P/L</TableColumn>
                            </TableHeader>
                            <TableBody>
                              {previewTrades.map((trade, index) => (
                                <TableRow key={index}>
                                  <TableCell>{trade.name || '-'}</TableCell>
                                  <TableCell>
                                    {trade.date ? new Date(trade.date).toLocaleDateString() : '-'}
                                  </TableCell>
                                  <TableCell>₹{trade.entry?.toFixed(2) || '0.00'}</TableCell>
                                  <TableCell>
                                    <span className="text-primary font-medium">
                                      ₹{trade.avgEntry?.toFixed(2) || '0.00'}
                                    </span>
                                  </TableCell>
                                  <TableCell>{trade.initialQty || 0}</TableCell>
                                  <TableCell>
                                    <span className="text-primary font-medium">
                                      ₹{trade.positionSize?.toLocaleString() || '0'}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-primary font-medium">
                                      {trade.allocation?.toFixed(2) || '0.00'}%
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <Chip size="sm" variant="flat" color={
                                      trade.positionStatus === 'Open' ? 'warning' :
                                      trade.positionStatus === 'Closed' ? 'success' : 'primary'
                                    }>
                                      {trade.positionStatus}
                                    </Chip>
                                  </TableCell>
                                  <TableCell>
                                    <span className={trade.plRs >= 0 ? 'text-success' : 'text-danger'}>
                                      ₹{trade.plRs?.toFixed(2) || '0.00'}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollShadow>
                      </CardBody>
                    </Card>
                  </motion.div>
                )}

                {step === 'importing' && (
                  <motion.div
                    key="importing"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-6"
                  >
                    <Card>
                      <CardBody className="text-center py-12">
                        <Icon icon="lucide:loader-2" className="text-4xl text-primary mx-auto mb-4 animate-spin" />
                        <h3 className="text-lg font-medium mb-2">
                          Importing Trades
                        </h3>
                        <p className="text-foreground-500 mb-4">
                          {importProgress < 100
                            ? 'Processing trades... ' + Math.round(importProgress) + '%'
                            : 'Finalizing import...'
                          }
                        </p>
                        <div className="space-y-3 mb-6">
                          <div className="flex items-center justify-center gap-2 p-3 bg-primary/10 rounded-lg">
                            <Icon icon="lucide:zap" className="text-primary" />
                            <span className="text-sm text-primary font-medium">
                              Using optimized import - calculations will complete in background
                            </span>
                          </div>
                        </div>
                        <Progress
                          value={importProgress}
                          className="max-w-md mx-auto"
                          color="primary"
                          showValueLabel
                          aria-label="Import progress"
                        />
                      </CardBody>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </ModalBody>

            <ModalFooter>
              <div className="flex justify-between w-full">
                <div>
                  {step !== 'upload' && step !== 'importing' && (
                    <Button
                      variant="light"
                      onPress={() => {
                        if (step === 'dateFormat') setStep('upload');
                        else if (step === 'mapping') setStep('dateFormat');
                        else if (step === 'preview') setStep('mapping');
                      }}
                      startContent={<Icon icon="lucide:arrow-left" />}
                    >
                      Back
                    </Button>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="light" onPress={onClose} isDisabled={step === 'importing'}>
                    Cancel
                  </Button>

                  {step === 'dateFormat' && (
                    <Button
                      color="primary"
                      onPress={() => setStep('mapping')}
                      endContent={<Icon icon="lucide:arrow-right" />}
                    >
                      Continue to Mapping
                    </Button>
                  )}

                  {step === 'mapping' && (
                    <Button
                      color="primary"
                      onPress={generatePreview}
                      isDisabled={MAPPABLE_FIELDS.filter(f => f.required).some(field => !columnMapping[field.key])}
                      endContent={<Icon icon="lucide:arrow-right" />}
                    >
                      Preview
                    </Button>
                  )}

                  {step === 'preview' && (
                    <Button
                      color="success"
                      onPress={handleImport}
                      endContent={<Icon icon="lucide:upload" />}
                    >
                      Import {parsedData?.rows.length} Trades
                    </Button>
                  )}
                </div>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
