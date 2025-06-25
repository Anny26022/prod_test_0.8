import { supabase } from '../lib/supabase'
import { AuthService } from './authService'
import type { Trade, ChartImage, CapitalChange } from '../types/trade'
import { v4 as uuidv4 } from 'uuid'
import { validateTradeForDatabase, sanitizeTradeForDatabase, validateTradesBatch } from '../utils/databaseValidation'

// Simple hash function for browser compatibility
const simpleHash = (str: string): string => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

// Helper function to convert legacy trade IDs to UUIDs
const convertToUUID = (id: string): string => {
  // If it's already a valid UUID, return it
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (uuidRegex.test(id)) {
    return id
  }

  // For legacy IDs, create a deterministic UUID based on the original ID
  // This ensures the same legacy ID always maps to the same UUID
  const hash1 = simpleHash(id)
  const hash2 = simpleHash(id + '_salt1')
  const hash3 = simpleHash(id + '_salt2')
  const hash4 = simpleHash(id + '_salt3')

  // Format as UUID v4
  return [
    hash1.substr(0, 8),
    hash2.substr(0, 4),
    '4' + hash3.substr(0, 3), // Version 4
    ((parseInt(hash4.substr(0, 1), 16) & 0x3) | 0x8).toString(16) + hash4.substr(1, 3), // Variant bits
    (hash1 + hash2).substr(0, 12)
  ].join('-')
}

// Map to store legacy ID to UUID conversions
const idMappings = new Map<string, string>()

// Helper function to convert database row to Trade object
const dbRowToTrade = (row: any): Trade => {
  // Convert UUID back to original ID if it was mapped
  let originalId = row.id
  for (const [legacyId, uuid] of idMappings.entries()) {
    if (uuid === row.id) {
      originalId = legacyId
      break
    }
  }

  return {
    id: originalId,
    tradeNo: row.trade_no,
    date: row.date,
    name: row.name,
    entry: Number(row.entry || 0),
    avgEntry: Number(row.avg_entry || 0),
    sl: Number(row.sl || 0),
    tsl: Number(row.tsl || 0),
    buySell: row.buy_sell as 'Buy' | 'Sell',
    cmp: Number(row.cmp || 0),
    setup: row.setup || '',
    baseDuration: row.base_duration || '',
    initialQty: Number(row.initial_qty || 0),
    pyramid1Price: Number(row.pyramid1_price || 0),
    pyramid1Qty: Number(row.pyramid1_qty || 0),
    pyramid1Date: row.pyramid1_date || '',
    pyramid2Price: Number(row.pyramid2_price || 0),
    pyramid2Qty: Number(row.pyramid2_qty || 0),
    pyramid2Date: row.pyramid2_date || '',
    positionSize: Number(row.position_size || 0),
    allocation: Number(row.allocation || 0),
    slPercent: Number(row.sl_percent || 0),
    exit1Price: Number(row.exit1_price || 0),
    exit1Qty: Number(row.exit1_qty || 0),
    exit1Date: row.exit1_date || '',
    exit2Price: Number(row.exit2_price || 0),
    exit2Qty: Number(row.exit2_qty || 0),
    exit2Date: row.exit2_date || '',
    exit3Price: Number(row.exit3_price || 0),
    exit3Qty: Number(row.exit3_qty || 0),
    exit3Date: row.exit3_date || '',
    openQty: Number(row.open_qty || 0),
    exitedQty: Number(row.exited_qty || 0),
    avgExitPrice: Number(row.avg_exit_price || 0),
    stockMove: Number(row.stock_move || 0),
    rewardRisk: Number(row.reward_risk || 0),
    holdingDays: Number(row.holding_days || 0),
    positionStatus: row.position_status as 'Open' | 'Closed' | 'Partial',
    realisedAmount: Number(row.realised_amount || 0),
    plRs: Number(row.pl_rs || 0),
    pfImpact: Number(row.pf_impact || 0),
    cummPf: Number(row.cumm_pf || 0),
    planFollowed: Boolean(row.plan_followed),
    exitTrigger: row.exit_trigger || '',
    proficiencyGrowthAreas: row.proficiency_growth_areas || '',
    sector: row.sector || '',
    openHeat: Number(row.open_heat || 0),
    notes: row.notes || '',
    chartAttachments: row.chart_attachments || {},
    _userEditedFields: row.user_edited_fields || [],
    _cmpAutoFetched: Boolean(row.cmp_auto_fetched),
    _needsRecalculation: Boolean(row.needs_recalculation),
  }
}

