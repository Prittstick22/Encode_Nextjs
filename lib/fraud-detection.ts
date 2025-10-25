import type { Connection, PublicKey } from "@solana/web3.js"

export interface TransactionInfo {
  signature: string
  timestamp: number
  suspicious: boolean
  amount: number | null // Amount in SOL, null if unable to determine
  direction: "ingress" | "egress" | "unknown"
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
    const amounts: number[] = []

    for (const sig of signatures.slice(0, 10)) {
      if (!sig.blockTime) continue

      timestamps.push(sig.blockTime)

      let amount: number | null = null
      let direction: "ingress" | "egress" | "unknown" = "unknown"

      try {
        const txDetails = await connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        })

        if (txDetails?.meta && txDetails.transaction) {
          const accountKeys = txDetails.transaction.message.getAccountKeys().staticAccountKeys
          let accountIndex = -1

          for (let i = 0; i < accountKeys.length; i++) {
            if (accountKeys[i].equals(publicKey)) {
              accountIndex = i
              break
            }
          }

          console.log("[v0] Transaction:", sig.signature.slice(0, 8))
          console.log("[v0] Account index:", accountIndex)

          if (accountIndex !== -1 && accountIndex < txDetails.meta.preBalances.length) {
            // Calculate SOL amount from pre and post balances for the correct account
            const preBalance = txDetails.meta.preBalances[accountIndex] || 0
            const postBalance = txDetails.meta.postBalances[accountIndex] || 0
            const lamportsDiff = Math.abs(preBalance - postBalance)
            amount = lamportsDiff / 1e9 // Convert lamports to SOL

            console.log("[v0] Pre balance:", preBalance / 1e9, "SOL")
            console.log("[v0] Post balance:", postBalance / 1e9, "SOL")
            console.log("[v0] Amount:", amount, "SOL")

            // Determine direction based on balance change
            if (postBalance > preBalance) {
              direction = "ingress" // Incoming transaction (balance increased)
              console.log("[v0] Direction: INGRESS (received)")
            } else if (postBalance < preBalance) {
              direction = "egress" // Outgoing transaction (balance decreased)
              console.log("[v0] Direction: EGRESS (sent)")
            }

            if (amount > 0) {
              amounts.push(amount)
            }
          }
        }
      } catch (error) {
        // If we can't fetch transaction details, continue without amount
        console.error(`Failed to fetch transaction ${sig.signature}:`, error)
      }

      // Check for suspicious patterns
      const isSuspicious = sig.err !== null

      recentTransactions.push({
        signature: sig.signature,
        timestamp: sig.blockTime,
        suspicious: isSuspicious,
        amount,
        direction,
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
      if (avgTimeDiff < 15) {
        flags.push("Rapid transaction pattern detected - possible bot activity")
        suspiciousCount += 5
      }
    }

    if (amounts.length > 0 && timestamps.length > 0) {
      const maxAmount = Math.max(...amounts)
      const oldestTx = Math.min(...timestamps)
      const walletAge = Date.now() / 1000 - oldestTx
      const daysOld = walletAge / (60 * 60 * 24)

      // If wallet is less than 3 days old and has transfers over 10 SOL
      if (daysOld < 3 && maxAmount > 10) {
        flags.push(`Large transfer detected from new wallet (${maxAmount.toFixed(2)} SOL)`)
        suspiciousCount += 3
      }

      // Detect unusual amount patterns (many small transactions)
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
      if (amounts.length > 5 && avgAmount < 0.01) {
        flags.push("Multiple micro-transactions detected - possible spam or bot activity")
        suspiciousCount += 2
      }
    }

    // Check for high failure rate
    const failureRate = (suspiciousCount / Math.max(signatures.length, 1)) * 100
    if (failureRate > 30) {
      flags.push(`High transaction failure rate: ${failureRate.toFixed(1)}%`)
      suspiciousCount += 3
    }

    // Check for very new wallet with high activity
    if (signatures.length > 10 && timestamps.length > 0) {
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
