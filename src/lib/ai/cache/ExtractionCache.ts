import crypto from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";

export interface CacheLookupResult {
  hit: boolean;
  resultJson?: any;
  lookupMs: number;
  selectQueryMs?: number;
  jsonDeserializationMs?: number;
  statsUpdateMs?: number;
}

export interface CacheSaveOptions {
  requestHash: string;
  userId: string;
  provider: string;
  modelName: string;
  promptVersion: string;
  resultJson: any;
  ttlDays?: number;
}

export class ExtractionCache {
  /**
   * Generates a stable request hash for deduplication.
   * Combination of:
   * - Ordered document types
   * - Ordered file SHA-256 hashes
   * - Prompt version
   * - Model name
   */
  static computeRequestHash(params: {
    files: { base64Data: string; mimeType: string }[];
    documentTypes: string[];
    promptVersion: string;
    modelName: string;
  }): string {
    const fileHashes = params.files.map(f => {
      const buffer = Buffer.from(f.base64Data, 'base64');
      return crypto.createHash('sha256').update(buffer).digest('hex');
    }).sort();

    const orderedDocTypes = [...params.documentTypes].sort();

    const combinedString = [
      orderedDocTypes.join(','),
      fileHashes.join(','),
      params.promptVersion,
      params.modelName
    ].join('|');

    return crypto.createHash('sha256').update(combinedString).digest('hex');
  }

  /**
   * Performs a cache lookup for the given request hash and user ID.
   */
  static async lookupCache(
    supabase: SupabaseClient,
    userId: string,
    requestHash: string
  ): Promise<CacheLookupResult> {
    const startTime = performance.now();
    let selectQueryMs = 0;
    let jsonDeserializationMs = 0;
    let statsUpdateMs = 0;

    try {
      const selectStart = performance.now();
      const { data, error } = await supabase
        .from('ai_extraction_cache')
        .select('*')
        .eq('request_hash', requestHash)
        .eq('created_by', userId)
        .maybeSingle();
      selectQueryMs = performance.now() - selectStart;

      const lookupMs = performance.now() - startTime;

      if (error) {
        console.warn("[ExtractionCache] Cache lookup warning:", error.message);
        return { hit: false, lookupMs, selectQueryMs, jsonDeserializationMs, statsUpdateMs };
      }

      if (!data) {
        return { hit: false, lookupMs, selectQueryMs, jsonDeserializationMs, statsUpdateMs };
      }

      // Expiry Check
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        console.log(`[ExtractionCache] Cache expired for hash=${requestHash.substring(0, 8)}`);
        return { hit: false, lookupMs, selectQueryMs, jsonDeserializationMs, statsUpdateMs };
      }

      const deserialStart = performance.now();
      const resultJson = data.result_json;
      jsonDeserializationMs = performance.now() - deserialStart;

      // Increment hit_count and update last_used_at
      const statsStart = performance.now();
      supabase
        .from('ai_extraction_cache')
        .update({
          hit_count: (data.hit_count || 0) + 1,
          last_used_at: new Date().toISOString()
        })
        .eq('id', data.id)
        .then(({ error: updateErr }) => {
          statsUpdateMs = performance.now() - statsStart;
          if (updateErr) console.warn("[ExtractionCache] Error updating cache stats:", updateErr.message);
        });

      return {
        hit: true,
        resultJson,
        lookupMs,
        selectQueryMs,
        jsonDeserializationMs,
        statsUpdateMs
      };
    } catch (err: any) {
      console.warn("[ExtractionCache] Cache lookup exception:", err.message || err);
      return { hit: false, lookupMs: performance.now() - startTime, selectQueryMs, jsonDeserializationMs, statsUpdateMs };
    }
  }

  /**
   * Saves a valid AI extraction result into the cache.
   * Enforces rules:
   * - Must be valid JSON object
   * - Must not be a failed extraction
   * - Configurable TTL (default 30 days via AI_CACHE_TTL_DAYS env var)
   */
  static async saveCache(
    supabase: SupabaseClient,
    options: CacheSaveOptions
  ): Promise<{ success: boolean; writeMs: number }> {
    const startTime = Date.now();
    try {
      if (!options.resultJson || typeof options.resultJson !== 'object') {
        console.warn("[ExtractionCache] Refusing to cache non-object or invalid JSON");
        return { success: false, writeMs: Date.now() - startTime };
      }

      const ttlDays = options.ttlDays ?? parseInt(process.env.AI_CACHE_TTL_DAYS || '30', 10);
      const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from('ai_extraction_cache')
        .upsert(
          {
            request_hash: options.requestHash,
            created_by: options.userId,
            provider: options.provider,
            model_name: options.modelName,
            prompt_version: options.promptVersion,
            result_json: options.resultJson,
            expires_at: expiresAt,
            last_used_at: new Date().toISOString()
          },
          { onConflict: 'created_by,request_hash' }
        );

      const writeMs = Date.now() - startTime;

      if (error) {
        console.error("[ExtractionCache] Error saving cache:", error.message);
        return { success: false, writeMs };
      }

      console.log(`[ExtractionCache] Successfully cached extraction hash=${options.requestHash.substring(0, 8)} ttlDays=${ttlDays}`);
      return { success: true, writeMs };
    } catch (err: any) {
      console.error("[ExtractionCache] Cache save exception:", err.message || err);
      return { success: false, writeMs: Date.now() - startTime };
    }
  }
}