// Helper function to convert Trade object to database insert/update format
const tradeToDbRow = (trade: Trade, userId: string) => {
  // Convert legacy ID to UUID and store mapping
  const uuid = convertToUUID(trade.id)
  idMappings.set(trade.id, uuid)

  return {
    id: uuid,
    user_id: userId,
    trade_no: trade.tradeNo,
    date: trade.date,
    name: trade.name,
    entry: trade.entry,
    avg_entry: trade.avgEntry,
    sl: trade.sl,
    tsl: trade.tsl,
    buy_sell: trade.buySell,
    cmp: trade.cmp,
    setup: trade.setup,
    base_duration: trade.baseDuration,
    initial_qty: trade.initialQty,
    pyramid1_price: trade.pyramid1Price,
    pyramid1_qty: trade.pyramid1Qty,
    pyramid1_date: trade.pyramid1Date || null,
    pyramid2_price: trade.pyramid2Price,
    pyramid2_qty: trade.pyramid2Qty,
    pyramid2_date: trade.pyramid2Date || null,
    position_size: trade.positionSize,
    allocation: trade.allocation,
    sl_percent: trade.slPercent,
    exit1_price: trade.exit1Price,
    exit1_qty: trade.exit1Qty,
    exit1_date: trade.exit1Date || null,
    exit2_price: trade.exit2Price,
    exit2_qty: trade.exit2Qty,
    exit2_date: trade.exit2Date || null,
    exit3_price: trade.exit3Price,
    exit3_qty: trade.exit3Qty,
    exit3_date: trade.exit3Date || null,
    open_qty: trade.openQty,
    exited_qty: trade.exitedQty,
    avg_exit_price: trade.avgExitPrice,
    stock_move: trade.stockMove,
    reward_risk: trade.rewardRisk,
    holding_days: trade.holdingDays,
    position_status: trade.positionStatus,
    realised_amount: trade.realisedAmount,
    pl_rs: trade.plRs,
    pf_impact: trade.pfImpact,
    cumm_pf: trade.cummPf,
    plan_followed: trade.planFollowed,
    exit_trigger: trade.exitTrigger,
    proficiency_growth_areas: trade.proficiencyGrowthAreas,
    sector: trade.sector,
    open_heat: trade.openHeat,
    notes: trade.notes,
    chart_attachments: trade.chartAttachments || {},
    user_edited_fields: trade._userEditedFields || [],
    cmp_auto_fetched: trade._cmpAutoFetched || false,
    needs_recalculation: trade._needsRecalculation || false,
  }
}

export class SupabaseService {
  // ===== TRADES =====
  
  // Performance cache for trades (DISABLED to prevent inconsistent loading)
  private static tradesCache = new Map<string, { data: Trade[], timestamp: number }>();
  private static CACHE_DURATION = 30000; // 30 seconds

  // Loading lock to prevent multiple simultaneous loads
  private static loadingLock = new Map<string, Promise<Trade[]>>();

  // Save lock to prevent multiple simultaneous saves
  private static savingLock = new Map<string, Promise<boolean>>();

  static async getAllTrades(): Promise<Trade[]> {
    const startTime = performance.now();

    try {
      const userId = await AuthService.getUserId()
      if (!userId) {
        // User not authenticated - return empty array silently for guest mode
        return []
      }

      // CRITICAL FIX: Prevent multiple simultaneous loads
      const lockKey = `loading_${userId}`;
      if (this.loadingLock.has(lockKey)) {
        console.log('⏳ Waiting for existing load to complete...');
        return await this.loadingLock.get(lockKey)!;
      }

      // Create loading promise and store it
      const loadingPromise = this.performActualLoad(userId, startTime);
      this.loadingLock.set(lockKey, loadingPromise);

      try {
        const result = await loadingPromise;
        return result;
      } finally {
        // Always clean up the lock
        this.loadingLock.delete(lockKey);
      }
    } catch (error) {
      console.error('❌ Failed to get trades from Supabase:', error)
      return []
    }
  }

