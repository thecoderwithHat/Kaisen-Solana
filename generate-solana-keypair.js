const { Keypair } = require('@solana/web3.js');

const kp = Keypair.generate();
console.log('Public Key:', kp.publicKey.toBase58());
console.log('Base64 Secret Key:', Buffer.from(kp.secretKey).toString('base64'));