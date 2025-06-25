import React, { Suspense } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Divider,
  Button,
  ButtonGroup,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Tabs,
  Tab
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { useTrades } from "../hooks/use-trades";
import { useDashboardConfig } from "../hooks/use-dashboard-config";
import { pageVariants, cardVariants, fadeInVariants } from "../utils/animations";
import { Loader } from "./Loader";

// Lazy load analytics components for better performance
const PerformanceMetrics = React.lazy(() => import("./analytics/performance-metrics").then(module => ({ default: module.PerformanceMetrics })));
const TradeStatistics = React.lazy(() => import("./analytics/trade-statistics").then(module => ({ default: module.TradeStatistics })));
const TopPerformers = React.lazy(() => import("./analytics/top-performers").then(module => ({ default: module.TopPerformers })));
const PerformanceChart = React.lazy(() => import("./analytics/performance-chart").then(module => ({ default: module.PerformanceChart })));


interface ChartDataPoint {
  month: string;
  capital: number;
  pl: number;
  plPercentage: number;
  startingCapital?: number;
}

export const TradeAnalytics = React.memo(function TradeAnalytics() {
  // CRITICAL FIX: Use fresh trade data without caching to prevent interference
  const { trades: originalTrades } = useTrades();

  // Create a fresh copy of trades to prevent any mutations from affecting the original data
  const trades = React.useMemo(() => {
    return originalTrades.map(trade => ({ ...trade }));
  }, [originalTrades]);

  const { dashboardConfig, toggleWidgetVisibility } = useDashboardConfig();
  const [selectedPeriod, setSelectedPeriod] = React.useState("YTD");
  const [selectedView, setSelectedView] = React.useState("performance");

  const [chartData, setChartData] = React.useState<ChartDataPoint[]>([]);
  
  const periods = ["1W", "1M", "3M", "6M", "YTD", "1Y", "ALL"];
  
  const handleChartDataUpdate = React.useCallback((data: ChartDataPoint[]) => {
    setChartData(data);
  }, []);

  // CRITICAL FIX: Cleanup effect to prevent interference with main trade data
  React.useEffect(() => {
    return () => {
      // Clear any potential caches or side effects when component unmounts
      console.log('🧹 TradeAnalytics: Cleaning up on unmount');

      // Clear any browser caches that might interfere
      if (typeof window !== 'undefined') {
        (window as any).analyticsCache = undefined;
        (window as any).chartDataCache = undefined;
      }
    };
  }, []);
  
  const containerVariants = {
    initial: {},
    animate: {
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const getWidgetVisibility = (id: string) => {
    return dashboardConfig.find(widget => widget.id === id)?.isVisible;
  };

  return (
    <motion.div 
      className="space-y-6"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <motion.div
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
        variants={fadeInVariants}
      >
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Analytics Dashboard</h2>
        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <Button 
              variant="flat" 
              color="default" 
              startContent={<Icon icon="lucide:customize" />}
              size="sm"
              radius="full"
            >
              Customize Dashboard
            </Button>
          </DropdownTrigger>
          <DropdownMenu 
            aria-label="Customize Dashboard Actions"
            closeOnSelect={false}
            selectionMode="multiple"
            selectedKeys={new Set(dashboardConfig.filter(w => w.isVisible).map(w => w.id))}
            onSelectionChange={(keys) => {
              const selectedKeysArray = Array.from(keys as any); // Convert to array
              dashboardConfig.forEach(widget => {
                const newVisibility = selectedKeysArray.includes(widget.id);
                if (widget.isVisible !== newVisibility) {
                  toggleWidgetVisibility(widget.id);
                }
              });
            }}
          >
            {dashboardConfig.map((widget) => (
              <DropdownItem key={widget.id} textValue={widget.name}>
                <div className="flex items-center gap-2">
                  <span>{widget.name}</span>
                </div>
              </DropdownItem>
            ))}
          </DropdownMenu>
        </Dropdown>
      </motion.div>
      
      <motion.div 
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        variants={containerVariants}
        initial="initial"
        animate="animate"
      >
        {getWidgetVisibility('portfolio-performance') && (
          <motion.div
            className="lg:col-span-2"
            variants={cardVariants}
          >
            <Card className="dark:bg-gray-900">
              <CardHeader className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-semibold tracking-tight dark:text-white">
                    Portfolio Performance
                  </h3>
                  <div className="flex items-center gap-3">
                    <motion.div
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${
                        chartData.length > 0 && chartData[chartData.length - 1].plPercentage >= 0
                          ? 'bg-success-100 dark:bg-success-900'
                          : 'bg-danger-100 dark:bg-danger-900'
                      }`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2, type: "spring" }}
                    >
                      <Icon
                        icon={chartData.length > 0 && chartData[chartData.length - 1].plPercentage >= 0
                          ? "lucide:trending-up"
                          : "lucide:trending-down"}
                        className={chartData.length > 0 && chartData[chartData.length - 1].plPercentage >= 0
                          ? "text-success-600 dark:text-success-400"
                          : "text-danger-600 dark:text-danger-400"}
                      />
                      <span
                        className={`text-sm font-medium ${
                          chartData.length > 0 && chartData[chartData.length - 1].plPercentage >= 0
                            ? 'text-success-600 dark:text-success-400'
                            : 'text-danger-600 dark:text-danger-400'
                        }`}
                      >
                        {chartData && chartData.length > 0
                          ? `${chartData[chartData.length - 1].plPercentage >= 0 ? '+' : ''}${chartData[chartData.length - 1].plPercentage.toFixed(2)}%`
                          : '0.00%'}
                      </span>
                    </motion.div>
                    <span className="text-sm text-default-500 dark:text-gray-400 font-medium min-w-[40px] text-center">{selectedPeriod}</span>
                  </div>
                </div>


              </CardHeader>
              <CardBody>
                <Suspense fallback={<Loader size="sm" message="Loading performance..." />}>
                  <PerformanceChart
                    trades={trades}
                    onDataUpdate={handleChartDataUpdate}
                    selectedView={selectedView}
                  />
                </Suspense>
              </CardBody>
            </Card>
          </motion.div>
        )}
        
        {getWidgetVisibility('performance-metrics') && (
          <motion.div
            variants={cardVariants}
          >
            <Card className="dark:bg-gray-900">
              <CardHeader>
                <h3 className="text-xl font-semibold tracking-tight dark:text-white">Performance Metrics</h3>
              </CardHeader>
              <CardBody>
                <Suspense fallback={<Loader size="sm" message="Loading metrics..." />}>
                  <PerformanceMetrics trades={trades} isEditing={false} />
                </Suspense>
              </CardBody>
            </Card>
          </motion.div>
        )}
      </motion.div>


      
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
        variants={containerVariants}
        initial="initial"
        animate="animate"
      >
        {getWidgetVisibility('trade-statistics') && (
          <motion.div
            variants={cardVariants}
          >
            <Card className="dark:bg-gray-900">
              <CardHeader>
                <h3 className="text-xl font-semibold tracking-tight dark:text-white">Trade Statistics</h3>
              </CardHeader>
              <Divider className="dark:bg-gray-800" />
              <CardBody>
                <Suspense fallback={<Loader size="sm" message="Loading statistics..." />}>
                  <TradeStatistics trades={trades} />
                </Suspense>
              </CardBody>
            </Card>
          </motion.div>
        )}
        
        {getWidgetVisibility('top-performers') && (
          <motion.div
            variants={cardVariants}
          >
            <Card className="dark:bg-gray-900">
              <CardHeader className="flex justify-between items-center">
                <h3 className="text-xl font-semibold tracking-tight dark:text-white">Top Performers</h3>
              </CardHeader>
              <Divider className="dark:bg-gray-800" />
              <CardBody>
                <Suspense fallback={<Loader size="sm" message="Loading top performers..." />}>
                  <TopPerformers trades={trades} />
                </Suspense>
              </CardBody>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
});

export default TradeAnalytics;