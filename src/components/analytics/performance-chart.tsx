import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
import { motion } from "framer-motion";
import { Trade } from "../../types/trade";
import { useTruePortfolioWithTrades } from "../../hooks/use-true-portfolio-with-trades";
import { useAccountingMethod } from "../../context/AccountingMethodContext";
import { useGlobalFilter } from "../../context/GlobalFilterContext";
import { isTradeInGlobalFilter } from "../../utils/dateFilterUtils";

export interface ChartDataPoint {
  month: string;
  capital: number;
  pl: number;
  plPercentage: number;
  startingCapital?: number;
  capitalChanges?: number;
}

interface PerformanceChartProps {
  trades: Trade[];
  onDataUpdate?: (data: ChartDataPoint[]) => void;
  selectedView: string;
}

function getMonthYear(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = (props) => {
  const { trades, onDataUpdate, selectedView } = props;
  const { accountingMethod } = useAccountingMethod();
  const useCashBasis = accountingMethod === 'cash';
  const { filter: globalFilter } = useGlobalFilter();

  // CRITICAL FIX: Remove memoization to prevent caching issues
  // Filter trades based on global filter and accounting method
  const filteredTrades = React.useMemo(() => {
    // Create fresh copies to prevent any mutations
    const freshTrades = trades.map(trade => ({ ...trade }));

    if (globalFilter.type === 'all') {
      return freshTrades; // No filtering for "All Time"
    }

    return freshTrades.filter(trade => isTradeInGlobalFilter(trade, globalFilter, useCashBasis));
  }, [trades, globalFilter, useCashBasis]);

  const { getPortfolioSize, getAllMonthlyTruePortfolios } = useTruePortfolioWithTrades(filteredTrades);

  // Memoize the monthly portfolios to prevent infinite re-renders
  // Pass accounting method to ensure correct P/L attribution
  // Use filtered trades to respect global filter selection
  const monthlyPortfolios = React.useMemo(() => {
    return getAllMonthlyTruePortfolios();
  }, [getAllMonthlyTruePortfolios, filteredTrades, useCashBasis]);

  // Get the earliest and latest trade dates to determine the date range
  // For cash basis, we need to consider exit dates as well
  const { startDate, endDate } = React.useMemo(() => {
    const getAllRelevantDates = (trades: any[]) => {
      const dates: Date[] = [];

      trades.forEach(trade => {
        // Add entry date
        if (trade.date) {
          dates.push(new Date(trade.date));
        }

        // For cash basis, also add exit dates
        if (useCashBasis && (trade.positionStatus === 'Closed' || trade.positionStatus === 'Partial')) {
          if (trade.exit1Date) dates.push(new Date(trade.exit1Date));
          if (trade.exit2Date) dates.push(new Date(trade.exit2Date));
          if (trade.exit3Date) dates.push(new Date(trade.exit3Date));
        }
      });

      return dates.filter(date => !isNaN(date.getTime()));
    };

    const allDates = getAllRelevantDates(trades);
    const sortedDates = allDates.sort((a, b) => a.getTime() - b.getTime());
    return {
      startDate: sortedDates[0] || new Date(),
      endDate: sortedDates[sortedDates.length - 1] || new Date()
    };
  }, [trades, useCashBasis]);

  // Helper function to check if a month is within the global filter range
  const isMonthInGlobalFilter = React.useCallback((month: string, year: number) => {
    if (globalFilter.type === 'all') {
      return true;
    }

    const monthDate = new Date(year, getMonthIndex(month), 1);

    switch (globalFilter.type) {
      case 'week': {
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        return monthDate >= weekAgo && monthDate <= now;
      }
      case 'month': {
        const filterMonth = globalFilter.month ?? new Date().getMonth();
        const filterYear = globalFilter.year ?? new Date().getFullYear();
        return monthDate.getMonth() === filterMonth && monthDate.getFullYear() === filterYear;
      }
      case 'fy': {
        const now = new Date();
        const fyStartYear = globalFilter.fyStartYear ?? (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1);
        const fyStart = new Date(fyStartYear, 3, 1); // April 1st
        const fyEnd = new Date(fyStartYear + 1, 2, 31); // March 31st next year
        return monthDate >= fyStart && monthDate <= fyEnd;
      }
      case 'cy': {
        const cyYear = globalFilter.year ?? new Date().getFullYear();
        return monthDate.getFullYear() === cyYear;
      }
      case 'custom': {
        if (!globalFilter.startDate || !globalFilter.endDate) return true;
        return monthDate >= globalFilter.startDate && monthDate <= globalFilter.endDate;
      }
      default:
        return true;
    }
  }, [globalFilter]);

  // Helper function to get month index from month name
  const getMonthIndex = (month: string): number => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.indexOf(month);
  };

  // Use monthlyPortfolios data which already accounts for capital changes and P/L
  // Filter out months with no meaningful data AND months outside global filter range
  const processedChartData = React.useMemo(() => {
    return monthlyPortfolios
      .filter(monthData => {
        // First check if month is within global filter range
        if (!isMonthInGlobalFilter(monthData.month, monthData.year)) {
          return false;
        }

        // Then include months that have:
        // 1. Actual P/L (trading activity), OR
        // 2. Capital changes (deposits/withdrawals), OR
        // 3. Non-zero starting capital (portfolio setup)
        return monthData.pl !== 0 ||
               monthData.capitalChanges !== 0 ||
               monthData.startingCapital > 0;
      })
      .map(monthData => ({
        month: `${monthData.month} ${monthData.year}`,
        capital: monthData.finalCapital,
        pl: monthData.pl,
        startingCapital: monthData.startingCapital,
        capitalChanges: monthData.capitalChanges,
        plPercentage: monthData.startingCapital !== 0 ? (monthData.pl / monthData.startingCapital) * 100 : 0
      }));
  }, [monthlyPortfolios, isMonthInGlobalFilter]);

  // CRITICAL FIX: Cleanup effect to prevent interference
  React.useEffect(() => {
    return () => {
      // Clear any potential caches when component unmounts
      console.log('🧹 PerformanceChart: Cleaning up on unmount');

      if (typeof window !== 'undefined') {
        (window as any).performanceChartCache = undefined;
      }
    };
  }, []);

  // Notify parent component about data update with debouncing to prevent infinite loops
  React.useEffect(() => {
    if (onDataUpdate && processedChartData.length > 0) {
      const timeoutId = setTimeout(() => {
        onDataUpdate(processedChartData);
      }, 100); // 100ms debounce

      return () => clearTimeout(timeoutId);
    }
  }, [processedChartData]); // Removed onDataUpdate from dependencies to prevent infinite loop

  // Recalculate Drawdown and Volatility based on processedChartData
  const drawdownData = React.useMemo(() => {
    let runningMax = processedChartData[0]?.startingCapital || 0;
    return processedChartData.map((d) => {
      if (d.capital > runningMax) runningMax = d.capital;
      const drawdown = runningMax !== 0 ? ((runningMax - d.capital) / runningMax) * 100 : 0;
      return { ...d, drawdown };
    });
  }, [processedChartData]);

  const volatilityData = React.useMemo(() => {
    function rollingStd(arr: number[], window: number) {
      return arr.map((_, i) => {
        if (i < window - 1) return 0;
        const slice = arr.slice(i - window + 1, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / window;
        const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / window;
        return Math.sqrt(variance);
      });
    }
    const plPercentages = processedChartData.map(d => d.plPercentage);
    const volatilityArr = rollingStd(plPercentages, 3);
    return processedChartData.map((d, i) => ({ ...d, volatility: volatilityArr[i] }));
  }, [processedChartData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  // Show empty state if no data to display
  if (processedChartData.length === 0) {
    return (
      <div className="h-[350px] flex items-center justify-center">
        <div className="text-center text-default-500">
          <div className="text-lg font-medium mb-2">No Portfolio Data</div>
          <div className="text-sm">Start trading to see your portfolio performance</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        {selectedView === "capital" ? (
          <AreaChart
            data={processedChartData}
            margin={{ top: 10, right: 30, left: 30, bottom: 30 }}
          >
            <defs>
              <linearGradient id="colorCapital" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--heroui-primary-500))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--heroui-primary-500))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--heroui-divider))" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis
              tickFormatter={(value) => formatCurrency(value)}
              axisLine={false}
              tickLine={false}
              dx={-10}
              width={80}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value: number, name: string, props: any) => {
                if (name === "Portfolio Value") {
                  const dataPoint = props.payload;
                  const capitalChange = dataPoint.capitalChanges;
                  const startingCapital = dataPoint.startingCapital;
                  const plPercentage = dataPoint.plPercentage;
                  const items = [
                    [formatCurrency(value), "Portfolio Value"],
                  ];
                  if (startingCapital !== undefined && startingCapital !== null) {
                    items.push([formatCurrency(startingCapital), "Starting Capital"]);
                  }
                  if (capitalChange !== undefined && capitalChange !== 0) {
                    items.push([formatCurrency(capitalChange), capitalChange > 0 ? "Deposit" : "Withdrawal"]);
                  }
                  if (plPercentage !== undefined && plPercentage !== null) {
                    items.push([`${plPercentage.toFixed(2)}%`, "Monthly P/L %"]);
                  }
                  return items;
                }
                return [formatCurrency(value), name];
              }}
              labelFormatter={(label) => label}
              contentStyle={{
                backgroundColor: "hsl(var(--heroui-content1))",
                border: "1px solid hsl(var(--heroui-divider))",
                borderRadius: "8px",
                padding: "8px 12px"
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="capital"
              name="Portfolio Value"
              stroke="hsl(var(--heroui-primary))"
              fillOpacity={1}
              fill="url(#colorCapital)"
              strokeWidth={2}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          </AreaChart>
        ) : (
          <AreaChart
            data={processedChartData}
            margin={{ top: 10, right: 30, left: 30, bottom: 30 }}
          >
            <defs>
              <linearGradient id="colorPL" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--heroui-success-500))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--heroui-success-500))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--heroui-divider))" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis
              tickFormatter={(value) => `${value.toFixed(0)}%`}
              axisLine={false}
              tickLine={false}
              dx={-10}
              width={80}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value: number, name: string, props: any) => {
                if (name === "P&L Percentage") {
                  const dataPoint = props.payload;
                  const items = [
                    [`${value.toFixed(2)}%`, "P&L Percentage"],
                  ];
                  if (dataPoint.pl !== undefined && dataPoint.pl !== null) {
                    items.push([formatCurrency(dataPoint.pl), "Total P&L"]);
                  }
                  if (dataPoint.startingCapital !== undefined && dataPoint.startingCapital !== null) {
                    items.push([formatCurrency(dataPoint.startingCapital), "Starting Capital"]);
                  }
                  return items;
                }
                return [`${value.toFixed(2)}%`, name];
              }}
              labelFormatter={(label) => label}
              contentStyle={{
                backgroundColor: "hsl(var(--heroui-content1))",
                border: "1px solid hsl(var(--heroui-divider))",
                borderRadius: "8px",
                padding: "8px 12px"
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="plPercentage"
              name="P&L Percentage"
              stroke="hsl(var(--heroui-success))"
              fillOpacity={1}
              fill="url(#colorPL)"
              strokeWidth={2}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};