  private static async performActualLoad(userId: string, startTime: number): Promise<Trade[]> {
    try {
      // CRITICAL FIX: Disable cache to prevent inconsistent data loading
      // Cache was causing partial loads and inconsistent trade counts
      console.log('🔄 Loading fresh data from Supabase (service cache disabled)');

      // First, check the actual count in the database for debugging
      const { count, error: countError } = await supabase
        .from('trades')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (!countError) {
        console.log(`📊 Database contains ${count} trades for user ${userId}`);
      }

      // Complete query with all required fields matching database schema
      const { data, error } = await supabase
        .from('trades')
        .select(`
          id, user_id, trade_no, name, date, entry, avg_entry, sl, tsl, buy_sell, cmp,
          setup, base_duration, initial_qty,
          pyramid1_price, pyramid1_qty, pyramid1_date,
          pyramid2_price, pyramid2_qty, pyramid2_date,
          position_size, allocation, sl_percent,
          exit1_price, exit1_qty, exit1_date,
          exit2_price, exit2_qty, exit2_date,
          exit3_price, exit3_qty, exit3_date,
          open_qty, exited_qty, avg_exit_price, stock_move, reward_risk, holding_days,
          position_status, realised_amount, pl_rs, pf_impact, cumm_pf,
          plan_followed, exit_trigger, proficiency_growth_areas, sector, open_heat,
          notes, chart_attachments, user_edited_fields, cmp_auto_fetched, needs_recalculation,
          created_at, updated_at
        `)
        .eq('user_id', userId)
        .order('trade_no', { ascending: true })

      if (error) throw error

      const trades = data.map(dbRowToTrade);

      // CRITICAL FIX: Don't cache to prevent inconsistent data
      // this.tradesCache.set(cacheKey, { data: trades, timestamp: Date.now() });

      const endTime = performance.now();
      console.log(`⚡ Trades loaded from Supabase in ${Math.round(endTime - startTime)}ms`);
      console.log(`📊 Total trades loaded: ${trades.length}`);

      return trades;
    } catch (error) {
      console.error('❌ Failed to perform actual load from Supabase:', error)
      return []
    }
  }

  // Clear cache when trades are updated
  static clearTradesCache(userId?: string): void {
    if (userId) {
      this.tradesCache.delete(`trades_${userId}`);
    } else {
      this.tradesCache.clear();
    }
  }

