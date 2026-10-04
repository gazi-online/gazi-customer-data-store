"use client";

import React, { useState, useTransition } from "react";
import {
  Key,
  Plus,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  Ban,
  Laptop,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createExtensionPairingTokenAction,
  listExtensionPairingTokensAction,
  revokeExtensionPairingTokenAction,
} from "@/app/(dashboard)/settings/extension-token-actions";

export function ExtensionIntegrationsTab() {
  const queryClient = useQueryClient();
  const [isCreating, startCreateTransition] = useTransition();
  const [isRevoking, startRevokeTransition] = useTransition();

  // Creation form state
  const [deviceName, setDeviceName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(30);

  // One-time plaintext token display state (memory only, never saved to storage)
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    data: tokens = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["settings", "extension-tokens"],
    queryFn: async () => {
      const res = await listExtensionPairingTokensAction();
      if (!res.success) {
        throw new Error(res.error || "Failed to load tokens");
      }
      return res.tokens || [];
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const handleCreateToken = (e: React.FormEvent) => {
    e.preventDefault();

    startCreateTransition(async () => {
      const res = await createExtensionPairingTokenAction({
        name: deviceName.trim() || undefined,
        expiresInDays,
      });

      if (res.success && res.plaintextToken) {
        setNewlyCreatedToken(res.plaintextToken);
        setDeviceName("");
        toast.success("Pairing token generated successfully!");
        await queryClient.invalidateQueries({ queryKey: ["settings", "extension-tokens"] });
      } else {
        toast.error(res.error || "Failed to generate pairing token.");
      }
    });
  };

  const handleRevokeToken = (tokenId: string, name: string | null) => {
    if (!confirm(`Are you sure you want to revoke pairing for "${name || "this device"}"? The extension will immediately lose access.`)) {
      return;
    }

    startRevokeTransition(async () => {
      const res = await revokeExtensionPairingTokenAction(tokenId);
      if (res.success) {
        toast.success("Pairing token revoked.");
        await queryClient.invalidateQueries({ queryKey: ["settings", "extension-tokens"] });
      } else {
        toast.error(res.error || "Failed to revoke token.");
      }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Token copied to clipboard!");
    setTimeout(() => setCopied(false), 3000);
  };

  const dismissNewToken = () => {
    setNewlyCreatedToken(null);
    setCopied(false);
  };

  return (
    <div className="space-y-6">
      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-violet-50 text-violet-700 shrink-0">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Gazi Smart Form Filler — Browser Extension Integration
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Securely link your Chromium extension with GCDS. The extension accesses only
                minimal customer voter details required for electoral form filling (Form 6 / Form 8).
                Aadhaar, PAN, GST, documents, and financial data are strictly blocked.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── ONE-TIME PLAINTEXT TOKEN DISPLAY MODAL / BANNER ──────────────── */}
      {newlyCreatedToken && (
        <div className="bg-amber-50/80 border-2 border-amber-300 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-200 text-amber-900 shrink-0 mt-0.5">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-amber-900">
                Pairing Token Generated — Copy Immediately
              </h3>
              <p className="text-xs text-amber-800 leading-relaxed">
                For security reasons, this plaintext token will <strong>NEVER</strong> be displayed again.
                GCDS only stores a SHA-256 cryptographic hash. Copy and paste it directly into your
                Gazi Smart Form Filler extension popup along with your GCDS Server URL:{" "}
                <code className="px-1.5 py-0.5 bg-amber-200/80 text-amber-900 rounded font-mono text-[11px] font-semibold">
                  {typeof window !== "undefined" ? window.location.origin : "https://gdsa.vercel.app"}
                </code>
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              readOnly
              value={newlyCreatedToken}
              className="font-mono text-xs sm:text-sm bg-white border border-amber-300 text-slate-900 rounded-xl px-3.5 py-2.5 flex-1 select-all shadow-inner focus:outline-none"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(newlyCreatedToken)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy Token"}
            </button>
            <button
              type="button"
              onClick={dismissNewToken}
              className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0"
            >
              I Have Saved / Pasted It
            </button>
          </div>
        </div>
      )}

      {/* ── CREATE PAIRING TOKEN CARD ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
          <Plus className="h-4 w-4 text-violet-600" />
          Pair New Device or Workstation
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Each workstation running the extension should have its own named pairing token.
        </p>

        <form onSubmit={handleCreateToken} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label htmlFor="device_name" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Workstation / Device Label <span className="font-normal text-slate-400">(Optional)</span>
            </label>
            <input
              id="device_name"
              type="text"
              placeholder="e.g. Front Desk PC 1 (Optional)"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
            />
          </div>

          <div>
            <label htmlFor="token_expiry" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Token Validity Period
            </label>
            <select
              id="token_expiry"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
            >
              <option value={7}>7 Days (Temporary)</option>
              <option value={30}>30 Days (Standard)</option>
              <option value={90}>90 Days (Extended)</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              disabled={isCreating}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors min-h-[38px]"
            >
              <Key className="h-3.5 w-3.5" />
              {isCreating ? "Generating..." : "Generate Pairing Token"}
            </button>
          </div>
        </form>

        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-600">Granted Scopes:</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
            customers:search
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-mono">
            customers:form_fill
          </span>
        </div>
      </div>

      {/* ── TOKEN LIST ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Laptop className="h-4 w-4 text-slate-600" />
            Paired Extension Devices ({tokens.length})
          </h3>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading paired devices...</div>
        ) : tokens.length === 0 ? (
          <div className="py-10 text-center space-y-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <Key className="h-6 w-6 text-slate-400 mx-auto" />
            <p className="text-xs font-semibold text-slate-700">No paired extension devices found.</p>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              Generate a pairing token above to allow the Gazi Smart Form Filler extension to connect.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-medium">
                  <th className="pb-3 font-semibold">Device / Workstation</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Created</th>
                  <th className="pb-3 font-semibold">Expires</th>
                  <th className="pb-3 font-semibold">Last Used</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tokens.map((token) => (
                  <tr key={token.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <Laptop className="h-3.5 w-3.5 text-slate-400" />
                        <span>{token.name || "Unnamed Device"}</span>
                      </div>
                    </td>

                    <td className="py-3">
                      {token.status === "active" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                          Active
                        </span>
                      ) : token.status === "revoked" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
                          Revoked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                          Expired
                        </span>
                      )}
                    </td>

                    <td className="py-3 text-slate-500">
                      {new Date(token.created_at).toLocaleDateString()}
                    </td>

                    <td className="py-3 text-slate-500">
                      {new Date(token.expires_at).toLocaleDateString()}
                    </td>

                    <td className="py-3 text-slate-500 font-mono text-[11px]">
                      {token.last_used_at ? (
                        new Date(token.last_used_at).toLocaleString()
                      ) : (
                        <span className="text-slate-400 italic">Never</span>
                      )}
                    </td>

                    <td className="py-3 text-right">
                      {token.status === "active" && (
                        <button
                          type="button"
                          disabled={isRevoking}
                          onClick={() => handleRevokeToken(token.id, token.name)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          <Ban className="h-3 w-3" />
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
