import React, { useEffect } from 'react';
import { useTrades } from '../../hooks/use-trades';
import { useAccountingMethod } from '../../context/AccountingMethodContext';
import { calculateTradePL } from '../../utils/accountingUtils';

export const CumulativePFDebug: React.FC = () => {
  const { trades } = useTrades();
  const { accountingMethod } = useAccountingMethod();
  const useCashBasis = accountingMethod === 'cash';

  useEffect(() => {
    if (trades.length === 0) return;

    console.log('🐛 [CUMM_PF_DEBUG] ===== DEBUGGING CUMULATIVE PF CALCULATION =====');
    console.log('🐛 [CUMM_PF_DEBUG] Accounting Method:', useCashBasis ? 'CASH BASIS' : 'ACCRUAL BASIS');
    console.log('🐛 [CUMM_PF_DEBUG] Total trades:', trades.length);

    // Debug each trade
    trades.forEach((trade, index) => {
      console.log(`\n🐛 [CUMM_PF_DEBUG] Trade ${index + 1}: ${trade.name}`);
      console.log('  - ID:', trade.id);
      console.log('  - Position Status:', trade.positionStatus);
      console.log('  - Date:', trade.date);
      
      if (useCashBasis) {
        console.log('  - Has _expandedTrades:', !!trade._expandedTrades);
        console.log('  - _expandedTrades length:', trade._expandedTrades?.length || 0);
        console.log('  - _cashPfImpact:', trade._cashPfImpact);
        
        if (trade._expandedTrades && trade._expandedTrades.length > 0) {
          trade._expandedTrades.forEach((expandedTrade, expandedIndex) => {
            console.log(`    Expanded ${expandedIndex + 1}:`);
            console.log('      - ID:', expandedTrade.id);
            console.log('      - _cashBasisExit:', expandedTrade._cashBasisExit);
            console.log('      - _cashPfImpact:', expandedTrade._cashPfImpact);
            
            if (expandedTrade._cashBasisExit) {
              const exitPL = calculateTradePL(expandedTrade, true);
              console.log('      - Calculated Exit P/L:', exitPL);
            }
          });
        }
      } else {
        console.log('  - _accrualPfImpact:', trade._accrualPfImpact);
        console.log('  - pfImpact (legacy):', trade.pfImpact);
      }
      
      console.log('  - cummPf:', trade.cummPf);
      console.log('  - plRs:', trade.plRs);
    });

    // Debug cumulative calculation manually
    let manualCumulative = 0;
    console.log('\n🐛 [CUMM_PF_DEBUG] ===== MANUAL CUMULATIVE CALCULATION =====');
    
    trades.forEach((trade, index) => {
      if (trade.positionStatus !== 'Open') {
        let pfImpact = 0;
        
        if (useCashBasis) {
          pfImpact = trade._cashPfImpact || 0;
        } else {
          pfImpact = trade._accrualPfImpact || trade.pfImpact || 0;
        }
        
        manualCumulative += pfImpact;
        console.log(`Trade ${index + 1} (${trade.name}): PF Impact = ${pfImpact.toFixed(4)}%, Cumulative = ${manualCumulative.toFixed(4)}%`);
      } else {
        console.log(`Trade ${index + 1} (${trade.name}): OPEN - Skipped`);
      }
    });
    
    console.log('🐛 [CUMM_PF_DEBUG] Final Manual Cumulative:', manualCumulative.toFixed(4), '%');
    console.log('🐛 [CUMM_PF_DEBUG] ===== END DEBUG =====\n');

  }, [trades, useCashBasis]);

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 bg-red-900/90 text-white p-2 rounded text-xs z-50">
      <div className="font-bold">Cumulative PF Debug</div>
      <div>Method: {useCashBasis ? 'Cash' : 'Accrual'}</div>
      <div>Trades: {trades.length}</div>
      <div className="text-yellow-300">Check console for details</div>
    </div>
  );
};

export default CumulativePFDebug;
