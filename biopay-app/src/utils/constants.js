import {Image} from 'react-native';
// Blockchain
import IOTA from '../assets/logos/iota.png';
import USDC from '../assets/logos/usdc.png';
import USDT from '../assets/logos/usdt.png';
import { getFullnodeUrl } from '@iota/iota-sdk/client';

const w = 50;
const h = 50;

export const refreshTime = 1000 * 60 * 2.5;

export const USDCicon = (
  <Image source={USDC} style={{width: 30, height: 30, borderRadius: 10}} />
);

export const iconsBlockchain = {
  iota: <Image source={IOTA} style={{width: w, height: h, borderRadius: 10}} />,
  usdc: <Image source={USDC} style={{width: w, height: h, borderRadius: 10}} />,
  usdt: <Image source={USDT} style={{width: w, height: h, borderRadius: 10}} />,
};

export const blockchain = {
  network: 'Iota Testnet',
  networkShort: 'Iota',
  token: 'IOTA',
  blockExplorer: 'https://iotascan.com/testnet',
  rpc: getFullnodeUrl('testnet'),
  iconSymbol: 'iota',
  coinType: '0x2::iota::IOTA',
  decimals: 9,
  color: '#627EEA',
  tokens: [
    {
      name: 'IOTA',
      symbol: 'iota',
      coinType: '0x2::iota::IOTA',
      decimals: 9,
      icon: iconsBlockchain.iota,
      coingecko: 'iota',
    },
    {
      name: 'USDC',
      symbol: 'USDC',
      coinType:"0x493acfe10ce496bafec59019248bed5045cb79b65e8a05451f3f9f9cabede81f::usdc::USDC",
      decimals: 9,
      icon: iconsBlockchain.usdc,
      coingecko: 'usd-coin',
    },
    {
      name: 'Tether USD',
      symbol: 'USDT',
      coinType:"0xbfa2db766fdb9e5a0beb2c1c26ae3dd60199ac0b85494c87aa8733dfa5a937dc::usdt::USDT",
      decimals: 9,
      icon: iconsBlockchain.usdt,
      coingecko: 'tether',
    },
  ],
};

// Cloud Account Credentials
export const CloudAccountController =
  '0x72b9EB24BFf9897faD10B3100D35CEE8eDF8E43b';
export const CloudPublicKeyEncryption = `
-----BEGIN RSA PUBLIC KEY-----
MIIBCgKCAQEAtflt9yF4G1bPqTHtOch47UW9hkSi4u2EZDHYLLSKhGMwvHjajTM+
wcgxV8dlaTh1av/2dWb1EE3UMK0KF3CB3TZ4t/p+aQGhyfsGtBbXZuwZAd8CotTn
BLRckt6s3jPqDNR3XR9KbfXzFObNafXYzP9vCGQPdJQzuTSdx5mWcPpK147QfQbR
K0gmiDABYJMMUos8qaiKVQmSAwyg6Lce8x+mWvFAZD0PvaTNwYqcY6maIztT6h/W
mfQHzt9Z0nwQ7gv31KCw0Tlh7n7rMnDbr70+QVd8e3qMEgDYnx7Jm4BzHjr56IvC
g5atj1oLBlgH6N/9aUIlP5gkw89O3hYJ0QIDAQAB
-----END RSA PUBLIC KEY-----
`;
