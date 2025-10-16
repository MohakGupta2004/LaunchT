"server only"

import { PinataSDK } from "pinata"

export const pinata = new PinataSDK({
  pinataJwt: `${process.env.PINATA_JWT}`,
  pinataGateway: `${process.env.NEXT_PUBLIC_GATEWAY_URL}`
})

console.log("Pinata Gateway:", process.env.NEXT_PUBLIC_GATEWAY_URL);
console.log("Pinata JWT:", process.env.PINATA_JWT);