  static async getTrade(id: string): Promise<Trade | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) {
        // User not authenticated - return null silently for guest mode
        return null
      }

      // Convert legacy ID to UUID for lookup
      const uuid = convertToUUID(id)
      idMappings.set(id, uuid)

      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('id', uuid)
        .eq('user_id', userId)
        .single()

      if (error) throw error

      return data ? dbRowToTrade(data) : null
    } catch (error) {
      console.error('❌ Failed to get trade from Supabase:', error)
      return null
    }
  }

  /**
   * Get trade directly from Supabase only (no local fallback)
   * Used for verifying trade exists in Supabase for foreign key constraints
   */
  static async getTradeFromSupabaseOnly(id: string): Promise<Trade | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) {
        // User not authenticated - return null silently for guest mode
        return null
      }

      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data ? dbRowToTrade(data) : null
    } catch (error) {
      console.error('❌ Failed to get trade from Supabase only:', error)
      return null
    }
  }

  static async saveTrade(trade: Trade): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) {
        console.warn('⚠️ Cannot save trade - user not authenticated')
        return false
      }

      console.log('💾 Saving trade to Supabase:', trade.name, 'User ID:', userId)

      // Validate and sanitize trade data before saving
      const validation = validateTradeForDatabase(trade)
      if (!validation.isValid) {
        console.warn('⚠️ Trade data validation failed:', validation.errors)
        console.log('🔧 Sanitizing trade data to fit database constraints')
        trade = sanitizeTradeForDatabase(trade)
      }

      const dbRow = tradeToDbRow(trade, userId)
      const uuid = dbRow.id

      // Check if trade exists using UUID
      const { data: existingTrade } = await supabase
        .from('trades')
        .select('id')
        .eq('id', uuid)
        .eq('user_id', userId)
        .single()

      if (existingTrade) {
        // Update existing trade
        console.log('🔄 Updating existing trade:', trade.name)
        const { error } = await supabase
          .from('trades')
          .update(dbRow)
          .eq('id', uuid)
          .eq('user_id', userId)

        if (error) {
          console.error('❌ Error updating trade:', error)
          throw error
        }
        console.log('✅ Trade updated successfully:', trade.name)
      } else {
        // Insert new trade
        console.log('➕ Inserting new trade:', trade.name)
        const { error } = await supabase
          .from('trades')
          .insert(dbRow)

        if (error) {
          console.error('❌ Error inserting trade:', error)
          throw error
        }
        console.log('✅ Trade inserted successfully:', trade.name)
      }

      // Clear cache after successful save
      this.clearTradesCache(userId)

      return true
    } catch (error) {
      console.error('❌ Failed to save trade to Supabase:', error)
      return false
    }
  }

  static async saveAllTrades(trades: Trade[]): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) {
        console.warn('⚠️ Cannot save trades - user not authenticated')
        return false
      }

      // CRITICAL FIX: Prevent multiple simultaneous save operations
      const saveLockKey = `saving_${userId}`;
      if (this.savingLock.has(saveLockKey)) {
        console.log('⏳ Save operation already in progress, waiting...');
        return await this.savingLock.get(saveLockKey)!;
      }

      console.log(`💾 Saving ${trades.length} trades to Supabase for user:`, userId)

      // Create save promise and store it
      const savePromise = this.performActualSave(trades, userId);
      this.savingLock.set(saveLockKey, savePromise);

      try {
        const result = await savePromise;
        return result;
      } finally {
        // Always clean up the lock
        this.savingLock.delete(saveLockKey);
      }
    } catch (error) {
      console.error('❌ Failed to save all trades to Supabase:', error)
      return false
    }
  }

  private static async performActualSave(trades: Trade[], userId: string): Promise<boolean> {
    try {

      // Validate and sanitize all trades before saving
      console.log('🔍 Validating trade data for database constraints...')
      const validation = validateTradesBatch(trades)

      if (validation.invalidTrades.length > 0) {
        console.warn(`⚠️ Found ${validation.invalidTrades.length} trades with validation issues:`)
        validation.invalidTrades.forEach(({ trade, errors }) => {
          console.warn(`  - Trade ${trade.tradeNo} (${trade.name}):`, errors)
        })
        console.log('🔧 Sanitizing invalid trades to fit database constraints')

        // Sanitize all trades to ensure they fit database constraints
        trades = trades.map(trade => sanitizeTradeForDatabase(trade))
        console.log('✅ All trades sanitized successfully')
      } else {
        console.log('✅ All trades passed validation')
      }

      // CRITICAL FIX: Ensure complete deletion before inserting new trades
      console.log('🗑️ Clearing existing trades...')

      // First, get count of existing trades
      const { count: existingCount } = await supabase
        .from('trades')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      console.log(`📊 Found ${existingCount || 0} existing trades to delete`);

      if (existingCount && existingCount > 0) {
        // Delete in batches to avoid timeout
        let deletedCount = 0;
        const deleteAttempts = 3;

        for (let attempt = 1; attempt <= deleteAttempts; attempt++) {
          try {
            const { error: deleteError, count: deletedInThisAttempt } = await supabase
              .from('trades')
              .delete({ count: 'exact' })
              .eq('user_id', userId);

            if (deleteError) {
              console.warn(`⚠️ Delete attempt ${attempt} failed:`, deleteError);
              if (attempt === deleteAttempts) {
                throw deleteError;
              }
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }

            deletedCount = deletedInThisAttempt || 0;
            console.log(`✅ Successfully deleted ${deletedCount} existing trades`);
            break;

          } catch (deleteErr) {
            console.warn(`⚠️ Delete attempt ${attempt} error:`, deleteErr);
            if (attempt === deleteAttempts) {
              throw deleteErr;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }

        // Verify deletion was successful
        const { count: remainingCount } = await supabase
          .from('trades')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);

        if (remainingCount && remainingCount > 0) {
          console.warn(`⚠️ Warning: ${remainingCount} trades still remain after deletion`);
          // Force delete any remaining trades
          await supabase.from('trades').delete().eq('user_id', userId);
        } else {
          console.log('✅ All existing trades successfully cleared');
        }
      } else {
        console.log('ℹ️ No existing trades to delete');
      }

      if (trades.length === 0) {
        console.log('ℹ️ No trades to save')
        this.clearTradesCache(userId)
        return true
      }

      // CRITICAL FIX: Generate completely fresh UUIDs to prevent conflicts
      const dbRows = trades.map((trade, index) => {
        const dbRow = tradeToDbRow(trade, userId)
        // Always generate a fresh UUID to prevent any conflicts
        const freshUUID = uuidv4()
        dbRow.id = freshUUID
        console.log(`🆔 Generated fresh UUID for trade ${trade.tradeNo || index + 1}: ${freshUUID}`)
        return dbRow
      })
      console.log('📝 Converted trades to DB format:', dbRows.length)

      // Verify all UUIDs are unique
      const uuidSet = new Set(dbRows.map(row => row.id));
      if (uuidSet.size !== dbRows.length) {
        console.error('❌ Duplicate UUIDs detected in batch!');
        // Regenerate all UUIDs to be safe
        dbRows.forEach((row, index) => {
          row.id = uuidv4();
          console.log(`🔄 Regenerated UUID for trade ${index + 1}: ${row.id}`);
        });
      } else {
        console.log('✅ All UUIDs are unique');
      }

      // Insert all new trades in smaller batches with enhanced error handling
      const batchSize = 25 // Smaller batches for better reliability
      const totalBatches = Math.ceil(dbRows.length / batchSize)

      for (let i = 0; i < dbRows.length; i += batchSize) {
        const batch = dbRows.slice(i, i + batchSize)
        const batchNumber = Math.floor(i/batchSize) + 1
        console.log(`📤 Inserting batch ${batchNumber}/${totalBatches} (${batch.length} trades)`)

        let retryCount = 0
        const maxRetries = 3

        while (retryCount <= maxRetries) {
          try {
            const { error: insertError } = await supabase
              .from('trades')
              .insert(batch)

            if (insertError) {
              console.error(`❌ Error inserting batch ${batchNumber} (attempt ${retryCount + 1}):`, insertError)

              // Handle different error types
              if (insertError.code === '23505') {
                // Duplicate key error - regenerate ALL UUIDs with timestamp suffix
                console.log('🔄 Duplicate key detected, regenerating UUIDs with timestamp...')
                const timestamp = Date.now();
                batch.forEach((row, idx) => {
                  // Generate UUID with timestamp to ensure uniqueness
                  row.id = uuidv4();
                  console.log(`🆔 New UUID for batch ${batchNumber}, trade ${idx + 1}: ${row.id}`);
                });

                // Verify uniqueness within batch
                const batchUUIDs = new Set(batch.map(row => row.id));
                if (batchUUIDs.size !== batch.length) {
                  console.error('❌ Still have duplicate UUIDs in batch, regenerating again...');
                  batch.forEach((row, idx) => {
                    row.id = `${uuidv4()}-${timestamp}-${idx}`.substring(0, 36);
                  });
                }

                retryCount++
                continue
              } else if (insertError.code === '22003') {
                // Numeric overflow - sanitize data
                console.log('🔧 Numeric overflow detected, sanitizing data...')
                batch.forEach((row, index) => {
                  const originalTrade = trades[i + index]
                  const sanitizedTrade = sanitizeTradeForDatabase(originalTrade)
                  Object.assign(row, tradeToDbRow(sanitizedTrade, userId))
                })
                retryCount++
                continue
              } else if (insertError.code === '23514') {
                // Check constraint violation
                console.log('⚠️ Constraint violation detected, skipping problematic trades...')
                // Try inserting trades one by one to identify problematic ones
                for (const singleRow of batch) {
                  try {
                    const { error: singleError } = await supabase
                      .from('trades')
                      .insert([singleRow])

                    if (singleError) {
                      console.warn(`⚠️ Skipping trade ${singleRow.trade_no}: ${singleError.message}`)
                    } else {
                      console.log(`✅ Individual trade ${singleRow.trade_no} inserted`)
                    }
                  } catch (singleTradeError) {
                    console.warn(`⚠️ Failed to insert trade ${singleRow.trade_no}:`, singleTradeError)
                  }
                }
                break // Exit retry loop for this batch
              } else {
                throw insertError
              }
            } else {
              console.log(`✅ Batch ${batchNumber} inserted successfully`)
              break // Success - exit retry loop
            }
          } catch (batchError) {
            console.error(`❌ Failed to insert batch ${batchNumber} (attempt ${retryCount + 1}):`, batchError)
            retryCount++

            if (retryCount > maxRetries) {
              console.error(`❌ Max retries exceeded for batch ${batchNumber}`)
              throw batchError
            }

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
          }
        }
      }

      console.log('✅ All trades saved successfully to Supabase')

      // CRITICAL FIX: Verify the correct number of trades were inserted
      const { count: finalCount } = await supabase
        .from('trades')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      console.log(`📊 Verification: Database now contains ${finalCount} trades (expected: ${trades.length})`);

      if (finalCount !== trades.length) {
        console.warn(`⚠️ Trade count mismatch! Expected: ${trades.length}, Actual: ${finalCount}`);
        // Don't fail the operation, but log the discrepancy
      } else {
        console.log('✅ Trade count verification passed');
      }

      // Clear cache after successful save
      this.clearTradesCache(userId)

      return true
    } catch (error) {
      console.error('❌ Failed to perform actual save to Supabase:', error)
      return false
    }
  }

  static async deleteTrade(id: string): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      // Convert legacy ID to UUID for deletion
      const uuid = convertToUUID(id)

      const { error } = await supabase
        .from('trades')
        .delete()
        .eq('id', uuid)
        .eq('user_id', userId)

      if (error) throw error

      // Remove from mapping
      idMappings.delete(id)


      return true
    } catch (error) {
      console.error('❌ Failed to delete trade from Supabase:', error)
      return false
    }
  }

  // ===== USER PREFERENCES =====
  
  static async getUserPreferences(): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows returned

      return data || null
    } catch (error) {
      console.error('❌ Failed to get user preferences from Supabase:', error)
      return null
    }
  }

  static async saveUserPreferences(preferences: any): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          ...preferences,
          user_id: userId
        }, {
          onConflict: 'user_id'
        })

      if (error) throw error

      return true
    } catch (error) {
      console.error('❌ Failed to save user preferences to Supabase:', error)
      return false
    }
  }

  // ===== PORTFOLIO DATA =====
  
  static async getPortfolioData(): Promise<any[]> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('portfolio_data')
        .select('*')
        .eq('user_id', userId)

      if (error) throw error

      return data || []
    } catch (error) {
      console.error('❌ Failed to get portfolio data from Supabase:', error)
      return []
    }
  }

  static async savePortfolioData(data: any[]): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      // Delete existing portfolio data
      const { error: deleteError } = await supabase
        .from('portfolio_data')
        .delete()
        .eq('user_id', userId)

      if (deleteError) throw deleteError

      // Insert new portfolio data
      const dataWithUserId = data.map(item => ({ ...item, user_id: userId }))

      const { error: insertError } = await supabase
        .from('portfolio_data')
        .insert(dataWithUserId)

      if (insertError) throw insertError


      return true
    } catch (error) {
      console.error('❌ Failed to save portfolio data to Supabase:', error)
      return false
    }
  }

  // ===== TRADE SETTINGS =====

  static async getTradeSettings(): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) {
        // User not authenticated - return null silently for guest mode
        return null
      }

      const { data, error } = await supabase
        .from('trade_settings')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data || null
    } catch (error) {
      console.error('❌ Failed to get trade settings from Supabase:', error)
      return null
    }
  }

  static async saveTradeSettings(settings: any): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) {
        // User not authenticated - return false silently for guest mode
        return false
      }

      const { error } = await supabase
        .from('trade_settings')
        .upsert({
          ...settings,
          user_id: userId
        }, {
          onConflict: 'user_id'
        })

      if (error) throw error

      return true
    } catch (error) {
      console.error('❌ Failed to save trade settings to Supabase:', error)
      return false
    }
  }

  // ===== TAX DATA =====

  static async getTaxData(year: number): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('tax_data')
        .select('*')
        .eq('user_id', userId)
        .eq('year', year)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data || null
    } catch (error) {
      console.error('❌ Failed to get tax data from Supabase:', error)
      return null
    }
  }

  static async saveTaxData(year: number, data: any): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('tax_data')
        .upsert({
          user_id: userId,
          year,
          data
        }, {
          onConflict: 'user_id,year'
        })

      if (error) throw error


      return true
    } catch (error) {
      console.error('❌ Failed to save tax data to Supabase:', error)
      return false
    }
  }

  // ===== MILESTONES DATA =====

  static async getMilestonesData(): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) {
        // User not authenticated - return null silently for guest mode
        return null
      }

      const { data, error } = await supabase
        .from('milestones_data')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data || null
    } catch (error) {
      console.error('❌ Failed to get milestones data from Supabase:', error)
      return null
    }
  }

  static async saveMilestonesData(achievements: any[]): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) {
        // User not authenticated - return false silently for guest mode
        return false
      }

      const { error } = await supabase
        .from('milestones_data')
        .upsert({
          user_id: userId,
          achievements
        }, {
          onConflict: 'user_id'
        })

      if (error) throw error

      console.log('✅ Saved milestones data to Supabase')
      return true
    } catch (error) {
      console.error('❌ Failed to save milestones data to Supabase:', error)
      return false
    }
  }

  // ===== MISC DATA =====

  static async getMiscData(key: string): Promise<any> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) {
        // User not authenticated - return null silently for guest mode
        return null
      }

      console.log('🔍 Getting misc data for key:', key, 'user:', userId)

      const { data, error } = await supabase
        .from('misc_data')
        .select('value')
        .eq('user_id', userId)
        .eq('key', key)
        .maybeSingle() // Use maybeSingle instead of single to avoid errors when no data exists

      if (error) {
        console.error('❌ Error getting misc data:', error)
        throw error
      }

      console.log('✅ Got misc data:', data?.value || 'null')
      return data?.value || null
    } catch (error) {
      console.error('❌ Failed to get misc data from Supabase:', error)
      return null
    }
  }

  static async saveMiscData(key: string, value: any): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) {
        // User not authenticated - return false silently for guest mode
        return false
      }

      const { error } = await supabase
        .from('misc_data')
        .upsert({
          user_id: userId,
          key,
          value
        }, {
          onConflict: 'user_id,key'
        })

      if (error) throw error

      return true
    } catch (error) {
      console.error('❌ Failed to save misc data to Supabase:', error)
      return false
    }
  }

  static async deleteMiscData(key: string): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) {
        // User not authenticated - return false silently for guest mode
        return false
      }

      const { error } = await supabase
        .from('misc_data')
        .delete()
        .eq('user_id', userId)
        .eq('key', key)

      if (error) throw error

      return true
    } catch (error) {
      console.error('❌ Failed to delete misc data from Supabase:', error)
      return false
    }
  }

  // ===== CHART IMAGE BLOBS =====

  static async saveChartImageBlob(imageBlob: any): Promise<boolean> {


    try {
      const userId = await AuthService.getUserId()
      if (!userId) {

        throw new Error('User not authenticated')
      }



      // Convert base64 to binary for bytea storage
      let binaryData: Uint8Array;
      try {
        binaryData = Uint8Array.from(atob(imageBlob.data), c => c.charCodeAt(0))
      } catch (conversionError) {
        throw new Error('Failed to convert base64 data')
      }

      const insertData = {
        id: imageBlob.id,
        user_id: userId,
        trade_id: imageBlob.trade_id,
        image_type: imageBlob.image_type,
        filename: imageBlob.filename,
        mime_type: imageBlob.mime_type,
        size_bytes: imageBlob.size_bytes,
        data: binaryData,
        uploaded_at: imageBlob.uploaded_at,
        compressed: imageBlob.compressed || false,
        original_size: imageBlob.original_size
      };



      const { data: insertResult, error } = await supabase
        .from('chart_image_blobs')
        .insert(insertData)
        .select()

      if (error) {

        throw error
      }


      return true
    } catch (error) {
      console.error('❌ Failed to save chart image blob to Supabase:', error)
      return false
    }
  }

  static async getChartImageBlob(blobId: string): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')



      // First, get metadata without the binary data to avoid 406 errors
      const { data: metadata, error: metadataError } = await supabase
        .from('chart_image_blobs')
        .select('id, user_id, trade_id, image_type, filename, mime_type, size_bytes, uploaded_at, compressed, original_size, created_at, updated_at')
        .eq('user_id', userId)
        .eq('id', blobId)
        .single()

      if (metadataError) {
        if (metadataError.code === 'PGRST116') {
          // No rows returned
          return null
        }
        throw metadataError
      }



      // Now get the binary data separately
      const { data: binaryData, error: binaryError } = await supabase
        .from('chart_image_blobs')
        .select('data')
        .eq('user_id', userId)
        .eq('id', blobId)
        .single()

      if (binaryError) {

        throw binaryError
      }



      // Combine metadata and binary data
      const result = {
        ...metadata,
        data: binaryData.data
      }


      return result
    } catch (error) {
      console.error('❌ Failed to get chart image blob:', error)
      return null
    }
  }

  static async getAllChartImageBlobs(): Promise<any[]> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')



      // Get metadata only (without binary data) for listing
      // Binary data will be fetched individually when needed
      const { data, error } = await supabase
        .from('chart_image_blobs')
        .select('id, user_id, trade_id, image_type, filename, mime_type, size_bytes, uploaded_at, compressed, original_size, created_at, updated_at')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false })

      if (error) throw error


      return data || []
    } catch (error) {
      console.error('❌ Failed to get all chart image blobs:', error)
      return []
    }
  }

  static async deleteChartImageBlob(blobId: string): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')



      const { error } = await supabase
        .from('chart_image_blobs')
        .delete()
        .eq('user_id', userId)
        .eq('id', blobId)

      if (error) throw error


      return true
    } catch (error) {
      console.error('❌ Failed to delete chart image blob:', error)
      return false
    }
  }

  static async getTradeChartImageBlobs(tradeId: string): Promise<any[]> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      // NEW: Check if tradeId is a valid UUID format
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tradeId);

      if (!isUUID) {
        console.log(`📦 [SUPABASE] Trade ID is not UUID format, skipping chart blob query: ${tradeId}`);
        return [];
      }

      const { data, error } = await supabase
        .from('chart_image_blobs')
        .select('*')
        .eq('trade_id', tradeId)
        .eq('user_id', userId)

      if (error) throw error

      return data || []
    } catch (error) {
      console.error('❌ Failed to get trade chart image blobs:', error)
      return []
    }
  }



  static async deleteTradeChartImageBlobs(tradeId: string): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      // NEW: Check if tradeId is a valid UUID format
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tradeId);

      if (!isUUID) {
        console.log(`📦 [SUPABASE] Trade ID is not UUID format, skipping chart blob deletion: ${tradeId}`);
        return true; // Return true since there's nothing to delete for non-UUID trades
      }

      const { error } = await supabase
        .from('chart_image_blobs')
        .delete()
        .eq('trade_id', tradeId)
        .eq('user_id', userId)

      if (error) throw error

      return true
    } catch (error) {
      console.error('❌ Failed to delete trade chart image blobs:', error)
      return false
    }
  }

  static async updateChartImageBlobTradeId(blobId: string, newTradeId: string): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('chart_image_blobs')
        .update({ trade_id: newTradeId })
        .eq('id', blobId)
        .eq('user_id', userId)

      if (error) throw error


      return true
    } catch (error) {
      console.error('❌ Failed to update chart image blob trade ID:', error)
      return false
    }
  }

  // ===== DASHBOARD CONFIG =====

  static async getDashboardConfig(): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('dashboard_config')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data || null
    } catch (error) {
      console.error('❌ Failed to get dashboard config from Supabase:', error)
      return null
    }
  }

  static async saveDashboardConfig(config: any): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('dashboard_config')
        .upsert({
          user_id: userId,
          config
        }, {
          onConflict: 'user_id'
        })

      if (error) throw error

      console.log('✅ Saved dashboard config to Supabase')
      return true
    } catch (error) {
      console.error('❌ Failed to save dashboard config to Supabase:', error)
      return false
    }
  }

  // ===== COMMENTARY DATA =====

  static async getCommentaryData(year: string): Promise<any | null> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('commentary_data')
        .select('*')
        .eq('user_id', userId)
        .eq('year', year)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return data || null
    } catch (error) {
      console.error('❌ Failed to get commentary data from Supabase:', error)
      return null
    }
  }

  static async saveCommentaryData(year: string, data: any): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      const { error } = await supabase
        .from('commentary_data')
        .upsert({
          user_id: userId,
          year,
          data
        }, {
          onConflict: 'user_id,year'
        })

      if (error) throw error


      return true
    } catch (error) {
      console.error('❌ Failed to save commentary data to Supabase:', error)
      return false
    }
  }

  // ===== UTILITIES =====

  static async clearAllData(): Promise<boolean> {
    try {
      const userId = await AuthService.getUserId()
      if (!userId) throw new Error('User not authenticated')

      // Delete all user data from all tables
      const tables = [
        'trades',
        'chart_image_blobs',
        'user_preferences',
        'portfolio_data',
        'tax_data',
        'milestones_data',
        'misc_data',
        'trade_settings',
        'dashboard_config',
        'commentary_data'
      ]

      for (const table of tables) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq('user_id', userId)

        if (error) throw error
      }

      console.log('✅ Cleared all user data from Supabase')
      return true
    } catch (error) {
      console.error('❌ Failed to clear all data from Supabase:', error)
      return false
    }
  }
}
