import { ChartImage, TradeChartAttachments } from '../types/trade';
import { ChartImageBlob } from '../db/database';
import { DatabaseService } from '../db/database';
import { SupabaseService } from './supabaseService';
import { AuthService } from './authService';
import { createChartImage, CHART_IMAGE_CONFIG, getImageDataUrl } from '../utils/chartImageUtils';
import { generateId } from '../utils/helpers';
import { v4 as uuidv4 } from 'uuid';

export class ChartImageService {

  /**
   * Helper function to ensure blob ID is a valid UUID for Supabase
   */
  private static ensureValidBlobId(blobId: string): string {
    // Check if it's already a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(blobId)) {
      return blobId;
    }

    // If not a UUID, generate a new one
    console.log(`🔄 Converting non-UUID blob ID to UUID: ${blobId} -> generating new UUID`);
    return uuidv4();
  }

  /**
   * Test blob functionality - for debugging
   */
  static async testBlobFunctionality(file: File): Promise<void> {
    console.log('🧪 Testing blob functionality...');

    // Test 1: Create blob from file
    const testBlob = new Blob([file], { type: file.type });
    console.log(`✅ Test 1 - Blob created: size=${testBlob.size}, type=${testBlob.type}`);

    // Test 2: Create object URL
    const objectUrl = URL.createObjectURL(testBlob);
    console.log(`✅ Test 2 - Object URL created: ${objectUrl}`);

    // Test 3: Test if URL works
    const testImg = new Image();
    testImg.onload = () => {
      console.log(`✅ Test 3 - Image loads successfully from blob URL`);
      URL.revokeObjectURL(objectUrl);
    };
    testImg.onerror = (error) => {
      console.error(`❌ Test 3 - Image failed to load from blob URL:`, error);
      URL.revokeObjectURL(objectUrl);
    };
    testImg.src = objectUrl;
  }

  /**
   * Debug method to check IndexedDB contents
   */
  static async debugIndexedDBContents(): Promise<void> {
    try {
      console.log('🔍 Debugging IndexedDB contents...');

      // Get all chart image blobs
      const allBlobs = await DatabaseService.getAllChartImageBlobs();
      console.log(`📦 Found ${allBlobs.length} chart image blobs in IndexedDB`);

      for (const blob of allBlobs) {
        console.log(`🔍 Blob: ${blob.filename}`);
        console.log(`  - ID: ${blob.id}`);
        console.log(`  - Trade ID: ${blob.tradeId}`);
        console.log(`  - Type: ${blob.imageType}`);
        console.log(`  - Size: ${blob.size} bytes`);
        console.log(`  - MIME: ${blob.mimeType}`);
        console.log(`  - Data type: ${blob.data?.constructor.name}`);
        console.log(`  - Data size: ${blob.data?.size} bytes`);
        console.log(`  - Compressed: ${blob.compressed}`);

        // Try to create object URL
        if (blob.data && blob.data instanceof Blob) {
          try {
            const url = URL.createObjectURL(blob.data);
            console.log(`  - Object URL: ${url.substring(0, 50)}...`);
            URL.revokeObjectURL(url);
          } catch (error) {
            console.error(`  - Failed to create object URL:`, error);
          }
        } else {
          console.error(`  - Invalid blob data!`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to debug IndexedDB contents:', error);
    }
  }

  /**
   * Attach a chart image to a trade
   * NEW: Supports temporary storage for trades that don't exist yet
   */
  static async attachChartImage(
    tradeId: string,
    imageType: 'beforeEntry' | 'afterExit',
    file: File,
    shouldCompress: boolean = true,
    allowTemporary: boolean = true
  ): Promise<{ success: boolean; chartImage?: ChartImage; error?: string; isTemporary?: boolean }> {
    try {
      console.log(`📸 [${imageType.toUpperCase()}] Attaching chart image to trade ${tradeId}: ${file.name} (${file.size} bytes)`);

      // Create chart image record (this handles compression)
      const { chartImage, processedFile } = await createChartImage(file, shouldCompress);

      // CRITICAL FIX: Convert processed file to base64 for storage
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            // Remove data URL prefix to get just the base64 data
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          } else {
            reject(new Error('Failed to convert file to base64'));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(processedFile);
      });

      // NEW: Check if this is a temporary upload (trade doesn't exist yet)
      const isTemporaryUpload = tradeId === 'new' || tradeId.startsWith('temp_');

      console.log(`🔍 [${imageType.toUpperCase()}] Upload parameters:`, {
        tradeId,
        allowTemporary,
        isTemporaryUpload,
        shouldCreateTemporary: isTemporaryUpload && allowTemporary
      });

      if (isTemporaryUpload && allowTemporary) {
        console.log(`📦 [${imageType.toUpperCase()}] Creating temporary chart image for new trade`);
        // For temporary uploads, just return the chart image without saving to Supabase
        // It will be saved later when the trade is actually created
        return { success: true, chartImage, isTemporary: true };
      }

      // PURE SUPABASE: Always save to Supabase for existing trades

      // Check if user is authenticated for Supabase storage
      const isAuthenticated = await AuthService.isAuthenticated();
      if (!isAuthenticated) {
        return { success: false, error: 'User must be authenticated to upload chart images' };
      }

      // CRITICAL: Ensure the trade exists in Supabase before saving chart image
      // This is required due to foreign key constraint
      const trade = await SupabaseService.getTrade(tradeId);
      if (!trade) {
        if (allowTemporary) {
          console.log(`📦 [${imageType.toUpperCase()}] Trade not found in cloud storage, creating temporary chart image`);

          // CRITICAL: For temporary charts, we need to ensure they have a dataUrl for immediate preview
          const tempChartImage = {
            ...chartImage,
            dataUrl: `data:${chartImage.mimeType};base64,${base64Data}`,
            isTemporary: true
          };

          console.log(`📷 [${imageType.toUpperCase()}] Temporary chart created with dataUrl for preview: ${chartImage.filename}`);
          return { success: true, chartImage: tempChartImage, isTemporary: true };
        }
        return { success: false, error: 'Trade not found in cloud storage' };
      }

      // NEW: Additional check - verify trade actually exists in Supabase trades table
      // We need to check with the converted UUID to ensure foreign key constraint will work

      // First, convert the trade ID to UUID format (same logic as SupabaseService)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tradeId);
      let convertedTradeId: string;

      if (isUUID) {
        convertedTradeId = tradeId;
      } else {
        // Use the EXACT same conversion logic as SupabaseService
        const hash = tradeId.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0);
        const hex = Math.abs(hash).toString(16).padStart(8, '0');
        convertedTradeId = `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(0, 3)}-${hex.slice(0, 12).padEnd(12, '0')}`;
      }

      console.log(`🔍 [${imageType.toUpperCase()}] Converted trade ID: ${tradeId} → ${convertedTradeId}`);

      // Now verify the trade exists in Supabase with this exact UUID
      console.log(`🔍 [${imageType.toUpperCase()}] Verifying trade exists in Supabase with UUID: ${convertedTradeId}`);
      const supabaseTrade = await SupabaseService.getTradeFromSupabaseOnly(convertedTradeId);
      if (!supabaseTrade) {
        if (allowTemporary) {
          console.log(`📦 [${imageType.toUpperCase()}] Trade not found in Supabase trades table, creating temporary chart image`);

          // CRITICAL: For temporary charts, we need to ensure they have a dataUrl for immediate preview
          const tempChartImage = {
            ...chartImage,
            dataUrl: `data:${chartImage.mimeType};base64,${base64Data}`,
            isTemporary: true
          };

          console.log(`📷 [${imageType.toUpperCase()}] Temporary chart created with dataUrl for preview: ${chartImage.filename}`);
          return { success: true, chartImage: tempChartImage, isTemporary: true };
        }
        return { success: false, error: 'Trade not found in Supabase trades table' };
      }
      console.log(`✅ [${imageType.toUpperCase()}] Trade verified in Supabase:`, supabaseTrade.name || supabaseTrade.id);

      // Save the trade to Supabase to satisfy foreign key constraint
      try {
        const tradeSaved = await SupabaseService.saveTrade(trade);
        if (!tradeSaved) {
          return { success: false, error: 'Failed to save trade to cloud storage' };
        }
      } catch (tradeError) {
        return { success: false, error: 'Failed to save trade to cloud storage' };
      }

      // We already have base64Data from above, no need to convert again
      // convertedTradeId is already calculated above

      const supabaseImageBlob = {
        id: chartImage.blobId, // This is already a UUID from uuidv4()
        trade_id: convertedTradeId, // Use the verified converted UUID
        image_type: imageType,
        filename: chartImage.filename,
        mime_type: chartImage.mimeType,
        size_bytes: chartImage.size,
        data: base64Data, // Use the actual file data we just converted
        uploaded_at: chartImage.uploadedAt.toISOString(),
        compressed: chartImage.compressed || false,
        original_size: chartImage.originalSize
      };

      console.log(`🔍 [${imageType.toUpperCase()}] Supabase blob data:`, {
        id: supabaseImageBlob.id,
        trade_id: supabaseImageBlob.trade_id,
        image_type: supabaseImageBlob.image_type,
        filename: supabaseImageBlob.filename,
        size_bytes: supabaseImageBlob.size_bytes,
        dataLength: base64Data.length
      });



      const supabaseSaved = await SupabaseService.saveChartImageBlob(supabaseImageBlob);
      if (!supabaseSaved) {
        return { success: false, error: 'Failed to save image to cloud storage' };
      }


      // No additional processing needed - everything is handled above
      
      console.log(`✅ [${imageType.toUpperCase()}] Chart image attached successfully: ${chartImage.storage} storage, ${chartImage.size} bytes`);

      // Test retrieval immediately after saving
      console.log(`🧪 [${imageType.toUpperCase()}] Testing immediate retrieval...`);
      console.log(`🔍 [${imageType.toUpperCase()}] Chart image blob ID for retrieval: ${chartImage.blobId}`);
      console.log(`🔍 [${imageType.toUpperCase()}] Chart image storage type: ${chartImage.storage}`);

      // Wait a moment for Supabase to process
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Test direct Supabase retrieval
      console.log(`🧪 [${imageType.toUpperCase()}] Testing direct Supabase retrieval...`);
      const directBlob = await SupabaseService.getChartImageBlob(chartImage.blobId);
      if (directBlob) {
        console.log(`✅ [${imageType.toUpperCase()}] Direct Supabase retrieval successful: ${directBlob.filename}`);
      } else {
        console.error(`❌ [${imageType.toUpperCase()}] Direct Supabase retrieval failed!`);
      }

      // Test through service
      const testDataUrl = await ChartImageService.getChartImageDataUrl(chartImage);
      if (testDataUrl) {
        console.log(`✅ [${imageType.toUpperCase()}] Service retrieval successful: ${testDataUrl.substring(0, 50)}...`);
      } else {
        console.error(`❌ [${imageType.toUpperCase()}] Service retrieval failed!`);
        console.error(`❌ [${imageType.toUpperCase()}] Blob ID mismatch? Saved: ${supabaseImageBlob.id}, Retrieving: ${chartImage.blobId}`);
      }

      // Check if any cleanup processes are running
      console.log(`🔍 [${imageType.toUpperCase()}] Checking for cleanup processes...`);
      setTimeout(async () => {
        const stillExists = await SupabaseService.getChartImageBlob(chartImage.blobId);
        if (stillExists) {
          console.log(`✅ [${imageType.toUpperCase()}] Image still exists after 5 seconds: ${stillExists.filename}`);
        } else {
          console.error(`❌ [${imageType.toUpperCase()}] Image was deleted within 5 seconds! Cleanup process detected.`);
        }
      }, 5000);

      return { success: true, chartImage, isTemporary: false };

    } catch (error) {
      console.error('❌ Failed to attach chart image:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Save temporary chart images to Supabase when trade is created
   * NEW: Helper method to persist temporary charts
   */
  static async saveTemporaryChartImages(
    tradeId: string,
    chartAttachments: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!chartAttachments) {
        return { success: true };
      }

      console.log(`💾 [TEMP_SAVE] Saving temporary chart images for trade ${tradeId}`);

      const isAuthenticated = await AuthService.isAuthenticated();
      if (!isAuthenticated) {
        return { success: false, error: 'User must be authenticated to save chart images' };
      }

      // Process beforeEntry image
      if (chartAttachments.beforeEntry) {
        const result = await this.saveTemporaryChartImage(tradeId, 'beforeEntry', chartAttachments.beforeEntry);
        if (!result.success) {
          return result;
        }
      }

      // Process afterExit image
      if (chartAttachments.afterExit) {
        const result = await this.saveTemporaryChartImage(tradeId, 'afterExit', chartAttachments.afterExit);
        if (!result.success) {
          return result;
        }
      }

      console.log(`✅ [TEMP_SAVE] All temporary chart images saved successfully for trade ${tradeId}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Failed to save temporary chart images:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Save a single temporary chart image to Supabase
   * PRIVATE: Helper method for saveTemporaryChartImages
   */
  private static async saveTemporaryChartImage(
    tradeId: string,
    imageType: 'beforeEntry' | 'afterExit',
    chartImage: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Skip if already saved to Supabase (not temporary)
      if (chartImage.storage === 'blob' && chartImage.blobId && !chartImage.isTemporary) {
        console.log(`⏭️ [TEMP_SAVE] Chart image already saved to Supabase: ${chartImage.filename}`);
        return { success: true };
      }

      console.log(`💾 [TEMP_SAVE] Saving ${imageType} chart image: ${chartImage.filename}`);

      // Convert inline data to base64 if needed
      let base64Data: string;
      if (chartImage.data) {
        // Remove data URL prefix if present
        base64Data = chartImage.data.replace(/^data:image\/[a-z]+;base64,/, '');
      } else {
        console.error(`❌ [TEMP_SAVE] No data found for chart image: ${chartImage.filename}`);
        return { success: false, error: 'No image data found' };
      }

      // Convert trade ID to UUID format for Supabase
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tradeId);
      let convertedTradeId: string;

      if (isUUID) {
        convertedTradeId = tradeId;
      } else {
        const hash = tradeId.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0);
        const hex = Math.abs(hash).toString(16).padStart(8, '0');
        convertedTradeId = `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(0, 3)}-${hex.slice(0, 12).padEnd(12, '0')}`;
      }

      // Create Supabase blob record
      const supabaseImageBlob = {
        id: chartImage.blobId || chartImage.id,
        trade_id: convertedTradeId,
        image_type: imageType,
        filename: chartImage.filename,
        mime_type: chartImage.mimeType,
        size_bytes: chartImage.size,
        data: base64Data,
        uploaded_at: chartImage.uploadedAt.toISOString(),
        compressed: chartImage.compressed || false,
        original_size: chartImage.originalSize
      };

      // Save to Supabase
      const supabaseSaved = await SupabaseService.saveChartImageBlob(supabaseImageBlob);
      if (!supabaseSaved) {
        return { success: false, error: 'Failed to save image to cloud storage' };
      }

      console.log(`✅ [TEMP_SAVE] Chart image saved to Supabase: ${chartImage.filename}`);
      return { success: true };

    } catch (error) {
      console.error(`❌ [TEMP_SAVE] Failed to save temporary chart image:`, error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
  
  /**
   * Get chart image data URL for display
   */
  static async getChartImageDataUrl(chartImage: ChartImage): Promise<string | null> {
    try {
      // PURE SUPABASE: Handle legacy inline storage but prefer Supabase
      if (chartImage.storage === 'inline' && chartImage.data) {
        return getImageDataUrl(chartImage);
      }

      // PURE SUPABASE: Always retrieve from Supabase
      if (chartImage.blobId) {
        const isAuthenticated = await AuthService.isAuthenticated();
        if (!isAuthenticated) {
          console.warn('🔐 User not authenticated, cannot load chart image from Supabase');
          return null;
        }

        try {
          const supabaseBlob = await SupabaseService.getChartImageBlob(chartImage.blobId);

          if (supabaseBlob) {

            // Convert Supabase binary data back to blob
            try {
              let bytes: Uint8Array;

              console.log(`🔍 [RETRIEVAL] Supabase data type:`, typeof supabaseBlob.data);
              console.log(`🔍 [RETRIEVAL] Supabase data constructor:`, supabaseBlob.data?.constructor?.name);
              console.log(`🔍 [RETRIEVAL] Is Array:`, Array.isArray(supabaseBlob.data));
              console.log(`🔍 [RETRIEVAL] Data length:`, supabaseBlob.data?.length);
              console.log(`🔍 [RETRIEVAL] First 10 bytes:`, Array.isArray(supabaseBlob.data) ? supabaseBlob.data.slice(0, 10) : 'N/A');

              if (typeof supabaseBlob.data === 'string') {
                console.log(`🔍 [RETRIEVAL] String data sample:`, supabaseBlob.data.substring(0, 100));
              }

              if (supabaseBlob.data instanceof Uint8Array) {
                // Already a Uint8Array - use directly
                console.log(`✅ [RETRIEVAL] Using Uint8Array directly`);
                bytes = supabaseBlob.data;
              } else if (Array.isArray(supabaseBlob.data)) {
                // Array of bytes from Supabase - convert to Uint8Array
                console.log(`✅ [RETRIEVAL] Converting array to Uint8Array`);
                bytes = new Uint8Array(supabaseBlob.data);
              } else if (typeof supabaseBlob.data === 'string') {
                // Supabase bytea can return as hex string (starting with \x) or base64
                console.log(`⚠️ [RETRIEVAL] String data detected, length: ${supabaseBlob.data.length}`);
                console.log(`🔍 [RETRIEVAL] First 50 chars: ${supabaseBlob.data.substring(0, 50)}`);

                if (supabaseBlob.data.startsWith('\\x')) {
                  // Hex string format from PostgreSQL bytea - but it might be hex-encoded JSON
                  console.log(`✅ [RETRIEVAL] Converting hex string to bytes`);
                  const hexString = supabaseBlob.data.substring(2); // Remove \x prefix

                  // First decode the hex to get the actual string
                  let decodedString = '';
                  for (let i = 0; i < hexString.length; i += 2) {
                    const hexByte = hexString.substr(i, 2);
                    decodedString += String.fromCharCode(parseInt(hexByte, 16));
                  }

                  // Now check if the decoded string is JSON
                  if (decodedString.startsWith('{') || decodedString.startsWith('[')) {
                    try {
                      const parsedData = JSON.parse(decodedString);
                      if (Array.isArray(parsedData) || (typeof parsedData === 'object' && parsedData !== null)) {
                        const arrayData = Array.isArray(parsedData) ? parsedData : Object.values(parsedData);
                        bytes = new Uint8Array(arrayData);
                      } else {
                        throw new Error('Parsed data is not an array or object');
                      }
                    } catch (jsonError) {
                      // Fallback: treat decoded string as raw binary
                      bytes = new Uint8Array(decodedString.length);
                      for (let i = 0; i < decodedString.length; i++) {
                        bytes[i] = decodedString.charCodeAt(i);
                      }
                    }
                  } else {
                    // Decoded hex is raw binary data
                    bytes = new Uint8Array(decodedString.length);
                    for (let i = 0; i < decodedString.length; i++) {
                      bytes[i] = decodedString.charCodeAt(i);
                    }
                  }
                } else {
                  // The data might be a JSON string representation of an array
                  try {
                    const parsedData = JSON.parse(supabaseBlob.data);
                    if (Array.isArray(parsedData) || (typeof parsedData === 'object' && parsedData !== null)) {
                      // Convert object with numeric keys to array
                      const arrayData = Array.isArray(parsedData) ? parsedData : Object.values(parsedData);
                      bytes = new Uint8Array(arrayData);
                    } else {
                      throw new Error('Parsed data is not an array or object');
                    }
                  } catch (jsonError) {
                    try {
                      const binaryString = atob(supabaseBlob.data);
                      bytes = new Uint8Array(binaryString.length);
                      for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                      }
                    } catch (base64Error) {
                      // Last resort: treat as raw string
                      bytes = new Uint8Array(supabaseBlob.data.length);
                      for (let i = 0; i < supabaseBlob.data.length; i++) {
                        bytes[i] = supabaseBlob.data.charCodeAt(i);
                      }
                    }
                  }
                }
              } else {
                throw new Error(`Unsupported data format from Supabase: ${typeof supabaseBlob.data}`);
              }

              const blobData = new Blob([bytes], { type: supabaseBlob.mime_type });

              // Validate blob data
              if (!blobData || blobData.size === 0) {
                return null;
              }

              // Convert Uint8Array to base64 string
              let base64String = '';
              const chunkSize = 8192; // Process in chunks to avoid call stack overflow
              for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.slice(i, i + chunkSize);
                base64String += String.fromCharCode.apply(null, Array.from(chunk));
              }
              const base64Data = btoa(base64String);

              const dataUrl = `data:${supabaseBlob.mime_type};base64,${base64Data}`;

              return dataUrl;
            } catch (decodeError) {
              return null;
            }
          } else {
            console.warn(`📷 Chart image blob not found in Supabase: ${chartImage.blobId}`);
            return null;
          }
        } catch (error) {
          console.error(`❌ Error loading chart image from Supabase:`, error);
          return null;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Delete a chart image
   */
  static async deleteChartImage(
    tradeId: string,
    imageType: 'beforeEntry' | 'afterExit',
    chartImage: ChartImage
  ): Promise<boolean> {
    try {
      // PURE SUPABASE: Delete from Supabase if user is authenticated
      if (chartImage.storage === 'blob' && chartImage.blobId) {
        const isAuthenticated = await AuthService.isAuthenticated();
        if (isAuthenticated) {
          await SupabaseService.deleteChartImageBlob(chartImage.blobId);
        }
      }

      return true;

    } catch (error) {
      return false;
    }
  }
  
  /**
   * Delete all chart images for a trade
   */
  static async deleteTradeChartImages(tradeId: string): Promise<boolean> {
    try {
      // Delete all blob storage for this trade
      await DatabaseService.deleteTradeChartImageBlobs(tradeId);

      return true;

    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get storage statistics for chart images
   */
  static async getStorageStats(): Promise<{
    totalImages: number;
    totalSize: number;
    inlineImages: number;
    inlineSize: number;
    blobImages: number;
    blobSize: number;
  }> {
    try {
      const allBlobs = await DatabaseService.getAllChartImageBlobs();
      const blobSize = allBlobs.reduce((total, blob) => total + blob.size, 0);
      
      // Note: We can't easily calculate inline image sizes without loading all trades
      // This would be a performance concern, so we'll estimate based on blob data
      
      return {
        totalImages: allBlobs.length,
        totalSize: blobSize,
        inlineImages: 0, // Would need to scan all trades to calculate
        inlineSize: 0,   // Would need to scan all trades to calculate
        blobImages: allBlobs.length,
        blobSize: blobSize,
      };
    } catch (error) {
      return {
        totalImages: 0,
        totalSize: 0,
        inlineImages: 0,
        inlineSize: 0,
        blobImages: 0,
        blobSize: 0,
      };
    }
  }
  
  /**
   * Cleanup orphaned chart image blobs (blobs without corresponding trades)
   * PURE SUPABASE: Updated to work with Supabase data
   */
  static async cleanupOrphanedBlobs(): Promise<{ cleaned: number; errors: number }> {
    try {
      // Check if user is authenticated for Supabase operations
      const isAuthenticated = await AuthService.isAuthenticated();
      if (!isAuthenticated) {
        return { cleaned: 0, errors: 0 };
      }

      // PURE SUPABASE: Get data from Supabase, not IndexedDB
      const [allBlobs, allTrades] = await Promise.all([
        SupabaseService.getAllChartImageBlobs(),
        SupabaseService.getAllTrades()
      ]);

      // Convert trade IDs to the same format used in chart images (UUID conversion)
      const tradeIds = new Set();

      for (const trade of allTrades) {
        // Add both original ID and converted UUID to handle both formats
        tradeIds.add(trade.id);

        // Also add the UUID conversion if it's different
        const convertedId = this.convertTradeIdToUUID(trade.id);
        if (convertedId !== trade.id) {
          tradeIds.add(convertedId);
        }
      }

      let cleaned = 0;
      let errors = 0;

      for (const blob of allBlobs) {
        if (!tradeIds.has(blob.trade_id)) {
          // TEMPORARILY DISABLE actual deletion for debugging
          // const deleted = await SupabaseService.deleteChartImageBlob(blob.id);
          // if (deleted) {
          //   cleaned++;
          // } else {
          //   errors++;
          // }
        }
      }

      return { cleaned, errors };

    } catch (error) {
      return { cleaned: 0, errors: 1 };
    }
  }

  /**
   * Helper method to convert trade ID to UUID (same logic as used in chart image service)
   */
  private static convertTradeIdToUUID(tradeId: string): string {
    // If it's already a UUID format, return as is
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tradeId)) {
      return tradeId;
    }

    // Create a deterministic UUID from the string ID
    const hash = tradeId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);

    // Convert hash to UUID format
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(0, 3)}-${hex.slice(0, 12).padEnd(12, '0')}`;
  }

  /**
   * Cleanup orphaned chart attachments in trade records (references without corresponding blobs)
   * PURE SUPABASE: Updated to work with Supabase data
   */
  static async cleanupOrphanedAttachments(): Promise<{ cleaned: number; errors: number }> {
    try {
      // Check if user is authenticated for Supabase operations
      const isAuthenticated = await AuthService.isAuthenticated();
      if (!isAuthenticated) {
        return { cleaned: 0, errors: 0 };
      }

      // PURE SUPABASE: Get data from Supabase, not IndexedDB
      const [allTrades, allBlobs] = await Promise.all([
        SupabaseService.getAllTrades(),
        SupabaseService.getAllChartImageBlobs()
      ]);

      const blobIds = new Set(allBlobs.map(blob => blob.id));

      let cleaned = 0;
      let errors = 0;

      for (const trade of allTrades) {
        if (!trade.chartAttachments) continue;

        let needsUpdate = false;
        const updatedAttachments = { ...trade.chartAttachments };

        // Check beforeEntry attachment
        if (updatedAttachments.beforeEntry) {
          const attachment = updatedAttachments.beforeEntry;
          if (attachment.storage === 'blob' && attachment.blobId && !blobIds.has(attachment.blobId)) {
            delete updatedAttachments.beforeEntry;
            needsUpdate = true;
          }
        }

        // Check afterExit attachment
        if (updatedAttachments.afterExit) {
          const attachment = updatedAttachments.afterExit;
          if (attachment.storage === 'blob' && attachment.blobId && !blobIds.has(attachment.blobId)) {
            delete updatedAttachments.afterExit;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          // Check if any attachments remain
          const hasRemainingAttachments = updatedAttachments.beforeEntry || updatedAttachments.afterExit;

          const updatedTrade = {
            ...trade,
            chartAttachments: hasRemainingAttachments ? {
              ...updatedAttachments,
              metadata: {
                ...updatedAttachments.metadata,
                updatedAt: new Date(),
                totalSize: (updatedAttachments.beforeEntry?.size || 0) + (updatedAttachments.afterExit?.size || 0)
              }
            } : undefined
          };

          // PURE SUPABASE: Save to Supabase, not IndexedDB
          const saved = await SupabaseService.saveTrade(updatedTrade);
          if (saved) {
            cleaned++;
          } else {
            errors++;
          }
        }
      }

      return { cleaned, errors };

    } catch (error) {
      return { cleaned: 0, errors: 1 };
    }
  }
  
  /**
   * Comprehensive cleanup of all orphaned chart data
   */
  static async cleanupAllOrphanedData(): Promise<{
    blobsCleaned: number;
    attachmentsCleaned: number;
    errors: number
  }> {
    try {
      // First cleanup orphaned blobs
      const blobCleanup = await this.cleanupOrphanedBlobs();

      // Then cleanup orphaned attachments in trade records
      const attachmentCleanup = await this.cleanupOrphanedAttachments();

      const totalErrors = blobCleanup.errors + attachmentCleanup.errors;

      return {
        blobsCleaned: blobCleanup.cleaned,
        attachmentsCleaned: attachmentCleanup.cleaned,
        errors: totalErrors
      };

    } catch (error) {
      return { blobsCleaned: 0, attachmentsCleaned: 0, errors: 1 };
    }
  }

  /**
   * Validate chart attachments data structure
   */
  static validateChartAttachments(chartAttachments: any): chartAttachments is TradeChartAttachments {
    if (!chartAttachments || typeof chartAttachments !== 'object') {
      return false;
    }

    // Check beforeEntry if present
    if (chartAttachments.beforeEntry && !this.validateChartImage(chartAttachments.beforeEntry)) {
      return false;
    }

    // Check afterExit if present
    if (chartAttachments.afterExit && !this.validateChartImage(chartAttachments.afterExit)) {
      return false;
    }

    return true;
  }
  
  /**
   * Validate chart image data structure
   */
  private static validateChartImage(chartImage: any): chartImage is ChartImage {
    return (
      chartImage &&
      typeof chartImage === 'object' &&
      typeof chartImage.id === 'string' &&
      typeof chartImage.filename === 'string' &&
      typeof chartImage.mimeType === 'string' &&
      typeof chartImage.size === 'number' &&
      chartImage.uploadedAt instanceof Date &&
      (chartImage.storage === 'inline' || chartImage.storage === 'blob') &&
      CHART_IMAGE_CONFIG.ALLOWED_TYPES.includes(chartImage.mimeType)
    );
  }
}
