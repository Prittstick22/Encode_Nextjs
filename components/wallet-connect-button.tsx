"use client"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"

export function WalletConnectButton() {
  return (
    <WalletMultiButton className="!bg-primary hover:!bg-primary/90 !text-primary-foreground !rounded-lg !h-10 !px-4 !font-medium !transition-colors" />
  )
}
