"use client"

import { useState, useEffect, useRef } from "react"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { PublicKey } from "@solana/web3.js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  Search,
  AlertTriangle,
  CheckCircle,
  Shield,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react"
import { analyzeWallet } from "@/lib/fraud-detection"
import type { WalletAnalysis } from "@/lib/fraud-detection"

const AUTO_REFRESH_INTERVAL = 15000 // 15 seconds

export function WalletAnalyzer() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [walletAddress, setWalletAddress] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false)
  const [currentAnalyzedAddress, setCurrentAnalyzedAddress] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [analysis, setAnalysis] = useState<WalletAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const [expandedSignatures, setExpandedSignatures] = useState<Set<number>>(new Set())

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // Set up auto-refresh if we have an analyzed address
    if (currentAnalyzedAddress && analysis) {
      intervalRef.current = setInterval(async () => {
        try {
          setIsAutoRefreshing(true)
          const pubKey = new PublicKey(currentAnalyzedAddress)
          const result = await analyzeWallet(connection, pubKey)
          setAnalysis(result)
          setLastUpdated(new Date())
        } catch (err) {
          console.error("[v0] Auto-refresh error:", err)
        } finally {
          setIsAutoRefreshing(false)
        }
      }, AUTO_REFRESH_INTERVAL)
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [currentAnalyzedAddress, analysis, connection])

  const handleAnalyze = async () => {
    setError(null)
    setAnalysis(null)
    setCurrentAnalyzedAddress(null)

    // Use manual input first, then fall back to connected wallet
    const addressToAnalyze = walletAddress.trim() || publicKey?.toBase58()

    if (!addressToAnalyze) {
      setError("Please connect a wallet or enter a wallet address")
      return
    }

    // Validate the address format
    try {
      new PublicKey(addressToAnalyze)
    } catch {
      setError("Invalid Solana wallet address format")
      return
    }

    try {
      setIsAnalyzing(true)
      const pubKey = new PublicKey(addressToAnalyze)
      const result = await analyzeWallet(connection, pubKey)
      setAnalysis(result)
      setCurrentAnalyzedAddress(addressToAnalyze)
      setLastUpdated(new Date())
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes("rejected")) {
          setError("Wallet connection was rejected. Please try again or enter an address manually.")
        } else if (err.message.includes("Invalid public key")) {
          setError("Invalid wallet address. Please check and try again.")
        } else {
          setError(err.message)
        }
      } else {
        setError("Failed to analyze wallet. Please try again.")
      }
    } finally {
      setIsAnalyzing(false)
    }
  }

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  const getRiskColor = (score: number) => {
    if (score >= 70) return "text-destructive"
    if (score >= 40) return "text-yellow-500"
    return "text-accent"
  }

  const getRiskBadge = (score: number) => {
    if (score >= 70)
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          High Risk
        </Badge>
      )
    if (score >= 40)
      return (
        <Badge variant="secondary" className="gap-1 bg-yellow-500/20 text-yellow-500">
          <AlertTriangle className="h-3 w-3" />
          Medium Risk
        </Badge>
      )
    return (
      <Badge variant="secondary" className="gap-1 bg-accent/20 text-accent">
        <CheckCircle className="h-3 w-3" />
        Low Risk
      </Badge>
    )
  }

  const toggleSignature = (index: number) => {
    setExpandedSignatures((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Wallet Analysis
          </CardTitle>
          <CardDescription>Connect your wallet or enter an address to analyze for fraudulent activity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <WalletMultiButton />
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or enter address manually</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Enter Solana wallet address..."
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleAnalyze} disabled={isAnalyzing}>
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Analyze
                </>
              )}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {analysis && (
        <div className="space-y-4">
          {lastUpdated && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className={`h-3 w-3 ${isAutoRefreshing ? "animate-spin" : ""}`} />
              <span>{isAutoRefreshing ? "Updating..." : `Last updated ${getTimeAgo(lastUpdated)}`}</span>
              <span className="text-xs">• Auto-refreshing every 15s</span>
            </div>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Risk Assessment</CardTitle>
                {getRiskBadge(analysis.riskScore)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Risk Score</span>
                    <span className={`text-2xl font-bold ${getRiskColor(analysis.riskScore)}`}>
                      {analysis.riskScore}/100
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full transition-all ${
                        analysis.riskScore >= 70
                          ? "bg-destructive"
                          : analysis.riskScore >= 40
                            ? "bg-yellow-500"
                            : "bg-accent"
                      }`}
                      style={{ width: `${analysis.riskScore}%` }}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border bg-card p-4">
                    <div className="text-sm text-muted-foreground">Total Transactions</div>
                    <div className="text-2xl font-bold">{analysis.totalTransactions}</div>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <div className="text-sm text-muted-foreground">Suspicious Patterns</div>
                    <div className="text-2xl font-bold text-destructive">{analysis.suspiciousPatterns}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {analysis.flags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Detected Issues</CardTitle>
                <CardDescription>The following suspicious patterns were detected</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analysis.flags.map((flag, index) => (
                    <Alert key={index} variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{flag}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Last {analysis.recentTransactions.length} transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analysis.recentTransactions.map((tx, index) => (
                  <div key={index} className="flex items-center justify-between rounded-lg border bg-card p-3">
                    <div className="flex-1">
                      <button
                        onClick={() => toggleSignature(index)}
                        className="font-mono text-sm text-left hover:text-primary transition-colors cursor-pointer underline decoration-dotted underline-offset-2"
                        title="Click to toggle full address"
                      >
                        {expandedSignatures.has(index)
                          ? tx.signature
                          : `${tx.signature.slice(0, 8)}...${tx.signature.slice(-8)}`}
                      </button>
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.timestamp * 1000).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {tx.amount !== null && <span className="text-sm font-medium">{tx.amount.toFixed(4)} SOL</span>}
                      {tx.direction === "ingress" && (
                        <Badge variant="secondary" className="gap-1 bg-accent/20 text-accent">
                          <ArrowDownLeft className="h-3 w-3" />
                          Ingress
                        </Badge>
                      )}
                      {tx.direction === "egress" && (
                        <Badge variant="secondary" className="gap-1 bg-purple-500/20 text-purple-400">
                          <ArrowUpRight className="h-3 w-3" />
                          Egress
                        </Badge>
                      )}
                      <Badge variant={tx.suspicious ? "destructive" : "secondary"}>
                        {tx.suspicious ? "Suspicious" : "Normal"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
