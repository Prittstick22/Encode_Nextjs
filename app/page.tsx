import { WalletAnalyzer } from "@/components/wallet-analyzer"

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-foreground">Solana Fraud Detector</h1>
          <p className="text-lg text-muted-foreground">
            Analyze Solana wallets for suspicious activity and fraud patterns
          </p>
        </div>
        <WalletAnalyzer />
      </div>
    </main>
  )
}
