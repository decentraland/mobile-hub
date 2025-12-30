import { Authenticator, type AuthIdentity } from '@dcl/crypto'
import { createUnsafeIdentity, computeAddress } from '@dcl/crypto/dist/crypto'
import { getPublicKey } from 'ethereum-cryptography/secp256k1'
import { bytesToHex, hexToBytes } from 'ethereum-cryptography/utils'
import { config } from '../config'

interface DevIdentity {
  identity: AuthIdentity
  address: string
}

let cachedDevIdentity: DevIdentity | null = null

// Fixed private key for deterministic dev identity (Hardhat account #0)
// Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
const DEV_PRIVATE_KEY = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

function createIdentityFromPrivateKey(privateKeyHex: string) {
  const privateKeyBytes = hexToBytes(privateKeyHex)
  // getPublicKey returns 65 bytes (0x04 prefix + 64 bytes), remove the prefix
  const publicKeyBytes = getPublicKey(privateKeyBytes, false).slice(1)
  const address = computeAddress(publicKeyBytes)
  return {
    privateKey: '0x' + privateKeyHex,
    publicKey: '0x' + bytesToHex(publicKeyBytes),
    address
  }
}

/**
 * Creates a mock identity for local development.
 * Uses a fixed private key so the address is always the same.
 * Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 */
export async function getDevIdentity(): Promise<DevIdentity> {
  if (cachedDevIdentity) {
    return cachedDevIdentity
  }

  // Use fixed private key for the "real account" so address is deterministic
  const realAccount = createIdentityFromPrivateKey(DEV_PRIVATE_KEY)

  // Ephemeral identity can still be random
  const ephemeralIdentity = createUnsafeIdentity()

  // Create the auth identity (valid for 60 minutes)
  const identity = await Authenticator.initializeAuthChain(
    realAccount.address,
    ephemeralIdentity,
    60, // expiration in minutes
    async (message) => Authenticator.createSignature(realAccount, message)
  )

  cachedDevIdentity = {
    identity,
    address: realAccount.address
  }

  console.log('[DEV] Using dev identity:', realAccount.address)

  return cachedDevIdentity
}

export function isDevMode(): boolean {
  return config.get('USE_DEV_IDENTITY', false)
}
