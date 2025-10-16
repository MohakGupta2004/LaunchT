'use client'
import React, { useState } from 'react'
import TokenDetails from './TokenDetails'
import { createToken } from '@/utils/createToken'
import { toast } from 'sonner'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'

function TokenLaunchpad() {
  const [isCreating, setIsCreating] = useState(false);
  const [tokenAddress, setTokenAddress] = useState("")
  const { connection } = useConnection()
  const wallet = useWallet()
  const updateCreate = async (value: boolean) => {
    setIsCreating(value);
    console.log("isCreating", isCreating)
    return true;
  };

  const handleGetMetaData = async (data: {
    name: string,
    symbol: string,
    uri: string 
  }) => {
    try {
      await updateCreate(true);
      console.log("gud", data)
      // Simulate delay for testing (remove in production or reduce time)
      const result = await createToken(data, connection, wallet);
      setTokenAddress(result);
      toast.success("Token created successfully!");
      await updateCreate(false);
    } catch (error) {
      console.error('Error creating token:', error);
      toast.error("Failed to create token. Please try again.");
      await updateCreate(false);
    }
  };

  return (
    <div>
      <TokenDetails
        getMetaData={handleGetMetaData}
        updateCreate={updateCreate}
      />
      <div className='mt-4 text-center text-sm text-gray-500'>
        {tokenAddress && (
          <p>
            Token Address: <a href={`https://explorer.solana.com/address/${tokenAddress}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">{tokenAddress}</a>
          </p>
        )}
      </div>
    </div>
  )
}

export default TokenLaunchpad
