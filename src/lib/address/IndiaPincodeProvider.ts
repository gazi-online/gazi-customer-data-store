/**
 * Third-party public India PIN / Post Office lookup provider.
 * Uses: postalpincode.in public API as a reference data source.
 * NOTE: This is NOT the official CEPT India Post API (which requires customer IP whitelisting).
 * Provider results are treated as REFERENCE DATA for user convenience & validation, not unchallengeable ground truth.
 */

import { IPincodeProvider, PincodeLookupResult, PincodeResponse, PostOfficeInfo } from './address-types';

interface CacheEntry {
  result: PincodeLookupResult;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class ThirdPartyPincodeProvider implements IPincodeProvider {
  async lookup(pincode: string): Promise<PincodeResponse> {
    const cleanPin = pincode.replace(/\D/g, '').trim();

    if (cleanPin.length !== 6) {
      return {
        success: false,
        error: "Pincode must be exactly 6 digits."
      };
    }

    const cached = cache.get(cleanPin);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return {
        success: true,
        data: cached.result
      };
    }

    try {
      const response = await fetch(`https://api.postalpincode.in/pincode/${cleanPin}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP Error ${response.status}: Failed to reach third-party pincode provider`
        };
      }

      const resArray = await response.json();
      if (!Array.isArray(resArray) || resArray.length === 0) {
        return {
          success: false,
          error: "Invalid response format from pincode provider."
        };
      }

      const firstRes = resArray[0];
      if (firstRes.Status !== 'Success' || !Array.isArray(firstRes.PostOffice) || firstRes.PostOffice.length === 0) {
        return {
          success: false,
          error: firstRes.Message || "Pincode reference data not found."
        };
      }

      const rawPOList = firstRes.PostOffice;
      const firstPO = rawPOList[0];
      const state = firstPO.State || "";
      const district = firstPO.District || "";

      const postOffices: PostOfficeInfo[] = rawPOList.map((po: any) => ({
        name: po.Name,
        branchType: po.BranchType,
        deliveryStatus: po.DeliveryStatus,
        block: po.Block !== "NA" ? po.Block : undefined,
        division: po.Division !== "NA" ? po.Division : undefined,
        region: po.Region !== "NA" ? po.Region : undefined,
        circle: po.Circle !== "NA" ? po.Circle : undefined,
        state: po.State,
        district: po.District
      }));

      const localitySet = new Set<string>();
      rawPOList.forEach((po: any) => {
        if (po.Block && po.Block !== "NA" && po.Block !== district) localitySet.add(po.Block);
        if (po.Division && po.Division !== "NA" && po.Division !== district) localitySet.add(po.Division);
        if (po.Name && po.Name !== district) localitySet.add(po.Name);
      });

      const result: PincodeLookupResult = {
        pincode: cleanPin,
        state,
        district,
        country: "India",
        postOffices,
        citiesOrLocalities: Array.from(localitySet),
        source: "postalpincode.in",
        sourceType: "third_party_reference"
      };

      cache.set(cleanPin, {
        result,
        timestamp: Date.now()
      });

      return {
        success: true,
        data: result
      };

    } catch (err: any) {
      return {
        success: false,
        error: err.message || "PIN code reference lookup unavailable. You can enter the address manually."
      };
    }
  }
}

// Default active provider instance (can be swapped in future for CEPT API or Local Dataset)
const activeProvider: IPincodeProvider = new ThirdPartyPincodeProvider();

export class IndiaPincodeProvider {
  static async lookup(pincode: string): Promise<PincodeResponse> {
    return activeProvider.lookup(pincode);
  }

  static clearCache() {
    cache.clear();
  }
}
