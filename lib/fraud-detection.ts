import type { Connection, PublicKey } from "@solana/web3.js"

export interface TransactionInfo {
  signature: string
  timestamp: number
  suspicious: boolean
}

export interface WalletAnalysis {
  address: string
  riskScore: number
  totalTransactions: number
  suspiciousPatterns: number
  flags: string[]
  recentTransactions: TransactionInfo[]
}

export async function analyzeWallet(connection: Connection, publicKey: PublicKey): Promise<WalletAnalysis> {
  try {
    // Fetch transaction signatures
    const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 50 })

    const recentTransactions: TransactionInfo[] = []
    const flags: string[] = []
    let suspiciousCount = 0

    // Analyze transaction patterns
    const timestamps: number[] = []

    for (const sig of signatures.slice(0, 10)) {
      if (!sig.blockTime) continue

      timestamps.push(sig.blockTime)

      // Check for suspicious patterns
      const isSuspicious = sig.err !== null

      recentTransactions.push({
        signature: sig.signature,
        timestamp: sig.blockTime,
        suspicious: isSuspicious,
      })

      if (isSuspicious) {
        suspiciousCount++
      }
    }

    // Detect rapid transaction patterns (potential bot activity)
    if (timestamps.length > 1) {
      const timeDiffs = []
      for (let i = 1; i < timestamps.length; i++) {
        timeDiffs.push(timestamps[i - 1] - timestamps[i])
      }

      const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length

      // If average time between transactions is less than 5 seconds
      if (avgTimeDiff < 5) {
        flags.push("Rapid transaction pattern detected - possible bot activity")
        suspiciousCount += 5
      }
    }

    // Check for high failure rate
    const failureRate = (suspiciousCount / Math.max(signatures.length, 1)) * 100
    if (failureRate > 30) {
      flags.push(`High transaction failure rate: ${failureRate.toFixed(1)}%`)
      suspiciousCount += 3
    }

    // Check for very new wallet with high activity
    if (signatures.length > 20 && timestamps.length > 0) {
      const oldestTx = Math.min(...timestamps)
      const walletAge = Date.now() / 1000 - oldestTx
      const daysOld = walletAge / (60 * 60 * 24)

      if (daysOld < 7) {
        flags.push(`New wallet with high activity (${daysOld.toFixed(1)} days old)`)
        suspiciousCount += 2
      }
    }

    // Check for no transactions (potential honeypot)
    if (signatures.length === 0) {
      flags.push("No transaction history found")
      suspiciousCount += 1
    }

    // Calculate risk score (0-100)
    let riskScore = Math.min(100, (suspiciousCount / signatures.length) * 100 + flags.length * 10)

    // Ensure minimum risk score if flags exist
    if (flags.length > 0 && riskScore < 30) {
      riskScore = 30
    }

    return {
      address: publicKey.toBase58(),
      riskScore: Math.round(riskScore),
      totalTransactions: signatures.length,
      suspiciousPatterns: suspiciousCount,
      flags,
      recentTransactions,
    }
  } catch (error) {
    throw new Error(`Failed to analyze wallet: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}
